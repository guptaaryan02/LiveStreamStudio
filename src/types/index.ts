export type VideoCategory = 'Krishna' | 'Shiv' | 'Hanuman' | 'Ram' | 'Meditation' | 'Bhajan' | 'Podcast' | 'Custom';

export interface VideoMetadata {
  video_codec: string;
  audio_codec: string;
  resolution: string;
  fps: number;
  pixel_format: string;
  audio_channels: number;
  sample_rate: number;
  bitrate_kbps: number;
  duration?: number; // seconds, straight from ffprobe
  /** Stream layout in container order, e.g. "v0,a1" or "a0,v1". */
  stream_layout?: string;
}

export interface VideoItem {
  id: string;
  title: string;
  category: VideoCategory;
  duration: number; // in seconds
  resolution: string;
  sizeMb: number;
  thumbnail: string;
  filePath: string;   // playable URL for the HTML5 <video> preview (asset:// or /api/files/preview)
  localPath?: string; // REAL absolute disk path (e.g. /Users/.../video.mp4) for FFmpeg streaming
  fps: number;
  metadata?: VideoMetadata;
  /** Cached uniform MPEG-TS rendition used for gapless concat streaming. */
  normalizedPath?: string;
  /** Output profile the rendition was built for, e.g. "1920x1080@30-4500k-VideoToolbox". */
  normalizedProfile?: string;
  streamReadyProfile?: {version:number;width:number;height:number;fps:number;bitrateKbps:number};
}

export type PlayOrder = 'ascending' | 'descending' | 'random';

export interface Playlist {
  id: string;
  name: string;
  videos: VideoItem[];
  repeatCount: number; // 1, 2, 3, 5, 10, 50, 100, -1 for infinite
  isInfiniteLoop: boolean;
  shuffle: boolean;
  order: PlayOrder;
  createdAt: string;
  updatedAt: string;
}

export type StreamPlatform = 'youtube' | 'facebook' | 'twitch' | 'custom';

export type StreamStatus = 'idle' | 'connecting' | 'live' | 'paused' | 'error' | 'reconnecting';

export type HardwareAcceleration = 'Auto' | 'VideoToolbox' | 'NVENC' | 'QuickSync' | 'Software';

export interface StreamMetrics {
  fps: number;
  bitrateKbps: number;
  droppedFrames: number;
  cpuPercent: number;
  memoryMb: number;
  uploadSpeedMbps: number;
  encodingSpeed?: number;
  connectionQuality: 'Excellent' | 'Good' | 'Fair' | 'Poor';
}

export interface StreamInstance {
  id: string;
  name: string;
  playlistId: string;
  platform: StreamPlatform;
  rtmpUrl: string;
  streamKey: string;
  status: StreamStatus;
  retryCount?: number;
  currentVideoIndex: number;
  currentVideoElapsed: number; // seconds
  currentRepeatCount: number;
  metrics: StreamMetrics;
  hardwareAcc: HardwareAcceleration;
  fps: number;
  targetBitrate: number;
  retryAttempts: number;
  maxRetries: number;
  startTime?: string;
  scheduledStopTime?: string;
  playbackLoopLimit?: number; // total complete playlist passes for this run
  lastFailure?: string;
  lastStopReason?: string;
  stoppedAt?: string;
  scheduleId?: string;
  uptimeSeconds: number;
  /** Seconds of encoded video queued for upload (playout engine only). */
  bufferSeconds?: number;
  pipelineId?: string;
  sharedDestinations?: number;
  outputMode?: 'copy'|'encode';
  analyticsLastSampleAt?: number;
  lastOutputAt?: number;
  analyticsStarted?: boolean;
  analyticsRecovering?: boolean;
  stopping?: boolean;
  slowOutputSince?: number;
}

export interface StreamProfile {
  keyStorage?: 'session' | 'keychain'; // undefined: older profile, load only on request
  id: string;
  name: string;
  playlistId: string;
  platform: StreamPlatform;
  rtmpUrl: string;
  streamKey: string;
  repeatCount: number;
  isInfiniteLoop: boolean;
  hardwareAcc: HardwareAcceleration;
  targetBitrateKbps: number;
  resolution: string;
  fps: number;
}

export interface ScheduleItem {
  createdAt?: string;
  id: string;
  title: string;
  profileId: string;
  profileName: string;
  scheduledAt?: string; // ISO timestamp for a one-time launch
  scheduledTime: string; // local HH:mm or legacy HH:mm AM/PM
  repeatDays: string[]; // ['Mon', 'Wed', 'Fri'] or ['Daily']
  autoStart: boolean;
  autoStop: boolean;
  stopAfterMinutes?: number;
  stopMode?: 'time' | 'loops'; // absent on older schedules means time
  stopAfterLoops?: number;
  isActive: boolean;
  lastRunDate?: string;
}

export type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'COMMAND';

export interface CompatibilityAnalysis {
  isCompatible: boolean;
  score: number;
  differences: string[];
}

export interface LogEntry {
  id: string;
  streamId: string;
  streamName: string;
  timestamp: string;
  level: LogLevel;
  message: string;
}

export type OutputResolution = 'original' | '720p' | '1080p' | '1440p' | '4k';
export type OutputFps = 'original' | '24' | '25' | '30' | '50' | '60';

export interface AppSettings {
  theme: 'dark' | 'light' | 'system';
  ffmpegPath: string;
  useCustomFfmpeg: boolean;
  hardwareAcc: HardwareAcceleration;
  defaultBitrateKbps: number;
  /** Opt-in remux: retains source bitrate instead of the configured target. */
  useSourceBitrate?: boolean;
  autoRecoveryEnabled: boolean;
  outputResolution?: OutputResolution;
  outputFps?: OutputFps;
  retryIntervalSeconds: number;
  maxRetryCount: number;
  desktopNotifications: boolean;
  sharedEncodingEnabled?: boolean;
  pausePreviewByDefault?: boolean;
}

export interface StreamAnalyticsSummary {
  version: number;
  totalLiveSeconds: number;
  totalObservedSeconds: number;
  bitrateKbpsSeconds: number;
  dailySeconds: Record<string, number>;
  totalStreamsRun: number;
  totalHoursStreamed: number;
  averageBitrateKbps: number;
  successfulReconnections: number;
  totalVideosStreamed: number;
  streamStabilityPercent: number;
}
