#!/usr/bin/env bash
#
# Fetches the FFmpeg + ffprobe binaries that ship inside LiveStream Studio.
#
# Only the HOST platform's binaries are fetched, because src-tauri/resources/
# is bundled wholesale into the installer — dropping all three platforms in
# there would ship Windows binaries to Mac users and triple the download.
# In CI, each OS runner executes this script for its own platform.
#
# LICENSING: these are GPL builds (they include libx264/libx265). Distributing
# them obliges you to offer the complete corresponding source to every
# recipient. This script records the exact build and its source URL in
# PROVENANCE.txt so that offer stays honest. See resources/licenses/.
#
# Usage:
#   scripts/fetch-ffmpeg.sh                 # fetch for this machine
#   FFMPEG_RELEASE=autobuild-2024-01-01 ... # pin a specific BtbN build
#   FFMPEG_MACOS_URL=https://... scripts/fetch-ffmpeg.sh
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="$REPO_ROOT/src-tauri/resources/ffmpeg"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# BtbN publishes reproducible GPL builds for Windows and Linux. Pin a dated
# release rather than "latest" for a shippable build.
FFMPEG_RELEASE="${FFMPEG_RELEASE:-latest}"
BTBN_BASE="https://github.com/BtbN/FFmpeg-Builds/releases/download/${FFMPEG_RELEASE}"
BTBN_SOURCE="https://github.com/BtbN/FFmpeg-Builds/releases/tag/${FFMPEG_RELEASE}"

# macOS has no single canonical static GPL build, so the URL must be supplied
# explicitly. Known sources: osxexperts.net, martin-riedl.de, evermeet.cx
# (x86_64). Alternatively build from source with --enable-gpl --enable-libx264.
FFMPEG_MACOS_URL="${FFMPEG_MACOS_URL:-}"

os="$(uname -s)"
arch="$(uname -m)"

log()  { printf '\033[36m==>\033[0m %s\n' "$1"; }
fail() { printf '\033[31mERROR:\033[0m %s\n' "$1" >&2; exit 1; }

download() {
  local url="$1" out="$2"
  log "Downloading $url"
  curl --fail --location --progress-bar --output "$out" "$url" \
    || fail "Download failed: $url"
}

mkdir -p "$DEST"

case "$os" in
  Darwin)
    if [ -z "$FFMPEG_MACOS_URL" ]; then
      fail "Set FFMPEG_MACOS_URL to a static macOS ${arch} GPL FFmpeg archive.
       There is no canonical prebuilt static GPL FFmpeg for macOS, and Homebrew's
       binaries link against /opt/homebrew dylibs so they cannot be shipped.
       Either point this at a trusted static build or compile FFmpeg yourself
       with --enable-gpl --enable-libx264 --enable-videotoolbox."
    fi
    download "$FFMPEG_MACOS_URL" "$WORK/ffmpeg-macos.archive"
    SOURCE_URL="$FFMPEG_MACOS_URL"
    ( cd "$WORK" && case "$FFMPEG_MACOS_URL" in
        *.zip)     unzip -qo ffmpeg-macos.archive ;;
        *.tar.xz)  tar -xJf ffmpeg-macos.archive ;;
        *.tar.gz)  tar -xzf ffmpeg-macos.archive ;;
        *)         fail "Unsupported archive type: $FFMPEG_MACOS_URL" ;;
      esac )
    ;;
  Linux)
    ARCHIVE="ffmpeg-master-latest-linux64-gpl.tar.xz"
    download "$BTBN_BASE/$ARCHIVE" "$WORK/$ARCHIVE"
    SOURCE_URL="$BTBN_SOURCE"
    ( cd "$WORK" && tar -xJf "$ARCHIVE" )
    ;;
  MINGW*|MSYS*|CYGWIN*)
    ARCHIVE="ffmpeg-master-latest-win64-gpl.zip"
    download "$BTBN_BASE/$ARCHIVE" "$WORK/$ARCHIVE"
    SOURCE_URL="$BTBN_SOURCE"
    ( cd "$WORK" && unzip -qo "$ARCHIVE" )
    ;;
  *)
    fail "Unsupported host OS: $os"
    ;;
esac

# The archives nest binaries at different depths, so search rather than guess.
for tool in ffmpeg ffprobe; do
  found="$(find "$WORK" -type f \( -name "$tool" -o -name "$tool.exe" \) -perm -u+x -print -quit 2>/dev/null || true)"
  [ -z "$found" ] && found="$(find "$WORK" -type f \( -name "$tool" -o -name "$tool.exe" \) -print -quit)"
  [ -z "$found" ] && fail "$tool not found inside the downloaded archive"
  cp "$found" "$DEST/$(basename "$found")"
  chmod 755 "$DEST/$(basename "$found")"
  log "Installed $(basename "$found")"
done

# Keep the build's own licence texts next to the binaries.
find "$WORK" -type f \( -iname "LICENSE*" -o -iname "COPYING*" \) -exec cp {} "$DEST/" \; 2>/dev/null || true

BIN="$DEST/ffmpeg"
[ -f "$BIN" ] || BIN="$DEST/ffmpeg.exe"

log "Verifying the binary runs"
"$BIN" -hide_banner -version >/dev/null 2>&1 || fail "Bundled ffmpeg will not execute"

VERSION="$("$BIN" -hide_banner -version | head -1)"
CONFIG="$("$BIN" -hide_banner -version | grep -m1 configuration: || true)"

# A GPL build must actually be a GPL build — if libx264 is missing, the
# Software encoder fallback silently stops working.
case "$CONFIG" in
  *--enable-gpl*) ;;
  *) printf '\033[33mWARNING:\033[0m this build is not --enable-gpl; the Software (libx264) encoder will be unavailable.\n' ;;
esac
case "$CONFIG" in
  *--enable-libx264*) ;;
  *) printf '\033[33mWARNING:\033[0m this build has no libx264; only hardware encoders will work.\n' ;;
esac

{
  echo "FFmpeg binaries bundled with LiveStream Studio"
  echo
  echo "Fetched:      $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
  echo "Host:         $os $arch"
  echo "Source URL:   $SOURCE_URL"
  echo "Version:      $VERSION"
  echo
  echo "SHA256 of the exact binaries shipped:"
  for f in "$DEST"/ffmpeg "$DEST"/ffmpeg.exe "$DEST"/ffprobe "$DEST"/ffprobe.exe; do
    [ -f "$f" ] || continue
    if command -v shasum >/dev/null 2>&1; then
      shasum -a 256 "$f" | sed "s#$DEST/##"
    else
      sha256sum "$f" | sed "s#$DEST/##"
    fi
  done
  echo
  echo "$CONFIG"
} > "$DEST/PROVENANCE.txt"

log "Done. $VERSION"
log "Provenance written to $DEST/PROVENANCE.txt"
echo
printf '\033[33mGPL reminder:\033[0m keep the corresponding source for this exact build\n'
printf '             available for as long as you distribute the app.\n'
