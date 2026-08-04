import React, { useEffect } from 'react';
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

export const App: React.FC = () => {
  const { activeTab, tickTelemetry, checkSchedules, addLog, instances } = useStudioStore();

  // Safety net: purge any library/playlist entry without a real disk path.
  // FFmpeg runs outside the webview, so blob: URLs can never be streamed.
  useEffect(() => {
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
  }, []);

  // Telemetry loop running every 1 second for active stream telemetry
  useEffect(() => {
    const interval = setInterval(() => {
      tickTelemetry();
      
      // Scheduler only needs to be checked roughly once per minute, but we can do it on the same tick 
      // with a slight throttling or just let checkSchedules handle debouncing internally
      checkSchedules();
    }, 1000);
    return () => clearInterval(interval);
  }, [tickTelemetry, checkSchedules]);

  // Setup real-time FFmpeg logs.
  // Every listener registered here MUST be torn down on unmount: React StrictMode
  // runs this effect twice in dev and each HMR update runs it again, so leaking
  // them means one FFmpeg exit fires handleStreamExit N times — which is how a
  // single disconnect turned into a runaway reconnect loop.
  useEffect(() => {
    let disposed = false;
    const unlisteners: Array<() => void> = [];

    const track = (unlisten: (() => void) | null) => {
      if (!unlisten) return;
      if (disposed) unlisten();
      else unlisteners.push(unlisten);
    };

    import('./services/tauriEngine').then(async ({ setupFFmpegLogListener, setupFFmpegExitListener, setupPlayoutStatsListener }) => {
      track(await setupFFmpegExitListener((streamId) => {
        useStudioStore.getState().handleStreamExit(streamId);
      }));

      // Real "now playing" + upload-buffer level straight from the playout engine.
      track(await setupPlayoutStatsListener((stats) => {
        useStudioStore.setState((state) => ({
          instances: state.instances.map((i) =>
            i.id === stats.streamId
              ? { ...i, currentVideoIndex: stats.clipIndex, bufferSeconds: stats.bufferSeconds }
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
            if (fpsMatch) metricsUpdate.fps = parseFloat(fpsMatch[1]);
            
            let currentDrops = inst.metrics?.droppedFrames || 0;
            if (dropMatch) {
              currentDrops = parseInt(dropMatch[1]);
              metricsUpdate.droppedFrames = currentDrops;
            }
            
            let currentBitrate = inst.metrics?.bitrateKbps || 0;
            if (bitrateMatch) {
              currentBitrate = parseFloat(bitrateMatch[1]);
              metricsUpdate.bitrateKbps = currentBitrate;
            }

            if (speedMatch) {
              metricsUpdate.uploadSpeedMbps = parseFloat(speedMatch[1]); // Reused for Encoding Speed
            }

            // Connection Quality based on Drops & Bitrate
            if (currentDrops === 0 && currentBitrate > 0) {
              metricsUpdate.connectionQuality = 'Excellent';
            } else if (currentDrops < 5 && currentBitrate > 0) {
              metricsUpdate.connectionQuality = 'Good';
            } else if (currentDrops >= 5 && currentDrops < 30) {
              metricsUpdate.connectionQuality = 'Fair';
            } else if (currentDrops >= 30 || currentBitrate === 0) {
              metricsUpdate.connectionQuality = 'Poor';
            }
            
            if (Object.keys(metricsUpdate).length > 0) {
              state.updateInstanceMetrics(streamId, metricsUpdate);
            }
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
          timestamp: new Date().toISOString().split('T')[1].slice(0, 8),
          level: line.toLowerCase().includes('error') ? 'ERROR' : (line.includes('frame=') ? 'INFO' : 'INFO'),
          message: line,
        });
      }));
    });

    return () => {
      disposed = true;
      unlisteners.forEach((unlisten) => unlisten());
      unlisteners.length = 0;
    };
  }, [addLog]);

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
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-studio-darker text-slate-100 font-sans">
      {/* Top Header */}
      <Header />

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
  );
};

export default App;
