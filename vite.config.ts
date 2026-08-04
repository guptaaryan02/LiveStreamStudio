import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { spawn, execFile, ChildProcess } from 'child_process';
import { PassThrough } from 'stream';
import type { IncomingMessage, ServerResponse } from 'http';

const activeFFmpegProcesses = new Map<string, ChildProcess>();

const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.mkv', '.avi', '.ts', '.webm', '.flv', '.m4v', '.wmv'];

const MIME_BY_EXT: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.mov': 'video/quicktime',
  '.mkv': 'video/x-matroska',
  '.webm': 'video/webm',
  '.avi': 'video/x-msvideo',
  '.ts': 'video/mp2t',
  '.flv': 'video/x-flv',
  '.wmv': 'video/x-ms-wmv',
};

const readJsonBody = (req: IncomingMessage): Promise<any> =>
  new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });

const sendJson = (res: ServerResponse, status: number, payload: unknown) => {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
};

const run = (cmd: string, args: string[]): Promise<{ code: number; stdout: string; stderr: string }> =>
  new Promise((resolve) => {
    execFile(cmd, args, { maxBuffer: 10 * 1024 * 1024 }, (err: any, stdout, stderr) => {
      resolve({ code: err?.code ?? 0, stdout: String(stdout || ''), stderr: String(stderr || '') });
    });
  });

/** Finds a binary on PATH, falling back to the usual install locations. */
const resolveBinary = (name: string, preferred?: string): string => {
  const candidates = [
    preferred && preferred !== name ? preferred : '',
    `/opt/homebrew/bin/${name}`,
    `/usr/local/bin/${name}`,
    `/usr/bin/${name}`,
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch {
      /* ignore */
    }
  }
  return name; // rely on PATH
};

/**
 * Opens a native file dialog ON THE MACHINE RUNNING THE DEV SERVER (which is the
 * machine that will run FFmpeg), so we get real absolute paths. A browser file
 * input only yields blob: URLs, which FFmpeg cannot read.
 */
const openNativeFilePicker = async (): Promise<string[]> => {
  if (process.platform === 'darwin') {
    const script = [
      'set chosen to choose file with prompt "Select video files for 24/7 streaming" with multiple selections allowed',
      'set out to ""',
      'repeat with f in chosen',
      'set out to out & POSIX path of f & linefeed',
      'end repeat',
      'return out',
    ];
    const args: string[] = [];
    script.forEach((line) => args.push('-e', line));
    const { stdout } = await run('osascript', args);
    return stdout.split('\n').map((s) => s.trim()).filter(Boolean);
  }

  if (process.platform === 'win32') {
    const ps = `Add-Type -AssemblyName System.Windows.Forms; $d = New-Object System.Windows.Forms.OpenFileDialog; $d.Multiselect = $true; $d.Filter = 'Videos|*.mp4;*.mov;*.mkv;*.avi;*.ts;*.webm;*.flv;*.m4v;*.wmv'; if ($d.ShowDialog() -eq 'OK') { $d.FileNames -join "\`n" }`;
    const { stdout } = await run('powershell', ['-NoProfile', '-STA', '-Command', ps]);
    return stdout.split('\n').map((s) => s.trim()).filter(Boolean);
  }

  const { stdout } = await run('zenity', ['--file-selection', '--multiple', '--separator=\n', '--title=Select video files']);
  return stdout.split('\n').map((s) => s.trim()).filter(Boolean);
};

