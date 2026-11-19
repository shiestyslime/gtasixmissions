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
// BUILD_DATE simulates a day (noon UTC) or, when it includes a time, an exact moment. For tests and previews.
const NOW = process.env.BUILD_DATE ? new Date(/T/.test(process.env.BUILD_DATE) ? process.env.BUILD_DATE : process.env.BUILD_DATE + 'T12:00:00Z') : new Date();
if (Number.isNaN(NOW.getTime())) throw new Error('BUILD_DATE is not a valid date');
// This switches editorial copy after the rolling launch, not a user's store countdown.
const LAUNCHED = NOW >= new Date(site.launchDate);
// Ads need IDs AND two explicit confirmations. Entering IDs alone never turns ads on.
const adReady = Boolean(site.adsenseClient && site.adsenseSlot && site.adsEnabled === true && site.adsConsentConfirmed === true);
// Paste only the owner's verified public creator profile. This checks the URL shape, not account ownership.
const supportUrl = (() => {
  const value = site.supportUrl;
  if (value === undefined || value === '') return '';
  const match = typeof value === 'string' && value === value.trim() && value.match(/^https:\/\/(?:www\.)?(ko-fi\.com|buymeacoffee\.com|paypal\.me)\/([A-Za-z0-9][A-Za-z0-9_-]*)\/?$/);
  const serviceRoutes = new Set(['about', 'account', 'blog', 'contact', 'dashboard', 'explore', 'faq', 'help', 'home', 'login', 'logout', 'privacy', 'register', 'search', 'settings', 'shop', 'signup', 'support', 'terms']);
  if (!match || serviceRoutes.has(match[2].toLowerCase())) throw new Error('site.json supportUrl must be empty or an HTTPS public creator profile on ko-fi.com, buymeacoffee.com or paypal.me, with no credentials, port, query, fragment or extra path');
  return value;
})();
const isRealDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d || '') && !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) && new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d;
const BUILD_DAY = new Date(NOW.getTime() + 14 * 36e5).toISOString().slice(0, 10); // latest calendar day anywhere at build time
// launchDate switches the editorial pre-launch and post-launch wording. It is not the mission gate.
// missionPublishAfter is the earliest moment a mission guide may build: the first official unlock on a
// platform we cover, with its official source. Without it the gate falls back to launchDate.
// Reaching this time publishes nothing by itself. releaseGate() below still needs recorded release evidence.
const officialUrl = (value) => { try { const u = new URL(value); return u.protocol === 'https:' && OFFICIAL_DOMAINS.has(domainOf(u.hostname)); } catch { return false; } };
function missionPublishTime() {
  if (site.missionPublishAfter === undefined) return new Date(site.launchDate);
  const value = site.missionPublishAfter;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(Z|[+-]\d{2}:\d{2})$/.test(value) || Number.isNaN(Date.parse(value)) || !isRealDate(value.slice(0, 10))) throw new Error('site.json missionPublishAfter must be a full timestamp with a time zone, such as 2026-11-19T05:00:00Z');
  const time = new Date(value);
  if (time < new Date(new Date(site.launchDate).getTime() - 24 * 36e5)) throw new Error('site.json missionPublishAfter cannot be more than 24 hours before launchDate');
  if (!officialUrl(site.missionPublishAfterSource)) throw new Error('site.json missionPublishAfterSource must be an https link to Rockstar, PlayStation or Xbox that shows the unlock time');
  return time;
}
const domainOf = (host) => host.toLowerCase().replace(/:\d+$/, '').split('.').slice(-2).join('.');
const PLACEHOLDER_DOMAINS = new Set(['example.com', 'example.org', 'example.net', 'localhost']);
const OFFICIAL_DOMAINS = new Set(['rockstargames.com', 'playstation.com', 'xbox.com']);
const PLATFORMS = new Set(['PS5', 'Xbox Series X|S']);
const MISSION_AFTER = missionPublishTime();
const MISSIONS_OPEN = NOW >= MISSION_AFTER;
const LAUNCH_DAY = new Date(MISSION_AFTER.getTime() - 12 * 36e5).toISOString().slice(0, 10); // earliest local calendar day anywhere at that moment
// Verified PS5 unlock times by PlayStation Store region. The release-date table and the region picker both come from this list.
// Each time is the store listing's own release time. PlayStation describes a rolling midnight launch, so each must be midnight
// in the listed zone. The earliest must equal missionPublishAfter, so the two settings cannot drift apart.
const UNLOCKS = (site.ps5Unlocks || []).map((u, i) => {
  const where = `site.json ps5Unlocks[${i}]`;
  if (!/^[a-z]{2}$/.test(u.id || '') || !u.region) throw new Error(`${where}: needs a two-letter "id" and a "region" name`);
  if (typeof u.time !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(u.time) || !isRealDate(u.time.slice(0, 10)) || Number.isNaN(Date.parse(u.time))) throw new Error(`${where}: "time" must be a UTC timestamp such as 2026-11-19T05:00:00Z`);
  if (typeof u.zone !== 'string' || !u.zone.trim()) throw new Error(`${where}: "zone" must be a time zone name such as Europe/London`);
  let local;
  try { local = new Intl.DateTimeFormat('en-US', { timeZone: u.zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(u.time)); } catch { throw new Error(`${where}: "zone" must be a time zone name such as Europe/London`); }
  if (local !== '00:00') throw new Error(`${where}: ${u.time} is ${local} in ${u.zone}, not midnight. Check the store listing and the zone`);
  if (!officialUrl(u.source) || new URL(u.source).hostname !== 'store.playstation.com') throw new Error(`${where}: "source" must be the https PlayStation Store listing that shows this time`);
  if (!isRealDate(u.checked) || u.checked > BUILD_DAY) throw new Error(`${where}: "checked" must be the real date you read the listing, not later than today`);
  return u;
});
if (new Set(UNLOCKS.map((u) => u.id)).size !== UNLOCKS.length) throw new Error('site.json ps5Unlocks: each id must be different');
if (UNLOCKS.length && site.missionPublishAfter !== undefined && Date.parse(UNLOCKS.map((u) => u.time).sort()[0]) !== MISSION_AFTER.getTime()) throw new Error('site.json: missionPublishAfter must equal the earliest time in ps5Unlocks');
const REVIEW_LABELS = { owner: 'Source check reviewed by the site owner.', 'approved-tester': 'Source check reviewed by an approved tester.', automated: 'Source check was automated. No person has reviewed it yet.' };
// No mission guide of either tier builds until the mission publication time has passed AND an editor has recorded
// an official confirmation of the retail release in site.json. A date, in a guide or in settings, is never enough on its own.
function releaseGate(file) {
  const gate = site.communityGuides || {};
  if (!MISSIONS_OPEN) throw new Error(`${file}: mission guides cannot be built before the mission publication time (site.json missionPublishAfter, or launchDate when that is absent)`);
  if (!isRealDate(gate.releaseConfirmedOn) || gate.releaseConfirmedOn > BUILD_DAY || gate.releaseConfirmedOn < LAUNCH_DAY) throw new Error(`${file}: site.json communityGuides.releaseConfirmedOn must be a real date from launch day to today`);
  if (!officialUrl(gate.releaseSource)) throw new Error(`${file}: site.json communityGuides.releaseSource must be an https link to Rockstar, PlayStation or Xbox`);
}
// Community guides also need their own switch.
function communityGate(file) {
  if ((site.communityGuides || {}).enabled !== true) throw new Error(`${file}: community guides are switched off (site.json communityGuides.enabled)`);
  releaseGate(file);
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const unent = (s) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;|&#8217;|&#x2019;/g, "'").replace(/&#8216;/g, "'").replace(/&#822[01];/g, '"').replace(/&#8211;/g, '-').replace(/&amp;/g, '&');
const stripTags = (h) => unent(h.replace(/<\/(?:p|h[23]|li|tr)>/g, ' ').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
const NO_CITES = /<sup class="cite">[\s\S]*?<\/sup>/g; // search excerpts leave out citation numbers; the record carries the links
const PRESS_CONTEXT = 'Includes observations from the outlets linked below.';

// ---------- tiny markdown ----------
function link(text, url) {
  if (url.startsWith('aff:')) {
    const a = site.affiliates[url.slice(4)];
    if (!a) throw new Error(`Unknown affiliate key: ${url}`);
    return a.affiliateUrl
      ? `<a href="${esc(a.affiliateUrl)}" rel="sponsored nofollow noopener">${text}</a> <span class="affiliate-note">We may earn a commission.</span>`
      : `<a href="${esc(a.url)}" rel="noopener">${text}</a>`;
  }
  return /^https?:/.test(url) ? `<a href="${esc(url)}" rel="noopener">${text}</a>` : `<a href="${esc(url)}">${text}</a>`;
}
// {src:2} or {src:1,3} cites numbered items under "## Sources", right next to the claim.
const cite = (nums) => `<sup class="cite">[${nums.split(',').map((n) => `<a href="#source-${Number(n)}">${Number(n)}</a>`).join(', ')}]</sup>`;
function inline(s) {
  return esc(s)
    .replace(/\{(?:confirmed|reported|unknown)\} ?/g, '')
    .replace(/ ?\{src:(\d+(?:, ?\d+)*)\}/g, (_, nums) => cite(nums.replace(/ /g, '')))
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, t, u) => link(t, unent(u)));
}
// A credited YouTube video. Nothing loads from YouTube until the reader presses play.
const videoBlock = (id, label, channel) => `<figure class="video" data-video="${id}"><button type="button" class="video-play" hidden><span aria-hidden="true">▶</span> Play video here</button><figcaption><b>${esc(label)}</b> Video by ${esc(channel)} on YouTube. <a href="https://www.youtube.com/watch?v=${id}" rel="noopener">Watch on YouTube</a>. <span class="video-note">Community video. Not made or tested by this site.</span></figcaption></figure>`;
function md(src) {
  const lines = src.split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) { i++; continue; }
    let m;
    if ((m = l.match(/^(#{2,3}) (.+?)(?: \{#([a-z0-9]+(?:-[a-z0-9]+)*)\})?$/))) {
      // "## Heading {#fixed-id}" keeps a linked step's URL stable when its wording is edited later.
      const tag = m[1].length === 2 ? 'h2' : 'h3';
      out.push(`<${tag} id="${m[3] || slugify(m[2])}">${inline(m[2])}</${tag}>`); i++;
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
    } else if ((m = l.match(/^::: video ([\w-]{11}) \| ([^|]+) \| ([^|]+)$/))) {
      out.push(videoBlock(m[1], m[2].trim(), m[3].trim())); i++;
    } else if (l.startsWith(':::')) {
      throw new Error(`Bad ":::" line (use "::: video <11-char id> | label | channel"): ${l}`);
    } else if (l.startsWith('> ')) {
      const buf = [];
      while (i < lines.length && lines[i].startsWith('> ')) buf.push(lines[i++].slice(2));
      out.push(`<aside class="note">${inline(buf.join(' '))}</aside>`);
    } else {
      const buf = [];
      while (i < lines.length && lines[i].trim() && !/^(#{2,3} |[-*] |\d+\. |\||> |:::)/.test(lines[i])) buf.push(lines[i++]);
      const text = buf.join(' ');
      out.push(text.startsWith('{nav} ') ? `<p class="nav-note">${inline(text.slice(6))}</p>` : `<p>${inline(text)}</p>`);
    }
  }
  return out.join('\n');
}
// "::: prelaunch" / "::: postlaunch" blocks: only one side is kept, chosen by today's date.
const phase = (src) => src.replace(/^::: (prelaunch|postlaunch)\n([\s\S]*?)\n:::$/gm, (_, k, body) => ((k === 'postlaunch') === LAUNCHED ? body : ''));

// ---------- sources ----------
// One upload has one identity however its link is written: youtube.com/watch, youtu.be, shorts, live, embed, m. and nocookie.
const YT_HOST = /^(?:(?:www|m|music)\.)?(?:youtube\.com|youtube-nocookie\.com)$/;
function canonicalSource(value) {
  const u = new URL(value);
  const host = u.hostname.toLowerCase();
  const id = host === 'youtu.be' || host === 'www.youtu.be' ? u.pathname.split('/')[1]
    : YT_HOST.test(host) ? u.searchParams.get('v') || (u.pathname.match(/^\/(?:embed|shorts|live|v)\/([\w-]{11})/) || [])[1] : null;
  if (id !== null && id !== undefined) { if (!/^[\w-]{11}$/.test(id)) throw new Error(`Not a YouTube video link: ${value}`); return `youtube:${id}`; }
  for (const key of [...u.searchParams.keys()]) if (/^(utm_|fbclid$|gclid$|ref$)/.test(key)) u.searchParams.delete(key);
  u.searchParams.sort();
  return `${host.replace(/^(www|m|amp)\./, '')}${u.pathname.replace(/\/+$/, '').toLowerCase()}${u.searchParams.toString() ? `?${u.searchParams}` : ''}`;
}
// "12:34", "1:02:03" or a YouTube t= value ("754", "754s", "12m34s") in seconds.
const clockSeconds = (t) => (/^\d+(?::\d{2}){1,2}$/.test(t) ? t.split(':').reduce((a, x) => a * 60 + Number(x), 0) : NaN);
const tParamSeconds = (t) => { const m = String(t).match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/); return m && t ? (Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0)) : NaN; };
const idOf = (v) => v.toLowerCase().replace(/^@/, '').replace(/[^a-z0-9]+/g, '');
const sourceMeta = (r) => [r.by && `by ${r.by}`, r.at && `evidence at ${r.at}`, r.group && `origin group ${r.group}`].filter(Boolean).join(' · ');
// A source item: - [What it shows](url) | by: Creator or publisher | group: origin-id | at: 12:34 or article section
function parseSources(file, sources, isMission) {
  return sources.split('\n').filter((line) => /^([-*]|\d+\.) /.test(line)).map((line, i) => {
    const [head, ...parts] = line.replace(/^([-*]|\d+\.) /, '').split(' | ');
    const linkMatch = head.trim().match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/);
    const record = { n: i + 1, url: (head.match(/\]\((https?:\/\/[^)\s]+)\)/) || [])[1] || '', label: linkMatch ? linkMatch[1] : '' };
    if (!isMission) return record;
    for (const part of parts) {
      const k = part.indexOf(':');
      const key = part.slice(0, k).trim();
      if (k < 1 || !['by', 'group', 'at'].includes(key) || !part.slice(k + 1).trim()) throw new Error(`${file}: source ${i + 1}: use "| by: … | group: … | at: …" after the link`);
      record[key] = part.slice(k + 1).trim();
    }
    if (record.url) record.key = canonicalSource(record.url);
    return record;
  });
}
// Declared metadata is checked for consistency. It cannot prove what the footage shows or that sources are truly independent.
function checkIndependence(file, records) {
  const keys = new Map();
  const groupOfCreator = new Map();
  for (const r of records) {
    if (!r.url || !r.label) throw new Error(`${file}: source ${r.n} must be one link: - [What it shows](https://…) | by: … | group: … | at: …`);
    for (const key of ['by', 'group', 'at']) if (!r[key]) throw new Error(`${file}: source ${r.n} needs "${key}:" (creator or publisher, origin group, and where the evidence is)`);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(r.group)) throw new Error(`${file}: source ${r.n}: group must be a short id like "creator-a"`);
    // One upload or page may be listed again for a different evidence location (a long playthrough at 02:00 and 10:00),
    // but only with the same creator and group. It never adds an origin, whatever form its link takes.
    const first = keys.get(r.key);
    if (first) {
      if (idOf(first.by) !== idOf(r.by) || first.group !== r.group) throw new Error(`${file}: sources ${first.n} and ${r.n} are the same upload or page but name a different creator or group. One upload is one origin`);
      if (first.locations.has(r.at)) throw new Error(`${file}: sources ${first.n} and ${r.n} are the same upload or page at the same location (${r.at}). List it once`);
      first.locations.add(r.at);
    } else keys.set(r.key, { n: r.n, by: r.by, group: r.group, locations: new Set([r.at]) });
    if (r.key.startsWith('youtube:')) {
      if (Number.isNaN(clockSeconds(r.at))) throw new Error(`${file}: source ${r.n} is a video; "at:" must be a timestamp like 12:34`);
      const t = new URL(r.url).searchParams.get('t');
      if (t !== null && tParamSeconds(t) !== clockSeconds(r.at)) throw new Error(`${file}: source ${r.n}: the link's t=${t} does not match "at: ${r.at}"`);
    }
    // One creator or publisher is one origin, however many uploads or pages it has.
    const creator = idOf(r.by);
    if (groupOfCreator.has(creator) && groupOfCreator.get(creator) !== r.group) throw new Error(`${file}: "${r.by}" appears in two origin groups. One creator or publisher counts once; put all of its sources in one group`);
    groupOfCreator.set(creator, r.group);
  }
  const groups = new Set(records.map((r) => r.group)).size;
  if (groups < 2) throw new Error(`${file}: a community guide needs sources from at least two independent origin groups (different creators or publishers, neither copying the other)`);
  return groups;
}
// The parts of a community guide that need evidence: every paragraph, list item, table row and note.
// "{nav} " starts a navigation-only paragraph: it needs no citation but must link to a page on this site.
function evidenceUnits(file, body) {
  const units = [];
  const lines = body.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!l.trim() || /^#{2,3} /.test(l) || /^::: video /.test(l) || /^\|[\s:|-]+\|?$/.test(l)) continue;
    if (/^\|/.test(l)) { if (lines[i + 1] && /^\|[\s:|-]+\|?$/.test(lines[i + 1])) continue; units.push(l); continue; } // header row skipped
    if (/^([-*]|\d+\.) /.test(l)) { units.push(l); continue; }
    const buf = [l];
    while (lines[i + 1] && lines[i + 1].trim() && !/^(#{2,3} |[-*] |\d+\. |\||:::)/.test(lines[i + 1]) && (/^> /.test(l) === /^> /.test(lines[i + 1]))) buf.push(lines[++i]);
    const text = buf.join(' ');
    if (text.startsWith('{nav} ')) { if (!/\]\(\/[^)]*\)/.test(text) || /\{src:/.test(text)) throw new Error(`${file}: a "{nav}" paragraph is for links to other pages on this site only: "${text.slice(0, 80)}"`); continue; }
    units.push(text);
  }
  return units;
}

