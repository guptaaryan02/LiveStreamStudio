# LiveStream Studio 1.0.6 — overnight scheduling

November 3, 2026. Apple Silicon macOS installer.

## Using a 10 PM → 5 AM schedule

Save a profile with the video playlist and stream key. Create a one-time schedule for tomorrow at 05:00, leaving **Set macOS wake for the next run** selected. Approve macOS's administrator prompt if requested. The schedule should show **macOS wake confirmed** at 04:58. Existing schedules have a **Set wake for next run** button.

Leave Studio open and the user logged in. The screen can lock or turn off. Keep a MacBook connected to its charger with the lid open. The app does not bypass login, FileVault or closed-lid power restrictions, and cannot launch a broadcast after shutdown or logout. Network connectivity and YouTube Auto-start are still needed. A locked screen and system sleep are different: the app can execute while locked; the operating system must wake it from sleep first.

The alarm covers the next occurrence only. For recurring schedules, set the next wake alarm after each run, or leave Studio's idle sleep protection active. This release does not install a privileged background helper or alter global repeating wake/sleep settings.

## Changes

- Disable the desktop webview's background timer suspension on macOS 14+, so minimizing/hiding Studio does not suspend its scheduler after several minutes.
- Keep the idle sleep assertion active for automatic schedules, including while secure credentials are loading. Retry every 30 seconds and recreate a terminated helper. Display the actual helper state in Scheduler; surface assertion failures.
- Add an explicit macOS wake alarm two minutes before the next scheduled run, using `pmset schedule wake`. Only strictly validated date/owner values enter the administrator-approved command; titles, file paths and stream credentials do not. Verify the event by reading macOS's actual alarm list, including its two/four-digit year formats.
- Owner-scope alarms by application identifier and schedule ID. Replacing/removing an alarm touches only that schedule's event. Disabling/deleting a schedule removes its alarm first; failed removal leaves the schedule intact. Unused Studio alarms can also be removed from Scheduler.
- Weekly jobs catch up within 30 minutes after resume, including across midnight, using the original occurrence token to prevent duplicate launches. Newly created jobs do not replay an earlier time. One-time jobs retain their due-time catch-up behavior. Recheck on focus/visibility changes as well as timer ticks.
- Show missing profile keys, wake confirmation and overnight operating requirements directly in Scheduler. Saving a macOS schedule offers wake setup by default; cancelling administrator approval leaves the schedule saved without claiming wake readiness.

## Validation

- **49 app tests passed**, including a simulated 5 AM weekly run resuming at 05:03, repeated-tick deduplication, cross-midnight recovery, creation cutoff, grace-window expiry, disabled schedules and next-alarm selection. Existing local RTMP integration tests passed.
- **27 native tests passed; two opt-in tests ignored.** New tests cover alarm ownership, replacement/cancellation, date-format normalization and privileged-argument injection rejection.
- Isolated native QA app displayed active idle sleep protection, created an actual next-run macOS wake event, confirmed it from the OS, and removed it. Saving a new one-time schedule with the default wake checkbox also created and confirmed its alarm; deleting that schedule removed the alarm. QA events were removed afterward; production profiles/streams were not altered.
- Production frontend/native build, DMG integrity, mounted version 1.0.6 and deep/strict ad-hoc signature checks passed.

A physical overnight sleep→wake→stream test was not performed. Hardware wake behavior, closed-lid behavior and network reconnection are not certified by the simulated scheduler tests. Background timer suspension control requires macOS 14 or later.

## Files

`src-tauri/src/schedule_power.rs`, native command registration/keep-awake lifecycle in `src-tauri/src/lib.rs`, `src-tauri/tauri.conf.json`, `src/services/schedule.ts`, `src/services/schedulePower.ts`, `src/App.tsx`, Scheduler UI, schedule creation timestamps/types and scheduling tests. Version metadata updated to 1.0.6.

## Installer

`src-tauri/target/release/bundle/dmg/LiveStream Studio_1.0.6_aarch64.dmg`

SHA-256: `9d395ddc9978f0bee5b50c27950ef88a174cdd71c7be42dc01a2e225e123214e`

Ad-hoc signed, not Developer ID notarized. The installed production app was not replaced.
