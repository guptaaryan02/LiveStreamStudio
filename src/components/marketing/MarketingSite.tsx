import React, { useEffect, useRef, useState } from 'react';
import { Activity, Apple, ArrowDown, ArrowRight, CalendarClock, Check, ChevronDown, CircleHelp, Cpu, Download, ExternalLink, FolderOpen, Github, Layers, Menu, Moon, Play, Radio, Repeat2, ShieldCheck, SlidersHorizontal, Sun, Terminal, Wifi, X } from 'lucide-react';
import './marketing.css';

type Page = 'home' | 'download' | 'support' | 'brand';
const REPO = 'https://github.com/guptaaryan02/LiveStreamStudio';
const RELEASES = 'https://github.com/guptaaryan02/LiveStreamStudio-releases/releases';
const BRAND = '/brand/';
const getPage = (): Page => {
  const route = window.location.hash.replace('#/', '').split('?')[0];
  return route === 'download' || route === 'support' || route === 'brand' ? route : 'home';
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
  useEffect(() => { scrollArea.current?.scrollTo({ top: 0 }); setMenuOpen(false); }, [page]);
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
      {page === 'home' ? <HomePage onSection={section} /> : page === 'download' ? <DownloadPage /> : page === 'brand' ? <BrandPage /> : <SupportPage />}
    </main>
    <footer className="site-footer"><div className="footer-top"><div><button className="brand" aria-label="LiveStream Studio by B2R, home" onClick={() => go('home')}><Brand /></button><p>A little less setup.<br />A lot more time on air.</p></div>
      <div><h3>PRODUCT</h3><button onClick={() => section('features')}>Features</button><button onClick={() => go('download')}>Downloads</button><a href={RELEASES} target="_blank" rel="noreferrer">Release notes <ExternalLink size={11} /></a><a href={REPO} target="_blank" rel="noreferrer">Source on GitHub <ExternalLink size={11} /></a></div>
      <div><h3>HELP & RESOURCES</h3><button onClick={() => section('faq')}>Common questions</button><button onClick={() => go('support')}>Get support</button><button onClick={() => go('brand')}>Brand & logo</button><a href={`${REPO}/blob/main/src-tauri/resources/licenses/ffmpeg-license.txt`} target="_blank" rel="noreferrer">Third-party licences</a></div>
      <div><h3>MORE FROM B2R</h3><a href="https://b2r.it.com/" target="_blank" rel="noreferrer">Explore B2R <ArrowRight size={13} /></a><a href="https://pramvex.com/" target="_blank" rel="noreferrer">Pramvex <span>Private AI workspace</span></a><a href="https://caption-cut.com/" target="_blank" rel="noreferrer">Caption Cut <span>Offline subtitles</span></a></div></div>
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
    ['Is this a cloud service or a video editor?', 'It is a desktop app for broadcasting pre-recorded video playlists. Bring finished videos. It does not host your streams in the cloud, edit videos, capture your screen or switch live camera scenes.'],
    ['Who makes LiveStream Studio?', 'LiveStream Studio is a B2R product. We build practical tools for creators, including Pramvex for private AI work and Caption Cut for offline subtitles.'],
  ].map(([question, answer]) => <details key={question}><summary>{question}<ChevronDown size={17} /></summary><p>{answer}</p></details>)}</div></section>
  <section className="closing-section"><div className="closing-glow" /><Mark /><p className="eyebrow">MADE FOR YOUR NEXT BROADCAST</p><h2>Your content deserves<br /><span>more time on air.</span></h2><p>Give your videos an encore. Then another.</p><button className="button button-primary button-large" onClick={() => go('download')}>Get LiveStream Studio <ArrowRight size={18} /></button><span className="closing-signature">A B2R PRODUCT</span></section>
</>;

