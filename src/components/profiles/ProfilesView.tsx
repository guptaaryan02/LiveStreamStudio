import { StreamKeyInput } from '../common/StreamKeyInput';
import { notify } from '../../services/uiFeedback';
import React, { useState } from 'react';
import { useStudioStore } from '../../store/useStudioStore';
import { SlidersHorizontal, Plus, Play, Trash2, Globe, Radio, Zap, Eye, EyeOff, Key } from 'lucide-react';
import { StreamPlatform, HardwareAcceleration } from '../../types';

export const ProfilesView: React.FC = () => {
  const { profiles, saveProfile, deleteProfile, launchProfile, playlists, setActiveTab, rememberProfileKey, loadProfileKey, removeSavedProfileKey, setProfileSessionKey } = useStudioStore();
  const native = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
  const [showAddModal, setShowAddModal] = useState(false);
  const [name, setName] = useState('');
  const [playlistId, setPlaylistId] = useState(playlists[0]?.id || '');
  const [platform, setPlatform] = useState<StreamPlatform>('youtube');
  const [rtmpUrl, setRtmpUrl] = useState('rtmp://a.rtmp.youtube.com/live2');
  const [streamKey, setStreamKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [hardwareAcc, setHardwareAcc] = useState<HardwareAcceleration>('Auto');
  const [targetBitrateKbps, setTargetBitrateKbps] = useState(4500);
  const [fps, setFps] = useState(30);
  const [rememberKey, setRememberKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [keyAction, setKeyAction] = useState<{id:string; action:'load'|'save'|'remove'|'enter'|'delete'} | null>(null);
  const [sessionKey, setSessionKey] = useState('');
  const selectedProfile = profiles.find((p) => p.id === keyAction?.id);
  const beginKeyAction = (id:string, action:'load'|'save'|'remove'|'enter'|'delete') => {setSessionKey('');setRememberKey(false);setKeyAction({id,action});};
  const performKeyAction = async () => {
    if (!keyAction || !selectedProfile) return;
    setBusy(true);
    let ok = true;
    try {
      if (keyAction.action === 'load') ok = await loadProfileKey(keyAction.id);
      if (keyAction.action === 'save') ok = await rememberProfileKey(keyAction.id);
      if (keyAction.action === 'remove') ok = await removeSavedProfileKey(keyAction.id);
      if (keyAction.action === 'delete') {
        if (native && selectedProfile.keyStorage !== 'session') ok = await removeSavedProfileKey(keyAction.id);
        if (ok) deleteProfile(keyAction.id);
      }
      if (keyAction.action === 'enter') {
        if (!sessionKey.trim()) {notify('Enter a stream key.');return;}
        setProfileSessionKey(keyAction.id,sessionKey);
        if (native && rememberKey) ok = await rememberProfileKey(keyAction.id);
      }
      if (ok) {setKeyAction(null);setSessionKey('');notify('Stream key settings updated.');}
      else notify('Keychain access did not complete. You can cancel and enter a key for this session.');
    } catch {notify('Could not complete this key operation. Your session key is still available if already loaded.');}
    finally {setBusy(false);}
  };

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

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !playlistId) {
      notify('Please enter a Profile Name and select a Playlist!');
      return;
    }
    if (!streamKey.trim()) {
      notify('Please paste your RTMP Stream Key before saving this profile!');
      return;
    }

    setBusy(true);
    const saved = saveProfile({
      name: name.trim(),
      playlistId,
      platform,
      rtmpUrl,
      streamKey: streamKey.trim(),
      repeatCount: playlists.find((p)=>p.id===playlistId)?.repeatCount ?? 1,
      isInfiniteLoop: playlists.find((p)=>p.id===playlistId)?.isInfiniteLoop ?? false,
      hardwareAcc,
      targetBitrateKbps,
      resolution: `1080p${fps}`,
      fps,
    });

    setShowAddModal(false);
    setName('');
    setStreamKey('');
    if (native && rememberKey) {
      if (!await rememberProfileKey(saved.id)) notify('Profile saved for this session. The key was not saved in Keychain; you can retry from the profile card.');
    }
    setRememberKey(false);
    setBusy(false);
  };

  return (
    <div className="p-6 space-y-6 h-full overflow-y-auto pb-20 select-none">
      {/* Top Banner */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-xl font-bold text-studio-foreground tracking-tight flex items-center space-x-2">
            <SlidersHorizontal className="w-6 h-6 text-indigo-400" />
            <span>Stream Profiles & Presets</span>
          </h2>
          <p className="text-xs text-slate-400">
            Save custom broadcast presets (Playlist + RTMP Target + Hardware Encoder) for instant 1-click execution.
          </p>
        </div>

        <button
          disabled={busy}
          onClick={() => {setRememberKey(false);setShowAddModal(true);}}
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
                    <h3 className="font-bold text-sm text-studio-foreground">{prof.name}</h3>
                    <div className="text-xs text-indigo-400 font-mono capitalize flex items-center space-x-1 mt-0.5">
                      <Globe className="w-3.5 h-3.5" />
                      <span>{prof.platform}</span>
                    </div>
                  </div>

                  <button
                    aria-label={`Delete profile ${prof.name}`}
                    disabled={busy}
                    onClick={() => beginKeyAction(prof.id,'delete')}
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
                <div className="mt-3 space-y-2 text-xs">
                  <p className={prof.streamKey ? 'text-emerald-400' : 'text-amber-400'}>{prof.streamKey ? 'Stream key ready for this session' : 'Stream key not loaded — prepare it before scheduling'}</p>
                  <p className="text-slate-400">{!native || prof.keyStorage === 'session' ? 'Storage: session only' : prof.keyStorage === 'keychain' ? 'A saved copy is available in Keychain' : 'Older profile: check for a saved Keychain copy when needed'}</p>
                  <div className="flex flex-wrap gap-2">
                    <button disabled={busy} onClick={() => beginKeyAction(prof.id,'enter')} className="rounded bg-slate-800 px-2 py-1.5">Enter session key</button>
                    {native && prof.keyStorage !== 'session' && !prof.streamKey && <button disabled={busy} onClick={() => beginKeyAction(prof.id,'load')} className="rounded bg-indigo-700 px-2 py-1.5">Load saved key</button>}
                    {native && prof.streamKey && <button disabled={busy} onClick={() => beginKeyAction(prof.id,'save')} className="rounded bg-slate-800 px-2 py-1.5">{prof.keyStorage === 'keychain' ? 'Update saved key' : 'Save key in Keychain'}</button>}
                    {native && prof.keyStorage !== 'session' && <button disabled={busy} onClick={() => beginKeyAction(prof.id,'remove')} className="underline">Remove saved key</button>}
                  </div>
                </div>
              </div>

              <button
                disabled={busy}
                onClick={async () => {
                  const launched = await launchProfile(prof.id);
                  if (launched) {
                    setActiveTab('dashboard');
                  } else notify('Prepare this profile’s stream key before launching: load its saved key or enter a session key.');
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
      {busy && <p role="status" className="text-xs text-indigo-400">Waiting for the requested Keychain operation. Complete or cancel any system prompt.</p>}

      {keyAction && selectedProfile && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
        <div role="dialog" aria-modal="true" aria-labelledby="credential-dialog-title" className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-6 space-y-4 text-sm">
          <h3 id="credential-dialog-title" className="font-bold text-studio-foreground">{({load:'Load saved stream key',save:'Save stream key in Keychain',remove:'Remove saved stream key',enter:'Enter stream key for this session',delete:'Delete stream profile'})[keyAction.action]}</h3>
          <p>Profile: <strong>{selectedProfile.name}</strong> · {selectedProfile.platform}</p>
          {keyAction.action === 'load' && <p>Studio will read this profile’s saved stream key from Keychain and keep it in memory for this session. It uses the key to connect to your configured streaming server. Loading it also enables any due automatic schedules for this profile.</p>}
          {keyAction.action === 'save' && <p>Studio will securely save this profile’s stream key on this Mac so you can load it again after restarting the app.</p>}
          {keyAction.action === 'remove' && <p>Studio will delete this profile’s saved key from Keychain. A key already loaded for this session stays ready until Studio closes.</p>}
          {keyAction.action === 'delete' && <p>This removes the profile{native && selectedProfile.keyStorage !== 'session' ? ' and its saved stream key from Keychain' : ''}. Schedules using this profile will need another profile.</p>}
          {keyAction.action === 'enter' && <>
            <div className="block"><p>Stream key</p><StreamKeyInput value={sessionKey} onChange={setSessionKey} label="Session stream key" /></div>
            <p>The key stays in memory until Studio closes. Enter or load it again after restarting Studio.</p>
            {native && <label className="flex gap-2"><input type="checkbox" checked={rememberKey} onChange={(e) => setRememberKey(e.target.checked)} />Also save this key securely in Keychain on this Mac</label>}
            {native && selectedProfile.keyStorage !== 'session' && !rememberKey && <p className="text-xs text-slate-400">The existing Keychain copy remains available separately.</p>}
          </>}
          {native && (keyAction.action !== 'enter' || rememberKey) && (keyAction.action !== 'delete' || selectedProfile.keyStorage !== 'session') && <p className="rounded bg-slate-950 p-3 text-xs text-slate-300">macOS may show “com.livestreamstudio.streamkeys” for this stream key and ask for your login Keychain password, usually your Mac login password. Enter it in the macOS dialog. “Always Allow” remembers access for this item.</p>}
          <div className="flex justify-end gap-3">
            <button disabled={busy} onClick={() => {setKeyAction(null);setSessionKey('');}} className="rounded bg-slate-800 px-3 py-2">Cancel</button>
            <button disabled={busy || (keyAction.action === 'enter' && !sessionKey.trim())} onClick={() => void performKeyAction()} className="rounded bg-indigo-600 px-3 py-2">{busy ? 'Waiting…' : ({load:'Load this stream key',save:'Save this stream key',remove:'Remove saved copy',enter:'Use this key',delete:'Delete profile'})[keyAction.action]}</button>
          </div>
        </div>
      </div>}

      {/* Modal: Save Profile */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto space-y-4">
            <h3 className="text-base font-bold text-studio-foreground">Save Stream Profile Preset</h3>
            <form onSubmit={handleSaveProfile} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 mb-1">Profile Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. YouTube 4K Morning Krishna"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-studio-foreground focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-1">Playlist</label>
                <select
                  value={playlistId}
                  onChange={(e) => setPlaylistId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-studio-foreground focus:outline-none"
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
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-studio-foreground capitalize focus:outline-none"
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
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-studio-foreground focus:outline-none"
                  >
                    <option value="Auto">Auto-detect best encoder</option>
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
                <StreamKeyInput value={streamKey} onChange={setStreamKey} label="Profile stream key" required />
              </div>

              <div>
                <label className="block text-slate-300 mb-1">RTMP Server URL</label>
                <input aria-label="Profile RTMP Server URL" required value={rtmpUrl} onChange={(e)=>setRtmpUrl(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-studio-foreground" />
              </div>
              <div>
                <label className="block text-slate-300 mb-1">Target FPS</label>
                <select aria-label="Profile Target FPS" value={fps} onChange={(e)=>setFps(Number(e.target.value))} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-studio-foreground">
                  <option value={24}>24 FPS</option><option value={30}>30 FPS</option><option value={60}>60 FPS</option>
                </select>
              </div>
              <div>
                <label className="block text-slate-300 mb-1">Target Bitrate (Kbps)</label>
                <input
                  type="number" min={100} max={100000} required
                  value={targetBitrateKbps}
                  onChange={(e) => setTargetBitrateKbps(parseInt(e.target.value) || 4500)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 font-mono text-studio-foreground focus:outline-none"
                />
              </div>

              <fieldset className="space-y-2 rounded-xl border border-slate-700 p-3">
                <legend className="px-1 font-semibold">Stream key storage</legend>
                <label className="flex gap-2"><input type="radio" name="key-storage" checked={!rememberKey} onChange={() => setRememberKey(false)} />Use for this session only (default)</label>
                {native && <label className="flex gap-2"><input type="radio" name="key-storage" checked={rememberKey} onChange={() => setRememberKey(true)} />Save securely in macOS Keychain</label>}
                <p className="text-slate-400">{rememberKey ? 'Studio will save only this profile’s stream key on this Mac. macOS may show “com.livestreamstudio.streamkeys” and ask for your Mac login password. After restarting Studio, choose Load saved key to prepare it again.' : 'The profile is saved, but its key stays only in memory until Studio closes. Enter the key again after restarting. No Keychain access is requested.'}</p>
                <p className="text-amber-400">Prepare the key before leaving a scheduled stream unattended.</p>
              </fieldset>
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
                  disabled={busy}
                  className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold shadow-md"
                >
                  {native && rememberKey ? 'Save Profile & Key in Keychain' : 'Save Profile for This Session'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
