import { build } from 'esbuild';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const temp = await mkdtemp(join(tmpdir(), 'studio-site-'));
try {
  const bundle = join(temp, 'render.cjs');
  await build({ stdin: { contents: `import React from 'react'; import {renderToString} from 'react-dom/server'; import {MarketingSite} from './src/components/marketing/MarketingSite'; export {SITE_PAGES, SITE_ORIGIN} from './src/components/marketing/sitePages'; export const render=(page,release)=>renderToString(React.createElement(MarketingSite,{initialPage:page,initialRelease:release}));`, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, platform: 'node', format: 'cjs', outfile: bundle, loader: { '.css': 'empty' }, define: { 'process.env.NODE_ENV': '"production"' } });
  const { render, SITE_PAGES, SITE_ORIGIN } = createRequire(import.meta.url)(bundle);
  // Snapshot direct download links for visitors and crawlers, including without JavaScript.
  let data = JSON.parse(await readFile('public/release.json', 'utf8'));
  try {
    const response = await fetch('https://api.github.com/repos/guptaaryan02/LiveStreamStudio-releases/releases/latest', { signal: AbortSignal.timeout(15000), headers: process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {} });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    data = await response.json();
  } catch (error) { console.warn(`Using verified release snapshot (${data.tag_name}); public API unavailable: ${error.message}`); }
  if (!data.tag_name || !Array.isArray(data.assets) || !data.assets.length) throw new Error('Missing public release snapshot');
  const release = { tag_name: data.tag_name, body: data.body || '', assets: data.assets.filter(a => a.browser_download_url.startsWith('https://github.com/guptaaryan02/LiveStreamStudio-releases/releases/download/')).map(({ name, size, digest, browser_download_url }) => ({ name, size, digest, browser_download_url })) };
  const template = await readFile('dist/index.html', 'utf8');
  const escape = s => s.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  const json = value => JSON.stringify(value).replaceAll('<', '\\u003c');
  const image = `${SITE_ORIGIN}/screenshots/livestream-studio-dashboard.png`;
  for (const [page, meta] of Object.entries(SITE_PAGES)) {
    const url = SITE_ORIGIN + meta.path;
    const schema = { '@context': 'https://schema.org', '@graph': [
      { '@type': 'Organization', '@id': SITE_ORIGIN+'/#organization', name: 'B2R', url: 'https://b2r.it.com/', email: 'support@b2r.it.com', logo: SITE_ORIGIN+'/brand/livestream-studio-mark.png' },
      { '@type': 'WebSite', '@id': SITE_ORIGIN+'/#website', url: SITE_ORIGIN+'/', name: 'LiveStream Studio', publisher: { '@id': SITE_ORIGIN+'/#organization' } },
      { '@type': 'WebPage', '@id': url, url, name: meta.title, description: meta.description, isPartOf: { '@id': SITE_ORIGIN+'/#website' } },
      ...(page==='home' ? [{ '@type': 'SoftwareApplication', name: 'LiveStream Studio', applicationCategory: 'MultimediaApplication', operatingSystem: 'macOS, Windows, Linux', softwareVersion: release.tag_name.replace(/^v/,''), url: SITE_ORIGIN+'/', downloadUrl: SITE_ORIGIN+'/download/', screenshot: image, description: meta.description, publisher: { '@id': SITE_ORIGIN+'/#organization' } }] : []),
    ] };
    const social = `<meta name="robots" content="index,follow,max-image-preview:large" />\n<meta property="og:type" content="website" /><meta property="og:site_name" content="LiveStream Studio by B2R" /><meta property="og:title" content="${escape(meta.title)}" /><meta property="og:description" content="${escape(meta.description)}" /><meta property="og:url" content="${url}" /><meta property="og:image" content="${image}" /><meta property="og:image:alt" content="LiveStream Studio desktop app showing a video playlist and broadcast controls" /><meta name="twitter:card" content="summary_large_image" /><meta name="twitter:title" content="${escape(meta.title)}" /><meta name="twitter:description" content="${escape(meta.description)}" /><meta name="twitter:image" content="${image}" />\n<script type="application/ld+json">${json(schema)}</script>`;
    const html = template.replace(/<title>.*?<\/title>/s, `<title>${escape(meta.title)}</title>`).replace(/<meta name="description" content="[^"]*"\s*\/>/, `<meta name="description" content="${escape(meta.description)}" />`).replace(/<link rel="canonical" href="[^"]*"\s*\/>/, `<link rel="canonical" href="${url}" />`).replace('</head>', social+'\n</head>').replace('<div id="root"></div>', `<div id="root">${render(page,release)}</div><script id="site-release" type="application/json">${json(release)}</script>`);
    const folder = 'dist'+(meta.path==='/' ? '' : meta.path);
    await mkdir(folder,{recursive:true});
    await writeFile(join(folder,'index.html'),html);
  }
  await writeFile('dist/robots.txt',`User-agent: *\nAllow: /\n\nSitemap: ${SITE_ORIGIN}/sitemap.xml\n`);
  await writeFile('dist/sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${Object.values(SITE_PAGES).map(meta=>`  <url><loc>${SITE_ORIGIN+meta.path}</loc></url>`).join('\n')}\n</urlset>\n`);
  await writeFile('dist/llms.txt', `# LiveStream Studio by B2R\n\n> Free desktop software for broadcasting pre-recorded video playlists. Runs on the user's computer; not a cloud streaming host or video editor.\n\n## Pages\n${Object.values(SITE_PAGES).map(meta=>`- [${meta.title}](${SITE_ORIGIN+meta.path}): ${meta.description}`).join('\n')}\n\n## Contact\nSupport: support@b2r.it.com\n\nOfficial installer downloads and SHA-256 checksums are linked from the download pages. Computer capacity and upload bandwidth limit simultaneous streams.\n`);
  await writeFile('dist/404.html', `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Page not found | LiveStream Studio</title></head><body><main><h1>Page not found</h1><p>This page is unavailable.</p><a href="/">LiveStream Studio home</a> · <a href="/download/">Downloads</a> · <a href="/support/">Support</a></main></body></html>`);
  console.log(`Rendered ${Object.keys(SITE_PAGES).length} static pages, robots.txt, sitemap.xml and 404.html.`);
} finally { await rm(temp,{recursive:true,force:true}); }
