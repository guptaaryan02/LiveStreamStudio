# LiveStream Studio 1.0.10

November 6, 2026. Apple Silicon macOS.

## Kanak Dhara sync investigation

The installed app was 1.0.8, actively broadcasting Kanakdhara. Read-only UI inspection showed an AAC transport timestamp discontinuity of -41.836930 seconds after repeated loops. The original app PID 6768 and long-lived relay/sender PIDs 51612/51613 were left running; no broadcast was stopped, restarted, or edited.

The source MP4 has video duration 682.131771 seconds and audio duration 682.110396 seconds. Packet timestamps do not jump backwards. Near 671.7 seconds, video colour metadata switches from bt709 to smpte170m. A separate offline decode reproduced filter graph reinitialization followed by backwards video timestamps: the per-filter `setpts=PTS-STARTPTS` reset the video clock at this change. With constant-frame-rate encoding, the tail is dropped while audio continues. The roughly 10.46-second loss per loop agrees with the growing transport warning.

Both software and accelerated normalizers now preserve the common input timeline using `-copyts -start_at_zero`, without independently resetting timestamps inside video/audio filters. The browser development backend uses the same correction. Stream-ready preparation uses the corrected filters, a new cache version, and an explicit duration bound for padded audio after filter changes.

A complete isolated encode of the actual source at 320x180/30 (one decoder/encoder thread) produced 20,464 video packets and 29,379 audio packets. No backwards timestamps occurred. Last video DTS was 682.200000 seconds and last audio DTS 682.232611 seconds, a 32.6 ms difference. This validates the encoder timeline; the current YouTube broadcast was not restarted to deploy or certify the new output. A short native regression repeats a two-colour-metadata clip three times, checks clock continuity and A/V agreement, and verifies prepared-media duration alignment.

## Editing and scheduling

- Existing schedules open in an Edit form with their profile, start time, weekdays and time/loop stop rules. Saving keeps the same schedule ID. Changed recurrence resets the run token and creation cutoff; cosmetic or stop-rule edits preserve deduplication. A completed one-time job can be given a new future start and enabled again.
- Weekly/daily time is a normal editable HH:mm text field with validation and an Every day shortcut. Legacy AM/PM schedules are converted when opened. Enable schedule is explicit.
- Editing removes an existing wake alarm before saving the replacement and can request a new alarm for the next enabled run. macOS administrator approval is still required for alarm changes. No real wake alarms were created or modified during this QA.
- Saving schedule changes does not modify an already running instance or its current stop limit.
- Multi-Stream instances can be edited while Idle or Error, retaining their IDs. Active-state edits are blocked in both UI and store so they cannot interrupt a broadcast.

## Hidden stream keys

Dashboard, Multi-Stream, profile creation and session-key entry share a masked key input with direct paste handling, input events, an eye toggle and a Paste key button. The button reads clipboard text only after the user clicks it; the key stays hidden. No key is logged, automatically saved, or fetched from Keychain by this action.

## Verification

- Application tests: 69 passed, including completed one-time rearming, recurrence edits, active-instance edit rejection and preserving a running stream's stop limit.
- Native tests: 28 passed, 2 opt-in tests ignored.
- Production TypeScript/Vite build: passed.
- Separate native app `com.livestreamstudio.featureqa` with isolated storage: hidden keyboard paste and native Paste key button succeeded using fake credentials; daily time changed from 06:00 to 05:15, saved and reopened; stop rule edited to 10 loops; existing idle destination name and local RTMP address edited without creating a second instance. QA app was quit afterward. Installed/live app remained open.
- Latest small addition (Enable schedule checkbox and completed one-time rearming) is covered by application checks; it was added after that isolated UI session.

## Installer

DMG: `src-tauri/target/release/bundle/dmg/LiveStream Studio_1.0.10_aarch64.dmg`

SHA-256: `db6bdcf3277e87d2bd498cea23ab980445af7820ddadf6bbc7cba5d01845221d`

DMG checksum, read-only mounted version/identifier, Applications symlink, and deep/strict ad-hoc signature verification passed. Verification mount was detached. Not Developer ID notarized.

After packaging, the original app PID 6768 and relay/sender PIDs 51612/51613 were still alive, with the same parent relationship and over 58 minutes of continuous transport uptime. The new app was not installed or launched over the production app.

Install only after the current broadcast is finished; the running old app cannot receive native encoder fixes without a restart. Session keys must be prepared again after restarting Studio.
