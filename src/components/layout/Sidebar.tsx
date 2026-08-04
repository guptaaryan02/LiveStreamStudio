import React from 'react';
import { useStudioStore, NavigationTab } from '../../store/useStudioStore';
import {
  LayoutDashboard,
  Layers,
  ListVideo,
  FileVideo,
  CalendarClock,
  SlidersHorizontal,
  Terminal,
  BarChart3,
  Settings,
  Flame,
} from 'lucide-react';

interface NavItem {
  id: NavigationTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number | string;
  badgeColor?: string;
}

export const Sidebar: React.FC = () => {
  const { activeTab, setActiveTab, instances, playlists, videos, schedules } = useStudioStore();
  const liveCount = instances.filter((i) => i.status === 'live').length;

  const navItems: NavItem[] = [
    {
      id: 'dashboard',
      label: 'Stream Dashboard',
      icon: LayoutDashboard,
      badge: liveCount > 0 ? `${liveCount} LIVE` : undefined,
      badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    },
    {
      id: 'multistream',
      label: 'Multi-Stream Engine',
      icon: Layers,
      badge: instances.length,
      badgeColor: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
    },
    {
      id: 'playlist',
      label: 'Playlist Manager',
      icon: ListVideo,
      badge: playlists.length,
      badgeColor: 'bg-slate-800 text-slate-400 border-slate-700',
    },
    {
      id: 'library',
      label: 'Video Library',
      icon: FileVideo,
      badge: videos.length,
      badgeColor: 'bg-slate-800 text-slate-400 border-slate-700',
    },
    {
      id: 'scheduler',
      label: 'Stream Scheduler',
      icon: CalendarClock,
      badge: schedules.filter((s) => s.isActive).length,
      badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    },
    {
      id: 'profiles',
      label: 'Stream Profiles',
      icon: SlidersHorizontal,
    },
    {
      id: 'logs',
      label: 'FFmpeg Logs & CLI',
      icon: Terminal,
    },
    {
      id: 'analytics',
      label: 'Stream Analytics',
      icon: BarChart3,
    },
    {
      id: 'settings',
      label: 'Engine Settings',
      icon: Settings,
    },
  ];

  return (
    <aside className="w-64 border-r border-studio-border glass-panel flex flex-col justify-between shrink-0 select-none z-20">
      {/* Navigation Links */}
      <div className="p-4 space-y-1.5 overflow-y-auto">
        <div className="px-3 py-2 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
          Core Studio Modules
        </div>

        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl font-medium text-xs transition duration-200 ${
                isActive
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20 font-semibold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <div className="flex items-center space-x-3">
                <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                <span>{item.label}</span>
              </div>

              {item.badge !== undefined && (
                <span
                  className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded-md border ${
                    isActive ? 'bg-indigo-700/80 text-white border-indigo-400/40' : item.badgeColor || 'bg-slate-800 text-slate-400 border-slate-700'
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Pro Banner / Footer Note */}
      <div className="p-4 m-3 rounded-2xl bg-gradient-to-br from-indigo-950/80 to-slate-900 border border-indigo-500/20">
        <div className="flex items-center space-x-2 text-indigo-400 font-semibold text-xs mb-1">
          <Flame className="w-4 h-4 text-amber-400 animate-bounce" />
          <span>Zero Command Line</span>
        </div>
        <p className="text-[11px] text-slate-400 leading-normal">
          Hardware accelerated video looping & RTMP broadcast engine.
        </p>
      </div>
    </aside>
  );
};