// The static unlock table: every fact visible without JavaScript.
const zoned = (iso, zone) => new Intl.DateTimeFormat('en-US', { timeZone: zone, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: zone === 'UTC' ? 'short' : 'long' }).format(new Date(iso));
const unlockTable = `<div class="table-wrap" data-unlock-table><table><thead><tr><th>PlayStation Store region</th><th>Listed unlock</th><th>Local time there</th><th>Source</th></tr></thead><tbody>${UNLOCKS.map((u) => `<tr><td>${esc(u.region)}</td><td><time datetime="${u.time}">${esc(zoned(u.time, 'UTC'))}</time></td><td>${esc(zoned(u.time, u.zone))}</td><td><a href="${esc(u.source)}" rel="noopener">${esc(u.region)} store listing</a>, checked ${new Date(`${u.checked}T12:00:00Z`).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' })}</td></tr>`).join('')}</tbody></table></div>`;
// The region picker. It never reads the reader's location; it only converts a listed time into the reader's own clock.
const unlockPicker = `<form class="unlock-check" data-unlock-check hidden>
<fieldset><legend>See your PS5 unlock time</legend>
<p>Choose the PlayStation Store region of the account that owns or redeemed this copy. Your store region comes from that account, not from where you are.</p>
<label for="unlock-region">PlayStation Store region</label>
<select id="unlock-region" name="region"><option value="">Choose a store region</option>${UNLOCKS.map((u) => `<option value="${u.id}" data-time="${u.time}" data-source="${esc(u.source)}">${esc(u.region)}</option>`).join('')}</select>
<output data-unlock-result role="status"></output>
</fieldset></form>`;

// ---------- load content ----------
function loadPage(file, isMission = false) {
  const raw = fs.readFileSync(file, 'utf8');
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) throw new Error(`Missing front matter: ${file}`);
  const meta = {};
  for (const line of m[1].split('\n')) {
    const k = line.indexOf(':');
    if (k > 0) meta[line.slice(0, k).trim()] = line.slice(k + 1).trim();
  }
  // Missions have two public tiers. "published" = tested first-hand. "community" = built from public reports, never labeled tested.
  if (isMission && !['published', 'community'].includes(meta.status)) return null;
  const tested = isMission && meta.status === 'published';
  const community = isMission && !tested;
  const required = ['title', 'slug', 'description', 'answer', 'updated'];
  if (tested) required.push('testedPlatform', 'testedDate');
  if (community) required.push('checkedDate');
  for (const key of required) if (!meta[key]) throw new Error(`${file}: missing "${key}"`);
  const routeSlug = isMission ? /^missions\/[a-z0-9]+(?:-[a-z0-9]+)*$/ : /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  if (!routeSlug.test(meta.slug)) throw new Error(`${file}: invalid page slug`);
  if (!isRealDate(meta.updated) || meta.updated > BUILD_DAY) throw new Error(`${file}: "updated" must be a real calendar date, not later than today`);
  if (tested) releaseGate(file);
  if (tested && (!isRealDate(meta.testedDate) || meta.testedDate > BUILD_DAY || meta.testedDate < LAUNCH_DAY)) throw new Error(`${file}: testedDate must be a real date from launch day to today`);
  if (community) {
    communityGate(file);
    if (meta.testedPlatform || meta.testedDate || meta.testedBuild) throw new Error(`${file}: a community guide cannot carry tested fields`);
    if (!isRealDate(meta.checkedDate) || meta.checkedDate > BUILD_DAY || meta.checkedDate < LAUNCH_DAY) throw new Error(`${file}: checkedDate must be a real date from launch day to today`);
    if (meta.sourceBasis !== 'retail-gameplay') throw new Error(`${file}: needs "sourceBasis: retail-gameplay" (every source shows or states play of the released game)`);
    if (!REVIEW_LABELS[meta.sourceReview]) throw new Error(`${file}: needs "sourceReview: owner", "approved-tester" or "automated"`);
  }
  // "published" is the first public date. It is optional, never derived from "updated", and must not move later.
  if (meta.published !== undefined && (!isRealDate(meta.published) || meta.published > meta.updated || meta.published > BUILD_DAY || (isMission && meta.published < LAUNCH_DAY))) throw new Error(`${file}: "published" must be a real date, not later than "updated" or today${isMission ? ', and not before launch day' : ''}`);
  // A local watch page records the clip's original publication date, never the rebuild time.
  let watchVideo = null;
  const videoKeys = ['videoFile', 'videoPoster', 'videoSeconds', 'videoWidth', 'videoHeight', 'videoUploadDate', 'videoCreator', 'videoCaption'];
  if (videoKeys.some((key) => meta[key] !== undefined)) {
    for (const key of videoKeys) if (!meta[key]) throw new Error(`${file}: watch video missing "${key}"`);
    if (isMission) throw new Error(`${file}: use a dedicated general page for a local watch video`);
    for (const [key, pattern] of [['videoFile', /^[a-z0-9]+(?:-[a-z0-9]+)*\.mp4$/], ['videoPoster', /^[a-z0-9]+(?:-[a-z0-9]+)*\.(?:jpg|jpeg|png|webp)$/]]) {
      if (!pattern.test(meta[key]) || !fs.existsSync(path.join(ROOT, 'assets', meta[key]))) throw new Error(`${file}: "${key}" must name an existing local video asset`);
    }
    for (const key of ['videoSeconds', 'videoWidth', 'videoHeight']) if (!/^[1-9]\d*$/.test(meta[key])) throw new Error(`${file}: "${key}" must be a positive whole number`);
    if (!isRealDate(meta.videoUploadDate) || meta.videoUploadDate > meta.updated || meta.videoUploadDate > BUILD_DAY) throw new Error(`${file}: "videoUploadDate" must be a real date, not later than "updated" or today`);
    watchVideo = { file: meta.videoFile, poster: meta.videoPoster, seconds: Number(meta.videoSeconds), width: Number(meta.videoWidth), height: Number(meta.videoHeight), uploaded: meta.videoUploadDate, creator: meta.videoCreator, caption: meta.videoCaption };
  }
  if (community && meta.sourcePlatforms !== undefined && !meta.sourcePlatforms.split(',').every((x) => PLATFORMS.has(x.trim()))) throw new Error(`${file}: "sourcePlatforms" lists only platforms the sources show, separated by commas: ${[...PLATFORMS].join(', ')}`);
  if (isMission && stripTags(inline(meta.answer)).length > 300) throw new Error(`${file}: keep "answer" to one direct action of 300 characters or fewer`);
  if (LAUNCHED && meta.answer_postlaunch) meta.answer = meta.answer_postlaunch;
  // The mission hub's answer depends on whether any mission guide is actually published, not on the date.
  if (!isMission && meta.answer_missions && publishedMissions.length) meta.answer = meta.answer_missions;
  let body = phase(m[2]);
  const cut = (heading) => {
    const idx = body.search(new RegExp(`^## ${heading}\\s*$`, 'm'));
    if (idx < 0) return '';
    const part = body.slice(idx).replace(/^## .*\n/, '');
    body = body.slice(0, idx);
    return part;
  };
  const sources = cut('Sources');
  const sourceLinks = [...sources.matchAll(/\]\((https?:\/\/[^)\s]+)\)/g)].map((x) => x[1]);
  // Numbered sources: item N is the Nth list item under "## Sources". {src:N} cites it.
  const sourceRecords = parseSources(file, sources, isMission);
  const sourceItems = sourceRecords.map((r) => r.url);
  const refsIn = (text) => [...text.matchAll(/\{src:(\d+(?:, ?\d+)*)\}/g)].flatMap((x) => x[1].split(',').map(Number));
  for (const n of refsIn(body + meta.answer)) if (n < 1 || n > sourceItems.length || !sourceItems[n - 1]) throw new Error(`${file}: {src:${n}} does not match a linked item under "## Sources"`);
  let independentGroups = 0;
  if (community) {
    if (sourceLinks.some((link) => { const d = domainOf(new URL(link).hostname); return PLACEHOLDER_DOMAINS.has(d) || /\.(test|example|invalid|localhost)$/.test(d); })) throw new Error(`${file}: placeholder source links are not allowed`);
    independentGroups = checkIndependence(file, sourceRecords);
    if (meta.independentSources !== undefined && Number(meta.independentSources) !== independentGroups) throw new Error(`${file}: "independentSources" says ${meta.independentSources} but the source records show ${independentGroups} independent group(s). Leave the field out; the build counts groups`);
    // The quick answer and every step, paragraph, table row and note need two independent groups cited beside them.
    const groupsOf = (text) => new Set(refsIn(text).map((n) => sourceRecords[n - 1].group));
    if (groupsOf(meta.answer).size < 2) throw new Error(`${file}: the quick answer must cite sources from at least two independent groups with {src:N}`);
    for (const unit of evidenceUnits(file, body)) if (groupsOf(unit).size < 2) throw new Error(`${file}: this text must cite sources from at least two independent groups with {src:N}: "${unit.trim().slice(0, 80)}"`);
  }
  const faq = cut('FAQ').split(/^### /m).slice(1).map((chunk) => {
    const [q, ...rest] = chunk.split('\n');
    const html = md(rest.join('\n'));
    return { q: q.trim(), id: `faq-${slugify(q)}`, html, text: stripTags(html) };
  });
  const html = md(body).replace('<p>[ps5-unlock-times]</p>', unlockTable);
  if (watchVideo && !html.includes('id="transcript"')) throw new Error(`${file}: a local watch video needs a visible "transcript" section`);
  const toc = [...html.matchAll(/<h2 id="([^"]+)">(.*?)<\/h2>/g)].map((x) => ({ id: x[1], text: stripTags(x[2]) }));
  let n = 0;
  // Mission sources are a numbered list built from the records, so page, search and AI exports show the same fields.
  const sourcesHtml = !sources ? '' : isMission ? `<ol>${sourceRecords.map((r) => `<li id="source-${r.n}">${r.label ? link(inline(r.label), r.url) : link(esc(r.url), r.url)}${sourceMeta(r) ? ` <span class="source-meta">${esc(sourceMeta(r))}</span>` : ''}</li>`).join('')}</ol>`
    : md(sources).replace(/<li>/g, () => `<li id="source-${++n}">`);
  if (community) meta.independentSources = String(independentGroups);
  return { ...meta, watchVideo, hasPressCoverage: !isMission && /\{reported\}/.test(raw), isMission, tested, community, sourceLinks, sourceItems, sourceRecords, order: Number(meta.order || 99), html, toc, faq, sourcesHtml, plain: stripTags(html).replace('[storage-check]', '').trim(), url: `/${meta.slug}/` };
}
function readPages(dir, isMission = false) {
  const folder = path.join(ROOT, 'content', dir);
  if (!fs.existsSync(folder)) return [];
  return fs.readdirSync(folder).filter((file) => file.endsWith('.md'))
    .map((file) => loadPage(path.join(folder, file), isMission)).filter(Boolean);
}
let publishedMissions = [];
const missions = readPages('missions', true).sort((a, b) => a.order - b.order || a.slug.localeCompare(b.slug));
publishedMissions = missions;
const pages = [...readPages(''), ...missions].sort((a, b) => a.order - b.order);
if (new Set(pages.map((page) => page.slug)).size !== pages.length) throw new Error('Duplicate page slug');
const storyCatalogue = loadStoryCatalogue();
const storyTips = loadStoryTips();
// The hub lists every mission guide, so its freshness is the newest of its own edit and its listed guides' edits.
// A rebuild with no content change leaves it as it was. Removing a guide needs a manual "updated" on content/missions.md.
const hub = pages.find((p) => p.slug === 'missions');
if (hub) hub.updated = [hub.updated, ...missions.map((m) => m.updated), ...(storyCatalogue ? [storyCatalogue.checkedDate] : []), ...(storyTips ? [storyTips.checkedDate] : [])].sort().pop();
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
const nav = ['missions', 'launch-help', 'editions-price', 'progression', 'release-date'].map((slug) => {
  const page = pages.find((p) => p.slug === slug);
  return { label: page.nav, url: page.url };
});
const footerNav = [...guides.map((p) => ({ label: p.nav, url: p.url })), ...(news.length ? [{ label: 'News', url: '/news/' }] : [])];

