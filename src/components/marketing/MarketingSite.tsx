import React, { useEffect, useMemo, useState } from 'react';
import {
  Apple,
  BadgeCheck,
  CheckCircle2,
  ChevronRight,
  Clock,
  Coffee,
  Cpu,
  Download,
  Gift,
  HeartHandshake,
  Laptop,
  Layers,
  Radio,
  Repeat,
  ShieldCheck,
  Sparkles,
  Terminal,
  TriangleAlert,
  Wifi,
} from 'lucide-react';

type MarketingPage = 'home' | 'download' | 'support';
type Platform = 'macOS' | 'Windows' | 'Linux';

// Installers live in the public downloads repo. Bump this one constant per
// release — every download link is derived from it.
const RELEASE_TAG = 'v1.0.0';
const RELEASES_REPO = 'https://github.com/guptaaryan02/LiveStreamStudio-releases';
const RELEASES_PAGE = `${RELEASES_REPO}/releases`;
const asset = (file: string) => `${RELEASES_REPO}/releases/download/${RELEASE_TAG}/${file}`;

interface PlatformBuild {
  format: string;
  size: string;
  href: string;
  alternate?: { label: string; href: string };
}

const builds: Record<Platform, PlatformBuild> = {
  macOS: {
    format: 'DMG',
    size: '55 MB',
    href: asset('LiveStream.Studio_1.0.0_aarch64.dmg'),
  },
  Windows: {
    format: 'EXE installer',
    size: '84 MB',
    href: asset('LiveStream.Studio_1.0.0_x64-setup.exe'),
    alternate: { label: 'MSI package', href: asset('LiveStream.Studio_1.0.0_x64_en-US.msi') },
  },
  Linux: {
    format: 'AppImage',
    size: '182 MB',
    href: asset('LiveStream.Studio_1.0.0_amd64.AppImage'),
    alternate: { label: '.deb package', href: asset('LiveStream.Studio_1.0.0_amd64.deb') },
  },
};

const getPageFromHash = (): MarketingPage => {
  const route = window.location.hash.replace('#/', '').split('?')[0];
  if (route === 'download' || route === 'support') return route;
  return 'home';
};

