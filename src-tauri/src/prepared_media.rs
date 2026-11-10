//! Prepare stream-sized H.264/AAC files once; broadcast later without encoding.
use super::*;
use std::hash::{Hash, Hasher};

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Progress {
    job_id: String,
    percent: f64,
}
pub(super) struct ActiveJob {
    id: String,
    cancelled: Arc<AtomicBool>,
    process: Arc<Mutex<Option<Child>>>,
}
pub(super) fn shutdown(state: &FFmpegState) {
    if let Some(job) = state.preparation.lock().unwrap().as_ref() {
        job.cancelled.store(true, Ordering::SeqCst);
        if let Some(mut child) = job.process.lock().unwrap().take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}
struct PartialFile(PathBuf);
impl Drop for PartialFile {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.0);
    }
}
struct Cleanup {
    app: AppHandle,
    id: String,
}
impl Drop for Cleanup {
    fn drop(&mut self) {
        let state = self.app.state::<FFmpegState>();
        let mut job = state.preparation.lock().unwrap();
        if job.as_ref().map(|job| &job.id) == Some(&self.id) {
            if let Some(active) = job.take() {
                if let Some(mut child) = active.process.lock().unwrap().take() {
                    let _ = child.kill();
                    let _ = child.wait();
                }
            }
        }
    }
}
fn cache_key(path: &str, config: &PlayoutConfig) -> Result<String, String> {
    let canonical = Path::new(path).canonicalize().map_err(|e| e.to_string())?;
    let metadata = fs::metadata(&canonical).map_err(|e| e.to_string())?;
    let mut hash = std::collections::hash_map::DefaultHasher::new();
    (
        "stream-ready-v2-timestamps",
        canonical,
        metadata.len(),
        metadata.modified().ok(),
        config.width,
        config.height,
        config.fps,
        config.bitrate_kbps,
    )
        .hash(&mut hash);
    Ok(format!("{:016x}", hash.finish()))
}
pub(super) fn prepare_args(
    path: &str,
    config: &PlayoutConfig,
    audio: bool,
    hardware: Option<(u32, u32)>,
    output: &str,
    duration: Option<f64>,
) -> Vec<String> {
    let mut args = if let Some(size) = hardware {
        accelerated_normalizer_args(path, config, 0.0, audio, size)
    } else {
        normalizer_args_with_audio(path, config, 0.0, audio)
    };
    // Keep offline preparation bounded on small machines as well as playback.
    args.splice(
        2..2,
        [
            "-threads".into(),
            "2".into(),
            "-filter_threads".into(),
            "2".into(),
        ],
    );
    for flag in ["-bsf:v", "-output_ts_offset", "-muxdelay"] {
        if let Some(index) = args.iter().position(|a| a == flag) {
            args.drain(index..index + 2);
        }
    }
    let filter = args.iter().position(|a| a == "-af").unwrap() + 1;
    args[filter].push_str(",apad");
    args.truncate(args.len() - 3);
    args.extend([
        "-shortest".into(),
        "-movflags".into(),
        "+faststart".into(),
        "-progress".into(),
        "pipe:2".into(),
        "-nostats".into(),
        "-f".into(),
        "mp4".into(),
        output.into(),
    ]);
    // shortest may read ahead after a filter reinitializes. Bound padded audio
    // explicitly to the source duration so preparation cannot append a long tail.
    if let Some(seconds) = duration.filter(|v| v.is_finite() && *v > 0.0) {
        let position = args.len() - 3;
        args.splice(position..position, ["-t".into(), format!("{seconds:.6}")]);
    }
    args.insert(0, "-y".into());
    args
}
fn matches(metadata: &VideoMetadata, config: &PlayoutConfig) -> bool {
    metadata.video_codec == "h264"
        && metadata.audio_codec == "aac"
        && metadata.resolution == format!("{}x{}", config.width, config.height)
        && (metadata.fps - config.fps as f64).abs() < 0.01
        && metadata.duration > 0.0
}
#[tauri::command]
pub(super) async fn prepare_stream_video(
    app: AppHandle,
    job_id: String,
    path: String,
    width: u32,
    height: u32,
    fps: u32,
    bitrate_kbps: u32,
) -> Result<String, String> {
    if !Path::new(&path).is_file() {
        return Err("Source video does not exist".into());
    }
    if width < 2
        || height < 2
        || width > 3840
        || height > 2160
        || width % 2 != 0
        || height % 2 != 0
        || !(24..=60).contains(&fps)
        || !(500..=20000).contains(&bitrate_kbps)
    {
        return Err("Invalid preparation profile".into());
    }
    let cancelled = Arc::new(AtomicBool::new(false));
    let process = Arc::new(Mutex::new(None::<Child>));
    {
        let state = app.state::<FFmpegState>();
        let mut job = state.preparation.lock().unwrap();
        if job.is_some() {
            return Err("Another video preparation is already running".into());
        }
        *job = Some(ActiveJob {
            id: job_id.clone(),
            cancelled: cancelled.clone(),
            process: process.clone(),
        });
    }
    tauri::async_runtime::spawn_blocking(move || {
        let _cleanup = Cleanup {
            app: app.clone(),
            id: job_id.clone(),
        };
        let config = PlayoutConfig {
            width,
            height,
            fps,
            bitrate_kbps,
            hardware_acc: "Software".into(),
            rtmp_target: String::new(),
            loop_forever: false,
            repeat_count: 1,
            ffmpeg_path: None,
        };
        let folder = app
            .path()
            .app_local_data_dir()
            .map_err(|e| e.to_string())?
            .join("stream-ready");
        fs::create_dir_all(&folder).map_err(|e| e.to_string())?;
        let key = cache_key(&path, &config)?;
        let target = folder.join(format!("{key}.mp4"));
        if target.is_file() {
            if let Ok(metadata) =
                probe_video_file(app.clone(), target.to_string_lossy().into_owned())
            {
                if matches(&metadata, &config) {
                    return Ok(target.to_string_lossy().into_owned());
                }
            }
        }
        let partial = folder.join(format!("{key}-{}.partial.mp4", std::process::id()));
        let _ = fs::remove_file(&partial);
        let _partial_cleanup = PartialFile(partial.clone());
        let ffmpeg = resolve_ffmpeg(&app, None);
        let ffprobe = resolve_ffprobe(&app, None);
        let metadata = probe_video_file(app.clone(), path.clone())?;
        let audio = clip_has_audio(&ffprobe.path, &path)?;
        let hardware = probe_accelerated_scaling(&ffmpeg.path, &ffprobe.path, &path, &config);
        if cancelled.load(Ordering::SeqCst) {
            return Err("Preparation cancelled".into());
        }
        let args = prepare_args(&path, &config, audio, hardware, &partial.to_string_lossy(), Some(metadata.duration));
        let mut child = Command::new(ffmpeg.path)
            .args(args)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Preparation could not start: {e}"))?;
        let diagnostics = Arc::new(Mutex::new(String::new()));
        let errors = diagnostics.clone();
        let progress_app = app.clone();
        let progress_id = job_id.clone();
        let duration = metadata.duration;
        let reader = child.stderr.take().map(|stderr| {
            thread::spawn(move || {
                read_ffmpeg_lines(stderr, |line| {
                    if let Some(value) = line
                        .strip_prefix("out_time_us=")
                        .and_then(|v| v.parse::<f64>().ok())
                    {
                        if duration > 0.0 {
                            let _ = progress_app.emit(
                                "preparation-progress",
                                Progress {
                                    job_id: progress_id.clone(),
                                    percent: (value / 1_000_000.0 / duration * 100.0)
                                        .clamp(0.0, 99.0),
                                },
                            );
                        }
                    } else if line.to_lowercase().contains("error") || line.contains("Invalid") {
                        let mut text = errors.lock().unwrap();
                        if text.len() < 2000 {
                            text.push_str(&line);
                            text.push('\n');
                        }
                    }
                })
            })
        });
        {
            let state = app.state::<FFmpegState>();
            let _job = state.preparation.lock().unwrap();
            if cancelled.load(Ordering::SeqCst) {
                let _ = child.kill();
                let _ = child.wait();
            } else {
                *process.lock().unwrap() = Some(child);
            }
        }
        let result = loop {
            if cancelled.load(Ordering::SeqCst) {
                if let Some(mut child) = process.lock().unwrap().take() {
                    let _ = child.kill();
                    let _ = child.wait();
                }
                break Err("Preparation cancelled".to_string());
            }
            let outcome = {
                let mut guard = process.lock().unwrap();
                match guard.as_mut() {
                    Some(child) => child.try_wait(),
                    None => break Err("Preparation process stopped".to_string()),
                }
            };
            match outcome {
                Ok(Some(status)) => {
                    process.lock().unwrap().take();
                    break if status.success() {
                        Ok(())
                    } else {
                        Err(format!(
                            "Preparation failed: {}",
                            diagnostics.lock().unwrap()
                        ))
                    };
                }
                Ok(None) => thread::sleep(std::time::Duration::from_millis(100)),
                Err(error) => {
                    if let Some(mut child) = process.lock().unwrap().take() {
                        let _ = child.kill();
                        let _ = child.wait();
                    }
                    break Err(error.to_string());
                }
            }
        };
        if let Some(reader) = reader {
            let _ = reader.join();
        }
        if let Err(error) = result {
            let _ = fs::remove_file(&partial);
            return Err(error);
        }
        let verified = probe_video_file(app.clone(), partial.to_string_lossy().into_owned())?;
        if !matches(&verified, &config) {
            let _ = fs::remove_file(&partial);
            return Err("Prepared file did not match the selected output profile".into());
        }
        if cancelled.load(Ordering::SeqCst) {
            let _ = fs::remove_file(&partial);
            return Err("Preparation cancelled".into());
        }
        if target.exists() {
            fs::remove_file(&target).map_err(|e| e.to_string())?;
        }
        fs::rename(&partial, &target).map_err(|e| e.to_string())?;
        let _ = app.emit(
            "preparation-progress",
            Progress {
                job_id,
                percent: 100.0,
            },
        );
        Ok(target.to_string_lossy().into_owned())
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub(super) fn cancel_stream_preparation(state: State<'_, FFmpegState>, job_id: String) -> bool {
    if let Some(job) = state.preparation.lock().unwrap().as_ref() {
        if job.id == job_id {
            job.cancelled.store(true, Ordering::SeqCst);
            return true;
        }
    }
    false
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn prepared_copy_is_h264_aac_mp4_without_live_rate_limit() {
        let config = PlayoutConfig {
            width: 1920,
            height: 1080,
            fps: 30,
            bitrate_kbps: 4500,
            hardware_acc: "Software".into(),
            rtmp_target: String::new(),
            loop_forever: false,
            repeat_count: 1,
            ffmpeg_path: None,
        };
        let args = prepare_args("source.mp4", &config, true, None, "ready.mp4", None);
        assert!(!args.contains(&"-re".into()));
        assert!(!args.contains(&"-output_ts_offset".into()));
        assert!(args.contains(&"libx264".into()));
        assert!(args.contains(&"nal-hrd=cbr:force-cfr=1".into()));
        assert_eq!(args.last().unwrap(), "ready.mp4");
        assert_eq!(
            args[args.iter().position(|a| a == "-f").unwrap() + 1],
            "mp4"
        );
    }
    #[test]
    fn prepared_cache_key_changes_with_source_or_profile() {
        let path = std::env::temp_dir().join(format!("studio-cache-key-{}", std::process::id()));
        fs::write(&path, b"a").unwrap();
        let mut config = PlayoutConfig {
            width: 1920,
            height: 1080,
            fps: 30,
            bitrate_kbps: 4500,
            hardware_acc: "Software".into(),
            rtmp_target: String::new(),
            loop_forever: false,
            repeat_count: 1,
            ffmpeg_path: None,
        };
        let first = cache_key(path.to_str().unwrap(), &config).unwrap();
        config.fps = 60;
        assert_ne!(first, cache_key(path.to_str().unwrap(), &config).unwrap());
        config.fps = 30;
        fs::write(&path, b"changed").unwrap();
        assert_ne!(first, cache_key(path.to_str().unwrap(), &config).unwrap());
        fs::remove_file(path).unwrap();
    }
}

#[cfg(test)]
mod media_tests {
    use super::*;
    use std::io::Write;
    #[test]
    fn four_different_prepared_videos_remux_to_independent_1080p_outputs() {
        let ffmpeg = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources/ffmpeg/ffmpeg");
        let ffprobe = ffmpeg.with_file_name("ffprobe");
        let dir = std::env::temp_dir().join(format!("studio-four-ready-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let config = PlayoutConfig {
            width: 1920,
            height: 1080,
            fps: 30,
            bitrate_kbps: 4500,
            hardware_acc: "Software".into(),
            rtmp_target: String::new(),
            loop_forever: false,
            repeat_count: 1,
            ffmpeg_path: None,
        };
        let mut outputs = Vec::new();
        for (index, color) in ["red", "blue", "green", "white"].iter().enumerate() {
            let source = dir.join(format!("source-{index}.mp4"));
            let ready = dir.join(format!("ready-{index}.mp4"));
            let created = Command::new(&ffmpeg)
                .args([
                    "-hide_banner",
                    "-loglevel",
                    "error",
                    "-y",
                    "-f",
                    "lavfi",
                    "-i",
                    &format!("color=c={color}:s=320x180:r=24"),
                    "-t",
                    "1.2",
                    "-c:v",
                    "libx264",
                    "-pix_fmt",
                    "yuv420p",
                ])
                .arg(&source)
                .status()
                .unwrap();
            assert!(created.success());
            let converted = Command::new(&ffmpeg)
                .args(prepare_args(
                    source.to_str().unwrap(),
                    &config,
                    false,
                    None,
                    ready.to_str().unwrap(),
                    Some(1.2),
                ))
                .stdout(Stdio::null())
                .stderr(Stdio::piped())
                .output()
                .unwrap();
            assert!(
                converted.status.success(),
                "{}",
                String::from_utf8_lossy(&converted.stderr)
            );
            let probe = Command::new(&ffprobe)
                .args(["-v", "error", "-show_streams", "-of", "json"])
                .arg(&ready)
                .output()
                .unwrap();
            let data: serde_json::Value = serde_json::from_slice(&probe.stdout).unwrap();
            assert_eq!(data["streams"][0]["width"], 1920);
            assert_eq!(data["streams"][0]["height"], 1080);
            assert_eq!(data["streams"][0]["codec_name"], "h264");
            assert_eq!(data["streams"][1]["codec_name"], "aac");
            outputs.push((ready, dir.join(format!("received-{index}.flv"))));
        }
        let mut receivers = Vec::new();
        let mut senders = Vec::new();
        for (index, (ready, output)) in outputs.iter().enumerate() {
            let socket = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
            let port = socket.local_addr().unwrap().port();
            drop(socket);
            let target = format!("rtmp://127.0.0.1:{port}/live/test");
            receivers.push(
                Command::new(&ffmpeg)
                    .args([
                        "-hide_banner",
                        "-loglevel",
                        "error",
                        "-listen",
                        "1",
                        "-i",
                        &target,
                        "-c",
                        "copy",
                        "-y",
                    ])
                    .arg(output)
                    .stdout(Stdio::null())
                    .stderr(Stdio::null())
                    .spawn()
                    .unwrap(),
            );
            thread::sleep(std::time::Duration::from_millis(120));
            let playlist = dir.join(format!("playlist-{index}.txt"));
            let mut file = fs::File::create(&playlist).unwrap();
            writeln!(file, "ffconcat version 1.0\nfile '{}'", ready.display()).unwrap();
            senders.push(
                Command::new(&ffmpeg)
                    .args([
                        "-hide_banner",
                        "-loglevel",
                        "error",
                        "-stream_loop",
                        "-1",
                        "-re",
                        "-fflags",
                        "+genpts",
                        "-f",
                        "concat",
                        "-safe",
                        "0",
                        "-i",
                    ])
                    .arg(playlist)
                    .args([
                        "-c",
                        "copy",
                        "-t",
                        "5",
                        "-flvflags",
                        "no_duration_filesize",
                        "-f",
                        "flv",
                        &target,
                    ])
                    .stdout(Stdio::null())
                    .stderr(Stdio::null())
                    .spawn()
                    .unwrap(),
            );
        }
        let mut sys = System::new_all();
        thread::sleep(std::time::Duration::from_millis(300));
        sys.refresh_all();
        let found: Vec<_> = senders
            .iter()
            .filter_map(|child| sys.process(Pid::from_u32(child.id())))
            .collect();
        let memory: u64 = found.iter().map(|process| process.memory()).sum();
        let cpu: f32 = found.iter().map(|process| process.cpu_usage()).sum::<f32>()
            / sys.cpus().len().max(1) as f32;
        eprintln!("Four different 1080p direct-copy senders: {} processes, {:.1} MiB combined RSS, {:.2}% whole-machine CPU",found.len(),memory as f64/1048576.0,cpu);
        assert_eq!(
            found.len(),
            4,
            "all four senders must be alive simultaneously"
        );
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(20);
        loop {
            let done = senders.iter_mut().all(|child| {
                child
                    .try_wait()
                    .unwrap()
                    .map(|s| {
                        assert!(s.success());
                        true
                    })
                    .unwrap_or(false)
            });
            if done {
                break;
            }
            if std::time::Instant::now() > deadline {
                for child in &mut senders {
                    let _ = child.kill();
                }
                for child in &mut receivers {
                    let _ = child.kill();
                }
                panic!("four-stream remux test timed out");
            }
            thread::sleep(std::time::Duration::from_millis(100));
        }
        for child in &mut receivers {
            let _ = child.wait();
        }
        for (_, output) in outputs {
            let probe = Command::new(&ffprobe)
                .args([
                    "-v",
                    "error",
                    "-count_frames",
                    "-select_streams",
                    "v:0",
                    "-show_entries",
                    "stream=nb_read_frames,width,height",
                    "-of",
                    "json",
                ])
                .arg(output)
                .output()
                .unwrap();
            assert!(probe.status.success());
            let data: serde_json::Value = serde_json::from_slice(&probe.stdout).unwrap();
            assert_eq!(data["streams"][0]["width"], 1920);
            assert_eq!(data["streams"][0]["height"], 1080);
            assert!(
                data["streams"][0]["nb_read_frames"]
                    .as_str()
                    .unwrap()
                    .parse::<u32>()
                    .unwrap()
                    >= 140
            );
        }
        fs::remove_dir_all(dir).unwrap();
    }
}
