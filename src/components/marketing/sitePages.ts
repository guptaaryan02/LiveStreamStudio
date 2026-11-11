export const SITE_ORIGIN = 'https://stream.b2r.it.com';
export const SITE_PAGES = {
  'free-live-streaming-software': { path: '/free-live-streaming-software/', title: 'Free Live Streaming Software for Video Playlists | B2R', description: 'Free desktop livestreaming software for pre-recorded video playlists. Loop, schedule and broadcast from macOS, Windows or Linux. No app subscription.' },
  'youtube-live-streaming': { path: '/youtube-live-streaming/', title: 'Free YouTube Live Streaming Software for Playlists | B2R', description: 'Stream pre-recorded video playlists to YouTube Live. Set up stream keys, Auto-start and scheduled broadcasts with free LiveStream Studio desktop software.' },
  multistream: { path: '/multistream/', title: 'Free Multistream Software for Multiple Videos & Channels | B2R', description: 'Broadcast different video playlists or the same program to multiple livestream destinations. Desktop multistream software for YouTube and custom RTMP outputs.' },
  home: { path: '/', title: 'LiveStream Studio by B2R — Pre-recorded Video Livestreaming', description: 'Broadcast pre-recorded video playlists to YouTube, Twitch, Facebook or custom RTMP. Schedule broadcasts, loop videos and run multiple streams from your desktop.' },
  download: { path: '/download/', title: 'Download LiveStream Studio for Mac, Windows & Linux | B2R', description: 'Download LiveStream Studio for Apple Silicon macOS, Windows x64 and Linux x86_64. Direct installers, installation guides and SHA-256 checksums.' },
  'download/mac': { path: '/download/mac/', title: 'Download LiveStream Studio for macOS | B2R', description: 'Get LiveStream Studio for Apple Silicon Macs. Download the DMG, follow first-launch instructions and verify your installer checksum.' },
  'download/windows': { path: '/download/windows/', title: 'Download LiveStream Studio for Windows | B2R', description: 'Download the Windows x64 EXE or MSI installer. Follow installation and SmartScreen guidance and check the published SHA-256.' },
  'download/linux': { path: '/download/linux/', title: 'Download LiveStream Studio for Linux | B2R', description: 'Download LiveStream Studio for Linux x86_64 as AppImage, DEB or RPM. Installation commands, system requirements and checksums included.' },
  support: { path: '/support/', title: 'LiveStream Studio Support — Contact B2R', description: 'Get help with LiveStream Studio broadcasts, playlists and schedules. Contact the B2R support team at support@b2r.it.com.' },
  brand: { path: '/brand/', title: 'LiveStream Studio Logo & Brand Assets | B2R', description: 'Download official LiveStream Studio by B2R logos and icons in SVG and PNG formats.' },
  'release-notes': { path: '/release-notes/', title: 'LiveStream Studio Release Notes | B2R', description: 'Read the latest LiveStream Studio desktop release notes, platform availability and installation information.' },
  licenses: { path: '/licenses/', title: 'LiveStream Studio Third-party Licences | B2R', description: 'Review FFmpeg and FFprobe licence acknowledgements, bundled software notices and source availability for LiveStream Studio.' },
} as const;
export type Page = keyof typeof SITE_PAGES;
export const pageUrl = (page: Page) => SITE_PAGES[page].path;