const goTo = (page: MarketingPage) => {
  window.location.hash = `/${page === 'home' ? '' : page}`;
  window.scrollTo({ top: 0 });
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
    if (page === 'download') return <DownloadPage onDownloaded={setSelectedPlatform} />;
    if (page === 'support') return <SupportPage selectedPlatform={selectedPlatform} />;
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
            <a
              href={RELEASES_PAGE}
              target="_blank"
              rel="noreferrer"
              className="hidden rounded-lg px-3 py-2 text-slate-400 hover:bg-white/10 hover:text-white sm:block"
            >
              Releases
            </a>
          </nav>
        </div>
      </header>

      {pageContent}

      <footer className="border-t border-white/10 bg-[#070b12]">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
            <div className="max-w-md">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-600 text-white">
                  <Radio className="h-3.5 w-3.5" />
                </span>
                <span className="text-sm font-bold text-white">LiveStream Studio</span>
              </div>
              <p className="mt-3 text-xs leading-6 text-slate-500">
                Free 24/7 livestreaming for YouTube, Facebook, Twitch and any RTMP server.
                Your stream keys stay on your computer and are only ever sent to the platform you choose.
              </p>
            </div>
            <div className="text-xs leading-6 text-slate-500">
              <p className="font-semibold text-slate-400">Third-party software</p>
              <p className="mt-1 max-w-sm">
                Bundles FFmpeg, licensed under the GPL and run as a separate program.
                Licence texts and the exact build shipped are included in the app.
              </p>
              <a href={RELEASES_PAGE} target="_blank" rel="noreferrer" className="mt-2 inline-block text-slate-400 hover:text-white">
                All releases &amp; source offer →
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

const HomePage: React.FC = () => (
  <>
    <section className="relative overflow-hidden pt-16">
      <div className="absolute inset-0 bg-gradient-to-b from-[#131c2e] via-[#0b1018] to-[#0b1018]" />
      <div className="absolute -top-40 left-1/2 h-96 w-[42rem] -translate-x-1/2 rounded-full bg-red-600/20 blur-3xl" />
      <div className="relative mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
        <div className="max-w-3xl">
          <div className="mb-5 inline-flex items-center gap-2 rounded-lg border border-emerald-400/30 bg-emerald-500/12 px-3 py-2 text-xs font-semibold text-emerald-200">
            <BadgeCheck className="h-4 w-4" />
            Free · no account · no subscription
          </div>
          <h1 className="text-4xl font-black leading-tight text-white sm:text-6xl">
            Stream your playlist
            <span className="block text-red-500">24 hours a day.</span>
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
            Point LiveStream Studio at a folder of videos, paste your stream key, and it broadcasts them
            on a loop — for hours or for weeks. FFmpeg is built in, so there is nothing else to install
            and no command line to learn.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <button
              onClick={() => goTo('download')}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 px-6 py-3.5 text-sm font-bold text-white shadow-lg shadow-red-950/40 hover:bg-red-500"
            >
              <Download className="h-4 w-4" />
              Download free
            </button>
            <button
              onClick={() => goTo('support')}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/20 bg-white/10 px-6 py-3.5 text-sm font-bold text-white hover:bg-white/15"
            >
              <HeartHandshake className="h-4 w-4" />
              Support the project
            </button>
          </div>
          <p className="mt-4 text-xs text-slate-500">
            macOS · Windows · Linux — {builds.macOS.size}–{builds.Linux.size} download
          </p>
        </div>
      </div>
    </section>

    <section className="border-y border-white/10 bg-[#111827]">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <h2 className="text-2xl font-black text-white sm:text-3xl">Built for streams that never stop</h2>
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Feature
            icon={<Sparkles className="h-5 w-5" />}
            title="Any mix of formats"
            text="MP4, MOV, MKV, different resolutions, different frame rates — even clips whose audio and video tracks are stored in a different order. The app normalises them on the fly so playback never stops between clips."
          />
          <Feature
            icon={<Repeat className="h-5 w-5" />}
            title="True 24/7 looping"
            text="Set a repeat count or loop forever. Playlists can hold thousands of clips; only one file is ever open at a time, so memory stays flat whether you queue 3 videos or 1,000."
          />
          <Feature
            icon={<Cpu className="h-5 w-5" />}
            title="Hardware encoding"
            text="Apple VideoToolbox, NVIDIA NVENC and Intel Quick Sync are used automatically. When every clip already matches, it streams without re-encoding at all — near-zero CPU."
          />
          <Feature
            icon={<Wifi className="h-5 w-5" />}
            title="Automatic recovery"
            text="If the connection drops, the stream reconnects on its own with a widening backoff, then gives up cleanly instead of hammering the server forever."
          />
          <Feature
            icon={<Layers className="h-5 w-5" />}
            title="Multiple streams at once"
            text="Run separate broadcasts with separate keys — YouTube, Facebook, Twitch or any custom RTMP endpoint — from one window."
          />
          <Feature
            icon={<Clock className="h-5 w-5" />}
            title="Scheduling"
            text="Start a broadcast at a set time on chosen days, so a channel can run on a timetable without you being at the machine."
          />
        </div>
      </div>
    </section>

    <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
      <h2 className="text-2xl font-black text-white sm:text-3xl">Live in three steps</h2>
      <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
        <Step n="1" title="Add your videos" text="Pick files from your computer in the Video Library. Nothing is uploaded anywhere." />
        <Step n="2" title="Build a playlist" text="Drag clips into order, then choose repeat or infinite loop." />
        <Step n="3" title="Go live" text="Choose the platform, paste your stream key, press Start. That is the whole workflow." />
      </div>

      <div className="mt-12 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-white/10 bg-[#111827] p-6">
          <h3 className="text-sm font-bold text-white">What you need</h3>
          <ul className="mt-4 space-y-2.5 text-sm text-slate-400">
            <Requirement>macOS 12 or later (Apple Silicon), Windows 10/11, or a modern Linux desktop</Requirement>
            <Requirement>A stream key from YouTube, Facebook, Twitch or your own RTMP server</Requirement>
            <Requirement>Upload bandwidth of roughly twice your target bitrate</Requirement>
            <Requirement>Your video files on a local drive</Requirement>
          </ul>
        </div>
        <div className="rounded-lg border border-white/10 bg-[#111827] p-6">
          <h3 className="text-sm font-bold text-white">What it does not do</h3>
          <ul className="mt-4 space-y-2.5 text-sm text-slate-400">
            <Requirement muted>No webcam, screen capture or live scene switching — this is for pre-recorded playlists</Requirement>
            <Requirement muted>No video editing; bring finished files</Requirement>
            <Requirement muted>No cloud streaming — your computer does the work and needs to stay on</Requirement>
          </ul>
        </div>
      </div>
    </section>

    <section className="border-t border-white/10 bg-[#111827]">
      <div className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6">
        <h2 className="text-2xl font-black text-white sm:text-3xl">Ready to go live?</h2>
        <p className="mt-4 text-sm leading-7 text-slate-400">
          Free to download and use. If it earns you something, consider supporting the work.
        </p>
        <button
          onClick={() => goTo('download')}
          className="mt-8 inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 px-6 py-3.5 text-sm font-bold text-white hover:bg-red-500"
        >
          <Download className="h-4 w-4" />
          Download for free
        </button>
      </div>
    </section>
  </>
);

const DownloadPage: React.FC<{ onDownloaded: (platform: Platform) => void }> = ({ onDownloaded }) => {
  const startDownload = (platform: Platform) => {
    onDownloaded(platform);
    window.setTimeout(() => goTo('support'), 900);
  };

  return (
    <main className="mx-auto max-w-7xl px-4 pb-20 pt-28 sm:px-6 lg:px-8">
      <div className="max-w-3xl">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-red-300">Free download · {RELEASE_TAG}</p>
        <h1 className="mt-3 text-3xl font-black text-white sm:text-5xl">Choose your platform</h1>
        <p className="mt-4 text-sm leading-6 text-slate-300">
          FFmpeg is included in every build — there is nothing else to install.
        </p>
      </div>

      <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-3">
        <DownloadCard platform="macOS" icon={<Apple className="h-6 w-6" />} note="Apple Silicon (M1 and later)." onClick={startDownload} />
        <DownloadCard platform="Windows" icon={<Laptop className="h-6 w-6" />} note="Windows 10 and 11, 64-bit." onClick={startDownload} />
        <DownloadCard platform="Linux" icon={<Terminal className="h-6 w-6" />} note="Portable AppImage, x86_64." onClick={startDownload} />
      </div>

      <section className="mt-12 rounded-lg border border-amber-500/25 bg-amber-500/[0.07] p-6">
        <div className="flex items-start gap-3">
          <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
          <div>
            <h2 className="text-sm font-bold text-white">Your system will warn you on first launch</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
              These builds are not code-signed, because a signing certificate costs money every year and this app
              is free. The warning is about the missing certificate, not about anything found in the app. Here is
              how to get past it.
            </p>

            <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
              <InstallSteps
                title="macOS"
                steps={[
                  'Open the .dmg and drag the app into Applications',
                  'Right-click the app in Applications and choose Open',
                  'Confirm Open in the dialog that appears',
                ]}
                footnote={
                  <>
                    If macOS says the app is damaged, clear the quarantine flag:
                    <code className="mt-2 block overflow-x-auto rounded bg-black/40 px-3 py-2 font-mono text-[11px] text-slate-300">
                      xattr -dr com.apple.quarantine "/Applications/LiveStream Studio.app"
                    </code>
                  </>
                }
              />
              <InstallSteps
                title="Windows"
                steps={['Run the .exe installer', 'SmartScreen appears — click More info', 'Click Run anyway']}
              />
              <InstallSteps
                title="Linux"
                steps={['Make the AppImage executable', 'Run it directly — no install needed']}
                footnote={
                  <code className="mt-2 block overflow-x-auto rounded bg-black/40 px-3 py-2 font-mono text-[11px] text-slate-300">
                    chmod +x LiveStream*.AppImage &amp;&amp; ./LiveStream*.AppImage
                  </code>
                }
              />
            </div>
          </div>
        </div>
      </section>

      <p className="mt-8 text-xs text-slate-500">
        Looking for the .msi, .deb or .rpm packages?{' '}
        <a href={RELEASES_PAGE} target="_blank" rel="noreferrer" className="text-slate-300 underline hover:text-white">
          Browse all release files
        </a>
        .
      </p>
    </main>
  );
};

const SupportPage: React.FC<{ selectedPlatform: Platform | null }> = ({ selectedPlatform }) => (
  <main className="mx-auto max-w-5xl px-4 pb-20 pt-28 sm:px-6 lg:px-8">
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1.1fr_0.9fr]">
      <section>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-300">
          {selectedPlatform ? `${selectedPlatform} download started` : 'Thanks for visiting'}
        </p>
        <h1 className="mt-3 text-3xl font-black text-white sm:text-5xl">
          LiveStream Studio is free. Support keeps it alive.
        </h1>
        <p className="mt-5 text-base leading-7 text-slate-300">
          I build this for creators who need reliable livestream tools without a monthly fee. If it helps your
          channel, a small donation supports development, hosting and testing devices.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <a
            href="https://www.buymeacoffee.com/"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-amber-400 px-5 py-3 text-sm font-black text-slate-950 hover:bg-amber-300"
          >
            <Coffee className="h-4 w-4" />
            Buy me a coffee
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
        <h2 className="text-sm font-bold text-white">Need help?</h2>
        <div className="mt-4 space-y-3 text-sm leading-6 text-slate-400">
          <p>
            Report a problem on the{' '}
            <a href={`${RELEASES_REPO}/issues`} target="_blank" rel="noreferrer" className="text-slate-200 underline hover:text-white">
              issue tracker
            </a>{' '}
            with your operating system, what you were doing, and the lines from FFmpeg Logs in the app.
          </p>
          <p className="text-slate-500">Remember to remove your stream key from anything you paste.</p>
        </div>
        <button
          onClick={() => goTo('download')}
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-slate-800 px-4 py-2 text-xs font-bold text-white hover:bg-slate-700"
        >
          <Download className="h-4 w-4" />
          Back to downloads
        </button>
      </aside>
    </div>
  </main>
);

