import { editedSchedule } from '../services/schedule';
import { outputHealth } from '../services/streamHealth';
import { profilesWithoutKeys } from '../services/profileCredentials';
import { appendLogs, retainDiagnostics } from '../services/diagnostics';
import { emptyAnalytics, restoreAnalytics, sampleActivity } from '../services/analytics';
import { isScheduleDue, scheduleRunToken, isValidLoopCount } from '../services/schedule';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  VideoItem,
  Playlist,
  StreamInstance,
  StreamProfile,
  ScheduleItem,
  LogEntry,
  AppSettings,
  StreamPlatform,
  HardwareAcceleration,
  StreamAnalyticsSummary,
  StreamMetrics,
} from '../types';
import { SAMPLE_VIDEOS, INITIAL_PLAYLISTS, INITIAL_PROFILES, INITIAL_SCHEDULE } from '../mockData/videos';
import {
  createFFmpegLogLine,
  generateSafeFFmpegCommand,
  generateFFmpegArgs,
  generatePlaylistFileContent,
  analyzePlaylistCompatibility,
  usePassthrough,
  getPlayableClipPaths,
  buildPlayoutConfig,
  playlistForInstance,
  sanitizeLogMessage,
} from '../services/ffmpegEngine';
import {
  startTauriFFmpegStream,
  stopTauriFFmpegStream,
  startTauriPlayoutStream,
  isTauriEnvironment,
  getProcessTelemetry,
  getFFmpegInfo,
  saveProfileStreamKey,
  getProfileStreamKey,
  deleteProfileStreamKey,
  PlayoutConfig,
} from '../services/tauriEngine';
import { isBrokenVideo } from '../services/videoImport';

export type NavigationTab =
  | 'dashboard'
  | 'multistream'
  | 'playlist'
  | 'library'
  | 'scheduler'
  | 'profiles'
  | 'logs'
  | 'analytics'
  | 'settings';

interface StudioState {
  activeTab: NavigationTab;
  setActiveTab: (tab: NavigationTab) => void;
  debugStatus: string;

  // Video Library
  videos: VideoItem[];
  addVideo: (video: VideoItem) => void;
  removeVideo: (videoId: string) => void;

  // Playlists
  playlists: Playlist[];
  activePlaylistId: string | null;
  setActivePlaylistId: (id: string | null) => void;
  createPlaylist: (name: string, videoIds?: string[]) => Playlist;
  updatePlaylist: (id: string, updates: Partial<Playlist>) => void;
  deletePlaylist: (id: string) => void;
  reorderPlaylistVideos: (playlistId: string, startIndex: number, endIndex: number) => void;
  addVideoToPlaylist: (playlistId: string, videoId: string) => void;
  removeVideoFromPlaylist: (playlistId: string, videoIndex: number) => void;

  // Stream Instances (Multi-stream)
  instances: StreamInstance[];
  activeInstanceId: string | null;
  setActiveInstanceId: (id: string | null) => void;
  createStreamInstance: (
    name: string,
    playlistId: string,
    platform: StreamPlatform,
    rtmpUrl: string,
    streamKey: string,
    hardwareAcc?: HardwareAcceleration,
    fps?: number,
    targetBitrate?: number
  ) => StreamInstance;
  editStreamInstance: (id: string, changes: Pick<StreamInstance, 'name' | 'playlistId' | 'platform' | 'rtmpUrl' | 'streamKey' | 'hardwareAcc' | 'fps' | 'targetBitrate'>) => boolean;
  startStream: (instanceId: string) => Promise<void>;
  stopStream: (instanceId: string) => Promise<void>;
  startAllStreams: () => Promise<void>;
  stopAllStreams: () => Promise<void>;
  handleStreamExit: (instanceId: string, success?: boolean) => void;
  pauseStream: (instanceId: string) => void;
  resumeStream: (instanceId: string) => void;
  deleteStreamInstance: (instanceId: string) => void;
  simulateNetworkDrop: (instanceId: string) => void;

  // Stream Profiles
  profiles: StreamProfile[];
  saveProfile: (profile: Omit<StreamProfile, 'id'>) => StreamProfile;
  rememberProfileKey: (id: string) => Promise<boolean>;
  loadProfileKey: (id: string) => Promise<boolean>;
  removeSavedProfileKey: (id: string) => Promise<boolean>;
  setProfileSessionKey: (id: string, key: string) => void;
  deleteProfile: (id: string) => void;
  launchProfile: (profileId: string) => Promise<boolean>;

  // Schedules
  schedules: ScheduleItem[];
  addSchedule: (item: Omit<ScheduleItem, 'id'>) => void;
  updateSchedule: (id: string, changes: Omit<ScheduleItem, 'id' | 'createdAt' | 'lastRunDate'>) => void;
  toggleSchedule: (id: string) => void;
  deleteSchedule: (id: string) => void;
  
  // Update Metrics
  updateInstanceMetrics: (instanceId: string, metrics: Partial<StreamMetrics>) => void;

  // Real-time Logs
  logs: LogEntry[];
  diagnosticLogs: LogEntry[];
  addLog: (log: LogEntry) => void;
  clearLogs: () => void;
  settings: AppSettings;
  updateSettings: (newSettings: Partial<AppSettings>) => void;

  // Recorded output only. Older seeded demo statistics are discarded on load.
  analytics: StreamAnalyticsSummary;

  // Telemetry Engine Ticker
  tickTelemetry: () => void;
  checkSchedules: () => void;
}

let scheduleCheckInFlight = false;
const missingScheduleKeyNotices = new Set<string>();

