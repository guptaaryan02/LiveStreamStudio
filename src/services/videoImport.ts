import { VideoItem, VideoCategory, VideoMetadata } from '../types';
import { isTauriEnvironment, selectNativeVideoFiles, probeVideoFile } from './tauriEngine';

/**
 * Central video import service.
 *
 * FFmpeg streams from the real disk, so every video that enters the library MUST
 * carry a real absolute `localPath`. Browser `blob:` URLs only exist inside the
 * webview and are invisible to the FFmpeg process — importing them is what
 * produced the "NO_LOCAL_FILES" failure on Go Live.
 *
 * Desktop (Tauri) -> native Rust file picker returns real paths.
 * Web (vite dev server) -> /api/files/pick opens a native dialog on the host
 * machine that actually runs FFmpeg, and returns real paths.
 */

const DEFAULT_THUMBNAIL =
  'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&auto=format&fit=crop&q=80';

/** A path FFmpeg can actually open (not an in-memory browser URL). */
export const isStreamablePath = (path?: string): boolean =>
  !!path && !path.startsWith('blob:') && !path.startsWith('data:');

/** True when a library entry can never be streamed and should be purged. */
export const isBrokenVideo = (v: { filePath?: string; localPath?: string }): boolean => {
  const effective = v.localPath || v.filePath;
  return !isStreamablePath(effective);
};

/** Playable URL for the HTML5 <video> preview of a real disk path. */
export const previewUrlForPath = (localPath: string, tauriAssetUrl?: string): string => {
  if (tauriAssetUrl) return tauriAssetUrl;
  return `/api/files/preview?path=${encodeURIComponent(localPath)}`;
};

/** Reads duration/resolution from a playable URL using a detached <video> element. */
const readMediaInfo = (url: string): Promise<{ duration: number; resolution: string }> =>
  new Promise((resolve) => {
    let settled = false;
    const finish = (duration: number, resolution: string) => {
      if (settled) return;
      settled = true;
      el.removeAttribute('src');
      resolve({ duration, resolution });
    };

    const el = document.createElement('video');
    el.preload = 'metadata';
    el.muted = true;
    el.onloadedmetadata = () => {
      const duration = Number.isFinite(el.duration) ? Math.floor(el.duration) : 0;
      const resolution = el.videoWidth && el.videoHeight ? `${el.videoWidth}x${el.videoHeight}` : '';
      finish(duration, resolution);
    };
    el.onerror = () => finish(0, '');
    setTimeout(() => finish(0, ''), 10000);
    el.src = url;
  });

const titleFromPath = (path: string): string => {
  const base = path.split(/[\\/]/).pop() || path;
  return base.replace(/\.[^/.]+$/, '');
};

export interface ImportedFile {
  path: string;
  sizeMb?: number;
  duration?: number;
  resolution?: string;
  fps?: number;
  metadata?: VideoMetadata;
  previewUrl?: string;
}

const toVideoItem = (file: ImportedFile, category: VideoCategory, index: number): VideoItem => ({
  id: `vid-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 6)}`,
  title: titleFromPath(file.path),
  category,
  duration: file.duration && file.duration > 0 ? file.duration : 0,
  resolution: file.resolution || file.metadata?.resolution || 'Unknown',
  sizeMb: file.sizeMb ?? 0,
  thumbnail: DEFAULT_THUMBNAIL,
  filePath: file.previewUrl || previewUrlForPath(file.path),
  localPath: file.path,
  fps: Math.round(file.fps || file.metadata?.fps || 30),
  metadata: file.metadata,
});

export interface ImportResult {
  videos: VideoItem[];
  error?: string;
  cancelled?: boolean;
}

/** Opens a native OS file picker and returns fully-resolved library entries. */
export const pickVideoFiles = async (category: VideoCategory = 'Custom'): Promise<ImportResult> => {
  try {
    const files = isTauriEnvironment() ? await pickViaTauri() : await pickViaDevServer();
    if (files.length === 0) return { videos: [], cancelled: true };
    return { videos: files.map((f, i) => toVideoItem(f, category, i)) };
  } catch (e) {
    return { videos: [], error: String(e) };
  }
};

/** Runs an async mapper over a list with bounded concurrency (keeps 1000-file imports fast). */
const mapWithConcurrency = async <T, R>(
  items: T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> => {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await mapper(items[index], index);
    }
  });

  await Promise.all(workers);
  return results;
};

