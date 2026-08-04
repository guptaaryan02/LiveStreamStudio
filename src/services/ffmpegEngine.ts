import { Playlist, StreamPlatform, HardwareAcceleration, StreamInstance, LogEntry, CompatibilityAnalysis, OutputResolution, OutputFps, AppSettings } from '../types';

export const resolveLocalPath = (path: string): string => {
  if (!path) return '';
  let cleanPath = path;
  
  if (cleanPath.startsWith('asset://localhost/')) {
    cleanPath = decodeURIComponent(cleanPath.replace('asset://localhost/', ''));
  } else if (cleanPath.startsWith('http://asset.localhost/')) {
    cleanPath = decodeURIComponent(cleanPath.replace('http://asset.localhost/', ''));
  } else if (cleanPath.startsWith('tauri://localhost/')) {
    cleanPath = decodeURIComponent(cleanPath.replace('tauri://localhost/', ''));
  } else if (cleanPath.includes('/api/files/preview?path=')) {
    // Web-mode preview URL → recover the real disk path it points at
    cleanPath = decodeURIComponent(cleanPath.split('/api/files/preview?path=')[1] || '');
  }

  // Remove trailing slash or weird leading double slashes if present
  if (cleanPath.startsWith('//')) {
    cleanPath = cleanPath.substring(1);
  }
  
  return cleanPath;
};

export function analyzePlaylistCompatibility(playlist: Playlist): CompatibilityAnalysis {
  if (!playlist.videos || playlist.videos.length === 0) {
    return { isCompatible: false, score: 0, differences: ['No videos in playlist'] };
  }
  
  const firstMeta = playlist.videos[0].metadata;
  if (!firstMeta) {
    return { isCompatible: false, score: 0, differences: ['Missing metadata for first video'] };
  }

  let minScore = 100;
  let allDifferences = new Set<string>();

  // Check every subsequent video against the first video
  for (let i = 1; i < playlist.videos.length; i++) {
    const meta = playlist.videos[i].metadata;
    if (!meta) {
      minScore = 0;
      allDifferences.add(`Video ${i+1} missing metadata`);
      continue;
    }
    
    let currentScore = 100;

    // Stream ORDER, not just stream content. The concat demuxer maps by index,
    // so an audio-first file followed by a video-first file sends video packets
    // into the audio slot: the picture freezes at the boundary while the
    // connection stays open. This must force Compatibility Mode.
    if (meta.stream_layout !== firstMeta.stream_layout) {
      currentScore -= 40;
      allDifferences.add('Different audio/video stream order');
    }

    if (meta.video_codec !== firstMeta.video_codec) {
      currentScore -= 20;
      allDifferences.add(`${meta.video_codec.toUpperCase()} Codec`);
    }
    if (meta.audio_codec !== firstMeta.audio_codec) {
      currentScore -= 20;
      allDifferences.add(`${meta.audio_codec.toUpperCase()} Audio`);
    }
    if (meta.resolution !== firstMeta.resolution) {
      currentScore -= 15;
      allDifferences.add(`Resolution (${meta.resolution})`);
    }
    if (meta.pixel_format !== firstMeta.pixel_format) {
      currentScore -= 15;
      allDifferences.add(`Pixel Format`);
    }
    if (meta.audio_channels !== firstMeta.audio_channels) {
      currentScore -= 10;
      allDifferences.add(meta.audio_channels === 1 ? 'Mono Audio' : 'Audio Layout');
    }
    if (meta.sample_rate !== firstMeta.sample_rate) {
      currentScore -= 10;
      allDifferences.add(`Sample Rate`);
    }
    if (Math.abs(meta.fps - firstMeta.fps) > 0.5) {
      currentScore -= 5;
      allDifferences.add(`${meta.fps.toFixed(2)} FPS`);
    }
    // Note: Assuming MP4 for container (5 points). No easy way to check container from our ffprobe parser yet.
    
    if (currentScore < minScore) {
      minScore = currentScore;
    }
  }
  
  // Fast mode requirements
  // 1. Must be 100% match.
  // 2. Must be h264/aac format (native to RTMP).
  // 3. The stream layout must be known — a playlist imported before layout
  //    detection existed could hide the audio/video-order trap above, so we
  //    stay on the safe engine until the clips have been probed again.
  const layoutKnown = playlist.videos.every((v) => !!v.metadata?.stream_layout);
  if (!layoutKnown) {
    allDifferences.add('Stream layout not probed yet — using the safe engine');
  }

  const isCompatible =
    minScore === 100 &&
    layoutKnown &&
    firstMeta.video_codec === 'h264' &&
    firstMeta.audio_codec === 'aac';
  
  if (minScore === 100 && !isCompatible) {
    allDifferences.add(`Non-native Codec (${firstMeta.video_codec}/${firstMeta.audio_codec})`);
    minScore -= 20; // Penalize score if it's identical but unsupported format
  }
  
  return {
    isCompatible,
    score: Math.max(0, minScore),
    differences: Array.from(allDifferences)
  };
}

