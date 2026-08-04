import React, { useEffect, useMemo, useState } from 'react';
import {
  Apple,
  BadgeCheck,
  Coffee,
  Download,
  Gift,
  HeartHandshake,
  Laptop,
  MonitorDown,
  Radio,
  ShieldCheck,
  Sparkles,
  Terminal,
} from 'lucide-react';

type MarketingPage = 'home' | 'download' | 'support';
type Platform = 'macOS' | 'Windows' | 'Linux';

const downloadFiles: Record<Platform, { href: string; available: boolean; status: string }> = {
  macOS: {
    href: '/downloads/LiveStream-Studio-macOS.dmg',
    available: true,
    status: 'Available now',
  },
  Windows: {
    href: '/downloads/LiveStream-Studio-Windows.exe',
    available: false,
    status: 'Build pending',
  },
  Linux: {
    href: '/downloads/LiveStream-Studio-Linux.AppImage',
    available: false,
    status: 'Build pending',
  },
};

const getPageFromHash = (): MarketingPage => {
  const route = window.location.hash.replace('#/', '').split('?')[0];
  if (route === 'download' || route === 'support') return route;
  return 'home';
};

const goTo = (page: MarketingPage) => {
  window.location.hash = `/${page === 'home' ? '' : page}`;
};

export const MarketingSite: React.FC = () => {
  const [page, setPage] = useState<MarketingPage>(getPageFromHash);
  const [selectedPlatform, setSelectedPlatform] = useState<Platform | null>(null);

  useEffect(() => {
    const updateRoute = () => setPage(getPageFromHash());
    window.addEventListener('hashchange', updateRoute);
    return () => window.removeEventListener('hashchange', updateRoute);
  }, []);

  const pageContent = useMemo(() => {
    if (page === 'download') {
      return <DownloadPage onDownloaded={(platform) => setSelectedPlatform(platform)} />;
    }
    if (page === 'support') {
      return <SupportPage selectedPlatform={selectedPlatform} />;
    }
    return <HomePage />;
  }, [page, selectedPlatform]);

  return (
    <div className="min-h-screen bg-[#0b1018] text-slate-100">
      <header className="fixed inset-x-0 top-0 z-40 border-b border-white/10 bg-[#0b1018]/86 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <button onClick={() => goTo('home')} className="flex items-center gap-2 text-left">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-600 text-white">
              <Radio className="h-4 w-4" />
            </span>
            <span className="text-sm font-bold tracking-wide text-white">LiveStream Studio</span>
          </button>
          <nav className="flex items-center gap-1 text-xs font-semibold text-slate-300">
            <button onClick={() => goTo('download')} className="rounded-lg px-3 py-2 hover:bg-white/10 hover:text-white">
              Download
            </button>
            <button onClick={() => goTo('support')} className="rounded-lg px-3 py-2 hover:bg-white/10 hover:text-white">
              Support
            </button>
            <a href="#/studio" className="hidden rounded-lg px-3 py-2 text-slate-400 hover:bg-white/10 hover:text-white sm:block">
              Studio
            </a>
          </nav>
        </div>
      </header>

      {pageContent}
    </div>
  );
};

const HomePage: React.FC = () => (
  <>
    <section className="relative min-h-[88vh] overflow-hidden pt-16">
      <img
        src="https://images.unsplash.com/photo-1495567720989-cebdbdd97913?auto=format&fit=crop&w=2200&q=85"
        alt=""
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div className="absolute inset-0 bg-[#070b12]/72" />
      <div className="relative mx-auto flex min-h-[calc(88vh-4rem)] max-w-7xl items-center px-4 py-14 sm:px-6 lg:px-8">
        <div className="max-w-3xl">
          <div className="mb-5 inline-flex items-center gap-2 rounded-lg border border-emerald-400/30 bg-emerald-500/12 px-3 py-2 text-xs font-semibold text-emerald-200">
            <BadgeCheck className="h-4 w-4" />
            Free desktop livestream studio for creators
          </div>
          <h1 className="max-w-2xl text-4xl font-black leading-tight text-white sm:text-6xl lg:text-7xl">
            LiveStream Studio
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-slate-200 sm:text-lg">
            Build 24/7 playlists, go live to multiple platforms, and let the app choose the best FFmpeg mode for your machine.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <button
              onClick={() => goTo('download')}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-red-950/40 hover:bg-red-500"
            >
              <Download className="h-4 w-4" />
              Download Free
            </button>
            <button
              onClick={() => goTo('support')}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/20 bg-white/10 px-5 py-3 text-sm font-bold text-white hover:bg-white/15"
            >
              <HeartHandshake className="h-4 w-4" />
              Support the Project
            </button>
          </div>
        </div>
      </div>
    </section>

    <section className="border-y border-white/10 bg-[#111827]">
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-4 px-4 py-8 sm:grid-cols-3 sm:px-6 lg:px-8">
        <Feature icon={<MonitorDown className="h-5 w-5" />} title="Multi-live ready" text="Create separate streams with separate keys for YouTube, Facebook, Twitch, or custom RTMP." />
        <Feature icon={<Sparkles className="h-5 w-5" />} title="Auto optimization" text="Fast copy mode when files match, hardware encoding when mixed formats need compatibility." />
        <Feature icon={<ShieldCheck className="h-5 w-5" />} title="Tauri desktop app" text="Lightweight native packaging for macOS, Windows, and Linux without Electron." />
      </div>
    </section>
  </>
);

