# LiveStream Studio 1.0.5

October 29, 2026; Apple Silicon macOS.

## Different playlists on a small laptop

In Playlist Manager, select each original playlist and choose **Prepare 1080p copy**. Preparation runs one video at a time and creates a separate **1080p Ready** playlist. Original files remain unchanged; persistent copies occupy additional disk space in the application's local data directory. Preparation may take time, especially for 8K sources. Cancel removes the unfinished output.

Assign each Ready playlist to its own stream. Use **1920×1080, 30 FPS, 4500 Kbps** output. Compatible prepared playlists automatically use **Direct copy (no live encoding)**. A changed resolution, frame rate, bitrate, or incompatible clip falls back to encoding. Preview starts paused by default to avoid decoding another video unnecessarily.

This avoids three or four simultaneous live transcodes for different prerecorded playlists. It does not certify every 8 GB laptop: processor, network upload and other running applications still matter. Raw 8K sources should be prepared before going live on a small machine.

## Matching playlists

The desktop engine shares one producer when ordered source files and output settings match. Each destination has an independent sender and bounded queue. A slow destination cannot block the others. Stopping the original destination leaves the producer running for remaining destinations; stopping the last destination releases it.

Late joiners start at the producer's current playhead using a short recent buffer. Turn off **Share encoding for matching streams** in Settings when destinations should start independently from the beginning. Different playlists use separate producers; prepared playlists use direct copy instead.

## Verification

- **45 app tests and 24 native tests passed**; two opt-in external/high-resolution tests remained ignored by the standard suite.
- Four different test videos were prepared sequentially and streamed concurrently to local RTMP receivers. Each receiver captured 1080p/30 H.264 with AAC and at least 140 frames over approximately five seconds. The four sender processes used **95.6 MiB combined RSS** and **0.61% whole-machine CPU** on this M5 Pro. These figures exclude the app, OS and receivers, and are not measurements on the user's unspecified 8 GB laptop.
- Native preparation was cancelled successfully, then completed successfully on the supplied real 8K source. The Ready playlist streamed through direct copy: **6691 frames / 223.056 seconds**, approximately 30 FPS, 4.66 Mbps average total bitrate.
- Two native destinations shared the real 8K source at approximately 30 FPS. The second continued after stopping the first. A late join capture began with a video keyframe and contained 90 video packets in its first three seconds.
- A finite native shared playlist completed automatically: **240 frames / 8.034 seconds**, 1080p/30. Another direct-copy stream continued running. The UI reported zero errors/reconnections. Stop All left no FFmpeg or keep-awake children attached to the QA app.
- Production build, DMG integrity, mounted version 1.0.5 and deep/strict ad-hoc signature checks passed. YouTube ingestion was not rerun for this release; these tests used local RTMP receivers.

## Implementation

`src-tauri/src/shared_playout.rs` owns shared producers, independent fanout queues and lifecycle handling. `src-tauri/src/prepared_media.rs` owns preparation, caching, cancellation and resource limits. Playlist UI and `src/services/preparedMedia.ts` expose preparation. FFmpeg services/store select compatible direct-copy output; telemetry shows sharing and the actual output mode. Preview and Settings manage optional preview decoding.

## Installer

`src-tauri/target/release/bundle/dmg/LiveStream Studio_1.0.5_aarch64.dmg`

SHA-256: `904198e2e550b1fc1ba565e4fae8ce62a41304873456d39e309684d9ca8cd848`

Ad-hoc signed; not Developer ID notarized. The installed production app was not replaced during this QA run.
