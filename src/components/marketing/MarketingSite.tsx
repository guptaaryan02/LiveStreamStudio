import React, { useEffect, useRef, useState } from 'react';
import { Activity, Apple, ArrowDown, ArrowRight, CalendarClock, Check, ChevronDown, CircleHelp, Cpu, Download, ExternalLink, FolderOpen, Mail, Layers, Menu, Moon, Play, Radio, Repeat2, ShieldCheck, SlidersHorizontal, Sun, Terminal, Wifi, X } from 'lucide-react';
import './marketing.css';
import { DOWNLOAD_COUNTER_BASELINE, DOWNLOADS_AT_COUNTER_LAUNCH, loadDownloadStats, type DownloadStats } from '../../services/downloadStats';

type InstallPlatform = 'mac' | 'windows' | 'linux';
type Page = `download/${InstallPlatform}` | 'home' | 'download' | 'support' | 'brand' | 'release-notes' | 'licenses';
const SUPPORT = 'support@b2r.it.com';
const BRAND = '/brand/';
const getPage = (): Page => {
  const route = window.location.hash.replace('#/', '').split('?')[0];
  return route === 'download/mac' || route === 'download/windows' || route === 'download/linux' || route === 'download' || route === 'support' || route === 'brand' || route === 'release-notes' || route === 'licenses' ? route : 'home';
};
const go = (page: Page) => { window.location.hash = page === 'home' ? '/' : `/${page}`; };
const Mark = ({ className = '' }: { className?: string }) => <img src={`${BRAND}livestream-studio-mark.svg`} alt="" className={`brand-mark ${className}`} />;
const Wordmark = () => <span className="brand-wordmark"><strong>LiveStream<span> Studio</span></strong><small>BY B2R</small></span>;
const Brand = () => <><Mark /><Wordmark /></>;

export const MarketingSite: React.FC = () => {
  const scrollArea = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState<Page>(getPage);
  const [menuOpen, setMenuOpen] = useState(false);
  const [dark, setDark] = useState(() => { try { return localStorage.getItem('livestream-marketing-theme') === 'dark'; } catch { return false; } });
  useEffect(() => { const change = () => setPage(getPage()); window.addEventListener('hashchange', change); return () => window.removeEventListener('hashchange', change); }, []);
  useEffect(() => { scrollArea.current?.scrollTo({ top: 0, behavior: 'instant' }); setMenuOpen(false); }, [page]);
  useEffect(() => { try { localStorage.setItem('livestream-marketing-theme', dark ? 'dark' : 'light'); } catch { /* storage may be disabled */ } }, [dark]);
  useEffect(() => { const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); }; window.addEventListener('keydown', escape); return () => window.removeEventListener('keydown', escape); }, []);
  const section = (id: string) => {
    setMenuOpen(false);
    if (page !== 'home') { go('home'); requestAnimationFrame(() => requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' }))); }
    else document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };
  return <div ref={scrollArea} className="b2r-site" data-color-mode={dark ? 'dark' : 'light'}>
    <a className="skip-link" href="#main-content">Skip to content</a>
    <header className="site-header">
      <button className="brand" aria-label="LiveStream Studio by B2R, home" onClick={() => go('home')}><Brand /></button>
      <nav className={`site-nav ${menuOpen ? 'is-open' : ''}`} aria-label="Main navigation" id="main-navigation">
        <button onClick={() => section('features')}>Features</button><button onClick={() => section('how-it-works')}>How it works</button><button onClick={() => section('faq')}>FAQ</button>
        <button onClick={() => go('support')}>Support</button>
      </nav>
      <div className="header-actions"><button className="theme-button" onClick={() => setDark(!dark)} aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}>{dark ? <Sun size={18} /> : <Moon size={18} />}</button>
        <button className="button button-primary header-download" onClick={() => go('download')}>Get the app <ArrowRight size={15} /></button>
        <button className="mobile-menu" aria-label={menuOpen ? 'Close menu' : 'Open menu'} aria-expanded={menuOpen} aria-controls="main-navigation" onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X /> : <Menu />}</button></div>
    </header>
    <main id="main-content" tabIndex={-1}>
      {page === 'home' ? <HomePage onSection={section} /> : page.startsWith('download/') ? <InstallPage platform={page.split('/')[1] as InstallPlatform} /> : page === 'download' ? <DownloadPage /> : page === 'brand' ? <BrandPage /> : page === 'release-notes' ? <ReleaseNotesPage /> : page === 'licenses' ? <LicensesPage /> : <SupportPage />}
    </main>
    <footer className="site-footer"><div className="footer-top"><div><button className="brand" aria-label="LiveStream Studio by B2R, home" onClick={() => go('home')}><Brand /></button><p>A little less setup.<br />A lot more time on air.</p></div>
      <div><h3>PRODUCT</h3><button onClick={() => section('features')}>Features</button><button onClick={() => go('download')}>Downloads</button><button onClick={() => go('release-notes')}>Release notes</button></div>
      <div><h3>HELP & RESOURCES</h3><button onClick={() => section('faq')}>Common questions</button><button onClick={() => go('support')}>Get support</button><button onClick={() => go('brand')}>Brand & logo</button><button onClick={() => go('licenses')}>Third-party licences</button></div>
      <div><h3>MORE FROM B2R</h3><a href="https://b2r.it.com/" target="_blank" rel="noreferrer">Explore B2R <ArrowRight size={13} /></a><a href="https://pramvex.com/" target="_blank" rel="noreferrer">Pramvex <span>Private AI workspace</span></a><a href="https://voidcutpro.com/" target="_blank" rel="noreferrer">VoidCut Pro <span>Video editing</span></a><a href="https://caption-cut.com/" target="_blank" rel="noreferrer">Caption Cut <span>Offline subtitles</span></a></div></div>
      <div className="footer-bottom"><p>© {new Date().getFullYear()} B2R. LiveStream Studio is a B2R product.</p><span><i /> Made for creators. Built by B2R.</span></div>
    </footer>
  </div>;
};

