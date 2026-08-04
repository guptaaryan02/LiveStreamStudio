import React from 'react';
import { useStudioStore } from '../../store/useStudioStore';
import { BarChart3, Clock, Radio, ShieldCheck, Film, Zap, Activity } from 'lucide-react';

export const AnalyticsView: React.FC = () => {
  const { analytics } = useStudioStore();

  return (
    <div className="p-6 space-y-6 h-full overflow-y-auto pb-20">
      {/* Header */}
      <div className="border-b border-slate-800 pb-4">
        <h2 className="text-xl font-bold text-white tracking-tight flex items-center space-x-2">
          <BarChart3 className="w-6 h-6 text-indigo-400" />
          <span>Stream Statistics & Performance</span>
        </h2>
        <p className="text-xs text-slate-400">
          Historical telemetry analytics for 24/7 stream uptime, bitrate consistency, and recovery metrics.
        </p>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Total Hours Streamed</span>
            <Clock className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold text-white font-mono">{analytics.totalHoursStreamed.toFixed(1)} hrs</div>
          <div className="text-[11px] text-emerald-400 font-mono">+12.4 hrs this week</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Stream Stability Rating</span>
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-emerald-400 font-mono">{analytics.streamStabilityPercent}%</div>
          <div className="text-[11px] text-slate-400 font-mono">{analytics.successfulReconnections} Auto-Recoveries</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Average Encoding Bitrate</span>
            <Activity className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-2xl font-bold text-indigo-300 font-mono">
            {(analytics.averageBitrateKbps / 1000).toFixed(2)} Mbps
          </div>
          <div className="text-[11px] text-indigo-400 font-mono">1080p60 H.264 Target</div>
        </div>
      </div>

      {/* Visual Bar Chart Card */}
      <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white">Daily Stream Hours (Past 7 Days)</h3>
          <span className="text-xs font-mono text-slate-400">Total Videos Streamed: {analytics.totalVideosStreamed}</span>
        </div>

        {/* Bar chart representation */}
        <div className="flex items-end justify-between h-48 pt-6 px-4 border-b border-slate-800 gap-4">
          {[
            { day: 'Mon', hours: 24.0, pct: '100%' },
            { day: 'Tue', hours: 24.0, pct: '100%' },
            { day: 'Wed', hours: 22.5, pct: '94%' },
            { day: 'Thu', hours: 24.0, pct: '100%' },
            { day: 'Fri', hours: 24.0, pct: '100%' },
            { day: 'Sat', hours: 24.0, pct: '100%' },
            { day: 'Sun', hours: 24.0, pct: '100%' },
          ].map((bar, i) => (
            <div key={i} className="flex-1 flex flex-col items-center space-y-2 group">
              <span className="text-[10px] font-mono text-indigo-300 opacity-0 group-hover:opacity-100 transition">
                {bar.hours}h
              </span>
              <div className="w-full bg-slate-950 rounded-t-xl overflow-hidden h-36 flex items-end">
                <div
                  className="w-full bg-gradient-to-t from-indigo-600 via-indigo-500 to-emerald-400 rounded-t-xl group-hover:brightness-125 transition"
                  style={{ height: bar.pct }}
                />
              </div>
              <span className="text-xs font-mono text-slate-400">{bar.day}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
