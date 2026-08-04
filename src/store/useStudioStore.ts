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
  getPlayableClipPaths,
  buildPlayoutConfig,
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
  startStream: (instanceId: string) => void;
  stopStream: (instanceId: string) => void;
  handleStreamExit: (instanceId: string) => void;
  pauseStream: (instanceId: string) => void;
  resumeStream: (instanceId: string) => void;
  deleteStreamInstance: (instanceId: string) => void;
  simulateNetworkDrop: (instanceId: string) => void;

  // Stream Profiles
  profiles: StreamProfile[];
  saveProfile: (profile: Omit<StreamProfile, 'id'>) => StreamProfile;
  deleteProfile: (id: string) => void;
  launchProfile: (profileId: string) => Promise<boolean>;

  // Schedules
  schedules: ScheduleItem[];
  addSchedule: (item: Omit<ScheduleItem, 'id'>) => void;
  toggleSchedule: (id: string) => void;
  deleteSchedule: (id: string) => void;
  
  // Update Metrics
  updateInstanceMetrics: (instanceId: string, metrics: Partial<StreamMetrics>) => void;

  // Real-time Logs
  logs: LogEntry[];
  addLog: (log: LogEntry) => void;
  clearLogs: () => void;
  settings: AppSettings;
  updateSettings: (newSettings: Partial<AppSettings>) => void;

  // Analytics
  analytics: StreamAnalyticsSummary;

  // Telemetry Engine Ticker
  tickTelemetry: () => void;
  checkSchedules: () => void;
}