// ---------- art and icons (all original, no game assets) ----------
const ICONS = {
  'release-date': '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  'launch-help': '<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 1 1 4.4 2.65c-1 .6-1.4 1.1-1.4 2.35M12 17h.01"/>',
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
  if (adReady) return `<div class="ad" aria-label="Advertisement"><ins class="adsbygoogle" style="display:block" data-ad-client="${esc(site.adsenseClient)}" data-ad-slot="${esc(site.adsenseSlot)}" data-ad-format="auto" data-full-width-responsive="true"></ins><script>(window.adsbygoogle=window.adsbygoogle||[]).push({});</script></div>`;
  return site.adPlaceholders ? `<div class="ad ad-placeholder" aria-hidden="true">Ad slot: ${esc(name)}</div>` : '';
}
function layout({ title, description, url, body, jsonld = [], ogType = 'article', scripts = '', index = true, ads = false, socialImage = '/og.png', socialWidth = 1200, socialHeight = 630 }) {
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
<meta property="og:image" content="${BASE}${socialImage}">
<meta property="og:image:width" content="${socialWidth}">
<meta property="og:image:height" content="${socialHeight}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${BASE}${socialImage}">
<meta name="robots" content="${index ? 'index, follow, max-snippet:-1, max-image-preview:large' : 'noindex, follow'}">
<meta name="theme-color" content="#170b30">
${url === '/' && /^ca-pub-\d{16}$/.test(site.adsenseClient) ? `<meta name="google-adsense-account" content="${esc(site.adsenseClient)}">` : ''}
${url === '/' && site.googleSiteVerification ? `<meta name="google-site-verification" content="${esc(site.googleSiteVerification)}">` : ''}
${url === '/' && site.bingSiteVerification ? `<meta name="msvalidate.01" content="${esc(site.bingSiteVerification)}">` : ''}
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="alternate" type="application/atom+xml" title="${esc(site.name)} guide updates" href="/feed.xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,800&display=swap">
<link rel="stylesheet" href="/style.css">
${ads && adReady ? `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${esc(site.adsenseClient)}" crossorigin="anonymous"></script>` : ''}
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
    <ul>${footerNav.map((n) => `<li><a href="${n.url}">${esc(n.label)}</a></li>`).join('')}</ul>
    <ul><li><a href="/about/">About and sources</a></li><li><a href="/about/#sponsorships">Sponsor a guide</a></li><li><a href="/about/#advertising-and-affiliate-disclosure">Ad and affiliate disclosure</a></li><li><a href="/privacy/">Privacy</a></li><li><a href="/feed.xml">Updates feed</a></li><li><a href="/sitemap.xml">Sitemap</a></li></ul>
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
// crumb is the current page's label, or [parent links..., current label]. The JSON-LD trail uses the same list.
const pageHero = (crumb, h1, meta) => { const trail = Array.isArray(crumb) ? crumb : [crumb]; return `<div class="page-hero"><div class="wrap"><nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> <span aria-hidden="true">/</span> ${trail.map((c) => (typeof c === 'string' ? esc(c) : `<a href="${c.url}">${esc(c.label)}</a> <span aria-hidden="true">/</span>`)).join(' ')}</nav><h1>${esc(h1)}</h1>${meta}</div></div>`; };
const searchUi = `<form class="search" role="search" data-site-search data-catalogue-available="${Boolean(storyCatalogue)}" hidden>
<label for="q">Find a mission or objective</label>
<input id="q" type="search" placeholder="Mission, objective, or error" autocomplete="off" aria-controls="results" aria-describedby="search-status">
<p class="search-status" id="search-status" data-search-status role="status"></p>
<ul class="results" id="results" data-search-results hidden></ul>
</form>`;
const searchScript = '<script defer src="/search.js"></script>';
const launchJumps = [
  { label: 'Box code problem', url: '/launch-help/#boxed-code-not-working' },
  { label: 'Game missing or locked', url: '/launch-help/#game-missing-or-locked' },
  { label: 'Not enough space', url: '/launch-help/#not-enough-space' },
  { label: 'Play on Xbox One', url: '/launch-help/#xbox-one-cloud-gaming' },
  { label: 'Offline play or servers down', url: '/launch-help/#offline-play-and-service-status' },
];
const quickJumps = (links, label) => `<nav class="quick-jumps" aria-label="${label}"><ul>${links.map((item) => `<li><a href="${item.url}">${item.label}</a></li>`).join('')}</ul></nav>`;
const storageCheck = `<form class="storage-check" data-storage-check hidden>
<fieldset><legend>Check how much space to free</legend>
<p>Use the free space on your install drive and the requirement shown on your console. The default uses Rockstar’s up-to-212 GB planning figure.</p>
<div class="storage-fields">
<label>Free space (GB)<input name="available" type="number" min="0" max="100000" step="any" inputmode="decimal" required></label>
<label>Required space (GB)<input name="required" type="number" min="1" max="100000" step="any" value="212" inputmode="decimal" required></label>
</div>
<button class="btn" type="submit">Check space</button>
<output name="shortfall" data-storage-result role="status"></output>
</fieldset></form>`;

const statusLabel = (p) => p.tested ? `Tested on ${p.testedPlatform}, ${fmtDate(p.testedDate)}` : p.community ? `Community-sourced, not tested by this site. Sources checked ${fmtDate(p.checkedDate)} (${p.sourceReview === 'automated' ? 'automated check, no human review' : p.sourceReview === 'owner' ? 'source check reviewed by the site owner' : 'source check reviewed by an approved tester'})` : '';
// This source catalog is a checklist, not a claim that we authored or tested every walkthrough.
function loadStoryCatalogue() {
  const file = path.join(ROOT, 'data', 'story-missions.json');
  if (!fs.existsSync(file)) return null;
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const fail = (message) => { throw new Error(`story-missions.json: ${message}`); };
  const text = (value) => typeof value === 'string' && value.trim().length > 0;
  const external = (value) => { try { const url = new URL(value); return typeof value === 'string' && value === value.trim() && url.protocol === 'https:' && !url.username && !url.password && url.origin !== new URL(BASE).origin; } catch { return false; } };
  if (!isRealDate(data.checkedDate) || data.checkedDate > BUILD_DAY) fail('checkedDate must be a real date, not later than today');
  if (!Array.isArray(data.sources) || !data.sources.length || data.sources.some((s) => !text(s.publisher) || !external(s.url))) fail('sources need a publisher and an external HTTPS URL');
  if (!Array.isArray(data.chapters) || !data.chapters.length) fail('chapters must be a nonempty list');
  const chapterIds = new Set(), keys = new Set();
  for (const [chapterIndex, chapter] of data.chapters.entries()) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(chapter.id || '') || chapterIds.has(chapter.id)) fail('chapter IDs must be unique slugs');
    chapterIds.add(chapter.id);
    if (!text(chapter.title) || typeof chapter.spoiler !== 'boolean' || !Array.isArray(chapter.missions) || !chapter.missions.length) fail('each chapter needs a title, explicit spoiler setting and entries');
    if (chapterIndex > 0 && !chapter.spoiler) fail('later chapters must keep spoiler protection');
    for (const item of chapter.missions) {
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.key || '') || keys.has(item.key) || !text(item.title)) fail('entries need globally unique keys and a title');
      keys.add(item.key);
      if (item.aliases !== undefined && (!Array.isArray(item.aliases) || item.aliases.some((a) => !text(a)))) fail(`${item.key}: aliases must be text`);
      if (![undefined, null, true, false].includes(item.optional)) fail(`${item.key}: optional must be true, false or null`);
      if (item.kind !== undefined && !['story', 'optional', 'other-campaign-entry'].includes(item.kind)) fail(`${item.key}: unknown entry kind`);
      if (!Array.isArray(item.sourceUrls) || !item.sourceUrls.length || item.sourceUrls.some((url) => !external(url))) fail(`${item.key}: every entry needs an external HTTPS source`);
      if (item.walkthrough && (!text(item.walkthrough.publisher) || !external(item.walkthrough.url))) fail(`${item.key}: walkthrough needs a publisher and an external HTTPS URL`);
      if (item.localSlug !== undefined && !/^missions\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.localSlug)) fail(`${item.key}: invalid localSlug`);
    }
  }
  return data;
}
const missionIdentity = (text) => String(text).normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
function loadStoryTips() {
  const file = path.join(ROOT, 'data', 'mission-tips.json');
  if (!storyCatalogue || !fs.existsSync(file)) return null;
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const fail = (message) => { throw new Error(`mission-tips.json: ${message}`); };
  if (!isRealDate(data.checkedDate) || data.checkedDate > BUILD_DAY || data.sourceReview !== 'automated' || data.testedByUs !== false) fail('requires a real checkedDate, automated source review and testedByUs:false');
  if (!data.tips || typeof data.tips !== 'object' || Array.isArray(data.tips)) fail('tips must be an object keyed by mission identity');
  const keys = new Set(storyCatalogue.chapters.flatMap((chapter) => chapter.missions.map((entry) => entry.key)));
  const byKey = new Map();
  for (const [key, record] of Object.entries(data.tips)) {
    const missionKey = record.missionKey || key;
    if (!keys.has(missionKey) || byKey.has(missionKey)) fail(`${missionKey}: missing or duplicate catalog mission key`);
    if (!Array.isArray(record.items) || !record.items.length) fail(`${missionKey}: needs at least one tip`);
    for (const tip of record.items) {
      if (![tip.question, tip.answer].every((text) => typeof text === 'string' && text.trim())) fail(`${missionKey}: tips need a question and answer`);
      if (!Array.isArray(tip.sources) || !tip.sources.length || tip.sources.some((source) => {
        try { const url = new URL(source.url); return !source.publisher?.trim() || !source.at?.trim() || url.protocol !== 'https:' || Boolean(url.username || url.password) || url.origin === new URL(BASE).origin; } catch { return true; }
      })) fail(`${missionKey}: tips need linked publisher evidence and a source location`);
    }
    byKey.set(missionKey, record.items);
  }
  return { ...data, byKey };
}
function catalogueTips(key) {
  const tips = storyTips?.byKey.get(key);
  if (!tips?.length) return '';
  return `<div class="catalogue-tips" data-story-tips>${tips.map((tip) => `<details><summary>${esc(tip.question)}</summary><p>${esc(tip.answer)}</p><ul>${tip.sources.map((source) => `<li><a href="${esc(source.url)}" rel="noopener">${esc(source.publisher)}</a> · ${esc(source.at)}</li>`).join('')}</ul></details>`).join('')}</div>`;
}
function authoredMission(item) {
  const bySlug = new Map(missions.map((m) => [m.slug.replace(/^missions\//, ''), m]));
  // Repeated map prompts such as "Meet Brian" are search terms, not mission identities.
  const canonical = bySlug.get(missionIdentity(item.key)) || bySlug.get(missionIdentity(item.title));
  if (canonical) return canonical;
  return item.localSlug ? missions.find((m) => m.slug === item.localSlug) || null : null;
}
function chapterCatalogue() {
  if (!storyCatalogue) return '';
  const chapters = storyCatalogue.chapters.map((chapter, i) => {
    const companion = pages.find((page) => page.slug === `chapter-${i + 1}-missions`);
    return { ...chapter, missions: chapter.missions.map((entry) => ({ ...entry, local: authoredMission(entry), help: companion && new RegExp(`<h[23] id="${entry.key}"`).test(companion.html) ? `${companion.url}#${entry.key}` : null })) };
  });
  const entries = chapters.flatMap((chapter) => chapter.missions);
  const own = entries.filter((entry) => entry.local).length;
  const external = entries.filter((entry) => !entry.local && entry.walkthrough).length;
  const sourceOnly = entries.length - own - external;
  const supplemental = entries.filter((entry) => !entry.local && entry.help).length;
  const row = (entry) => {
    const destination = entry.local?.url || (!entry.help && entry.walkthrough?.url);
    const label = entry.local ? 'Guide on this site' : entry.walkthrough ? `${entry.walkthrough.publisher} walkthrough (external)` : 'Campaign reference';
    const name = destination ? `<a class="catalogue-title" href="${esc(destination)}"${entry.local || entry.help ? '' : ' rel="noopener"'}>${esc(entry.title)}</a>` : `<span class="catalogue-title">${esc(entry.title)}</span>`;
    const helpLink = !entry.local && entry.help ? `<a href="${esc(entry.help)}">Objective help on this site</a> · ` : '';
    const route = !entry.local && entry.help && entry.walkthrough ? `<a href="${esc(entry.walkthrough.url)}" rel="noopener">${esc(label)}</a>` : esc(label);
    const sources = [...new Set(entry.sourceUrls)].filter((url) => entry.local || url !== entry.walkthrough?.url).map((url) => {
      const parsed = new URL(url);
      const host = parsed.hostname.replace(/^www\./, '');
      const source = storyCatalogue.sources.find((s) => new URL(s.url).hostname.replace(/^www\./, '') === host);
      const caption = host === 'gtabase.com' && /\/missions\/[^/]+\/?$/.test(parsed.pathname) ? 'GTA Base mission entry' : source ? `${source.publisher} ${url.split('#')[0] === source.url.split('#')[0] ? 'list' : 'source'}` : parsed.hostname;
      return `<a href="${esc(url)}" rel="noopener">${esc(caption)}</a>`;
    }).join(' · ');
    return `<li data-story-key="${entry.key}" data-mission-name="${esc([entry.title, ...(entry.aliases || [])].join(' | '))}" data-guide-kind="${entry.local ? 'local' : entry.walkthrough ? 'publisher' : 'source'}">${name}${entry.optional === true ? '<span class="catalogue-optional">Optional</span>' : ''}<span class="catalogue-route">${helpLink}${route}</span><span class="catalogue-sources">${sources}</span><label class="catalogue-check" data-story-check-control hidden><input type="checkbox" data-story-check="${entry.key}" aria-label="Mark ${esc(entry.title)} complete"> Completed</label>${catalogueTips(entry.key)}</li>`;
  };
  return `<section class="chapter-catalogue" id="chapter-missions" data-mission-browser>
<h2>Browse the chapter checklist</h2>
<p class="catalogue-count" data-catalogue-count="${entries.length}" data-local-count="${own}" data-publisher-count="${external}" data-source-count="${sourceOnly}" data-objective-help-count="${supplemental}"><strong>${entries.length} catalog entries across ${chapters.length} chapters.</strong> ${own} link to our dedicated guides; ${external} to a publisher's walkthrough; ${sourceOnly} to campaign references.${supplemental ? ` ${supplemental} also have on-site objective help.` : ''}</p>
<p data-story-progress hidden aria-live="polite"></p>
<form class="catalogue-search" data-catalogue-search hidden role="search"><label for="mission-name">Find a mission by name</label><input id="mission-name" type="search" autocomplete="off" placeholder="Type the mission name on your screen" aria-describedby="catalogue-search-help" aria-controls="catalogue-matches"><label class="catalogue-spoiler-choice"><input type="checkbox" data-include-spoilers> Search all chapter titles (mission-name spoilers)</label><p id="catalogue-search-help">By default, search includes our authored guides and any chapters you open. Enable the option above to search names in closed chapters too.</p><p data-catalogue-status role="status" aria-live="polite"></p><ul id="catalogue-matches" class="catalogue-missions" data-catalogue-matches hidden></ul></form>
<p class="catalogue-warning"><strong>Spoiler warning:</strong> later mission and chapter titles can reveal story developments. Open only the chapters you want to see. Publisher links may contain full story spoilers.</p>
${storyTips?.byKey.size ? `<p class="catalogue-warning">Quick answers cite published gameplay sources; not tested by us. Checked ${fmtDate(storyTips.checkedDate)}.</p>` : ''}
${chapters.map((chapter, i) => `<details class="catalogue-chapter" id="catalogue-${chapter.id}" data-story-chapter data-spoiler="${chapter.spoiler}"${chapter.spoiler ? '' : ' open'}><summary>Chapter ${i + 1} · ${chapter.missions.length} entries${chapter.spoiler ? ' · Show titles (spoilers)' : ''}</summary><div class="catalogue-chapter-content"><h3>${esc(chapter.title)}${chapter.gameTitle ? `: ${esc(chapter.gameTitle)}` : ''}</h3><ul class="catalogue-missions">${chapter.missions.map(row).join('')}</ul></div></details>`).join('\n')}
<details class="catalogue-notes"><summary>Sources and how these counts differ</summary>${storyCatalogue.coverage?.note ? `<p>${esc(storyCatalogue.coverage.note)}</p>` : '<p>This checklist follows the linked publishers and includes optional activities and other campaign entries. It is not an official Rockstar mission total.</p>'}<p>Sources checked <time datetime="${storyCatalogue.checkedDate}">${fmtDate(storyCatalogue.checkedDate)}</time>: ${storyCatalogue.sources.map((s) => `<a href="${esc(s.url)}" rel="noopener">${esc(s.publisher)}</a>`).join(' · ')}. Publisher links open the original coverage.</p>${Array.isArray(storyCatalogue.discrepancies) ? storyCatalogue.discrepancies.filter((note) => typeof note === 'string').map((note) => `<p>${esc(note)}</p>`).join('') : ''}</details>
</section>`;
}
// Every availability statement on the hub comes from the guides actually published in this build.
function missionIndex() {
  const tested = missions.filter((mission) => mission.tested);
  const community = missions.filter((mission) => mission.community);
  const count = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  if (!missions.length) return `${chapterCatalogue()}<section class="mission-list" id="mission-guides"><h2 id="walkthroughs">Our mission guides</h2><p>No mission guides are published yet. A guide appears here only after the retail release is confirmed and its steps are checked against gameplay.</p></section>`;
  const item = (mission, note) => `<li><a href="${mission.url}">${esc(mission.h1 || mission.title)}</a> <span>${note}</span></li>`;
  return `${chapterCatalogue()}<section class="mission-list" id="mission-guides"><div id="walkthroughs">
${tested.length ? `<h2>${count(tested.length, 'verified walkthrough')}</h2><ul>${tested.map((mission) => item(mission, `Tested on ${esc(mission.testedPlatform)}, ${fmtDate(mission.testedDate)}`)).join('')}</ul>` : ''}
${community.length ? `<h2 id="community-guides">Community-sourced guides (${community.length})</h2><p>Built from public gameplay videos and player reports, with every source linked. Not tested by us.</p><ul>${community.map((mission) => item(mission, `Sources checked ${fmtDate(mission.checkedDate)}`)).join('')}</ul>` : ''}
</div></section>`;
}
// What the guide covers and how we know, stated once near the top of every mission guide.
function scopePanel(p) {
  const rows = p.tested
    ? [['Evidence', `Tested by this site on ${esc(p.testedPlatform)} on ${fmtDate(p.testedDate)}.`], ['Game version', p.testedBuild ? esc(p.testedBuild) : 'Not recorded'], ['Other platforms', 'Not tested by us. Steps may differ.']]
    : [['Evidence', `Built from retail gameplay by ${p.independentSources} independent creators or publishers, as declared under Sources. Not tested by this site.`], ['Platforms in sources', p.sourcePlatforms ? esc(p.sourcePlatforms.split(',').map((x) => x.trim()).join(', ')) : 'Not stated'], ['Sources checked', `${fmtDate(p.checkedDate)}. ${REVIEW_LABELS[p.sourceReview]}`]];
  rows.push(['Published by', esc(site.name)]);
  return `<dl class="scope" aria-label="Guide scope">${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>`;
}

// Corrections go to a public form. The warning is part of the link text block so nobody posts a code or personal detail.
function reportLink(p) {
  if (!site.correctionsUrl) return '';
  const href = `${site.correctionsUrl}?title=${encodeURIComponent(`Correction: ${p.url}`)}`;
  return `<p class="report"><a href="${esc(href)}" rel="nofollow noopener">Report a problem with this guide</a>. This opens a public form on GitHub and needs a free GitHub account. Anyone can read what you post, so leave out game codes, account names and personal details.</p>`;
}
function renderPage(p) {
  const video = p.watchVideo;
  const related = p.isMission ? ['missions', 'progression', 'launch-help'].map((slug) => pages.find((page) => page.slug === slug)).filter(Boolean)
    : nav.map(({ url }) => guides.find((guide) => guide.url === url)).filter((item) => item.slug !== p.slug).slice(0, 3);
  const hubPage = pages.find((page) => page.slug === 'missions');
  const crumbs = p.isMission && hubPage ? [{ label: hubPage.nav, url: hubPage.url }, p.h1 || p.title] : p.nav || p.title;
  const at = missions.indexOf(p);
  const neighbours = at < 0 ? '' : [[missions[at - 1], 'Previous guide in the list'], [missions[at + 1], 'Next guide in the list']].filter(([m]) => m).map(([m, label]) => `<li><span>${label}</span> <a href="${m.url}">${esc(m.h1 || m.title)}</a></li>`).join('');
  const missionNav = p.isMission ? `<nav class="mission-nav" aria-label="More mission guides"><ul>${neighbours}<li><a href="/missions/#mission-guides">All mission guides</a></li>${supportUrl ? `<li><a href="${esc(supportUrl)}" rel="nofollow noopener">Support this guide</a></li>` : ''}</ul></nav>` : '';
  const faqHtml = p.faq.length ? `<section class="faq"><h2 id="faq">Frequently asked questions</h2>${p.faq.map((f) => `<details id="${f.id}"><summary>${esc(f.q)}</summary>${f.html}</details>`).join('')}</section>` : '';
  // Keep the answer and first two sections ahead of any optional ad.
  const adPosition = [...p.html.matchAll(/<h2 /g)][2]?.index;
  const ads = p.isMission && p.ads === 'yes' && adPosition !== undefined;
  const hasVideo = p.html.includes('data-video=');
  const content = ads ? p.html.slice(0, adPosition) + adSlot('in-article') + p.html.slice(adPosition) : p.html;
  const launchHelp = p.slug === 'launch-help';
  const missionHub = p.slug === 'missions';
  const phaseLabel = video ? 'Original video' : p.tested ? `Tested on ${esc(p.testedPlatform)}` : p.community ? 'Community-sourced' : missionHub && missions.length ? 'Mission index' : LAUNCHED || missions.length ? 'Launch guide' : 'Pre-launch info';
  const toc = p.toc.length > 2 ? `<nav class="toc" aria-label="On this page"><strong>On this page</strong><ul>${p.toc.map((t) => `<li><a href="#${t.id}">${esc(t.text)}</a></li>`).join('')}${p.faq.length ? '<li><a href="#faq">FAQ</a></li>' : ''}</ul></nav>` : '';
  const freshness = p.community ? `Sources checked <time datetime="${p.checkedDate}">${fmtDate(p.checkedDate)}</time>` : p.isMission ? `Tested <time datetime="${p.testedDate}">${fmtDate(p.testedDate)}</time>${p.testedBuild ? ` · Build ${esc(p.testedBuild)}` : ''}` : `Updated <time datetime="${p.updated}">${fmtDate(p.updated)}</time>`;
  const body = `${pageHero(crumbs, p.h1 || p.title, `<p class="meta"><span class="pill">${phaseLabel}</span> ${freshness} · <a href="/about/#how-we-label-facts">How we use sources</a></p>`)}
<div class="wrap article-grid${video ? ' watch-page' : ''}">
<article>
${video ? `<figure class="watch-video"><video id="watch-video" controls playsinline preload="metadata" width="${video.width}" height="${video.height}" poster="/${video.poster}" aria-label="${esc(p.title)}" aria-describedby="video-description"><source src="/${video.file}" type="video/mp4"><p><a href="/${video.file}">Download the video</a> or <a href="#transcript">read the transcript</a>.</p></video><figcaption id="video-description">${esc(video.caption)} <a href="#transcript">Transcript and visual description</a>.</figcaption></figure>` : ''}
${p.hasPressCoverage ? `<p class="meta">${PRESS_CONTEXT} <a href="#sources">Sources</a>.</p>` : ''}
<div class="answer"><span class="answer-label">Quick answer</span><p>${inline(p.answer)}</p></div>
${p.isMission ? scopePanel(p) : ''}
${launchHelp ? quickJumps(launchJumps, 'Jump to a launch problem') : ''}
${missionHub ? `${searchUi}${missionIndex()}` : ''}
${p.isMission ? `<div data-mission-steps>${content}</div>` : launchHelp ? content.replace('<p>[storage-check]</p>', storageCheck) : content.replace('<div class="table-wrap" data-unlock-table>', `${unlockPicker}<div class="table-wrap" data-unlock-table>`)}
${faqHtml}
${p.sourcesHtml ? `<section class="sources"><h2 id="sources">Sources</h2>${p.sourcesHtml}</section>` : ''}
${reportLink(p)}
${missionNav}
</article>
${video || !toc ? '' : `<aside class="side">${toc}</aside>`}
</div>
<section class="wrap related"><h2>Keep reading</h2><div class="cards">${related.map(card).join('')}</div></section>`;
  const jsonld = [
    // datePublished only when the guide records its first public date. It is never copied from "updated".
    { '@context': 'https://schema.org', '@type': 'Article', headline: p.h1 || p.title, description: p.description, ...(p.published ? { datePublished: p.published } : {}), dateModified: p.updated, mainEntityOfPage: BASE + p.url, author: org, publisher: org, about: { '@type': 'VideoGame', name: 'Grand Theft Auto VI' }, ...(p.isMission && hubPage ? { isPartOf: { '@type': 'CollectionPage', name: hubPage.title, url: BASE + hubPage.url } } : {}) },
    { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [{ name: 'Home', url: '/' }, ...(Array.isArray(crumbs) ? crumbs.slice(0, -1) : []).map((c) => ({ name: c.label, url: c.url })), { name: Array.isArray(crumbs) ? crumbs.at(-1) : crumbs, url: p.url }].map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: BASE + c.url })) },
  ];
  if (missionHub && storyCatalogue) {
    jsonld.push({
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      '@id': BASE + p.url,
      name: p.title,
      url: BASE + p.url,
      dateModified: p.updated,
      citation: storyCatalogue.sources.map((source) => source.url),
      mainEntity: {
        '@type': 'ItemList',
        name: 'GTA 6 missions by chapter',
        numberOfItems: storyCatalogue.chapters.length,
        itemListElement: storyCatalogue.chapters.map((chapter, index) => ({
          '@type': 'ListItem', position: index + 1, name: `Chapter ${index + 1}`,
          url: BASE + p.url + '#catalogue-' + chapter.id
        }))
      }
    });
  }
  if (video) jsonld.push({ '@context': 'https://schema.org', '@type': 'VideoObject', '@id': `${BASE}${p.url}#video`, name: p.title, description: p.description, thumbnailUrl: [`${BASE}/${video.poster}`], uploadDate: video.uploaded, duration: `PT${video.seconds}S`, contentUrl: `${BASE}/${video.file}`, url: BASE + p.url, mainEntityOfPage: { '@type': 'WebPage', '@id': BASE + p.url }, creator: { '@type': 'Organization', name: video.creator }, inLanguage: site.language, width: video.width, height: video.height });
  if (p.faq.length) jsonld.push({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: p.faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: `${p.hasPressCoverage ? PRESS_CONTEXT + ' ' : ''}${f.text}` } })) });
  const full = `${p.title} | ${site.name}`;
  const scripts = `${missionHub || p.faq.length ? searchScript : ''}${missionHub && storyCatalogue ? '<script defer src="/mission-browser.js"></script><script defer src="/story-progress.js"></script>' : ''}${launchHelp ? '<script defer src="/storage.js"></script>' : ''}${hasVideo ? '<script defer src="/video.js"></script>' : ''}${p.html.includes('data-unlock-table') ? '<script defer src="/unlock.js"></script>' : ''}${p.isMission ? '<script defer src="/mission-share.js"></script>' : ''}`;
  return layout({ title: full.length <= 65 ? full : p.title, description: p.description, url: p.url, body, jsonld, scripts, ads, ...(video ? { socialImage: `/${video.poster}`, socialWidth: video.width, socialHeight: video.height } : {}) });
}

