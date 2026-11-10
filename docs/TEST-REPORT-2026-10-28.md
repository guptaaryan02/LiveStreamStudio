# LiveStream Studio — macOS verification, 28 October 2026

## Result

Apple Silicon (arm64) DMG built successfully. Core media and workflow checks pass. This is a tested development installer, not a claim that every advertised feature is production-ready.

Installer: `src-tauri/target/release/bundle/dmg/LiveStream Studio_1.0.0_aarch64.dmg`

SHA-256: `106c0b1b416e084d0f640541461d55db7661a764e3d70f5f694d13907da8226f`

## Verification performed

- `npm test`: **29 passed**, including a real approximately four-second broadcast to a local RTMP receiver. Two generated video clips repeat twice; the received file contains at least 115 decoded video frames and AAC audio. This exercises the actual generated Fast Mode command, bundled FFmpeg, concat playlists, repeat count, and RTMP transport.
- `cargo test --manifest-path src-tauri/Cargo.toml`: **9 passed**. Covers bounded-buffer concurrency, shutdown, FFmpeg progress parsing, local TCP reachability, bundled executables, native macOS credential backend selection, and real mixed-format media normalization.
- Mixed-format integration test generates 320x240/30fps/44.1kHz and 640x360/24fps/48kHz clips, runs the native normalizer arguments, sends their combined output through one FLV sender, and verifies decoded frames plus H.264/AAC output at 320x240 and 44.1kHz stereo.
- Production TypeScript/Vite build and Tauri release DMG build pass. Vite reports non-fatal mixed static/dynamic import warnings.
- Opened desktop dashboard, multistream, playlists, library, scheduler, profiles, logs, analytics, and settings. This verifies view rendering, not every action inside every view.
- Mounted the final DMG read-only; its checksum verification succeeds. Launched its packaged application and confirmed Settings reports FFmpeg 8.1 from the bundled engine.
- Both packaged FFmpeg and ffprobe run from the mounted DMG. FFmpeg links to macOS system libraries/frameworks rather than a Homebrew installation.
- `git diff --check` passes.

The workflow suite covers playlist operations and active selection, library blob rejection, compatibility selection, finite/infinite repeat arguments, asset paths, stream-key redaction, launch validation, stream deletion/stop, profile bitrate/fps, schedule IDs, daily schedule deduplication, scheduled auto-stop, early failure/recovery guards, log limits, and settings updates.

## Fixes included

- Enabled native macOS Keychain/Windows credential backends; the previous keyring dependency fell back to an in-memory credential backend.
- Fixed upload-buffer deadlock for chunks larger than its capacity, closed-buffer writes, and close/wait wake-up synchronization.
- Read FFmpeg carriage-return progress updates in real time and use the latest reported timestamp.
- Observe the actual sender process exit after output drains; successful completion returns the native UI to idle instead of recovering/restarting a finite playlist. Reap explicitly stopped child processes.
- Mark streams idle before stop IPC, preventing their exit events from scheduling recovery.
- Stop the backend when deleting an instance.
- Implement scheduled auto-stop, daily recurrence, and detection of connecting/reconnecting scheduled instances.
- Preserve saved profile fps/bitrate at launch.
- Generate unique playlist/schedule IDs and select a surviving playlist after deletion.
- Added repeatable Node and Rust regression/integration tests.

## Features still incomplete or unverified

| Feature | Finding |
| --- | --- |
| YouTube end-to-end broadcast | Not passed. Updated-key RTMP sender tests completed cleanly (20 seconds/600 frames and 60 seconds/1800 frames), but the matching owner Studio page still showed No data with Go live disabled. RTMPS failed with TLS I/O error. See latest follow-up below. |
| Analytics | Daily bars, weekly increase, and some initial KPI values are demo constants. Do not treat these as verified historical measurements. |
| Theme toggle | Saves a preference and changes its icon; page styles remain dark. |
| Desktop notifications | Preference exists; no delivery implementation was found. |
| “Check for Updates” | Rechecks the local FFmpeg version; it does not check a release server or download updates. |
| Profile resolution/repeat overrides | Launch now preserves fps/bitrate, but resolution remains based on engine settings and repeat behavior on the selected playlist. |
| Pause/resume helpers | Change store status only; they are not backend process pause/resume implementations. |
| Retry interval setting | Recovery currently uses fixed backoff intervals rather than this configured interval. |
| Long-running recovery / parallel destinations | Guard behavior is tested; actual prolonged network outages and multiple simultaneous external platform sessions were not exercised. |
| Keychain persistence | Native backend selection is tested; no real user credential was created, retrieved, or deleted during testing. |
| File dialogs / drag-drop / exports / playback controls | Views inspected; full interactive coverage is incomplete. |
| Other encoders / machines | Software encoding tested on Apple Silicon. VideoToolbox/NVENC/QuickSync, Intel Macs, Windows, and other platforms require separate tests. |
| Distribution signing | No valid Apple signing identity is available. The application has an ad-hoc linker signature, no Developer ID signature or notarization. It is not a notarized public release. |

