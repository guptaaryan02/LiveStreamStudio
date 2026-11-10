# LiveStream Studio 1.0.4 — high-resolution input starvation

October 29, 2026; Apple Silicon macOS.

## Observed cause

The live YouTube control room reported Poor health and insufficient video. Both native senders were producing approximately 11.9 FPS despite a 30 FPS target. Their source was 7680×4320 AV1 at approximately 62.6 Mbps. Two independent software decoders/converters each used over 800% of one CPU core, together occupying most of the Mac's 18 logical cores. FFmpeg input lag increased from approximately 69 to 123 seconds.

The old UI showed only sender CPU and the global encoder preference. The actual processes used libx264 through Auto, despite the header showing VideoToolbox. These displays hid the expensive decode/scale stage and misidentified the active output encoder.

## Fix

- On macOS, probe high-resolution sources for VideoToolbox hardware decoding and GPU downscaling. Cache that decision during playout, preserve aspect ratio with even dimensions, download only stream-sized frames, then pad/normalize and retain software HRD CBR output.
- Preserve the software path if the hardware/filter probe fails. Older hardware and unsupported formats may still require a stream-sized source.
- Limit software output encoder threads to four per destination to avoid excessive thread competition.
- Aggregate sender and converter CPU/memory per stream; CPU percentages now represent the share of the whole computer.
- Evaluate output health against target FPS. Nonzero bitrate alone no longer certifies smooth playback. Sustained low-FPS output displays a buffering warning.
- Show the actual Auto output encoder choice; correct the speed display to use FFmpeg's speed rather than Mbps and show the configured bitrate target.

## Verification

- Actual source, two concurrent exact normalizers: each encoded 20 seconds of 1080p/30 H.264/AAC in **7.95 seconds** total. Each output contained at least 595 decoded video frames.
- Native app, two simultaneous local RTMP receivers using the real 8K source:

| Destination | Captured duration | Video frames | Delivered FPS | Average total bitrate |
|---|---:|---:|---:|---:|
| A | 86.056 s | 2581 | 29.992 | 4688.6 kbps |
| B | 76.956 s | 2308 | 29.991 | 4686.2 kbps |

Both captures contained H.264 1920×1080 and AAC. The native app reported about 6% combined whole-machine CPU, approximately 1.6 GB combined process memory, and no errors/reconnects. Both local senders were stopped after verification.

- **43 app tests + 15 standard native tests passed**, plus the opt-in real high-resolution test above. The separate external YouTube smoke test was not rerun.
- Production build, disk integrity, mounted app version and deep/strict ad-hoc signature checks passed.

YouTube ingestion has **not** been certified after this change: the user stopped the affected 1.0.3 senders during diagnosis. Install 1.0.4 before restarting the test broadcasts. The running old app cannot adopt the new decode pipeline without restarting.

## Installer

`src-tauri/target/release/bundle/dmg/LiveStream Studio_1.0.4_aarch64.dmg`

SHA-256: `67be6d3dd9ff08b00147ee9b4db068166c767e3726dd7d14dbdab128500adf20`

Ad-hoc signed; not Developer ID notarized. Performance was verified on this Mac with the supplied source. No stream keys are included in this report.
