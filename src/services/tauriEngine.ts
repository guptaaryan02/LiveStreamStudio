import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { HardwareAcceleration } from '../types';
import { listen, UnlistenFn } from '@tauri-apps/api/event';

export const setupFFmpegLogListener = async (onLog: (streamId: string, line: string) => void): Promise<UnlistenFn | null> => {
  if (isTauriEnvironment()) {
    return await listen<{ streamId: string; line: string }>('ffmpeg-log', (event) => {
      onLog(event.payload.streamId, event.payload.line);
    });
  }
  return null;
};

export const setupFFmpegExitListener = async (onExit: (streamId: string) => void): Promise<UnlistenFn | null> => {
  if (isTauriEnvironment()) {
    return await listen<string>('ffmpeg-exit', (event) => {
      onExit(event.payload);
    });
  }
  return null;
};

export const isTauriEnvironment = (): boolean => {
  if (typeof window === 'undefined') return false;
  const isTauri = ('__TAURI_INTERNALS__' in window) || ('__TAURI__' in window) || ('__TAURI_IPC__' in window) || (window.navigator && window.navigator.userAgent.includes('Tauri'));
  console.log('[Tauri Engine] isTauriEnvironment:', isTauri, 'window keys:', Object.keys(window).filter(k => k.includes('TAURI')));
  return isTauri;
};

export interface NativeVideoFile {
  id: string;
  title: string;
  filePath: string;
  localPath?: string;
  category: string;
  duration: number;
  resolution: string;
  sizeMb: number;
  thumbnail: string;
  fps: number;
}

export const selectNativeVideoFiles = async (): Promise<NativeVideoFile[]> => {
  try {
    console.log('[Tauri Engine] Calling invoke select_video_files...');
    const files = await invoke<NativeVideoFile[]>('select_video_files');
    console.log('[Tauri Engine] select_video_files returned:', files);
    if (!files || !Array.isArray(files)) {
      alert('[Tauri Picker Debug] Rust returned non-array: ' + JSON.stringify(files));
      return [];
    }
    return files.map((f) => ({
      ...f,
      localPath: f.filePath,                    // real disk path → used by FFmpeg
      filePath: convertFileSrc(f.filePath),     // asset:// URL → used by HTML5 <video> player
    }));
  } catch (e) {
    console.error('Tauri native file picker error:', e);
    alert('[Tauri Picker Error] ' + String(e));
  }
  return [];
};

export interface PlayoutConfig {
  width: number;
  height: number;
  fps: number;
  bitrateKbps: number;
  hardwareAcc: HardwareAcceleration;
  rtmpTarget: string;
  loopForever: boolean;
  repeatCount: number;
}

export interface PlayoutStats {
  streamId: string;
  clipIndex: number;
  clipCount: number;
  clipName: string;
  bufferSeconds: number;
  bufferPercent: number;
}

export const setupPlayoutStatsListener = async (
  onStats: (stats: PlayoutStats) => void
): Promise<UnlistenFn | null> => {
  if (isTauriEnvironment()) {
    return await listen<PlayoutStats>('playout-stats', (event) => onStats(event.payload));
  }
  return null;
};

/**
 * Starts the continuous playout engine: one RTMP sender fed by per-clip
 * normalisers, so a playlist can mix any formats without dropping the stream.
 */
export const startTauriPlayoutStream = async (params: {
  streamId: string;
  clips: string[];
  config: PlayoutConfig;
}): Promise<{ success: boolean; message?: string; error?: string }> => {
  try {
    if (isTauriEnvironment()) {
      const result = await invoke<string>('start_playout_stream', {
        streamId: params.streamId,
        clips: params.clips,
        config: params.config,
      });
      return { success: true, message: result };
    }
  } catch (e) {
    return { success: false, error: String(e) };
  }
  return { success: false, error: 'Not in Tauri environment' };
};

export interface TauriStreamParams {
  streamId: string;
  args: string[];
  playlistContent: string; // Needed for Fast Mode to write playlist.txt
}

/**
 * Initiates the real FFmpeg native backend stream via Tauri IPC.
 */
export const startTauriFFmpegStream = async (params: TauriStreamParams): Promise<{ success: boolean; message?: string; error?: string }> => {
  try {
    if (isTauriEnvironment()) {
      const result = await invoke<string>('start_ffmpeg_stream', {
        streamId: params.streamId,
        args: params.args || [], // New signature
        playlistContent: params.playlistContent,
      });
      console.log('[Tauri FFmpeg] Start result:', result);
      return { success: true, message: result };
    }
  } catch (e) {
    const msg = String(e);
    console.error('[Tauri FFmpeg] Start error:', msg);
    return { success: false, error: msg };
  }
  return { success: false, error: 'Not in Tauri environment' };
};

export const stopTauriFFmpegStream = async (streamId: string): Promise<boolean> => {
  try {
    if (isTauriEnvironment()) {
      await invoke('stop_ffmpeg_stream', { streamId });
      return true;
    }
  } catch (e) {
    console.error('[Tauri FFmpeg] Stop error:', e);
  }
  return false;
};

export const checkFFmpegAvailable = async (): Promise<boolean> => {
  try {
    if (isTauriEnvironment()) {
      return await invoke<boolean>('check_ffmpeg_available');
    }
  } catch (e) {
    return false;
  }
  return false;
};

export const getProcessTelemetry = async (streamId: string): Promise<{ cpu: number; memory_mb: number } | null> => {
  try {
    if (isTauriEnvironment()) {
      const result = await invoke<{ cpu: number; memoryMb: number }>('get_process_telemetry', { streamId });
      if (result) {
        return { cpu: result.cpu, memory_mb: result.memoryMb };
      }
    }
  } catch (e) {
    console.warn('[Tauri FFmpeg] get_process_telemetry error:', e);
  }
  return null;
};

export interface RtmpCheck {
  reachable: boolean;
  latencyMs: number;
  detail: string;
}

/** Real TCP reachability probe of the RTMP endpoint (not a bandwidth test). */
export const checkRtmpReachable = async (url: string): Promise<RtmpCheck> => {
  try {
    if (isTauriEnvironment()) {
      return await invoke<RtmpCheck>('check_rtmp_reachable', { url });
    }
    const res = await fetch('/api/net/rtmp-check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    return { reachable: false, latencyMs: 0, detail: String(e) };
  }
};

export const probeVideoFile = async (path: string): Promise<any> => {
  try {
    if (isTauriEnvironment()) {
      return await invoke('probe_video_file', { path });
    }
  } catch (e) {
    console.error('[Tauri FFmpeg] probe error:', e);
  }
  return null;
};
