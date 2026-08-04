import React, { useState } from 'react';
import { useStudioStore } from '../../store/useStudioStore';
import { LivePlayerCanvas } from './LivePlayerCanvas';
import { StreamValidatorModal } from './StreamValidatorModal';
import {
  Radio,
  Play,
  Square,
  RefreshCw,
  Cpu,
  HardDrive,
  Activity,
  Zap,
  ListVideo,
  Key,
  Globe,
  Flame,
  CheckCircle,
  AlertTriangle,
  Plus,
  Download,
  Terminal,
  Eye,
  EyeOff,
} from 'lucide-react';
import { StreamPlatform, HardwareAcceleration, CompatibilityAnalysis } from '../../types';
import { generateLiveStreamShellScript, generateLiveStreamBatScript, analyzePlaylistCompatibility } from '../../services/ffmpegEngine';
import { isBrokenVideo } from '../../services/videoImport';

export const DashboardView: React.FC = () => {
  const {
    instances,
    playlists,
    videos: libraryVideos,
    startStream,
    stopStream,
    simulateNetworkDrop,
    createStreamInstance,
    settings,
    setActiveTab,
    debugStatus,
  } = useStudioStore();

  const [selectedPlaylistId, setSelectedPlaylistId] = useState(playlists[0]?.id || '');
  const [selectedPlatform, setSelectedPlatform] = useState<StreamPlatform>('youtube');
  const [streamKeyInput, setStreamKeyInput] = useState('');
  const [showStreamKey, setShowStreamKey] = useState(false);
  const [streamNameInput, setStreamNameInput] = useState('24/7 Channel Live Stream');
  const [hardwareAcc, setHardwareAcc] = useState<HardwareAcceleration>(settings.hardwareAcc);
  const [targetFps, setTargetFps] = useState<number>(30);
  const [targetBitrate, setTargetBitrate] = useState<number>(4500);
  const [goLiveStatus, setGoLiveStatus] = useState<string>('');

  // Pre-flight Modal State
  const [preflightOpen, setPreflightOpen] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<CompatibilityAnalysis | null>(null);
  const [pendingConfig, setPendingConfig] = useState<any>(null);

  const liveInstance = instances.find((i) => i.status === 'live' || i.status === 'reconnecting');
  const activeInstance = liveInstance || {
    ...(instances[0] || {}),
    playlistId: selectedPlaylistId,
    status: 'idle',
    currentVideoIndex: 0,
  } as any;
  const activePlaylist = liveInstance 
    ? playlists.find((p) => p.id === liveInstance.playlistId) || playlists[0]
    : playlists.find((p) => p.id === selectedPlaylistId) || playlists[0];

  const brokenVideoCount = playlists.reduce(
    (acc, p) => acc + p.videos.filter(isBrokenVideo).length,
    libraryVideos.filter(isBrokenVideo).length
  );
  const hasFailure = debugStatus.includes('[FAIL]') || goLiveStatus.startsWith('ERROR');

  const defaultRtmpUrls: Record<StreamPlatform, string> = {
    youtube: 'rtmp://a.rtmp.youtube.com/live2',
    facebook: 'rtmps://live-api-s.facebook.com:443/rtmp',
    twitch: 'rtmp://live.twitch.tv/app',
    custom: 'rtmp://localhost:1935/live',
  };

  const handleQuickGoLive = (e: React.FormEvent) => {
    e.preventDefault();
    
    const playlist = playlists.find((p) => p.id === selectedPlaylistId);
    if (!playlist || playlist.videos.length === 0) {
      alert('Please select a playlist with at least one video before going live!');
      return;
    }
    if (!streamKeyInput.trim()) {
      alert('Please enter your RTMP Stream Key before going live!');
      return;
    }

    const rtmpUrl = defaultRtmpUrls[selectedPlatform];
    
    // Open pre-flight validator modal
    setPendingConfig({
      name: streamNameInput,
      playlistId: selectedPlaylistId,
      platform: selectedPlatform,
      rtmpUrl,
      streamKey: streamKeyInput.trim(),
      hardwareAcc,
      fps: targetFps,
      bitrate: targetBitrate
    });
    setPreflightOpen(true);
  };

  const confirmGoLive = () => {
    if (!pendingConfig) return;
    
    const newInst = createStreamInstance(
      pendingConfig.name,
      pendingConfig.playlistId,
      pendingConfig.platform,
      pendingConfig.rtmpUrl,
      pendingConfig.streamKey,
      pendingConfig.hardwareAcc,
      pendingConfig.targetFps,
      pendingConfig.targetBitrate
    );
    startStream(newInst.id);
    setPreflightOpen(false);
    setPendingConfig(null);
  };

  // Explicit Clipboard Paste handler to prevent any browser truncation
  const handleStreamKeyPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pastedText = e.clipboardData.getData('text').trim();
    if (pastedText) {
      setStreamKeyInput(pastedText);
    }
  };

  const handleDownloadMacScript = () => {
    if (!activePlaylist) return;
    if (!streamKeyInput.trim()) {
      alert('Please paste your Stream Key before downloading the terminal script!');
      return;
    }
    const rtmpUrl = defaultRtmpUrls[selectedPlatform];
    const script = generateLiveStreamShellScript(
      activePlaylist,
      selectedPlatform,
      rtmpUrl,
      streamKeyInput.trim(),
      hardwareAcc
    );

    const blob = new Blob([script], { type: 'text/x-sh' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `start_live_stream_mac.sh`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadWindowsScript = () => {
    if (!activePlaylist) return;
    if (!streamKeyInput.trim()) {
      alert('Please paste your Stream Key before downloading the batch script!');
      return;
    }
    const rtmpUrl = defaultRtmpUrls[selectedPlatform];
    const script = generateLiveStreamBatScript(
      activePlaylist,
      selectedPlatform,
      rtmpUrl,
      streamKeyInput.trim(),
      hardwareAcc === 'VideoToolbox' ? 'NVENC' : hardwareAcc
    );

    const blob = new Blob([script], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `start_live_stream_windows.bat`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6 space-y-6 overflow-y-auto h-full pb-20 select-none">
      {/* Top Banner / Stream Telemetry Bar */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 bg-gradient-to-r from-slate-900 via-indigo-950/60 to-slate-900 border border-slate-800 p-5 rounded-2xl">
        <div className="flex items-center space-x-4">
          <div className="w-12 h-12 rounded-2xl bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center">
            <Radio className="w-6 h-6 text-indigo-400 animate-pulse" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">Stream Dashboard</h2>
            <p className="text-xs text-slate-400">
              One-Click FFmpeg Broadcast Engine • {instances.filter((i) => i.status === 'live').length} Active Instance(s)
            </p>
          </div>
        </div>

        {/* Global Action Buttons */}
        <div className="flex items-center space-x-3">
          {activeInstance && activeInstance.status === 'live' ? (
            <button
              onClick={() => stopStream(activeInstance.id)}
              className="flex items-center space-x-2 bg-red-600/90 hover:bg-red-600 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-lg shadow-red-600/30 transition"
            >
              <Square className="w-4 h-4 fill-white" />
              <span>Stop Active Stream</span>
            </button>
          ) : activeInstance ? (
            <button
              onClick={(e) => {
                console.log('[GoLive] Top button clicked, streamKey:', streamKeyInput ? '(has value)' : '(EMPTY)');
                handleQuickGoLive(e as any);
              }}
              className="flex items-center space-x-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-5 py-2.5 rounded-xl shadow-lg shadow-emerald-600/30 transition"
            >
              <Play className="w-4 h-4 fill-white" />
              <span>Go Live Now</span>
            </button>
          ) : null}

          <button
            onClick={() => setActiveTab('multistream')}
            className="flex items-center space-x-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium px-4 py-2.5 rounded-xl transition"
          >
            <Plus className="w-4 h-4" />
            <span>Manage Multi-Stream</span>
          </button>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Live Player Canvas */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-200 flex items-center space-x-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <span>Live Output Preview Monitor</span>
            </h3>
            <span className="text-xs font-mono text-slate-400">
              Hardware: {activeInstance?.hardwareAcc || settings.hardwareAcc}
            </span>
          </div>

          {activeInstance ? (
            <LivePlayerCanvas
              instance={activeInstance}
              playlist={activePlaylist}
              onSimulateDrop={() => simulateNetworkDrop(activeInstance.id)}
            />
          ) : (
            <div className="aspect-video w-full rounded-2xl bg-slate-900/60 border border-slate-800 flex flex-col items-center justify-center text-slate-400 p-8 text-center">
              <Radio className="w-12 h-12 text-slate-600 mb-3" />
              <p className="font-semibold text-slate-300">No Stream Currently Active</p>
              <p className="text-xs text-slate-500 max-w-sm mt-1">
                Select a video playlist and click <strong>START LIVE STREAM NOW</strong> on the right.
              </p>
            </div>
          )}

          {/* Telemetry Cards Grid */}
          {activeInstance && activeInstance.status === 'live' && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2">
              <div className="bg-slate-900/70 border border-slate-800 p-4 rounded-xl">
                <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
                  <span>Bitrate</span>
                  <Activity className="w-3.5 h-3.5 text-indigo-400" />
                </div>
                <div className="text-lg font-bold font-mono text-white">
                  {(activeInstance.metrics.bitrateKbps / 1000).toFixed(2)}{' '}
                  <span className="text-xs font-normal text-slate-400">Mbps</span>
                </div>
                <div className="text-[10px] text-emerald-400 font-mono mt-1">Target: 4.5 Mbps</div>
              </div>

              <div className="bg-slate-900/70 border border-slate-800 p-4 rounded-xl">
                <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
                  <span>Network Health</span>
                  {activeInstance.metrics.connectionQuality === 'Excellent' ? <Radio className="w-3.5 h-3.5 text-emerald-400" /> :
                   activeInstance.metrics.connectionQuality === 'Good' ? <Radio className="w-3.5 h-3.5 text-blue-400" /> :
                   activeInstance.metrics.connectionQuality === 'Fair' ? <Radio className="w-3.5 h-3.5 text-amber-400 animate-pulse" /> :
                   <Radio className="w-3.5 h-3.5 text-red-500 animate-pulse" />}
                </div>
                <div className="text-lg font-bold font-mono text-white flex items-baseline space-x-1">
                  <span>{activeInstance.metrics.connectionQuality || 'Stable'}</span>
                </div>
                <div className={`text-[10px] font-mono mt-1 ${activeInstance.metrics.droppedFrames > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                  {activeInstance.metrics.droppedFrames || 0} Dropped Frames • {(activeInstance.metrics.bitrateKbps || 0).toFixed(0)} kbps
                </div>
              </div>

              <div className="bg-slate-900/70 border border-slate-800 p-4 rounded-xl">
                <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
                  <span>Encoder / Speed</span>
                  <Cpu className="w-3.5 h-3.5 text-amber-400" />
                </div>
                <div className="text-lg font-bold font-mono text-white">
                  {activeInstance.metrics.uploadSpeedMbps ? `${activeInstance.metrics.uploadSpeedMbps.toFixed(2)}x` : '1.0x'}
                </div>
                <div className="text-[10px] text-indigo-300 font-mono mt-1">{activeInstance.hardwareAcc} Encoder</div>
              </div>

              <div className="bg-slate-900/70 border border-slate-800 p-4 rounded-xl">
                <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
                  <span>Output Stream</span>
                  <Radio className="w-3.5 h-3.5 text-emerald-400" />
                </div>
                <div className="text-lg font-bold font-mono text-white">
                  {useStudioStore.getState().settings?.outputResolution || '1080p'}
                </div>
                <div className="text-[10px] text-slate-400 font-mono mt-1">{activeInstance.metrics.fps || 30} FPS</div>
              </div>

              <div className="bg-slate-900/70 border border-slate-800 p-4 rounded-xl">
                <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
                  <span>System Resource</span>
                  <HardDrive className="w-3.5 h-3.5 text-sky-400" />
                </div>
                <div className="text-lg font-bold font-mono text-white">
                  {activeInstance.metrics.cpuPercent || 0}% <span className="text-xs font-normal text-slate-400">CPU</span>
                </div>
                <div className="text-[10px] text-emerald-400 font-mono mt-1">{activeInstance.metrics.memoryMb || 0} MB Memory</div>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Launcher Box */}
        <div className="space-y-4">
          <div className="bg-gradient-to-b from-slate-900 to-slate-950 border border-slate-800 p-5 rounded-2xl space-y-4">
            <div className="flex items-center space-x-2 text-indigo-400 font-bold text-sm">
              <Flame className="w-4 h-4 text-amber-400" />
              <span>One-Click Stream Launcher</span>
            </div>

            <form onSubmit={handleQuickGoLive} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Stream Instance Name</label>
                <input
                  type="text"
                  value={streamNameInput}
                  onChange={(e) => setStreamNameInput(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500 font-medium"
                  placeholder="e.g. Morning Bhajans 24/7"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium text-slate-300">Select Video Playlist</label>
                  <button
                    type="button"
                    onClick={() => setActiveTab('playlist')}
                    className="text-[11px] text-indigo-400 hover:underline"
                  >
                    + Manage Playlists
                  </button>
                </div>
                <select
                  value={selectedPlaylistId}
                  onChange={(e) => setSelectedPlaylistId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500 font-medium"
                >
                  {playlists.map((pl) => (
                    <option key={pl.id} value={pl.id}>
                      {pl.name} ({pl.videos.length} videos • {pl.isInfiniteLoop ? 'Infinite Loop' : `${pl.repeatCount}x`})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Streaming Platform</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['youtube', 'facebook', 'twitch', 'custom'] as StreamPlatform[]).map((plat) => (
                    <button
                      key={plat}
                      type="button"
                      onClick={() => setSelectedPlatform(plat)}
                      className={`px-3 py-2 rounded-lg text-xs font-medium capitalize border transition flex items-center space-x-2 ${
                        selectedPlatform === plat
                          ? 'bg-indigo-600/30 text-indigo-200 border-indigo-500'
                          : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <Globe className="w-3.5 h-3.5" />
                      <span>{plat}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Stream Key Input with Paste Handler & Eye Toggle */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1 flex items-center justify-between">
                  <span>Stream Key</span>
                  <span className="text-[10px] text-amber-400 font-mono">* Required to go live</span>
                </label>
                <div className="relative flex items-center">
                  <Key className="w-3.5 h-3.5 text-slate-500 absolute left-3 z-10" />
                  <input
                    type={showStreamKey ? 'text' : 'password'}
                    required
                    value={streamKeyInput}
                    onChange={(e) => setStreamKeyInput(e.target.value)}
                    onPaste={handleStreamKeyPaste}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-10 py-2 text-xs text-slate-100 font-mono focus:outline-none focus:border-indigo-500 placeholder-slate-600 select-all"
                    placeholder="Paste your YouTube / Facebook Stream Key here..."
                  />
                  <button
                    type="button"
                    onClick={() => setShowStreamKey(!showStreamKey)}
                    className="absolute right-2.5 text-slate-500 hover:text-slate-200 p-1"
                    title={showStreamKey ? 'Hide Stream Key' : 'Show Stream Key'}
                  >
                    {showStreamKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Hardware Acceleration</label>
                <select
                  value={hardwareAcc}
                  onChange={(e) => setHardwareAcc(e.target.value as HardwareAcceleration)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500 font-mono"
                >
                  <option value="VideoToolbox">Apple VideoToolbox (GPU)</option>
                  <option value="NVENC">NVIDIA NVENC (GPU)</option>
                  <option value="QuickSync">Intel QuickSync (GPU)</option>
                  <option value="Software">Software libx264 (CPU)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Target FPS</label>
                  <select
                    value={targetFps}
                    onChange={(e) => setTargetFps(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500 font-mono"
                  >
                    <option value={30}>30 FPS (Standard)</option>
                    <option value={60}>60 FPS (Smooth)</option>
                    <option value={24}>24 FPS (Cinematic)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Target Bitrate</label>
                  <select
                    value={targetBitrate}
                    onChange={(e) => setTargetBitrate(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500 font-mono"
                  >
                    <option value={2500}>2500 kbps (720p Low)</option>
                    <option value={4500}>4500 kbps (1080p Standard)</option>
                    <option value={6000}>6000 kbps (1080p High)</option>
                    <option value={9000}>9000 kbps (1080p/60 Premium)</option>
                  </select>
                </div>
              </div>

              <button
                type="submit"
                className="w-full bg-gradient-to-r from-red-600 via-indigo-600 to-indigo-700 hover:from-red-500 hover:to-indigo-600 text-white font-bold text-xs py-3 rounded-xl shadow-lg shadow-indigo-600/30 transition flex items-center justify-center space-x-2"
              >
                <Radio className="w-4 h-4 animate-pulse" />
                <span>START LIVE STREAM NOW</span>
              </button>
            </form>

            <div className="pt-2 border-t border-slate-800 space-y-2">
              <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Export 1-Click Terminal Executable
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={handleDownloadMacScript}
                  className="px-3 py-2 rounded-lg bg-slate-950 hover:bg-slate-900 border border-slate-800 text-[11px] font-mono text-slate-300 transition flex items-center justify-center space-x-1.5"
                >
                  <Download className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Mac Script (.sh)</span>
                </button>
                <button
                  type="button"
                  onClick={handleDownloadWindowsScript}
                  className="px-3 py-2 rounded-lg bg-slate-950 hover:bg-slate-900 border border-slate-800 text-[11px] font-mono text-slate-300 transition flex items-center justify-center space-x-1.5"
                >
                  <Download className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Win Script (.bat)</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Pre-flight Validation Modal */}
      {preflightOpen && activePlaylist && (
        <StreamValidatorModal
          playlist={activePlaylist}
          rtmpUrl={defaultRtmpUrls[selectedPlatform]}
          streamKey={streamKeyInput.trim()}
          hardwareAcc={hardwareAcc}
          onCancel={() => setPreflightOpen(false)}
          onConfirm={(bitrate, res, fps) => {
            // Apply recommended settings first
            useStudioStore.setState(s => ({
              settings: {
                ...s.settings,
                outputResolution: res as any,
                outputFps: fps as any,
                defaultBitrateKbps: bitrate
              }
            }));
            // Create and start stream BEFORE closing modal to avoid race condition
            if (pendingConfig) {
              const newInst = createStreamInstance(
                pendingConfig.name,
                pendingConfig.playlistId,
                pendingConfig.platform,
                pendingConfig.rtmpUrl,
                pendingConfig.streamKey,
                pendingConfig.hardwareAcc,
                pendingConfig.targetFps,
                bitrate
              );
              startStream(newInst.id);
            }
            setPreflightOpen(false);
            setPendingConfig(null);
          }}
        />
      )}
    </div>
  );
};