const HomePage = ({ onSection }: { onSection: (id: string) => void }) => <>
  <section className="hero"><div className="hero-grid" aria-hidden="true" /><div className="hero-inner">
    <div className="eyebrow hero-eyebrow"><span className="live-dot" /> YOUR CHANNEL. ALWAYS ON.</div>
    <h1>Your videos.<br />An always-on <span>livestream.</span></h1>
    <p className="hero-copy">Turn the videos you’ve already made into a channel that keeps playing.<br className="desktop-break" /> Playlists, schedules and multiple streams. One simple studio.</p>
    <div className="hero-actions"><button className="button button-primary button-large" onClick={() => go('download')}><Download size={18} /> Get LiveStream Studio</button><button className="text-button" onClick={() => onSection('how-it-works')}>See how it works <ArrowRight size={17} /></button></div>
    <p className="hero-meta">DESKTOP APP <span>·</span> NO SUBSCRIPTION <span>·</span> A PRODUCT BY B2R</p>
    <div className="trust-pills"><span><ShieldCheck /> Your keys stay yours</span><span><Repeat2 /> Continuous playlists</span><span><Layers /> Multiple destinations</span></div>
    <DownloadCounter compact />
    <StudioPreview />
    <div className="platform-row"><span>YOUR CONTENT. YOUR PLATFORM.</span><div><span className="youtube-mark"><Play size={12} fill="currentColor" /></span>YouTube</div><div><strong className="facebook-mark">f</strong>Facebook</div><div><span className="twitch-mark">▣</span>Twitch</div><div><Radio size={19} /> Custom RTMP</div></div>
  </div></section>
  <section className="section features-section" id="features"><div className="section-heading"><p className="eyebrow">LESS MANAGING. MORE STREAMING.</p><h2>Everything to keep<br />your channel <span>in motion.</span></h2><p>From a single playlist to different channels, keep the details<br className="desktop-break" /> in one place and put your content to work.</p></div>
    <div className="feature-grid"><Feature icon={<Repeat2 />} title="A playlist with no last track." text="Put your videos in order, repeat a few times or loop continuously. Different formats? The studio can normalise them for your stream." label="PLAYLISTS" className="feature-wide"><div className="mini-playlist"><div><span className="mini-art sunset" /><span>Golden hour sessions<small>NOW PLAYING</small></span><Activity size={20} /></div><div><span className="mini-art ocean" /><span>Into the blue<small>UP NEXT</small></span><span>02</span></div><div className="playlist-loop"><Repeat2 size={14} /> And back to the beginning. <span>∞</span></div></div></Feature>
      <Feature icon={<Layers />} title="One studio. More destinations." text="Stream to separate channels with their own keys. Use the same playlist or give each broadcast its own." label="MULTI-STREAM"><div className="destination-stack"><span><i className="destination-youtube"><Play size={12} fill="currentColor" /></i>YouTube <b><i />LIVE</b></span><span><i className="destination-twitch">▣</i>Twitch <b><i />LIVE</b></span></div></Feature>
      <Feature icon={<CalendarClock />} title="Give your content a timetable." text="Choose a one-time start or a recurring schedule. Finish after a set time or a complete number of playlist loops." label="SCHEDULING"><div className="schedule-mini"><CalendarClock size={24} /><div>Morning sessions<small>Every day · 05:00</small></div><Check size={17} /></div></Feature>
      <Feature icon={<Cpu />} title="Less work, every time you go live." text="Prepare compatible video once and stream it without encoding it again. Hardware encoding is available on supported systems." label="EFFICIENT PLAYBACK" />
      <Feature icon={<Wifi />} title="A little resilience built in." text="Automatic reconnect attempts, stream metrics and retained failure logs help you see what happened when a connection drops." label="STREAM HEALTH" />
      <Feature icon={<ShieldCheck />} title="Your setup stays with you." text="Local videos. Session-only keys by default. Optional macOS Keychain storage when you choose to save a key." label="YOUR CONTROL" />
    </div>
  </section>
  <section className="workflow-section" id="how-it-works"><div className="section workflow-inner"><div className="section-heading"><p className="eyebrow">FROM FOLDER TO LIVE</p><h2>Set the stage.<br /><span>Let it play.</span></h2><p>No terminal commands. No complicated scenes.<br />Just your content and a place to send it.</p></div><div className="workflow-steps">{[
    { icon: <FolderOpen />, title: 'Bring your videos.', text: 'Add local files to your library. Create a playlist and make the order yours.' },
    { icon: <SlidersHorizontal />, title: 'Make it your stream.', text: 'Choose an output, add the stream key and set your loop or schedule.' },
    { icon: <Radio />, title: 'You’re ready for air.', text: 'Start from the studio, or let your schedule take over while the app stays open.' },
  ].map((step, i) => <div className="workflow-step" key={step.title}><span className="step-number">0{i + 1}</span><div className="step-icon">{step.icon}</div><div><h3>{step.title}</h3><p>{step.text}</p></div></div>)}</div></div></section>
  <section className="section faq-section" id="faq"><div className="section-heading"><p className="eyebrow">BEFORE YOU GO LIVE</p><h2>A few things<br /><span>worth knowing.</span></h2></div><div className="faq-list">{[
    ['Does my computer need to stay on?', 'Yes. LiveStream Studio runs on your computer, so keep the app open and your internet connection active. Locking the screen is fine. On macOS, optional wake alarms can help with a scheduled start after sleep. Shutdown and logout are not supported.'],
    ['Can I stream different videos at the same time?', 'Yes. Each destination can use its own playlist and stream key. The number of simultaneous streams depends on your computer, video settings and upload bandwidth. Prepared compatible media can reduce encoding work.'],
    ['Does it work with YouTube schedules?', 'The studio can start sending video at your scheduled time. Enable Auto-start for the target YouTube broadcast and prepare its key in the app before the start.'],
    ['Is this a cloud service or a video editor?', <>It is a desktop app for broadcasting pre-recorded video playlists. Bring finished videos. It does not host your streams in the cloud, edit videos, capture your screen or switch live camera scenes. For video editing, try our <a href="https://voidcutpro.com/" target="_blank" rel="noreferrer">VoidCut Pro video editor</a>, another B2R product.</>],
    ['Who makes LiveStream Studio?', 'LiveStream Studio is a B2R product. We build practical tools for creators, including Pramvex for private AI work and Caption Cut for offline subtitles.'],
  ].map(([question, answer]) => <details key={String(question)}><summary>{question}<ChevronDown size={17} /></summary><p>{answer}</p></details>)}</div></section>
  <section className="closing-section"><div className="closing-glow" /><Mark /><p className="eyebrow">MADE FOR YOUR NEXT BROADCAST</p><h2>Your content deserves<br /><span>more time on air.</span></h2><p>Give your videos an encore. Then another.</p><button className="button button-primary button-large" onClick={() => go('download')}>Get LiveStream Studio <ArrowRight size={18} /></button><span className="closing-signature">A B2R PRODUCT</span></section>
