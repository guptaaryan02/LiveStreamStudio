use std::collections::HashMap;
use std::fs;
use std::path::Path;
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::io::{BufRead, BufReader};
use std::thread;
use tauri::{AppHandle, Emitter, Manager, State};
use serde::{Deserialize, Serialize};
use sysinfo::{System, Pid};

pub struct FFmpegState {
    processes: Mutex<HashMap<String, Child>>,
    /// Set when a playout stream is asked to stop, so its feeder thread unwinds.
    playout_stops: Mutex<HashMap<String, Arc<AtomicBool>>>,
    sys: Mutex<System>,
}

impl Default for FFmpegState {
    fn default() -> Self {
        Self {
            processes: Mutex::new(HashMap::new()),
            playout_stops: Mutex::new(HashMap::new()),
            sys: Mutex::new(System::new_all()),
        }
    }
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct VideoFileInfo {
    pub id: String,
    pub title: String,
    pub file_path: String,
    pub duration_seconds: u64,
    pub size_mb: u64,
    pub resolution: String,
    pub category: String,
    pub thumbnail: String,
    pub fps: u32,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct LogPayload {
    stream_id: String,
    line: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Telemetry {
    cpu: f32,
    memory_mb: u64,
}

#[tauri::command]
fn get_process_telemetry(state: State<'_, FFmpegState>, stream_id: String) -> Option<Telemetry> {
    let procs = state.processes.lock().unwrap();
    if let Some(child) = procs.get(&stream_id) {
        let pid = child.id();
        let mut sys = state.sys.lock().unwrap();
        sys.refresh_all();
        if let Some(process) = sys.process(Pid::from_u32(pid)) {
            return Some(Telemetry {
                cpu: process.cpu_usage() as f32,
                memory_mb: process.memory() / (1024 * 1024),
            });
        }
    }
    None
}

#[tauri::command]
fn select_video_files() -> Vec<serde_json::Value> {
    let files = rfd::FileDialog::new()
        .set_title("Select Video Files for 24/7 Streaming")
        .add_filter("Videos", &["mp4", "mov", "mkv", "avi", "ts", "webm", "flv", "m4v", "wmv"])
        .pick_files();

    match files {
        Some(paths) => paths
            .into_iter()
            .enumerate()
            .map(|(idx, path)| {
                let path_str = path.to_string_lossy().to_string();
                let file_name = path
                    .file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_else(|| format!("video_{}", idx));

                let title = Path::new(&file_name)
                    .file_stem()
                    .map(|s| s.to_string_lossy().to_string())
                    .unwrap_or(file_name.clone());

                let size_mb = fs::metadata(&path)
                    .map(|m| m.len() / (1024 * 1024))
                    .unwrap_or(100);

                serde_json::json!({
                    "id": format!("vid-tauri-{}-{}", idx, rand_str()),
                    "title": title,
                    "filePath": path_str,
                    "category": "Custom",
                    "duration": 300,
                    "resolution": "1080p (1920x1080)",
                    "sizeMb": size_mb,
                    "thumbnail": "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&auto=format&fit=crop&q=80",
                    "fps": 60
                })
            })
            .collect(),
        None => vec![],
    }
}

fn rand_str() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .subsec_nanos();
    format!("{:x}", nanos)
}

#[tauri::command]
fn start_ffmpeg_stream(
    state: State<'_, FFmpegState>,
    app: AppHandle,
    stream_id: String,
    args: Vec<String>,
    playlist_content: String,
) -> Result<String, String> {
    let app_dir = std::env::temp_dir().join(format!("livestream_studio_{}", stream_id));
    std::fs::create_dir_all(&app_dir).unwrap();
    
    // Always write playlist.txt just in case args uses it (Fast Mode)
    let playlist_path = app_dir.join("playlist.txt");
    std::fs::write(&playlist_path, playlist_content)
        .map_err(|e| format!("Failed to write playlist file: {}", e))?;

    let playlist_path_str = playlist_path.to_string_lossy().to_string();

    // Replace literal "playlist.txt" in args with absolute path
    let final_args: Vec<String> = args.into_iter().map(|arg| {
        if arg == "playlist.txt" {
            playlist_path_str.clone()
        } else {
            arg
        }
    }).collect();

    let mut child = Command::new(get_ffmpeg_path())
        .args(&final_args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to launch ffmpeg: {}", e))?;

    let pid = child.id();
    
    // Spawn thread to read FFmpeg logs continuously
    if let Some(stderr) = child.stderr.take() {
        let stream_id_clone = stream_id.clone();
        thread::spawn(move || {
            let reader = BufReader::new(stderr);
            for line in reader.lines() {
                if let Ok(l) = line {
                    let _ = app.emit("ffmpeg-log", LogPayload {
                        stream_id: stream_id_clone.clone(),
                        line: l,
                    });
                }
            }
            // FFmpeg process has exited (stderr closed)
            let _ = app.emit("ffmpeg-exit", stream_id_clone);
        });
    }

    let mut procs = state.processes.lock().unwrap();
    procs.insert(stream_id, child);

    Ok(format!("FFmpeg PID {} launched successfully", pid))
}

#[tauri::command]
fn stop_ffmpeg_stream(
    state: State<'_, FFmpegState>,
    stream_id: String,
) -> Result<String, String> {
    // Tell a playout feeder to stop before killing the sender, so it doesn't
    // start converting the next clip after we pull the connection.
    if let Some(flag) = state.playout_stops.lock().unwrap().remove(&stream_id) {
        flag.store(true, Ordering::Relaxed);
    }

    let mut procs = state.processes.lock().unwrap();
    if let Some(mut child) = procs.remove(&stream_id) {
        let _ = child.kill();
        Ok(format!("Stopped stream {}", stream_id))
    } else {
        Ok("Stream process not active".to_string())
    }
}

fn get_ffmpeg_path() -> String {
    if std::env::consts::OS == "macos" {
        if std::path::Path::new("/opt/homebrew/bin/ffmpeg").exists() {
            return "/opt/homebrew/bin/ffmpeg".to_string();
        }
        if std::path::Path::new("/usr/local/bin/ffmpeg").exists() {
            return "/usr/local/bin/ffmpeg".to_string();
        }
    }
    "ffmpeg".to_string()
}

fn get_ffprobe_path() -> String {
    if std::env::consts::OS == "macos" {
        if std::path::Path::new("/opt/homebrew/bin/ffprobe").exists() {
            return "/opt/homebrew/bin/ffprobe".to_string();
        }
        if std::path::Path::new("/usr/local/bin/ffprobe").exists() {
            return "/usr/local/bin/ffprobe".to_string();
        }
    }
    "ffprobe".to_string()
}

#[tauri::command]
fn check_ffmpeg_available() -> bool {
    Command::new(get_ffmpeg_path())
        .arg("-version")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

#[derive(Serialize)]
struct VideoMetadata {
    video_codec: String,
    audio_codec: String,
    resolution: String,
    fps: f64,
    pixel_format: String,
    audio_channels: u8,
    sample_rate: u32,
    bitrate_kbps: u32,
    /// Real clip length in seconds — lets the UI import large playlists without
    /// loading every file into a <video> element just to read its duration.
    duration: f64,
}

#[tauri::command]
fn probe_video_file(path: String) -> Result<VideoMetadata, String> {
    let output = Command::new(get_ffprobe_path())
        .args(&[
            "-v", "quiet",
            "-print_format", "json",
            "-show_format",
            "-show_streams",
            &path,
        ])
        .output()
        .map_err(|e| format!("Failed to run ffprobe: {}", e))?;

    let json_str = String::from_utf8_lossy(&output.stdout);
    let parsed: serde_json::Value = serde_json::from_str(&json_str).map_err(|e| format!("Failed to parse JSON: {}", e))?;

    let mut video_codec = String::new();
    let mut audio_codec = String::new();
    let mut resolution = String::new();
    let mut fps = 30.0;
    let mut pixel_format = String::new();
    let mut audio_channels = 2;
    let mut sample_rate = 44100;
    let mut bitrate_kbps = 0;
    let mut duration = 0.0;

    if let Some(format) = parsed.get("format") {
        if let Some(br) = format.get("bit_rate").and_then(|v| v.as_str()) {
            if let Ok(b) = br.parse::<u32>() {
                bitrate_kbps = b / 1000;
            }
        }
        if let Some(d) = format.get("duration").and_then(|v| v.as_str()) {
            duration = d.parse::<f64>().unwrap_or(0.0);
        }
    }

    if let Some(streams) = parsed.get("streams").and_then(|v| v.as_array()) {
        for stream in streams {
            let codec_type = stream.get("codec_type").and_then(|v| v.as_str()).unwrap_or("");
            if codec_type == "video" {
                video_codec = stream.get("codec_name").and_then(|v| v.as_str()).unwrap_or("").to_string();
                pixel_format = stream.get("pix_fmt").and_then(|v| v.as_str()).unwrap_or("").to_string();
                let width = stream.get("width").and_then(|v| v.as_u64()).unwrap_or(0);
                let height = stream.get("height").and_then(|v| v.as_u64()).unwrap_or(0);
                if width > 0 && height > 0 {
                    resolution = format!("{}x{}", width, height);
                }
                if let Some(rate_str) = stream.get("r_frame_rate").and_then(|v| v.as_str()) {
                    let parts: Vec<&str> = rate_str.split('/').collect();
                    if parts.len() == 2 {
                        let num: f64 = parts[0].parse().unwrap_or(0.0);
                        let den: f64 = parts[1].parse().unwrap_or(1.0);
                        if den > 0.0 {
                            fps = num / den;
                        }
                    }
                }
            } else if codec_type == "audio" {
                audio_codec = stream.get("codec_name").and_then(|v| v.as_str()).unwrap_or("").to_string();
                audio_channels = stream.get("channels").and_then(|v| v.as_u64()).unwrap_or(2) as u8;
                if let Some(sr) = stream.get("sample_rate").and_then(|v| v.as_str()) {
                    sample_rate = sr.parse().unwrap_or(44100);
                }
            }
        }
    }

    Ok(VideoMetadata {
        video_codec,
        audio_codec,
        resolution,
        fps,
        pixel_format,
        audio_channels,
        sample_rate,
        bitrate_kbps,
        duration,
    })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RtmpCheck {
    reachable: bool,
    latency_ms: u64,
    detail: String,
}

/// Opens a real TCP connection to the RTMP host. This verifies reachability —
/// it is deliberately NOT presented as an upload-bandwidth measurement.
#[tauri::command]
fn check_rtmp_reachable(url: String) -> RtmpCheck {
    use std::net::{TcpStream, ToSocketAddrs};
    use std::time::{Duration, Instant};

    let without_scheme = url
        .split("://")
        .nth(1)
        .unwrap_or(&url)
        .split('/')
        .next()
        .unwrap_or("")
        .to_string();

    let (host, port) = match without_scheme.rsplit_once(':') {
        Some((h, p)) => (h.to_string(), p.parse::<u16>().unwrap_or(1935)),
        None => (
            without_scheme.clone(),
            if url.starts_with("rtmps") { 443 } else { 1935 },
        ),
    };

    if host.is_empty() {
        return RtmpCheck { reachable: false, latency_ms: 0, detail: "No RTMP host in URL".into() };
    }

    let started = Instant::now();
    let addrs = match (host.as_str(), port).to_socket_addrs() {
        Ok(a) => a.collect::<Vec<_>>(),
        Err(e) => {
            return RtmpCheck { reachable: false, latency_ms: 0, detail: format!("DNS lookup failed: {}", e) }
        }
    };

    for addr in addrs {
        if TcpStream::connect_timeout(&addr, Duration::from_secs(5)).is_ok() {
            return RtmpCheck {
                reachable: true,
                latency_ms: started.elapsed().as_millis() as u64,
                detail: format!("Connected to {}:{}", host, port),
            };
        }
    }

    RtmpCheck {
        reachable: false,
        latency_ms: started.elapsed().as_millis() as u64,
        detail: format!("Could not connect to {}:{}", host, port),
    }
}

fn hardware_encoder_args(hardware_acc: &str) -> Vec<String> {
    match hardware_acc {
        "NVENC" => vec!["-c:v".into(), "h264_nvenc".into(), "-preset".into(), "p4".into()],
        "QuickSync" => vec!["-c:v".into(), "h264_qsv".into(), "-preset".into(), "medium".into()],
        "VideoToolbox" => vec!["-c:v".into(), "h264_videotoolbox".into()],
        _ => vec!["-c:v".into(), "libx264".into(), "-preset".into(), "veryfast".into()],
    }
}

/// Bounded FIFO sitting between the clip encoders and the RTMP sender.
///
/// The sender drains it at real time (`-re`), while the encoder for the next
/// clip fills it as fast as the GPU allows. That head start is what keeps the
/// upload fed across clip boundaries and through short encoder stalls — without
/// it, every transition starves the socket and YouTube reports "not receiving
/// enough video".
struct PlayoutBuffer {
    data: Mutex<std::collections::VecDeque<u8>>,
    space: std::sync::Condvar,
    filled: std::sync::Condvar,
    capacity: usize,
    closed: AtomicBool,
}

impl PlayoutBuffer {
    fn new(capacity: usize) -> Self {
        Self {
            data: Mutex::new(std::collections::VecDeque::with_capacity(capacity.min(1 << 20))),
            space: std::sync::Condvar::new(),
            filled: std::sync::Condvar::new(),
            capacity,
            closed: AtomicBool::new(false),
        }
    }

    /// Blocks while the buffer is full, so a fast encoder can run ahead but never
    /// grows memory without bound.
    fn write(&self, chunk: &[u8]) -> bool {
        let mut queue = self.data.lock().unwrap();
        for byte in chunk {
            while queue.len() >= self.capacity {
                if self.closed.load(Ordering::Relaxed) {
                    return false;
                }
                queue = self.space.wait(queue).unwrap();
            }
            queue.push_back(*byte);
        }
        self.filled.notify_all();
        true
    }

    fn read(&self, max: usize) -> Option<Vec<u8>> {
        let mut queue = self.data.lock().unwrap();
        while queue.is_empty() {
            if self.closed.load(Ordering::Relaxed) {
                return None;
            }
            queue = self.filled.wait(queue).unwrap();
        }
        let take = max.min(queue.len());
        let out: Vec<u8> = queue.drain(..take).collect();
        self.space.notify_all();
        Some(out)
    }

    fn level(&self) -> usize {
        self.data.lock().unwrap().len()
    }

    fn close(&self) {
        self.closed.store(true, Ordering::Relaxed);
        self.filled.notify_all();
        self.space.notify_all();
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PlayoutStats {
    stream_id: String,
    clip_index: usize,
    clip_count: usize,
    clip_name: String,
    buffer_seconds: f64,
    buffer_percent: f64,
}

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PlayoutConfig {
    width: u32,
    height: u32,
    fps: u32,
    bitrate_kbps: u32,
    hardware_acc: String,
    rtmp_target: String,
    loop_forever: bool,
    repeat_count: u32,
}

/// Builds the per-clip normaliser: decode ANY source format and emit one fixed
/// MPEG-TS profile (H.264 / yuv420p / fixed size + fps, AAC 44.1 kHz stereo).
fn normalizer_args(clip: &str, config: &PlayoutConfig, ts_offset: f64) -> Vec<String> {
    let gop = (config.fps * 2).max(2).to_string();
    let mut args: Vec<String> = vec![
        "-hide_banner".into(),
        "-nostdin".into(),
        "-i".into(),
        clip.to_string(),
        "-vf".into(),
        format!(
            "scale={w}:{h}:force_original_aspect_ratio=decrease,pad={w}:{h}:(ow-iw)/2:(oh-ih)/2,fps={fps},format=yuv420p",
            w = config.width,
            h = config.height,
            fps = config.fps
        ),
        "-af".into(),
        "aresample=async=1,aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo".into(),
        "-fps_mode".into(),
        "cfr".into(),
    ];
    args.extend(hardware_encoder_args(&config.hardware_acc));
    args.extend(
        [
            "-b:v".to_string(),
            format!("{}k", config.bitrate_kbps),
            "-maxrate".to_string(),
            format!("{}k", config.bitrate_kbps),
            "-bufsize".to_string(),
            format!("{}k", config.bitrate_kbps * 2),
            "-g".to_string(),
            gop.clone(),
            "-keyint_min".to_string(),
            gop,
            "-c:a".to_string(),
            "aac".to_string(),
            "-b:a".to_string(),
            "128k".to_string(),
            "-ar".to_string(),
            "44100".to_string(),
            "-ac".to_string(),
            "2".to_string(),
            "-bsf:v".to_string(),
            "h264_mp4toannexb".to_string(),
            "-output_ts_offset".to_string(),
            format!("{:.3}", ts_offset),
            "-muxdelay".to_string(),
            "0".to_string(),
            "-f".to_string(),
            "mpegts".to_string(),
            "pipe:1".to_string(),
        ]
        .into_iter(),
    );
    args
}

/// Parses the trailing `time=HH:MM:SS.mm` FFmpeg prints, i.e. how much of the
/// clip was actually encoded. Used to advance the output timeline exactly.
fn parse_ffmpeg_time(line: &str) -> Option<f64> {
    let idx = line.find("time=")? + 5;
    let raw: String = line[idx..].chars().take_while(|c| !c.is_whitespace()).collect();
    let parts: Vec<&str> = raw.split(':').collect();
    if parts.len() != 3 {
        return None;
    }
    let h: f64 = parts[0].parse().ok()?;
    let m: f64 = parts[1].parse().ok()?;
    let s: f64 = parts[2].parse().ok()?;
    Some(h * 3600.0 + m * 60.0 + s)
}

/// Starts a continuous playout stream.
///
/// One long-lived FFmpeg holds the RTMP connection and only remuxes (`-c copy`);
/// clips are decoded and normalised one at a time by short-lived FFmpeg
/// processes whose MPEG-TS output is piped into it. Because the RTMP sender
/// never sees a codec, resolution or sample-rate change, a playlist can mix any
/// formats without killing the stream, and the clip count is unbounded — only
/// one source file is ever open at a time.
#[tauri::command]
fn start_playout_stream(
    state: State<'_, FFmpegState>,
    app: AppHandle,
    stream_id: String,
    clips: Vec<String>,
    config: PlayoutConfig,
) -> Result<String, String> {
    if clips.is_empty() {
        return Err("Playlist has no playable files".to_string());
    }

    let sender_args: Vec<String> = vec![
        "-hide_banner".into(),
        "-nostdin".into(),
        "-re".into(),
        "-f".into(),
        "mpegts".into(),
        "-i".into(),
        "pipe:0".into(),
        "-c".into(),
        "copy".into(),
        "-flvflags".into(),
        "no_duration_filesize".into(),
        "-f".into(),
        "flv".into(),
        config.rtmp_target.clone(),
    ];

    let mut sender = Command::new(get_ffmpeg_path())
        .args(&sender_args)
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to launch RTMP sender: {}", e))?;

    let pid = sender.id();
    let mut sender_stdin = sender
        .stdin
        .take()
        .ok_or_else(|| "Could not open sender input pipe".to_string())?;

    // Sender logs carry the live telemetry (frame=, fps=, bitrate=, drop=).
    if let Some(stderr) = sender.stderr.take() {
        let app_logs = app.clone();
        let id = stream_id.clone();
        thread::spawn(move || {
            let reader = BufReader::new(stderr);
            for line in reader.lines().flatten() {
                let _ = app_logs.emit(
                    "ffmpeg-log",
                    LogPayload { stream_id: id.clone(), line },
                );
            }
        });
    }

    let stop_flag = Arc::new(AtomicBool::new(false));
    state
        .playout_stops
        .lock()
        .unwrap()
        .insert(stream_id.clone(), stop_flag.clone());
    state.processes.lock().unwrap().insert(stream_id.clone(), sender);

    // ~8 seconds of encoded output, so a clip transition or a brief encoder
    // stall never leaves the RTMP socket with nothing to send.
    let bytes_per_second = (config.bitrate_kbps as usize + 128) * 1000 / 8;
    let buffer = Arc::new(PlayoutBuffer::new((bytes_per_second * 8).min(64 * 1024 * 1024)));

    // Drain thread: hands buffered bytes to the RTMP sender.
    {
        let buffer = buffer.clone();
        thread::spawn(move || {
            use std::io::Write;
            while let Some(chunk) = buffer.read(64 * 1024) {
                if sender_stdin.write_all(&chunk).is_err() {
                    break;
                }
            }
            let _ = sender_stdin.flush();
            buffer.close();
        });
    }

    // Shared "what is on air right now", written by the feeder, read by stats.
    let now_playing = Arc::new(Mutex::new((0usize, String::new())));

    // Stats thread: buffer occupancy is the early-warning signal that encoding
    // is falling behind real time — visible before the platform complains.
    {
        let buffer = buffer.clone();
        let app_stats = app.clone();
        let id = stream_id.clone();
        let stop = stop_flag.clone();
        let now_playing = now_playing.clone();
        let clip_count = clips.len();
        thread::spawn(move || {
            while !stop.load(Ordering::Relaxed) && !buffer.closed.load(Ordering::Relaxed) {
                thread::sleep(std::time::Duration::from_millis(1000));
                let level = buffer.level();
                let (clip_index, clip_name) = now_playing.lock().unwrap().clone();
                let _ = app_stats.emit(
                    "playout-stats",
                    PlayoutStats {
                        stream_id: id.clone(),
                        clip_index,
                        clip_count,
                        clip_name,
                        buffer_seconds: level as f64 / bytes_per_second as f64,
                        buffer_percent: (level as f64 / buffer.capacity as f64) * 100.0,
                    },
                );
            }
        });
    }

    // Feeder thread: walks the playlist, one clip at a time, forever if asked.
    let feeder_app = app.clone();
    let feeder_id = stream_id.clone();
    let feeder_buffer = buffer.clone();
    let feeder_now_playing = now_playing.clone();
    thread::spawn(move || {
        let mut ts_offset = 0.0_f64;
        let mut pass = 0_u32;
        let frame_gap = 1.0 / config.fps.max(1) as f64;

        'outer: loop {
            if !config.loop_forever && pass >= config.repeat_count.max(1) {
                break;
            }
            pass += 1;

            for (index, clip) in clips.iter().enumerate() {
                if stop_flag.load(Ordering::Relaxed) {
                    break 'outer;
                }

                *feeder_now_playing.lock().unwrap() = (
                    index,
                    Path::new(clip)
                        .file_name()
                        .map(|n| n.to_string_lossy().to_string())
                        .unwrap_or_else(|| clip.clone()),
                );

                let args = normalizer_args(clip, &config, ts_offset);
                let mut child = match Command::new(get_ffmpeg_path())
                    .args(&args)
                    .stdout(Stdio::piped())
                    .stderr(Stdio::piped())
                    .stdin(Stdio::null())
                    .spawn()
                {
                    Ok(c) => c,
                    Err(e) => {
                        let _ = feeder_app.emit(
                            "ffmpeg-log",
                            LogPayload {
                                stream_id: feeder_id.clone(),
                                line: format!("error: could not start converter for {}: {}", clip, e),
                            },
                        );
                        continue;
                    }
                };

                // Track how far this clip actually got, and surface its errors.
                let encoded = Arc::new(Mutex::new(0.0_f64));
                let encoded_writer = encoded.clone();
                let log_app = feeder_app.clone();
                let log_id = feeder_id.clone();
                let clip_name = Path::new(clip)
                    .file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_else(|| clip.clone());

                let stderr_handle = child.stderr.take().map(|stderr| {
                    thread::spawn(move || {
                        let reader = BufReader::new(stderr);
                        for line in reader.lines().flatten() {
                            if let Some(t) = parse_ffmpeg_time(&line) {
                                *encoded_writer.lock().unwrap() = t;
                            } else if line.to_lowercase().contains("error")
                                || line.contains("Invalid data")
                            {
                                let _ = log_app.emit(
                                    "ffmpeg-log",
                                    LogPayload {
                                        stream_id: log_id.clone(),
                                        line: format!("{}: {}", clip_name, line),
                                    },
                                );
                            }
                        }
                    })
                });

                // Push this clip into the upload buffer. A failure means the
                // sender died (network drop / stream stopped) — unwind and let
                // the UI's auto-recovery decide what happens next.
                let piped_ok = match child.stdout.take() {
                    Some(mut out) => {
                        use std::io::Read;
                        let mut chunk = vec![0u8; 64 * 1024];
                        let mut ok = true;
                        loop {
                            match out.read(&mut chunk) {
                                Ok(0) => break,
                                Ok(n) => {
                                    if !feeder_buffer.write(&chunk[..n]) {
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
                        ok
                    }
                    None => false,
                };

                // If the buffer stopped accepting data the stream is over —
                // don't let the converter keep encoding a clip nobody will see.
                if !piped_ok {
                    let _ = child.kill();
                }

                let _ = child.wait();
                if let Some(handle) = stderr_handle {
                    let _ = handle.join();
                }

                let clip_seconds = *encoded.lock().unwrap();
                if clip_seconds > 0.0 {
                    ts_offset += clip_seconds + frame_gap;
                }

                if !piped_ok {
                    break 'outer;
                }
            }
        }

        // Closing the buffer lets the drain thread flush and the sender exit cleanly.
        feeder_buffer.close();
        let _ = feeder_app.emit("ffmpeg-exit", feeder_id);
    });

    Ok(format!("Playout engine started (RTMP sender PID {})", pid))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(FFmpegState::default())
        .invoke_handler(tauri::generate_handler![
            select_video_files,
            start_ffmpeg_stream,
            stop_ffmpeg_stream,
            check_ffmpeg_available,
            get_process_telemetry,
            probe_video_file,
            start_playout_stream,
            check_rtmp_reachable
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            // A previous run that crashed or was force-killed leaves its FFmpeg
            // children orphaned and still streaming. Reap them before starting.
            reap_orphaned_ffmpeg();
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            // Quitting the app must take every stream down with it — otherwise a
            // broadcast keeps running with no window left to stop it.
            if let tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit = event {
                let state = app_handle.state::<FFmpegState>();
                for (_, flag) in state.playout_stops.lock().unwrap().iter() {
                    flag.store(true, Ordering::Relaxed);
                }
                let mut procs = state.processes.lock().unwrap();
                for (_, child) in procs.iter_mut() {
                    let _ = child.kill();
                }
                procs.clear();
            }
        });
}

/// Kills FFmpeg processes left behind by an earlier run of this app.
///
/// Matches only processes started by us — they always reference our temp
/// playlist directory or our pipe-based playout arguments — so unrelated FFmpeg
/// jobs the user is running are never touched.
fn reap_orphaned_ffmpeg() {
    let mut sys = System::new_all();
    sys.refresh_all();
    let my_pid = std::process::id();

    for (pid, process) in sys.processes() {
        if pid.as_u32() == my_pid {
            continue;
        }
        let name = process.name().to_string_lossy().to_string();
        if !name.starts_with("ffmpeg") {
            continue;
        }
        let cmd = process
            .cmd()
            .iter()
            .map(|s| s.to_string_lossy().to_string())
            .collect::<Vec<_>>()
            .join(" ");

        if cmd.contains("livestream_studio_") {
            log::info!("Reaping orphaned FFmpeg from a previous run: {}", pid);
            process.kill();
        }
    }
}