function StudioPreview() {
  return <div className="studio-showcase"><div className="showcase-caption"><span><span className="live-dot" /> MEET YOUR NEW BROADCAST DESK</span><span>PRODUCT PREVIEW · SAMPLE DATA</span></div>
    <div className="preview-window"><div className="preview-titlebar"><div className="traffic-lights"><i /><i /><i /></div><span>LiveStream Studio</span><span className="preview-local"><ShieldCheck size={11} /> On your computer</span></div>
      <div className="preview-body"><aside className="preview-sidebar"><div className="preview-brand"><Mark /><span>LiveStream<small>STUDIO BY B2R</small></span></div><div className="preview-sidebar-label">YOUR WORKSPACE</div><span className="active"><Radio /> Overview</span><span><Layers /> Multi-stream</span><span><Repeat2 /> Playlists</span><span><FolderOpen /> Video library</span><span><CalendarClock /> Scheduler</span><div className="sidebar-bottom"><i /> Ready when you are</div></aside>
      <div className="preview-content"><div className="preview-heading"><div><span>YOUR BROADCAST DESK</span><h3>Good content. On repeat.</h3></div><span className="preview-live-pill"><i />2 streams live</span></div>
        <div className="preview-columns"><div className="preview-video"><div className="landscape"><div className="landscape-sun" /><div className="landscape-mountain mountain-back" /><div className="landscape-mountain mountain-front" /><span className="landscape-title">THE SLOW<br />MOMENTS.<small>A film for the in-between.</small></span><span className="video-live"><i /> LIVE</span><span className="video-time">00:42:18</span></div><div className="preview-video-footer"><span><i /> Golden hour sessions <small>PLAYLIST · LOOP 3</small></span><span className="equaliser"><i /><i /><i /><i /><i /></span></div></div>
        <div className="preview-streams"><h4>ON AIR <span>2 destinations</span></h4><div><span className="stream-platform destination-youtube"><Play size={12} fill="currentColor" /></span><span>YouTube<small>Main channel</small></span><i /></div><div><span className="stream-platform destination-twitch">▣</span><span>Twitch<small>Community channel</small></span><i /></div><div className="stream-quality"><span>Output<small>1080p</small></span><span>Frame rate<small>30 fps</small></span></div><div className="signal-chart" aria-hidden="true">{[30,42,35,50,46,62,58,72,62,79,71,85,78,90,83,96,87,100,88,96,90,100].map((v,i)=><i key={i} style={{height:`${v}%`}} />)}</div><span className="sample-signal"><i />Sample output activity</span></div></div>
        <div className="preview-bottom"><div><CalendarClock size={16} /><span>UP NEXT<small>Morning sessions · Tomorrow, 05:00</small></span></div><span>Scheduled <Check size={12} /></span></div>
      </div></div>
    </div><div className="showcase-note"><span><Check size={13} /> Playlists, scheduling and multi-stream, together.</span><span>Designed to stay out of your way.</span></div>
  </div>;
}

function Feature({ icon, title, text, label, className = '', children }: { icon: React.ReactNode; title: string; text: string; label: string; className?: string; children?: React.ReactNode }) {
  return <article className={`feature-card ${className}`}><span className="feature-icon">{icon}</span><p className="feature-label">{label}</p><h3>{title}</h3><p>{text}</p>{children}</article>;
}

