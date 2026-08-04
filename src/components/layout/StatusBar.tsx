import React from 'react';
import { useStudioStore } from '../../store/useStudioStore';
import { CheckCircle2, ShieldCheck, Wifi, Cpu, Terminal } from 'lucide-react';

export const StatusBar: React.FC = () => {
  const { settings, instances, logs, setActiveTab } = useStudioStore();
  const liveInstance = instances.find((i) => i.status === 'live');
  const latestLog = logs[0];

  return (
    <footer className="h-8 bg-studio-darker border-t border-studio-border px-4 text-[11px] font-mono text-slate-400 flex items-center justify-between shrink-0 select-none z-20">
      {/* Left: FFmpeg Status & Latest Log */}
      <div className="flex items-center space-x-4 overflow-hidden pr-4">
        <div className="flex items-center space-x-1.5 text-emerald-400 shrink-0">
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>FFmpeg Engine Ready</span>
        </div>

        <div className="h-3 w-[1px] bg-slate-800 shrink-0" />

        <div
          onClick={() => setActiveTab('logs')}
          className="flex items-center space-x-2 text-slate-400 hover:text-slate-200 cursor-pointer truncate max-w-md"
          title="Click to view full logs"
        >
          <Terminal className="w-3 h-3 text-indigo-400 shrink-0" />
          <span className="truncate">{latestLog ? `[${latestLog.timestamp}] ${latestLog.message}` : 'Engine initialized cleanly.'}</span>
        </div>
      </div>

      {/* Right: Telemetry Details */}
      <div className="flex items-center space-x-4 shrink-0">
        {liveInstance && (
          <>
            <div className="flex items-center space-x-1.5 text-indigo-300">
              <Wifi className="w-3 h-3 text-emerald-400" />
              <span>RTMP: {(liveInstance.metrics.bitrateKbps / 1000).toFixed(2)} Mbps</span>
            </div>

            <div className="h-3 w-[1px] bg-slate-800" />
          </>
        )}

        <div className="flex items-center space-x-1 text-slate-300">
          <Cpu className="w-3 h-3 text-amber-400" />
          <span>Encoder: {settings.hardwareAcc}</span>
        </div>

        <div className="h-3 w-[1px] bg-slate-800" />

        <div className="flex items-center space-x-1 text-emerald-400">
          <ShieldCheck className="w-3 h-3" />
          <span>Auto-Recovery: Active ({settings.retryIntervalSeconds}s)</span>
        </div>
      </div>
    </footer>
  );
};