/** ffprobe a file for duration / resolution / fps / codecs. */
const probeFile = async (filePath: string, ffprobeBin: string) => {
  const { stdout } = await run(ffprobeBin, [
    '-v', 'quiet',
    '-print_format', 'json',
    '-show_format',
    '-show_streams',
    filePath,
  ]);

  try {
    const parsed = JSON.parse(stdout);
    const video = (parsed.streams || []).find((s: any) => s.codec_type === 'video');
    const audio = (parsed.streams || []).find((s: any) => s.codec_type === 'audio');
    const duration = Math.floor(parseFloat(parsed.format?.duration || '0')) || 0;

    let fps = 30;
    if (video?.r_frame_rate) {
      const [num, den] = String(video.r_frame_rate).split('/').map(Number);
      if (den) fps = num / den;
    }

    const resolution = video?.width && video?.height ? `${video.width}x${video.height}` : '';

    // Container stream order — a playlist mixing audio-first and video-first
    // files cannot be stream-copied through the concat demuxer.
    const streamLayout = (parsed.streams || [])
      .filter((s: any) => s.codec_type === 'video' || s.codec_type === 'audio')
      .map((s: any) => `${s.codec_type === 'video' ? 'v' : 'a'}${s.index}`)
      .join(',');

    return {
      duration,
      resolution,
      fps,
      metadata: {
        stream_layout: streamLayout,
        video_codec: video?.codec_name || '',
        audio_codec: audio?.codec_name || '',
        resolution,
        fps,
        pixel_format: video?.pix_fmt || '',
        audio_channels: audio?.channels || 2,
        sample_rate: Number(audio?.sample_rate) || 44100,
        bitrate_kbps: Math.round(Number(parsed.format?.bit_rate || 0) / 1000),
      },
    };
  } catch {
    return { duration: 0, resolution: '', fps: 30, metadata: undefined };
  }
};

/**
 * Decodes one clip of ANY format and writes a fixed MPEG-TS profile into the
 * shared upload buffer. Resolves with how many seconds were actually encoded,
 * which advances the output timeline so the next clip continues it seamlessly.
 */
