// Tells Bing and other IndexNow search engines which guides changed in this push.
// Usage after a deploy: BEFORE=<old commit> AFTER=<new commit> node indexnow.mjs
// It submits only what the push actually changed:
//   - a guide whose source file changed, was added or was removed (a removed page is submitted so engines drop it)
//   - the mission hub and the home page when a mission guide was added, removed or changed
//   - the home page when a guide's "updated" date changed, because the home page lists latest updates
//   - changed public clip watch pages and the clip hub/home when their rendered listings change
//   - the clip library when an original video's public card is added, removed or edited
// Unchanged pages are never resubmitted. HTTP 200 or 202 means accepted for processing, not indexed or ranked.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const site = JSON.parse(fs.readFileSync('site.json', 'utf8'));
const { BEFORE = '', AFTER = 'HEAD' } = process.env;
if (!site.indexNowKey) { console.log('IndexNow: no key in site.json, skipped'); process.exit(0); }
if (!/^[0-9a-f]{7,40}$/.test(BEFORE) || /^0+$/.test(BEFORE)) { console.log('IndexNow: no earlier commit to compare with, skipped'); process.exit(0); }
const base = site.baseUrl.replace(/\/$/, '');
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
const catalogFiles = ['data/story-missions.json', 'data/mission-tips.json'];
const clipCatalogFile = 'data/clips.json';
let changed = [];
try { changed = git('diff', '--name-only', BEFORE, AFTER, '--', 'content', ...catalogFiles, clipCatalogFile).trim().split('\n').filter(Boolean); }
catch { console.log('IndexNow: could not compare commits, skipped'); process.exit(0); }
const live = new Set([...fs.readFileSync('dist/sitemap.xml', 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]));
const at = (rev, file) => { try { return git('show', `${rev}:${file}`); } catch { return ''; } };
const field = (text, key) => (text.match(new RegExp(`^${key}:\\s*(.+?)\\s*$`, 'm')) || [])[1] || '';
const wasPublic = (file, text) => Boolean(text) && (!file.startsWith('content/missions/') || ['published', 'community'].includes(field(text, 'status')));
const nativeCard = (text, url, publicPage) => publicPage && field(text, 'videoFile')
  ? JSON.stringify([url, ...['nav', 'videoPoster', 'videoSeconds', 'videoCreator'].map((key) => field(text, key))]) : '';
const urls = new Set();
if (catalogFiles.some((file) => changed.includes(file)) && live.has(`${base}/missions/`)) urls.add(`${base}/missions/`);
for (const file of changed.filter((name) => name.endsWith('.md'))) {
  const before = at(BEFORE, file);
  const after = at(AFTER, file);
  const mission = file.startsWith('content/missions/');
  const nowUrl = field(after, 'slug') ? `${base}/${field(after, 'slug')}/` : '';
  const oldUrl = field(before, 'slug') ? `${base}/${field(before, 'slug')}/` : '';
  const nowPublic = live.has(nowUrl);
  const oldPublic = wasPublic(file, before);
  if (nowPublic) urls.add(nowUrl);
  if (oldPublic && oldUrl && !live.has(oldUrl)) urls.add(oldUrl); // removed or unpublished page
  if (mission && (nowPublic || oldPublic)) { urls.add(`${base}/missions/`); urls.add(`${base}/`); }
  if (!mission && nowPublic && field(before, 'updated') !== field(after, 'updated')) urls.add(`${base}/`);
  if (!mission && live.has(`${base}/clips/`) && nativeCard(before, oldUrl, oldPublic) !== nativeCard(after, nowUrl, nowPublic)) urls.add(`${base}/clips/`);
}
if (changed.includes(clipCatalogFile)) {
  const { clipUrl, clipFeature, clipCollection, clipRail, clipWatch, clipSchema } = await import('./clips.mjs');
  const readCatalog = (rev) => {
    const raw = at(rev, clipCatalogFile);
    if (!raw) return [];
    const entries = JSON.parse(raw);
    if (!Array.isArray(entries)) throw new Error('IndexNow: clip catalog must be an array');
    return entries;
  };
  // The previous sitemap is not retained. Use the earlier commit's build day conservatively:
  // a future-dated record was not yet public then and must not be submitted as a removed page.
  const beforeTime = Date.parse(git('show', '-s', '--format=%cI', BEFORE).trim());
  const beforeDay = Number.isFinite(beforeTime) ? new Date(beforeTime + 14 * 36e5).toISOString().slice(0, 10) : '';
  const beforeClips = readCatalog(BEFORE).filter((c) => c.added <= beforeDay && c.uploaded?.slice(0, 10) <= beforeDay);
  const afterClips = readCatalog(AFTER).filter((c) => live.has(base + clipUrl(c)));
  const prior = new Map(beforeClips.map((c) => [clipUrl(c), c]));
  const current = new Map(afterClips.map((c) => [clipUrl(c), c]));
  const signature = (c, list) => clipWatch(c, list) + JSON.stringify(clipSchema(c, base)) + JSON.stringify([c.added, c.thumbWidth, c.thumbHeight]);
  for (const [route, clip] of current) {
    if (!prior.has(route) || signature(clip, afterClips) !== signature(prior.get(route), beforeClips)) urls.add(base + route);
  }
  for (const route of prior.keys()) if (!current.has(route) && !live.has(base + route)) urls.add(base + route);
  const hub = (list) => list.length ? clipFeature(list[0]) + clipCollection(list) : '';
  const home = (list) => (list.length ? clipFeature(list[0]) : '') + (list.length > 1 ? clipRail(list) : '');
  if (live.has(base + '/clips/') && hub(beforeClips) !== hub(afterClips)) urls.add(base + '/clips/');
  if (live.has(base + '/') && home(beforeClips) !== home(afterClips)) urls.add(base + '/');
}
const urlList = [...urls];
if (!urlList.length) { console.log('IndexNow: no published guide changed in this push, nothing submitted'); process.exit(0); }
if (process.env.DRY_RUN) { console.log(`IndexNow dry run: would submit ${urlList.length} URL(s)\n${urlList.join('\n')}`); process.exit(0); }
let status = 0;
try {
  const res = await fetch(process.env.INDEXNOW_ENDPOINT || 'https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host: new URL(base).host, key: site.indexNowKey, keyLocation: `${base}/${site.indexNowKey}.txt`, urlList }),
    signal: AbortSignal.timeout(15000),
  });
  status = res.status;
} catch (error) {
  console.log(`IndexNow: FAILED, request did not complete (${error.name}). ${urlList.length} URL(s) were not submitted`);
  process.exit(1);
}
if (status === 200 || status === 202) {
  console.log(`IndexNow: ${urlList.length} changed URL(s) accepted for processing (status ${status}). This is not proof of indexing`);
} else {
  console.log(`IndexNow: FAILED with status ${status}. ${urlList.length} URL(s) were not accepted`);
  process.exit(1);
}