// Guides people can read, newest change first. About and privacy are left out.
const recentlyUpdated = () => pages.filter((p) => p.nav || p.isMission).sort((a, b) => b.updated.localeCompare(a.updated) || a.order - b.order);
function renderHome() {
  const featured = nav.map(({ url }) => guides.find((guide) => guide.url === url));
  const topFaq = featured.flatMap((p) => p.faq.slice(0, 1).map((f) => ({ ...f, html: f.html.replace(/href="#/g, `href="${p.url}#`), url: p.url + '#' + f.id })));
  const communityOnly = missions.length && missions.every((mission) => mission.community);
  const body = `<section class="hero">
${scene()}
<div class="wrap hero-inner">
<p class="eyebrow">Unofficial GTA 6 guide</p>
<h1>GTA 6 <span>missions and walkthroughs</span></h1>
<p class="lede">${communityOnly && storyCatalogue ? 'Find the mission on your screen, or open the five-chapter checklist to pick up where you left off.' : communityOnly ? 'Find your mission or objective in guides built from public gameplay sources.' : missions.length ? 'Search for the objective on your screen or open a mission guide.' : 'Check when your copy unlocks, choose your minimap, or compare the first reviews.'}</p>
${searchUi}
<div class="hero-cta">
<a class="btn" href="${missions.length ? '/missions/' : '/navigation-settings/'}">${storyCatalogue && missions.length ? 'Open mission checklist' : missions.length ? 'Browse mission guides' : 'Choose your minimap'}</a>
<a class="btn btn-ghost" href="/release-date/#ps5-unlock-time-by-store-region">Check my PS5 unlock time</a>
<a class="btn btn-ghost" href="/reviews/#critics-verdict">Compare the reviews</a>
</div>
</div>
</section>
<section class="facts"><div class="wrap facts-row">${site.keyFacts.map((f) => `<a href="${f.url}"><span>${esc(f.label)}</span><b>${esc(f.value)}</b></a>`).join('')}</div></section>
<div class="wrap">
${missions.length ? `<section><h2 id="opening-missions">Opening missions</h2>${quickJumps(missions.slice(0, 3).map((mission) => ({ label: mission.h1 || mission.title, url: mission.url })), 'Opening missions')}</section>` : ''}
<section><h2>Launch help</h2>${quickJumps(launchJumps, 'Launch problems')}</section>
<section><h2>Guides</h2><div class="cards">${[...featured, ...guides.filter((guide) => !featured.includes(guide))].map(card).join('')}</div></section>
<section><h2>Explore Leonida</h2><div class="regions">${site.regions.map((r, i) => `<a class="region r${i + 1}" href="/map-locations/#${slugify(r.name)}"><b>${esc(r.name)}</b><span>${esc(r.blurb)}</span></a>`).join('')}</div></section>
<section><h2 id="latest-updates">Latest guide updates</h2><ul class="news">${recentlyUpdated().slice(0, 5).map((p) => `<li><a href="${p.url}">${esc(p.h1 || p.title)}</a><span>${p.isMission ? esc(statusLabel(p)) : `Updated <time datetime="${p.updated}">${fmtDate(p.updated)}</time>`}</span></li>`).join('')}</ul><p><a href="/feed.xml">Follow updates in a feed reader</a></p></section>
<section class="faq"><h2>Top questions</h2>${topFaq.map((f) => `<details><summary>${esc(f.q)}</summary>${f.html}<p><a href="${f.url}">Read the full guide →</a></p></details>`).join('')}</section>
</div>`;
  const jsonld = [
    { '@context': 'https://schema.org', '@type': 'WebSite', name: site.name, url: BASE + '/', description: site.description, publisher: org },
    { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: topFaq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.text } })) },
  ];
  return layout({ title: `${site.name}: ${site.tagline}`, description: site.description, url: '/', body, jsonld, ogType: 'website', scripts: searchScript });
}

function renderNews() {
  // Hide explicitly labeled spoilers, not rumors or articles advertised as spoiler-free.
  const spoilerLabel = /\[\s*(?:(?:major|story)\s+)?spoilers?\s*\]|\(\s*(?:(?:major|story)\s+)?spoilers?\s*\)|\bspoiler\s+(?:warning|alert)\b|^(?:(?:major|story)\s+)?spoilers?(?![- ]free)\s*[:—–-]/i;
  const spoilers = news.filter(({ title }) => spoilerLabel.test(title));
  const visible = news.filter(({ title }) => !spoilerLabel.test(title));
  const body = `${pageHero('News', 'Latest GTA 6 News Headlines', `<p class="meta"><span class="pill">Auto-updated</span> Refreshed <time datetime="${NOW.toISOString()}">${fmtDate(NOW.toISOString())}</time></p>`)}
<div class="wrap narrow"><p>Headlines about GTA 6 from established gaming outlets. Each link opens the original article on the publisher's site. This list refreshes each time the site rebuilds.</p>
${visible.length ? newsList(visible) : ''}
${spoilers.length ? `<section class="faq"><details><summary>Headlines marked as spoilers (${spoilers.length})</summary><p>These publisher titles may reveal story details.</p>${newsList(spoilers)}</details></section>` : ''}</div>`;
  return layout({ title: `Latest GTA 6 News Headlines | ${site.name}`, description: 'The latest GTA 6 news headlines from established gaming outlets, refreshed daily, with links to the original articles.', url: '/news/', body, ogType: 'website', index: false });
}

const searchAliases = {
  '/missions/#checkpoint-or-replay': ['retry checkpoint', 'manual save', 'replay mission', 'restart checkpoint', 'replay a completed mission'],
  '/progression/#no-mission-showing': ['no missions appearing', 'no new missions', 'explore the area', 'no mission marker'],
  '/save-game/#save-greyed-out': ['save greyed out', 'save grayed out', 'cant save during mission'],
  '/save-game/#load-an-older-save': ['reload old save', 'lost autosave', 'load game'],
  '/missions/lab-fees/#lab-door-code': ['lab fees first code', 'shop keypad code'],
  '/missions/lab-fees/#lockup-code': ['second code', 'Brians lockup keypad', 'rent mission second door'],
  '/missions/unwanted-attention/#find-the-phoenix': ['impound mission', 'which car in the impound'],
  '/missions/just-a-scratch/#look-at-joey': ['look at joey', 'how to greet joey'],
  '/navigation-settings/#change-the-minimap': ['mini map', 'route line', 'missing GPS route', 'turn on the map'],
  '/map-locations/#take-a-train': ['ride a train', 'train fare', 'train station'],
  '/missions/buck-me/#open-buckme': ['BuckMe app', 'bank setup on phone', 'banking tutorial'],
  '/map-locations/#fast-travel': ['fast travel', 'call a taxi', 'Paradise Taxi', 'RydeMe', 'skip the ride'],
  '/money-making/#early-cash-stash': ['where to store cash', 'bedroom floorboards', 'bank account', 'cash stash'],
  '/navigation-settings/#auto-drive': ['auto drive', 'automatic driving', 'cinematic driving controls'],
  '/navigation-settings/#drive-without-the-minimap': ['GPS directions without minimap', 'drive with no map'],
  '/reviews/#video-reviews': ['watch GTA 6 reviews', 'GTA 6 review video'],
  '/reviews/': ['GTA 6 reviews', 'video reviews', 'critic scores', 'worth buying', 'review roundup'],
  '/missions/': ['story mission list', 'all walkthroughs', 'mission order', 'where am i in the story'],
  '/progression/': ['what to do next', 'next available mission', 'mission not starting', 'story unlock'],
  '/money-making/': ['how to get money', 'earn cash', 'make money', 'how to sell stolen goods'],
  '/editions-price/': ['buy gta 6', 'standard vs ultimate', 'which edition should i buy', 'price', 'physical disc or code'],
  '/release-date/': ['when can i play', 'what time does it unlock', 'launch time', 'united states pacific release time', 'release time ps5', 'uk release time', 'australia release time', 'new zealand release time', 'unlock time in my time zone'],
  '/launch-help/#not-enough-space': ['not enough storage', 'storage full', 'free space', 'file size', 'download size', 'how many gb', 'need an ssd', 'storage calculator'],
  '/launch-help/#boxed-code-not-working': ['voucher not working', 'can’t redeem code'],
  '/launch-help/#code-missing-or-unreadable': ['missing code', 'code not in box', 'no code', 'damaged voucher'],
  '/launch-help/#wrong-region': ['code region mismatch', 'wrong country', 'code for a different region'],
  '/launch-help/#code-already-redeemed': ['code already redeemed', 'code already used', 'code has been used'],
  '/launch-help/#missing-after-redemption': ['game not in library', 'already owned', 'download not showing'],
  '/launch-help/#installed-but-locked': ['game locked', 'padlock', 'lock icon', 'restore licenses', 'game missing or locked', 'cannot launch'],
  '/launch-help/#xbox-one-cloud-gaming': ['can i play on xbox one', 'xbox one', 'cloud gaming', 'game pass', 'cloud playtime'],
  '/launch-help/#is-it-down-check-the-official-status-pages': ['servers down', 'is psn down', 'is gta 6 down', 'server status'],
  '/launch-help/#can-you-play-gta-6-offline-on-ps5': ['play offline', 'no internet', 'without internet', 'offline mode', 'console sharing and offline play', 'primary ps5'],
  '/launch-help/#who-to-contact': ['which support', 'contact rockstar', 'contact playstation', 'mission bug', 'checkpoint bug'],
};

const pageAliases = (p) => (p.aliases ? p.aliases.split('|').map((alias) => alias.trim()).filter(Boolean) : []);
const pressFields = (p) => p.hasPressCoverage ? { context: PRESS_CONTEXT } : {};
// Search and AI exports keep the tested/untested distinction, the date and the citations.
const missionFields = (p) => (p.isMission ? { status: p.tested ? 'tested' : 'community', label: statusLabel(p), date: p.tested ? p.testedDate : p.checkedDate, ...(p.community ? { review: p.sourceReview } : {}), platform: p.tested ? p.testedPlatform : p.sourcePlatforms || '', sources: p.sourceLinks } : {});
// A mission search record carries only the sources cited inside its own excerpt (sourceScope "cited").
// A tested guide's uncited excerpt keeps the page list as background reading (sourceScope "page"); its evidence is our own play.
// A community excerpt with no citation gets no record at all, so no unsupported text is shown with borrowed sources.
const firstBlock = (html) => (html.match(/<(p|ol|ul)>[\s\S]*?<\/\1>/) || [''])[0];
function sourcesFor(p, html) {
  if (!p.isMission) return {};
  const nums = [...new Set([...html.matchAll(/href="#source-(\d+)"/g)].map((x) => Number(x[1])))];
  const records = nums.length ? nums.map((n) => p.sourceRecords[n - 1]) : p.tested ? p.sourceRecords : [];
  return { sources: records.map((r) => r.url), evidence: records.map(({ n, url, by, group, at }) => ({ n, url, ...(by ? { by } : {}), ...(group ? { group } : {}), ...(at ? { at } : {}) })), sourceScope: nums.length ? 'cited' : p.tested ? 'page' : 'none' };
}
const unsupported = (record) => record.status === 'community' && record.sourceScope === 'none';
const parentFields = (p) => (p.isMission ? { parent: p.h1 || p.title, parentAliases: pageAliases(p) } : {});
function sectionResults(page) {
  const parts = page.html.split(/<h[23] id="([^"]+)">(.*?)<\/h[23]>/);
  const results = [];
  for (let i = 1; i < parts.length; i += 3) {
    const [id, heading, body] = parts.slice(i, i + 3);
    const url = `${page.url}#${id}`;
    const block = page.isMission ? firstBlock(body) : (body.match(/<(?:p|ol|ul)>[\s\S]*?<\/(?:p|ol|ul)>/) || [body])[0];
    const summary = stripTags(block.replace(NO_CITES, ''));
    const record = { q: stripTags(heading), a: summary.slice(0, 220), url, kind: page.isMission ? 'objective' : 'support', aliases: searchAliases[url] || [], ...pressFields(page), ...parentFields(page), ...missionFields(page), ...sourcesFor(page, block) };
    if (summary && !unsupported(record)) results.push(record);
  }
  return results;
}

