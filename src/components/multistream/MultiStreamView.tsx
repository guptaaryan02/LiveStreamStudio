import { StreamKeyInput } from '../common/StreamKeyInput';
import { encoderLabel } from '../../services/streamHealth';
import { notify } from '../../services/uiFeedback';
import React, { useState } from 'react';
import { useStudioStore } from '../../store/useStudioStore';
import {
  Pencil,
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
import { StreamPlatform, HardwareAcceleration, StreamInstance } from '../../types';

export const MultiStreamView: React.FC = () => {
  const {
    instances,
    playlists,
    startStream,
    stopStream,
    startAllStreams,
    stopAllStreams,
    settings,
    pauseStream,
    resumeStream,
    deleteStreamInstance,
    simulateNetworkDrop,
    createStreamInstance,
    editStreamInstance,
    setActiveTab,
    setActiveInstanceId,
  } = useStudioStore();

  const [showAddModal, setShowAddModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [playlistId, setPlaylistId] = useState(playlists[0]?.id || '');
  const [platform, setPlatform] = useState<StreamPlatform>('youtube');
  const [rtmpUrl, setRtmpUrl] = useState('rtmp://a.rtmp.youtube.com/live2');
  const [streamKey, setStreamKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [hardwareAcc, setHardwareAcc] = useState<HardwareAcceleration>('Auto');
  const [bitrate, setBitrate] = useState(settings.defaultBitrateKbps || 4500);
  const [fps, setFps] = useState(30);

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

  const openInstance = (item?: StreamInstance) => {
    setEditingId(item?.id || null); setName(item?.name || ''); setPlaylistId(item?.playlistId || playlists[0]?.id || '');
    setPlatform(item?.platform || 'youtube'); setRtmpUrl(item?.rtmpUrl || defaultRtmpUrls.youtube); setStreamKey(item?.streamKey || '');
    setHardwareAcc(item?.hardwareAcc || 'Auto'); setBitrate(item?.targetBitrate || settings.defaultBitrateKbps || 4500); setFps(item?.fps || 30); setShowAddModal(true);
  };

  const handleCreateInstance = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !playlistId) {
      notify('Please enter an Instance Title and select a Playlist!');
      return;
    }
    if (!streamKey.trim()) {
      notify('Please paste your RTMP Stream Key before launching this instance!');
      return;
    }

    if (editingId) {
      if (!editStreamInstance(editingId, { name, playlistId, platform, rtmpUrl, streamKey, hardwareAcc, fps, targetBitrate: bitrate })) { notify('This stream is active. Edit it after it stops.'); return; }
    } else createStreamInstance(name.trim(), playlistId, platform, rtmpUrl, streamKey.trim(), hardwareAcc, fps, bitrate);
    setShowAddModal(false);
    setName('');
    setStreamKey('');
  };

  return (
    <div className="p-6 space-y-6 h-full overflow-y-auto pb-20 select-none">
      {/* Top Banner */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-xl font-bold text-studio-foreground tracking-tight flex items-center space-x-2">
            <Layers className="w-6 h-6 text-indigo-400" />
            <span>Multi-Stream Manager</span>
          </h2>
          <p className="text-xs text-slate-400">
            Broadcast to multiple channels and platforms simultaneously. Matching desktop streams share one encoder. Each destination keeps its own upload connection.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => void startAllStreams()} disabled={!instances.some((i) => ['idle', 'error'].includes(i.status))}
          className="px-3 py-2 rounded-xl text-xs bg-emerald-700 text-white disabled:opacity-40">Start All</button>
        <button onClick={() => void stopAllStreams()} disabled={!instances.some((i) => ['live', 'connecting', 'reconnecting', 'paused'].includes(i.status))}
          className="px-3 py-2 rounded-xl text-xs bg-red-800 text-white disabled:opacity-40">Stop All</button>
        <button
          onClick={() => openInstance()}
          className="flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs px-4 py-2.5 rounded-xl transition shadow-lg shadow-indigo-600/20"
        >
          <Plus className="w-4 h-4" />
          <span>Add Stream Destination</span>
        </button>
        </div>
      </div>

      {/* Instance Summary Bar */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-xl">
          <div className="text-xs text-slate-400">Total Instances</div>
          <div className="text-xl font-bold text-studio-foreground mt-1 font-mono">{instances.length}</div>
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
          <div className="text-sm font-bold text-slate-200 mt-1 font-mono">{instances.filter((i) => i.status === 'error').length} errors · {instances.filter((i) => i.status === 'reconnecting').length} reconnecting</div>
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
              {isLive && inst.uptimeSeconds>10 && inst.slowOutputSince!==undefined && Date.now()-inst.slowOutputSince>5000 && <div role="alert" className="mb-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-400">Output is falling behind: {inst.metrics.fps.toFixed(1)} / {inst.fps} FPS. Viewers may buffer. Use hardware decoding or a stream-sized source; check upload capacity.</div>}
              {inst.pipelineId && ['live','connecting'].includes(inst.status) && <p className="mb-2 text-xs text-indigo-400">{(inst.sharedDestinations || 1)>1 ? `Shared encoding · ${inst.sharedDestinations} destinations` : 'One encoding pipeline'} · {inst.bufferSeconds?.toFixed(1) || '0.0'}s source buffer</p>}
              {/* Header */}
              {inst.status === 'error' && <div role="alert" className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-300 break-words">{inst.lastStopReason || 'Stream ended unexpectedly. Open Logs for retained diagnostics.'}{inst.lastFailure && <p className="mt-1">{inst.lastFailure}</p>}</div>}
              {inst.status === 'idle' && inst.lastStopReason && <p className="text-xs text-slate-400">{inst.lastStopReason}</p>}
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <h3 className="font-bold text-sm text-studio-foreground">{inst.name}</h3>
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
                    <span>{encoderLabel(inst.hardwareAcc,inst.outputMode)}</span>
                  </div>
                </div>

                <div className="flex items-center space-x-1">
                  <button onClick={() => openInstance(inst)} disabled={! ['idle', 'error'].includes(inst.status)} title="Edit instance (available when stopped)" aria-label={`Edit instance ${inst.name}`} className="p-2 text-indigo-400 disabled:opacity-30"><Pencil className="w-4 h-4" /></button>
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
              {inst.playbackLoopLimit && <p className="text-xs text-amber-400">Stops after {inst.playbackLoopLimit} complete playlist {inst.playbackLoopLimit === 1 ? 'loop' : 'loops'}.</p>}
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
                  {['live', 'connecting', 'reconnecting'].includes(inst.status) ? (
                    <>
                      <button
                        disabled={!isLive}
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
                          notify('Please edit instance and paste a valid Stream Key before launching!');
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
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto space-y-4">
            <h3 className="text-base font-bold text-studio-foreground">{editingId ? 'Edit Stream Instance' : 'Create Parallel Stream Instance'}</h3>
            <form onSubmit={handleCreateInstance} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 mb-1">Instance Title</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Channel B - Facebook Livestream"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-studio-foreground focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-1">Select Playlist</label>
                <select
                  value={playlistId}
                  onChange={(e) => setPlaylistId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-studio-foreground focus:outline-none"
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
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-studio-foreground capitalize focus:outline-none"
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
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-studio-foreground focus:outline-none"
                  >
                    <option value="Auto">Auto (stable bitrate)</option>
                    <option value="VideoToolbox">Apple VideoToolbox</option>
                    <option value="NVENC">NVIDIA NVENC</option>
                    <option value="QuickSync">Intel QuickSync</option>
                    <option value="Software">Software CPU</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <label className="text-slate-300">Video bitrate (Kbps)
                  <input type="number" min="300" max="100000" required value={bitrate}
                    onChange={(e) => setBitrate(Number(e.target.value))}
                    className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-studio-foreground" />
                </label>
                <label className="text-slate-300">Frame rate
                  <select value={fps} onChange={(e) => setFps(Number(e.target.value))}
                    className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-studio-foreground">
                    {[24, 25, 30, 50, 60].map((rate) => <option key={rate} value={rate}>{rate} FPS</option>)}
                  </select>
                </label>
              </div>
              <p className="text-[11px] text-slate-400">Use a separate stream key for each simultaneous broadcast. Upload usage and encoding work add up across destinations.</p>

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
                <StreamKeyInput value={streamKey} onChange={setStreamKey} label="Destination stream key" required />
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
                  {editingId ? 'Save Changes' : 'Create & Save Instance'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