</>;

function StudioPreview() {
  return <figure className="studio-showcase real-studio-showcase">
    <figcaption className="showcase-caption"><span><span className="live-dot" /> THE REAL LIVESTREAM STUDIO APP</span><span>MACOS · VERSION 1.0.10</span></figcaption>
    <a className="real-app-frame" href="/screenshots/livestream-studio-dashboard.png" target="_blank" rel="noreferrer" aria-label="View the real LiveStream Studio dashboard screenshot at full size">
      <img src="/screenshots/livestream-studio-dashboard.png" alt="Real LiveStream Studio 1.0.10 desktop app showing a local Golden Hour Sessions video, playlist selection and stream controls. Demo workspace with no active broadcast." width="2880" height="1612" decoding="async" />
      <span className="screenshot-expand">View full size <ExternalLink size={13} /></span>
    </a>
    <div className="showcase-note"><span><Check size={13} /> Captured from the desktop app. Demo video; no live broadcast.</span><span>LiveStream Studio by B2R</span></div>
  </figure>;
}

function Feature({ icon, title, text, label, className = '', children }: { icon: React.ReactNode; title: string; text: string; label: string; className?: string; children?: React.ReactNode }) {
  return <article className={`feature-card ${className}`}><span className="feature-icon">{icon}</span><p className="feature-label">{label}</p><h3>{title}</h3><p>{text}</p>{children}</article>;
}