// ---------- write ----------
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const write = (rel, data) => { const f = path.join(OUT, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, data); };

write('index.html', renderHome());
for (const p of pages) write(`${p.slug}/index.html`, renderPage(p));
if (news.length) write('news/index.html', renderNews());
write('404.html', layout({ title: `Page not found | ${site.name}`, description: 'This page does not exist. Use the links below to find a GTA 6 guide.', url: '/404.html', body: `${pageHero('Not found', 'Page not found', '')}<div class="wrap"><p>Try one of these guides.</p><div class="cards">${guides.map(card).join('')}</div></div>`, index: false }));
for (const f of fs.readdirSync(path.join(ROOT, 'assets'))) fs.copyFileSync(path.join(ROOT, 'assets', f), path.join(OUT, f));
const searchable = [...guides, ...missions.filter((page) => !page.nav)];
write('search.json', JSON.stringify([
  ...searchable.map((p) => ({ q: p.h1 || p.title, a: stripTags(inline(p.answer).replace(NO_CITES, '')), url: p.url, aliases: [...(searchAliases[p.url] || []), ...pageAliases(p)], ...pressFields(p), ...missionFields(p), ...sourcesFor(p, inline(p.answer)) })),
  ...searchable.flatMap((p) => sectionResults(p).filter((section) => p.isMission || p.slug === 'launch-help' || searchAliases[section.url])),
  ...searchable.flatMap((p) => p.faq.map((f) => { const block = p.isMission ? firstBlock(f.html) : f.html; return { q: f.q, a: stripTags(block.replace(NO_CITES, '')).slice(0, 220), url: `${p.url}#${f.id}`, ...pressFields(p), ...parentFields(p), ...missionFields(p), ...sourcesFor(p, block) }; }).filter((record) => !unsupported(record))),
]));

