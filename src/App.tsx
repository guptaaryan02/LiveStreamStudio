import { deliverNotification, streamStatusNotice } from './services/desktopNotifications';
import { classifyFFmpegLine } from './services/diagnostics';
import { invoke } from '@tauri-apps/api/core';
import React, { useEffect, useState } from 'react';
import { useStudioStore } from './store/useStudioStore';
import { Header } from './components/layout/Header';
import { Sidebar } from './components/layout/Sidebar';
import { StatusBar } from './components/layout/StatusBar';

import { DashboardView } from './components/dashboard/DashboardView';
import { PlaylistManagerView } from './components/playlist/PlaylistManagerView';
import { MultiStreamView } from './components/multistream/MultiStreamView';
import { VideoLibraryView } from './components/library/VideoLibraryView';
import { SchedulerView } from './components/scheduler/SchedulerView';
import { ProfilesView } from './components/profiles/ProfilesView';
import { LogsView } from './components/logs/LogsView';
import { AnalyticsView } from './components/analytics/AnalyticsView';
import { SettingsView } from './components/settings/SettingsView';
import { isBrokenVideo } from './services/videoImport';
import { MarketingSite } from './components/marketing/MarketingSite';

const isTauriDesktop = () => {
  if (typeof window === 'undefined') return false;
  return (
    '__TAURI_INTERNALS__' in window ||
    '__TAURI__' in window ||
    '__TAURI_IPC__' in window ||
    window.navigator.userAgent.includes('Tauri')
  );
};

const isStudioRoute = (hash: string) => {
  return hash.replace('#/', '').startsWith('studio');
};