interface ReleaseAsset { name: string; browser_download_url: string; size: number; digest?: string }
interface Release { tag_name: string; assets: ReleaseAsset[]; body?: string }
function usePublicRelease() {
  const [release, setRelease] = useState<Release | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'unavailable' | 'error'>('loading');
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const timeout = window.setTimeout(() => { if (active) { setState('error'); controller.abort(); } }, 15000);
    void fetch('https://api.github.com/repos/guptaaryan02/LiveStreamStudio-releases/releases/latest', { signal: controller.signal }).then(async r => {
      if (r.status === 404) { if (active) setState('unavailable'); return; }
      if (!r.ok) throw new Error('Release information unavailable');
      const data = await r.json();
      if (active) { setRelease({ tag_name: data.tag_name, body: data.body || '', assets: (data.assets || []).filter((a: ReleaseAsset) => a.browser_download_url.startsWith('https://github.com/guptaaryan02/LiveStreamStudio-releases/releases/download/')) }); setState('ready'); }
    }).catch(e => { if (active && e.name !== 'AbortError') setState('error'); }).finally(() => window.clearTimeout(timeout));
    return () => { active = false; window.clearTimeout(timeout); controller.abort(); };
  }, []);
  return { release, state };
}
function DownloadCounter({ compact = false }: { compact?: boolean }) {
  const [stats, setStats] = useState<DownloadStats | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    const refresh = () => { void loadDownloadStats().then(value => { if (active) { setStats(value); setFailed(false); } }).catch(() => { if (active) setFailed(true); }); };
    refresh();
    const interval = window.setInterval(refresh, 60_000);
    return () => { active = false; window.clearInterval(interval); };
  }, []);
  const fresh = stats ? Math.max(0, stats.total - DOWNLOADS_AT_COUNTER_LAUNCH) : null;
  const format = (value: number) => value.toLocaleString('en-US');
  return <aside className={`download-counter ${compact ? 'download-counter-compact' : ''}`} aria-label="Download statistics">
    <div className="counter-head"><Download size={19} /><strong>{fresh === null ? '—' : format(DOWNLOAD_COUNTER_BASELINE + fresh)}</strong><span>Launch counter</span></div>
    <p>{fresh === null ? failed ? 'Download statistics are temporarily unavailable.' : 'Loading download statistics…' : `999 starting baseline + ${format(fresh)} new installer downloads.`}</p>
    {stats && <><div className="counter-measured"><span><strong>{format(stats.total)}</strong> recorded installer downloads</span>{!compact && <div><span>macOS <b>{format(stats.mac)}</b></span><span>Windows <b>{format(stats.windows)}</b></span><span>Linux <b>{format(stats.linux)}</b></span></div>}</div>{!compact && <small>Across published versions. Includes repeat and test downloads; not unique users. Refreshes every minute.{failed ? ' Last recorded values shown; refresh is unavailable.' : ''}</small>}</>}
  </aside>;
}
function DownloadPage() {
  const { release, state } = usePublicRelease();
  const [download, setDownload] = useState('');
  const platforms = [{ id: 'mac' as const, name: 'macOS', icon: <Apple />, note: 'Apple Silicon · M1 and later', match: /aarch64\.dmg$/i }, { id: 'windows' as const, name: 'Windows', icon: <span className="windows-icon">⊞</span>, note: '64-bit desktop installer', match: /x64.*(?:setup\.exe|\.msi)$/i }, { id: 'linux' as const, name: 'Linux', icon: <Terminal />, note: 'x86_64 · Portable AppImage', match: /amd64\.AppImage$/i }];
  return <section className="section subpage download-page"><div className="section-heading centered"><p className="eyebrow">YOUR NEXT BROADCAST STARTS HERE</p><h1>Make room<br />for <span>your studio.</span></h1><p>Local videos. Your channels. A desktop app by B2R.</p></div>
    <div className="release-notice" role="status"><Download size={19} /><div>{download ? `Your ${download} installer download is starting.` : state === 'loading' ? 'Checking published installers…' : state === 'ready' ? `Latest release: ${release?.tag_name}` : state === 'unavailable' ? 'Public installers are being prepared.' : 'Download information is temporarily unavailable.'}<p>{state === 'unavailable' ? 'The download buttons will be enabled as soon as the installers are ready.' : 'Choose your platform to download the installer without leaving this page.'}</p></div></div>
    <DownloadCounter />
    <div className="download-grid">{platforms.map(platform => { const asset = release?.assets.find(a => platform.match.test(a.name)); return <article className="download-card" key={platform.name}><span className="platform-icon">{platform.icon}</span><h2>{platform.name}</h2><p>{platform.note}</p>{asset ? <><span className="download-version">{release?.tag_name} · {(asset.size / 1048576).toFixed(0)} MB</span><a className="button button-primary" href={asset.browser_download_url} download={asset.name} onClick={() => setDownload(platform.name)}><Download size={16} />Download for {platform.name}</a></> : <><span className="download-version">{state === 'loading' ? 'Checking availability' : 'Installer coming soon'}</span><button className="button button-secondary" disabled>{state === 'loading' ? 'Checking…' : 'Preparing installer'}</button></>}<a className="text-button install-guide-link" href={`#/download/${platform.id}`}>Installation guide <ArrowRight size={15} /></a></article>; })}</div>
    <div className="download-guidance"><div><ShieldCheck /><h3>Install with confidence.</h3><p>Review release notes, system requirements and signing status before installing. For uninterrupted broadcasts, update after your current stream ends.</p></div><div><CalendarClock /><h3>See what’s new.</h3><p>Read the latest improvements and platform notes here.</p><button className="text-button" onClick={() => go('release-notes')}>Release notes <ArrowRight size={15} /></button></div></div>
  </section>;
}

