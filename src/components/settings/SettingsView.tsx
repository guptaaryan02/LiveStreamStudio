import React from 'react';
import { useStudioStore } from '../../store/useStudioStore';
import { Settings as SettingsIcon, Zap, ShieldCheck, Moon, Terminal, Save, Key, CheckCircle2 } from 'lucide-react';
import { HardwareAcceleration } from '../../types';

export const SettingsView: React.FC = () => {
  const { settings, updateSettings } = useStudioStore();

  return (
    <div className="p-6 space-y-6 h-full overflow-y-auto pb-20">
      {/* Header */}
      <div className="border-b border-slate-800 pb-4">
        <h2 className="text-xl font-bold text-white tracking-tight flex items-center space-x-2">
          <SettingsIcon className="w-6 h-6 text-indigo-400" />
          <span>Application & Engine Settings</span>
        </h2>
        <p className="text-xs text-slate-400">
          Configure FFmpeg binary paths, hardware acceleration encoders, auto-recovery reconnection rules, and theme options.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Module 14: Hardware Acceleration & FFmpeg Settings */}
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-4">
          <h3 className="text-sm font-bold text-white flex items-center space-x-2">
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
                <option value="VideoToolbox">Apple VideoToolbox (Mac M1/M2/M3/Intel Hardware H.264)</option>
                <option value="NVENC">NVIDIA NVENC (Windows / Linux GeForce GPU)</option>
                <option value="QuickSync">Intel QuickSync (iGPU Hardware Acceleration)</option>
                <option value="Auto">Auto-Detect Best Hardware Encoder</option>
                <option value="Software">Software CPU Encoding (x264)</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">FFmpeg Binary Path</label>
              <input
                type="text"
                value={settings.ffmpegPath}
                onChange={(e) => updateSettings({ ffmpegPath: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 font-mono text-slate-200 focus:outline-none focus:border-indigo-500"
              />
              <p className="text-[10px] text-slate-500 mt-1">
                Bundled version included. Select a custom path if using custom compiled FFmpeg.
              </p>
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">Default Bitrate (Kbps)</label>
              <input
                type="number"
                value={settings.defaultBitrateKbps}
                onChange={(e) => updateSettings({ defaultBitrateKbps: parseInt(e.target.value) || 4500 })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 font-mono text-white focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Module 10: Auto Recovery Engine Settings */}
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-4">
          <h3 className="text-sm font-bold text-white flex items-center space-x-2">
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
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 font-mono text-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Maximum Retry Count</label>
                <input
                  type="number"
                  value={settings.maxRetryCount}
                  onChange={(e) => updateSettings({ maxRetryCount: parseInt(e.target.value) || 5 })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 font-mono text-white focus:outline-none"
                />
              </div>
            </div>

            <div className="pt-2 border-t border-slate-800">
              <label className="flex items-center space-x-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.desktopNotifications}
                  onChange={(e) => updateSettings({ desktopNotifications: e.target.checked })}
                  className="w-4 h-4 rounded bg-slate-950 border-slate-800 text-indigo-600 focus:ring-0"
                />
                <span className="font-semibold text-slate-200">Desktop Push Notifications</span>
              </label>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
