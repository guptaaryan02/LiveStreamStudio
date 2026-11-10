import { notificationPermission, deliverNotification, type NotificationPermission } from '../../services/desktopNotifications';
import React, { useEffect, useState } from 'react';
import { useStudioStore } from '../../store/useStudioStore';
import { Settings as SettingsIcon, Zap, ShieldCheck, Moon, Terminal, Save, Key, CheckCircle2 } from 'lucide-react';
import { HardwareAcceleration } from '../../types';
import { FFmpegInfo, isTauriEnvironment, getFFmpegInfo, selectCustomFFmpegBinary } from '../../services/tauriEngine';

export const SettingsView: React.FC = () => {
  const { settings, updateSettings } = useStudioStore();
  const [ffmpegInfo, setFfmpegInfo] = useState<FFmpegInfo | null>(null);
  const [checkingFfmpeg, setCheckingFfmpeg] = useState(false);
  const [updateMessage, setUpdateMessage] = useState('');
  const [notificationStatus,setNotificationStatus]=useState<NotificationPermission>('default');
  const [notificationMessage,setNotificationMessage]=useState('');
  const [notificationBusy,setNotificationBusy]=useState(false);
  useEffect(()=>{void notificationPermission().then((permission)=>{setNotificationStatus(permission);if(permission!=='granted') updateSettings({desktopNotifications:false});}).catch(()=>setNotificationMessage('Could not read notification permission.'));},[]);
  const configureNotifications=async (enabled:boolean)=>{
    if(!enabled) {updateSettings({desktopNotifications:false});return;}
    setNotificationBusy(true);
    try {
      const permission=await notificationPermission(true); setNotificationStatus(permission);
      updateSettings({desktopNotifications:permission==='granted'});
      setNotificationMessage(permission==='granted' ? 'Stream alerts are enabled.' : 'Notifications are blocked. Allow them in system or browser notification settings, then enable again.');
    } catch(error) {updateSettings({desktopNotifications:false});setNotificationMessage(`Could not enable notifications: ${String(error)}`);}
    finally {setNotificationBusy(false);}
  };
  const testNotification=async()=>{
    setNotificationBusy(true);
    try {
      const permission=await notificationPermission(true); setNotificationStatus(permission);
      if(permission!=='granted') {setNotificationMessage('Notification permission was not granted. Check system or browser settings.');return;}
      const sent=await deliverNotification('LiveStream Studio','Test notification: stream alerts are working.');
      setNotificationMessage(sent ? 'Test notification sent. Check Notification Center; Focus mode may silence the banner.' : 'Notification was not sent.');
    } catch(error) {setNotificationMessage(`Notification failed: ${String(error)}`);}
    finally {setNotificationBusy(false);}
  };

  const displayVersion = ffmpegInfo?.version.match(/ffmpeg version\s+([^\s]+)/i)?.[1] || ffmpegInfo?.version || 'Unknown';

  const refreshFfmpegInfo = async () => {
    setCheckingFfmpeg(true);
    const info = await getFFmpegInfo(settings.useCustomFfmpeg ? settings.ffmpegPath : undefined);
    setFfmpegInfo(info);
    setCheckingFfmpeg(false);
    return info;
  };

  useEffect(() => {
    refreshFfmpegInfo();
  }, [settings.useCustomFfmpeg, settings.ffmpegPath]);

  const handleSelectCustomFfmpeg = async () => {
    const selected = await selectCustomFFmpegBinary();
    if (!selected) return;
    updateSettings({ useCustomFfmpeg: true, ffmpegPath: selected });
  };

  const handleCheckUpdates = async () => {
    const info = await refreshFfmpegInfo();
    if (!info?.available) {
      setUpdateMessage('FFmpeg was not found. Add bundled binaries or choose a custom build.');
      return;
    }
    const version = info.version.match(/ffmpeg version\s+([^\s]+)/i)?.[1] || info.version;
    setUpdateMessage(`Using ${info.source} FFmpeg ${version}.`);
  };

  return (
    <div className="p-6 space-y-6 h-full overflow-y-auto pb-20">
      {/* Header */}
      <div className="border-b border-slate-800 pb-4">
        <h2 className="text-xl font-bold text-studio-foreground tracking-tight flex items-center space-x-2">
          <SettingsIcon className="w-6 h-6 text-indigo-400" />
          <span>Application & Engine Settings</span>
        </h2>
        <p className="text-xs text-slate-400">
          Configure FFmpeg binary paths, hardware acceleration encoders, auto-recovery reconnection rules, and theme options.
        </p>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
        <label className="text-sm font-semibold text-studio-foreground" htmlFor="studio-theme">Appearance</label>
        <select id="studio-theme" value={settings.theme} onChange={(e)=>updateSettings({theme:e.target.value as 'dark'|'light'|'system'})} className="ml-4 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100">
          <option value="dark">Dark</option><option value="light">Light</option><option value="system">Follow system</option>
        </select>
      </div>
      <label className="flex items-center gap-3 text-sm text-slate-300"><input type="checkbox" checked={settings.pausePreviewByDefault!==false} onChange={(e)=>updateSettings({pausePreviewByDefault:e.target.checked})}/>Start local video preview paused to save resources</label>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Module 14: Hardware Acceleration & FFmpeg Settings */}
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-4">
          <h3 className="text-sm font-bold text-studio-foreground flex items-center space-x-2">
            <Zap className="w-4 h-4 text-amber-400" />
            <span>FFmpeg Hardware Acceleration & Binary</span>
          </h3>

          <div className="space-y-3 text-xs">
            <div>
              <label className="block text-slate-300 font-semibold mb-1">Hardware Acceleration GPU Preset</label>
              <select
                value={settings.hardwareAcc}
                onChange={(e) => updateSettings({ hardwareAcc: e.target.value as HardwareAcceleration })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 font-mono focus:outline-none focus:border-indigo-500"
              >
                <option value="Auto">Auto-Detect Best Hardware Encoder</option>
                <option value="VideoToolbox">Apple VideoToolbox (Mac M1/M2/M3/Intel Hardware H.264)</option>
                <option value="NVENC">NVIDIA NVENC (Windows / Linux GeForce GPU)</option>
                <option value="QuickSync">Intel QuickSync (iGPU Hardware Acceleration)</option>
                <option value="Software">Software CPU Encoding (x264)</option>
              </select>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">FFmpeg Version</label>
                  <div className="font-mono text-slate-100">{checkingFfmpeg ? 'Checking...' : displayVersion}</div>
                  <div className="text-[10px] text-slate-500 uppercase tracking-wider">
                    {ffmpegInfo?.source || 'unknown'} engine
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleCheckUpdates}
                  className="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold"
                >
                  Check for Updates
                </button>
              </div>

              <label className="flex items-center space-x-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.useCustomFfmpeg}
                  onChange={(e) => updateSettings({ useCustomFfmpeg: e.target.checked })}
                  className="w-4 h-4 rounded bg-slate-950 border-slate-800 text-indigo-600 focus:ring-0"
                />
                <span className="font-semibold text-slate-200">Use Custom FFmpeg</span>
              </label>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={settings.ffmpegPath}
                  disabled={!settings.useCustomFfmpeg}
                  onChange={(e) => updateSettings({ ffmpegPath: e.target.value })}
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 font-mono text-slate-200 focus:outline-none focus:border-indigo-500 disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={handleSelectCustomFfmpeg}
                  className="px-3 py-2 rounded-lg border border-slate-700 text-slate-200 hover:bg-slate-800 font-semibold"
                >
                  Browse
                </button>
              </div>

              <p className="text-[10px] text-slate-500">
                Bundled FFmpeg is used by default. Custom builds are for advanced encoder or codec setups.
              </p>
              {updateMessage && <p className="text-[10px] text-emerald-400">{updateMessage}</p>}
              <p className="text-[11px] text-slate-400">Auto uses software CBR to maintain the target during static scenes. GPU encoders can use less CPU, but their bitrate may fall below the target on logos or still pictures.</p>
              {isTauriEnvironment() && <label className="flex items-start gap-3 cursor-pointer border-t border-slate-800 pt-3">
                <input type="checkbox" checked={settings.sharedEncodingEnabled!==false} onChange={(e)=>updateSettings({sharedEncodingEnabled:e.target.checked})}/>
                <span><span className="font-semibold text-slate-200">Share encoding for matching streams</span><span className="block text-xs text-slate-400 mt-1">New destinations with the same ordered playlist and output settings join the current playback. Turn off to start each destination from the beginning. Applies to newly started streams. Upload bandwidth is still required for every destination.</span></span>
              </label>}
              <label className="flex items-start gap-3 cursor-pointer border-t border-slate-800 pt-3">
                <input type="checkbox" checked={settings.useSourceBitrate === true}
                  onChange={(e) => updateSettings({ useSourceBitrate: e.target.checked })} />
                <span><span className="font-semibold text-slate-200">Use source bitrate (fast passthrough)</span>
                  <span className="block text-[11px] text-slate-400 mt-1">Off by default. Constant-bitrate encoding keeps static clips and logos near your selected output rate. Passthrough saves CPU but ignores the target bitrate for matching files.</span>
                </span>
              </label>
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">Default Bitrate (Kbps)</label>
              <input
                type="number"
                value={settings.defaultBitrateKbps}
                onChange={(e) => updateSettings({ defaultBitrateKbps: parseInt(e.target.value) || 4500 })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 font-mono text-studio-foreground focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Module 10: Auto Recovery Engine Settings */}
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-4">
          <h3 className="text-sm font-bold text-studio-foreground flex items-center space-x-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Auto Recovery & Network Resiliency</span>
          </h3>

          <div className="space-y-4 text-xs">
            <label className="flex items-center space-x-3 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.autoRecoveryEnabled}
                onChange={(e) => updateSettings({ autoRecoveryEnabled: e.target.checked })}
                className="w-4 h-4 rounded bg-slate-950 border-slate-800 text-indigo-600 focus:ring-0"
              />
              <div>
                <span className="font-semibold text-slate-200">Enable Automatic Stream Recovery</span>
                <p className="text-[11px] text-slate-400">
                  Automatically restarts FFmpeg process and re-establishes RTMP handshake if internet disconnects.
                </p>
              </div>
            </label>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Retry Interval (Seconds)</label>
                <input
                  type="number"
                  value={settings.retryIntervalSeconds}
                  onChange={(e) => updateSettings({ retryIntervalSeconds: parseInt(e.target.value) || 3 })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 font-mono text-studio-foreground focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Maximum Retry Count</label>
                <input
                  type="number"
                  value={settings.maxRetryCount}
                  onChange={(e) => updateSettings({ maxRetryCount: parseInt(e.target.value) || 5 })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 font-mono text-studio-foreground focus:outline-none"
                />
              </div>
            </div>

            <div className="pt-2 border-t border-slate-800">
              <label className="flex items-center space-x-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.desktopNotifications}
                  disabled={notificationBusy}
                  onChange={(e) => {void configureNotifications(e.target.checked);}}
                  className="w-4 h-4 rounded bg-slate-950 border-slate-800 text-indigo-600 focus:ring-0"
                />
                <span className="font-semibold text-slate-200">Desktop Push Notifications</span>
              </label>
              <p className="mt-2 text-xs text-slate-400">Alerts for live output, disconnects, errors and stopped streams. Permission: {notificationStatus}.</p>
              <button type="button" disabled={notificationBusy} onClick={()=>{void testNotification();}} className="mt-3 rounded-lg bg-indigo-600 px-3 py-2 text-xs text-white disabled:opacity-50">Test notification</button>
              {notificationMessage && <p role="status" className="mt-2 text-xs text-slate-300">{notificationMessage}</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
