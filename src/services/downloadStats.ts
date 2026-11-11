/** Counts installer downloads, including repeat downloads; never unique people. */
export interface DownloadStats { total: number; mac: number; windows: number; linux: number }
interface CountedAsset { id: number; name: string; download_count: number; state: string }
interface CountedRelease { draft: boolean; assets: CountedAsset[] }
export function aggregateDownloadStats(releases: CountedRelease[]): DownloadStats {
  const counts: DownloadStats = { total: 0, mac: 0, windows: 0, linux: 0 };
  const seen = new Set<number>();
  for (const release of releases) {
    if (release.draft) continue;
    for (const asset of release.assets || []) {
      if (asset.state !== 'uploaded' || seen.has(asset.id)) continue;
      seen.add(asset.id);
      const platform = /\.dmg$/i.test(asset.name) ? 'mac' : /\.(exe|msi)$/i.test(asset.name) ? 'windows' : /\.(AppImage|deb|rpm)$/i.test(asset.name) ? 'linux' : null;
      if (!platform || !Number.isSafeInteger(asset.download_count) || asset.download_count < 0) continue;
      counts[platform] += asset.download_count;
      counts.total += asset.download_count;
    }
  }
  return counts;
}
let cached: { at: number; promise: Promise<DownloadStats> } | undefined;
export function loadDownloadStats(): Promise<DownloadStats> {
  if (cached && Date.now() - cached.at < 60_000) return cached.promise;
  const promise = (async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const releases: CountedRelease[] = [];
      for (let page = 1; ; page++) {
        const response = await fetch(`https://api.github.com/repos/guptaaryan02/LiveStreamStudio-releases/releases?per_page=100&page=${page}`, { signal: controller.signal });
        if (!response.ok) throw new Error('Download counts unavailable');
        const batch = await response.json();
        if (!Array.isArray(batch)) throw new Error('Invalid release response');
        releases.push(...batch);
        if (batch.length < 100) break;
      }
      return aggregateDownloadStats(releases);
    } finally { clearTimeout(timeout); }
  })();
  cached = { at: Date.now(), promise };
  void promise.catch(() => { if (cached?.promise === promise) cached = undefined; });
  return promise;
}
