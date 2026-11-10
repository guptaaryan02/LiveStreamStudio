# LiveStream Studio

A Tauri desktop app for playing local video playlists as live RTMP broadcasts to YouTube, Facebook, Twitch and custom destinations. Current source version: **1.0.10**.

## Features

- Video library and ordered or repeating playlists.
- Multiple simultaneous destinations, with shared encoding for matching native playlists and output settings.
- Prepared H.264/AAC media for streaming without repeated live encoding.
- Editable one-time and recurring schedules, with time limits or complete-playlist loop limits.
- macOS idle-sleep protection and optional system wake alarms for the next scheduled run.
- Stream profiles, masked key entry and explicit, optional Keychain storage on macOS.
- Stream analytics, desktop notifications, theme selection and retained, redacted failure diagnostics.

Keep the desktop app running for scheduled streams. Locking the screen is supported. Actual sleep requires a configured wake alarm; shutdown and logout are not supported. YouTube broadcasts need Auto-start enabled to publish automatically when the encoder connects.

## Public website

The landing page is hosted at [stream.b2r.it.com](http://stream.b2r.it.com/). Pushes to `main` build the Vite site and deploy `dist/` through the GitHub Pages workflow. The browser opens the landing page by default; the desktop app opens the studio.

## Development

Install Node.js 20 or newer, Rust stable, and the platform prerequisites for Tauri 2. Then run:

```sh
npm ci
bash scripts/fetch-ffmpeg.sh
npm run tauri:dev
```

FFmpeg and FFprobe are downloaded separately and excluded from Git. The fetch script installs platform binaries and licence notices into the app resources.

For the browser UI and development streaming backend:

```sh
npm run dev
```

Open the local address printed by Vite. The landing page is shown by default; `#/studio` opens the studio UI. Native-only features such as macOS wake alarms and Keychain require the desktop app.

## Checks

```sh
npm run build
npm test
cargo test --manifest-path src-tauri/Cargo.toml
```

Streaming tests use temporary media and local RTMP listeners. Two native hardware/resource-intensive tests are opt-in and ignored by default.

## Build installers

On macOS:

```sh
npm run package:mac
```

The DMG is written to `src-tauri/target/release/bundle/dmg/`. This local package is ad-hoc signed; it is not Developer ID notarized.

On other supported desktop platforms, fetch the matching FFmpeg binaries first, then run `npm run tauri:build`. The release workflow builds Windows and Linux installers when a version tag is pushed. It publishes draft assets to the separate [downloads repository](https://github.com/guptaaryan02/LiveStreamStudio-releases); publishing source commits alone does not create a new downloadable release.

See [the 1.0.10 release notes](docs/RELEASE-1.0.10.md) for the latest fixes and verification, and [Azure deployment instructions](docs/DEPLOY-AZURE.md) for the landing page.

## Credentials and third-party components

Do not commit stream keys, local environment files, personal video files or diagnostic exports. Session keys must be prepared again after restarting the app. Keychain access is requested explicitly by the user.

FFmpeg builds include GPL components such as libx264. See [the bundled component notices](src-tauri/resources/licenses/ffmpeg-license.txt) and [FFmpeg resource instructions](src-tauri/resources/ffmpeg/README.md).
