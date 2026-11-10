import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const suffix = process.platform === 'win32' ? '.exe' : '';
const ffmpeg = resolve(`src-tauri/resources/ffmpeg/ffmpeg${suffix}`);
const ffprobe = resolve(`src-tauri/resources/ffmpeg/ffprobe${suffix}`);
const directory = mkdtempSync(join(tmpdir(), 'studio-ffmpeg-smoke-'));
function run(binary, args) {
  const result = spawnSync(binary, args, { encoding: 'utf8', timeout: 120000, windowsHide: true });
  if (result.error || result.status !== 0) throw new Error(result.error?.message || result.stderr || 'FFmpeg check failed');
  return result.stdout;
}
try {
  const output = join(directory, 'broadcast.flv');
  console.log(run(ffmpeg, ['-version']).split('\n')[0]);
  run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=blue:s=320x180:r=30:d=2', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=44100:duration=2', '-c:v', 'libx264', '-threads', '1', '-pix_fmt', 'yuv420p', '-bf', '0', '-g', '60', '-c:a', 'aac', '-ar', '44100', '-ac', '2', '-shortest', '-f', 'flv', output]);
  const info = JSON.parse(run(ffprobe, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', output]));
  const video = info.streams.find(stream => stream.codec_type === 'video');
  const audio = info.streams.find(stream => stream.codec_type === 'audio');
  if (video?.codec_name !== 'h264' || video.width !== 320 || video.height !== 180 || audio?.codec_name !== 'aac' || Number(info.format.duration) < 1.9) throw new Error('Bundled encoder did not produce the expected H.264/AAC video');
  console.log('PASS: bundled FFmpeg and FFprobe encode and inspect a two-second H.264/AAC broadcast file.');
} finally { rmSync(directory, { recursive: true, force: true }); }
