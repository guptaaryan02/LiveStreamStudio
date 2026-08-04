Place licensed platform FFmpeg binaries here before release packaging.

Expected runtime layout after bundling:

- ffmpeg/ffmpeg or ffmpeg/ffmpeg.exe
- ffmpeg/ffprobe or ffmpeg/ffprobe.exe
- ffmpeg/LICENSE

The Rust backend checks this bundled resource directory before falling back to
system PATH locations.
