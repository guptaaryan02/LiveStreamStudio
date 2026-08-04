import React, { useState } from 'react';
import { useStudioStore } from '../../store/useStudioStore';
import { Terminal, Search, Trash2, Download, Copy, Code, Filter, CheckCircle2 } from 'lucide-react';
import { LogLevel } from '../../types';
import { generateFFmpegCommand } from '../../services/ffmpegEngine';

export const LogsView: React.FC = () => {
  const { logs, clearLogs, instances, playlists, settings } = useStudioStore();
  const [filterLevel, setFilterLevel] = useState<LogLevel | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTabState] = useState<'console' | 'command'>('console');

  const activeInstance = instances.find((i) => i.status === 'live') || instances[0];
  const activePlaylist = playlists.find((p) => p.id === activeInstance?.playlistId) || playlists[0];

  const generatedCommand = activePlaylist && activeInstance
    ? generateFFmpegCommand(
        activePlaylist,
        activeInstance.platform,
        activeInstance.rtmpUrl,
        activeInstance.streamKey,
        activeInstance.hardwareAcc,
        activeInstance.metrics.bitrateKbps || 4500
      )
    : 'ffmpeg -re -f concat -safe 0 -i /tmp/playlist.txt -c:v h264_videotoolbox -b:v 4500k -c:a aac -f flv "rtmp://..."';

  const filteredLogs = logs.filter((log) => {
    const matchesLevel = filterLevel === 'ALL' || log.level === filterLevel;
    const matchesSearch = log.message.toLowerCase().includes(searchQuery.toLowerCase()) || log.streamName.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesLevel && matchesSearch;
  });

  const handleDownloadLog = () => {
    const logText = logs.map((l) => `[${l.timestamp}] [${l.level}] [${l.streamName}] ${l.message}`).join('\n');
    const blob = new Blob([logText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `livestream_studio_ffmpeg_log_${new Date().toISOString().slice(0, 10)}.log`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6 space-y-6 h-full overflow-y-auto pb-20 font-mono">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight flex items-center space-x-2 font-sans">
            <Terminal className="w-6 h-6 text-indigo-400" />
            <span>FFmpeg Realtime Terminal & Inspector</span>
          </h2>
          <p className="text-xs text-slate-400 font-sans">
            Live stdout/stderr stream from background FFmpeg processes and CLI command builder.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <div className="flex rounded-xl bg-slate-900 border border-slate-800 p-1 text-xs">
            <button
              onClick={() => setActiveTabState('console')}
              className={`px-3 py-1 rounded-lg transition ${
                activeTab === 'console' ? 'bg-indigo-600 text-white font-semibold' : 'text-slate-400 hover:text-white'
              }`}
            >
              Terminal Console
            </button>
            <button
              onClick={() => setActiveTabState('command')}
              className={`px-3 py-1 rounded-lg transition ${
                activeTab === 'command' ? 'bg-indigo-600 text-white font-semibold' : 'text-slate-400 hover:text-white'
              }`}
            >
              Raw Command Inspector
            </button>
          </div>

          <button
            onClick={handleDownloadLog}
            className="flex items-center space-x-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs px-3 py-2 rounded-xl transition border border-slate-700"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Log</span>
          </button>
        </div>
      </div>

      {activeTab === 'console' ? (
        <div className="space-y-4">
          {/* Controls: Filter & Search */}
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
            <div className="flex items-center space-x-2 text-xs">
              <span className="text-slate-500 font-semibold uppercase text-[10px]">Filter Level:</span>
              {(['ALL', 'INFO', 'WARN', 'ERROR', 'COMMAND'] as const).map((lvl) => (
                <button
                  key={lvl}
                  onClick={() => setFilterLevel(lvl)}
                  className={`px-2.5 py-1 rounded-lg font-mono border text-[11px] transition ${
                    filterLevel === lvl
                      ? 'bg-indigo-600 text-white border-indigo-400'
                      : 'bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  {lvl}
                </button>
              ))}
            </div>

            <div className="flex items-center space-x-2">
              <div className="relative w-full md:w-64">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search logs..."
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <button
                onClick={clearLogs}
                className="p-2 text-slate-500 hover:text-red-400 hover:bg-slate-800 rounded-xl transition"
                title="Clear Logs Buffer"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Terminal Output Window */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 h-[480px] overflow-y-auto font-mono text-xs space-y-1 select-text">
            {filteredLogs.length === 0 ? (
              <div className="text-slate-600 text-center py-20">No logs found matching criteria.</div>
            ) : (
              filteredLogs.map((log) => (
                <div key={log.id} className="flex items-start space-x-3 leading-relaxed hover:bg-slate-900/60 p-1 rounded">
                  <span className="text-slate-500 shrink-0 text-[11px]">[{log.timestamp}]</span>
                  <span
                    className={`font-semibold shrink-0 text-[10px] uppercase px-1.5 py-0.5 rounded border ${
                      log.level === 'ERROR'
                        ? 'bg-red-950 text-red-400 border-red-800'
                        : log.level === 'WARN'
                        ? 'bg-amber-950 text-amber-300 border-amber-800'
                        : log.level === 'COMMAND'
                        ? 'bg-indigo-950 text-indigo-300 border-indigo-800'
                        : 'bg-slate-900 text-emerald-400 border-slate-800'
                    }`}
                  >
                    {log.level}
                  </span>
                  <span className="text-slate-400 shrink-0 text-[11px]">[{log.streamName}]</span>
                  <span
                    className={`break-all ${
                      log.level === 'ERROR'
                        ? 'text-red-300'
                        : log.level === 'WARN'
                        ? 'text-amber-200'
                        : log.level === 'COMMAND'
                        ? 'text-indigo-200 font-bold'
                        : 'text-slate-200'
                    }`}
                  >
                    {log.message}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      ) : (
        /* Raw Command Inspector */
        <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6 space-y-4 font-mono">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-indigo-400 flex items-center space-x-2 font-sans">
              <Code className="w-4 h-4" />
              <span>Generated Background FFmpeg Execution Command</span>
            </h3>
            <button
              onClick={() => {
                navigator.clipboard.writeText(generatedCommand);
                alert('Copied FFmpeg command to clipboard!');
              }}
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-sans font-semibold"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>Copy Command</span>
            </button>
          </div>

          <p className="text-xs font-sans text-slate-400">
            This exact command string is executed by the desktop runtime when <strong>Go Live</strong> is pressed.
          </p>

          <pre className="bg-slate-900 border border-slate-800 p-4 rounded-xl text-emerald-400 text-xs whitespace-pre-wrap leading-relaxed overflow-x-auto">
            {generatedCommand}
          </pre>
        </div>
      )}
    </div>
  );
};