const latest = pages.map((p) => p.updated).sort().pop();
write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">
<url><loc>${BASE}/</loc><lastmod>${latest}</lastmod></url>
${pages.map((p) => `<url><loc>${BASE}${p.url}</loc><lastmod>${p.updated}</lastmod>${p.watchVideo ? `<video:video><video:thumbnail_loc>${BASE}/${p.watchVideo.poster}</video:thumbnail_loc><video:title>${esc(p.title)}</video:title><video:description>${esc(p.description)}</video:description><video:content_loc>${BASE}/${p.watchVideo.file}</video:content_loc><video:duration>${p.watchVideo.seconds}</video:duration><video:publication_date>${p.watchVideo.uploaded}</video:publication_date></video:video>` : ''}</url>`).join('\n')}
</urlset>
`);
// Search and AI crawlers are explicitly welcome.
const bots = ['Googlebot', 'Bingbot', 'GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-SearchBot', 'Claude-User', 'PerplexityBot', 'Perplexity-User', 'Google-Extended', 'Applebot-Extended', 'CCBot'];
write('robots.txt', `User-agent: *\nAllow: /\n\n${bots.map((b) => `User-agent: ${b}\nAllow: /\n`).join('\n')}\nSitemap: ${BASE}/sitemap.xml\n`);
const plainAnswer = (p) => stripTags(inline(p.answer).replace(NO_CITES, ''));
write('llms.txt', `# ${site.name}

