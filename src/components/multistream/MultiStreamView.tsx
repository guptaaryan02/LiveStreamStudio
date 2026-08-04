import React, { useState } from 'react';
import { useStudioStore } from '../../store/useStudioStore';
import {
  Layers,
  Play,
  Square,
  Pause,
  RefreshCw,
  Plus,
  Trash2,
  Globe,
  Radio,
  Activity,
  Cpu,
  HardDrive,
  CheckCircle2,
  AlertTriangle,
  Eye,
  EyeOff,
  Key,
} from 'lucide-react';
import { StreamPlatform, HardwareAcceleration } from '../../types';

export const MultiStreamView: React.FC = () => {
  const {
    instances,
    playlists,
    startStream,
    stopStream,
    pauseStream,
    resumeStream,
    deleteStreamInstance,
    simulateNetworkDrop,
    createStreamInstance,
    setActiveTab,
    setActiveInstanceId,
  } = useStudioStore();

  const [showAddModal, setShowAddModal] = useState(false);
  const [name, setName] = useState('');
  const [playlistId, setPlaylistId] = useState(playlists[0]?.id || '');
  const [platform, setPlatform] = useState<StreamPlatform>('youtube');
  const [rtmpUrl, setRtmpUrl] = useState('rtmp://a.rtmp.youtube.com/live2');
  const [streamKey, setStreamKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [hardwareAcc, setHardwareAcc] = useState<HardwareAcceleration>('VideoToolbox');

  const defaultRtmpUrls: Record<StreamPlatform, string> = {
    youtube: 'rtmp://a.rtmp.youtube.com/live2',
    facebook: 'rtmps://live-api-s.facebook.com:443/rtmp',
    twitch: 'rtmp://live.twitch.tv/app',
    custom: 'rtmp://localhost:1935/live',
  };

  const handlePlatformChange = (newPlatform: StreamPlatform) => {
    setPlatform(newPlatform);
    setRtmpUrl(defaultRtmpUrls[newPlatform]);
  };

  const handleCreateInstance = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !playlistId) {
      alert('Please enter an Instance Title and select a Playlist!');
      return;
    }
    if (!streamKey.trim()) {
      alert('Please paste your RTMP Stream Key before launching this instance!');
      return;
    }

    createStreamInstance(name.trim(), playlistId, platform, rtmpUrl, streamKey.trim(), hardwareAcc);
    setShowAddModal(false);
    setName('');
    setStreamKey('');
  };

  return (
    <div className="p-6 space-y-6 h-full overflow-y-auto pb-20 select-none">
      {/* Top Banner */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight flex items-center space-x-2">
            <Layers className="w-6 h-6 text-indigo-400" />
            <span>Multi-Stream Manager</span>
          </h2>
          <p className="text-xs text-slate-400">
            Broadcast to multiple channels and platforms simultaneously. Each instance runs an isolated FFmpeg process.
          </p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs px-4 py-2.5 rounded-xl transition shadow-lg shadow-indigo-600/20"
        >
          <Plus className="w-4 h-4" />
          <span>Launch Parallel Stream Instance</span>
        </button>
      </div>

      {/* Instance Summary Bar */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-xl">
          <div className="text-xs text-slate-400">Total Instances</div>
          <div className="text-xl font-bold text-white mt-1 font-mono">{instances.length}</div>
        </div>
        <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-xl">
          <div className="text-xs text-slate-400">Active Live Streams</div>
          <div className="text-xl font-bold text-emerald-400 mt-1 font-mono">
            {instances.filter((i) => i.status === 'live').length}
          </div>
        </div>
        <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-xl">
          <div className="text-xs text-slate-400">Combined Upload Bitrate</div>
          <div className="text-xl font-bold text-indigo-300 mt-1 font-mono">
            {(
              instances
                .filter((i) => i.status === 'live')
                .reduce((acc, curr) => acc + curr.metrics.bitrateKbps, 0) / 1000
            ).toFixed(2)}{' '}
            Mbps
          </div>
        </div>
        <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-xl">
          <div className="text-xs text-slate-400">Stream Health</div>
          <div className="text-xl font-bold text-emerald-400 mt-1 font-mono">100% Stability</div>
        </div>
      </div>

      {/* Instances Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {instances.map((inst) => {
          const playlist = playlists.find((p) => p.id === inst.playlistId);
          const isLive = inst.status === 'live';
          const isReconnecting = inst.status === 'reconnecting';

          return (
            <div
              key={inst.id}
              className={`p-5 rounded-2xl border space-y-4 transition ${
                isLive
                  ? 'bg-slate-900/90 border-indigo-500/50 shadow-xl shadow-indigo-950/40'
                  : isReconnecting
                  ? 'bg-slate-900/90 border-amber-500/50'
                  : 'bg-slate-900/50 border-slate-800'
              }`}
            >
              {/* Header */}
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <h3 className="font-bold text-sm text-white">{inst.name}</h3>
                    <span
                      className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded font-semibold ${
                        isLive
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : isReconnecting
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                          : 'bg-slate-800 text-slate-400 border border-slate-700'
                      }`}
                    >
                      {inst.status}
                    </span>
                  </div>
                  <div className="text-xs font-mono text-slate-400 flex items-center space-x-2">
                    <Globe className="w-3.5 h-3.5 text-indigo-400" />
                    <span className="capitalize">{inst.platform}</span>
                    <span>•</span>
                    <span>{inst.hardwareAcc}</span>
                  </div>
                </div>

                <div className="flex items-center space-x-1">
                  <button
                    onClick={() => deleteStreamInstance(inst.id)}
                    className="p-2 text-slate-500 hover:text-red-400 rounded-lg hover:bg-slate-800"
                    title="Delete Instance"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Playlist details */}
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-xs font-mono space-y-1">
                <div className="text-slate-400 flex justify-between">
                  <span>Playlist:</span>
                  <span className="text-slate-200 font-semibold">{playlist?.name || 'Default'}</span>
                </div>
                <div className="text-slate-400 flex justify-between">
                  <span>Target RTMP:</span>
                  <span className="text-indigo-400 truncate max-w-[200px]">{inst.rtmpUrl}</span>
                </div>
              </div>

              {/* Metrics telemetry bar if live */}
              {isLive && (
                <div className="grid grid-cols-3 gap-2 bg-slate-950/80 p-3 rounded-xl border border-slate-800 text-center font-mono text-xs">
                  <div>
                    <div className="text-[10px] text-slate-400">FPS</div>
                    <div className="font-bold text-emerald-400">{inst.metrics.fps}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400">Bitrate</div>
                    <div className="font-bold text-indigo-300">{(inst.metrics.bitrateKbps / 1000).toFixed(1)}M</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400">CPU</div>
                    <div className="font-bold text-amber-400">{inst.metrics.cpuPercent}%</div>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-2">
                <button
                  onClick={() => {
                    setActiveInstanceId(inst.id);
                    setActiveTab('dashboard');
                  }}
                  className="text-xs text-indigo-400 hover:underline font-medium"
                >
                  View Canvas Preview →
                </button>

                <div className="flex items-center space-x-2">
                  {isLive ? (
                    <>
                      <button
                        onClick={() => simulateNetworkDrop(inst.id)}
                        className="px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs rounded-lg transition font-mono"
                      >
                        ⚡ Simulate Drop
                      </button>
                      <button
                        onClick={() => stopStream(inst.id)}
                        className="flex items-center space-x-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white text-xs font-semibold rounded-lg shadow-md"
                      >
                        <Square className="w-3.5 h-3.5 fill-white" />
                        <span>Stop</span>
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => {
                        if (!inst.streamKey) {
                          alert('Please edit instance and paste a valid Stream Key before launching!');
                          return;
                        }
                        startStream(inst.id);
                      }}
                      className="flex items-center space-x-1.5 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg shadow-md"
                    >
                      <Play className="w-3.5 h-3.5 fill-white" />
                      <span>Start Stream</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal: Launch New Instance */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-lg space-y-4">
            <h3 className="text-base font-bold text-white">Create Parallel Stream Instance</h3>
            <form onSubmit={handleCreateInstance} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 mb-1">Instance Title</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Channel B - Facebook Livestream"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-1">Select Playlist</label>
                <select
                  value={playlistId}
                  onChange={(e) => setPlaylistId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none"
                >
                  {playlists.map((pl) => (
                    <option key={pl.id} value={pl.id}>
                      {pl.name} ({pl.videos.length} videos)
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 mb-1">Platform</label>
                  <select
                    value={platform}
                    onChange={(e) => handlePlatformChange(e.target.value as StreamPlatform)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white capitalize focus:outline-none"
                  >
                    <option value="youtube">YouTube</option>
                    <option value="facebook">Facebook</option>
                    <option value="twitch">Twitch</option>
                    <option value="custom">Custom RTMP</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 mb-1">Hardware Acceleration</label>
                  <select
                    value={hardwareAcc}
                    onChange={(e) => setHardwareAcc(e.target.value as HardwareAcceleration)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none"
                  >
                    <option value="VideoToolbox">Apple VideoToolbox</option>
                    <option value="NVENC">NVIDIA NVENC</option>
                    <option value="QuickSync">Intel QuickSync</option>
                    <option value="Software">Software CPU</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 mb-1">RTMP Server URL</label>
                <input
                  type="text"
                  value={rtmpUrl}
                  onChange={(e) => setRtmpUrl(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 font-mono text-slate-300 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-1 flex justify-between">
                  <span>Stream Key</span>
                  <span className="text-amber-400 text-[10px]">* Required</span>
                </label>
                <div className="relative flex items-center">
                  <Key className="w-3.5 h-3.5 text-slate-500 absolute left-3 z-10" />
                  <input
                    type={showKey ? 'text' : 'password'}
                    required
                    value={streamKey}
                    onChange={(e) => setStreamKey(e.target.value)}
                    placeholder="Paste RTMP Stream Key..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-10 py-2 font-mono text-white focus:outline-none select-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    className="absolute right-2.5 text-slate-500 hover:text-slate-200 p-1"
                  >
                    {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-lg text-slate-400 hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold shadow-md"
                >
                  Create & Save Instance
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
