# LiveStream Studio 1.0.7 — stop after complete playlist loops

November 3, 2026. Apple Silicon macOS.

## Usage

In Scheduler → New Scheduled Timer, enable **Automatically stop stream** and choose **Complete playlist loops** under **Stop after**. Enter a whole-number count (1–10000), or use the 1, 3 or 10 loop presets. One loop means playing every video in the playlist once. Three loops means three total passes, including the first pass. Streaming ends naturally after the last video's final pass.

The existing **Time limit (minutes)** option remains available. Time and loop limits are alternative stop rules: loop mode does not attach a minute deadline that could cut the final video short. Turning automatic stopping off preserves the playlist's own repeat behavior. Older saved schedules continue using their existing time limit.

## Implementation

Schedule stop mode/count are persisted. The scheduler puts the selected loop limit on the new stream instance. `playlistForInstance` applies a finite repeat override to a copy of the saved playlist, used consistently by native/web playout, direct-copy FFmpeg arguments and the command shown in Logs. Neither the saved playlist nor another running stream is changed.

Loop-limited native runs use their own producer so they begin at the start and receive every complete pass, rather than joining the current position of an existing shared producer. The engine's finite repetition/EOF behavior ends the stream; UI timers are not used to estimate completion. Invalid saved loop counts are rejected before a stream is created.

Scheduler cards show the selected stop rule; Multi-Stream shows the complete-loop limit and the preview shows its loop target. The creation modal scrolls on shorter windows.

## Verification

- **56 app tests passed.** Local RTMP receivers verified natural completion of two-clip playlists after 2 and 3 encoded loops, and exactly 600 video frames after 10 direct-copy loops. Encoded output allows small CFR padding for AAC container boundaries; complete source video frames are retained.
- Scheduler tests exercised 1, 3 and 10 loop overrides of an infinite playlist, finite playout configuration, no time deadline in loop mode, unchanged shared source playlists, invalid-count rejection and existing timed auto-stop behavior.
- Isolated native UI: selected complete-loop mode, used the 10-loop preset, saved a schedule, verified its card, restarted the app and verified the saved loop count. Removed the QA schedule afterward; no production broadcast or system wake alarm was created for this test.
- Production frontend/native build, DMG integrity, mounted version 1.0.7 and deep/strict ad-hoc signature checks passed. No native engine code changed for this feature; it uses the finite playout behavior tested in prior releases.

## Installer

`src-tauri/target/release/bundle/dmg/LiveStream Studio_1.0.7_aarch64.dmg`

SHA-256: `944dcdf7a5dbc3fb1cec4b5985e471d906f65d9cd4225337ca5486d615aad1e6`

Ad-hoc signed; not Developer ID notarized. The installed production app was not replaced.