const Feature: React.FC<{ icon: React.ReactNode; title: string; text: string }> = ({ icon, title, text }) => (
  <div className="rounded-lg border border-white/10 bg-[#0b1018] p-5">
    <div className="flex items-center gap-3 text-white">
      <span className="text-red-300">{icon}</span>
      <h3 className="text-sm font-bold">{title}</h3>
    </div>
    <p className="mt-3 text-sm leading-6 text-slate-400">{text}</p>
  </div>
);

const Step: React.FC<{ n: string; title: string; text: string }> = ({ n, title, text }) => (
  <div className="rounded-lg border border-white/10 bg-[#111827] p-6">
    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-600/15 text-sm font-black text-red-300">
      {n}
    </span>
    <h3 className="mt-4 text-sm font-bold text-white">{title}</h3>
    <p className="mt-2 text-sm leading-6 text-slate-400">{text}</p>
  </div>
);

const Requirement: React.FC<{ children: React.ReactNode; muted?: boolean }> = ({ children, muted }) => (
  <li className="flex items-start gap-2.5">
    {muted ? (
      <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-slate-600" />
    ) : (
      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
    )}
    <span className="leading-6">{children}</span>
  </li>
);

const InstallSteps: React.FC<{ title: string; steps: string[]; footnote?: React.ReactNode }> = ({
  title,
  steps,
  footnote,
}) => (
  <div>
    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">{title}</h3>
    <ol className="mt-3 space-y-2 text-sm text-slate-400">
      {steps.map((step, i) => (
        <li key={step} className="flex items-start gap-2">
          <span className="mt-0.5 font-mono text-xs text-slate-600">{i + 1}.</span>
          <span className="leading-6">{step}</span>
        </li>
      ))}
    </ol>
    {footnote && <div className="mt-3 text-xs leading-6 text-slate-500">{footnote}</div>}
  </div>
);

