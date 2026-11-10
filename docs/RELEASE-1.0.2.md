# LiveStream Studio 1.0.2

Built October 29, 2026 for Apple Silicon macOS.

Installer: `src-tauri/target/release/bundle/dmg/LiveStream Studio_1.0.2_aarch64.dmg` (approximately 53 MB).

SHA-256: `d314744c2938834d1200c15dfb31357c27a0535156373b767ee1e4d906ff2e79`

Disk-image integrity verified. Mounted copy reports version 1.0.2 and passes `codesign --verify --deep --strict`. Ad-hoc signed; not Developer ID signed or notarized. Packaging now seals the final resources before creating the DMG.

Includes stable software CBR defaults, independent multi-stream controls, real drop/recovery testing, accurate local-file imports, native clipboard/text export support, one-time scheduling with optional stop duration, saved-profile credential restoration, and macOS idle-sleep prevention while configured schedules or streams are active.

Validation: production build passed, 37 Node tests passed, 14 native tests passed; one opt-in external smoke test ignored during final regression. Actual scheduled local RTMP capture lasted 60.255 seconds and contained 1080p H.264/AAC. Native two-destination tests verified independent stop, recovery and Stop All.

See [button audit](BUTTON-QA-2026-10-29.md) for detailed results and incomplete features. Theme rendering, desktop notifications and historical analytics remain incomplete. Second YouTube broadcast publication and several final export/file-picker interactions are not certified.

For scheduled YouTube streams: save a profile containing the correct playlist and key, create a one-time schedule (or use Start in 1 hour), and keep Studio open. Enable Auto-start in that YouTube broadcast. Scheduling does not start an app that has been quit, and Google OAuth is not implemented.