let scheduleCheckInFlight = false;

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
    debugStatus: 'Stream is live',
    instances: state.instances.map((i) =>
      i.id === instanceId
        ? {
            ...i,
            status: 'live' as const,
            startTime: new Date().toISOString(),
            uptimeSeconds: 0,
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
    logs: [...initLogs, ...state.logs],
    analytics: {
      ...state.analytics,
      totalStreamsRun: state.analytics.totalStreamsRun + 1,
    },
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
      id: `pl-${Date.now()}`,
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
      activePlaylistId: state.activePlaylistId === id ? state.playlists[0]?.id || null : state.activePlaylistId,
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

    if (!inst.streamKey.trim()) {
      const message = 'Stream key is required before going live.';
      const errLog = createFFmpegLogLine(inst.id, inst.name, 'error', message);
      set((state) => ({
        debugStatus: `[FAIL] ${message}`,
        instances: state.instances.map((i) => (i.id === instanceId ? { ...i, status: 'error' as const } : i)),
        logs: [errLog, ...state.logs],
      }));
      return;
    }

    set((state) => ({
      instances: state.instances.map((i) =>
        i.id === instanceId ? { ...i, status: 'connecting' as const } : i
      ),
    }));

    const playlist = playlists.find((p) => p.id === inst.playlistId);
    if (!playlist) {
      set((state) => ({
        debugStatus: `[FAIL] Playlist ${inst.playlistId} not found`,
        instances: state.instances.map((i) => (i.id === instanceId ? { ...i, status: 'error' as const } : i)),
      }));
      return;
    }

    const cmd = generateSafeFFmpegCommand(playlist, inst.platform, inst.rtmpUrl, inst.streamKey, inst.hardwareAcc, inst.targetBitrate || 4500, settings);

    try {
      if (isTauriEnvironment()) {
        const ffmpegInfo = await getFFmpegInfo(settings.useCustomFfmpeg ? settings.ffmpegPath : undefined);
        if (!ffmpegInfo?.available) {
          const message = `FFmpeg is not available (${ffmpegInfo?.path || 'not found'}). Add bundled FFmpeg or choose a custom binary in Settings.`;
          const errLog = createFFmpegLogLine(inst.id, inst.name, 'error', message);
          set((state) => ({
            debugStatus: `[FAIL] ${message}`,
            instances: state.instances.map((i) => (i.id === instanceId ? { ...i, status: 'error' as const } : i)),
            logs: [errLog, ...state.logs],
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
          logs: [errLog, ...state.logs],
        }));
        return;
      }

      // Mode selection (Module 15). Identical clips stream as a pure remux;
      // anything mixed goes through the playout engine, which normalises each
      // clip on the fly so a codec/resolution change can't kill the stream.
      const analysis = analyzePlaylistCompatibility(playlist);
      const hardwareAcc = inst.hardwareAcc || settings.hardwareAcc;
      const bitrate = inst.targetBitrate || settings.defaultBitrateKbps || 4500;
      const clips = getPlayableClipPaths(playlist);
      set({
        debugStatus: analysis.isCompatible
          ? 'Playlist analyzed. Fast Mode selected. Going Live...'
          : 'Playlist analyzed. Mixed formats detected. Optimizing for compatibility... Going Live...',
      });

      const modeLog = createFFmpegLogLine(
        inst.id,
        inst.name,
        'status',
        analysis.isCompatible
          ? `Playlist analyzed — Fast Mode selected for ${clips.length} clip(s)`
          : `Playlist analyzed — mixed formats detected; optimizing for compatibility with ${hardwareAcc}` +
            (analysis.differences.length ? ` (differences: ${analysis.differences.slice(0, 4).join(', ')})` : '')
      );
      set((state) => ({ logs: [modeLog, ...state.logs] }));

      if (!analysis.isCompatible) {
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
          ? await startTauriPlayoutStream({ streamId: inst.id, clips, config })
          : await startWebPlayoutStream({ streamId: inst.id, clips, config });

        if (!result.success) {
          const errLog = createFFmpegLogLine(inst.id, inst.name, 'error', `Stream failed to start: ${result.error}`);
          set((state) => ({
            debugStatus: `[FAIL] ${result.error}`,
            instances: state.instances.map((i) => (i.id === instanceId ? { ...i, status: 'error' } : i)),
            logs: [errLog, ...state.logs],
          }));
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
        settings
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
            logs: [errLog, ...state.logs]
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
            logs: [errLog, ...state.logs],
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
        logs: [errLog, ...state.logs]
      }));
      return;
    }

    markInstanceLive(set, instanceId, inst, cmd, settings);
  },

  stopStream: async (instanceId) => {
    const { instances } = get();
    const inst = instances.find((i) => i.id === instanceId);
    if (!inst) return;

    try {
      if (isTauriEnvironment()) {
        await stopTauriFFmpegStream(instanceId);
      } else {
        await fetch('/api/ffmpeg/stop', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ streamId: instanceId }),
        });
      }
    } catch (e) {}

    const stopLog = createFFmpegLogLine(inst.id, inst.name, 'status', `Stream stopped. SIGTERM sent to native FFmpeg process.`);

    set((state) => ({
      instances: state.instances.map((i) =>
        i.id === instanceId
          ? {
              ...i,
              status: 'idle',
              uptimeSeconds: 0,
              metrics: { fps: 0, bitrateKbps: 0, droppedFrames: 0, cpuPercent: 0, memoryMb: 0, uploadSpeedMbps: 0, connectionQuality: 'Excellent' },
            }
          : i
      ),
      logs: [stopLog, ...state.logs],
    }));
  },

  handleStreamExit: (instanceId) => {
    const { instances, settings, startStream } = get();
    const inst = instances.find(i => i.id === instanceId);
    if (!inst) return;

    // Only a stream that was actually LIVE can start recovering. Anything else
    // (idle = stopped by the user, reconnecting = a retry is already pending,
    // error = already given up) must be ignored, so duplicate exit events can
    // never schedule two recoveries for the same disconnect.
    if (inst.status !== 'live') return;

    const giveUp = (reason: string) => {
      const logLine = createFFmpegLogLine(inst.id, inst.name, 'error', reason);
      set(state => ({
        instances: state.instances.map(i =>
          i.id === instanceId ? { ...i, status: 'error' as const, retryCount: 0 } : i
        ),
        logs: [logLine, ...state.logs],
      }));
    };

    // A process that died almost immediately never connected — retrying just
    // hammers the RTMP server with the same bad URL or stream key.
    const ranForMs = inst.startTime ? Date.now() - new Date(inst.startTime).getTime() : 0;
    if (ranForMs > 0 && ranForMs < 5000) {
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
    const backoffIntervals = [1000, 2000, 5000, 10000, 20000];
    const waitTime = backoffIntervals[Math.min(currentRetry, backoffIntervals.length - 1)];

    const logLine = createFFmpegLogLine(
      inst.id,
      inst.name,
      'error',
      `Stream disconnected. Auto-recovering in ${waitTime / 1000}s (retry ${currentRetry + 1} of ${maxRetries})...`
    );

    set(state => ({
      instances: state.instances.map(i =>
        i.id === instanceId ? { ...i, status: 'reconnecting' as const, retryCount: currentRetry + 1 } : i
      ),
      logs: [logLine, ...state.logs]
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

  deleteStreamInstance: (instanceId) =>
    set((state) => ({
      instances: state.instances.filter((i) => i.id !== instanceId),
      activeInstanceId: state.activeInstanceId === instanceId ? null : state.activeInstanceId,
    })),

  updateInstanceMetrics: (instanceId, metrics) =>
    set((state) => ({
      instances: state.instances.map((i) =>
        i.id === instanceId
          ? { ...i, metrics: { ...i.metrics, ...metrics } }
          : i
      ),
    })),

  simulateNetworkDrop: (instanceId) => {
    const { instances } = get();
    const inst = instances.find((i) => i.id === instanceId);
    if (!inst) return;

    const errLog = createFFmpegLogLine(inst.id, inst.name, 'error');
    const recLog = createFFmpegLogLine(inst.id, inst.name, 'reconnect');

    set((state) => ({
      instances: state.instances.map((i) =>
        i.id === instanceId
          ? {
              ...i,
              status: 'reconnecting',
              retryAttempts: i.retryAttempts + 1,
              metrics: { ...i.metrics, connectionQuality: 'Poor', droppedFrames: i.metrics.droppedFrames + 45 },
            }
          : i
      ),
      logs: [recLog, errLog, ...state.logs],
    }));

    setTimeout(() => {
      const recoveredState = get();
      const currentInst = recoveredState.instances.find((i) => i.id === instanceId);
      if (currentInst && currentInst.status === 'reconnecting') {
        const succLog = createFFmpegLogLine(instanceId, currentInst.name, 'status', `Auto-Recovery Success: RTMP Socket re-established cleanly.`);
        set((s) => ({
          instances: s.instances.map((i) =>
            i.id === instanceId
              ? {
                  ...i,
                  status: 'live',
                  retryAttempts: 0,
                  metrics: { ...i.metrics, connectionQuality: 'Excellent' },
                }
              : i
          ),
          logs: [succLog, ...s.logs],
          analytics: { ...s.analytics, successfulReconnections: s.analytics.successfulReconnections + 1 },
        }));
      }
    }, 3500);
  },

  // Profiles
  profiles: INITIAL_PROFILES,
  saveProfile: (prof) => {
    const id = `prof-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const newProfile: StreamProfile = {
      ...prof,
      id,
      streamKey: prof.streamKey,
    };
    if (isTauriEnvironment() && prof.streamKey.trim()) {
      saveProfileStreamKey(id, prof.streamKey.trim()).catch((e) =>
        console.warn('[Profiles] Could not save stream key securely:', e)
      );
    }
    set((state) => ({ profiles: [...state.profiles, newProfile] }));
    return newProfile;
  },
  deleteProfile: (id) => {
    if (isTauriEnvironment()) {
      deleteProfileStreamKey(id);
    }
    set((state) => ({ profiles: state.profiles.filter((p) => p.id !== id) }));
  },
  launchProfile: async (profileId) => {
    const { profiles, createStreamInstance, startStream } = get();
    const profile = profiles.find((p) => p.id === profileId);
    if (!profile) return false;
    const streamKey = profile.streamKey || (await getProfileStreamKey(profile.id)) || '';
    if (!streamKey.trim()) {
      get().addLog(
        createFFmpegLogLine(profile.id, profile.name, 'error', 'Cannot launch profile: Stream key is missing. Save the profile again with a valid RTMP key.')
      );
      return false;
    }

    const instance = createStreamInstance(
      profile.name,
      profile.playlistId,
      profile.platform,
      profile.rtmpUrl,
      streamKey,
      profile.hardwareAcc
    );
    startStream(instance.id);
    return true;
  },

  // Schedules
  schedules: INITIAL_SCHEDULE,
  addSchedule: (item) => {
    const newSchedule: ScheduleItem = {
      ...item,
      id: `sch-${Date.now()}`,
    };
    set((state) => ({ schedules: [...state.schedules, newSchedule] }));
  },
  toggleSchedule: (id) =>
    set((state) => ({
      schedules: state.schedules.map((s) => (s.id === id ? { ...s, isActive: !s.isActive } : s)),
    })),
  deleteSchedule: (id) => set((state) => ({ schedules: state.schedules.filter((s) => s.id !== id) })),

  // Logs
  logs: [],
  clearLogs: () => set({ logs: [] }),
  addLog: (log) => set((state) => ({ logs: [{ ...log, message: sanitizeLogMessage(log.message) }, ...state.logs.slice(0, 499)] })),

  // Settings
  settings: {
    theme: 'dark',
    ffmpegPath: 'ffmpeg',
    useCustomFfmpeg: false,
    hardwareAcc: 'Auto',
    defaultBitrateKbps: 4500,
    autoRecoveryEnabled: true,
    outputResolution: '1080p',
    outputFps: 'original',
    retryIntervalSeconds: 5,
    maxRetryCount: 5,
    desktopNotifications: true,
  },
  updateSettings: (newSettings) => set((state) => ({ settings: { ...state.settings, ...newSettings } })),

  // Analytics
  analytics: {
    totalStreamsRun: 14,
    totalHoursStreamed: 182.5,
    averageBitrateKbps: 4480,
    successfulReconnections: 9,
    totalVideosStreamed: 640,
    streamStabilityPercent: 99.9,
  },

  // Telemetry Engine Ticker
  tickTelemetry: async () => {
    const { instances, playlists } = get();

    const liveInstances = instances.filter(i => i.status === 'live');
    if (liveInstances.length === 0) return;

    // Fetch telemetry in parallel
    const telemetryResults = await Promise.all(
      liveInstances.map(async (inst) => {
        const sys = await getProcessTelemetry(inst.id);
        return { id: inst.id, sys };
      })
    );

    set((state) => {
      const updatedInstances = state.instances.map((inst) => {
        if (inst.status !== 'live') return inst;

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
        analytics: {
          ...state.analytics,
          totalHoursStreamed: state.analytics.totalHoursStreamed + (liveInstances.length / 3600),
        },
      };
    });
  },

  checkSchedules: () => {
    if (scheduleCheckInFlight) return;
    scheduleCheckInFlight = true;
    void (async () => {
      try {
        const { schedules, startStream, instances, createStreamInstance, profiles, addLog } = get();
        const now = new Date();

        // Format current time to match scheduledTime like "07:00 AM"
        let h = now.getHours();
        const m = now.getMinutes();
        const ampm = h >= 12 ? 'PM' : 'AM';
        h = h % 12;
        h = h ? h : 12;
        const currentTimeStr = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')} ${ampm}`;
        const currentDay = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][now.getDay()];
        const todayDateStr = now.toISOString().split('T')[0];

        let schedulesModified = false;
        const updatedSchedules = [];

        for (const schedule of schedules) {
          if (!schedule.isActive || !schedule.autoStart) {
            updatedSchedules.push(schedule);
            continue;
          }

          // If time and day match, and it hasn't already run today at this minute
          const hasRunNow = schedule.lastRunDate === `${todayDateStr} ${currentTimeStr}`;

          if (schedule.repeatDays.includes(currentDay) && schedule.scheduledTime === currentTimeStr && !hasRunNow) {
            // Find if this specific schedule title is already running
            const isRunning = instances.some((i) => i.name === schedule.title && i.status === 'live');
            if (!isRunning) {
              // Resolve profile to use its platform settings, or fallback
              const prof = profiles.find((p) => p.id === schedule.profileId);
              const streamKey = prof ? prof.streamKey || (await getProfileStreamKey(prof.id)) || '' : '';

              if (!prof || !streamKey.trim()) {
                addLog(
                  createFFmpegLogLine(
                    schedule.id,
                    schedule.title,
                    'error',
                    'Scheduled stream skipped: profile or stream key is missing.'
                  )
                );
                updatedSchedules.push(schedule);
                continue;
              }

              const newInst = createStreamInstance(
                schedule.title,
                prof.playlistId,
                prof.platform,
                prof.rtmpUrl,
                streamKey,
                prof.hardwareAcc
              );

              // Trigger the FFmpeg stream asynchronously without awaiting it here
              startStream(newInst.id);
              schedulesModified = true;
              updatedSchedules.push({ ...schedule, lastRunDate: `${todayDateStr} ${currentTimeStr}` });
              continue;
            }
          }

          updatedSchedules.push(schedule);
        }

        if (schedulesModified) {
          set({ schedules: updatedSchedules });
        }
      } finally {
        scheduleCheckInFlight = false;
      }
    })();
  },
}),
    {
      name: 'livestream-studio-storage',
      partialize: (state) => ({
        analytics: state.analytics,
        settings: state.settings,
        schedules: state.schedules,
        profiles: state.profiles.map((profile) => ({ ...profile, streamKey: '' })),
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

        state.profiles = state.profiles.map((profile) => ({ ...profile, streamKey: '' }));
      },
    }
  )
);
