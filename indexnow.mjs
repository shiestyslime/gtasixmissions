// Tells Bing and other IndexNow search engines which pages changed. Run after a deploy: node indexnow.mjs
// It reads dist/sitemap.xml and submits the home page plus pages changed in the last two days.
import fs from 'node:fs';
const site = JSON.parse(fs.readFileSync('site.json', 'utf8'));
if (!site.indexNowKey) { console.log('IndexNow: no key in site.json, skipped'); process.exit(0); }
const base = site.baseUrl.replace(/\/$/, '');
const cutoff = new Date(Date.now() - 2 * 864e5).toISOString().slice(0, 10);
const entries = [...fs.readFileSync('dist/sitemap.xml', 'utf8').matchAll(/<loc>([^<]+)<\/loc><lastmod>([^<]+)<\/lastmod>/g)];
const urlList = [...new Set([base + '/', ...entries.filter(([, , mod]) => mod >= cutoff).map(([, loc]) => loc)])];
const res = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ host: new URL(base).host, key: site.indexNowKey, keyLocation: `${base}/${site.indexNowKey}.txt`, urlList }),
  signal: AbortSignal.timeout(15000),
});
console.log(`IndexNow: submitted ${urlList.length} URL(s), status ${res.status}`);