interface ReleaseAsset { name: string; browser_download_url: string; size: number }
interface Release { tag_name: string; assets: ReleaseAsset[] }
function DownloadPage() {
  const [release, setRelease] = useState<Release | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'unavailable' | 'error'>('loading');
  useEffect(() => {
    const controller = new AbortController();
    void fetch('https://api.github.com/repos/guptaaryan02/LiveStreamStudio-releases/releases/latest', { signal: controller.signal }).then(async r => {
      if (r.status === 404) { setState('unavailable'); return; }
      if (!r.ok) throw new Error('Release information unavailable');
      const data = await r.json();
      setRelease({ tag_name: data.tag_name, assets: (data.assets || []).filter((a: ReleaseAsset) => a.browser_download_url.startsWith('https://github.com/guptaaryan02/LiveStreamStudio-releases/releases/download/')) }); setState('ready');
    }).catch(e => { if (e.name !== 'AbortError') setState('error'); });
    return () => controller.abort();
  }, []);
  const platforms = [{ name: 'macOS', icon: <Apple />, note: 'Apple Silicon · M1 and later', match: /aarch64\.dmg$/i }, { name: 'Windows', icon: <span className="windows-icon">⊞</span>, note: '64-bit desktop installer', match: /x64.*(?:setup\.exe|\.msi)$/i }, { name: 'Linux', icon: <Terminal />, note: 'x86_64 · Portable AppImage', match: /amd64\.AppImage$/i }];
  return <section className="section subpage download-page"><div className="section-heading centered"><p className="eyebrow">YOUR NEXT BROADCAST STARTS HERE</p><h1>Make room<br />for <span>your studio.</span></h1><p>Local videos. Your channels. A desktop app by B2R.</p></div>
    <div className="release-notice" role="status"><Download size={19} /><div>{state === 'loading' ? 'Checking published installers…' : state === 'ready' ? `Latest published release: ${release?.tag_name}` : state === 'unavailable' ? 'Public installers are being prepared.' : 'Release information is temporarily unavailable.'}<p>{state === 'unavailable' ? 'The source is available now. Installer links will appear here when a release is published.' : 'Download files are served directly from our GitHub releases.'}</p></div></div>
    <div className="download-grid">{platforms.map(platform => { const asset = release?.assets.find(a => platform.match.test(a.name)); return <article className="download-card" key={platform.name}><span className="platform-icon">{platform.icon}</span><h2>{platform.name}</h2><p>{platform.note}</p>{asset ? <><span className="download-version">{release?.tag_name} · {(asset.size / 1048576).toFixed(0)} MB</span><a className="button button-primary" href={asset.browser_download_url}><Download size={16} />Download for {platform.name}</a></> : <><span className="download-version">{state === 'loading' ? 'Checking availability' : 'No published installer yet'}</span><a className="button button-secondary" href={RELEASES} target="_blank" rel="noreferrer">View releases <ArrowRight size={16} /></a></>}</article>; })}</div>
    <div className="download-guidance"><div><ShieldCheck /><h3>Install with confidence.</h3><p>Review release notes, system requirements and signing status before installing. For uninterrupted broadcasts, update after your current stream ends.</p></div><div><Github /><h3>Prefer to build it yourself?</h3><p>The source and setup instructions are public.</p><a href={REPO} target="_blank" rel="noreferrer">Open the repository <ArrowRight size={15} /></a></div></div>
  </section>;
}
function SupportPage() { return <section className="section subpage support-page"><div className="section-heading centered"><p className="eyebrow">WE’RE HERE TO HELP</p><h1>A better broadcast.<br /><span>Built together.</span></h1><p>LiveStream Studio is a B2R product, made for creators.<br />Your feedback helps us make it better.</p></div><div className="support-grid"><article className="feature-card"><CircleHelp className="feature-icon" /><h2>Need a hand?</h2><p>Tell us your operating system, what you were trying to do and what happened. Remove stream keys before sharing logs or screenshots.</p><a className="button button-primary" href={`${REPO}/issues`} target="_blank" rel="noreferrer">Get help on GitHub <ArrowRight size={16} /></a></article><article className="feature-card"><Github className="feature-icon" /><h2>Make it better.</h2><p>Found a bug or have an idea for your workflow? Start a conversation on the project’s issue tracker.</p><a className="button button-secondary" href={`${REPO}/issues/new`} target="_blank" rel="noreferrer">Share feedback <ArrowRight size={16} /></a></article></div><div className="b2r-family"><p className="eyebrow">PART OF THE B2R FAMILY</p><h2>Useful tools.<br /><span>Thoughtfully made.</span></h2><p>Explore more tools for your creative work.</p><a className="text-button" href="https://b2r.it.com/" target="_blank" rel="noreferrer">Discover B2R <ArrowRight size={17} /></a></div></section>; }
function BrandPage() { return <section className="section subpage brand-page"><div className="section-heading centered"><p className="eyebrow">THE LIVESTREAM STUDIO IDENTITY</p><h1>A signal<br /><span>that keeps going.</span></h1><p>The play symbol meets a continuous loop.<br />The LiveStream Studio identity, by B2R.</p></div><div className="brand-kit"><article className="brand-asset"><div className="brand-artboard"><img src={`${BRAND}livestream-studio-logo.svg`} alt="LiveStream Studio by B2R wordmark" /></div><h2>The wordmark</h2><p>SVG + PNG · full colour · light backgrounds</p><a href={`${BRAND}livestream-studio-logo.svg`} download className="text-button">Download SVG <ArrowDown size={16} /></a><a href={`${BRAND}livestream-studio-logo.png`} download className="text-button brand-png-link">Download PNG <ArrowDown size={16} /></a></article><article className="brand-asset"><div className="brand-artboard dark-artboard"><img src={`${BRAND}livestream-studio-logo-inverse.svg`} alt="LiveStream Studio by B2R white wordmark" /></div><h2>On dark backgrounds</h2><p>Transparent SVG · full colour icon · white lettering</p><a href={`${BRAND}livestream-studio-logo-inverse.svg`} download className="text-button">Download inverse wordmark <ArrowDown size={16} /></a></article><article className="brand-asset"><div className="brand-artboard mark-artboard"><Mark /></div><h2>The studio mark</h2><p>Scalable SVG · blue to cyan · continuous play</p><a href={`${BRAND}livestream-studio-mark.svg`} download className="text-button">Download icon <ArrowDown size={16} /></a></article></div></section>; }
