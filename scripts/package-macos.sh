#!/usr/bin/env bash
# A standard drag-to-Applications DMG without Finder/AppleScript automation.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
[[ "$(uname -s)" == "Darwin" ]] || { echo "This package target requires macOS" >&2; exit 1; }
VERSION="$(node -p "JSON.parse(require('fs').readFileSync('package.json', 'utf8')).version")"
ARCH="$(uname -m)"
[[ "$ARCH" != "arm64" ]] || ARCH="aarch64"
npm run tauri:build -- --bundles app
APP="$ROOT/src-tauri/target/release/bundle/macos/LiveStream Studio.app"
OUTPUT="$ROOT/src-tauri/target/release/bundle/dmg/LiveStream Studio_${VERSION}_${ARCH}.dmg"
STAGE="$(mktemp -d /tmp/livestream-studio-package.XXXXXX)"
trap 'rm -rf "$STAGE"' EXIT
mkdir -p "$(dirname "$OUTPUT")"
# Seal the final resources for local Apple Silicon execution. This is ad-hoc
# signing, not Developer ID signing or notarization.
codesign --force --deep --sign - "$APP"
codesign --verify --deep --strict "$APP"
ditto "$APP" "$STAGE/LiveStream Studio.app"
ln -s /Applications "$STAGE/Applications"
hdiutil create -volname "LiveStream Studio $VERSION" -srcfolder "$STAGE" -format UDZO -ov "$OUTPUT"
hdiutil verify "$OUTPUT"
printf '\nInstaller: %s\n' "$OUTPUT"