const probeToImportedFile = async (
  localPath: string,
  previewUrl: string,
  sizeMb?: number
): Promise<ImportedFile> => {
  // ffprobe (via Rust) gives codec/resolution/fps/duration in one shot. Only fall
  // back to a <video> element when ffprobe is unavailable.
  const metadata = (await probeVideoFile(localPath)) || undefined;
  let duration = metadata?.duration ? Math.floor(metadata.duration) : 0;
  let resolution = metadata?.resolution || '';

  if (!duration) {
    const info = await readMediaInfo(previewUrl);
    duration = info.duration;
    resolution = resolution || info.resolution;
  }

  return { path: localPath, sizeMb, duration, resolution, fps: metadata?.fps, metadata, previewUrl };
};

const pickViaTauri = async (): Promise<ImportedFile[]> => {
  const native = (await selectNativeVideoFiles()).filter((f) => isStreamablePath(f.localPath || f.filePath));

  return mapWithConcurrency(native, 8, (f) =>
    probeToImportedFile(f.localPath || f.filePath, f.filePath, f.sizeMb)
  );
};

const pickViaDevServer = async (): Promise<ImportedFile[]> => {
  const res = await fetch('/api/files/pick', { method: 'POST' });
  if (!res.ok) {
    throw new Error(
      `File picker unavailable (HTTP ${res.status}). Start the app with "npm run tauri:dev" or add the path manually.`
    );
  }
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return (data.files || []) as ImportedFile[];
};

/**
 * Resolves videos dropped onto the window.
 * In Tauri the real paths arrive through the webview drag-drop event (see
 * registerNativeFileDrop). In the browser only names/sizes are available, so we
 * ask the dev server to locate the matching files on disk.
 */
export const resolveDroppedFiles = async (
  files: File[],
  category: VideoCategory = 'Custom'
): Promise<ImportResult> => {
  const videoFiles = files.filter((f) => f.type.startsWith('video/') || /\.(mp4|mov|mkv|avi|ts|webm|flv|m4v|wmv)$/i.test(f.name));
  if (videoFiles.length === 0) return { videos: [], error: 'No video files in the drop.' };

  try {
    const res = await fetch('/api/files/locate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        files: videoFiles.map((f) => ({ name: f.name, size: f.size })),
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const resolved: ImportedFile[] = (data.files || []).filter((f: any) => f && f.path);

    const missing = videoFiles.length - resolved.length;
    const result: ImportResult = {
      videos: resolved.map((f, i) => toVideoItem(f, category, i)),
    };
    if (missing > 0) {
      result.error = `${missing} file(s) could not be located on disk. Use "Select Local Video Files" to add them.`;
    }
    return result;
  } catch (e) {
    return {
      videos: [],
      error: `Dropped files could not be resolved to real disk paths (${String(e)}). Use "Select Local Video Files" instead.`,
    };
  }
};

/**
 * Registers the Tauri webview drag & drop handler, which — unlike an HTML drop —
 * hands us real absolute file paths. Returns an unlisten function.
 */
export const registerNativeFileDrop = async (
  onPaths: (paths: string[]) => void
): Promise<(() => void) | null> => {
  if (!isTauriEnvironment()) return null;
  try {
    const { getCurrentWebview } = await import('@tauri-apps/api/webview');
    const unlisten = await getCurrentWebview().onDragDropEvent((event) => {
      if (event.payload.type === 'drop') {
        const paths = (event.payload.paths || []).filter((p) =>
          /\.(mp4|mov|mkv|avi|ts|webm|flv|m4v|wmv)$/i.test(p)
        );
        if (paths.length > 0) onPaths(paths);
      }
    });
    return unlisten;
  } catch (e) {
    console.warn('[VideoImport] Native drag-drop unavailable:', e);
    return null;
  }
};

/** Builds library entries from raw absolute paths (native drop). */
export const importFromPaths = async (
  paths: string[],
  category: VideoCategory = 'Custom'
): Promise<ImportResult> => {
  const usable = paths.filter(isStreamablePath);
  if (usable.length === 0) return { videos: [], error: 'No usable file paths.' };

  const tauri = isTauriEnvironment();
  const convertFileSrc = tauri ? (await import('@tauri-apps/api/core')).convertFileSrc : null;

  const files = await mapWithConcurrency(usable, 8, async (path) => {
    if (convertFileSrc) return probeToImportedFile(path, convertFileSrc(path));
    const info = await readMediaInfo(previewUrlForPath(path));
    return { path, duration: info.duration, resolution: info.resolution } as ImportedFile;
  });

  return { videos: files.map((f, i) => toVideoItem(f, category, i)) };
};
