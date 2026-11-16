// Zero-dependency static site builder. Run: node build.mjs
// Reads site.json + content/*.md, writes the finished site to dist/.
// Env: BUILD_DATE=2026-11-20 (pretend it is that day), NO_FETCH=1 (skip the news fetch).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(ROOT, 'dist');
const site = JSON.parse(fs.readFileSync(path.join(ROOT, 'site.json'), 'utf8'));
const BASE = site.baseUrl.replace(/\/$/, '');
const NOW = process.env.BUILD_DATE ? new Date(process.env.BUILD_DATE + 'T12:00:00') : new Date();
const LAUNCHED = NOW >= new Date(site.launchDate);

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const unent = (s) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;|&#8217;|&#x2019;/g, "'").replace(/&#8216;/g, "'").replace(/&#822[01];/g, '"').replace(/&#8211;/g, '-').replace(/&amp;/g, '&');
const stripTags = (h) => unent(h.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
const TAGS = { confirmed: 'Confirmed', reported: 'Reported', unknown: 'Not yet known' };

// ---------- tiny markdown ----------
function link(text, url) {
  if (url.startsWith('aff:')) {
    const a = site.affiliates[url.slice(4)];
    if (!a) throw new Error(`Unknown affiliate key: ${url}`);
    return a.affiliateUrl
      ? `<a href="${esc(a.affiliateUrl)}" rel="sponsored nofollow noopener">${text}</a>`
      : `<a href="${esc(a.url)}" rel="noopener">${text}</a>`;
  }
  return /^https?:/.test(url) ? `<a href="${esc(url)}" rel="noopener">${text}</a>` : `<a href="${esc(url)}">${text}</a>`;
}
function inline(s) {
  return esc(s)
    .replace(/\{(confirmed|reported|unknown)\}/g, (_, t) => `<span class="tag tag-${t}">${TAGS[t]}</span>`)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, t, u) => link(t, u));
}
function md(src) {
  const lines = src.split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) { i++; continue; }
    let m;
    if ((m = l.match(/^(#{2,3}) (.+)/))) {
      const tag = m[1].length === 2 ? 'h2' : 'h3';
      out.push(`<${tag} id="${slugify(m[2])}">${inline(m[2])}</${tag}>`); i++;
    } else if (/^[-*] /.test(l) || /^\d+\. /.test(l)) {
      const ordered = /^\d+\. /.test(l);
      const re = ordered ? /^\d+\. / : /^[-*] /;
      const items = [];
      while (i < lines.length && re.test(lines[i])) items.push(`<li>${inline(lines[i++].replace(re, ''))}</li>`);
      out.push(`<${ordered ? 'ol' : 'ul'}>${items.join('')}</${ordered ? 'ol' : 'ul'}>`);
    } else if (l.startsWith('|')) {
      const rows = [];
      while (i < lines.length && lines[i].startsWith('|')) rows.push(lines[i++].trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()));
      const [head, , ...body] = rows;
      out.push(`<div class="table-wrap"><table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
    } else if (l.startsWith('> ')) {
      const buf = [];
      while (i < lines.length && lines[i].startsWith('> ')) buf.push(lines[i++].slice(2));
      out.push(`<aside class="note">${inline(buf.join(' '))}</aside>`);
    } else {
      const buf = [];
      while (i < lines.length && lines[i].trim() && !/^(#{2,3} |[-*] |\d+\. |\||> )/.test(lines[i])) buf.push(lines[i++]);
      out.push(`<p>${inline(buf.join(' '))}</p>`);
    }
  }
  return out.join('\n');
}
// "::: prelaunch" / "::: postlaunch" blocks: only one side is kept, chosen by today's date.
const phase = (src) => src.replace(/^::: (prelaunch|postlaunch)\n([\s\S]*?)\n:::$/gm, (_, k, body) => ((k === 'postlaunch') === LAUNCHED ? body : ''));

// ---------- load content ----------
function loadPage(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) throw new Error(`Missing front matter: ${file}`);
  const meta = {};
  for (const line of m[1].split('\n')) {
    const k = line.indexOf(':');
    if (k > 0) meta[line.slice(0, k).trim()] = line.slice(k + 1).trim();
  }
  for (const req of ['title', 'slug', 'description', 'answer', 'updated']) if (!meta[req]) throw new Error(`${file}: missing "${req}"`);
  if (LAUNCHED && meta.answer_postlaunch) meta.answer = meta.answer_postlaunch;
  let body = phase(m[2]);
  const cut = (heading) => {
    const idx = body.search(new RegExp(`^## ${heading}\\s*$`, 'm'));
    if (idx < 0) return '';
    const part = body.slice(idx).replace(/^## .*\n/, '');
    body = body.slice(0, idx);
    return part;
  };
  const sources = cut('Sources');
  const faq = cut('FAQ').split(/^### /m).slice(1).map((chunk) => {
    const [q, ...rest] = chunk.split('\n');
    const html = md(rest.join('\n'));
    return { q: q.trim(), html, text: stripTags(html) };
  });
  const html = md(body);
  const toc = [...html.matchAll(/<h2 id="([^"]+)">(.*?)<\/h2>/g)].map((x) => ({ id: x[1], text: stripTags(x[2]) }));
  return { ...meta, order: Number(meta.order || 99), html, toc, faq, sourcesHtml: sources ? md(sources) : '', plain: stripTags(html), url: `/${meta.slug}/` };
}
const pages = fs.readdirSync(path.join(ROOT, 'content')).filter((f) => f.endsWith('.md'))
  .map((f) => loadPage(path.join(ROOT, 'content', f))).sort((a, b) => a.order - b.order);
const guides = pages.filter((p) => p.nav);

// ---------- news (headlines from publisher RSS feeds, cached in data/news.json) ----------
async function loadNews() {
  const cache = path.join(ROOT, 'data', 'news.json');
  let items = fs.existsSync(cache) ? JSON.parse(fs.readFileSync(cache, 'utf8')) : [];
  if (process.env.NO_FETCH || !site.news?.feeds?.length) return items;
  const match = new RegExp(site.news.match, 'i');
  const results = await Promise.allSettled(site.news.feeds.map(async (f) => {
    const res = await fetch(f.url, { signal: AbortSignal.timeout(10000), headers: { 'user-agent': 'Mozilla/5.0 (compatible; static-site-builder)' } });
    if (!res.ok) throw new Error(`${f.name}: HTTP ${res.status}`);
    const xml = await res.text();
    return [...xml.matchAll(/<(item|entry)[\s>]([\s\S]*?)<\/\1>/g)].map((x) => {
      const b = x[2];
      const get = (t) => unent((b.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`)) || [])[1] || '').trim();
      const href = (b.match(/<link[^>]*href="([^"]+)"/) || [])[1];
      const d = new Date(get('pubDate') || get('published') || get('updated'));
      return { title: stripTags(get('title')), link: unent(href || get('link')), source: f.name, date: isNaN(d) ? null : d.toISOString() };
    }).filter((n) => n.date && /^https?:\/\//.test(n.link) && match.test(n.title));
  }));
  const fresh = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
  const failed = results.filter((r) => r.status === 'rejected').map((r) => r.reason.message);
  if (failed.length) console.warn(`News: ${failed.length} feed(s) failed (${failed.join('; ')})`);
  if (fresh.length) {
    const seen = new Set();
    items = [...fresh, ...items].filter((n) => !seen.has(n.link) && seen.add(n.link)).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 40);
    fs.mkdirSync(path.dirname(cache), { recursive: true });
    fs.writeFileSync(cache, JSON.stringify(items, null, 1));
  }
  return items;
}
const news = await loadNews();
const nav = [...guides.map((p) => ({ label: p.nav, url: p.url })), ...(news.length ? [{ label: 'News', url: '/news/' }] : [])];

// ---------- art and icons (all original, no game assets) ----------
const ICONS = {
  'release-date': '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  'editions-price': '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.5"/>',
  'map-locations': '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/>',
  characters: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.5-4 3-6 6.5-6s6 2 6.5 6"/><circle cx="17.5" cy="9" r="2.5"/><path d="M17 14c2.5 0 4.2 1.6 4.6 4.5"/>',
  missions: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  'money-making': '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M6 10v4M18 10v4"/>',
  progression: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  'beginners-guide': '<path d="M4 5a2 2 0 0 1 2-2h14v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5M9 8h7"/>',
  reviews: '<path d="M12 3l2.7 5.6 6.1.8-4.5 4.3 1.1 6.1L12 16.9 6.6 19.8l1.1-6.1L3.2 9.4l6.1-.8z"/>',
  news: '<path d="M4 5h13v14H6a2 2 0 0 1-2-2z"/><path d="M17 9h3v8a2 2 0 0 1-2 2M8 9h5M8 13h5"/>',
};
const icon = (k) => `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[k] || ICONS.news}</svg>`;

function scene() {
  let seed = 7;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  let x = -10, sky = '', win = '';
  while (x < 1210) {
    const w = 26 + rnd() * 46, h = 30 + rnd() * rnd() * 170;
    sky += `<rect x="${x.toFixed(0)}" y="${(330 - h).toFixed(0)}" width="${w.toFixed(0)}" height="${h.toFixed(0)}"/>`;
    for (let wy = 330 - h + 8; wy < 322; wy += 11) for (let wx = x + 5; wx < x + w - 7; wx += 9) if (rnd() < 0.22) win += `<rect x="${wx.toFixed(0)}" y="${wy.toFixed(0)}" width="3" height="4"/>`;
    x += w + rnd() * 5;
  }
  const palm = (px, py, h, lean, s = 1) => {
    const tx = px + lean, ty = py - h;
    let d = `<path d="M${px} ${py} Q${px + lean * 0.2} ${py - h * 0.6} ${tx} ${ty}" stroke-width="${9 * s}"/>`;
    for (const a of [-175, -150, -120, -90, -60, -30, -5]) {
      const r = (a * Math.PI) / 180, L = 78 * s;
      d += `<path d="M${tx} ${ty} Q${(tx + Math.cos(r) * L * 0.55).toFixed(0)} ${(ty + Math.sin(r) * L * 0.55 - 22 * s).toFixed(0)} ${(tx + Math.cos(r) * L).toFixed(0)} ${(ty + Math.sin(r) * L * 0.5 + 30 * s).toFixed(0)}" stroke-width="${6 * s}"/>`;
    }
    return d;
  };
  const stripes = [266, 284, 300, 313, 323].map((y, i) => `<rect x="440" y="${y}" width="320" height="${4 + i * 2.2}" fill="#000"/>`).join('');
  const ripples = [344, 356, 370, 386, 404].map((y, i) => `<rect x="${520 - i * 26}" y="${y}" width="${160 + i * 52}" height="${2 + i}" rx="2" opacity="${0.55 - i * 0.08}"/>`).join('');
  return `<svg class="scene" viewBox="0 0 1200 420" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
<defs><linearGradient id="sun" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe27a"/><stop offset=".55" stop-color="#ff8a3d"/><stop offset="1" stop-color="#ff3d9a"/></linearGradient>
<linearGradient id="sea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7a1f7d"/><stop offset="1" stop-color="#150a2c"/></linearGradient>
<radialGradient id="glow"><stop offset="0" stop-color="#ffb35c" stop-opacity=".55"/><stop offset="1" stop-color="#ffb35c" stop-opacity="0"/></radialGradient>
<mask id="cut"><rect width="1200" height="420" fill="#fff"/>${stripes}</mask></defs>
<circle cx="600" cy="270" r="330" fill="url(#glow)"/>
<circle cx="600" cy="266" r="92" fill="url(#sun)" mask="url(#cut)"/>
<g fill="#1a0a33">${sky}</g><g fill="#ffd98a" opacity=".75">${win}</g>
<rect y="330" width="1200" height="90" fill="url(#sea)"/><g fill="#ff7ab8">${ripples}</g>
<g fill="none" stroke="#0d0620" stroke-linecap="round">${palm(70, 430, 250, 34)}${palm(165, 430, 180, -20, 0.8)}${palm(1125, 430, 265, -38)}${palm(1035, 430, 170, 22, 0.75)}</g>
</svg>`;
}

// ---------- templates ----------
const ld = (obj) => `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, '\\u003c')}</script>`;
function adSlot(name) {
  if (site.adsenseClient) return `<div class="ad"><ins class="adsbygoogle" style="display:block" data-ad-client="${esc(site.adsenseClient)}" data-ad-format="auto" data-full-width-responsive="true"></ins><script>(adsbygoogle=window.adsbygoogle||[]).push({});</script></div>`;
  return site.adPlaceholders ? `<div class="ad ad-placeholder" aria-hidden="true">Ad slot: ${esc(name)}</div>` : '';
}
function layout({ title, description, url, body, jsonld = [], ogType = 'article', scripts = '' }) {
  const canonical = BASE + url;
  return `<!doctype html>
<html lang="${site.language}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${canonical}">
<meta property="og:type" content="${ogType}">
<meta property="og:site_name" content="${esc(site.name)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${canonical}">
<meta name="twitter:card" content="summary">
<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large">
<meta name="theme-color" content="#170b30">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,800&display=swap">
<link rel="stylesheet" href="/style.css">
${site.adsenseClient ? `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${esc(site.adsenseClient)}" crossorigin="anonymous"></script>` : ''}
${jsonld.map(ld).join('\n')}
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="site-header">
  <div class="wrap bar">
    <a class="brand" href="/"><span class="brand-mark" aria-hidden="true"></span>${esc(site.name)}</a>
    <nav aria-label="Main"><ul>${nav.map((n) => `<li><a href="${n.url}"${n.url === url ? ' aria-current="page"' : ''}>${esc(n.label)}</a></li>`).join('')}</ul></nav>
  </div>
</header>
<main id="main">
${body}
</main>
<footer class="site-footer">
  <div class="wrap foot">
    <div><a class="brand" href="/"><span class="brand-mark" aria-hidden="true"></span>${esc(site.name)}</a>
    <p>An unofficial fan site. Not affiliated with, endorsed by, or sponsored by Rockstar Games or Take-Two Interactive. Grand Theft Auto and related names are trademarks of their owners.</p></div>
    <ul>${nav.map((n) => `<li><a href="${n.url}">${esc(n.label)}</a></li>`).join('')}</ul>
    <ul><li><a href="/about/">About and sources</a></li><li><a href="/about/#advertising-and-affiliate-disclosure">Ad and affiliate disclosure</a></li><li><a href="/privacy/">Privacy</a></li><li><a href="/sitemap.xml">Sitemap</a></li></ul>
  </div>
</footer>
${scripts}
</body>
</html>`;
}
const org = { '@type': 'Organization', name: site.name, url: BASE + '/' };
const fmtDate = (d) => new Date(d.length === 10 ? d + 'T12:00:00Z' : d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
const card = (p) => `<a class="card" href="${p.url}"><span class="card-icon">${icon(p.slug)}</span><h3>${esc(p.nav || p.title)}</h3><p>${esc(p.description)}</p><span class="card-go" aria-hidden="true">Read guide →</span></a>`;
const newsList = (items) => `<ul class="news">${items.map((n) => `<li><a href="${esc(n.link)}" rel="nofollow noopener">${esc(n.title)}</a><span>${esc(n.source)} · <time datetime="${n.date}">${fmtDate(n.date)}</time></span></li>`).join('')}</ul>`;
const pageHero = (crumb, h1, meta) => `<div class="page-hero"><div class="wrap"><nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> <span aria-hidden="true">/</span> ${esc(crumb)}</nav><h1>${esc(h1)}</h1>${meta}</div></div>`;

function renderPage(p) {
  const related = guides.filter((x) => x.slug !== p.slug).slice(0, 3);
  const faqHtml = p.faq.length ? `<section class="faq"><h2 id="faq">Frequently asked questions</h2>${p.faq.map((f) => `<details><summary>${esc(f.q)}</summary>${f.html}</details>`).join('')}</section>` : '';
  // The first ad goes after the first section so the answer always comes first.
  const second = p.html.indexOf('<h2', p.html.indexOf('<h2') + 1);
  const content = second > 0 ? p.html.slice(0, second) + adSlot('in-article') + p.html.slice(second) : p.html;
  const toc = p.toc.length > 2 ? `<nav class="toc" aria-label="On this page"><strong>On this page</strong><ul>${p.toc.map((t) => `<li><a href="#${t.id}">${esc(t.text)}</a></li>`).join('')}${p.faq.length ? '<li><a href="#faq">FAQ</a></li>' : ''}</ul></nav>` : '';
  const body = `${pageHero(p.nav || p.title, p.h1 || p.title, `<p class="meta"><span class="pill">${LAUNCHED ? 'Game is out' : 'Pre-launch info'}</span> Updated <time datetime="${p.updated}">${fmtDate(p.updated)}</time> · <a href="/about/#how-we-label-facts">How we label facts</a></p>`)}
<div class="wrap article-grid">
<article>
<div class="answer"><span class="answer-label">Quick answer</span><p>${inline(p.answer)}</p></div>
${content}
${adSlot('before-faq')}
${faqHtml}
${p.sourcesHtml ? `<section class="sources"><h2 id="sources">Sources</h2>${p.sourcesHtml}</section>` : ''}
</article>
<aside class="side">${toc}<div class="legend"><strong>Fact labels</strong><p><span class="tag tag-confirmed">Confirmed</span> Official Rockstar source</p><p><span class="tag tag-reported">Reported</span> Press previews</p><p><span class="tag tag-unknown">Not yet known</span> Not announced</p></div></aside>
</div>
<section class="wrap related"><h2>Keep reading</h2><div class="cards">${related.map(card).join('')}</div></section>`;
  const jsonld = [
    { '@context': 'https://schema.org', '@type': 'Article', headline: p.h1 || p.title, description: p.description, dateModified: p.updated, datePublished: p.published || p.updated, mainEntityOfPage: BASE + p.url, author: org, publisher: org, about: { '@type': 'VideoGame', name: 'Grand Theft Auto VI' } },
    { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Home', item: BASE + '/' }, { '@type': 'ListItem', position: 2, name: p.nav || p.title, item: BASE + p.url }] },
  ];
  if (p.faq.length) jsonld.push({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: p.faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.text } })) });
  const full = `${p.title} | ${site.name}`;
  return layout({ title: full.length <= 65 ? full : p.title, description: p.description, url: p.url, body, jsonld });
}

function renderHome() {
  const topFaq = pages.flatMap((p) => p.faq.slice(0, 1).map((f) => ({ ...f, url: p.url }))).slice(0, 8);
  const body = `<section class="hero">
${scene()}
<div class="wrap hero-inner">
<p class="eyebrow">Unofficial GTA 6 guide</p>
<h1>Straight answers for <span>Grand Theft Auto VI</span></h1>
<p class="lede">Missions, map, money and progression. Every fact is labeled and sourced. No leaks sold as facts.</p>
<div class="countdown" id="countdown" data-launch="${site.launchDate}">
  <p class="cd-label" id="cd-label">${LAUNCHED ? 'Out now on PS5 and Xbox Series X|S' : 'Launches November 19, 2026 · PS5 and Xbox Series X|S'}</p>
  <div class="cd-tiles" id="cd-tiles"${LAUNCHED ? ' hidden' : ''}>${['Days', 'Hours', 'Min', 'Sec'].map((u) => `<div><b data-u="${u}">--</b><span>${u}</span></div>`).join('')}</div>
</div>
<div class="hero-cta"><a class="btn" href="/beginners-guide/">Start here</a><a class="btn btn-ghost" href="/money-making/">How money works</a></div>
</div>
</section>
<section class="facts"><div class="wrap facts-row">${site.keyFacts.map((f) => `<a href="${f.url}"><span>${esc(f.label)}</span><b>${esc(f.value)}</b></a>`).join('')}</div></section>
<div class="wrap">
<section class="search"><label for="q">Find an answer</label><input id="q" type="search" placeholder="Try: fence, wanted stars, file size, PC" autocomplete="off"><ul id="results" class="results" hidden></ul></section>
<section><h2>Guides</h2><div class="cards">${guides.map(card).join('')}</div></section>
<section><h2>Explore Leonida</h2><div class="regions">${site.regions.map((r, i) => `<a class="region r${i + 1}" href="/map-locations/#${slugify(r.name)}"><b>${esc(r.name)}</b><span>${esc(r.blurb)}</span></a>`).join('')}</div></section>
${adSlot('home')}
${news.length ? `<section><div class="sec-head"><h2>Latest GTA 6 headlines</h2><a href="/news/">All news →</a></div>${newsList(news.slice(0, 5))}</section>` : ''}
<section class="faq"><h2>Top questions</h2>${topFaq.map((f) => `<details><summary>${esc(f.q)}</summary>${f.html}<p><a href="${f.url}">Read the full guide →</a></p></details>`).join('')}</section>
</div>`;
  const scripts = `<script>
(function(){var el=document.getElementById('countdown'),tiles=document.getElementById('cd-tiles'),label=document.getElementById('cd-label');
function tick(){var ms=new Date(el.dataset.launch)-new Date();
if(ms<=0){tiles.hidden=true;label.textContent='Out now on PS5 and Xbox Series X|S';return;}
var v={Days:Math.floor(ms/864e5),Hours:Math.floor(ms/36e5)%24,Min:Math.floor(ms/6e4)%60,Sec:Math.floor(ms/1e3)%60};
tiles.querySelectorAll('b').forEach(function(b){b.textContent=String(v[b.dataset.u]).padStart(2,'0');});setTimeout(tick,1000);}tick();
var q=document.getElementById('q'),out=document.getElementById('results'),idx=null;
function show(){var t=q.value.trim().toLowerCase();if(t.length<2||!idx){out.hidden=true;return;}
var words=t.split(/\\s+/),hits=idx.filter(function(e){var s=(e.q+' '+e.a).toLowerCase();return words.every(function(w){return s.indexOf(w)>-1;});}).slice(0,6);
out.innerHTML='';hits.forEach(function(e){var li=document.createElement('li'),a=document.createElement('a'),p=document.createElement('p');a.href=e.url;a.textContent=e.q;p.textContent=e.a;li.appendChild(a);li.appendChild(p);out.appendChild(li);});
if(!hits.length){var li=document.createElement('li');li.textContent='No answer yet. Try another word.';out.appendChild(li);}out.hidden=false;}
q.addEventListener('focus',function(){if(!idx)fetch('/search.json').then(function(r){return r.json();}).then(function(d){idx=d;show();});});
q.addEventListener('input',show);})();
</script>`;
  const jsonld = [
    { '@context': 'https://schema.org', '@type': 'WebSite', name: site.name, url: BASE + '/', description: site.description, publisher: org },
    { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: topFaq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.text } })) },
  ];
  return layout({ title: `${site.name}: ${site.tagline}`, description: site.description, url: '/', body, jsonld, ogType: 'website', scripts });
}

function renderNews() {
  const body = `${pageHero('News', 'Latest GTA 6 News Headlines', `<p class="meta"><span class="pill">Auto-updated</span> Refreshed <time datetime="${NOW.toISOString()}">${fmtDate(NOW.toISOString())}</time></p>`)}
<div class="wrap narrow"><p>Headlines about GTA 6 from established gaming outlets. Each link opens the original article on the publisher's site. This list refreshes each time the site rebuilds.</p>
${newsList(news)}${adSlot('news')}</div>`;
  return layout({ title: `Latest GTA 6 News Headlines | ${site.name}`, description: 'The latest GTA 6 news headlines from established gaming outlets, refreshed daily, with links to the original articles.', url: '/news/', body, ogType: 'website' });
}

// ---------- write ----------
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const write = (rel, data) => { const f = path.join(OUT, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, data); };

write('index.html', renderHome());
for (const p of pages) write(`${p.slug}/index.html`, renderPage(p));
if (news.length) write('news/index.html', renderNews());
write('404.html', layout({ title: `Page not found | ${site.name}`, description: 'This page does not exist. Use the links below to find a GTA 6 guide.', url: '/404.html', body: `${pageHero('Not found', 'Page not found', '')}<div class="wrap"><p>Try one of these guides.</p><div class="cards">${guides.map(card).join('')}</div></div>` }).replace('index, follow', 'noindex'));
for (const f of fs.readdirSync(path.join(ROOT, 'assets'))) fs.copyFileSync(path.join(ROOT, 'assets', f), path.join(OUT, f));
write('search.json', JSON.stringify([
  ...guides.map((p) => ({ q: p.title, a: stripTags(inline(p.answer)), url: p.url })),
  ...pages.flatMap((p) => p.faq.map((f) => ({ q: f.q, a: f.text.slice(0, 220), url: p.url + '#faq' }))),
]));

const latest = pages.map((p) => p.updated).sort().pop();
const today = NOW.toISOString().slice(0, 10);
write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<url><loc>${BASE}/</loc><lastmod>${latest}</lastmod></url>
${pages.map((p) => `<url><loc>${BASE}${p.url}</loc><lastmod>${p.updated}</lastmod></url>`).join('\n')}
${news.length ? `<url><loc>${BASE}/news/</loc><lastmod>${today}</lastmod></url>` : ''}
</urlset>
`);
// Search and AI crawlers are explicitly welcome.
const bots = ['Googlebot', 'Bingbot', 'GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-SearchBot', 'Claude-User', 'PerplexityBot', 'Perplexity-User', 'Google-Extended', 'Applebot-Extended', 'CCBot'];
write('robots.txt', `User-agent: *\nAllow: /\n\n${bots.map((b) => `User-agent: ${b}\nAllow: /\n`).join('\n')}\nSitemap: ${BASE}/sitemap.xml\n`);
const plainAnswer = (p) => stripTags(inline(p.answer)).replace(/^(Confirmed|Reported|Not yet known) /, '');
write('llms.txt', `# ${site.name}

> ${site.description} Facts are labeled Confirmed (official Rockstar source), Reported (press previews or reliable outlets) or Not yet known. Game status: ${LAUNCHED ? 'released' : 'not yet released'}. Last updated ${latest}.

## Guides

${guides.map((p) => `- [${p.title}](${BASE}${p.url}): ${plainAnswer(p)}`).join('\n')}

## Optional

- [Full text of all guides](${BASE}/llms-full.txt)
- [About, sources and disclosure](${BASE}/about/)
`);
write('llms-full.txt', guides.map((p) => `# ${p.title}\nURL: ${BASE}${p.url}\nLast updated: ${p.updated}\n\nQuick answer: ${stripTags(inline(p.answer))}\n\n${p.plain}\n\n${p.faq.map((f) => `Q: ${f.q}\nA: ${f.text}`).join('\n\n')}`).join('\n\n---\n\n') + '\n');
if (site.adsenseClient) write('ads.txt', `google.com, ${site.adsenseClient.replace('ca-', '')}, DIRECT, f08c47fec0942fa0\n`);

console.log(`Built ${pages.length + 1 + (news.length ? 1 : 0)} pages to dist/ (${LAUNCHED ? 'post-launch' : 'pre-launch'} mode, ${news.length} headlines)`);
if (BASE.includes('example.com')) console.warn('NOTE: baseUrl in site.json is still https://example.com. Set your real domain before deploying.');
