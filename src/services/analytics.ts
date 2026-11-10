import type { StreamAnalyticsSummary, StreamInstance } from '../types';
export const ANALYTICS_VERSION=1;
export const localDay=(date:Date)=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
export function emptyAnalytics():StreamAnalyticsSummary {
  return {version:ANALYTICS_VERSION,totalStreamsRun:0,totalHoursStreamed:0,averageBitrateKbps:0,successfulReconnections:0,totalVideosStreamed:0,streamStabilityPercent:0,totalLiveSeconds:0,totalObservedSeconds:0,bitrateKbpsSeconds:0,dailySeconds:{}};
}
export function restoreAnalytics(value:StreamAnalyticsSummary|undefined):StreamAnalyticsSummary {
  // Older releases persisted demo totals. They cannot be treated as recordings.
  return value?.version===ANALYTICS_VERSION ? {...emptyAnalytics(),...value,dailySeconds:{...value.dailySeconds}} : emptyAnalytics();
}
export function sampleActivity(summary:StreamAnalyticsSummary, instances:StreamInstance[], now:number):StreamAnalyticsSummary {
  const result=restoreAnalytics(summary);
  for(const inst of instances) {
    if(!['live','connecting','reconnecting'].includes(inst.status) || inst.analyticsLastSampleAt===undefined) continue;
    // A suspended computer/webview supplies no observations during the gap.
    const elapsed=(now-inst.analyticsLastSampleAt)/1000;
    const seconds=elapsed>10 ? 0 : Math.max(0,elapsed);
    result.totalObservedSeconds+=seconds;
    if(inst.status!=='live' || inst.metrics.fps<=0 || inst.metrics.bitrateKbps<=0 || now-(inst.lastOutputAt ?? 0)>5000) continue;
    result.totalLiveSeconds+=seconds;
    result.bitrateKbpsSeconds+=inst.metrics.bitrateKbps*seconds;
    let start=now-seconds*1000;
    while(start<now) {
      const date=new Date(start); const next=new Date(date.getFullYear(),date.getMonth(),date.getDate()+1).getTime();
      const end=Math.min(now,next); const key=localDay(date);
      result.dailySeconds[key]=(result.dailySeconds[key] || 0)+(end-start)/1000;
      start=end;
    }
  }
  result.dailySeconds=Object.fromEntries(Object.entries(result.dailySeconds).sort(([a],[b])=>a.localeCompare(b)).slice(-366));
  result.totalHoursStreamed=result.totalLiveSeconds/3600;
  result.averageBitrateKbps=result.totalLiveSeconds ? result.bitrateKbpsSeconds/result.totalLiveSeconds : 0;
  result.streamStabilityPercent=result.totalObservedSeconds ? 100*result.totalLiveSeconds/result.totalObservedSeconds : 0;
  return result;
}
export function lastSevenDays(summary:StreamAnalyticsSummary, now=new Date()) {
  return Array.from({length:7},(_,index)=>{
    const date=new Date(now.getFullYear(),now.getMonth(),now.getDate()-6+index);
    const key=localDay(date);return {key,label:date.toLocaleDateString(undefined,{weekday:'short'}),hours:(summary.dailySeconds[key]||0)/3600};
  });
}
