// Checks the built site in dist/. Run after build: node check.mjs. Exits 1 on any problem.
import fs from 'node:fs';
import path from 'node:path';
const files = [];
(function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); fs.statSync(p).isDirectory() ? walk(p) : p.endsWith('.html') && files.push(p); } })('dist');
let problems = 0;
const fail = (...a) => { problems++; console.log('PROBLEM', ...a); };
function checkTarget(url, source, currentFile) {
  const [route, fragment] = url.split('#');
  const target = route ? path.join('dist', route, route.endsWith('/') ? 'index.html' : '') : currentFile;
  if (!target || !fs.existsSync(target)) return fail('broken link', source, url);
  if (fragment && !fs.readFileSync(target, 'utf8').includes(`id="${fragment}"`)) fail('broken anchor', source, url);
}
for (const f of files) {
  const h = fs.readFileSync(f, 'utf8');
  for (const m of h.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)) { try { JSON.parse(m[1]); } catch { fail('bad JSON-LD', f); } }
  for (const m of h.matchAll(/(?:href|src)="([/#][^"]*)"/g)) checkTarget(m[1], f, f);
  const ids = [...h.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  if (new Set(ids).size !== ids.length) fail('duplicate HTML ids', f);
  const visible = h.replace(/<script.*?<\/script>/gs, '');
  if (/\{(confirmed|reported|unknown)\}|\*\*|\]\(|^:::/m.test(visible)) fail('raw markup left in page', f);
  if (!/<title>.+<\/title>/.test(h) || !/name="description" content=".{50,}"/.test(h)) fail('missing title or description', f);
  if ((h.match(/<h1/g) || []).length !== 1) fail('page needs exactly one h1', f);
  if (h.includes('Community-sourced</span>') && /Tested on |Tested <time/.test(visible)) fail('community guide carries a tested label', f);
  if (!h.includes('property="og:image"')) fail('missing social image tag', f);
  if (h.includes('Community-sourced</span>') && !h.includes('Not tested by us yet.')) fail('community guide is missing its untested notice', f);
  if (/FIXTURE|zz-fixture|\/\/(www\.)?example\.(com|org|net)/.test(h)) fail('test fixture content in a built page', f);
}
for (const f of ['sitemap.xml', 'robots.txt', 'llms.txt', 'llms-full.txt', 'search.json', 'og.png', 'feed.xml']) if (!fs.existsSync(path.join('dist', f))) fail('missing', f);
if (fs.existsSync('dist/search.json')) {
  for (const result of JSON.parse(fs.readFileSync('dist/search.json', 'utf8'))) {
    if (!result.q || !result.url?.startsWith('/')) fail('bad search record', result);
    else checkTarget(result.url, 'search.json');
  }
}
for (const f of ['search.json', 'llms.txt', 'llms-full.txt', 'sitemap.xml', 'feed.xml']) {
  if (fs.existsSync(path.join('dist', f)) && /FIXTURE|zz-fixture/.test(fs.readFileSync(path.join('dist', f), 'utf8'))) fail('test fixture content in', f);
}
if (fs.existsSync('dist/feed.xml')) {
  const feed = fs.readFileSync('dist/feed.xml', 'utf8');
  for (const m of feed.matchAll(/<entry>.*?<link href="https?:\/\/[^/]+(\/[^"]*)"\/>/g)) checkTarget(m[1], 'feed.xml');
}
if (fs.existsSync('dist/search.json')) {
  for (const result of JSON.parse(fs.readFileSync('dist/search.json', 'utf8'))) {
    if (result.url?.startsWith('/missions/') && result.url !== '/missions/' && !result.url.startsWith('/missions/#') && !(result.label && result.status && result.date)) fail('mission search record lost its tested or untested label', result.url);
  }
}
console.log(`${files.length} pages checked, ${problems} problem(s)`);
process.exit(problems ? 1 : 0);
