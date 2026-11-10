# LiveStream Studio 1.0.3

Built October 29, 2026 for Apple Silicon macOS. Resolves the three incomplete features identified in the 1.0.2 audit.

## Changes

- **Theme:** Dark, Light and Follow system appearance settings. Theme colors apply to panels, fields, text, borders, gradients and scrollbars; preview overlays retain their dark contrast. The selected preference persists across reloads, and system appearance listens for OS changes.
- **Desktop notifications:** Official Tauri notification plugin, permission-aware enable/disable controls and a Test notification button. Alerts follow live output, reconnect, error and confirmed-stop transitions. Native delivery errors are surfaced by the test control. Background events do not request permission or include stream keys/URLs. New installations default to notifications off.
- **Analytics:** Removes seeded/demo data. Records observed nonzero output duration, time-weighted bitrate, availability, successful recoveries, live sessions and full clips encoded. Daily charts use local dates and sum concurrent destination-hours. Recorded statistics survive app restarts. Fresh output is required; stale samples and long suspension gaps do not count as successful output. These are local encoder statistics, not YouTube viewer statistics.

## Verification

- Production TypeScript/Vite and native release builds pass.
- **42 app tests + 14 native tests passed**; the external YouTube smoke test remains opt-in and was not rerun for these UI/statistics changes.
- Light and dark themes inspected visually; Light preference retained after reload.
- Native notification permission reported granted; Test notification returned success. Enable/disable controls changed correctly. Actual banner display can be silenced by macOS Focus/Notification Center settings.
- Actual native local RTMP stream populated recorded statistics. After stopping and restarting the QA app, it retained approximately **0.005 output hours, 4.82 Mbps average output, one live session and three encoded clips**.
- Automated cases cover demo-data migration, simultaneous streams, weighted bitrate, stalled output, midnight day splitting, suspension gaps, duplicate progress events, recovery counting and notification lifecycle deduplication.

## Installer

`src-tauri/target/release/bundle/dmg/LiveStream Studio_1.0.3_aarch64.dmg`

SHA-256: `ce36e496e1265cc6b406b993a21c8485a739fca725447df3a1780616ed2ce522`

Disk-image integrity verified. Mounted app reports 1.0.3 and passes deep/strict signature verification. Ad-hoc signed, not Developer ID notarized.

The 1.0.2 audit remains a historical record. Other unrelated coverage gaps listed there, including second YouTube publication verification and some export/picker interactions, were not reclassified as passing by this release.
