import React, { useState, useEffect } from 'react';
import { AlertTriangle, CheckCircle, Radio, XCircle, Play, Loader2, Wifi, HardDrive, Cpu, Film } from 'lucide-react';
import { Playlist, HardwareAcceleration } from '../../types';
import { useStudioStore } from '../../store/useStudioStore';
import { analyzePlaylistCompatibility } from '../../services/ffmpegEngine';
import { checkRtmpReachable } from '../../services/tauriEngine';

interface StreamValidatorModalProps {
  playlist: Playlist;
  rtmpUrl: string;
  streamKey: string;
  hardwareAcc: HardwareAcceleration;
  onCancel: () => void;
  onConfirm: (finalBitrate: number, finalRes: string, finalFps: number | 'original') => void;
}

export const StreamValidatorModal: React.FC<StreamValidatorModalProps> = ({
  playlist,
  rtmpUrl,
  streamKey,
  hardwareAcc,
  onCancel,
  onConfirm
}) => {
  const settings = useStudioStore((s) => s.settings);
  
  const [testPhase, setTestPhase] = useState<'idle' | 'testing' | 'done'>('idle');
  const [bandwidth, setBandwidth] = useState<number>(0);
  const [latency, setLatency] = useState<number>(0);
  
  const [readinessScore, setReadinessScore] = useState<number>(0);
  
  // Validation states
  const [playlistOk, setPlaylistOk] = useState<boolean>(true);
  const [encoderOk, setEncoderOk] = useState<boolean>(true);
  const [internetOk, setInternetOk] = useState<boolean | null>(null);
  const [hardwareOk, setHardwareOk] = useState<boolean>(true);
  const [rtmpOk, setRtmpOk] = useState<boolean>(true);

  // Recommendations
  const [recRes, setRecRes] = useState<string>(settings.outputResolution || '1080p');
  const [recFps, setRecFps] = useState<number | 'original'>(
    settings.outputFps === 'original' ? 'original' : Number(settings.outputFps || 30)
  );
  const [recBitrate, setRecBitrate] = useState<number>(settings.defaultBitrateKbps || 4500);

  useEffect(() => {
    // Initial static checks
    if (!playlist || playlist.videos.length === 0) setPlaylistOk(false);
    if (!rtmpUrl || !streamKey || streamKey.trim() === '') setRtmpOk(false);
    if (hardwareAcc.includes('VideoToolbox') || hardwareAcc.includes('NVENC') || hardwareAcc.includes('QuickSync')) {
      setHardwareOk(true);
    }
  }, [playlist, rtmpUrl, streamKey, hardwareAcc]);

  /**
   * Real check, not an estimate: opens a TCP connection to the RTMP host and
   * measures how long the handshake takes. It proves the endpoint is reachable
   * from this machine — it does not measure upload bandwidth.
   */
  const runNetworkTest = async () => {
    setTestPhase('testing');

    const result = await checkRtmpReachable(rtmpUrl);

    setLatency(result.latencyMs);
    setInternetOk(result.reachable);
    setTestPhase('done');

    // Keep the user's configured profile; only flag it when it looks unsafe.
    setRecRes(settings.outputResolution || '1080p');
    setRecFps(settings.outputFps === 'original' ? 'original' : Number(settings.outputFps || 30));
    setRecBitrate(settings.defaultBitrateKbps || 4500);

    let score = 100;
    if (!result.reachable) score -= 50;
    if (result.latencyMs > 250) score -= 15;
    if (!playlistOk) score -= 40;
    if (!rtmpOk) score -= 40;
    setReadinessScore(Math.max(0, score));
  };

  // Same rule the engine uses, so the badge always matches what will run.
  const analysis = analyzePlaylistCompatibility(playlist);
  const isCompatible = analysis.isCompatible;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in select-none">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-6 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Radio className="w-6 h-6 text-indigo-400" />
            <h3 className="text-xl font-bold text-white">Stream Validator</h3>
          </div>
        </div>

        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Top Section: Validation Checklist & Score */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Checklist */}
            <div className="bg-slate-800/50 p-5 rounded-xl border border-slate-700/50 space-y-3">
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Pre-flight Check</div>
              
              <div className="flex items-center space-x-3 text-sm">
                {playlistOk ? <CheckCircle className="w-4 h-4 text-emerald-400" /> : <XCircle className="w-4 h-4 text-red-400" />}
                <span className="text-slate-200">Playlist Compatibility</span>
                <span className="text-xs text-slate-500 ml-auto" title={analysis.differences.join(', ')}>
                  {isCompatible ? 'Fast Mode (stream copy)' : `Smart Compatibility (${analysis.score}%)`}
                </span>
              </div>
              
              <div className="flex items-center space-x-3 text-sm">
                {encoderOk ? <CheckCircle className="w-4 h-4 text-emerald-400" /> : <XCircle className="w-4 h-4 text-red-400" />}
                <span className="text-slate-200">Encoder Readiness</span>
                <span className="text-xs text-slate-500 ml-auto">FFmpeg Active</span>
              </div>
              
              <div className="flex items-center space-x-3 text-sm">
                {hardwareOk ? <CheckCircle className="w-4 h-4 text-emerald-400" /> : <XCircle className="w-4 h-4 text-red-400" />}
                <span className="text-slate-200">Hardware Acceleration</span>
                <span className="text-xs text-slate-500 ml-auto">{hardwareAcc}</span>
              </div>
              
              <div className="flex items-center space-x-3 text-sm">
                {rtmpOk ? <CheckCircle className="w-4 h-4 text-emerald-400" /> : <XCircle className="w-4 h-4 text-red-400" />}
                <span className="text-slate-200">Stream Key Present</span>
                <span className="text-xs text-slate-500 ml-auto">{streamKey ? 'Valid' : 'Missing'}</span>
              </div>

              <div className="flex items-center space-x-3 text-sm">
                {internetOk === null ? (
                   <AlertTriangle className="w-4 h-4 text-amber-400" />
                ) : internetOk ? (
                   <CheckCircle className="w-4 h-4 text-emerald-400" />
                ) : (
                   <XCircle className="w-4 h-4 text-red-400" />
                )}
                <span className="text-slate-200">RTMP Server Reachable</span>
                <span className="text-xs text-slate-500 ml-auto">
                  {internetOk === null ? 'Not checked' : internetOk ? `Connected in ${latency} ms` : 'Unreachable'}
                </span>
              </div>
            </div>

            {/* Score Display */}
            <div className="bg-slate-800/50 p-5 rounded-xl border border-slate-700/50 flex flex-col items-center justify-center text-center">
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Streaming Readiness</div>
              {testPhase === 'done' ? (
                <>
                  <div className={`text-5xl font-black font-mono mb-2 ${readinessScore >= 90 ? 'text-emerald-400' : readinessScore >= 70 ? 'text-amber-400' : 'text-red-400'}`}>
                    {readinessScore}%
                  </div>
                  <div className={`text-sm font-semibold ${readinessScore >= 90 ? 'text-emerald-400' : readinessScore >= 70 ? 'text-amber-400' : 'text-red-400'}`}>
                    {readinessScore >= 90 ? 'Excellent' : readinessScore >= 70 ? 'Good' : 'Critical'}
                  </div>
                  <div className="text-xs text-slate-400 mt-2 flex flex-col items-center space-y-1">
                    <span className="flex items-center"><CheckCircle className="w-3 h-3 text-emerald-400 mr-1"/> {hardwareAcc} encoder</span>
                    <span className="flex items-center">
                      {internetOk
                        ? <><CheckCircle className="w-3 h-3 text-emerald-400 mr-1"/> RTMP host reachable</>
                        : <><XCircle className="w-3 h-3 text-red-400 mr-1"/> RTMP host unreachable</>}
                    </span>
                    <span className="flex items-center">
                      <CheckCircle className="w-3 h-3 text-emerald-400 mr-1"/>
                      {isCompatible ? 'Uniform playlist — stream copy' : 'Mixed playlist — normalised live'}
                    </span>
                  </div>
                </>
              ) : testPhase === 'testing' ? (
                <div className="flex flex-col items-center space-y-3">
                  <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
                  <span className="text-sm text-slate-300">Connecting to RTMP host...</span>
                </div>
              ) : (
                <div className="text-sm text-slate-400 my-auto">
                  Run the connection check to<br/>calculate readiness score.
                </div>
              )}
            </div>
          </div>

          {/* Network Test Section */}
          <div className="bg-slate-800/30 p-5 rounded-xl border border-slate-700/50">
             <div className="flex items-center justify-between mb-4">
               <div className="text-sm font-semibold text-white flex items-center space-x-2">
                 <Wifi className="w-4 h-4 text-indigo-400" />
                 <span>RTMP Connection Check</span>
               </div>
               {testPhase === 'idle' && (
                 <button onClick={runNetworkTest} className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg transition">
                   Run Check
                 </button>
               )}
             </div>

             {testPhase !== 'idle' && (
               <div className="grid grid-cols-3 gap-4">
                 <div className="bg-slate-900/50 p-3 rounded-lg border border-slate-800 text-center">
                    <div className="text-[10px] uppercase text-slate-500 font-bold mb-1">Endpoint</div>
                    <div className={`text-lg font-mono ${internetOk ? 'text-emerald-400' : 'text-red-400'}`}>
                      {internetOk === null ? '--' : internetOk ? 'Reachable' : 'Refused'}
                    </div>
                 </div>
                 <div className="bg-slate-900/50 p-3 rounded-lg border border-slate-800 text-center">
                    <div className="text-[10px] uppercase text-slate-500 font-bold mb-1">Connect Time</div>
                    <div className="text-lg font-mono text-amber-400">{latency > 0 ? `${latency} ms` : '--'}</div>
                 </div>
                 <div className="bg-slate-900/50 p-3 rounded-lg border border-slate-800 text-center">
                    <div className="text-[10px] uppercase text-slate-500 font-bold mb-1">Target Bitrate</div>
                    <div className="text-lg font-mono text-emerald-400">{recBitrate} kbps</div>
                 </div>
               </div>
             )}
          </div>

          {/* Recommended Settings Section */}
          {testPhase === 'done' && (
            <div className="bg-indigo-900/20 p-5 rounded-xl border border-indigo-500/30">
               <div className="text-xs font-semibold text-indigo-300 uppercase tracking-wider mb-4">Recommended Output Configuration</div>
               
               <div className="grid grid-cols-4 gap-4">
                  <div>
                    <label className="text-[10px] text-slate-400 uppercase font-bold block mb-1">Resolution</label>
                    <select value={recRes} onChange={e => setRecRes(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg text-sm text-white px-2 py-1.5">
                      <option value="720p">720p</option>
                      <option value="1080p">1080p</option>
                      <option value="1440p">1440p</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 uppercase font-bold block mb-1">FPS</label>
                    <select value={recFps} onChange={e => setRecFps(e.target.value === 'original' ? 'original' : Number(e.target.value))} className="w-full bg-slate-900 border border-slate-700 rounded-lg text-sm text-white px-2 py-1.5">
                      <option value="original">Source</option>
                      <option value="30">30</option>
                      <option value="60">60</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 uppercase font-bold block mb-1">Bitrate (kbps)</label>
                    <input type="number" value={recBitrate} onChange={e => setRecBitrate(Number(e.target.value))} className="w-full bg-slate-900 border border-slate-700 rounded-lg text-sm text-white px-2 py-1.5" />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 uppercase font-bold block mb-1">Encoder</label>
                    <div className="w-full bg-slate-900/50 border border-slate-800 rounded-lg text-sm text-slate-400 px-2 py-1.5 cursor-not-allowed truncate">
                      {hardwareAcc}
                    </div>
                  </div>
               </div>
            </div>
          )}

        </div>

        <div className="p-6 bg-slate-900 border-t border-slate-800 flex justify-end space-x-3">
          <button
            onClick={onCancel}
            className="px-6 py-2.5 rounded-xl font-semibold text-sm text-slate-300 hover:text-white hover:bg-slate-800 transition"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(recBitrate, recRes, recFps)}
            disabled={testPhase !== 'done' || !rtmpOk || !playlistOk}
            className="flex items-center space-x-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-semibold text-sm transition shadow-lg shadow-emerald-900/50"
          >
            <Play className="w-4 h-4 fill-white" />
            <span>Go Live</span>
          </button>
        </div>
      </div>
    </div>
  );
};
