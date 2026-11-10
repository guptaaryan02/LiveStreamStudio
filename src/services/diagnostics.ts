import type { LogEntry } from '../types';
import { maskStreamKey, sanitizeLogMessage } from './ffmpegEngine';

export const classifyFFmpegLine = (line: string): LogEntry['level'] =>
  /error|failed|broken pipe|connection reset|timed out|connection refused|fell behind|success=false/i.test(line) ? 'ERROR' : 'INFO';

function redact(log: LogEntry, keys: string[]): LogEntry {
  let message = log.message;
  for (const key of keys) if (key.trim()) message = maskStreamKey(message, key);
  return {...log, message: sanitizeLogMessage(message).slice(0,2000)};
}

export function retainDiagnostics(previous: LogEntry[], incoming: LogEntry[], keys: string[] = []): LogEntry[] {
  const seen = new Set<string>(); let failures = 0; let other = 0;
  return [...incoming,...previous].filter((log) => {
    if (!log || typeof log.id !== 'string' || typeof log.message !== 'string' || seen.has(log.id)) return false;
    seen.add(log.id);
    if (log.level === 'INFO' && /(?:^|\s)frame=\s*\d+/.test(log.message)) return false;
    // Keep failures separately so a healthy producer cannot displace them.
    if (log.level === 'ERROR' || log.level === 'WARN') return ++failures <= 200;
    return ++other <= 200;
  }).map((log) => redact(log, keys));
}

export function appendLogs(state: {logs:LogEntry[];diagnosticLogs:LogEntry[];profiles?:{streamKey:string}[];instances?:{streamKey:string}[]}, incoming: LogEntry[]) {
  const keys = [...(state.profiles || []),...(state.instances || [])].map((p) => p.streamKey);
  const safe = incoming.map((log) => redact({...log,timestamp:new Date().toISOString()},keys));
  const relevant = safe.filter((log) => !(log.level === 'INFO' && /(?:^|\s)frame=\s*\d+/.test(log.message)));
  return {
    logs: [...safe,...state.logs].slice(0,500),
    diagnosticLogs: relevant.length ? retainDiagnostics(state.diagnosticLogs || [],relevant,keys) : state.diagnosticLogs || [],
  };
}

export function mergeLogHistory(live:LogEntry[], retained:LogEntry[]): LogEntry[] {
  const ids = new Set(live.map((l) => l.id));
  return [...live,...retained.filter((l) => !ids.has(l.id))];
}

export function formatLogTime(timestamp:string): string {
  const date = new Date(timestamp);
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : `${timestamp} UTC (legacy)`;
}