export const getHardwareEncoderFlags = (hw: HardwareAcceleration, videoCodec: string = 'libx264'): string[] => {
  switch (hw) {
    case 'NVENC':
      return ['-c:v', 'h264_nvenc', '-preset', 'p4'];
    case 'QuickSync':
      return ['-c:v', 'h264_qsv', '-preset', 'medium'];
    case 'VideoToolbox':
      return ['-c:v', 'h264_videotoolbox'];
    case 'Auto':
    case 'Software':
    default:
      return ['-c:v', videoCodec, '-preset', 'veryfast'];
  }
};

export function generateFFmpegArgs(
  playlist: Playlist,
  platform: StreamPlatform,
  rtmpUrl: string,
  streamKey: string,
  hardwareAcc: HardwareAcceleration = 'VideoToolbox',
  bitrateKbps: number = 4500,
  settings?: AppSettings
): string[] {
  const fullRtmpPath = `${rtmpUrl}/${streamKey}`;
  const isCompatible = analyzePlaylistCompatibility(playlist).isCompatible;

  const args: string[] = [];
  const hwFlags = getHardwareEncoderFlags(hardwareAcc);

  // Loop the WHOLE playlist, so clip 1..N play in order and then start over.
  if (playlist.isInfiniteLoop) {
    args.push('-stream_loop', '-1');
  } else if (playlist.repeatCount > 1) {
    args.push('-stream_loop', (playlist.repeatCount - 1).toString());
  }

  // Always feed FFmpeg through the concat demuxer: one input regardless of
  // whether the playlist holds 3 clips or 1000. (Passing one -i per file would
  // blow past the open-file/argv limits and build an unusable filtergraph.)
  args.push(
    '-re',                      // pace at real time — required for live RTMP
    '-fflags', '+genpts',       // continuous timestamps across clip boundaries
    '-f', 'concat',
    '-safe', '0',
    '-i', 'playlist.txt'
  );

  if (isCompatible) {
    // Fast Mode: every clip already shares codec/res/fps → remux, no encoding.
    args.push('-c', 'copy');
  } else {
    // Smart Compatibility Mode: normalise every clip to one constant output
    // format. The filtergraph re-initialises automatically when the next clip
    // has a different resolution or pixel format, so mixed playlists keep playing.
    const resMap: Record<string, string> = {
      '720p': '1280:720',
      '1080p': '1920:1080',
      '1440p': '2560:1440',
      '4k': '3840:2160',
    };
    const targetRes = resMap[settings?.outputResolution || '1080p'] || '1920:1080';
    const [w, h] = targetRes.split(':');

    const targetFps =
      settings?.outputFps && settings.outputFps !== 'original'
        ? settings.outputFps
        : Math.round(playlist.videos[0]?.metadata?.fps || 30).toString();

    args.push(
      '-vf',
      `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,fps=${targetFps},format=yuv420p`,
      '-af',
      'aresample=async=1,aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo',
      ...hwFlags,
      '-b:v', `${bitrateKbps}k`,
      '-maxrate', `${bitrateKbps}k`,
      '-bufsize', `${bitrateKbps * 2}k`,
      '-g', `${Number(targetFps) * 2 || 60}`,
      '-keyint_min', `${Number(targetFps) * 2 || 60}`,
      '-c:a', 'aac',
      '-b:a', '128k',
      '-ar', '44100',
      '-ac', '2'
    );
  }

  args.push('-flvflags', 'no_duration_filesize', '-f', 'flv', fullRtmpPath);

  return args;
}

