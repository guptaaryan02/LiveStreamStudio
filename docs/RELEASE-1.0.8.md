# LiveStream Studio 1.0.8 — explicit stream-key storage and access

November 3, 2026. Apple Silicon macOS.

## User flow

New profiles default to **Use for this session only**. Profile settings are saved, but the stream key remains only in memory until Studio closes. Users can instead choose **Save securely in macOS Keychain**. The form explains exactly what is saved, where it is saved and why macOS may ask for the login Keychain password.

Saved keys are no longer automatically retrieved at app startup, profile launch or a scheduled start. Choose **Load saved key** in Stream Profiles. An in-app dialog identifies the profile/platform, explains that Studio will retrieve that profile's stream key to connect to its streaming server, identifies the macOS item name, and offers Cancel before any Keychain call. Existing saved keys remain accessible through this explicit flow.

Users can enter a session key, save/update the current key, remove its saved copy or delete the profile. Keychain operations receive an explanation and confirmation first. Removing a saved copy keeps any key already loaded in memory available for the current session; cancelling or failing a write preserves session usability and does not falsely mark the key as saved. The macOS system dialog's wording is controlled by macOS.

## Unattended schedules

Prepare keys while the Mac is unlocked, then leave Studio running. Once a key is loaded, streaming uses the in-memory key without requesting Keychain access at the scheduled time. Restarting Studio clears session keys, including copies loaded from Keychain; users must explicitly prepare them again. A persistent readiness banner and profile/scheduler notices explain this requirement.

A due schedule with an unprepared key waits instead of consuming its run or opening a password prompt unattended. The log records this once for the due occurrence. Loading a key can enable a due automatic schedule; the access dialog says so. Existing one-time catch-up and 30-minute recurring catch-up rules remain in place.

YouTube Studio and the browser do not need to remain open. The target broadcast must have Auto-start enabled and use the matching stream key. YouTube documents that Auto-start begins the broadcast when video arrives on its bound live stream: https://developers.google.com/youtube/data/live/reference/rest/v3/liveBroadcasts

## Verification

- **61 app tests passed**, including session-only defaults, zero implicit credential calls, explicit save/load/remove scoping, denied access handling, legacy-key loading, credential-free profile persistence and due-schedule readiness/deduplication. Local RTMP tests still passed.
- **27 native tests passed; two opt-in tests ignored.** Native Keychain commands now run on blocking workers so an authorization prompt does not block the app's UI thread.
- Isolated native UI opened without automatic retrieval, showed the profile-specific load explanation, successfully loaded its existing disposable QA key, defaulted new profiles to session-only, saved a disposable session profile without a system prompt, displayed/cancelled the separate save-key explanation, and cleared session keys after restart. Deleted the disposable session profile and closed the QA app afterward. No production stream keys or broadcasts were used.
- Production frontend/native build, DMG integrity, mounted version 1.0.8 and deep/strict ad-hoc signature checks passed.

## Files

Credential metadata and actions in `src/types/index.ts`, `src/store/useStudioStore.ts`, `src/services/profileCredentials.ts` and `src/services/tauriEngine.ts`; profile consent UI, App readiness/startup behavior, Scheduler readiness text, asynchronous native credential commands and regression tests. Version metadata updated to 1.0.8.

## Installer

`src-tauri/target/release/bundle/dmg/LiveStream Studio_1.0.8_aarch64.dmg`

SHA-256: `07eca5a1e7dda69a87cb488977872c5e4707a0bf0b8f13d613c0c0d683fba9a6`

Ad-hoc signed, not Developer ID notarized. The installed production app was not replaced.
