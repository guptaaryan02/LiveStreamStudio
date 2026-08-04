import React, { useState, useRef, useEffect } from 'react';
import { StreamInstance, VideoItem, Playlist } from '../../types';
import { Play, Pause, Volume2, VolumeX, Maximize2, Radio, Activity, RefreshCw, Download, FileCode, CheckCircle2 } from 'lucide-react';
import { useStudioStore } from '../../store/useStudioStore';

interface LivePlayerCanvasProps {
  instance: StreamInstance;
  playlist?: Playlist;
  onSimulateDrop?: () => void;
}

export const LivePlayerCanvas: React.FC<LivePlayerCanvasProps> = ({ instance, playlist, onSimulateDrop }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const { instances, playlists, tickTelemetry } = useStudioStore();

  const videoList = playlist?.videos || [];

  const isLive = instance.status === 'live';
  const isReconnecting = instance.status === 'reconnecting';

  // While a stream is running the engine decides what is on air. While idle the
  // preview walks the playlist on its own — the dashboard rebuilds its
  // placeholder instance on every render with index 0, so the preview cannot
  // rely on it to remember where it got to.
  const [previewIndex, setPreviewIndex] = useState(0);
  const activeIndex = isLive || isReconnecting ? instance.currentVideoIndex || 0 : previewIndex;
  const currentVideo: VideoItem | undefined = videoList[activeIndex] || videoList[0];

  // Start over when the playlist itself changes.
  useEffect(() => {
    setPreviewIndex(0);
  }, [playlist?.id, videoList.length]);

  // Handle video source changes
  useEffect(() => {
    if (videoRef.current && currentVideo) {
      videoRef.current.src = currentVideo.filePath;
      videoRef.current.load(); // Force load first frame metadata when paused
      if (isLive || isPlaying) {
        videoRef.current.play().catch(() => {
          // Autoplay blocked by browser policy until user interaction
        });
      }
    }
  }, [currentVideo?.filePath, activeIndex, isLive]);

  // Handle Play/Pause state changes
  useEffect(() => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.play().catch(() => {});
      } else {
        videoRef.current.pause();
      }
    }
  }, [isPlaying]);

  // Handle Mute & Volume
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = isMuted;
      videoRef.current.volume = volume;
    }
  }, [isMuted, volume]);

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
      setDuration(videoRef.current.duration || 0);
    }
  };

  const handleVideoEnded = () => {
    const total = videoList.length;
    if (total === 0) return;

    // Idle preview: advance locally and loop back to the first clip.
    if (!isLive && !isReconnecting) {
      setPreviewIndex((prev) => (prev + 1) % total);
      return;
    }

    // Automatically advance playlist
    useStudioStore.setState((state) => {
      const updatedInstances = state.instances.map((inst) => {
        if (inst.id !== instance.id) return inst;
        const pl = state.playlists.find((p) => p.id === inst.playlistId);
        const vids = pl?.videos || [];
        let nextIndex = inst.currentVideoIndex + 1;
        let nextRepeat = inst.currentRepeatCount;

        if (nextIndex >= vids.length) {
          nextIndex = 0;
          nextRepeat += 1;
        }

        return {
          ...inst,
          currentVideoIndex: nextIndex,
          currentVideoElapsed: 0,
          currentRepeatCount: nextRepeat,
        };
      });
      return { instances: updatedInstances };
    });
  };

  const formatTime = (seconds: number) => {
    if (isNaN(seconds)) return '00:00';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return `${hrs > 0 ? `${hrs.toString().padStart(2, '0')}:` : ''}${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleFullscreen = () => {
    if (videoRef.current) {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        videoRef.current.requestFullscreen();
      }
    }
  };

  const handleExportDiagnostics = () => {
    const state = useStudioStore.getState();
    const inst = state.instances.find(i => i.id === instance.id);
    if (!inst) return;
    
    const bundle = {
      timestamp: new Date().toISOString(),
      ffmpegVersion: "Bundled via Tauri Engine",
      os: navigator.userAgent,
      hardwareAcceleration: inst.hardwareAcc,
      streamStatus: inst.status,
      metrics: inst.metrics,
      playlist: playlist ? {
        totalVideos: playlist.videos.length,
        isInfiniteLoop: playlist.isInfiniteLoop,
        firstVideoMetadata: playlist.videos[0]?.metadata
      } : null,
      recentLogs: state.logs.filter(l => l.streamId === instance.id).slice(0, 500)
    };

    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `livestream_diagnostics_${instance.id.substring(0,6)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="relative w-full rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 shadow-2xl group select-none">
      {/* Real HTML5 Video Player */}
      <div className="relative aspect-video w-full flex items-center justify-center overflow-hidden bg-black">
        <video
          ref={videoRef}
          playsInline
          preload="auto"
          autoPlay={isLive}
          onTimeUpdate={handleTimeUpdate}
          onEnded={handleVideoEnded}
          className="w-full h-full object-contain"
        />

        {/* Dark Gradient Overlays */}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-slate-950/60 pointer-events-none" />

        {/* Top Left Live Status Badge */}
        <div className="absolute top-4 left-4 flex items-center space-x-3 pointer-events-auto z-10">
          {isLive ? (
            <div className="flex items-center space-x-2 bg-red-600/90 text-white text-[11px] font-bold px-3 py-1 rounded-md shadow-lg shadow-red-600/40 tracking-wider uppercase animate-pulse">
              <Radio className="w-3.5 h-3.5" />
              <span>LIVE BROADCAST</span>
            </div>
          ) : isReconnecting ? (
            <div className="flex items-center space-x-2 bg-amber-600/90 text-white text-[11px] font-bold px-3 py-1 rounded-md shadow-lg shadow-amber-600/40 tracking-wider uppercase animate-bounce">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span>RECONNECTING ({instance.retryCount || 0}/5)</span>
            </div>
          ) : instance.status === 'error' ? (
            <div className="bg-red-900/90 text-red-200 text-[11px] font-semibold px-3 py-1 rounded-md border border-red-700">
              STREAM ERROR
            </div>
          ) : (
            <div className="bg-slate-800/90 text-slate-300 text-[11px] font-semibold px-3 py-1 rounded-md border border-slate-700">
              STREAM IDLE
            </div>
          )}

          <div className="hidden sm:flex items-center space-x-2 bg-slate-900/80 backdrop-blur-md px-3 py-1 rounded-md border border-slate-800 text-xs font-mono text-slate-300">
            <span className="text-slate-400">Target:</span>
            <span className="text-indigo-400 font-semibold uppercase">{instance.platform}</span>
          </div>
        </div>

        {/* Top Right Telemetry */}
        <div className="absolute top-4 right-4 flex items-center space-x-2 z-10">
          <button
            onClick={handleExportDiagnostics}
            className="flex items-center space-x-1.5 bg-indigo-600/80 hover:bg-indigo-500 backdrop-blur-md px-2 py-1 rounded-md border border-indigo-500/50 text-[10px] font-semibold text-white transition"
            title="Export Diagnostic Bundle"
          >
            <span>Export Diagnostics</span>
          </button>
          
          <div className="flex items-center space-x-2 bg-slate-950/80 backdrop-blur-md px-3 py-1 rounded-md border border-slate-800 text-xs font-mono">
            <Activity className={`w-3.5 h-3.5 ${isLive ? 'text-emerald-400 animate-pulse' : 'text-slate-500'}`} />
            <span className="text-slate-200">{instance.metrics.fps} FPS</span>
            <span className="text-slate-600">|</span>
            <span className="text-indigo-300">{(instance.metrics.bitrateKbps / 1000).toFixed(2)} Mbps</span>
          </div>
        </div>

        {/* Test Drop Button */}
        {isLive && onSimulateDrop && (
          <button
            onClick={onSimulateDrop}
            className="absolute top-16 left-4 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-[10px] font-mono font-medium px-2.5 py-1 rounded-md transition backdrop-blur-md z-10"
            title="Simulate network drop to test Auto-Recovery"
          >
            ⚡ Test Auto-Reconnect
          </button>
        )}

        {/* Bottom Control Overlay */}
        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-slate-950 via-slate-950/90 to-transparent p-4 flex flex-col justify-end space-y-2 z-10">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-indigo-400 font-mono font-semibold tracking-wide flex items-center space-x-2">
                <span>Video {activeIndex + 1} of {videoList.length}</span>
                <span>•</span>
                <span>Loop {instance.currentRepeatCount}</span>
              </div>
              <h3 className="text-sm font-bold text-white tracking-tight line-clamp-1">
                {currentVideo?.title || 'No video loaded'}
              </h3>
            </div>

            <div className="text-right text-xs font-mono">
              <div className="text-emerald-400 font-bold">Uptime: {formatTime(instance.uptimeSeconds)}</div>
              <div className="text-slate-400 text-[11px]">
                {formatTime(currentTime)} / {formatTime(duration)}
              </div>
            </div>
          </div>

          {/* Real Video Progress Bar */}
          <div className="w-full bg-slate-800/80 rounded-full h-1.5 overflow-hidden cursor-pointer"
            onClick={(e) => {
              if (videoRef.current && duration > 0) {
                const rect = e.currentTarget.getBoundingClientRect();
                const pos = (e.clientX - rect.left) / rect.width;
                videoRef.current.currentTime = pos * duration;
              }
            }}>
            <div
              className="bg-gradient-to-r from-indigo-500 via-emerald-400 to-indigo-400 h-full rounded-full transition-all duration-150"
              style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
            />
          </div>

          {/* Player Buttons */}
          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center space-x-3">
              <button
                onClick={() => setIsPlaying(!isPlaying)}
                className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800/60 rounded-md transition"
              >
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              </button>

              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setIsMuted(!isMuted)}
                  className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800/60 rounded-md transition"
                >
                  {isMuted || volume === 0 ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
                </button>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={isMuted ? 0 : volume}
                  onChange={(e) => {
                    setVolume(parseFloat(e.target.value));
                    setIsMuted(false);
                  }}
                  className="w-16 h-1 accent-indigo-500 cursor-pointer"
                />
              </div>

              <span className="text-[11px] font-mono text-slate-400 hidden sm:inline">
                {currentVideo?.resolution} • {currentVideo?.fps}fps
              </span>
            </div>

            <button
              onClick={handleFullscreen}
              className="p-1.5 text-slate-400 hover:text-white rounded-md transition"
              title="Fullscreen Player"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