export function generateFFmpegCommand(
  playlist: Playlist,
  platform: StreamPlatform,
  rtmpUrl: string,
  streamKey: string,
  hardwareAcc: HardwareAcceleration = 'VideoToolbox',
  bitrateKbps: number = 4500,
  settings?: AppSettings
): string {
  const args = generateFFmpegArgs(playlist, platform, rtmpUrl, streamKey, hardwareAcc, bitrateKbps, settings);
  const ffmpegPath = settings?.ffmpegPath || 'ffmpeg';
  
  // Format args into a readable shell command
  const formattedArgs = args.map(arg => {
    if (arg.includes(' ') || arg.includes('[') || arg.includes(';')) {
      return `"${arg}"`; // Quote complex filters or paths
    }
    return arg;
  });

  return `"${ffmpegPath}" ${formattedArgs.join(' ')}`;
}

/** Absolute disk paths for every clip FFmpeg can actually open, in play order. */
export function getPlayableClipPaths(playlist: Playlist): string[] {
  return playlist.videos
    .map((v) => resolveLocalPath(v.localPath || v.filePath))
    .filter((p) => !!p && !p.startsWith('blob:') && !p.startsWith('data:'));
}

/**
 * Output profile every clip is normalised to in Compatibility Mode.
 * One profile for the whole stream is what lets clips of any codec, resolution
 * or sample rate play back to back without the RTMP session renegotiating.
 */
export function buildPlayoutConfig(
  playlist: Playlist,
  rtmpUrl: string,
  streamKey: string,
  hardwareAcc: HardwareAcceleration,
  bitrateKbps: number,
  settings?: AppSettings,
  instanceFps?: number
) {
  const resMap: Record<string, [number, number]> = {
    '720p': [1280, 720],
    '1080p': [1920, 1080],
    '1440p': [2560, 1440],
    '4k': [3840, 2160],
  };
  const [width, height] = resMap[settings?.outputResolution || '1080p'] || [1920, 1080];

  const fps =
    settings?.outputFps && settings.outputFps !== 'original'
      ? parseInt(settings.outputFps, 10)
      : Math.round(instanceFps || playlist.videos[0]?.metadata?.fps || 30);

  return {
    width,
    height,
    fps: fps > 0 ? fps : 30,
    bitrateKbps,
    hardwareAcc,
    rtmpTarget: `${rtmpUrl}/${streamKey}`,
    loopForever: playlist.isInfiniteLoop,
    repeatCount: Math.max(1, playlist.repeatCount || 1),
  };
}

