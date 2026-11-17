// Tells Bing and other IndexNow search engines which guides changed in this push.
// Usage after a deploy: BEFORE=<old commit> AFTER=<new commit> node indexnow.mjs
// It submits only pages whose source file changed between the two commits. Unchanged pages are never resubmitted.
// A 200 or 202 answer means the submission was accepted. It does not mean a page is indexed or ranked.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const site = JSON.parse(fs.readFileSync('site.json', 'utf8'));
const { BEFORE = '', AFTER = 'HEAD' } = process.env;
if (!site.indexNowKey) { console.log('IndexNow: no key in site.json, skipped'); process.exit(0); }
if (!/^[0-9a-f]{7,40}$/.test(BEFORE) || /^0+$/.test(BEFORE)) { console.log('IndexNow: no earlier commit to compare with, skipped'); process.exit(0); }
const base = site.baseUrl.replace(/\/$/, '');
let changed = [];
try { changed = execFileSync('git', ['diff', '--name-only', BEFORE, AFTER, '--', 'content'], { encoding: 'utf8' }).split('\n').filter((f) => f.endsWith('.md')); }
catch { console.log('IndexNow: could not compare commits, skipped'); process.exit(0); }
const live = new Set([...fs.readFileSync('dist/sitemap.xml', 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]));
const urlList = [...new Set(changed.filter((f) => fs.existsSync(f)).map((f) => {
  const slug = (fs.readFileSync(f, 'utf8').match(/^slug:\s*(\S+)\s*$/m) || [])[1];
  return slug ? `${base}/${slug}/` : '';
}).filter((url) => live.has(url)))];
if (!urlList.length) { console.log('IndexNow: no published guide changed in this push, nothing submitted'); process.exit(0); }
if (process.env.DRY_RUN) { console.log(`IndexNow dry run: would submit ${urlList.length} URL(s)\n${urlList.join('\n')}`); process.exit(0); }
const res = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ host: new URL(base).host, key: site.indexNowKey, keyLocation: `${base}/${site.indexNowKey}.txt`, urlList }),
  signal: AbortSignal.timeout(15000),
});
console.log(`IndexNow: submitted ${urlList.length} changed URL(s), status ${res.status} (accepted for processing only)`);