## Re-run

```sh
npm test
cargo test --manifest-path src-tauri/Cargo.toml
npm run tauri:build -- --bundles dmg
```

Tests require the bundled FFmpeg binaries. The RTMP test opens only a loopback listener and uses generated test patterns/audio; it does not contact a public streaming service.

## Supplied-key follow-up

The user supplied a test YouTube key and stated the stream was unlisted. A generated 20-second 720p30 H.264/AAC test clip was imported successfully through the packaged application's native file dialog into a separate QA playlist. This also verified media probing and thumbnail creation.

A UI bug prevented new infinite playlists from switching back to finite playback. Fixed the loop toggle to expose finite repeat controls again. The installer was rebuilt after this fix.

The attempted start was rejected by automatic approval review before a feed could be confirmed: the matching YouTube broadcast's unlisted visibility could not be verified, and the app was still configured for infinite playback at that point. No successful YouTube ingestion or broadcast is claimed. The visible YouTube channel remains on its streaming activation screen; access to the matching broadcast settings is required. The stream key is omitted from this report and project files.

Final finite-toggle rebuild: production build passes and mounted DMG checksum passes. A subsequent native UI action could not be completed because the computer-use service reported no available window; the finite-toggle fix was source-reviewed, but its interactive recheck is incomplete.

## Updated-key and broadcast-link verification

User provided an updated key and the Studio link for video `k9mhlNvbkXA`. No key value was saved in project files.

- The in-app browser was signed into unrelated channels and could not open the owner control room. The viewer page independently confirmed `test 1` on B2R Bhakti is **Unlisted**.
- The owner's existing Microsoft Edge window was already on the matching Studio page. It independently confirmed Unlisted, selected key name `test oct 28 (RTMP, Variable)`, and auto-start/auto-stop disabled.
- Used the app's bundled FFmpeg directly because desktop control could not reliably address the duplicate installed/mounted studio instances. These are engine/transport tests, not full desktop-button tests.
- RTMPS to YouTube on port 443 stalled at four frames/0.16 seconds and failed after about 30 seconds with TLS I/O error -9806 and FFmpeg exit 251.
- Default RTMP endpoint: generated 720p30 H.264/AAC test clip transmitted for 20 seconds, 600 frames, approximately 2167.5 kbit/s; FFmpeg exit **0**.
- Bounded follow-up at the default endpoint transmitted 60 seconds, 1800 frames, approximately 2160.8 kbit/s and 30fps; FFmpeg exit **0**, then stopped automatically.
- Despite successful sender completion, the matching Studio control room showed **No data**, its Go live button remained disabled, and the viewer page remained waiting. Therefore no successful published live broadcast is claimed. Selected-key equality could not be checked through the available clipboard bridge (it returned empty); this is not evidence that the keys differ.
- No stream key was reset, no auto-start/stop setting was changed, and no Go live/End stream action was taken. All test sender processes completed.

Remaining diagnostic: verify that the supplied updated key is exactly the one selected for this Studio broadcast. Sender-side success alone does not establish that YouTube associated the media with the intended event.

## Version 1.0.1 update

See `RELEASE-1.0.1.md` for the current installer, checksum, stable-bitrate corrections, multi-stream checks, and latest verification limits. The original 1.0.0 notes above are historical.

## Latest verification — October 29

Version 1.0.2 supersedes the earlier installer. See RELEASE-1.0.2.md and BUTTON-QA-2026-10-29.md for the current results, checksum and remaining failures.
