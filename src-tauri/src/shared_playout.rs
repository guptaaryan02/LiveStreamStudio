//! One paced encoded transport per compatible playlist, independent RTMP sinks.
use super::*;
use std::collections::VecDeque;
use std::sync::atomic::{AtomicU32, AtomicU64};
static NEXT: AtomicU64 = AtomicU64::new(1);
fn next_id() -> String {
    format!(
        "{}-{}",
        std::process::id(),
        NEXT.fetch_add(1, Ordering::SeqCst)
    )
}
use std::time::{Duration, Instant};

#[derive(Clone, Debug, Eq, PartialEq, Hash)]
struct PipelineKey {
    sources: Vec<(String, u64, u128)>,
    tools: Vec<(String, u64, u128)>,
    width: u32,
    height: u32,
    fps: u32,
    bitrate: u32,
    encoder: String,
    forever: bool,
    repeats: u32,
    dedicated: Option<String>,
}
fn fingerprint(path: &str) -> (String, u64, u128) {
    let path = Path::new(path)
        .canonicalize()
        .unwrap_or_else(|_| PathBuf::from(path));
    let metadata = fs::metadata(&path).ok();
    let modified = metadata
        .as_ref()
        .and_then(|m| m.modified().ok())
        .and_then(|m| m.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|m| m.as_nanos())
        .unwrap_or(0);
    (
        path.to_string_lossy().into_owned(),
        metadata.map(|m| m.len()).unwrap_or(0),
        modified,
    )
}
impl PipelineKey {
    fn new(
        clips: &[String],
        config: &PlayoutConfig,
        ffmpeg: &str,
        ffprobe: &str,
        dedicated: Option<String>,
    ) -> Self {
        Self {
            sources: clips.iter().map(|p| fingerprint(p)).collect(),
            tools: vec![fingerprint(ffmpeg), fingerprint(ffprobe)],
            width: config.width,
            height: config.height,
            fps: config.fps,
            bitrate: config.bitrate_kbps,
            encoder: config.hardware_acc.clone(),
            forever: config.loop_forever,
            repeats: if config.loop_forever {
                0
            } else {
                config.repeat_count.max(1)
            },
            dedicated,
        }
    }
}
struct Sink {
    pid: u32,
    queue: Arc<PlayoutBuffer>,
}
struct Fanout {
    sinks: HashMap<String, Sink>,
    history: VecDeque<(Instant, Vec<u8>)>,
    history_bytes: usize,
    history_limit: usize,
    ended: bool,
}
impl Fanout {
    fn new(limit: usize) -> Self {
        Self {
            sinks: HashMap::new(),
            history: VecDeque::new(),
            history_bytes: 0,
            history_limit: limit,
            ended: false,
        }
    }
    fn attach(&mut self, id: String, pid: u32, queue: Arc<PlayoutBuffer>) -> Result<(), String> {
        if self.ended {
            return Err("The shared output has finished".into());
        }
        for (_, chunk) in &self.history {
            if !queue.try_write(chunk) {
                return Err("Could not queue shared stream history".into());
            }
        }
        self.sinks.insert(id, Sink { pid, queue });
        Ok(())
    }
    /// Never wait for a destination: an overflowing queue is detached instead.
    fn publish(&mut self, chunk: &[u8], now: Instant) -> Vec<(String, u32)> {
        if self.ended {
            return Vec::new();
        }
        self.history.push_back((now, chunk.to_vec()));
        self.history_bytes += chunk.len();
        while self
            .history
            .front()
            .map(|(time, _)| {
                now.duration_since(*time) > Duration::from_secs(3)
                    || self.history_bytes > self.history_limit
            })
            .unwrap_or(false)
        {
            if let Some((_, bytes)) = self.history.pop_front() {
                self.history_bytes -= bytes.len();
            }
        }
        let failed: Vec<_> = self
            .sinks
            .iter()
            .filter(|(_, sink)| !sink.queue.try_write(chunk))
            .map(|(id, sink)| (id.clone(), sink.pid))
            .collect();
        for (id, _) in &failed {
            if let Some(sink) = self.sinks.remove(id) {
                sink.queue.close();
            }
        }
        failed
    }
    fn close(&mut self) {
        self.ended = true;
        for sink in self.sinks.values() {
            sink.queue.close();
        }
        self.history.clear();
        self.history_bytes = 0;
    }
}
struct Group {
    id: String,
    key: PipelineKey,
    input: Arc<PlayoutBuffer>,
    hub: Mutex<Fanout>,
    stop: AtomicBool,
    finished: AtomicBool,
    failed: AtomicBool,
    relay: Mutex<Option<Child>>,
    relay_pid: u32,
    encoder_pid: AtomicU32,
    current: Mutex<(usize, String)>,
    bytes_per_second: usize,
    clip_count: usize,
}
impl Group {
    fn joinable(&self) -> bool {
        !self.stop.load(Ordering::SeqCst)
            && !self.finished.load(Ordering::SeqCst)
            && !self.hub.lock().unwrap().ended
    }
    fn members(&self) -> Vec<(String, u32)> {
        self.hub
            .lock()
            .unwrap()
            .sinks
            .iter()
            .map(|(id, sink)| (id.clone(), sink.pid))
            .collect()
    }
    fn log(&self, app: &AppHandle, message: &str) {
        for (id, _) in self.members() {
            let _ = app.emit(
                "ffmpeg-log",
                LogPayload {
                    stream_id: id,
                    line: message.into(),
                },
            );
        }
    }
    fn shutdown(&self) {
        self.stop.store(true, Ordering::SeqCst);
        self.input.close();
        self.hub.lock().unwrap().close();
        if let Some(mut child) = self.relay.lock().unwrap().take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}
#[derive(Default)]
pub(super) struct Registry {
    groups: HashMap<PipelineKey, Arc<Group>>,
    destinations: HashMap<String, (Arc<Group>, u32)>,
}

/// Always called after releasing the sender-process lock. PID protects restart.
pub(super) fn detach(state: &FFmpegState, id: &str, pid: u32) {
    let last = {
        let mut registry = state.shared.lock().unwrap();
        if registry.destinations.get(id).map(|(_, p)| *p) != Some(pid) {
            return;
        }
        let (group, _) = registry.destinations.remove(id).unwrap();
        let empty = {
            let mut hub = group.hub.lock().unwrap();
            if let Some(sink) = hub.sinks.remove(id) {
                sink.queue.close();
            }
            hub.sinks.is_empty()
        };
        if empty {
            if registry
                .groups
                .get(&group.key)
                .map(|g| Arc::ptr_eq(g, &group))
                .unwrap_or(false)
            {
                registry.groups.remove(&group.key);
            }
            Some(group)
        } else {
            None
        }
    };
    if let Some(group) = last {
        group.shutdown();
    }
}
pub(super) fn shutdown_all(state: &FFmpegState) {
    let groups = {
        let mut registry = state.shared.lock().unwrap();
        let groups: Vec<_> = registry
            .destinations
            .values()
            .map(|(g, _)| g.clone())
            .collect();
        registry.destinations.clear();
        registry.groups.clear();
        groups
    };
    for group in groups {
        group.shutdown();
    }
}
pub(super) fn resources(state: &FFmpegState, id: &str) -> Vec<(u32, f32)> {
    let registry = state.shared.lock().unwrap();
    if let Some((group, _)) = registry.destinations.get(id) {
        let share = 1.0 / group.hub.lock().unwrap().sinks.len().max(1) as f32;
        let mut pids = vec![(group.relay_pid, share)];
        let encoder = group.encoder_pid.load(Ordering::SeqCst);
        if encoder != 0 {
            pids.push((encoder, share));
        }
        pids
    } else {
        Vec::new()
    }
}
fn kill_sink(app: &AppHandle, id: &str, pid: u32) {
    if let Some(child) = app
        .state::<FFmpegState>()
        .processes
        .lock()
        .unwrap()
        .get_mut(id)
    {
        if child.id() == pid {
            let _ = child.kill();
        }
    }
}
fn relay_args() -> Vec<String> {
    [
        "-hide_banner",
        "-nostdin",
        "-loglevel",
        "warning",
        "-nostats",
        "-re",
        "-f",
        "mpegts",
        "-i",
        "pipe:0",
        "-c",
        "copy",
        "-muxdelay",
        "0",
        "-f",
        "mpegts",
        "pipe:1",
    ]
    .iter()
    .map(|v| v.to_string())
    .collect()
}
struct Launch {
    input: std::process::ChildStdin,
    output: std::process::ChildStdout,
    stderr: std::process::ChildStderr,
}
fn create_group(
    key: PipelineKey,
    ffmpeg: &str,
    config: &PlayoutConfig,
    count: usize,
) -> Result<(Arc<Group>, Launch), String> {
    let id = format!("pipeline-{}", next_id());
    let mut args = relay_args();
    args.splice(
        args.len() - 3..args.len() - 3,
        [
            "-metadata".into(),
            format!("comment=livestream_studio_{id}"),
        ],
    );
    let mut relay = Command::new(ffmpeg)
        .args(args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Could not start shared output pacer: {e}"))?;
    let pid = relay.id();
    let launch = Launch {
        input: relay.stdin.take().unwrap(),
        output: relay.stdout.take().unwrap(),
        stderr: relay.stderr.take().unwrap(),
    };
    let rate = (config.bitrate_kbps as usize + 128) * 125;
    let group = Arc::new(Group {
        id,
        key,
        input: Arc::new(PlayoutBuffer::new((rate * 8).min(64 * 1024 * 1024))),
        hub: Mutex::new(Fanout::new((rate * 4).min(32 * 1024 * 1024))),
        stop: AtomicBool::new(false),
        finished: AtomicBool::new(false),
        failed: AtomicBool::new(false),
        relay: Mutex::new(Some(relay)),
        relay_pid: pid,
        encoder_pid: AtomicU32::new(0),
        current: Mutex::new((0, String::new())),
        bytes_per_second: rate,
        clip_count: count,
    });
    Ok((group, launch))
}
pub(super) fn start(
    state: &FFmpegState,
    app: AppHandle,
    id: String,
    clips: Vec<String>,
    config: PlayoutConfig,
    share: bool,
) -> Result<String, String> {
    if clips.is_empty() || clips.iter().any(|p| !Path::new(p).is_file()) {
        return Err("Playlist has no playable local files".into());
    }
    if config.width < 2
        || config.height < 2
        || config.width > 7680
        || config.height > 4320
        || config.width % 2 != 0
        || config.height % 2 != 0
        || !(1..=60).contains(&config.fps)
        || !(300..=100000).contains(&config.bitrate_kbps)
    {
        return Err("Invalid output dimensions, frame rate or bitrate".into());
    }
    let ffmpeg = resolve_ffmpeg(&app, config.ffmpeg_path.as_deref());
    let ffprobe = resolve_ffprobe(&app, config.ffmpeg_path.as_deref());
    let config = PlayoutConfig {
        hardware_acc: resolve_hardware_acc(
            &app,
            &config.hardware_acc,
            config.ffmpeg_path.as_deref(),
        ),
        ..config
    };
    let key = PipelineKey::new(
        &clips,
        &config,
        &ffmpeg.path,
        &ffprobe.path,
        if share { None } else { Some(next_id()) },
    );
    let mut registry = state.shared.lock().unwrap();
    let mut processes = state.processes.lock().unwrap();
    if processes.contains_key(&id) || registry.destinations.contains_key(&id) {
        return Err("This destination is already active or is stopping".into());
    }
    let (group, launch) = if let Some(group) = registry.groups.get(&key).filter(|g| g.joinable()) {
        (group.clone(), None)
    } else {
        let (group, launch) = create_group(key.clone(), &ffmpeg.path, &config, clips.len())?;
        (group, Some(launch))
    };
    let mut sender_args = playout_sender_args(&config.rtmp_target);
    sender_args.splice(
        sender_args.len() - 1..sender_args.len() - 1,
        [
            "-metadata".into(),
            format!("comment=livestream_studio_{}", group.id),
        ],
    );
    let mut sender = match Command::new(&ffmpeg.path)
        .args(sender_args)
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
    {
        Ok(child) => child,
        Err(e) => {
            if launch.is_some() {
                group.shutdown();
            }
            return Err(format!("Could not start destination sender: {e}"));
        }
    };
    let pid = sender.id();
    let input = sender.stdin.take().unwrap();
    let stderr = sender.stderr.take().unwrap();
    let queue = Arc::new(PlayoutBuffer::new(
        (group.bytes_per_second * 12).min(64 * 1024 * 1024),
    ));
    let attached = {
        group
            .hub
            .lock()
            .unwrap()
            .attach(id.clone(), pid, queue.clone())
    };
    if let Err(error) = attached {
        let _ = sender.kill();
        let _ = sender.wait();
        if launch.is_some() {
            group.shutdown();
        }
        return Err(error);
    }
    let member_count = group.hub.lock().unwrap().sinks.len();
    registry.groups.insert(key, group.clone());
    registry
        .destinations
        .insert(id.clone(), (group.clone(), pid));
    processes.insert(id.clone(), sender);
    drop(processes);
    drop(registry);
    {
        let app = app.clone();
        let id = id.clone();
        thread::spawn(move || forward_sender_logs(stderr, app, id));
    }
    thread::spawn(move || {
        use std::io::Write;
        let mut input = input;
        while let Some(chunk) = queue.read(64 * 1024) {
            if input.write_all(&chunk).is_err() {
                break;
            }
        }
        let _ = input.flush();
        queue.close();
    });
    monitor_stream_exit(app.clone(), id.clone(), pid);
    let _=app.emit("ffmpeg-log",LogPayload{stream_id:id,line:format!("{} encoding pipeline · {member_count} destination(s). New destinations join current playback.",if member_count>1{"Joined shared"}else{"Started"})});
    if let Some(launch) = launch {
        launch_group(app, group, launch, clips, config, ffmpeg.path, ffprobe.path);
    }
    Ok(format!(
        "Destination sender PID {pid}; {member_count} destination(s) on shared output"
    ))
}
fn launch_group(
    app: AppHandle,
    group: Arc<Group>,
    launch: Launch,
    clips: Vec<String>,
    config: PlayoutConfig,
    ffmpeg: String,
    ffprobe: String,
) {
    // Bounded producer buffer feeds one media-clock pacer.
    {
        let group = group.clone();
        let mut input = launch.input;
        thread::spawn(move || {
            use std::io::Write;
            while let Some(chunk) = group.input.read(64 * 1024) {
                if input.write_all(&chunk).is_err() {
                    break;
                }
            }
            let _ = input.flush();
            group.input.close();
        });
    }
    {
        let group = group.clone();
        let app = app.clone();
        thread::spawn(move || {
            read_ffmpeg_lines(launch.stderr, |line| {
                group.log(&app, &format!("Shared transport: {line}"))
            })
        });
    }
    // Pacing occurs before fanout. Destination queues can never block this loop.
    {
        let group = group.clone();
        let app = app.clone();
        let mut output = launch.output;
        thread::spawn(move || {
            use std::io::Read;
            let mut chunk = vec![0; 64 * 1024];
            loop {
                match output.read(&mut chunk) {
                    Ok(0) => break,
                    Ok(n) => {
                        let failed = group
                            .hub
                            .lock()
                            .unwrap()
                            .publish(&chunk[..n], Instant::now());
                        for (id, pid) in failed {
                            let _=app.emit("ffmpeg-log",LogPayload{stream_id:id.clone(),line:"Destination upload fell behind shared output; reconnecting only this destination.".into()});
                            kill_sink(&app, &id, pid);
                        }
                    }
                    Err(_) => {
                        group.failed.store(true, Ordering::SeqCst);
                        break;
                    }
                }
            }
            let success = group
                .relay
                .lock()
                .unwrap()
                .take()
                .map(|mut child| child.wait().map(|s| s.success()).unwrap_or(false))
                .unwrap_or(false);
            let members = group.members();
            group.hub.lock().unwrap().close();
            group.input.close();
            if !group.stop.load(Ordering::SeqCst)
                && (!success || group.failed.load(Ordering::SeqCst))
            {
                group.stop.store(true, Ordering::SeqCst);
                for (id, pid) in members {
                    kill_sink(&app, &id, pid);
                }
            }
        });
    }
    {
        let group = group.clone();
        let app = app.clone();
        thread::spawn(move || {
            while !group.stop.load(Ordering::SeqCst) && !group.hub.lock().unwrap().ended {
                thread::sleep(Duration::from_secs(1));
                let level = group.input.level();
                let (index, name) = group.current.lock().unwrap().clone();
                let members = group.members();
                let count = members.len();
                for (id, _) in members {
                    let _ = app.emit(
                        "playout-stats",
                        PlayoutStats {
                            stream_id: id,
                            clip_index: index,
                            clip_count: group.clip_count,
                            clip_name: name.clone(),
                            buffer_seconds: level as f64 / group.bytes_per_second as f64,
                            buffer_percent: 100.0 * level as f64 / group.input.capacity as f64,
                            pipeline_id: Some(group.id.clone()),
                            shared_destinations: Some(count),
                        },
                    );
                }
            }
        });
    }
    thread::spawn(move || {
        let mut offset = 0.0;
        let mut pass = 0;
        let mut cache = HashMap::new();
        'playlist: loop {
            if group.stop.load(Ordering::SeqCst)
                || (!config.loop_forever && pass >= config.repeat_count.max(1))
            {
                break;
            }
            pass += 1;
            for (index, clip) in clips.iter().enumerate() {
                if group.stop.load(Ordering::SeqCst) {
                    break 'playlist;
                }
                *group.current.lock().unwrap() = (
                    index,
                    Path::new(clip)
                        .file_name()
                        .map(|s| s.to_string_lossy().into_owned())
                        .unwrap_or_default(),
                );
                let audio = match clip_has_audio(&ffprobe, clip) {
                    Ok(audio) => audio,
                    Err(error) => {
                        group.log(&app, &format!("error: {error}"));
                        group.failed.store(true, Ordering::SeqCst);
                        break 'playlist;
                    }
                };
                let size = *cache
                    .entry(clip.clone())
                    .or_insert_with(|| probe_accelerated_scaling(&ffmpeg, &ffprobe, clip, &config));
                let mut args = if let Some(size) = size {
                    group.log(
                        &app,
                        "Shared source: hardware decode + GPU downscale enabled.",
                    );
                    accelerated_normalizer_args(clip, &config, offset, audio, size)
                } else {
                    normalizer_args_with_audio(clip, &config, offset, audio)
                };
                args.splice(
                    args.len() - 3..args.len() - 3,
                    [
                        "-metadata".into(),
                        format!("comment=livestream_studio_{}", group.id),
                    ],
                );
                if group.stop.load(Ordering::SeqCst) {
                    break 'playlist;
                }
                let mut child = match Command::new(&ffmpeg)
                    .args(args)
                    .stdin(Stdio::null())
                    .stdout(Stdio::piped())
                    .stderr(Stdio::piped())
                    .spawn()
                {
                    Ok(child) => child,
                    Err(error) => {
                        group.log(
                            &app,
                            &format!("error: shared encoder could not start: {error}"),
                        );
                        group.failed.store(true, Ordering::SeqCst);
                        break 'playlist;
                    }
                };
                group.encoder_pid.store(child.id(), Ordering::SeqCst);
                let frames = Arc::new(Mutex::new(0_u64));
                let recorded = frames.clone();
                let logged_group = group.clone();
                let logged_app = app.clone();
                let reader = child.stderr.take().map(|stderr| {
                    thread::spawn(move || {
                        read_ffmpeg_lines(stderr, |line| {
                            if let Some(count) = parse_ffmpeg_frames(&line) {
                                *recorded.lock().unwrap() = count;
                            } else if line.to_lowercase().contains("error")
                                || line.contains("Invalid data")
                            {
                                logged_group.log(&logged_app, &line);
                            }
                        })
                    })
                });
                let mut ok = true;
                if let Some(mut output) = child.stdout.take() {
                    use std::io::Read;
                    let mut bytes = vec![0; 64 * 1024];
                    loop {
                        match output.read(&mut bytes) {
                            Ok(0) => break,
                            Ok(n) => {
                                if !group.input.write(&bytes[..n]) {
                                    ok = false;
                                    break;
                                }
                            }
                            Err(_) => {
                                ok = false;
                                break;
                            }
                        }
                    }
                } else {
                    ok = false;
                }
                if !ok {
                    let _ = child.kill();
                }
                let success = child.wait().map(|s| s.success()).unwrap_or(false);
                group.encoder_pid.store(0, Ordering::SeqCst);
                if let Some(reader) = reader {
                    let _ = reader.join();
                }
                let count = *frames.lock().unwrap();
                offset += clip_timeline_duration(count, config.fps);
                if !ok || group.stop.load(Ordering::SeqCst) {
                    break 'playlist;
                }
                if !success || count == 0 {
                    group.failed.store(true, Ordering::SeqCst);
                    group.log(
                        &app,
                        "error: shared source encoder failed; its destinations will reconnect.",
                    );
                    break 'playlist;
                }
                // Count physical encoding work once, even with several destinations.
                if let Some((id, _)) = group.members().first() {
                    let _ = app.emit("clip-encoded", id.clone());
                }
            }
        }
        group.finished.store(true, Ordering::SeqCst);
        group.input.close();
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    fn config() -> PlayoutConfig {
        PlayoutConfig {
            width: 1280,
            height: 720,
            fps: 30,
            bitrate_kbps: 2500,
            hardware_acc: "Software".into(),
            rtmp_target: "rtmp://first/live/a".into(),
            loop_forever: true,
            repeat_count: 1,
            ffmpeg_path: None,
        }
    }
    fn key() -> PipelineKey {
        PipelineKey::new(&["source.mp4".into()], &config(), "ffmpeg", "ffprobe", None)
    }
    fn group() -> Arc<Group> {
        Arc::new(Group {
            id: "test".into(),
            key: key(),
            input: Arc::new(PlayoutBuffer::new(32)),
            hub: Mutex::new(Fanout::new(32)),
            stop: AtomicBool::new(false),
            finished: AtomicBool::new(false),
            failed: AtomicBool::new(false),
            relay: Mutex::new(None),
            relay_pid: 10,
            encoder_pid: AtomicU32::new(11),
            current: Mutex::new((0, String::new())),
            bytes_per_second: 1,
            clip_count: 1,
        })
    }
    #[test]
    fn matching_outputs_ignore_destination_but_separate_media_profiles_and_order() {
        let original = key();
        let mut other = config();
        other.rtmp_target = "rtmps://other/channel/another-key".into();
        other.repeat_count = 99;
        assert_eq!(
            original,
            PipelineKey::new(&["source.mp4".into()], &other, "ffmpeg", "ffprobe", None)
        );
        other.fps = 60;
        assert_ne!(
            original,
            PipelineKey::new(&["source.mp4".into()], &other, "ffmpeg", "ffprobe", None)
        );
        other = config();
        other.bitrate_kbps = 4500;
        assert_ne!(
            original,
            PipelineKey::new(&["source.mp4".into()], &other, "ffmpeg", "ffprobe", None)
        );
        assert_ne!(
            original,
            PipelineKey::new(
                &["source.mp4".into()],
                &config(),
                "ffmpeg",
                "ffprobe",
                Some("independent".into())
            )
        );
        assert_ne!(
            PipelineKey::new(
                &["a".into(), "b".into()],
                &config(),
                "ffmpeg",
                "ffprobe",
                None
            ),
            PipelineKey::new(
                &["b".into(), "a".into()],
                &config(),
                "ffmpeg",
                "ffprobe",
                None
            )
        );
    }
    #[test]
    fn late_subscriber_receives_ordered_recent_history_then_live_bytes() {
        let mut hub = Fanout::new(64);
        let first = Arc::new(PlayoutBuffer::new(64));
        let second = Arc::new(PlayoutBuffer::new(64));
        hub.attach("a".into(), 1, first.clone()).unwrap();
        hub.publish(b"header", Instant::now());
        hub.attach("b".into(), 2, second.clone()).unwrap();
        hub.publish(b"-live", Instant::now());
        assert_eq!(first.read(64).unwrap(), b"header-live");
        assert_eq!(second.read(64).unwrap(), b"header-live");
        hub.close();
        assert!(second.read(1).is_none());
    }
    #[test]
    fn slow_destination_cannot_block_or_truncate_healthy_destination() {
        let mut hub = Fanout::new(64);
        let slow = Arc::new(PlayoutBuffer::new(3));
        let healthy = Arc::new(PlayoutBuffer::new(64));
        hub.attach("slow".into(), 1, slow.clone()).unwrap();
        hub.attach("healthy".into(), 2, healthy.clone()).unwrap();
        let failed = hub.publish(b"1234", Instant::now());
        assert_eq!(failed, vec![("slow".into(), 1)]);
        hub.publish(b"5678", Instant::now());
        assert_eq!(healthy.read(64).unwrap(), b"12345678");
        assert!(slow.read(1).is_none());
    }
    #[test]
    fn history_has_time_and_memory_bounds() {
        let mut hub = Fanout::new(4);
        let now = Instant::now();
        hub.publish(b"old", now - Duration::from_secs(4));
        hub.publish(b"new", now);
        assert_eq!(hub.history_bytes, 3);
        assert_eq!(hub.history.front().unwrap().1, b"new");
        hub.publish(b"next", now);
        assert!(hub.history_bytes <= 4);
    }
    #[test]
    fn stopping_owner_preserves_other_sink_and_last_stop_shuts_producer() {
        let state = FFmpegState::default();
        let group = group();
        for (id, pid) in [("a", 1), ("b", 2)] {
            group
                .hub
                .lock()
                .unwrap()
                .attach(id.into(), pid, Arc::new(PlayoutBuffer::new(64)))
                .unwrap();
            state
                .shared
                .lock()
                .unwrap()
                .destinations
                .insert(id.into(), (group.clone(), pid));
        }
        state
            .shared
            .lock()
            .unwrap()
            .groups
            .insert(group.key.clone(), group.clone());
        assert_eq!(resources(&state, "a"), vec![(10, 0.5), (11, 0.5)]);
        detach(&state, "a", 999);
        assert_eq!(group.members().len(), 2);
        detach(&state, "a", 1);
        assert_eq!(group.members().len(), 1);
        assert!(!group.stop.load(Ordering::SeqCst));
        assert_eq!(resources(&state, "b"), vec![(10, 1.0), (11, 1.0)]);
        detach(&state, "b", 2);
        assert!(group.stop.load(Ordering::SeqCst));
        assert!(group.input.closed.load(Ordering::SeqCst));
        assert!(state.shared.lock().unwrap().groups.is_empty());
    }
    #[test]
    fn finished_finite_output_cannot_accept_new_destination() {
        let group = group();
        assert!(group.joinable());
        group.finished.store(true, Ordering::SeqCst);
        assert!(!group.joinable());
    }
}
