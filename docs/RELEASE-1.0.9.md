# LiveStream Studio 1.0.9 — reconnect recovery and retained failure evidence

November 5, 2026. Apple Silicon macOS.

## Incident findings

The running installed app was version 1.0.8. The user clarified that the two affected streams stopped around **02:00**, after their **01:30** schedules, rather than at 07:00. Both instances were in Error; no FFmpeg processes remained. Automatic recovery was enabled with a 3-second base interval and five maximum retries.

Power records show a wake at **01:28** and no subsequent system sleep during the 01:00–03:00 failure window. No matching FFmpeg crash/memory-pressure evidence was found in the available diagnostic records. This does not establish a network or YouTube server cause.

The exported 1.0.8 log contained exactly 500 INFO records from the later Radha stream, 09:50:50–09:55:02 UTC (10:50:50–10:55:02 local). The initial failure messages had been displaced by frame progress. Therefore the original disconnect trigger **cannot be confirmed retrospectively**.

One separate configuration issue was visible: “Om Krishnaya Vasudevaya” has a one-loop scheduled limit and a roughly 51m58s video; it is expected to stop after that complete pass. The other failed job has a 108-loop limit. The later Radha job had a 30-loop limit and a successful final sender summary; its normal completion is separate from the two Error instances.

## Verified recovery defect and fix

The early-failure guard treated any sender exiting within five seconds of its latest launch as an invalid initial connection, even when it was reconnecting a previously working stream. A temporary outage could therefore end recovery after a quick connection refusal instead of using the remaining configured attempts.

The guard now retains first-connection protection for streams that have never delivered output, while previously connected streams use the remaining retry budget and exponential delay. The configured maximum is still respected; this release does not enable unlimited retries or guarantee recovery after a broadcast has been ended remotely.

Successful finite playback records its completed loop limit. An unexpected clean exit during an infinite stream instead enters recovery. Error cards retain the failure/stop reason. Manual stops and timed stops are labelled separately.

## Failure evidence

- Keep a bounded, redacted diagnostic history separately from the 500-line live-progress buffer. Up to 200 failure/warning records and 200 other lifecycle records survive app restarts. Routine frame progress cannot displace failures.
- Export combines retained diagnostics and live logs without duplicate entries. Clearing the live buffer preserves retained diagnostics.
- Store complete ISO timestamps and display local date/time; older HH:mm:ss entries are identified as legacy UTC.
- Classify connection refusals/resets, broken pipes, timeouts, queue failures and unsuccessful sender exits as errors even without the literal word “error”.
- Record native sender exit code and terminating signal. Known in-memory keys and RTMP URL secrets are redacted before retention.

## Verification

- **66 app tests passed**, including fast failed reconnects after a working stream, configured retry limits, sibling isolation, finite/infinite exit handling, error retention through 2200 progress lines, redaction and restore/export merging.
- **27 native tests passed; two opt-in tests ignored.**
- Native isolated two-destination test: both sent generated 1080p/30 H.264/AAC using a shared producer. Receiver A was interrupted at 20:16:07; the app recorded quick connection refusals on subsequent attempts, retained retry 2/3/4 and sender exit code 195, then recovered after the local receiver returned. Receiver B stayed live throughout. Both returned to Live with zero current errors/reconnections.

| Local capture | Video packets | Largest video DTS gap | Backward video timestamps |
|---|---:|---:|---:|
| A before interruption | 747 | 34 ms | 0 |
| A after recovery | 1083 | 34 ms | 0 |
| B uninterrupted | 4324 | 34 ms | 0 |

The native log also contained MPEG-TS boundary/audio timestamp warnings; the table verifies video continuity, not an audio-quality or YouTube ingestion certification. This was a short local reconnect test, not a 20-minute WAN soak or reproduction of the original server-side disconnect.

After stopping both local streams, restarting the QA app preserved the connection-refused/retry history. Receivers and the idle QA app were stopped afterward. Production broadcasts were never restarted and the installed app was not replaced.

Production build, DMG integrity, mounted version 1.0.9 and deep/strict ad-hoc signature checks passed.

## Installer

`src-tauri/target/release/bundle/dmg/LiveStream Studio_1.0.9_aarch64.dmg`

SHA-256: `f5123382705ef9e917cf241bc26300c6eeaaf0da5f2c32e9e00c912039c0f450`

Ad-hoc signed; not Developer ID notarized. Install this version before restarting the affected streams. Session stream keys must be explicitly loaded again after restarting Studio.