/** Browser build: the dev server runs the same playout pipeline in Node. */
const startWebPlayoutStream = async (params: {
  streamId: string;
  clips: string[];
  config: PlayoutConfig;
}): Promise<{ success: boolean; error?: string }> => {
  try {
    const res = await fetch('/api/ffmpeg/playout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok || payload.success === false) {
      return { success: false, error: payload.error || `HTTP ${res.status}` };
    }
    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
};

const stopBackendStream = async (instanceId: string): Promise<void> => {
  if (isTauriEnvironment()) {
    if (!await stopTauriFFmpegStream(instanceId)) throw new Error('The stream process could not be stopped');
  } else {
    const response = await fetch('/api/ffmpeg/stop', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ streamId: instanceId }),
    });
    if (!response.ok) throw new Error(`Could not stop stream (HTTP ${response.status})`);
  }
};

const createId = (prefix: string): string =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/** Flips an instance to LIVE and seeds its log tail. Shared by both engines. */
const markInstanceLive = (
  set: (updater: (state: StudioState) => Partial<StudioState>) => void,
  instanceId: string,
  inst: StreamInstance,
  cmd: string,
  settings: AppSettings
) => {
  const initLogs: LogEntry[] = [
    {
      id: `log-cmd-${Date.now()}`,
      streamId: inst.id,
      streamName: inst.name,
      timestamp: new Date().toISOString().split('T')[1].slice(0, 8),
      level: 'COMMAND',
      message: `$ ${cmd}`,
    },
    createFFmpegLogLine(inst.id, inst.name, 'status', `Native Host FFmpeg Process Spawning...`),
    createFFmpegLogLine(inst.id, inst.name, 'status', `RTMP Stream Target: ${inst.rtmpUrl}`),
  ];

  set((state) => ({
    debugStatus: isTauriEnvironment() ? 'Encoder connecting — confirm the platform preview before publishing.' : 'Stream is live',
    instances: state.instances.map((i) =>
      i.id === instanceId
        ? {
            ...i,
            status: isTauriEnvironment() ? 'connecting' as const : 'live' as const,
            startTime: new Date().toISOString(),
            analyticsLastSampleAt: Date.now(),
            analyticsStarted: inst.status==='reconnecting' ? i.analyticsStarted : false,
            analyticsRecovering: inst.status==='reconnecting' ? i.analyticsRecovering : false,
            lastOutputAt: undefined,
            stopping: false,
            uptimeSeconds: 0,
            lastFailure: inst.status === 'reconnecting' ? i.lastFailure : undefined,
            lastStopReason: undefined,
            stoppedAt: undefined,
            metrics: {
              fps: 0,
              bitrateKbps: 0,
              droppedFrames: 0,
              cpuPercent: 0,
              memoryMb: 0,
              uploadSpeedMbps: 0,
              connectionQuality: 'Excellent' as const,
            },
          }
        : i
    ),
    ...appendLogs(state, initLogs),

  }));
};

