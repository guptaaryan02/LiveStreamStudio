import React from 'react';
import { useStudioStore } from '../../store/useStudioStore';
import { BarChart3 } from 'lucide-react';
import { lastSevenDays } from '../../services/analytics';
export const AnalyticsView:React.FC=()=>{
  const {analytics}=useStudioStore();
  const days=lastSevenDays(analytics);
  const scale=Math.max(1,...days.map(d=>d.hours));
  const weekHours=days.reduce((sum,d)=>sum+d.hours,0);
  const cards=[
    ['Recorded output hours',`${analytics.totalHoursStreamed.toFixed(3)} hrs`,`${weekHours.toFixed(3)} hrs in the past 7 days`],
    ['Output availability',analytics.totalObservedSeconds ? `${analytics.streamStabilityPercent.toFixed(1)}%` : 'No observations',`${analytics.successfulReconnections} successful recoveries`],
    ['Average output bitrate',analytics.totalLiveSeconds ? `${(analytics.averageBitrateKbps/1000).toFixed(2)} Mbps` : 'No output samples',`${analytics.totalStreamsRun} streams reached live output`],
  ];
  return <div className="p-6 space-y-6 h-full overflow-y-auto pb-20">
    <div className="border-b border-slate-800 pb-4">
      <h2 className="text-xl font-bold text-studio-foreground flex items-center gap-2"><BarChart3 className="w-6 h-6 text-indigo-400"/>Stream Statistics & Performance</h2>
      <p className="text-xs text-slate-400 mt-2">Recorded on this device from encoder output. Concurrent destinations add their hours together. Viewer analytics are not included.</p>
    </div>
    {analytics.totalObservedSeconds===0 && <p className="rounded-xl border border-slate-800 bg-slate-900 p-4 text-sm text-slate-300">No streaming activity recorded yet. Statistics appear when the encoder reports output. Earlier sample statistics were removed.</p>}
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">{cards.map(([title,value,detail])=><div key={title} className="rounded-2xl border border-slate-800 bg-slate-900 p-5 space-y-2"><h3 className="text-xs text-slate-400">{title}</h3><div className="text-2xl font-mono font-bold text-studio-foreground">{value}</div><p className="text-xs text-slate-400">{detail}</p></div>)}</div>
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-5">
      <h3 className="font-bold text-studio-foreground">Daily output hours · past 7 days</h3>
      <div className="flex items-end gap-4 h-56" role="img" aria-label={`Recorded output over seven days: ${weekHours.toFixed(3)} destination-hours`}>
        {days.map(day=><div key={day.key} className="flex-1 h-full flex flex-col items-center gap-2"><span className="text-xs font-mono text-slate-300">{day.hours.toFixed(3)}h</span><div className="w-full flex-1 bg-slate-950 rounded-t-lg flex items-end"><div className="w-full bg-indigo-500 rounded-t-lg" style={{height:`${day.hours/scale*100}%`}}/></div><span className="text-xs text-slate-400">{day.label}</span></div>)}
      </div>
      <p className="text-xs text-slate-400">{analytics.totalVideosStreamed} clips encoded. Availability is the share of observed active time with fresh, nonzero encoder output. Sleep gaps are excluded; statistics are saved locally.</p>
    </div>
  </div>;
};