const pipeClipIntoBuffer = (
  clip: string,
  config: any,
  tsOffset: number,
  buffer: NodeJS.WritableStream,
  ffmpegBin: string,
  onSpawn?: (child: ChildProcess) => void
): Promise<number> =>
  new Promise((resolve) => {
    const fps = config.fps || 30;
    const gop = String(Math.max(2, fps * 2));
    const bitrate = config.bitrateKbps || 4500;
    const encoder: Record<string, string[]> = {
      NVENC: ['-c:v', 'h264_nvenc', '-preset', 'p4'],
      QuickSync: ['-c:v', 'h264_qsv', '-preset', 'medium'],
      VideoToolbox: ['-c:v', 'h264_videotoolbox'],
    };

    const child = spawn(
      ffmpegBin,
      [
        '-hide_banner', '-nostdin',
        '-i', clip,
        '-vf',
        `scale=${config.width}:${config.height}:force_original_aspect_ratio=decrease,pad=${config.width}:${config.height}:(ow-iw)/2:(oh-ih)/2,fps=${fps},format=yuv420p`,
        '-af', 'aresample=async=1,aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo',
        '-fps_mode', 'cfr',
        ...(encoder[config.hardwareAcc] || ['-c:v', 'libx264', '-preset', 'veryfast']),
        '-b:v', `${bitrate}k`,
        '-maxrate', `${bitrate}k`,
        '-bufsize', `${bitrate * 2}k`,
        '-g', gop,
        '-keyint_min', gop,
        '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-ac', '2',
        '-bsf:v', 'h264_mp4toannexb',
        '-output_ts_offset', tsOffset.toFixed(3),
        '-muxdelay', '0',
        '-f', 'mpegts', 'pipe:1',
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    );

    onSpawn?.(child);

    if (!buffer.writable) {
      child.kill();
      resolve(0);
      return;
    }

    let encodedSeconds = 0;
    child.stderr?.on('data', (chunk) => {
      const match = /time=(\d+):(\d+):([\d.]+)/g;
      let m: RegExpExecArray | null;
      const text = chunk.toString();
      while ((m = match.exec(text)) !== null) {
        encodedSeconds = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
      }
    });

    child.stdout?.on('error', () => child.kill());
    child.stdout?.pipe(buffer, { end: false });

    // If the buffer dies (sender gone), stop converting immediately.
    const onBufferClose = () => child.kill();
    buffer.once('close', onBufferClose);

    child.on('error', () => resolve(0));
    child.on('close', () => {
      buffer.removeListener('close', onBufferClose);
      resolve(encodedSeconds);
    });
  });

/** Depth-limited search for a file by name (and size, when known). */
const locateFile = (name: string, size: number | undefined, roots: string[], maxDepth = 4): string | null => {
  const queue: Array<{ dir: string; depth: number }> = roots.map((dir) => ({ dir, depth: 0 }));

  while (queue.length > 0) {
    const { dir, depth } = queue.shift()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (depth < maxDepth && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
          queue.push({ dir: full, depth: depth + 1 });
        }
      } else if (entry.name === name) {
        if (size === undefined) return full;
        try {
          if (fs.statSync(full).size === size) return full;
        } catch {
          /* ignore */
        }
      }
    }
  }
  return null;
};

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'ffmpeg-native-runner',
      configureServer(server) {
        // Opens a native file dialog on the host and returns REAL disk paths + probe data.
        server.middlewares.use('/api/files/pick', async (req, res, next) => {
          if (req.method !== 'POST') return next();
          try {
            const paths = (await openNativeFilePicker()).filter((p) =>
              VIDEO_EXTENSIONS.includes(path.extname(p).toLowerCase())
            );
            const ffprobeBin = resolveBinary('ffprobe');

            const files = [];
            for (const filePath of paths) {
              if (!fs.existsSync(filePath)) continue;
              const stat = fs.statSync(filePath);
              const probe = await probeFile(filePath, ffprobeBin);
              files.push({
                path: filePath,
                sizeMb: parseFloat((stat.size / (1024 * 1024)).toFixed(1)),
                ...probe,
              });
            }
            sendJson(res, 200, { files });
          } catch (e: any) {
            console.error('[Files] pick failed:', e);
            sendJson(res, 500, { error: e.message || String(e) });
          }
        });

        // Maps dropped browser files (name + size only) back to real disk paths.
        server.middlewares.use('/api/files/locate', async (req, res, next) => {
          if (req.method !== 'POST') return next();
          try {
            const body = await readJsonBody(req);
            const home = os.homedir();
            const roots = [
              path.join(home, 'Movies'),
              path.join(home, 'Videos'),
              path.join(home, 'Downloads'),
              path.join(home, 'Desktop'),
              path.join(home, 'Documents'),
              process.cwd(),
            ].filter((dir) => fs.existsSync(dir));

            const ffprobeBin = resolveBinary('ffprobe');
            const files = [];
            for (const item of body.files || []) {
              const found = locateFile(item.name, item.size, roots);
              if (!found) continue;
              const probe = await probeFile(found, ffprobeBin);
              files.push({
                path: found,
                sizeMb: parseFloat((fs.statSync(found).size / (1024 * 1024)).toFixed(1)),
                ...probe,
              });
            }
            sendJson(res, 200, { files });
          } catch (e: any) {
            sendJson(res, 500, { error: e.message || String(e) });
          }
        });

        // Real TCP reachability probe of the RTMP endpoint (not a bandwidth test).
        server.middlewares.use('/api/net/rtmp-check', async (req, res, next) => {
          if (req.method !== 'POST') return next();
          try {
            const { url } = await readJsonBody(req);
            const hostPort = String(url || '').split('://')[1]?.split('/')[0] || '';
            const [host, portRaw] = hostPort.includes(':') ? hostPort.split(':') : [hostPort, ''];
            const port = Number(portRaw) || (String(url).startsWith('rtmps') ? 443 : 1935);

            if (!host) {
              sendJson(res, 200, { reachable: false, latencyMs: 0, detail: 'No RTMP host in URL' });
              return;
            }

            const net = await import('net');
            const started = Date.now();
            const result = await new Promise<any>((resolve) => {
              const socket = net.connect({ host, port });
              const finish = (reachable: boolean, detail: string) => {
                socket.destroy();
                resolve({ reachable, latencyMs: Date.now() - started, detail });
              };
              socket.setTimeout(5000);
              socket.once('connect', () => finish(true, `Connected to ${host}:${port}`));
              socket.once('timeout', () => finish(false, `Timed out connecting to ${host}:${port}`));
              socket.once('error', (e: any) => finish(false, e.message));
            });
            sendJson(res, 200, result);
          } catch (e: any) {
            sendJson(res, 200, { reachable: false, latencyMs: 0, detail: e.message || String(e) });
          }
        });

        // Serves a local file (with Range support) so the HTML5 preview works in web mode.
        server.middlewares.use('/api/files/preview', (req, res, next) => {
          if (req.method !== 'GET' && req.method !== 'HEAD') return next();
          try {
            const url = new URL(req.url || '', 'http://localhost');
            const filePath = url.searchParams.get('path') || '';
            if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
              res.writeHead(404);
              res.end('Not found');
              return;
            }

            const stat = fs.statSync(filePath);
            const contentType = MIME_BY_EXT[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
            const range = req.headers.range;

            if (range) {
              const match = /bytes=(\d*)-(\d*)/.exec(range);
              const start = match && match[1] ? parseInt(match[1], 10) : 0;
              const end = match && match[2] ? parseInt(match[2], 10) : stat.size - 1;
              res.writeHead(206, {
                'Content-Range': `bytes ${start}-${end}/${stat.size}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': end - start + 1,
                'Content-Type': contentType,
              });
              fs.createReadStream(filePath, { start, end }).pipe(res);
            } else {
              res.writeHead(200, {
                'Content-Length': stat.size,
                'Accept-Ranges': 'bytes',
                'Content-Type': contentType,
              });
              fs.createReadStream(filePath).pipe(res);
            }
          } catch (e: any) {
            res.writeHead(500);
            res.end(e.message || 'Preview failed');
          }
        });

        server.middlewares.use('/api/ffmpeg/start', async (req, res, next) => {
          if (req.method !== 'POST') return next();
          try {
            const { streamId, playlistContent, args, ffmpegPath: requestedBin } = await readJsonBody(req);

            if (!Array.isArray(args) || args.length === 0) {
              sendJson(res, 400, { success: false, error: 'No FFmpeg arguments supplied by the client.' });
              return;
            }

            const playlistPath = path.join(process.cwd(), `livestream_playlist_${streamId}.txt`);
            fs.writeFileSync(playlistPath, playlistContent || '# Empty playlist\n', 'utf-8');
            console.log(`[FFmpeg Native Engine] Created ${playlistPath}`);

            // The client emits a relative "playlist.txt" placeholder — point it at the real file.
            const ffmpegArgs = (args as string[]).map((arg) => (arg === 'playlist.txt' ? playlistPath : arg));

            // Verify every input actually exists before spawning, so failures are explainable.
            const missing = ffmpegArgs
              .filter((arg, i) => ffmpegArgs[i - 1] === '-i' && !arg.startsWith('http') && arg !== playlistPath)
              .filter((arg) => !fs.existsSync(arg));
            if (missing.length > 0) {
              sendJson(res, 400, {
                success: false,
                error: `These files no longer exist on disk: ${missing.join(', ')}`,
              });
              return;
            }

            const ffmpegBin = resolveBinary('ffmpeg', requestedBin);
            console.log(`[FFmpeg Native Engine] Executing: ${ffmpegBin} ${ffmpegArgs.join(' ')}`);

            const child = spawn(ffmpegBin, ffmpegArgs, { stdio: ['pipe', 'pipe', 'pipe'] });
            let spawnError = '';
            child.on('error', (err) => {
              spawnError = err.message;
              console.error(`[FFmpeg ${streamId}] spawn error:`, err.message);
            });
            activeFFmpegProcesses.set(streamId, child);

            child.stdout?.on('data', (data) => {
              console.log(`[FFmpeg ${streamId} stdout]: ${data.toString()}`);
            });

            child.stderr?.on('data', (data) => {
              console.log(`[FFmpeg ${streamId} stderr]: ${data.toString()}`);
            });

            child.on('close', (code) => {
              console.log(`[FFmpeg ${streamId}] Exited with code ${code}`);
              activeFFmpegProcesses.delete(streamId);
            });

            // Give a failed spawn (missing binary) a moment to surface.
            await new Promise((resolve) => setTimeout(resolve, 150));
            if (spawnError) {
              sendJson(res, 500, { success: false, error: `Could not start ${ffmpegBin}: ${spawnError}` });
              return;
            }

            sendJson(res, 200, {
              success: true,
              pid: child.pid,
              message: `FFmpeg process actively streaming PID ${child.pid}`,
            });
          } catch (e: any) {
            console.error('[FFmpeg Native Engine Error]:', e);
            sendJson(res, 500, { success: false, error: e.message || String(e) });
          }
        });

        // Continuous playout: one RTMP sender fed by per-clip normalisers, so a
        // playlist mixing codecs/resolutions never kills the stream. Mirrors the
        // Rust engine used by the desktop build.
        server.middlewares.use('/api/ffmpeg/playout', async (req, res, next) => {
          if (req.method !== 'POST') return next();
          try {
            const { streamId, clips, config } = await readJsonBody(req);
            if (!Array.isArray(clips) || clips.length === 0) {
              sendJson(res, 400, { success: false, error: 'Playlist has no playable files' });
              return;
            }

            const missing = clips.filter((c: string) => !fs.existsSync(c));
            if (missing.length > 0) {
              sendJson(res, 400, {
                success: false,
                error: `These files no longer exist on disk: ${missing.slice(0, 3).join(', ')}`,
              });
              return;
            }

            const ffmpegBin = resolveBinary('ffmpeg');
            const sender = spawn(
              ffmpegBin,
              [
                '-hide_banner', '-nostdin',
                '-re',
                '-f', 'mpegts',
                '-i', 'pipe:0',
                '-c', 'copy',
                '-flvflags', 'no_duration_filesize',
                '-f', 'flv', config.rtmpTarget,
              ],
              { stdio: ['pipe', 'ignore', 'pipe'] }
            );

            let senderError = '';
            sender.on('error', (err) => (senderError = err.message));
            sender.stderr?.on('data', (d) => console.log(`[Playout ${streamId}]: ${d}`));
            activeFFmpegProcesses.set(streamId, sender);

            // ~8s of encoded output absorbs clip transitions and encoder stalls.
            const bytesPerSecond = ((config.bitrateKbps || 4500) + 128) * 125;
            const buffer = new PassThrough({ highWaterMark: Math.min(bytesPerSecond * 8, 64 * 1024 * 1024) });

            // A dead sender (network drop, stream stopped) must surface as a
            // stopped stream — never as an unhandled EPIPE that takes the server down.
            let stopped = false;
            const senderStdin = sender.stdin!;
            senderStdin.on('error', () => { stopped = true; });
            buffer.on('error', () => { stopped = true; });
            buffer.pipe(senderStdin);

            // The converter that is currently feeding the buffer, so it can be
            // killed the moment the stream ends instead of lingering.
            let currentClipProcess: ChildProcess | null = null;

            sender.on('close', () => {
              stopped = true;
              activeFFmpegProcesses.delete(streamId);
              currentClipProcess?.kill('SIGKILL');
              currentClipProcess = null;
              if (!buffer.destroyed) buffer.destroy();
            });

            // Feed clips sequentially, looping the whole playlist.
            (async () => {
              let tsOffset = 0;
              const frameGap = 1 / (config.fps || 30);
              const passes = config.loopForever ? Infinity : Math.max(1, config.repeatCount || 1);

              for (let pass = 0; pass < passes && !stopped; pass++) {
                for (const clip of clips) {
                  if (stopped || !buffer.writable) { stopped = true; break; }
                  tsOffset +=
                    (await pipeClipIntoBuffer(clip, config, tsOffset, buffer, ffmpegBin, (child) => {
                      currentClipProcess = child;
                      if (stopped) child.kill('SIGKILL');
                    })) + frameGap;
                }
              }
              if (buffer.writable) buffer.end();
            })().catch((e) => console.error(`[Playout ${streamId}] feeder stopped:`, e));

            await new Promise((resolve) => setTimeout(resolve, 200));
            if (senderError) {
              sendJson(res, 500, { success: false, error: `Could not start ${ffmpegBin}: ${senderError}` });
              return;
            }

            sendJson(res, 200, { success: true, pid: sender.pid, message: 'Playout engine started' });
          } catch (e: any) {
            sendJson(res, 500, { success: false, error: e.message || String(e) });
          }
        });

        server.middlewares.use('/api/ffmpeg/stop', (req, res, next) => {
          if (req.method === 'POST') {
            let body = '';
            req.on('data', (chunk) => (body += chunk));
            req.on('end', () => {
              try {
                const { streamId } = JSON.parse(body);
                const child = activeFFmpegProcesses.get(streamId);
                if (child) {
                  child.kill('SIGTERM');
                  activeFFmpegProcesses.delete(streamId);
                  console.log(`[FFmpeg Native Engine] Stopped stream ${streamId}`);
                }
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, message: `FFmpeg process terminated` }));
              } catch (e: any) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: e.message }));
              }
            });
          } else {
            next();
          }
        });
      },
    },
  ],
  server: {
    port: 3000,
    strictPort: true,
    host: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