export function generatePlaylistFileContent(playlist: Playlist): string {
  const lines: string[] = [
    `ffconcat version 1.0`,
    `# LiveStream Studio Generated Concat Playlist`,
    `# Playlist: ${playlist.name}`,
    `# Created: ${new Date().toISOString()}`,
    `# Mode: ${playlist.isInfiniteLoop ? 'Infinite Loop' : `Repeat ${playlist.repeatCount}x`}`,
    ``
  ];

  // Use localPath (real disk path) for FFmpeg. Skip in-memory blob/data URLs entirely.
  const validVideos = playlist.videos.filter((v) => {
    const effectivePath = v.localPath || v.filePath;
    return !!effectivePath && !effectivePath.startsWith('blob:') && !effectivePath.startsWith('data:');
  });

  if (validVideos.length === 0) {
    const debugPaths = playlist.videos.map(v => `local=${v.localPath || 'none'} file=${v.filePath?.substring(0, 30) || 'none'}`).join(' | ');
    return `# NO_LOCAL_FILES: ${debugPaths}`;
  }

  validVideos.forEach((video) => {
    const path = resolveLocalPath(video.localPath || video.filePath);

    // Prevent single quotes in file paths from breaking the concat demuxer format
    const escapedPath = path.replace(/'/g, "'\\''");
    lines.push(`file '${escapedPath}'`);
    // No `duration` directive: FFmpeg reads the true duration from each file.
    // A stale/estimated value here truncates or stalls the stream.
  });

  return lines.join('\n');
}

export function generateLiveStreamShellScript(
  playlist: Playlist,
  platform: StreamPlatform,
  rtmpUrl: string,
  streamKey: string,
  hardwareAcc: HardwareAcceleration = 'VideoToolbox',
  bitrateKbps: number = 4500
): string {
  const playlistTxt = generatePlaylistFileContent(playlist);
  const ffmpegCmd = generateFFmpegCommand(playlist, platform, rtmpUrl, streamKey, hardwareAcc, bitrateKbps);

  return `#!/bin/bash
# ====================================================================
# LiveStream Studio - One-Click FFmpeg Live Stream Launcher Script
# Playlist: ${playlist.name}
# Platform: ${platform.toUpperCase()}
# ====================================================================

echo "🚀 Launching LiveStream Studio Broadcast Engine..."
echo "📋 Creating playlist.txt..."

cat << 'EOF' > playlist.txt
${playlistTxt}
EOF

echo "✅ playlist.txt created successfully."
echo "🎥 Connecting to RTMP Server: ${rtmpUrl}..."
echo "Press Ctrl+C to stop streaming."
echo ""

# Auto-restart loop engine for 99.9% uptime
while true; do
  ${ffmpegCmd}
  echo "⚠️ FFmpeg process ended or disconnected. Restarting in 3 seconds..."
  sleep 3
done
`;
}

export function generateLiveStreamBatScript(
  playlist: Playlist,
  platform: StreamPlatform,
  rtmpUrl: string,
  streamKey: string,
  hardwareAcc: HardwareAcceleration = 'NVENC',
  bitrateKbps: number = 4500
): string {
  const playlistTxt = generatePlaylistFileContent(playlist);
  const fullRtmpPath = `${rtmpUrl}/${streamKey}`;

  let videoCodec = 'libx264';
  if (hardwareAcc === 'NVENC') videoCodec = 'h264_nvenc';
  if (hardwareAcc === 'QuickSync') videoCodec = 'h264_qsv';

  return `@echo off
TITLE LiveStream Studio - 24x7 Broadcast Launcher
echo ====================================================================
echo LiveStream Studio - One-Click FFmpeg Live Stream Launcher
echo Playlist: ${playlist.name}
echo Platform: ${platform}
echo ====================================================================

(
${playlistTxt}
) > playlist.txt

echo playlist.txt created successfully.
echo Starting 24x7 FFmpeg live stream loop...

:loop
ffmpeg -re -f concat -safe 0 -i playlist.txt -c:v ${videoCodec} -preset veryfast -b:v ${bitrateKbps}k -c:a aac -b:a 128k -f flv "${fullRtmpPath}"
echo Stream disconnected. Retrying in 3 seconds...
timeout /t 3
goto loop
`;
}

export function createFFmpegLogLine(streamId: string, streamName: string, type: 'status' | 'frame' | 'error' | 'reconnect', detail?: string): LogEntry {
  const now = new Date().toISOString().split('T')[1].slice(0, 8);
  let message = '';
  let level: LogEntry['level'] = 'INFO';

  if (type === 'frame') {
    const frame = Math.floor(Math.random() * 50000) + 1000;
    const fps = Math.floor(Math.random() * 4) + 58;
    const bitrate = (Math.random() * 400 + 4300).toFixed(1);
    const speed = (Math.random() * 0.05 + 0.98).toFixed(2);
    message = `frame=${frame} fps=${fps} q=24.0 size=${(frame * 24).toLocaleString()}kB time=${now} bitrate=${bitrate}kbits/s speed=${speed}x`;
    level = 'INFO';
  } else if (type === 'status') {
    message = detail || `Output #0, flv, to 'rtmp://live.youtube.com/...': Stream encoding active`;
    level = 'INFO';
  } else if (type === 'error') {
    message = detail || `[flv @ 0x7f8810204000] RTMP_ReadPacket, failed to read RTMP packet header: Connection reset by peer`;
    level = 'ERROR';
  } else if (type === 'reconnect') {
    message = detail || `Auto-Recovery Engine: Attempting reconnection (1/5) in 3s...`;
    level = 'WARN';
  }

  return {
    id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    streamId,
    streamName,
    timestamp: now,
    level,
    message,
  };
}
