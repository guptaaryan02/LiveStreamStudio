import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
const sitemap = await readFile('dist/sitemap.xml','utf8');
const urls = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(m=>m[1]);
assert.equal(urls.length,12);
const titles=new Set(), descriptions=new Set();
for(const url of urls){
  const pathname=new URL(url).pathname;
  assert.ok(!url.includes('#'));
  const html=await readFile(`dist${pathname}index.html`,'utf8');
  assert.equal((html.match(/<h1(?: |>)/g)||[]).length,1,pathname+' needs one H1');
  assert.equal((html.match(/rel="canonical"/g)||[]).length,1);
  assert.ok(html.includes(`rel="canonical" href="${url}"`));
  const title=html.match(/<title>(.*?)<\/title>/s)[1], description=html.match(/name="description" content="([^"]+)"/)[1];
  assert.ok(!titles.has(title)); titles.add(title); assert.ok(!descriptions.has(description)); descriptions.add(description);
  assert.ok(html.includes('property="og:url" content="'+url+'"'));
  assert.ok(html.includes('name="twitter:card" content="summary_large_image"'));
  assert.ok(!html.includes('Launch counter')); assert.ok(!html.includes('starting baseline'));
  assert.ok(!/href="#\//.test(html),'No fragment page routes');
  assert.ok(!html.includes('<div id="root"></div>'),'Page must contain rendered content');
  for(const m of html.matchAll(/<script[^>]+type="application\/(?:ld\+json|json)"[^>]*>(.*?)<\/script>/gs)) JSON.parse(m[1]);
  for(const m of html.matchAll(/(?:href|src)="(\/[^"#?]*)/g)){
    const target=m[1];
    await access('dist'+target+(target.endsWith('/')?'index.html':''));
  }
}
const downloads=await readFile('dist/download/index.html','utf8');
for(const platform of ['macOS','Windows','Linux']) assert.ok(downloads.replace(/<!--.*?-->/g,'').includes('Download for '+platform));
const llms=await readFile('dist/llms.txt','utf8'); for(const url of urls) assert.ok(llms.includes(url));
for(const path of ['free-live-streaming-software','youtube-live-streaming','multistream']) { const html=await readFile(`dist/${path}/index.html`,'utf8'); assert.ok(html.includes('guide-content')); assert.ok(html.replace(/<[^>]*>/g,' ').split(/\s+/).length>300); }
const robots=await readFile('dist/robots.txt','utf8');assert.ok(robots.includes('Allow: /'));assert.ok(robots.includes('Sitemap: https://stream.b2r.it.com/sitemap.xml'));
assert.ok((await readFile('dist/404.html','utf8')).includes('content="noindex"'));
console.log('PASS: 12 rendered pages, canonical/title/description uniqueness, social and structured metadata, crawlable local links/assets, direct downloads, no public counters, robots, sitemap, 404.');