export const App: React.FC = () => {
  const { activeTab, tickTelemetry, checkSchedules, addLog, instances, schedules, profiles, settings } = useStudioStore();
  const [systemDark, setSystemDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => {
    const media=window.matchMedia('(prefers-color-scheme: dark)');
    const changed=()=>setSystemDark(media.matches);
    media.addEventListener('change',changed);
    return ()=>media.removeEventListener('change',changed);
  },[]);
  const resolvedTheme=settings.theme==='system' ? (systemDark ? 'dark' : 'light') : settings.theme;
  const [notice, setNotice] = useState('');
  useEffect(() => {
    const handle = (event: Event) => setNotice((event as CustomEvent<string>).detail);
    window.addEventListener('studio-notice', handle);
    return () => window.removeEventListener('studio-notice', handle);
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer=setTimeout(()=>setNotice(''),6000);
    return ()=>clearTimeout(timer);
  },[notice]);
  const [hashRoute, setHashRoute] = useState(() => (typeof window === 'undefined' ? '' : window.location.hash));
  const showMarketingSite = !isTauriDesktop() && !isStudioRoute(hashRoute);

  useEffect(() => {
    const updateRoute = () => setHashRoute(window.location.hash);
    window.addEventListener('hashchange', updateRoute);
    return () => window.removeEventListener('hashchange', updateRoute);
  }, []);

  useEffect(() => useStudioStore.subscribe((state, previous) => {
    if (!state.settings.desktopNotifications) return;
    for(const next of state.instances) {
      const message=streamStatusNotice(previous.instances.find((i)=>i.id===next.id),next);
      if(message) void deliverNotification(message.title,message.body).catch((error)=>console.warn('Desktop notification failed',error));
    }
  }),[]);

  const shouldStayAwake = instances.some((i)=>['live','connecting','reconnecting'].includes(i.status)) ||
    schedules.some((s)=>s.isActive && s.autoStart && !(s.scheduledAt && s.lastRunDate));
  useEffect(() => {
    if (!isTauriDesktop()) return;
    let failed = false;
    const protect = () => void invoke('set_keep_awake',{enabled:shouldStayAwake}).catch(() => {
      if (!failed) {
        failed = true;
        window.dispatchEvent(new CustomEvent('studio-notice', {detail:'Sleep protection failed. Check Scheduler before leaving Studio unattended.'}));
      }
    });
    protect();
    // Recreate the assertion if its helper was terminated externally.
    const timer = setInterval(protect, 30000);
    return () => clearInterval(timer);
  },[shouldStayAwake]);

  // Safety net: purge any library/playlist entry without a real disk path.
  // FFmpeg runs outside the webview, so blob: URLs can never be streamed.
  useEffect(() => {
    if (showMarketingSite) return;
    useStudioStore.setState((state) => {
      const videos = state.videos.filter((v) => !isBrokenVideo(v));
      const playlists = state.playlists.map((p) => ({
        ...p,
        videos: p.videos.filter((v) => !isBrokenVideo(v)),
      }));

      const removedFromPlaylists = state.playlists.reduce(
        (acc, p, i) => acc + (p.videos.length - playlists[i].videos.length),
        0
      );
      const removed = state.videos.length - videos.length + removedFromPlaylists;
      if (removed === 0) return {};

      console.warn(`[Cleanup] Removed ${removed} un-streamable video reference(s) with no disk path.`);
      return { videos, playlists };
    });
  }, [showMarketingSite]);

  // Telemetry loop running every 1 second for active stream telemetry
  useEffect(() => {
    if (showMarketingSite) return;
    const resume = () => { checkSchedules(); void tickTelemetry(); };
    window.addEventListener('focus', resume);
    document.addEventListener('visibilitychange', resume);
    checkSchedules();
    const interval = setInterval(() => {
      tickTelemetry();
      
      // Scheduler only needs to be checked roughly once per minute, but we can do it on the same tick 
      // with a slight throttling or just let checkSchedules handle debouncing internally
      checkSchedules();
    }, 1000);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', resume);
      document.removeEventListener('visibilitychange', resume);
    };
  }, [tickTelemetry, checkSchedules, showMarketingSite]);

  // Setup real-time FFmpeg logs.
  // Every listener registered here MUST be torn down on unmount: React StrictMode
  // runs this effect twice in dev and each HMR update runs it again, so leaking
  // them means one FFmpeg exit fires handleStreamExit N times — which is how a
  // single disconnect turned into a runaway reconnect loop.
  useEffect(() => {
    if (showMarketingSite) return;
    let disposed = false;
    const unlisteners: Array<() => void> = [];

    const track = (unlisten: (() => void) | null) => {
      if (!unlisten) return;
      if (disposed) unlisten();
      else unlisteners.push(unlisten);
    };

    import('./services/tauriEngine').then(async ({ setupFFmpegLogListener, setupFFmpegExitListener, setupPlayoutStatsListener, setupFFmpegRateListener, setupClipEncodedListener }) => {
      track(await setupClipEncodedListener((streamId)=>{
        const state=useStudioStore.getState();
        if(state.instances.some((i)=>i.id===streamId && ['live','connecting'].includes(i.status))) {
          useStudioStore.setState({analytics:{...state.analytics,totalVideosStreamed:state.analytics.totalVideosStreamed+1}});
        }
      }));
      track(await setupFFmpegRateListener(({ streamId, fps, bitrateKbps }) => {
        const state = useStudioStore.getState();
        const inst = state.instances.find((i) => i.id === streamId);
        state.updateInstanceMetrics(streamId, { fps: Number(fps.toFixed(1)), bitrateKbps: Number(bitrateKbps.toFixed(1)),
          connectionQuality: bitrateKbps > 0 ? ((inst?.metrics.droppedFrames || 0) < 5 ? 'Excellent' : 'Fair') : 'Poor' });
      }));
      track(await setupFFmpegExitListener((streamId, success) => {
        useStudioStore.getState().handleStreamExit(streamId,success);
      }));

      // Real "now playing" + upload-buffer level straight from the playout engine.
      track(await setupPlayoutStatsListener((stats) => {
        useStudioStore.setState((state) => ({
          instances: state.instances.map((i) =>
            i.id === stats.streamId
              ? { ...i, currentVideoIndex: stats.clipIndex, bufferSeconds: stats.bufferSeconds, pipelineId:stats.pipelineId, sharedDestinations:stats.sharedDestinations }
              : i
          ),
        }));
      }));
      track(await setupFFmpegLogListener((streamId, line) => {
        // Find instance name if possible
        const state = useStudioStore.getState();
        const inst = state.instances.find(i => i.id === streamId);
        
        // Parse advanced metrics for Module 16
        if (line.includes('frame=')) {
          const fpsMatch = line.match(/fps=\s*([\d.]+)/);
          const bitrateMatch = line.match(/bitrate=\s*([\d.]+)/);
          const speedMatch = line.match(/speed=\s*([\d.]+)x/);
          const dropMatch = line.match(/drop=\s*(\d+)/);
          
          if (inst) {
            const metricsUpdate: Partial<any> = {};
            // Sender rate events report changes over wall-clock intervals;
            // FFmpeg's cumulative averages would hide a stalled socket.
            
            let currentDrops = inst.metrics?.droppedFrames || 0;
            if (dropMatch) {
              currentDrops = parseInt(dropMatch[1]);
              metricsUpdate.droppedFrames = currentDrops;
            }
            
            let currentBitrate = inst.metrics?.bitrateKbps || 0;
            if (bitrateMatch) {
              currentBitrate = parseFloat(bitrateMatch[1]);

            }

            if (speedMatch) {
              metricsUpdate.encodingSpeed = parseFloat(speedMatch[1]);
            }

            // Frame cadence and upload rate jointly determine output health.
            // A nonzero bitrate alone cannot certify smooth playback.
            state.updateInstanceMetrics(streamId, metricsUpdate);
          }
        } else if (line.toLowerCase().includes('error') || line.toLowerCase().includes('reconnecting')) {
           // Catch severe network issues
           if (inst) {
             state.updateInstanceMetrics(streamId, { connectionQuality: 'Poor' });
           }
        }

        addLog({
          id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          streamId,
          streamName: inst ? inst.name : 'Unknown Stream',
          timestamp: new Date().toISOString(),
          level: classifyFFmpegLine(line),
          message: line,
        });
      }));
    });

    return () => {
      disposed = true;
      unlisteners.forEach((unlisten) => unlisten());
      unlisteners.length = 0;
    };
  }, [addLog, showMarketingSite]);

  const renderActiveTab = () => {
    switch (activeTab) {
      case 'dashboard':
        return <DashboardView />;
      case 'multistream':
        return <MultiStreamView />;
      case 'playlist':
        return <PlaylistManagerView />;
      case 'library':
        return <VideoLibraryView />;
      case 'scheduler':
        return <SchedulerView />;
      case 'profiles':
        return <ProfilesView />;
      case 'logs':
        return <LogsView />;
      case 'analytics':
        return <AnalyticsView />;
      case 'settings':
        return <SettingsView />;
      default:
        return <DashboardView />;
    }
  };

  return (
    showMarketingSite ? (
      <MarketingSite />
    ) : (
    <div data-theme={resolvedTheme} className="studio-theme flex flex-col h-screen w-screen overflow-hidden bg-studio-darker text-slate-100 font-sans">
      {notice && <div role="status" className="fixed right-4 top-20 z-[100] max-w-md rounded-xl border border-indigo-400 bg-slate-900 p-4 text-sm text-slate-100 shadow-xl">
        {notice}<button aria-label="Dismiss notification" onClick={() => setNotice('')} className="ml-3 text-slate-400">×</button>
      </div>}
      {/* Top Header */}
      <Header />
      {schedules.some((s) => s.isActive && s.autoStart && !profiles.find((p) => p.id === s.profileId)?.streamKey.trim()) &&
        <div role="status" className="border-b border-amber-500/40 bg-studio-panel px-4 py-2 text-xs text-amber-400">
          Scheduled streams need a key loaded for this session. Prepare keys before locking the screen; restarting Studio clears session keys.
          <button onClick={() => useStudioStore.getState().setActiveTab('profiles')} className="ml-3 font-semibold underline">Prepare stream keys</button>
        </div>}

      {/* Main Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <Sidebar />

        {/* Content Viewport */}
        <main className="flex-1 overflow-hidden bg-slate-950/40 relative">
          {renderActiveTab()}
        </main>
      </div>

      {/* Footer Status Bar */}
      <StatusBar />
    </div>
    )
  );
};

export default App;