const DownloadPage: React.FC<{ onDownloaded: (platform: Platform) => void }> = ({ onDownloaded }) => {
  const startDownload = (platform: Platform) => {
    onDownloaded(platform);
    window.setTimeout(() => goTo('support'), 700);
  };

  return (
    <main className="mx-auto max-w-7xl px-4 pb-16 pt-28 sm:px-6 lg:px-8">
      <div className="max-w-3xl">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-red-300">Free download</p>
        <h1 className="mt-3 text-3xl font-black text-white sm:text-5xl">Choose your desktop build</h1>
        <p className="mt-4 text-sm leading-6 text-slate-300">
          Pick your operating system. After the download starts, you will see a small support page for optional donations.
        </p>
      </div>

      <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-3">
        <DownloadCard
          platform="macOS"
          icon={<Apple className="h-6 w-6" />}
          format="DMG"
          note="Apple Silicon DMG for macOS. Intel/universal builds can be added when release CI is ready."
          onClick={startDownload}
        />
        <DownloadCard
          platform="Windows"
          icon={<Laptop className="h-6 w-6" />}
          format="EXE installer"
          note="Best for Windows 10 and Windows 11. Code signing can be added before public paid distribution."
          onClick={startDownload}
        />
        <DownloadCard
          platform="Linux"
          icon={<Terminal className="h-6 w-6" />}
          format="AppImage"
          note="Portable AppImage first, with deb/rpm packages planned for Linux package users."
          onClick={startDownload}
        />
      </div>
    </main>
  );
};

const SupportPage: React.FC<{ selectedPlatform: Platform | null }> = ({ selectedPlatform }) => (
  <main className="mx-auto max-w-5xl px-4 pb-16 pt-28 sm:px-6 lg:px-8">
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1.1fr_0.9fr]">
      <section>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-300">
          {selectedPlatform ? `${selectedPlatform} download started` : 'Thanks for visiting'}
        </p>
        <h1 className="mt-3 text-3xl font-black text-white sm:text-5xl">LiveStream Studio is free. Support keeps it alive.</h1>
        <p className="mt-5 text-base leading-7 text-slate-300">
          I am building this for creators who need reliable livestream tools without a monthly fee. If it helps your channel,
          a small donation supports development, hosting, testing devices, and my dream of building a stable home and getting married.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <a
            href="https://www.buymeacoffee.com/"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-amber-400 px-5 py-3 text-sm font-black text-slate-950 hover:bg-amber-300"
          >
            <Coffee className="h-4 w-4" />
            Buy Me a Coffee
          </a>
          <a
            href="https://paypal.me/"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/20 bg-white/10 px-5 py-3 text-sm font-bold text-white hover:bg-white/15"
          >
            <Gift className="h-4 w-4" />
            Donate
          </a>
        </div>
      </section>

      <aside className="rounded-lg border border-white/10 bg-[#111827] p-6">
        <h2 className="text-sm font-bold text-white">Donation links to connect</h2>
        <div className="mt-4 space-y-3 text-sm text-slate-300">
          <p>Replace the placeholder links with your real payment links before launch.</p>
          <p>Recommended: UPI for India, PayPal for international users, and Buy Me a Coffee for simple creator support.</p>
        </div>
        <button onClick={() => goTo('download')} className="mt-6 inline-flex items-center gap-2 rounded-lg bg-slate-800 px-4 py-2 text-xs font-bold text-white hover:bg-slate-700">
          <Download className="h-4 w-4" />
          Back to Downloads
        </button>
      </aside>
    </div>
  </main>
);

const Feature: React.FC<{ icon: React.ReactNode; title: string; text: string }> = ({ icon, title, text }) => (
  <div className="rounded-lg border border-white/10 bg-[#0b1018] p-5">
    <div className="flex items-center gap-3 text-white">
      <span className="text-red-300">{icon}</span>
      <h2 className="text-sm font-bold">{title}</h2>
    </div>
    <p className="mt-3 text-sm leading-6 text-slate-400">{text}</p>
  </div>
);

const DownloadCard: React.FC<{
  platform: Platform;
  icon: React.ReactNode;
  format: string;
  note: string;
  onClick: (platform: Platform) => void;
}> = ({ platform, icon, format, note, onClick }) => (
  <section className="rounded-lg border border-white/10 bg-[#111827] p-6">
    <div className="flex items-center justify-between">
      <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-white/10 text-white">{icon}</span>
      <span className="rounded-lg bg-emerald-500/15 px-3 py-1 text-xs font-bold text-emerald-200">{format}</span>
    </div>
    <h2 className="mt-5 text-xl font-black text-white">{platform}</h2>
    <p className="mt-3 min-h-20 text-sm leading-6 text-slate-400">{note}</p>
    {downloadFiles[platform].available ? (
      <a
        href={downloadFiles[platform].href}
        download
        onClick={() => startAfterClick(onClick, platform)}
        className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-3 text-sm font-bold text-white hover:bg-red-500"
      >
        <Download className="h-4 w-4" />
        Download for {platform}
      </a>
    ) : (
      <button
        type="button"
        onClick={() => goTo('support')}
        className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/10 px-4 py-3 text-sm font-bold text-slate-300 hover:bg-white/15"
      >
        <HeartHandshake className="h-4 w-4" />
        {downloadFiles[platform].status}
      </button>
    )}
  </section>
);

const startAfterClick = (onClick: (platform: Platform) => void, platform: Platform) => {
  onClick(platform);
};