const DownloadCard: React.FC<{
  platform: Platform;
  icon: React.ReactNode;
  note: string;
  onClick: (platform: Platform) => void;
}> = ({ platform, icon, note, onClick }) => {
  const build = builds[platform];
  return (
    <section className="flex flex-col rounded-lg border border-white/10 bg-[#111827] p-6">
      <div className="flex items-center justify-between">
        <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-white/10 text-white">{icon}</span>
        <span className="rounded-lg bg-emerald-500/15 px-3 py-1 text-xs font-bold text-emerald-200">{build.format}</span>
      </div>
      <h2 className="mt-5 text-xl font-black text-white">{platform}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-400">{note}</p>
      <p className="mt-1 text-xs text-slate-500">{build.size}</p>

      <a
        href={build.href}
        onClick={() => onClick(platform)}
        className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-3 text-sm font-bold text-white hover:bg-red-500"
      >
        <Download className="h-4 w-4" />
        Download for {platform}
      </a>

      {build.alternate && (
        <a
          href={build.alternate.href}
          onClick={() => onClick(platform)}
          className="mt-3 inline-flex items-center justify-center gap-1 text-xs font-semibold text-slate-400 hover:text-white"
        >
          {build.alternate.label}
          <ChevronRight className="h-3 w-3" />
        </a>
      )}
    </section>
  );
};
