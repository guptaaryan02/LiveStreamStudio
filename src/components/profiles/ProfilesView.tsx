import React, { useState } from 'react';
import { useStudioStore } from '../../store/useStudioStore';
import { SlidersHorizontal, Plus, Play, Trash2, Globe, Radio, Zap, Eye, EyeOff, Key } from 'lucide-react';
import { StreamPlatform, HardwareAcceleration } from '../../types';

export const ProfilesView: React.FC = () => {
  const { profiles, saveProfile, deleteProfile, launchProfile, playlists, setActiveTab } = useStudioStore();
  const [showAddModal, setShowAddModal] = useState(false);
  const [name, setName] = useState('');
  const [playlistId, setPlaylistId] = useState(playlists[0]?.id || '');
  const [platform, setPlatform] = useState<StreamPlatform>('youtube');
  const [rtmpUrl, setRtmpUrl] = useState('rtmp://a.rtmp.youtube.com/live2');
  const [streamKey, setStreamKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [hardwareAcc, setHardwareAcc] = useState<HardwareAcceleration>('VideoToolbox');
  const [targetBitrateKbps, setTargetBitrateKbps] = useState(4500);

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

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !playlistId) {
      alert('Please enter a Profile Name and select a Playlist!');
      return;
    }
    if (!streamKey.trim()) {
      alert('Please paste your RTMP Stream Key before saving this profile!');
      return;
    }

    saveProfile({
      name: name.trim(),
      playlistId,
      platform,
      rtmpUrl,
      streamKey: streamKey.trim(),
      repeatCount: -1,
      isInfiniteLoop: true,
      hardwareAcc,
      targetBitrateKbps,
      resolution: '1080p60',
      fps: 60,
    });

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
            <SlidersHorizontal className="w-6 h-6 text-indigo-400" />
            <span>Stream Profiles & Presets</span>
          </h2>
          <p className="text-xs text-slate-400">
            Save custom broadcast presets (Playlist + RTMP Target + Hardware Encoder) for instant 1-click execution.
          </p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs px-4 py-2.5 rounded-xl transition shadow-lg shadow-indigo-600/20"
        >
          <Plus className="w-4 h-4" />
          <span>Save New Profile</span>
        </button>
      </div>

      {/* Profiles Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {profiles.map((prof) => {
          const playlist = playlists.find((p) => p.id === prof.playlistId);
          return (
            <div
              key={prof.id}
              className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-4 hover:border-slate-700 transition flex flex-col justify-between"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-bold text-sm text-white">{prof.name}</h3>
                    <div className="text-xs text-indigo-400 font-mono capitalize flex items-center space-x-1 mt-0.5">
                      <Globe className="w-3.5 h-3.5" />
                      <span>{prof.platform}</span>
                    </div>
                  </div>

                  <button
                    onClick={() => deleteProfile(prof.id)}
                    className="p-1.5 text-slate-500 hover:text-red-400 rounded-lg hover:bg-slate-800"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-xs font-mono space-y-1 text-slate-300">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Playlist:</span>
                    <span className="font-semibold text-slate-200">{playlist?.name || 'Default'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Encoder:</span>
                    <span className="text-emerald-400 font-semibold">{prof.hardwareAcc}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Bitrate:</span>
                    <span className="text-amber-400">{prof.targetBitrateKbps} Kbps ({prof.resolution})</span>
                  </div>
                </div>
              </div>

              <button
                onClick={() => {
                  if (!prof.streamKey) {
                    alert('Please edit profile and paste a valid Stream Key!');
                    return;
                  }
                  launchProfile(prof.id);
                  setActiveTab('dashboard');
                }}
                className="w-full bg-gradient-to-r from-red-600 to-indigo-600 hover:from-red-500 hover:to-indigo-500 text-white font-bold text-xs py-2.5 rounded-xl shadow-md transition flex items-center justify-center space-x-2 mt-4"
              >
                <Radio className="w-4 h-4 animate-pulse" />
                <span>Launch Profile Live</span>
              </button>
            </div>
          );
        })}
      </div>

      {/* Modal: Save Profile */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-md space-y-4">
            <h3 className="text-base font-bold text-white">Save Stream Profile Preset</h3>
            <form onSubmit={handleSaveProfile} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 mb-1">Profile Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. YouTube 4K Morning Krishna"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-1">Playlist</label>
                <select
                  value={playlistId}
                  onChange={(e) => setPlaylistId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none"
                >
                  {playlists.map((pl) => (
                    <option key={pl.id} value={pl.id}>
                      {pl.name}
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
                  <label className="block text-slate-300 mb-1">Hardware Encoder</label>
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

              <div>
                <label className="block text-slate-300 mb-1">Target Bitrate (Kbps)</label>
                <input
                  type="number"
                  value={targetBitrateKbps}
                  onChange={(e) => setTargetBitrateKbps(parseInt(e.target.value) || 4500)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 font-mono text-white focus:outline-none"
                />
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
                  Save Profile
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
