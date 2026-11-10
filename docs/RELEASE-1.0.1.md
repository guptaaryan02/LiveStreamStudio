# LiveStream Studio 1.0.1 — stable bitrate and multiple destinations

Built and checked on Apple Silicon, 28 October 2026.

## Installer

`src-tauri/target/release/bundle/dmg/LiveStream Studio_1.0.1_aarch64.dmg`

SHA-256: `83cfd8e42ff6c3764b0cc9612a871bc7af175291ed8128cfbf505897f8ec8235`

The DMG checksum passes. Its mounted application reports version 1.0.1, includes FFmpeg/ffprobe, and contains an Applications shortcut. There is no Developer ID signature or notarization available on this machine.

## Bitrate corrections

- Constant-bitrate encoding is now the default, including playlists with matching codecs. Previously Fast Mode silently copied the input bitrate, ignoring the selected output rate.
- Fast source passthrough is now an explicit Engine Settings option, with an explanation that the target bitrate is ignored in that mode.
- Auto uses software x264 HRD CBR. An actual VideoToolbox test with a 4500 Kbps target and its constant-bit-rate option produced approximately 269 Kbps including TS overhead on a static picture. Explicit GPU choices remain available but may undershoot on static scenes.
- Clip durations now advance the timeline using exact encoded frame counts. A fixed initial timestamp margin accommodates AAC priming without shifting only the first clip. Twelve repeated clips have continuous video decode timestamps.
- B-frame reordering is disabled for clip-boundary alignment. Video/audio start timestamps reset per clip. Clips without audio receive stereo AAC silence, maintaining the same stream layout.
- Native bitrate and fps metrics use changes over wall-clock intervals rather than cumulative FFmpeg averages; a stalled sender reports zero current output.
- Native stream status stays connecting until output frames and bytes are observed. This is encoder activity, not proof that the platform has published the broadcast.
- Network writes have a 15-second timeout. Failed clip encoders stop their destination so its recovery logic can act rather than silently continuing through bad data.

## Multiple streams

- Independent destination processes, bitrate/fps inputs, individual controls, and Start All / Stop All.
- Starting the same active URL/key twice is blocked to avoid two senders competing for one broadcast.
- Deleting a stream stops its backend first. Stop during startup cannot restore the instance to live. Failed stop leaves the instance visible for retry.
- Duplicate native process registration is rejected, and monitor cleanup checks/removes a sender atomically.
- Startup cleanup no longer kills streams owned by another running copy of the app; it only reaps actual orphans.
- Each destination adds upload and encoding work. Different external broadcasts need separate stream keys. Global output-profile settings still apply to output resolution and can override requested fps.

## Verification

- **35 Node workflow/integration tests passed.** Includes actual CBR RTMP transmission, independent destination configuration/start/stop, duplicate-key rejection, startup cancellation and stop failures.
- **14 Rust tests passed**, with the external-network test ignored by default. Includes per-second static-scene bitrate measurements, twelve exact clip transitions, silent-media audio insertion, per-destination rate counters, and two actual simultaneous local RTMP receivers. Stopping the first sender did not stop the second; the second received all 120 video frames.
- The explicitly authorized **external CBR smoke test also passed on the sender side**: 60 seconds, 1800 frames, 30fps, approximately 4804 Kbps total output for a 4500 Kbps video target plus AAC/container overhead, FFmpeg exit 0. It uses the same native normalizer and sender argument builders. All test senders stopped.
- Production TypeScript/Vite and native release builds pass. Vite's existing static/dynamic import warnings remain non-fatal.
- `git diff --check` passes.
- YouTube's matching viewer and owner Studio pages were verified Unlisted earlier. **YouTube preview reception/published viewer playback after the corrected feed remains unverified.** Native desktop control switched to another active Edge tab or timed out when targeting Studio, including after the user indicated it was open. Do not equate the successful sender test with a fully verified live broadcast. No Go live/End stream action was taken.
- Prior RTMPS test failed with a TLS I/O error. The successful external tests used the default RTMP endpoint. RTMPS is not claimed fixed by this release.
- Other historical gaps (demo analytics, theme/notification behavior, other platforms/encoders, sustained multi-hour outages) are recorded in `TEST-REPORT-2026-10-28.md` and are not represented as fixed here.

## Re-run and packaging

```sh
npm test
cargo test --manifest-path src-tauri/Cargo.toml
npm run package:mac
```

`package:mac` builds the app, creates a standard compressed drag-to-Applications image, and verifies it. It avoids Finder/AppleScript layout automation, which failed during this session.

The YouTube test is opt-in (`youtube_cbr_smoke`, ignored by default), requires explicit authorization and a key supplied in process memory via `STUDIO_RTMP_TEST_KEY`, and must never run automatically in CI. No keys are saved in this repository or report.

Reference: [YouTube encoder guidance](https://support.google.com/youtube/answer/2853702) specifies CBR and a recommended two-second keyframe interval. Encoder behavior above was measured using the bundled binaries on this Mac.
