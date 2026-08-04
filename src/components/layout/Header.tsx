import React from 'react';
import { useStudioStore } from '../../store/useStudioStore';
import { Radio, Cpu, HardDrive, Zap, Bell, Moon, Sun, PlusCircle, Activity } from 'lucide-react';

export const Header: React.FC = () => {
  const { instances, settings, updateSettings, setActiveTab } = useStudioStore();
  const liveCount = instances.filter((i) => i.status === 'live').length;
  const totalCpu = instances
    .filter((i) => i.status === 'live')
    .reduce((acc, curr) => acc + curr.metrics.cpuPercent, 0)
    .toFixed(1);
  const totalRam = instances
    .filter((i) => i.status === 'live')
    .reduce((acc, curr) => acc + curr.metrics.memoryMb, 0);

  return (
    <header className="h-16 border-b border-studio-border glass-panel px-6 flex items-center justify-between shrink-0 select-none z-30">
      {/* Brand Logo & Status */}
      <div className="flex items-center space-x-4">
        <div className="flex items-center space-x-3 cursor-pointer" onClick={() => setActiveTab('dashboard')}>
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-red-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Radio className="w-6 h-6 text-white animate-pulse" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-lg font-bold text-white tracking-tight leading-none">
                LiveStream<span className="text-indigo-400">Studio</span>
              </h1>
              <span className="text-[10px] uppercase tracking-widest font-mono font-semibold px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                v2.4 Pro
              </span>
            </div>
            <p className="text-xs text-slate-400 leading-tight">One-Click FFmpeg Live Streaming</p>
          </div>
        </div>

        {/* Live Stream Status Indicator */}
        <div className="h-6 w-[1px] bg-slate-700/60 mx-2" />

        <div className="flex items-center space-x-3 bg-slate-900/60 border border-slate-800 rounded-lg px-3 py-1.5">
          <div className="flex items-center space-x-2">
            <span className={`w-2.5 h-2.5 rounded-full ${liveCount > 0 ? 'bg-emerald-500 animate-pulse' : 'bg-slate-600'}`} />
            <span className="text-xs font-medium text-slate-200">
              {liveCount > 0 ? `${liveCount} Stream${liveCount > 1 ? 's' : ''} LIVE` : 'Studio Offline'}
            </span>
          </div>

          <div className="h-4 w-[1px] bg-slate-800" />

          <div className="flex items-center space-x-1.5 text-xs text-indigo-300 font-mono">
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span>{settings.hardwareAcc}</span>
          </div>
        </div>
      </div>

      {/* System Telemetry & Quick Action Controls */}
      <div className="flex items-center space-x-4">
        {/* Hardware telemetry pills */}
        <div className="hidden md:flex items-center space-x-3 text-xs font-mono text-slate-300 bg-slate-900/40 border border-slate-800 rounded-lg px-3 py-1.5">
          <div className="flex items-center space-x-1.5">
            <Cpu className="w-3.5 h-3.5 text-indigo-400" />
            <span>CPU: {totalCpu}%</span>
          </div>
          <span className="text-slate-700">|</span>
          <div className="flex items-center space-x-1.5">
            <HardDrive className="w-3.5 h-3.5 text-sky-400" />
            <span>RAM: {totalRam}MB</span>
          </div>
          <span className="text-slate-700">|</span>
          <div className="flex items-center space-x-1.5">
            <Activity className="w-3.5 h-3.5 text-emerald-400" />
            <span>99.9% Stable</span>
          </div>
        </div>

        {/* Quick Launch New Stream Button */}
        <button
          onClick={() => setActiveTab('multistream')}
          className="flex items-center space-x-2 bg-gradient-to-r from-red-600 to-indigo-600 hover:from-red-500 hover:to-indigo-500 text-white font-medium text-xs px-4 py-2 rounded-lg shadow-md shadow-red-900/20 transition duration-200"
        >
          <PlusCircle className="w-4 h-4" />
          <span>New Stream</span>
        </button>

        {/* Theme Toggle & Notifications */}
        <div className="flex items-center space-x-2 border-l border-slate-800 pl-4">
          <button
            onClick={() => updateSettings({ theme: settings.theme === 'dark' ? 'light' : 'dark' })}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800/60 rounded-lg transition"
            title="Toggle Theme"
          >
            {settings.theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
          </button>
          <button
            onClick={() => setActiveTab('logs')}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800/60 rounded-lg transition relative"
            title="Notifications & Logs"
          >
            <Bell className="w-4 h-4" />
            {liveCount > 0 && <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-emerald-500" />}
          </button>
        </div>
      </div>
    </header>
  );
};
