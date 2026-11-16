// Checks the built site in dist/. Run after build: node check.mjs. Exits 1 on any problem.
import fs from 'node:fs';
import path from 'node:path';
const files = [];
(function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); fs.statSync(p).isDirectory() ? walk(p) : p.endsWith('.html') && files.push(p); } })('dist');
let problems = 0;
const fail = (...a) => { problems++; console.log('PROBLEM', ...a); };
for (const f of files) {
  const h = fs.readFileSync(f, 'utf8');
  for (const m of h.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)) { try { JSON.parse(m[1]); } catch { fail('bad JSON-LD', f); } }
  for (const m of h.matchAll(/href="(\/[^"#]*)(#[^"]*)?"/g)) {
    const t = path.join('dist', m[1], m[1].endsWith('/') ? 'index.html' : '');
    if (!fs.existsSync(t)) { fail('broken link', f, m[1]); continue; }
    if (m[2] && m[2].length > 1 && !fs.readFileSync(t, 'utf8').includes(`id="${m[2].slice(1)}"`)) fail('broken anchor', f, m[1] + m[2]);
  }
  const visible = h.replace(/<script.*?<\/script>/gs, '');
  if (/\{(confirmed|reported|unknown)\}|\*\*|\]\(|^:::/m.test(visible)) fail('raw markup left in page', f);
  if (!/<title>.+<\/title>/.test(h) || !/name="description" content=".{50,}"/.test(h)) fail('missing title or description', f);
  if ((h.match(/<h1/g) || []).length !== 1) fail('page needs exactly one h1', f);
}
for (const f of ['sitemap.xml', 'robots.txt', 'llms.txt', 'llms-full.txt', 'search.json']) if (!fs.existsSync(path.join('dist', f))) fail('missing', f);
console.log(`${files.length} pages checked, ${problems} problem(s)`);
process.exit(problems ? 1 : 0);
