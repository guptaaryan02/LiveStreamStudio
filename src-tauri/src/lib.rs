mod prepared_media;
mod schedule_power;
mod shared_playout;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::io::BufReader;
use std::thread;
use tauri::{AppHandle, Emitter, Manager, State};
use serde::{Deserialize, Serialize};
use sysinfo::{System, Pid};

const KEYCHAIN_SERVICE: &str = "com.livestreamstudio.streamkeys";

pub struct FFmpegState {
    processes: Mutex<HashMap<String, Child>>,
    keep_awake: Mutex<Option<Child>>,
    preparation:Mutex<Option<prepared_media::ActiveJob>>,
    shared: Mutex<shared_playout::Registry>,
    sys_updated: Mutex<std::time::Instant>,
    sys: Mutex<System>,
}

impl Default for FFmpegState {
    fn default() -> Self {
        Self {
            processes: Mutex::new(HashMap::new()),
            keep_awake: Mutex::new(None),
            preparation:Mutex::new(None),
            shared: Mutex::new(shared_playout::Registry::default()),
            sys_updated: Mutex::new(std::time::Instant::now()-std::time::Duration::from_secs(1)),
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

#[derive(Clone)]
struct BinaryResolution {
    path: String,
    source: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FFmpegInfo {
    available: bool,
    path: String,
    version: String,
    source: String,
}

#[tauri::command]
fn save_text_file(name: String, text: String) -> Result<bool, String> {
    let path = rfd::FileDialog::new().set_file_name(&name).save_file();
    if let Some(path) = path { fs::write(path, text).map_err(|e| e.to_string())?; return Ok(true); }
    Ok(false)
}

// Only invoked by the Paste key button; no automatic clipboard polling.
#[tauri::command]
fn read_clipboard_text() -> Result<String, String> {
    #[cfg(target_os = "macos")]
    let mut command = Command::new("/usr/bin/pbpaste");
    #[cfg(target_os = "windows")]
    let mut command = { let mut c = Command::new("powershell"); c.args(["-NoProfile", "-Command", "[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; Get-Clipboard -Raw"]); c };
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    let mut command = { let mut c = Command::new("xclip"); c.args(["-selection", "clipboard", "-o"]); c };
    let result = command.output().map_err(|_| "Clipboard unavailable".to_string())?;
    if !result.status.success() { return Err("Clipboard unavailable".into()); }
    String::from_utf8(result.stdout).map_err(|_| "Clipboard does not contain text".into())
}

#[tauri::command]
fn copy_text_to_clipboard(text: String) -> Result<(), String> {
    use std::io::Write;
    #[cfg(target_os = "macos")]
    let mut command = Command::new("/usr/bin/pbcopy");
    #[cfg(target_os = "windows")]
    let mut command = { let mut c=Command::new("powershell"); c.args(["-NoProfile", "-Command", "[Console]::InputEncoding=[System.Text.Encoding]::UTF8; Set-Clipboard -Value ([Console]::In.ReadToEnd())"]); c };
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    let mut command = { let mut c=Command::new("xclip"); c.args(["-selection", "clipboard"]); c };
    let mut child=command.stdin(Stdio::piped()).spawn().map_err(|e|e.to_string())?;
    child.stdin.take().ok_or("Clipboard pipe unavailable")?.write_all(text.as_bytes()).map_err(|e|e.to_string())?;
    if child.wait().map_err(|e|e.to_string())?.success() { Ok(()) } else { Err("Clipboard command failed".into()) }
}

#[tauri::command]
fn send_desktop_notification(app:AppHandle,title:String,body:String)->Result<(),String> {
    use tauri_plugin_notification::NotificationExt;
    app.notification().builder().title(title).body(body).show().map_err(|e|e.to_string())
}

#[tauri::command]
fn set_keep_awake(state: State<'_, FFmpegState>, enabled: bool) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let mut guard=state.keep_awake.lock().unwrap();
        if guard.as_mut().is_some_and(|child| !matches!(child.try_wait(), Ok(None))) {
            if let Some(mut child) = guard.take() { let _ = child.kill(); let _ = child.wait(); }
        }
        if enabled && guard.is_none() {
            *guard=Some(Command::new("/usr/bin/caffeinate").args(["-i", "-w", &std::process::id().to_string()]).spawn().map_err(|e|e.to_string())?);
        } else if !enabled {
            if let Some(mut child)=guard.take() { let _=child.kill(); let _=child.wait(); }
        }
    }
    Ok(())
}

fn profile_key_entry(profile_id: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(KEYCHAIN_SERVICE, profile_id)
        .map_err(|e| format!("Could not open secure credential store: {}", e))
}

#[tauri::command]
async fn save_profile_stream_key(profile_id: String, stream_key: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || save_profile_key_blocking(profile_id, stream_key)).await.map_err(|e| e.to_string())?
}

fn save_profile_key_blocking(profile_id: String, stream_key: String) -> Result<(), String> {
    if profile_id.trim().is_empty() {
        return Err("Profile id is required".to_string());
    }
    if stream_key.trim().is_empty() {
        return Err("Stream key is required".to_string());
    }
    profile_key_entry(&profile_id)?
        .set_password(stream_key.trim())
        .map_err(|e| format!("Could not save stream key securely: {}", e))
}

#[tauri::command]
async fn get_profile_stream_key(profile_id: String) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || get_profile_key_blocking(profile_id)).await.map_err(|e| e.to_string())?
}

fn get_profile_key_blocking(profile_id: String) -> Result<Option<String>, String> {
    if profile_id.trim().is_empty() {
        return Ok(None);
    }
    match profile_key_entry(&profile_id)?.get_password() {
        Ok(password) => Ok(Some(password)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("Could not read stream key securely: {}", e)),
    }
}

#[tauri::command]
async fn delete_profile_stream_key(profile_id: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || delete_profile_key_blocking(profile_id)).await.map_err(|e| e.to_string())?
}

fn delete_profile_key_blocking(profile_id: String) -> Result<(), String> {
    if profile_id.trim().is_empty() {
        return Ok(());
    }
    match profile_key_entry(&profile_id)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("Could not delete stream key securely: {}", e)),
    }
}

