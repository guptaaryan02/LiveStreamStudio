#!/usr/bin/env bash
#
# Signs a built LiveStream Studio.app for Developer ID distribution.
#
# WHY THIS EXISTS: Tauri signs the .app bundle, but it does NOT sign
# executables placed under bundle.resources. Verified on this project — the
# bundled FFmpeg came out as "code object is not signed at all" while the app
# itself was signed. Apple requires every nested Mach-O to be signed with the
# hardened runtime, so notarization rejects the build unless we sign the
# FFmpeg binaries ourselves, inside-out, BEFORE signing the app.
#
# Two modes:
#
#   scripts/sign-macos-bundle.sh --resources
#       Signs src-tauri/resources/ffmpeg/* IN PLACE, before `tauri build`.
#       This is the recommended path: a code signature lives inside the Mach-O
#       itself, so it survives being copied into the bundle, and Tauri's own
#       signing of the .app then seals it. Run this first.
#
#   SIGNING_IDENTITY="Developer ID Application: Name (TEAMID)" \
#     scripts/sign-macos-bundle.sh "path/to/LiveStream Studio.app"
#       Signs an already-built bundle inside-out and verifies that no unsigned
#       executable remains. Use for a build that was produced unsigned, or as a
#       final check before notarizing.
#
# Then notarize:
#   ditto -c -k --keepParent "LiveStream Studio.app" upload.zip
#   xcrun notarytool submit upload.zip --apple-id ... --team-id ... --password ... --wait
#   xcrun stapler staple "LiveStream Studio.app"
#
set -euo pipefail

APP="${1:-}"
IDENTITY="${SIGNING_IDENTITY:-}"
ENTITLEMENTS="${ENTITLEMENTS:-}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

[ -n "$APP" ]      || { echo "usage: $0 [--resources | <path to .app>]" >&2; exit 1; }
[ -n "$IDENTITY" ] || { echo "ERROR: set SIGNING_IDENTITY to your Developer ID Application identity" >&2; exit 1; }

log() { printf '\033[36m==>\033[0m %s\n' "$1"; }

# Pre-build mode: sign the bundled binaries where they live, so the signature
# is already inside them by the time Tauri copies them into the .app.
if [ "$APP" = "--resources" ]; then
  RES="$REPO_ROOT/src-tauri/resources/ffmpeg"
  [ -d "$RES" ] || { echo "ERROR: $RES does not exist" >&2; exit 1; }

  signed=0
  for bin in "$RES"/ffmpeg "$RES"/ffprobe; do
    [ -f "$bin" ] || continue
    log "Signing $(basename "$bin")"
    codesign --force --timestamp --options runtime --sign "$IDENTITY" "$bin"
    codesign --verify --strict "$bin"
    signed=$((signed + 1))
  done

  if [ "$signed" -eq 0 ]; then
    echo "ERROR: no FFmpeg binaries in $RES — run scripts/fetch-ffmpeg.sh first." >&2
    exit 1
  fi
  log "Signed $signed binaries. Now run: npm run tauri:build"
  exit 0
fi

[ -d "$APP" ] || { echo "ERROR: no such app bundle: $APP" >&2; exit 1; }

sign_one() {
  local target="$1"
  local extra=()
  [ -n "$ENTITLEMENTS" ] && extra=(--entitlements "$ENTITLEMENTS")
  codesign --force --timestamp --options runtime \
    "${extra[@]}" --sign "$IDENTITY" "$target"
}

# 1. Nested executables first. Signing inside-out matters: re-signing the app
#    afterwards seals these signatures into its own.
log "Signing nested executables"
while IFS= read -r bin; do
  # Only Mach-O files need signing; skip scripts, licences, READMEs.
  if file --brief "$bin" | grep -q "Mach-O"; then
    log "  $(basename "$bin")"
    sign_one "$bin"
  fi
done < <(find "$APP/Contents/Resources" -type f -perm -u+x 2>/dev/null)

# 2. Any sidecars Tauri placed next to the main binary.
while IFS= read -r bin; do
  if [ "$(basename "$bin")" != "$(basename "$APP" .app)" ] && file --brief "$bin" | grep -q "Mach-O"; then
    log "  MacOS/$(basename "$bin")"
    sign_one "$bin"
  fi
done < <(find "$APP/Contents/MacOS" -type f -perm -u+x 2>/dev/null)

# 3. Frameworks and dylibs, if any ever get added.
while IFS= read -r lib; do
  log "  $(basename "$lib")"
  sign_one "$lib"
done < <(find "$APP" -type f \( -name "*.dylib" -o -name "*.so" \) 2>/dev/null)

# 4. Finally the app itself.
log "Signing the app bundle"
sign_one "$APP"

log "Verifying"
codesign --verify --deep --strict --verbose=2 "$APP"

echo
log "Checking every nested Mach-O is now signed"
unsigned=0
while IFS= read -r bin; do
  if file --brief "$bin" | grep -q "Mach-O"; then
    if ! codesign --verify --strict "$bin" 2>/dev/null; then
      echo "  STILL UNSIGNED: $bin" >&2
      unsigned=1
    fi
  fi
done < <(find "$APP" -type f -perm -u+x 2>/dev/null)

if [ "$unsigned" -ne 0 ]; then
  echo "ERROR: unsigned executables remain — notarization would reject this build." >&2
  exit 1
fi

log "All nested executables signed. Ready for notarytool."