export const useStudioStore = create<StudioState>()(
  persist(
    (set, get) => ({
      activeTab: 'dashboard',
      setActiveTab: (tab) => set({ activeTab: tab }),
      debugStatus: '',

      // Videos
  videos: SAMPLE_VIDEOS,
  addVideo: (video) => {
    // Guard the library: an entry without a real disk path can never be streamed.
    if (isBrokenVideo(video)) {
      console.error('[Studio] Refused to add video without a real disk path:', video.title, video.filePath);
      set({ debugStatus: `[FAIL] "${video.title}" has no real file path on disk and was not added.` });
      return;
    }
    set((state) => ({ videos: [video, ...state.videos] }));
  },
  removeVideo: (videoId) => set((state) => ({ videos: state.videos.filter((v) => v.id !== videoId) })),

  // Playlists
  playlists: INITIAL_PLAYLISTS,
  activePlaylistId: INITIAL_PLAYLISTS[0].id,
  setActivePlaylistId: (id) => set({ activePlaylistId: id }),
  createPlaylist: (name, videoIds = []) => {
    const { videos } = get();
    const playlistVideos = videoIds.map((id) => videos.find((v) => v.id === id)).filter(Boolean) as VideoItem[];
    const newPlaylist: Playlist = {
      id: createId('pl'),
      name,
      videos: playlistVideos,
      repeatCount: -1,
      isInfiniteLoop: true,
      shuffle: false,
      order: 'ascending',
      createdAt: new Date().toISOString().replace('T', ' ').slice(0, 16),
      updatedAt: new Date().toISOString().replace('T', ' ').slice(0, 16),
    };
    set((state) => ({
      playlists: [newPlaylist, ...state.playlists],
      activePlaylistId: newPlaylist.id,
    }));
    return newPlaylist;
  },

  updatePlaylist: (id, updates) =>
    set((state) => ({
      playlists: state.playlists.map((pl) => {
        if (pl.id !== id) return pl;

        let updatedVideos = [...pl.videos];

        // Handle Real Play Order Re-sorting
        if (updates.order && updates.order !== pl.order) {
          if (updates.order === 'descending') {
            updatedVideos.reverse();
          } else if (updates.order === 'random') {
            updatedVideos.sort(() => Math.random() - 0.5);
          } else if (updates.order === 'ascending') {
            // Restore original ID numerical/alphabetical sequence
            updatedVideos.sort((a, b) => a.title.localeCompare(b.title));
          }
        }

        // Handle Shuffle toggle
        if (updates.shuffle !== undefined && updates.shuffle !== pl.shuffle) {
          if (updates.shuffle) {
            updatedVideos.sort(() => Math.random() - 0.5);
          }
        }

        return {
          ...pl,
          ...updates,
          videos: updatedVideos,
          updatedAt: new Date().toISOString().slice(0, 16),
        };
      }),
    })),

  deletePlaylist: (id) =>
    set((state) => ({
      playlists: state.playlists.filter((pl) => pl.id !== id),
      activePlaylistId: state.activePlaylistId === id ? state.playlists.find((pl) => pl.id !== id)?.id || null : state.activePlaylistId,
    })),

  reorderPlaylistVideos: (playlistId, startIndex, endIndex) =>
    set((state) => ({
      playlists: state.playlists.map((pl) => {
        if (pl.id !== playlistId) return pl;
        const newVideos = Array.from(pl.videos);
        const [removed] = newVideos.splice(startIndex, 1);
        newVideos.splice(endIndex, 0, removed);
        return { ...pl, videos: newVideos };
      }),
    })),

  addVideoToPlaylist: (playlistId, videoId) =>
    set((state) => {
      const video = state.videos.find((v) => v.id === videoId);
      if (!video) return state;
      return {
        playlists: state.playlists.map((pl) => {
          if (pl.id !== playlistId) return pl;
          return { ...pl, videos: [...pl.videos, video] };
        }),
      };
    }),

  removeVideoFromPlaylist: (playlistId, videoIndex) =>
    set((state) => ({
      playlists: state.playlists.map((pl) => {
        if (pl.id !== playlistId) return pl;
        const newVideos = [...pl.videos];
        newVideos.splice(videoIndex, 1);
        return { ...pl, videos: newVideos };
      }),
    })),

  // Stream Instances
  instances: [
    {
      id: 'inst-1',
      name: 'Primary 24/7 Krishna Stream',
      playlistId: 'pl-1',
      platform: 'youtube',
      rtmpUrl: 'rtmp://a.rtmp.youtube.com/live2',
      streamKey: '', // Clean empty string requiring user key input
      status: 'idle',
      currentVideoIndex: 0,
      currentVideoElapsed: 0,
      currentRepeatCount: 1,
      hardwareAcc: 'Auto',
      fps: 30,
      targetBitrate: 4500,
      retryAttempts: 0,
      maxRetries: 5,
      startTime: undefined,
      uptimeSeconds: 0,
      metrics: {
        fps: 0,
        bitrateKbps: 0,
        droppedFrames: 0,
        cpuPercent: 0,
        memoryMb: 0,
        uploadSpeedMbps: 0,
        connectionQuality: 'Excellent',
      },
    },
  ],
  activeInstanceId: 'inst-1',
  setActiveInstanceId: (id) => set({ activeInstanceId: id }),

  createStreamInstance: (name, playlistId, platform, rtmpUrl, streamKey, hardwareAcc, fps = 30, targetBitrate = 4500) => {
    const { settings } = get();
    const newInstance: StreamInstance = {
      id: createId('inst'),
      name,
      playlistId,
      platform,
      rtmpUrl,
      streamKey,
      status: 'idle',
      currentVideoIndex: 0,
      currentVideoElapsed: 0,
      currentRepeatCount: 1,
      hardwareAcc: hardwareAcc || settings.hardwareAcc,
      fps,
      targetBitrate,
      retryAttempts: 0,
      maxRetries: settings.maxRetryCount,
      uptimeSeconds: 0,
      metrics: {
        fps: 0,
        bitrateKbps: 0,
        droppedFrames: 0,
        cpuPercent: 0,
        memoryMb: 0,
        uploadSpeedMbps: 0,
        connectionQuality: 'Excellent',
      },
    };
    set((state) => ({
      instances: [...state.instances, newInstance],
      activeInstanceId: newInstance.id,
    }));
    return newInstance;
  },

  editStreamInstance: (id, changes) => {
    const current = get().instances.find((item) => item.id === id);
    if (!current || !['idle', 'error'].includes(current.status) || !changes.name.trim() || !changes.streamKey.trim() || !get().playlists.some((p) => p.id === changes.playlistId)) return false;
    set((state) => ({ instances: state.instances.map((item) => item.id === id ? { ...item, ...changes, name: changes.name.trim(), streamKey: changes.streamKey.trim() } : item) }));
    return true;
  },
  startStream: async (instanceId) => {
    set({ debugStatus: 'Analyzing playlist...' });
    const { instances, playlists, settings } = get();
    const inst = instances.find((i) => i.id === instanceId);
    if (!inst) {
      set({ debugStatus: `[FAIL] Instance ${instanceId} not found` });
      return;
    }

    if (inst.status === 'live' || inst.status === 'connecting') {
      set({ debugStatus: `${inst.name} is already ${inst.status}.` });
      return;
    }

    const duplicate = instances.find((i) => i.id !== instanceId &&
      ['live', 'connecting', 'reconnecting'].includes(i.status) &&
      i.rtmpUrl.replace(/\/+$/, '') === inst.rtmpUrl.replace(/\/+$/, '') &&
      i.streamKey.trim() === inst.streamKey.trim());
    if (duplicate) {
      set({ debugStatus: `[FAIL] This destination is already used by ${duplicate.name}. Use a different stream key for each simultaneous broadcast.` });
      return;
    }

    if (!inst.streamKey.trim()) {
      const message = 'Stream key is required before going live.';
      const errLog = createFFmpegLogLine(inst.id, inst.name, 'error', message);
      set((state) => ({
        debugStatus: `[FAIL] ${message}`,
        instances: state.instances.map((i) => (i.id === instanceId ? { ...i, status: 'error' as const, stopping:false } : i)),
        ...appendLogs(state, [errLog]),
      }));
      return;
    }

    set((state) => ({
      instances: state.instances.map((i) =>
        i.id === instanceId ? { ...i, status: 'connecting' as const } : i
      ),
    }));

    const sourcePlaylist = playlists.find((p) => p.id === inst.playlistId);
    if (!sourcePlaylist) {
      set((state) => ({
        debugStatus: `[FAIL] Playlist ${inst.playlistId} not found`,
        instances: state.instances.map((i) => (i.id === instanceId ? { ...i, status: 'error' as const, stopping:false } : i)),
      }));
      return;
    }

    const playlist = playlistForInstance(sourcePlaylist, inst);

    const cmd = generateSafeFFmpegCommand(playlist, inst.platform, inst.rtmpUrl, inst.streamKey, inst.hardwareAcc, inst.targetBitrate || 4500, settings, inst.fps);

    try {
      if (isTauriEnvironment()) {
        const ffmpegInfo = await getFFmpegInfo(settings.useCustomFfmpeg ? settings.ffmpegPath : undefined);
        if (!ffmpegInfo?.available) {
          const message = `FFmpeg is not available (${ffmpegInfo?.path || 'not found'}). Add bundled FFmpeg or choose a custom binary in Settings.`;
          const errLog = createFFmpegLogLine(inst.id, inst.name, 'error', message);
          set((state) => ({
            debugStatus: `[FAIL] ${message}`,
            instances: state.instances.map((i) => (i.id === instanceId ? { ...i, status: 'error' as const, stopping:false } : i)),
            ...appendLogs(state, [errLog]),
          }));
          return;
        }
      }

      const playlistTxt = generatePlaylistFileContent(playlist);

      if (playlistTxt.startsWith('# NO_LOCAL_FILES')) {
        const message =
          'None of the videos in this playlist have a real file path on disk, so FFmpeg has nothing to stream. ' +
          'Re-add them with "+ Add Video Files" (native picker) — files dropped as browser blobs cannot be streamed.';
        const errLog = createFFmpegLogLine(inst.id, inst.name, 'error', message);
        set((state) => ({
          debugStatus: `[FAIL] ${message}`,
          instances: state.instances.map((i) => (i.id === instanceId ? { ...i, status: 'error' } : i)),
          ...appendLogs(state, [errLog]),
        }));
        return;
      }

      // Mode selection (Module 15). Identical clips stream as a pure remux;
      // anything mixed goes through the playout engine, which normalises each
      // clip on the fly so a codec/resolution change can't kill the stream.
      const analysis = analyzePlaylistCompatibility(playlist);
      const passthrough = usePassthrough(playlist, settings, inst.targetBitrate || settings.defaultBitrateKbps || 4500, inst.fps);
      const hardwareAcc = inst.hardwareAcc || settings.hardwareAcc;
      const bitrate = inst.targetBitrate || settings.defaultBitrateKbps || 4500;
      set((state)=>({instances:state.instances.map((i)=>i.id===instanceId ? {...i,outputMode:passthrough ? 'copy' as const : 'encode' as const} : i)}));
      const clips = getPlayableClipPaths(playlist);
      set({
        debugStatus: passthrough
          ? 'Playlist analyzed. Fast Mode selected. Going Live...'
          : 'Preparing constant-bitrate output... Going Live...',
      });

      const modeLog = createFFmpegLogLine(
        inst.id,
        inst.name,
        'status',
        passthrough
          ? `Source passthrough selected for ${clips.length} clip(s): output bitrate follows the source file`
          : `Constant-bitrate output: ${bitrate} Kbps with ${hardwareAcc}` +
            (analysis.differences.length ? ` (differences: ${analysis.differences.slice(0, 4).join(', ')})` : '')
      );
      set((state) => ({ ...appendLogs(state, [modeLog]) }));

      if (!passthrough) {
        const config = buildPlayoutConfig(
          playlist,
          inst.rtmpUrl,
          inst.streamKey,
          hardwareAcc,
          bitrate,
          settings,
          inst.fps
        );

        const result = isTauriEnvironment()
          ? await startTauriPlayoutStream({ streamId: inst.id, clips, config, sharePipeline: settings.sharedEncodingEnabled!==false && !inst.playbackLoopLimit })
          : await startWebPlayoutStream({ streamId: inst.id, clips, config });

        if (!result.success) {
          const errLog = createFFmpegLogLine(inst.id, inst.name, 'error', `Stream failed to start: ${result.error}`);
          set((state) => ({
            debugStatus: `[FAIL] ${result.error}`,
            instances: state.instances.map((i) => (i.id === instanceId ? { ...i, status: 'error' } : i)),
            ...appendLogs(state, [errLog]),
          }));
          return;
        }

        if (!['connecting', 'live'].includes(get().instances.find((i) => i.id === instanceId)?.status || '')) {
          await stopBackendStream(instanceId);
          return;
        }
        markInstanceLive(set, instanceId, inst, cmd, settings);
        return;
      }

      const args = generateFFmpegArgs(
        playlist,
        inst.platform || 'youtube',
        inst.rtmpUrl,
        inst.streamKey,
        hardwareAcc,
        bitrate,
        settings,
        inst.fps
      );

      if (isTauriEnvironment()) {
        const result = await startTauriFFmpegStream({
          streamId: inst.id,
          args: args,
          playlistContent: playlistTxt,
          ffmpegPath: settings.useCustomFfmpeg ? settings.ffmpegPath : undefined,
        });
        if (!result.success) {
          const errLog = createFFmpegLogLine(inst.id, inst.name, 'error', `FFmpeg launch failed: ${result.error}`);
          set((state) => ({
            debugStatus: `[FAIL] FFmpeg launch failed: ${result.error}`,
            instances: state.instances.map((i) =>
              i.id === instanceId ? { ...i, status: 'error' } : i
            ),
            ...appendLogs(state, [errLog])
          }));
          return;
        }
      } else {
        const res = await fetch('/api/ffmpeg/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            streamId: inst.id,
            args: args,
            playlistContent: playlistTxt,
            ffmpegPath: settings.useCustomFfmpeg ? settings.ffmpegPath : undefined,
          })
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok || payload.error || payload.success === false) {
          const reason = payload.error || `HTTP ${res.status}`;
          const errLog = createFFmpegLogLine(inst.id, inst.name, 'error', `FFmpeg launch failed: ${reason}`);
          set((state) => ({
            debugStatus: `[FAIL] FFmpeg launch failed: ${reason}`,
            instances: state.instances.map((i) => (i.id === instanceId ? { ...i, status: 'error' } : i)),
            ...appendLogs(state, [errLog]),
          }));
          return;
        }
      }
    } catch (e) {
      const errLog = createFFmpegLogLine(inst.id, inst.name, 'error', `Launch exception: ${String(e)}`);
      set((state) => ({
        debugStatus: `[FAIL] Exception: ${String(e)}`,
        instances: state.instances.map((i) =>
          i.id === instanceId ? { ...i, status: 'error' } : i
        ),
        ...appendLogs(state, [errLog])
      }));
      return;
    }

    if (!['connecting', 'live'].includes(get().instances.find((i) => i.id === instanceId)?.status || '')) {
      await stopBackendStream(instanceId);
      return;
    }
    markInstanceLive(set, instanceId, inst, cmd, settings);
  },

  startAllStreams: async () => {
    const ids = get().instances.filter((i) => ['idle', 'error'].includes(i.status)).map((i) => i.id);
    await Promise.all(ids.map((id) => get().startStream(id)));
  },

  stopAllStreams: async () => {
    const ids = get().instances.filter((i) => ['live', 'connecting', 'reconnecting', 'paused'].includes(i.status)).map((i) => i.id);
    await Promise.all(ids.map((id) => get().stopStream(id)));
  },

  stopStream: async (instanceId) => {
    const { instances } = get();
    const inst = instances.find((i) => i.id === instanceId);
    if (!inst) return;

    // Mark stopped before IPC: its exit event must not schedule recovery.
    set((state) => ({ instances: state.instances.map((i) =>
      i.id === instanceId ? { ...i, status: 'idle' as const, stopping:true, scheduledStopTime: undefined } : i
    ) }));
    try {
      await stopBackendStream(instanceId);
    } catch (error) {
      set((state) => ({ instances: state.instances.map((i) => i.id === instanceId ? { ...i, status: 'error' as const, stopping:false } : i),
        ...appendLogs(state, [createFFmpegLogLine(inst.id, inst.name, 'error', `Stop failed: ${String(error)}`)]) }));
      return;
    }

    const stopLog = createFFmpegLogLine(inst.id, inst.name, 'status', `Stream stopped. SIGTERM sent to native FFmpeg process.`);

    set((state) => ({
      instances: state.instances.map((i) =>
        i.id === instanceId
          ? {
              ...i,
              status: 'idle',
              stopping:false,
              stoppedAt:new Date().toISOString(),
              lastStopReason:inst.scheduledStopTime && Date.now() >= Date.parse(inst.scheduledStopTime) ? 'Scheduled time limit reached.' : 'Stopped by user.',
              uptimeSeconds: 0,
              metrics: { fps: 0, bitrateKbps: 0, droppedFrames: 0, cpuPercent: 0, memoryMb: 0, uploadSpeedMbps: 0, connectionQuality: 'Excellent' },
            }
          : i
      ),
      ...appendLogs(state, [stopLog]),
    }));
  },

  handleStreamExit: (instanceId, success = false) => {
    const { instances, settings, startStream } = get();
    const inst = instances.find(i => i.id === instanceId);
    if (!inst) return;

    // Only a stream that was actually LIVE can start recovering. Anything else
    // (idle = stopped by the user, reconnecting = a retry is already pending,
    // error = already given up) must be ignored, so duplicate exit events can
    // never schedule two recoveries for the same disconnect.
    if (inst.status !== 'live' && inst.status !== 'connecting') return;
    if (inst.stopping) return;

    const source = get().playlists.find((p) => p.id === inst.playlistId);
    const finite = !!inst.playbackLoopLimit || (!!source && !source.isInfiniteLoop);
    if (success && finite) {
      const loops = inst.playbackLoopLimit || source?.repeatCount || 1;
      const reason = `Completed ${loops} complete playlist loop(s).`;
      set((state) => ({instances:state.instances.map((i) => i.id === instanceId ? {...i,status:'idle' as const,scheduledStopTime:undefined,stoppedAt:new Date().toISOString(),lastStopReason:reason} : i),
        ...appendLogs(state,[createFFmpegLogLine(inst.id,inst.name,'status',reason)])}));
      return;
    }
    const evidence = get().diagnosticLogs.filter((l) => l.streamId === instanceId && l.level === 'ERROR').slice(0,3).map((l) => l.message).join(' | ');
    const failure = sanitizeLogMessage(evidence || (success ? 'Encoder ended unexpectedly during an infinite stream.' : 'Sender exited unexpectedly; no error details were reported.')).slice(0,1200);

    const giveUp = (reason: string) => {
      const logLine = createFFmpegLogLine(inst.id, inst.name, 'error', reason);
      set(state => ({
        instances: state.instances.map(i =>
            i.id === instanceId ? { ...i, status: 'error' as const, lastFailure:failure, lastStopReason:reason, stoppedAt:new Date().toISOString() } : i
        ),
        ...appendLogs(state, [logLine]),
      }));
    };

    // A process that died almost immediately never connected — retrying just
    // hammers the RTMP server with the same bad URL or stream key.
    const ranForMs = inst.startTime ? Date.now() - new Date(inst.startTime).getTime() : 0;
    if (ranForMs > 0 && ranForMs < 5000 && !inst.analyticsStarted) {
      giveUp('Stream ended immediately — FFmpeg could not open the RTMP output. Check the stream key and RTMP URL, then start again. Not retrying.');
      return;
    }

    if (!settings.autoRecoveryEnabled) {
      giveUp('Stream disconnected. Auto-recovery is turned off in Engine Settings.');
      return;
    }

    const currentRetry = inst.retryCount || 0;
    const maxRetries = inst.maxRetries ?? settings.maxRetryCount ?? 5;
    if (currentRetry >= maxRetries) {
      giveUp(`Stream disconnected. Gave up after ${currentRetry} recovery attempt(s) — check the network and the stream key, then start again.`);
      return;
    }

    // A dropped socket on a working connection comes back immediately, so the
    // first attempt is near-instant; only repeated failures back off, which is
    // what stops a genuinely broken endpoint from being hammered.
    const waitTime = Math.min(60000, Math.max(1, settings.retryIntervalSeconds || 5) * 1000 * Math.pow(2, currentRetry));

    const logLine = createFFmpegLogLine(
      inst.id,
      inst.name,
      'error',
      `Stream disconnected. Auto-recovering in ${waitTime / 1000}s (retry ${currentRetry + 1} of ${maxRetries})...`
    );

    set(state => ({
      instances: state.instances.map(i =>
        i.id === instanceId ? { ...i, status: 'reconnecting' as const, lastFailure:failure, analyticsRecovering:true, analyticsLastSampleAt:Date.now(), retryCount: currentRetry + 1 } : i
      ),
      ...appendLogs(state, [logLine])
    }));

    setTimeout(() => {
      // Double check it's still in reconnecting state (user didn't manually stop it)
      const currentInst = get().instances.find(i => i.id === instanceId);
      if (currentInst && currentInst.status === 'reconnecting') {
         startStream(instanceId);
      }
    }, waitTime);
  },

  pauseStream: (instanceId) =>
    set((state) => ({
      instances: state.instances.map((i) => (i.id === instanceId ? { ...i, status: 'paused' } : i)),
    })),

  resumeStream: (instanceId) =>
    set((state) => ({
      instances: state.instances.map((i) => (i.id === instanceId ? { ...i, status: 'live' } : i)),
    })),

  deleteStreamInstance: async (instanceId) => {
    await get().stopStream(instanceId);
    if (get().instances.find((i) => i.id === instanceId)?.status === 'error') return;
    set((state) => ({
      instances: state.instances.filter((i) => i.id !== instanceId),
      activeInstanceId: state.activeInstanceId === instanceId ? null : state.activeInstanceId,
    }));
  },

  updateInstanceMetrics: (instanceId, metrics) =>
    set((state) => {
      let analytics=restoreAnalytics(state.analytics);
      const now=Date.now();
      return {instances:state.instances.map((i)=>{
        if(i.id!==instanceId || !['connecting','live','reconnecting'].includes(i.status)) return i;
        const output=(metrics.fps || 0)>0 && (metrics.bitrateKbps || 0)>0;
        const goingLive=i.status==='connecting' && output;
        if(goingLive && !i.analyticsStarted) analytics={...analytics,totalStreamsRun:analytics.totalStreamsRun+1};
        if(goingLive && i.analyticsRecovering) analytics={...analytics,successfulReconnections:analytics.successfulReconnections+1};
        const combined={...i.metrics,...metrics};
        if(metrics.fps!==undefined || metrics.bitrateKbps!==undefined || metrics.droppedFrames!==undefined) combined.connectionQuality=outputHealth(combined,i.fps || 30);
        const slowSince=metrics.fps===undefined ? i.slowOutputSince : combined.fps<(i.fps || 30)*.8 ? (i.slowOutputSince ?? now) : undefined;
        return {...i,slowOutputSince:slowSince,status:goingLive ? 'live' as const : i.status,metrics:combined,
          analyticsStarted:i.analyticsStarted || goingLive,analyticsRecovering:goingLive ? false : i.analyticsRecovering,
          analyticsLastSampleAt:goingLive ? now : i.analyticsLastSampleAt,lastOutputAt:output ? now : i.lastOutputAt};
      }),analytics};
    }),

  simulateNetworkDrop: (instanceId) => {
    const inst = get().instances.find((i) => i.id === instanceId);
    if (!inst || inst.status !== 'live') return;
    // Exercise the actual sender and normal recovery path, rather than painting
    // a successful reconnection over an uninterrupted process.
    void get().stopStream(instanceId).then(() => {
      const current=get().instances.find((i)=>i.id===instanceId);
      if(!current || current.status !== 'idle') return;
      set((state)=>({instances:state.instances.map((i)=>i.id===instanceId ? {...i,status:'live' as const,startTime:new Date(Date.now()-6000).toISOString()} : i)}));
      get().handleStreamExit(instanceId);
    });
  },

  // Profiles
  profiles: INITIAL_PROFILES,
  saveProfile: (prof) => {
    const id = `prof-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const newProfile: StreamProfile = {
      ...prof,
      id,
      streamKey: prof.streamKey,
      keyStorage: 'session',
    };
    set((state) => ({ profiles: [...state.profiles, newProfile] }));
    return newProfile;
  },
  // Credential operations are explicit UI actions preceded by an explanation.
  rememberProfileKey: async (id) => {
    const profile = get().profiles.find((p) => p.id === id);
    if (!profile?.streamKey.trim() || !isTauriEnvironment()) return false;
    if (!await saveProfileStreamKey(id, profile.streamKey.trim())) return false;
    set((state) => ({profiles: state.profiles.map((p) => p.id === id ? {...p, keyStorage:'keychain' as const} : p)}));
    return true;
  },
  loadProfileKey: async (id) => {
    const profile = get().profiles.find((p) => p.id === id);
    if (!profile || profile.keyStorage === 'session' || !isTauriEnvironment()) return false;
    const key = await getProfileStreamKey(id);
    if (!key?.trim()) return false;
    set((state) => ({profiles: state.profiles.map((p) => p.id === id ? {...p, streamKey:key, keyStorage:'keychain' as const} : p)}));
    return true;
  },
  removeSavedProfileKey: async (id) => {
    const profile = get().profiles.find((p) => p.id === id);
    if (!profile) return false;
    if (profile.keyStorage !== 'session' && !await deleteProfileStreamKey(id)) return false;
    set((state) => ({profiles: state.profiles.map((p) => p.id === id ? {...p, keyStorage:'session' as const} : p)}));
    return true;
  },
  setProfileSessionKey: (id, key) => set((state) => ({profiles:state.profiles.map((p) => p.id === id ? {...p,streamKey:key.trim()} : p)})),
  deleteProfile: (id) => {
    set((state) => ({ profiles: state.profiles.filter((p) => p.id !== id) }));
  },
  launchProfile: async (profileId) => {
    const { profiles, createStreamInstance, startStream } = get();
    const profile = profiles.find((p) => p.id === profileId);
    if (!profile) return false;
    const streamKey = profile.streamKey;
    if (!streamKey.trim()) {
      get().addLog(
        createFFmpegLogLine(profile.id, profile.name, 'error', 'Load the saved stream key or enter a session key in Stream Profiles before launching.')
      );
      return false;
    }

    const instance = createStreamInstance(
      profile.name,
      profile.playlistId,
      profile.platform,
      profile.rtmpUrl,
      streamKey,
      profile.hardwareAcc,
      profile.fps,
      profile.targetBitrateKbps
    );
    startStream(instance.id);
    return true;
  },

  // Schedules
  schedules: INITIAL_SCHEDULE,
  addSchedule: (item) => {
    const newSchedule: ScheduleItem = {
      ...item,
      id: createId('sch'),
      createdAt: item.createdAt || new Date().toISOString(),
    };
    set((state) => ({ schedules: [...state.schedules, newSchedule] }));
  },
  updateSchedule: (id, changes) => set((state) => ({ schedules: state.schedules.map((item) => item.id === id ? editedSchedule(item, changes) : item) })),
  toggleSchedule: (id) =>
    set((state) => ({
      schedules: state.schedules.map((s) => (s.id === id ? { ...s, isActive: !s.isActive } : s)),
    })),
  deleteSchedule: (id) => set((state) => ({ schedules: state.schedules.filter((s) => s.id !== id) })),

  // Logs
  logs: [],
  diagnosticLogs: [],
  clearLogs: () => set({ logs: [] }),
  addLog: (log) => set((state) => appendLogs(state, [log])),

  // Settings
  settings: {
    theme: 'dark',
    ffmpegPath: 'ffmpeg',
    useCustomFfmpeg: false,
    hardwareAcc: 'Auto',
    defaultBitrateKbps: 4500,
    useSourceBitrate: false,
    autoRecoveryEnabled: true,
    outputResolution: '1080p',
    outputFps: 'original',
    retryIntervalSeconds: 5,
    maxRetryCount: 5,
    desktopNotifications: false,
    sharedEncodingEnabled: true,
    pausePreviewByDefault: true,
  },
  updateSettings: (newSettings) => set((state) => ({ settings: { ...state.settings, ...newSettings } })),

  // Recorded encoder activity
  analytics: emptyAnalytics(),

  // Telemetry Engine Ticker
  tickTelemetry: async () => {
    const expired = get().instances.filter((i) => i.scheduledStopTime &&
      Date.now() >= new Date(i.scheduledStopTime).getTime() &&
      ['live', 'connecting', 'reconnecting'].includes(i.status));
    await Promise.all(expired.map((i) => get().stopStream(i.id)));
    const { instances, playlists } = get();

    const liveInstances = instances.filter(i => i.status === 'live');
    if (!instances.some((i)=>['live','connecting','reconnecting'].includes(i.status))) return;

    // Fetch telemetry in parallel
    const telemetryResults = await Promise.all(
      liveInstances.map(async (inst) => {
        const sys = await getProcessTelemetry(inst.id);
        return { id: inst.id, sys };
      })
    );

    set((state) => {
      const updatedInstances = state.instances.map((inst) => {
        if (inst.status !== 'live') return ['connecting','reconnecting'].includes(inst.status) ? {...inst,analyticsLastSampleAt:Date.now()} : inst;

        const sys = telemetryResults.find(t => t.id === inst.id)?.sys;
        const playlist = playlists.find((p) => p.id === inst.playlistId);
        const videoList = playlist?.videos || [];

        let nextElapsed = inst.currentVideoElapsed + 1;
        let nextIndex = inst.currentVideoIndex;
        let nextRepeat = inst.currentRepeatCount;

        const currentVideo = videoList[nextIndex];
        const videoDuration = currentVideo?.duration || 300;

        if (nextElapsed >= videoDuration) {
          nextElapsed = 0;
          if (nextIndex + 1 < videoList.length) {
            nextIndex += 1;
          } else {
            nextIndex = 0;
            nextRepeat += 1;
          }
        }

        const nextUptime = inst.uptimeSeconds + 1;

        // fps / bitrate / dropped frames are parsed from FFmpeg's own output and
        // must not be overwritten here — a made-up number would hide exactly the
        // problem the user needs to see.
        return {
          ...inst,
          uptimeSeconds: nextUptime,
          analyticsLastSampleAt: Date.now(),
          // A stream that has held up for two minutes has recovered; give it a
          // fresh recovery budget so a 24/7 run isn't capped for its whole life.
          retryCount: nextUptime > 120 ? 0 : inst.retryCount,
          currentVideoElapsed: nextElapsed,
          currentVideoIndex: nextIndex,
          currentRepeatCount: nextRepeat,
          metrics: {
            ...inst.metrics,
            cpuPercent: sys ? parseFloat(sys.cpu.toFixed(1)) : inst.metrics.cpuPercent,
            memoryMb: sys ? Math.floor(sys.memory_mb) : inst.metrics.memoryMb,
            uploadSpeedMbps: parseFloat((inst.metrics.bitrateKbps / 1000).toFixed(2)),
          },
        };
      });

      return {
        instances: updatedInstances,
        analytics: sampleActivity(state.analytics,state.instances,Date.now()),
      };
    });
  },

  checkSchedules: () => {
    if (scheduleCheckInFlight) return;
    scheduleCheckInFlight = true;
    void (async () => {
      try {
        const now = new Date();
        for (const original of get().schedules) {
          const schedule = get().schedules.find((s) => s.id === original.id);
          if (!schedule || !isScheduleDue(schedule, now)) continue;
          const profile = get().profiles.find((p) => p.id === schedule.profileId);
          const key = profile?.streamKey || '';
          const current = get().schedules.find((s) => s.id === schedule.id);
          if (!current || !isScheduleDue(current, now)) continue;
          if (!profile || !key.trim()) {
            const token = `${schedule.id}:${scheduleRunToken(schedule,now)}`;
            if (!missingScheduleKeyNotices.has(token)) {
              missingScheduleKeyNotices.add(token);
              get().addLog(createFFmpegLogLine(schedule.id, schedule.title, 'error', 'Scheduled stream is waiting: load the saved key or enter a session key in Stream Profiles. Keychain access is never requested automatically.'));
            }
            continue;
          }
          // Claim the launch before starting: repeated timer ticks cannot create
          // two instances, including while credentials or network IPC are pending.
          set((state) => ({ schedules: state.schedules.map((s) => s.id === schedule.id
            ? { ...s, lastRunDate: scheduleRunToken(s, now), isActive: s.scheduledAt ? false : s.isActive } : s) }));
          if (schedule.autoStop && schedule.stopMode === 'loops' && !isValidLoopCount(schedule.stopAfterLoops)) {
            get().addLog(createFFmpegLogLine(schedule.id, schedule.title, 'error', 'Scheduled stream skipped: loop count must be a whole number from 1 to 10000.'));
            continue;
          }
          if (get().instances.some((i) => i.scheduleId === schedule.id && ['live','connecting','reconnecting'].includes(i.status))) continue;
          const instance = get().createStreamInstance(schedule.title, profile.playlistId, profile.platform, profile.rtmpUrl, key, profile.hardwareAcc, profile.fps, profile.targetBitrateKbps);
          set((state) => ({ instances: state.instances.map((i) => i.id === instance.id ? { ...i, scheduleId: schedule.id,
            playbackLoopLimit: schedule.autoStop && schedule.stopMode === 'loops' ? schedule.stopAfterLoops : undefined,
            scheduledStopTime: schedule.autoStop && schedule.stopMode !== 'loops' && schedule.stopAfterMinutes && schedule.stopAfterMinutes > 0
              ? new Date(now.getTime() + schedule.stopAfterMinutes * 60000).toISOString() : undefined } : i) }));
          void get().startStream(instance.id);
        }
      } finally { scheduleCheckInFlight = false; }
    })();
  },
}),
    {
      name: 'livestream-studio-storage',
      partialize: (state) => ({
        analytics: state.analytics,
        diagnosticLogs: state.diagnosticLogs,
        settings: state.settings,
        schedules: state.schedules,
        profiles: profilesWithoutKeys(state.profiles),
        playlists: state.playlists,
        videos: state.videos
      }),
      // blob:/data: URLs only live inside the webview session — after a reload they
      // point at nothing and FFmpeg could never read them anyway. Drop them on load
      // so a stale library can't fail Go Live with NO_LOCAL_FILES.
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        const purgedVideos = state.videos.filter((v) => !isBrokenVideo(v));
        const purgedPlaylists = state.playlists.map((p) => ({
          ...p,
          videos: p.videos.filter((v) => !isBrokenVideo(v)),
        }));

        const removed =
          state.videos.length - purgedVideos.length +
          state.playlists.reduce((acc, p, i) => acc + (p.videos.length - purgedPlaylists[i].videos.length), 0);

        if (removed > 0) {
          console.warn(`[Studio] Removed ${removed} un-streamable video reference(s) without a disk path.`);
          state.videos = purgedVideos;
          state.playlists = purgedPlaylists;
        }

        state.analytics = restoreAnalytics(state.analytics);
        state.diagnosticLogs = retainDiagnostics([], Array.isArray(state.diagnosticLogs) ? state.diagnosticLogs : []);
        state.profiles = profilesWithoutKeys(state.profiles);
      },
    }
  )
);