#[tauri::command]
fn get_process_telemetry(state: State<'_, FFmpegState>, stream_id: String) -> Option<Telemetry> {
    let sender_pid=state.processes.lock().unwrap().get(&stream_id).map(|p|p.id())?;
    let shared_resources=shared_playout::resources(&state,&stream_id);
    let mut sys=state.sys.lock().unwrap();
    let mut updated=state.sys_updated.lock().unwrap();
    if updated.elapsed()>=std::time::Duration::from_millis(200) {
        sys.refresh_all(); *updated=std::time::Instant::now();
    }
    let mut cpu=0.0; let mut memory=0;
    for (pid,share) in std::iter::once((sender_pid,1.0)).chain(shared_resources) {
        if let Some(process)=sys.process(Pid::from_u32(pid)) {cpu+=process.cpu_usage()*share;memory+=(process.memory() as f64*share as f64) as u64;}
    }
    // sysinfo reports percent of one logical core; show share of this computer.
    Some(Telemetry{cpu:cpu/sys.cpus().len().max(1) as f32,memory_mb:memory/(1024*1024)})
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

/// FFmpeg separates progress updates with carriage returns, not newlines.
fn read_ffmpeg_lines(reader: impl std::io::Read, mut on_line: impl FnMut(String)) {
    let reader = BufReader::new(reader);
    let mut line = Vec::new();
    for byte in std::io::Read::bytes(reader) {
        let Ok(byte) = byte else { break };
        if byte == b'\r' || byte == b'\n' {
            if !line.is_empty() {
                on_line(String::from_utf8_lossy(&line).into_owned());
                line.clear();
            }
        } else {
            line.push(byte);
        }
    }
    if !line.is_empty() { on_line(String::from_utf8_lossy(&line).into_owned()); }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RateSample { stream_id: String, fps: f64, bitrate_kbps: f64 }

#[derive(Default)]
struct RateWindow { bytes: u64, frames: u64 }
impl RateWindow {
    fn sample(&mut self, line: &str, elapsed: f64) -> Option<(f64, f64)> {
        let frames = parse_ffmpeg_frames(line)?;
        let idx = line.rfind("size=")? + 5;
        let raw = line[idx..].split_whitespace().next()?;
        let count: String = raw.chars().take_while(|c| c.is_ascii_digit() || *c == '.').collect();
        let value: f64 = count.parse().ok()?;
        let multiplier = if raw.contains("KiB") { 1024.0 } else if raw.contains("MiB") { 1048576.0 } else if raw.contains("kB") { 1000.0 } else { 1.0 };
        let bytes = (value * multiplier) as u64;
        let seconds = elapsed.max(0.001);
        let rate = bytes.saturating_sub(self.bytes) as f64 * 8.0 / seconds / 1000.0;
        let fps = frames.saturating_sub(self.frames) as f64 / seconds;
        self.bytes = bytes; self.frames = frames;
        Some((fps, rate))
    }
}

fn forward_sender_logs(reader: impl std::io::Read, app: AppHandle, stream_id: String) {
    let mut window = RateWindow::default();
    let mut previous = std::time::Instant::now();
    read_ffmpeg_lines(reader, |line| {
        let now = std::time::Instant::now();
        let sample = window.sample(&line, now.duration_since(previous).as_secs_f64());
        let _ = app.emit("ffmpeg-log", LogPayload { stream_id: stream_id.clone(), line });
        if let Some((fps, bitrate_kbps)) = sample {
            previous = now;
            let _ = app.emit("ffmpeg-rate", RateSample { stream_id: stream_id.clone(), fps, bitrate_kbps });
        }
    });
}

/// Observe the actual sender exit, after all queued output has drained.
fn monitor_stream_exit(app: AppHandle, stream_id: String, pid: u32) {
    thread::spawn(move || loop {
        let state = app.state::<FFmpegState>();
        let outcome = {
            let mut procs = state.processes.lock().unwrap();
            let result = match procs.get_mut(&stream_id) {
                Some(child) if child.id() == pid => match child.try_wait() {
                    Ok(Some(status)) => {
                        #[cfg(unix)]
                        let signal = { use std::os::unix::process::ExitStatusExt; status.signal() };
                        #[cfg(not(unix))]
                        let signal = None::<i32>;
                        Some((status.success(),status.code(),signal))
                    },
                    Ok(None) => None,
                    Err(_) => Some((false,None,None)),
                },
                _ => return,
            };
            // Check and remove under one lock: a concurrent stop/restart must
            // never let the old monitor remove the replacement sender.
            if result.is_some() {
                procs.remove(&stream_id);

            }
            result
        };
        if let Some((success,code,signal)) = outcome {
            shared_playout::detach(&state,&stream_id,pid);
            let line = format!("Sender exited: success={success}; exit code={}; signal={}",code.map(|v|v.to_string()).unwrap_or_else(||"unavailable".into()),signal.map(|v|v.to_string()).unwrap_or_else(||"none".into()));
            let _ = app.emit("ffmpeg-log", LogPayload{stream_id:stream_id.clone(),line});
            let _ = app.emit("ffmpeg-exit", serde_json::json!({"streamId": stream_id, "success": success}));
            return;
        }
        thread::sleep(std::time::Duration::from_millis(100));
    });
}

#[tauri::command]
fn start_ffmpeg_stream(
    state: State<'_, FFmpegState>,
    app: AppHandle,
    stream_id: String,
    args: Vec<String>,
    playlist_content: String,
    ffmpeg_path: Option<String>,
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

    let ffmpeg = resolve_ffmpeg(&app, ffmpeg_path.as_deref());
    let mut procs = state.processes.lock().unwrap();
    if procs.contains_key(&stream_id) {
        return Err("This stream instance already has an active process".into());
    }
    let mut child = Command::new(&ffmpeg.path)
        .args(&final_args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to launch ffmpeg: {}", e))?;

    let pid = child.id();
    
    // Spawn thread to read FFmpeg logs continuously
    if let Some(stderr) = child.stderr.take() {
        let stream_id_clone = stream_id.clone();
        let log_app = app.clone();
        thread::spawn(move || {
            forward_sender_logs(stderr, log_app, stream_id_clone);

        });
    }

    procs.insert(stream_id.clone(), child);
    drop(procs);
    monitor_stream_exit(app, stream_id, pid);

    Ok(format!("FFmpeg PID {} launched successfully", pid))
}

#[tauri::command]
fn stop_ffmpeg_stream(
    state: State<'_, FFmpegState>,
    stream_id: String,
) -> Result<String, String> {
    let child=state.processes.lock().unwrap().remove(&stream_id);
    if let Some(mut child)=child {
        shared_playout::detach(&state,&stream_id,child.id());
        let _=child.kill();let _=child.wait();
        Ok(format!("Stopped destination {stream_id}"))
    } else {Ok("Stream process not active".into())}
}

fn binary_name(name: &str) -> String {
    if cfg!(target_os = "windows") {
        format!("{}.exe", name)
    } else {
        name.to_string()
    }
}

fn is_executable_candidate(path: &Path) -> bool {
    path.is_file()
}

/// Confirms a candidate really is the tool we want, by running it.
///
/// Existing and being executable is not enough: any file dropped into the
/// bundle's ffmpeg folder would otherwise be trusted and every stream would
/// fail with "FFmpeg is not available" while a perfectly good system FFmpeg sat
/// unused. Verifying costs one short-lived process and turns a fatal
/// misconfiguration into a silent fallback.
fn responds_as_tool(path: &Path, name: &str) -> bool {
    let Ok(output) = Command::new(path)
        .arg("-version")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .output()
    else {
        return false;
    };

    if !output.status.success() {
        return false;
    }

    String::from_utf8_lossy(&output.stdout)
        .to_lowercase()
        .contains(&format!("{} version", name))
}

fn bundled_binary(app: &AppHandle, name: &str) -> Option<PathBuf> {
    let resource_dir = app.path().resource_dir().ok()?;
    let exe_name = binary_name(name);
    let candidates = [
        resource_dir.join("ffmpeg").join(&exe_name),
        resource_dir.join(&exe_name),
    ];
    candidates
        .into_iter()
        .find(|candidate| is_executable_candidate(candidate))
}

fn sibling_binary(custom_ffmpeg: &str, sibling_name: &str) -> Option<String> {
    let sibling = Path::new(custom_ffmpeg)
        .parent()?
        .join(binary_name(sibling_name));
    if is_executable_candidate(&sibling) {
        Some(sibling.to_string_lossy().to_string())
    } else {
        None
    }
}

fn resolve_binary(app: &AppHandle, name: &str, custom_path: Option<&str>) -> BinaryResolution {
    if let Some(custom) = custom_path.map(str::trim).filter(|value| !value.is_empty()) {
        let path = Path::new(custom);
        if is_executable_candidate(path) {
            return BinaryResolution { path: custom.to_string(), source: "custom".to_string() };
        }
    }

    if let Some(path) = bundled_binary(app, name) {
        if responds_as_tool(&path, name) {
            return BinaryResolution {
                path: path.to_string_lossy().to_string(),
                source: "bundled".to_string(),
            };
        }
        log::warn!(
            "Ignoring bundled {} at {} — it does not respond as {}. Falling back to a system install.",
            name,
            path.display(),
            name
        );
    }

    if cfg!(target_os = "macos") {
        for candidate in [
            format!("/opt/homebrew/bin/{}", name),
            format!("/usr/local/bin/{}", name),
            format!("/usr/bin/{}", name),
        ] {
            if Path::new(&candidate).exists() {
                return BinaryResolution { path: candidate, source: "system".to_string() };
            }
        }
    }

    BinaryResolution { path: binary_name(name), source: "system".to_string() }
}

fn resolve_ffmpeg(app: &AppHandle, custom_path: Option<&str>) -> BinaryResolution {
    resolve_binary(app, "ffmpeg", custom_path)
}

fn resolve_ffprobe(app: &AppHandle, custom_ffmpeg_path: Option<&str>) -> BinaryResolution {
    if let Some(custom_ffmpeg) = custom_ffmpeg_path.map(str::trim).filter(|value| !value.is_empty()) {
        if let Some(ffprobe) = sibling_binary(custom_ffmpeg, "ffprobe") {
            return BinaryResolution { path: ffprobe, source: "custom".to_string() };
        }
    }
    resolve_binary(app, "ffprobe", None)
}

fn ffmpeg_version(binary: &str) -> Option<String> {
    let output = Command::new(binary)
        .arg("-version")
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    String::from_utf8_lossy(&output.stdout)
        .lines()
        .next()
        .map(|line| line.trim().to_string())
        .filter(|line| !line.is_empty())
}

#[tauri::command]
fn get_ffmpeg_info(app: AppHandle, custom_path: Option<String>) -> FFmpegInfo {
    let resolved = resolve_ffmpeg(&app, custom_path.as_deref());
    match ffmpeg_version(&resolved.path) {
        Some(version) => FFmpegInfo {
            available: true,
            path: resolved.path,
            version,
            source: resolved.source,
        },
        None => FFmpegInfo {
            available: false,
            path: resolved.path,
            version: "Not available".to_string(),
            source: "missing".to_string(),
        },
    }
}

#[tauri::command]
fn select_custom_ffmpeg_binary() -> Option<String> {
    rfd::FileDialog::new()
        .set_title("Select FFmpeg Binary")
        .pick_file()
        .map(|path| path.to_string_lossy().to_string())
}

#[tauri::command]
fn check_ffmpeg_available(app: AppHandle) -> bool {
    Command::new(resolve_ffmpeg(&app, None).path)
        .arg("-version")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}


fn resolve_hardware_acc(_app: &AppHandle, requested: &str, _custom_path: Option<&str>) -> String {
    // VideoToolbox's CBR rate control does not insert filler on static scenes.
    // Auto must honor the selected upload rate, so use x264's HRD CBR output.
    if requested == "Auto" { "Software".into() } else { requested.into() }
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
    size_mb: f64,
    /// Stream layout in container order, e.g. "v0,a1" or "a0,v1".
    ///
    /// The concat demuxer maps files by stream index, so a playlist mixing
    /// video-first and audio-first files silently feeds video packets into the
    /// audio slot: the picture freezes at the first boundary while the socket
    /// stays open. Fast Mode must refuse such playlists.
    stream_layout: String,
}

#[tauri::command]
fn probe_video_file(app: AppHandle, path: String) -> Result<VideoMetadata, String> {
    let ffprobe = resolve_ffprobe(&app, None);
    let output = Command::new(ffprobe.path)
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

    let mut stream_layout = String::new();

    if let Some(streams) = parsed.get("streams").and_then(|v| v.as_array()) {
        for (idx, stream) in streams.iter().enumerate() {
            let codec_type = stream.get("codec_type").and_then(|v| v.as_str()).unwrap_or("");

            if codec_type == "video" || codec_type == "audio" {
                if !stream_layout.is_empty() {
                    stream_layout.push(',');
                }
                stream_layout.push(if codec_type == "video" { 'v' } else { 'a' });
                stream_layout.push_str(&idx.to_string());
            }
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
        size_mb: fs::metadata(&path).map(|m| m.len() as f64 / 1048576.0).unwrap_or(0.0),
        stream_layout,
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
        _ => vec!["-c:v".into(), "libx264".into(), "-preset".into(), "veryfast".into(), "-threads".into(), "4".into()],
    }
}

fn constant_bitrate_args(hardware_acc: &str) -> Vec<String> {
    match hardware_acc {
        "VideoToolbox" => vec!["-constant_bit_rate".into(), "true".into(), "-realtime".into(), "true".into()],
        "NVENC" => vec!["-rc".into(), "cbr".into()],
        "QuickSync" => vec![],
        _ => vec!["-x264-params".into(), "nal-hrd=cbr:force-cfr=1".into(), "-sc_threshold".into(), "0".into()],
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
        let mut offset = 0;
        while offset < chunk.len() {
            while queue.len() >= self.capacity && !self.closed.load(Ordering::Relaxed) {
                queue = self.space.wait(queue).unwrap();
            }
            if self.closed.load(Ordering::Relaxed) {
                return false;
            }
            let take = (self.capacity - queue.len()).min(chunk.len() - offset);
            queue.extend(&chunk[offset..offset + take]);
            offset += take;
            // Wake the reader before waiting for space, even when a chunk
            // exceeds the entire buffer (e.g. at a low configured bitrate).
            self.filled.notify_all();
        }
        true
    }

    fn try_write(&self,chunk:&[u8])->bool {
        let mut queue=self.data.lock().unwrap();
        if self.closed.load(Ordering::Relaxed) || chunk.len()>self.capacity.saturating_sub(queue.len()){return false;}
        queue.extend(chunk);self.filled.notify_all();true
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
        // Share the waiters' mutex so close cannot lose a wake-up between
        // their closed check and Condvar::wait.
        let _queue = self.data.lock().unwrap();
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
    pipeline_id: Option<String>,
    shared_destinations: Option<usize>,
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
    ffmpeg_path: Option<String>,
}

/// Builds the per-clip normaliser: decode ANY source format and emit one fixed
/// MPEG-TS profile (H.264 / yuv420p / fixed size + fps, AAC 44.1 kHz stereo).
fn clip_has_audio(ffprobe: &str, clip: &str) -> Result<bool, String> {
    let output = Command::new(ffprobe).args(["-v", "error", "-select_streams", "a:0", "-show_entries", "stream=index", "-of", "csv=p=0", clip])
        .output().map_err(|e| format!("Could not inspect clip audio: {e}"))?;
    if !output.status.success() { return Err("Could not probe the selected clip".into()); }
    Ok(!String::from_utf8_lossy(&output.stdout).trim().is_empty())
}

#[cfg(test)]
fn normalizer_args(clip: &str, config: &PlayoutConfig, ts_offset: f64) -> Vec<String> {
    normalizer_args_with_audio(clip, config, ts_offset, true)
}

fn normalizer_args_with_audio(clip: &str, config: &PlayoutConfig, ts_offset: f64, has_audio: bool) -> Vec<String> {
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
    let input_options = if has_audio {
        vec!["-map".into(), "0:v:0".into(), "-map".into(), "0:a:0".into()]
    } else {
        vec!["-f".into(), "lavfi".into(), "-i".into(), "anullsrc=r=44100:cl=stereo".into(),
             "-map".into(), "0:v:0".into(), "-map".into(), "1:a:0".into(), "-shortest".into()]
    };
    // Input-specific options belong before filters/output options.
    args.splice(4..4, input_options);
    // Keep a common A/V origin. STARTPTS inside filters resets on parameter
    // changes (even color metadata), dropping video while audio continues.
    args.splice(2..2, ["-copyts".into(), "-start_at_zero".into()]);
    args.extend(hardware_encoder_args(&config.hardware_acc));
    args.extend(constant_bitrate_args(&config.hardware_acc));
    args.extend(
        [
            "-b:v".to_string(),
            format!("{}k", config.bitrate_kbps),
            "-minrate".to_string(),
            format!("{}k", config.bitrate_kbps),
            "-maxrate".to_string(),
            format!("{}k", config.bitrate_kbps),
            "-bf".to_string(),
            "0".to_string(),
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
            // Leave room for AAC encoder priming so the TS muxer does not
            // shift only the first clip to avoid a negative audio timestamp.
            format!("{:.6}", ts_offset + 0.1),
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

/// Fit a source into the output without stretching; hardware scaling requires
/// even dimensions before the inexpensive CPU padding/format conversion.
fn fitted_dimensions(source:(u32,u32), output:(u32,u32))->(u32,u32) {
    let ratio=(output.0 as f64/source.0.max(1) as f64).min(output.1 as f64/source.1.max(1) as f64);
    (((source.0 as f64*ratio) as u32/2*2).max(2),((source.1 as f64*ratio) as u32/2*2).max(2))
}
fn accelerated_normalizer_args(clip:&str,config:&PlayoutConfig,offset:f64,audio:bool,size:(u32,u32))->Vec<String> {
    let mut args=normalizer_args_with_audio(clip,config,offset,audio);
    args.splice(2..2,["-hwaccel".into(),"videotoolbox".into(),"-hwaccel_output_format".into(),"videotoolbox_vld".into()]);
    let index=args.iter().position(|a|a=="-vf").unwrap()+1;
    args[index]=format!("scale_vt=w={}:h={},hwdownload,format=nv12,pad={}:{}:(ow-iw)/2:(oh-ih)/2,fps={},format=yuv420p",size.0,size.1,config.width,config.height,config.fps);
    args
}
fn probe_accelerated_scaling(ffmpeg:&str,ffprobe:&str,clip:&str,config:&PlayoutConfig)->Option<(u32,u32)> {
    if !cfg!(target_os="macos") {return None;}
    let info=Command::new(ffprobe).args(["-v","error","-select_streams","v:0","-show_entries","stream=width,height","-of","json",clip]).output().ok()?;
    let data:serde_json::Value=serde_json::from_slice(&info.stdout).ok()?;
    let stream=data["streams"].as_array()?.first()?;
    let source=(stream["width"].as_u64()? as u32,stream["height"].as_u64()? as u32);
    // Avoid extra setup for small, already stream-sized material.
    if source.0<=config.width && source.1<=config.height {return None;}
    let size=fitted_dimensions(source,(config.width,config.height));
    let filter=format!("scale_vt=w={}:h={},hwdownload,format=nv12",size.0,size.1);
    let status=Command::new(ffmpeg).args(["-hide_banner","-loglevel","error","-nostdin","-hwaccel","videotoolbox","-hwaccel_output_format","videotoolbox_vld","-i",clip,"-map","0:v:0","-an","-vf",&filter,"-frames:v","1","-f","null","-"]).stdout(Stdio::null()).stderr(Stdio::null()).status().ok()?;
    status.success().then_some(size)
}

/// Parses the trailing `time=HH:MM:SS.mm` FFmpeg prints, i.e. how much of the
/// clip was actually encoded. Used to advance the output timeline exactly.
#[cfg(test)]
fn parse_ffmpeg_time(line: &str) -> Option<f64> {
    let idx = line.rfind("time=")? + 5;
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

fn parse_ffmpeg_frames(line: &str) -> Option<u64> {
    let idx = line.rfind("frame=")? + 6;
    line[idx..].split_whitespace().next()?.parse().ok()
}

/// Exact frame counts avoid accumulating FFmpeg's rounded stderr times at
/// every clip boundary. B-frames are disabled so packet decode times agree.
fn clip_timeline_duration(frames: u64, fps: u32) -> f64 {
    frames as f64 / fps.max(1) as f64
}

fn playout_sender_args(target: &str) -> Vec<String> {
    vec![
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
        "-rw_timeout".into(),
        "15000000".into(),
        target.to_string(),
    ]
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
fn start_playout_stream(state:State<'_,FFmpegState>,app:AppHandle,stream_id:String,clips:Vec<String>,config:PlayoutConfig,share_pipeline:Option<bool>)->Result<String,String> {
    shared_playout::start(&state,app,stream_id,clips,config,share_pipeline.unwrap_or(true))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .manage(FFmpegState::default())
        .manage(schedule_power::WakeChanges::default())
        .invoke_handler(tauri::generate_handler![
            prepared_media::prepare_stream_video,
            prepared_media::cancel_stream_preparation,
            select_video_files,
            save_text_file,
            set_keep_awake,
            schedule_power::get_schedule_power_status,
            schedule_power::configure_schedule_wake,
            send_desktop_notification,
            copy_text_to_clipboard,
            read_clipboard_text,
            start_ffmpeg_stream,
            stop_ffmpeg_stream,
            check_ffmpeg_available,
            get_ffmpeg_info,
            select_custom_ffmpeg_binary,
            save_profile_stream_key,
            get_profile_stream_key,
            delete_profile_stream_key,
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
                prepared_media::shutdown(&state);
                shared_playout::shutdown_all(&state);
                if let Some(mut guard) = state.keep_awake.lock().unwrap().take() { let _=guard.kill(); let _=guard.wait(); }
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

        let parent_alive = process.parent().map(|parent| parent.as_u32() > 1 && sys.process(parent).is_some()).unwrap_or(false);
        if cmd.contains("livestream_studio_") && !parent_alive {
            log::info!("Reaping orphaned FFmpeg from a previous run: {}", pid);
            process.kill();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::mpsc;
    use std::time::Duration;

    #[test]
    fn buffer_streams_chunks_larger_than_capacity() {
        let buffer = Arc::new(PlayoutBuffer::new(3));
        let writer = buffer.clone();
        let (tx, rx) = mpsc::channel();
        thread::spawn(move || { tx.send(writer.write(b"abcdefgh")).unwrap(); writer.close(); });
        let reader = buffer.clone();
        let (out_tx, out_rx) = mpsc::channel();
        thread::spawn(move || {
            let mut bytes = Vec::new();
            while let Some(chunk) = reader.read(2) { bytes.extend(chunk); }
            out_tx.send(bytes).unwrap();
        });
        assert!(rx.recv_timeout(Duration::from_secs(2)).unwrap());
        assert_eq!(out_rx.recv_timeout(Duration::from_secs(2)).unwrap(), b"abcdefgh");
    }

    #[test]
    fn closed_buffer_rejects_writes_and_drains_pending_bytes() {
        let buffer = PlayoutBuffer::new(10);
        assert!(buffer.write(b"abc"));
        buffer.close();
        assert!(!buffer.write(b"def"));
        assert_eq!(buffer.read(10).unwrap(), b"abc");
        assert!(buffer.read(10).is_none());
    }

    #[test]
    fn close_wakes_blocked_reader_and_writer() {
        for full in [false, true] {
            let buffer = Arc::new(PlayoutBuffer::new(1));
            if full { assert!(buffer.write(b"a")); }
            let worker = buffer.clone();
            let (tx, rx) = mpsc::channel();
            thread::spawn(move || {
                let ended = if full { !worker.write(b"b") } else { worker.read(1).is_none() };
                tx.send(ended).unwrap();
            });
            buffer.close();
            assert!(rx.recv_timeout(Duration::from_secs(2)).unwrap());
        }
    }

    #[test]
    fn parses_real_ffmpeg_progress_and_rejects_missing_time() {
        assert_eq!(parse_ffmpeg_time("frame= 90 time=01:02:03.50 bitrate=4500"), Some(3723.5));
        assert_eq!(parse_ffmpeg_time("time=N/A"), None);
        assert_eq!(parse_ffmpeg_time("error opening output"), None);
    }

    #[test]
    fn rtmp_probe_accepts_local_listener_and_rejects_empty_host() {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        assert!(check_rtmp_reachable(format!("rtmp://{}/live", listener.local_addr().unwrap())).reachable);
        assert!(!check_rtmp_reachable("rtmp:///live".into()).reachable);
    }

    #[test]
    fn bundled_tools_run_without_system_ffmpeg() {
        for tool in ["ffmpeg", "ffprobe"] {
            assert!(responds_as_tool(&Path::new(env!("CARGO_MANIFEST_DIR")).join("resources/ffmpeg").join(tool), tool));
        }
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn credentials_use_native_keychain_backend() {
        let entry = profile_key_entry("backend-selection-test").unwrap();
        assert!(entry.get_credential().is::<keyring::macos::MacCredential>());
    }
}

#[cfg(test)]
mod media_tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn mixed_clips_normalize_and_decode_through_one_sender() {
        let ffmpeg = Path::new(env!("CARGO_MANIFEST_DIR")).join("resources/ffmpeg/ffmpeg");
        let ffprobe = ffmpeg.with_file_name("ffprobe");
        let dir = std::env::temp_dir().join(format!("studio-media-test-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let config = PlayoutConfig { width:320, height:240, fps:30, bitrate_kbps:500,
            hardware_acc:"Software".into(), rtmp_target:String::new(), loop_forever:false, repeat_count:1, ffmpeg_path:None };
        let mut transport = Vec::new();
        for (index, (size, fps, audio)) in [("320x240", "30", "44100"), ("640x360", "24", "48000")].iter().enumerate() {
            let clip = dir.join(format!("clip-{index}.mp4"));
            let generated = Command::new(&ffmpeg).args(["-hide_banner","-loglevel","error","-y","-f","lavfi","-i",&format!("testsrc2=size={size}:rate={fps}"),"-f","lavfi","-i",&format!("sine=frequency=440:sample_rate={audio}"),"-t","2","-c:v","libx264","-pix_fmt","yuv420p","-c:a","aac"]).arg(&clip).output().unwrap();
            assert!(generated.status.success(), "{}", String::from_utf8_lossy(&generated.stderr));
            let normalized = Command::new(&ffmpeg).args(normalizer_args(clip.to_str().unwrap(), &config, index as f64 * 2.0)).output().unwrap();
            assert!(normalized.status.success(), "{}", String::from_utf8_lossy(&normalized.stderr));
            transport.extend(normalized.stdout);
        }
        let output = dir.join("received.flv");
        let mut sender = Command::new(&ffmpeg).args(["-hide_banner","-loglevel","error","-y","-f","mpegts","-i","pipe:0","-c","copy","-f","flv"]).arg(&output).stdin(Stdio::piped()).stderr(Stdio::piped()).spawn().unwrap();
        sender.stdin.take().unwrap().write_all(&transport).unwrap();
        let result = sender.wait_with_output().unwrap();
        assert!(result.status.success(), "{}", String::from_utf8_lossy(&result.stderr));
        let probed = Command::new(&ffprobe).args(["-v","error","-count_frames","-show_streams","-of","json"]).arg(&output).output().unwrap();
        let info: serde_json::Value = serde_json::from_slice(&probed.stdout).unwrap();
        let streams = info["streams"].as_array().unwrap();
        let v = streams.iter().find(|s| s["codec_type"] == "video").unwrap();
        let a = streams.iter().find(|s| s["codec_type"] == "audio").unwrap();
        assert_eq!(v["codec_name"], "h264"); assert_eq!(v["width"],320); assert_eq!(v["height"],240);
        assert!(v["nb_read_frames"].as_str().unwrap().parse::<u32>().unwrap() >= 115);
        assert_eq!(a["codec_name"], "aac"); assert_eq!(a["sample_rate"], "44100"); assert_eq!(a["channels"],2);
        fs::remove_dir_all(dir).unwrap();
    }
}

#[cfg(test)]
mod progress_tests {
    use super::*;
    #[test]
    fn progress_is_delivered_for_carriage_returns_and_newlines() {
        let mut lines = Vec::new();
        read_ffmpeg_lines(&b"header\nframe=1 time=00:00:00.03\rframe=60 time=00:00:02.00\r\nlast"[..], |line| lines.push(line));
        assert_eq!(lines.len(), 4);
        assert_eq!(parse_ffmpeg_time(&lines[2]), Some(2.0));
        assert_eq!(lines[3], "last");
    }
}

#[cfg(test)]
mod stability_tests {
    use super::*;
    use std::io::Write;
    use std::time::Duration;

    fn tools() -> (PathBuf, PathBuf) {
        let ffmpeg = Path::new(env!("CARGO_MANIFEST_DIR")).join("resources/ffmpeg/ffmpeg");
        (ffmpeg.clone(), ffmpeg.with_file_name("ffprobe"))
    }
    fn config() -> PlayoutConfig {
        PlayoutConfig { width:320, height:240, fps:30, bitrate_kbps:500, hardware_acc:"Software".into(), rtmp_target:String::new(), loop_forever:false, repeat_count:1, ffmpeg_path:None }
    }
    fn fixture(dir: &Path, seconds: &str) -> PathBuf {
        fs::create_dir_all(dir).unwrap();
        let clip = dir.join("static.mp4");
        let (ffmpeg, _) = tools();
        let result = Command::new(ffmpeg).args(["-v","error","-y","-f","lavfi","-i","color=c=blue:s=320x240:r=30","-f","lavfi","-i","sine=sample_rate=44100","-t",seconds,"-c:v","libx264","-c:a","aac","-ac","2"]).arg(&clip).output().unwrap();
        assert!(result.status.success(),"{}", String::from_utf8_lossy(&result.stderr));
        clip
    }
    fn encode(clip: &Path, offset: f64) -> (Vec<u8>, u64) {
        let (ffmpeg, _) = tools();
        let result = Command::new(ffmpeg).args(normalizer_args(clip.to_str().unwrap(), &config(), offset)).output().unwrap();
        assert!(result.status.success(),"{}",String::from_utf8_lossy(&result.stderr));
        let mut frames = 0;
        read_ffmpeg_lines(&result.stderr[..], |line| { if let Some(n) = parse_ffmpeg_frames(&line) { frames = n; } });
        (result.stdout, frames)
    }
    fn packet_info(path: &Path) -> serde_json::Value {
        let (_, ffprobe) = tools();
        let result = Command::new(ffprobe).args(["-v","error","-select_streams","v","-show_packets","-show_entries","packet=pts_time,dts_time,size","-of","json"]).arg(path).output().unwrap();
        assert!(result.status.success());
        serde_json::from_slice(&result.stdout).unwrap()
    }
    #[test]
    fn color_metadata_changes_preserve_audio_video_sync_across_loops() {
        let dir = std::env::temp_dir().join(format!("studio-color-timeline-{}",std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let (ffmpeg, ffprobe)=tools();
        for (index,color) in ["bt709","smpte170m"].iter().enumerate() {
            let output=Command::new(&ffmpeg).args(["-y","-hide_banner","-loglevel","error","-f","lavfi","-i","color=c=blue:s=320x240:r=30:d=2","-f","lavfi","-i","sine=frequency=660:sample_rate=44100:duration=2","-c:v","libx264","-threads","1","-pix_fmt","yuv420p","-colorspace",color,"-c:a","aac","-f","mpegts"]).arg(dir.join(format!("{index}.ts"))).output().unwrap();
            assert!(output.status.success(),"{}",String::from_utf8_lossy(&output.stderr));
        }
        let input=format!("concat:{}|{}",dir.join("0.ts").display(),dir.join("1.ts").display());
        let clip=dir.join("metadata-change.mp4");
        let result=Command::new(&ffmpeg).args(["-y","-hide_banner","-loglevel","error","-i",&input,"-c","copy"]).arg(&clip).output().unwrap();
        assert!(result.status.success());
        // The offline Prepare copy path must preserve the same timeline.
        let prepared=dir.join("prepared.mp4");
        let result=Command::new(&ffmpeg).args(prepared_media::prepare_args(clip.to_str().unwrap(),&config(),true,None,prepared.to_str().unwrap(),Some(4.04))).output().unwrap();
        assert!(result.status.success(),"{}",String::from_utf8_lossy(&result.stderr));
        let result=Command::new(&ffprobe).args(["-v","error","-show_streams","-of","json"]).arg(&prepared).output().unwrap();
        let data:serde_json::Value=serde_json::from_slice(&result.stdout).unwrap();
        let durations:Vec<f64>=data["streams"].as_array().unwrap().iter().map(|s|s["duration"].as_str().unwrap().parse().unwrap()).collect();
        assert!((durations[0]-durations[1]).abs()<0.1,"prepared A/V drift: {:?}",durations);
        let mut transport=Vec::new();let mut offset=0.0;
        for _ in 0..3 {
            let (bytes,frames)=encode(&clip,offset);
            assert!((118..=123).contains(&frames),"tail was dropped after filter reinitialization: {frames} frames");
            offset+=clip_timeline_duration(frames,30);transport.extend(bytes);
        }
        let path=dir.join("looped.ts");fs::write(&path,transport).unwrap();
        let result=Command::new(&ffprobe).args(["-v","error","-show_packets","-show_entries","packet=stream_index,pts_time,dts_time","-of","json"]).arg(&path).output().unwrap();
        let data:serde_json::Value=serde_json::from_slice(&result.stdout).unwrap();
        let mut ends=[None,None];
        for packet in data["packets"].as_array().unwrap() {
            let index=packet["stream_index"].as_u64().unwrap() as usize;
            if index>1 {continue;}
            let time:f64=packet["dts_time"].as_str().unwrap().parse().unwrap();
            if let Some(previous)=ends[index] {assert!(time>=previous-0.08,"stream {index} clock jumped backwards: {previous} -> {time}");}
            ends[index]=Some(time);
        }
        assert!((ends[0].unwrap()-ends[1].unwrap()).abs()<0.15,"audio/video drift: {:?}",ends);
        fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn static_video_keeps_target_bitrate() {
        let dir = std::env::temp_dir().join(format!("studio-cbr-{}",std::process::id()));
        let clip = fixture(&dir,"8");
        let (bytes, frames) = encode(&clip,0.0);
        assert_eq!(frames,240);
        let path=dir.join("cbr.ts"); fs::write(&path,bytes).unwrap();
        let info=packet_info(&path);
        let mut bins=std::collections::BTreeMap::<i32,u64>::new();
        let packets=info["packets"].as_array().unwrap();
        let start: f64=packets[0]["pts_time"].as_str().unwrap().parse().unwrap();
        for p in packets {
            let t:f64=p["pts_time"].as_str().unwrap().parse().unwrap();
            let size:u64=p["size"].as_str().unwrap().parse().unwrap();
            *bins.entry((t-start).floor() as i32).or_default() += size;
        }
        // After encoder startup, even a static picture must sustain its
        // selected video rate rather than collapsing to a few Kbps.
        for second in 2..7 { assert!(bins[&second]*8 >= 400_000,"second {second}: {} bits",bins[&second]*8); }
        fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn repeated_clips_have_continuous_video_timestamps() {
        let dir = std::env::temp_dir().join(format!("studio-timeline-{}",std::process::id()));
        let clip=fixture(&dir,"1"); let mut offset=0.0; let mut transport=Vec::new();
        for _ in 0..12 {
            let (bytes,frames)=encode(&clip,offset);
            assert_eq!(frames,30);
            offset += clip_timeline_duration(frames,30); transport.extend(bytes);
        }
        assert_eq!(offset,12.0);
        let path=dir.join("continuous.ts"); fs::write(&path,transport).unwrap();
        let info=packet_info(&path); let packets=info["packets"].as_array().unwrap();
        assert_eq!(packets.len(),360);
        for pair in packets.windows(2) {
            let a:f64=pair[0]["dts_time"].as_str().unwrap().parse().unwrap();
            let b:f64=pair[1]["dts_time"].as_str().unwrap().parse().unwrap();
            assert!((b-a-1.0/30.0).abs()<0.002,"timestamp gap {}",b-a);
        }
        fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn stopping_one_rtmp_sender_does_not_interrupt_the_other() {
        let dir = std::env::temp_dir().join(format!("studio-multistream-{}",std::process::id()));
        let clip=fixture(&dir,"4"); let (bytes,_)=encode(&clip,0.0); let (ffmpeg,_)=tools();
        let mut receivers=Vec::new(); let mut senders=Vec::new(); let mut writers=Vec::new();
        for n in 0..2 {
            let listener=std::net::TcpListener::bind("127.0.0.1:0").unwrap();
            let addr=listener.local_addr().unwrap(); drop(listener);
            let target=format!("rtmp://{addr}/live/test-{n}");
            let receiver=Command::new(&ffmpeg).args(["-v","error","-y","-listen","1","-i",&target,"-c","copy","-f","flv"]).arg(dir.join(format!("received-{n}.flv"))).stdout(Stdio::null()).stderr(Stdio::null()).spawn().unwrap();
            receivers.push(receiver); thread::sleep(Duration::from_millis(150));
            let mut sender=Command::new(&ffmpeg).args(playout_sender_args(&target)).stdin(Stdio::piped()).stdout(Stdio::null()).stderr(Stdio::null()).spawn().unwrap();
            let mut input=sender.stdin.take().unwrap(); let content=bytes.clone();
            writers.push(thread::spawn(move || { let _=input.write_all(&content); }));
            senders.push(sender);
        }
        thread::sleep(Duration::from_millis(1400));
        senders[0].kill().unwrap(); let _=senders[0].wait();
        assert!(senders[1].try_wait().unwrap().is_none(),"second stream was stopped with the first");
        assert!(senders[1].wait().unwrap().success());
        for writer in writers { writer.join().unwrap(); }
        for receiver in &mut receivers { let _=receiver.wait(); }
        let first=packet_info(&dir.join("received-0.flv")); let second=packet_info(&dir.join("received-1.flv"));
        assert!(first["packets"].as_array().unwrap().len()<100);
        assert_eq!(second["packets"].as_array().unwrap().len(),120);
        fs::remove_dir_all(dir).unwrap();
    }
}

#[cfg(test)]
mod silent_video_tests {
    use super::*;
    #[test]
    fn video_without_audio_gets_continuous_stereo_aac() {
        let ffmpeg=Path::new(env!("CARGO_MANIFEST_DIR")).join("resources/ffmpeg/ffmpeg");
        let ffprobe=ffmpeg.with_file_name("ffprobe");
        let dir=std::env::temp_dir().join(format!("studio-silent-{}",std::process::id())); fs::create_dir_all(&dir).unwrap();
        let clip=dir.join("silent.mp4");
        assert!(Command::new(&ffmpeg).args(["-v","error","-y","-f","lavfi","-i","color=s=320x240:r=30","-t","2","-c:v","libx264","-an"]).arg(&clip).status().unwrap().success());
        assert!(!clip_has_audio(ffprobe.to_str().unwrap(),clip.to_str().unwrap()).unwrap());
        let config=PlayoutConfig{width:320,height:240,fps:30,bitrate_kbps:500,hardware_acc:"Software".into(),rtmp_target:String::new(),loop_forever:false,repeat_count:1,ffmpeg_path:None};
        let out=Command::new(&ffmpeg).args(normalizer_args_with_audio(clip.to_str().unwrap(),&config,0.0,false)).output().unwrap();
        assert!(out.status.success(),"{}",String::from_utf8_lossy(&out.stderr));
        let path=dir.join("out.ts"); fs::write(&path,out.stdout).unwrap();
        let probe=Command::new(ffprobe).args(["-v","error","-show_streams","-of","json"]).arg(path).output().unwrap();
        let info:serde_json::Value=serde_json::from_slice(&probe.stdout).unwrap();
        let audio=info["streams"].as_array().unwrap().iter().find(|s|s["codec_type"]=="audio").unwrap();
        assert_eq!(audio["codec_name"],"aac"); assert_eq!(audio["channels"],2);
        fs::remove_dir_all(dir).unwrap();
    }
}

#[cfg(test)]
mod external_smoke_test {
    use super::*;
    use std::io::Write;

    /// Explicit opt-in only: the key stays in process memory and all output is redacted.
    #[test]
    #[ignore = "requires explicit authorization and STUDIO_RTMP_TEST_KEY"]
    fn youtube_cbr_smoke() {
        let key=std::env::var("STUDIO_RTMP_TEST_KEY").expect("Set the authorized test stream key");
        let ffmpeg=Path::new(env!("CARGO_MANIFEST_DIR")).join("resources/ffmpeg/ffmpeg");
        let clip=std::env::var("STUDIO_RTMP_TEST_CLIP").unwrap_or_else(|_|"/tmp/livestream-studio-youtube-test.mp4".into());
        let config=PlayoutConfig{width:1280,height:720,fps:30,bitrate_kbps:4500,hardware_acc:"Software".into(),rtmp_target:format!("rtmp://a.rtmp.youtube.com/live2/{}",key.trim()),loop_forever:false,repeat_count:3,ffmpeg_path:None};
        let mut transport=Vec::new(); let mut offset=0.0;
        for _ in 0..3 {
            let result=Command::new(&ffmpeg).args(normalizer_args_with_audio(&clip,&config,offset,true)).output().unwrap();
            assert!(result.status.success(),"{}",String::from_utf8_lossy(&result.stderr).replace(key.trim(),"[REDACTED]"));
            let mut frames=0;
            read_ffmpeg_lines(&result.stderr[..],|line|{if let Some(n)=parse_ffmpeg_frames(&line){frames=n;}});
            offset += clip_timeline_duration(frames,config.fps); transport.extend(result.stdout);
        }
        println!("Starting finite {offset:.1}-second CBR test at 4500 Kbps");
        let mut sender=Command::new(&ffmpeg).args(playout_sender_args(&config.rtmp_target)).stdin(Stdio::piped()).stdout(Stdio::null()).stderr(Stdio::piped()).spawn().unwrap();
        let stderr=sender.stderr.take().unwrap(); let secret=key.clone();
        let logs=thread::spawn(move|| read_ffmpeg_lines(stderr,|line| {
            if line.contains("frame=") || line.to_lowercase().contains("error") { println!("{}",line.replace(secret.trim(),"[REDACTED]")); }
        }));
        let sent=sender.stdin.take().unwrap().write_all(&transport);
        let status=sender.wait().unwrap(); logs.join().unwrap();
        assert!(sent.is_ok() && status.success(),"YouTube sender did not complete");
        println!("Finite CBR sender completed and stopped");
    }
}

#[cfg(test)]
mod rate_tests {
    use super::*;
    #[test]
    fn rate_reports_current_output_and_zero_during_a_stall() {
        let mut a=RateWindow::default(); let mut b=RateWindow::default();
        let (_,rate)=a.sample("frame=30 size=100KiB time=00:00:01.00 bitrate=819.2kbits/s",1.0).unwrap();
        assert_eq!(rate,819.2);
        assert_eq!(a.sample("frame=30 size=100KiB time=00:00:01.00 bitrate=819.2kbits/s",1.0).unwrap(),(0.0,0.0));
        // A separate destination has its own counters.
        assert_eq!(b.sample("frame=60 size=200KiB",2.0).unwrap(),(30.0,819.2));
    }
}

#[cfg(test)]
mod acceleration_tests {
    use super::*;
    #[test]
    fn accelerated_scaling_preserves_shape_and_output_contract() {
        assert_eq!(fitted_dimensions((7680,4320),(1920,1080)),(1920,1080));
        assert_eq!(fitted_dimensions((4320,7680),(1920,1080)),(606,1080));
        let config=PlayoutConfig{width:1920,height:1080,fps:30,bitrate_kbps:4500,hardware_acc:"Software".into(),rtmp_target:String::new(),loop_forever:false,repeat_count:1,ffmpeg_path:None};
        let args=accelerated_normalizer_args("clip.mp4",&config,12.0,false,(606,1080));
        assert!(args.iter().position(|a|a=="-hwaccel").unwrap()<args.iter().position(|a|a=="-i").unwrap());
        let filter=&args[args.iter().position(|a|a=="-vf").unwrap()+1];
        assert!(filter.contains("scale_vt=w=606:h=1080,hwdownload,format=nv12"));
        assert!(filter.contains("pad=1920:1080"));
        assert!(args.contains(&"libx264".to_string()));
        assert!(args.contains(&"nal-hrd=cbr:force-cfr=1".to_string()));
        assert!(args.contains(&"anullsrc=r=44100:cl=stereo".to_string()));
    }
    #[test]
    #[ignore="requires STUDIO_HIGH_RES_TEST_CLIP and a Mac with hardware decoding"]
    fn two_real_high_resolution_sources_encode_faster_than_realtime() {
        let clip=std::env::var("STUDIO_HIGH_RES_TEST_CLIP").expect("source path required");
        let ffmpeg=PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources/ffmpeg/ffmpeg");
        let ffprobe=ffmpeg.with_file_name("ffprobe");
        let config=PlayoutConfig{width:1920,height:1080,fps:30,bitrate_kbps:4500,hardware_acc:"Software".into(),rtmp_target:String::new(),loop_forever:false,repeat_count:1,ffmpeg_path:None};
        let size=probe_accelerated_scaling(ffmpeg.to_str().unwrap(),ffprobe.to_str().unwrap(),&clip,&config).expect("hardware path unavailable");
        let dir=std::env::temp_dir().join(format!("studio-high-res-{}",std::process::id()));fs::create_dir_all(&dir).unwrap();
        let started=std::time::Instant::now();let mut children=Vec::new();
        for index in 0..2 {
            let file=dir.join(format!("output-{index}.ts"));
            let mut args=accelerated_normalizer_args(&clip,&config,0.0,true,size);
            args.splice(args.len()-3..args.len()-3,["-t".into(),"20".into()]);*args.last_mut().unwrap()=file.to_string_lossy().into_owned();
            children.push((Command::new(&ffmpeg).args(args).stdout(Stdio::null()).stderr(Stdio::null()).spawn().unwrap(),file));
        }
        for (child,_) in &mut children {assert!(child.wait().unwrap().success());}
        let elapsed=started.elapsed().as_secs_f64();
        eprintln!("Two 8K-source encoders produced 20 seconds each in {elapsed:.2}s");
        assert!(elapsed<20.0,"cannot sustain two real-time encoders");
        for (_,file) in children {
            let output=Command::new(&ffprobe).args(["-v","error","-count_frames","-select_streams","v:0","-show_entries","stream=nb_read_frames,width,height","-of","json"]).arg(file).output().unwrap();
            let data:serde_json::Value=serde_json::from_slice(&output.stdout).unwrap();
            assert_eq!(data["streams"][0]["width"],1920);assert_eq!(data["streams"][0]["height"],1080);
            assert!(data["streams"][0]["nb_read_frames"].as_str().unwrap().parse::<u32>().unwrap()>=595);
        }
        fs::remove_dir_all(dir).unwrap();
    }
}