const INSTALL_INFO = {
  mac: { name: 'macOS', note: 'Apple Silicon · M1 and later', match: /aarch64\.dmg$/i },
  windows: { name: 'Windows', note: '64-bit Intel / AMD PCs · x64', match: /x64.*setup\.exe$/i },
  linux: { name: 'Linux', note: '64-bit Intel / AMD PCs · x86_64', match: /amd64\.AppImage$/i },
};
function InstallPage({ platform }: { platform: InstallPlatform }) {
  const { release, state } = usePublicRelease();
  const info = INSTALL_INFO[platform];
  const asset = release?.assets.find(a => info.match.test(a.name));
  const alternatives = release?.assets.filter(a => platform === 'windows' ? /\.msi$/i.test(a.name) : platform === 'linux' ? /\.(deb|rpm)$/i.test(a.name) : false) || [];
  const file = asset?.name;
  const verify = file ? platform === 'mac' ? `shasum -a 256 ~/Downloads/${file}` : platform === 'windows' ? `Get-FileHash "$env:USERPROFILE\\Downloads\\${file}" -Algorithm SHA256` : `sha256sum ~/Downloads/${file}` : '';
  return <section className="section subpage install-page">
    <a className="text-button" href="#/download">All downloads <ArrowRight size={15} /></a>
    <div className="section-heading"><p className="eyebrow">DOWNLOAD & INSTALL</p><h1>Your studio.<br /><span>For {info.name}.</span></h1><p>{info.note}</p></div>
    <div className="install-download"><div><strong>{release?.tag_name || 'LiveStream Studio'}</strong><p>{asset ? `${(asset.size / 1048576).toFixed(0)} MB · ${asset.name}` : state === 'loading' ? 'Checking published installers…' : 'Installer information is temporarily unavailable. Please try again.'}</p></div>{asset && <a className="button button-primary" href={asset.browser_download_url} download={asset.name}><Download size={16} />Download for {info.name}</a>}</div>
    {alternatives.length > 0 && <div className="install-alternatives"><span>Other formats:</span>{alternatives.map(a => <a className="text-button" key={a.name} href={a.browser_download_url} download={a.name}>Download .{a.name.split('.').pop()} <ArrowDown size={14} /></a>)}</div>}
    <div className="install-sections">
      <article><p className="eyebrow">01 · INSTALL</p><h2>Make it at home.</h2>{platform === 'mac' ? <ol><li>Open the downloaded .dmg file.</li><li>Drag LiveStream Studio into Applications.</li><li>Open LiveStream Studio from Applications.</li></ol> : platform === 'windows' ? <ol><li>Open the downloaded .exe installer (or the optional .msi package).</li><li>Follow the installer prompts.</li><li>Open LiveStream Studio from the Start menu.</li></ol> : <><p>Choose one format. All packages contain the same app.</p>{file && <><h3>Portable AppImage</h3><Command text={`chmod +x ~/Downloads/${file}\n~/Downloads/${file}`} /></>}{alternatives.map(a => <div key={a.name}><h3>{a.name.endsWith('.deb') ? 'Debian / Ubuntu' : 'Fedora / compatible RPM systems'}</h3><Command text={a.name.endsWith('.deb') ? `sudo apt install ~/Downloads/${a.name}` : `sudo dnf install ~/Downloads/${a.name}`} /></div>)}<p>Linux requires WebKitGTK 4.1. DEB and RPM packages declare their dependencies. If your AppImage reports missing FUSE support, try running it with <code>--appimage-extract-and-run</code>.</p></>}</article>
      <article><p className="eyebrow">02 · FIRST LAUNCH</p><h2>{platform === 'windows' ? 'About the blue screen.' : platform === 'mac' ? 'When macOS asks.' : 'Ready for your first stream.'}</h2>{platform === 'mac' ? <><p>This release is not notarized by Apple, so macOS may block the first launch.</p><ol><li>Try opening the app once.</li><li>Open <strong>System Settings → Privacy & Security</strong>.</li><li>Find the LiveStream Studio message and choose <strong>Open Anyway</strong>, then confirm.</li></ol><details className="install-troubleshoot"><summary>If macOS says the app “is damaged”</summary><p>First verify your download below and place the app in Applications. For a verified copy downloaded here, run this app-specific command in Terminal, then open the app again:</p><Command text={'xattr -dr com.apple.quarantine "/Applications/LiveStream Studio.app"'} /><p>This removes the quarantine flag only from LiveStream Studio. It does not notarize the app or turn off Gatekeeper for your Mac. If the checksum differs or macOS reports malware, stop and contact support.</p></details></> : platform === 'windows' ? <><p>The installer is not code-signed. Windows may show a blue <strong>“Windows protected your PC”</strong> SmartScreen message.</p><ol><li>Verify the downloaded file using the checksum below.</li><li>In the SmartScreen message, select <strong>More info</strong>.</li><li>Check the app name, then select <strong>Run anyway</strong> to continue with this installer.</li></ol><p>This is a first-launch reputation warning, not a Windows crash. Do not disable Defender or SmartScreen. If Windows reports malware, or your organisation blocks installation, contact support or your administrator.</p></> : <><p>Launch the AppImage directly, or open LiveStream Studio from your applications menu after installing a DEB or RPM.</p><p>Add local videos, create a playlist and enter your destination’s stream key. FFmpeg is included; no separate encoder installation is needed.</p></>}</article>
      <article><p className="eyebrow">03 · VERIFY YOUR DOWNLOAD</p><h2>Check the file.</h2><p>Run this in {platform === 'windows' ? 'PowerShell' : 'Terminal'} and compare the SHA-256 with the published value. They must match exactly.</p>{verify && <Command text={verify} />}{asset?.digest?.startsWith('sha256:') && <div className="checksum-value"><span>SHA-256 · {asset.name}</span><code>{asset.digest.slice(7)}</code></div>}{release?.assets.find(a => a.name === 'SHA256SUMS.txt') && <a className="text-button" href={release.assets.find(a => a.name === 'SHA256SUMS.txt')!.browser_download_url} download="SHA256SUMS.txt">Download checksums for all packages <ArrowDown size={14} /></a>}<p>A matching checksum confirms that the file matches our published release. Only continue with a copy you downloaded from this website.</p></article>
    </div>
    <div className="install-next"><h2>Keep your broadcast running.</h2><p>Update after your current stream ends. Keep the app open and your internet connected while broadcasting or waiting for a schedule.</p><a className="text-button" href="#/support">Need help? <ArrowRight size={15} /></a></div>
    <nav className="install-platforms" aria-label="Other platforms">{(Object.keys(INSTALL_INFO) as InstallPlatform[]).filter(p => p !== platform).map(p => <a className="button button-secondary" key={p} href={`#/download/${p}`}>Get it for {INSTALL_INFO[p].name} <ArrowRight size={15} /></a>)}</nav>
  </section>;
}
function Command({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  async function copy() { try { await navigator.clipboard.writeText(text); setCopied(true); setFailed(false); } catch { setFailed(true); } }
  useEffect(() => { setCopied(false); setFailed(false); }, [text]);
  return <div className="install-command"><pre><code>{text}</code></pre><button onClick={copy} aria-label="Copy command">{copied ? 'Copied' : failed ? 'Select and copy' : 'Copy'}</button><span className="sr-only" role="status">{copied ? 'Command copied to clipboard.' : failed ? 'Copy unavailable. Select the command and copy it manually.' : ''}</span></div>;
}

function ReleaseNotesPage() {
  const { release, state } = usePublicRelease();
  return <section className="section subpage"><div className="section-heading centered"><p className="eyebrow">LIVESTREAM STUDIO BY B2R</p><h1>What’s <span>new.</span></h1><p>{release ? release.tag_name : state === 'loading' ? 'Loading release notes…' : 'Release notes will appear when the next version is published.'}</p></div>{release && <article className="release-notes-body">{release.body}</article>}<div className="centered-action"><button className="button button-primary" onClick={() => go('download')}>Download the app <Download size={16} /></button></div></section>;
}
function LicensesPage() { return <section className="section subpage"><div className="section-heading centered"><p className="eyebrow">THIRD-PARTY SOFTWARE</p><h1>Licences &amp;<br /><span>acknowledgements.</span></h1><p>LiveStream Studio includes FFmpeg and FFprobe as separate programs. The bundled builds include GPL components such as libx264.</p></div><article className="release-notes-body"><h2>FFmpeg</h2><p>Licence texts, build provenance and source-availability information are included with each installer.</p><a className="text-button" href="/licenses/ffmpeg-license.txt" download>Download the FFmpeg notice <Download size={16} /></a><p>Visit the FFmpeg project for its documentation and source code.</p><a className="text-button" href="https://ffmpeg.org/" target="_blank" rel="noreferrer">FFmpeg project <ExternalLink size={14} /></a></article></section>; }
function SupportPage() { return <section className="section subpage support-page"><div className="section-heading centered"><p className="eyebrow">WE’RE HERE TO HELP</p><h1>A better broadcast.<br /><span>Built together.</span></h1><p>LiveStream Studio is a B2R product, made for creators.<br />Your feedback helps us make it better.</p></div><div className="support-grid"><article className="feature-card"><CircleHelp className="feature-icon" /><h2>Need a hand?</h2><p>Tell us your operating system, what you were trying to do and what happened. Remove stream keys before sharing logs or screenshots.</p><a className="button button-primary" href={`mailto:${SUPPORT}?subject=LiveStream%20Studio%20support`}>Email support@b2r.it.com <ArrowRight size={16} /></a></article><article className="feature-card"><Mail className="feature-icon" /><h2>Make it better.</h2><p>Found a bug or have an idea for your workflow? Email our team at support@b2r.it.com.</p><a className="button button-secondary" href={`mailto:${SUPPORT}?subject=LiveStream%20Studio%20feedback`}>Share feedback by email <ArrowRight size={16} /></a></article></div><div className="b2r-family"><p className="eyebrow">PART OF THE B2R FAMILY</p><h2>Useful tools.<br /><span>Thoughtfully made.</span></h2><p>Explore more tools for your creative work.</p><a className="text-button" href="https://b2r.it.com/" target="_blank" rel="noreferrer">Discover B2R <ArrowRight size={17} /></a></div></section>; }
function BrandPage() { return <section className="section subpage brand-page"><div className="section-heading centered"><p className="eyebrow">THE LIVESTREAM STUDIO IDENTITY</p><h1>A signal<br /><span>that keeps going.</span></h1><p>The play symbol meets a continuous loop.<br />The LiveStream Studio identity, by B2R.</p></div><div className="brand-kit"><article className="brand-asset"><div className="brand-artboard"><img src={`${BRAND}livestream-studio-logo.svg`} alt="LiveStream Studio by B2R wordmark" /></div><h2>The wordmark</h2><p>SVG + PNG · full colour · light backgrounds</p><a href={`${BRAND}livestream-studio-logo.svg`} download className="text-button">Download SVG <ArrowDown size={16} /></a><a href={`${BRAND}livestream-studio-logo.png`} download className="text-button brand-png-link">Download PNG <ArrowDown size={16} /></a></article><article className="brand-asset"><div className="brand-artboard dark-artboard"><img src={`${BRAND}livestream-studio-logo-inverse.svg`} alt="LiveStream Studio by B2R white wordmark" /></div><h2>On dark backgrounds</h2><p>Transparent SVG · full colour icon · white lettering</p><a href={`${BRAND}livestream-studio-logo-inverse.svg`} download className="text-button">Download inverse wordmark <ArrowDown size={16} /></a></article><article className="brand-asset"><div className="brand-artboard mark-artboard"><Mark /></div><h2>The studio mark</h2><p>Scalable SVG · blue to cyan · continuous play</p><a href={`${BRAND}livestream-studio-mark.svg`} download className="text-button">Download icon <ArrowDown size={16} /></a></article></div></section>; }