> ${site.description} Source links accompany guides and gameplay observations. Last updated ${latest}.

## Guides

${searchable.map((p) => `- [${p.title}](${BASE}${p.url}): ${p.hasPressCoverage ? `[${PRESS_CONTEXT}] ` : ''}${p.isMission ? `[${statusLabel(p)}] ` : ''}${plainAnswer(p)}`).join('\n')}

## Optional

- [Full text of all guides](${BASE}/llms-full.txt)
- [About, sources and disclosure](${BASE}/about/)
`);
write('llms-full.txt', searchable.map((p) => `# ${p.title}\nURL: ${BASE}${p.url}\n${p.published ? `First published: ${p.published}\n` : ''}Last updated: ${p.updated}\n${p.isMission ? `Status: ${statusLabel(p)}\n${p.community && p.sourcePlatforms ? `Platforms in sources: ${p.sourcePlatforms}\n` : ''}${p.tested && p.testedBuild ? `Game version tested: ${p.testedBuild}\n` : ''}` : ''}\n${p.hasPressCoverage ? `Source context: ${PRESS_CONTEXT}\n` : ''}Quick answer: ${stripTags(inline(p.answer))}\n\n${p.plain}\n\n${p.faq.map((f) => `Q: ${f.q}\nA: ${f.text}`).join('\n\n')}${p.sourceLinks.length ? `\n\nSources:\n${(p.isMission ? p.sourceRecords.map((r) => `[${r.n}] ${r.url}${sourceMeta(r) ? ` (${sourceMeta(r)})` : ''}`) : p.sourceLinks.map((link) => `- ${link}`)).join('\n')}` : ''}`).join('\n\n---\n\n') + '\n');
const feedPages = recentlyUpdated().slice(0, 30);
write('feed.xml', `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
<title>${esc(site.name)} guide updates</title>
<subtitle>${esc(site.description)}</subtitle>
<link href="${BASE}/feed.xml" rel="self"/>
<link href="${BASE}/"/>
<id>${BASE}/</id>
<updated>${latest}T12:00:00Z</updated>
<author><name>${esc(site.name)}</name></author>
${feedPages.map((p) => `<entry><title>${esc(p.h1 || p.title)}</title><link href="${BASE}${p.url}"/><id>${BASE}${p.url}</id><updated>${p.updated}T12:00:00Z</updated><summary>${esc(`${p.isMission ? `${statusLabel(p)}. ` : ''}${p.description}`)}</summary></entry>`).join('\n')}
</feed>
`);
if (site.indexNowKey) write(`${site.indexNowKey}.txt`, site.indexNowKey + '\n');
if (adReady) write('ads.txt', `google.com, ${site.adsenseClient.replace('ca-', '')}, DIRECT, f08c47fec0942fa0\n`);

console.log(`Built ${pages.length + 1 + (news.length ? 1 : 0)} pages to dist/ (${LAUNCHED ? 'post-launch' : 'pre-launch'} mode, ${news.length} headlines)`);
if (BASE.includes('example.com')) console.warn('NOTE: baseUrl in site.json is still https://example.com. Set your real domain before deploying.');
