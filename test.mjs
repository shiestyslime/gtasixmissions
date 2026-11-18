// Regression tests. Run: node test.mjs
// Every fixture is created in a temporary copy of the project. Nothing is written to content/ or dist/ here.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gsm-test-'));
for (const item of ['build.mjs', 'check.mjs', 'site.json', 'assets', 'content', 'data']) fs.cpSync(path.join(ROOT, item), path.join(tmp, item), { recursive: true });
fs.mkdirSync(path.join(tmp, 'content/missions'), { recursive: true });
const productionSite = JSON.parse(fs.readFileSync(path.join(tmp, 'site.json'), 'utf8'));
// Historical cases start from explicit fixture state, regardless of what is live today.
// The untouched production copy is built below before this baseline is ever written.
const baseSite = {
  ...productionSite,
  communityGuides: { enabled: false, releaseConfirmedOn: '', releaseSource: '' },
  ps5Unlocks: productionSite.ps5Unlocks.map((u) => ({ ...u, checked: '2026-11-15' })),
  adsEnabled: false,
  adsConsentConfirmed: false,
};
const setSite = (patch) => fs.writeFileSync(path.join(tmp, 'site.json'), JSON.stringify({ ...baseSite, ...patch }, null, 2));
const gateOn = { communityGuides: { enabled: true, releaseConfirmedOn: '2026-11-19', releaseSource: 'https://www.rockstargames.com/VI' } };
const run = (script, date, extra = {}) => { const env = { ...process.env, NO_FETCH: '1', ...extra }; delete env.BUILD_DATE; if (date) env.BUILD_DATE = date; const r = spawnSync('node', [script], { cwd: tmp, encoding: 'utf8', env }); return { ok: r.status === 0, out: r.stdout + r.stderr }; };
const out = (rel) => fs.readFileSync(path.join(tmp, 'dist', rel), 'utf8');
const clearMissions = () => { const dir = path.join(tmp, 'content/missions'); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true }); };

const DEFAULT_SOURCES = [{ url: 'https://www.ign.com/wikis/a', by: 'IGN', group: 'ign', at: 'Dock section' }, { url: 'https://www.gamespot.com/guides/b', by: 'GameSpot', group: 'gamespot', at: 'Step 2' }];
// A source is a URL string (gets its own creator and group) or { url, by, group, at }.
const sourceLine = (src, i) => { const r = typeof src === 'string' ? { url: src, by: `Creator ${i + 1}`, group: `origin-${i + 1}`, at: 'Section one' } : src; return `- [Source ${i + 1}](${r.url})${['by', 'group', 'at'].filter((k) => r[k]).map((k) => ` | ${k}: ${r[k]}`).join('')}`; };
const community = (over = {}, sources = DEFAULT_SOURCES) => {
  const meta = { title: 'FIXTURE Dock Job Walkthrough', slug: 'missions/zz-fixture-dock-job', status: 'community', description: 'Private regression fixture for the community-sourced guide layout. Never published.', answer: 'Fixture answer for the dock job. {src:1,2}', updated: '2026-11-20', checkedDate: '2026-11-20', sourceBasis: 'retail-gameplay', sourceReview: 'automated', aliases: 'dock job | harbor job', order: '90', ...over };
  return `---\n${Object.entries(meta).filter(([, v]) => v !== null).map(([k, v]) => `${k}: ${v}`).join('\n')}\n---\n\n## How to start\n\nFixture dock start text. {src:1,2}\n\n## Reach the crane {#crane-step}\n\n1. Fixture crane step. {src:1,2}\n\n## FAQ\n\n### What if the crane does not move?\n\nFixture crane answer. {src:1,2}\n\n## Sources\n\n${sources.map(sourceLine).join('\n')}\n`;
};
const tested = (over = {}) => {
  const meta = { title: 'FIXTURE Bank Run Walkthrough', slug: 'missions/zz-fixture-bank-run', status: 'published', description: 'Private regression fixture for the tested guide layout. It is never published anywhere.', answer: 'Fixture answer for the bank run.', updated: '2026-11-20', testedPlatform: 'PS5', testedDate: '2026-11-20', order: '91', ...over };
  return `---\n${Object.entries(meta).map(([k, v]) => `${k}: ${v}`).join('\n')}\n---\n\n## How to start\n\nFixture bank start text.\n\n## Open the vault\n\n1. Fixture vault step.\n\n## Leave the area\n\nFixture exit text.\n`;
};
const put = (name, text) => fs.writeFileSync(path.join(tmp, 'content/missions', name), text);

let failed = 0;
const expect = (name, cond, detail = '') => { if (!cond) failed++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${cond || !detail ? '' : `\n     ${detail.trim().split('\n').slice(-2).join(' ')}`}`); };
const rejects = (name, date, needle) => { const r = run('build.mjs', date); expect(name, !r.ok && r.out.includes(needle), r.out); };

// 1. Production content, untouched, at today's real date
let r = run('build.mjs'); expect('production content builds today', r.ok, r.out);
r = run('check.mjs'); expect('production content passes the checker', r.ok, r.out);

// Keep production missions, release switches and editorial dates out of simulated cases.
// Production content and its real dates were checked above; publication-date fixtures are added below.
clearMissions();
setSite({});
const guideFiles = fs.readdirSync(path.join(tmp, 'content')).filter((f) => f.endsWith('.md'));
for (const f of guideFiles) {
  const file = path.join(tmp, 'content', f);
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace(/^---\n([\s\S]*?)\n---/, (_, meta) => `---\n${meta.replace(/^updated: .*$/m, 'updated: 2026-11-15').replace(/^published: .*\n?/m, '')}\n---`));
}
// These answers exercise the hub's state change without depending on editorial wording.
const hubFile = path.join(tmp, 'content/missions.md');
fs.writeFileSync(hubFile, fs.readFileSync(hubFile, 'utf8').replace(/^answer: .*$/m, 'answer: No mission guides are published here yet.').replace(/^answer_missions: .*$/m, 'answer_missions: Search the mission name or objective in the guides below.'));
r = run('build.mjs', '2026-11-16'); expect('general guides build on a simulated pre-launch day', r.ok, r.out);
const guideFile = path.join(tmp, 'content/launch-help.md');
const guideText = fs.readFileSync(guideFile, 'utf8');
fs.writeFileSync(guideFile, guideText.replace('updated: 2026-11-15', 'updated: 2099-12-31')); rejects('general guide with a future updated date refused', '2026-11-20', '"updated"');
fs.writeFileSync(guideFile, guideText.replace('updated: 2026-11-15', 'updated: 2026-02-30')); rejects('general guide with an impossible updated date refused', '2026-11-20', '"updated"');
fs.writeFileSync(guideFile, guideText);

// 2. Community gate
put('a.md', community());
rejects('community guide refused while the switch is off', '2026-11-20', 'switched off');
setSite(gateOn);
put('a.md', community({ updated: '2026-11-16', checkedDate: '2026-11-16' }));
rejects('community guide refused before launch even with the switch on', '2026-11-16', 'before the mission publication time');
put('a.md', community());
setSite({ communityGuides: { ...gateOn.communityGuides, releaseSource: 'https://www.ign.com/x' } });
rejects('release confirmation must cite an official site', '2026-11-20', 'releaseSource');
setSite({ communityGuides: { ...gateOn.communityGuides, releaseConfirmedOn: '2026-11-30' } });
rejects('release confirmation cannot be dated in the future', '2026-11-20', 'releaseConfirmedOn');
setSite(gateOn);

// 3. Dates and evidence fields
put('a.md', community({ checkedDate: '2099-12-31' })); rejects('checkedDate 2099-12-31 refused', '2026-11-20', 'checkedDate');
put('a.md', community({ updated: '2099-12-31' })); rejects('community guide with a future updated date refused', '2026-11-20', '"updated"');
put('a.md', community({ updated: '2026-02-30' })); rejects('community guide with an impossible updated date refused', '2026-11-20', '"updated"');
put('a.md', community({ checkedDate: '2026-02-30' })); rejects('impossible calendar date refused', '2026-11-20', 'checkedDate');
put('a.md', community({ checkedDate: '2026-11-10' })); rejects('checkedDate before launch refused', '2026-11-20', 'checkedDate');
put('a.md', community({}, ['https://example.com/a', 'https://other.example.com/b'])); rejects('example.com sources refused', '2026-11-20', 'placeholder');
put('a.md', community({}, [{ url: 'https://www.ign.com/a', by: 'IGN', group: 'ign', at: 'One' }, { url: 'https://uk.ign.com/b', by: 'IGN UK', group: 'ign', at: 'Two' }])); rejects('two pages from one origin group are not two sources', '2026-11-20', 'two independent origin groups');
put('a.md', community({ sourceBasis: null })); rejects('missing sourceBasis refused', '2026-11-20', 'sourceBasis');
put('a.md', community({ independentSources: '1' })); rejects('one independent source refused', '2026-11-20', 'independentSources');
put('a.md', community({ independentSources: '5' })); rejects('independent count above linked sites refused', '2026-11-20', 'independentSources');
put('a.md', community({ sourceReview: 'Alex Example' })); rejects('invented reviewer identity refused', '2026-11-20', 'sourceReview');
put('a.md', community({ testedPlatform: 'PS5' })); rejects('community guide with tested fields refused', '2026-11-20', 'tested fields');
clearMissions();
put('b.md', tested({ testedDate: '2026-12-25' })); rejects('tested date in the future refused', '2026-11-20', 'testedDate');
put('b.md', tested({ testedDate: '2026-11-01' })); rejects('tested date before launch refused', '2026-11-20', 'testedDate');
put('b.md', tested({ updated: '2099-12-31' })); rejects('tested guide with a future updated date refused', '2026-11-20', '"updated"');
put('b.md', tested({ updated: '2026-11-18', testedDate: '2026-11-18' })); rejects('tested guide refused before launch time', '2026-11-18T10:00:00Z', 'before the mission publication time');
setSite({}); put('b.md', tested()); rejects('tested guide refused until the release is confirmed in site.json', '2026-11-20', 'releaseConfirmedOn');
setSite({ communityGuides: { enabled: false, releaseConfirmedOn: '2026-11-19', releaseSource: 'https://www.rockstargames.com/VI' } });
r = run('build.mjs', '2026-11-20'); expect('tested guide builds with a confirmed release even while community guides are off', r.ok, r.out);
setSite(gateOn);

// 3b. Mission publication time: exact boundaries, evidence still required, safe fallback, bad settings refused
const builds = (name, date) => { const b = run('build.mjs', date); expect(name, b.ok, b.out); };
clearMissions();
const launchNight = { updated: '2026-11-18', testedDate: '2026-11-18' }; // a local date on the first regional launch night
const iso = (ms) => new Date(ms).toISOString().replace('.000Z', 'Z');
const GATE = Date.parse(baseSite.missionPublishAfter);
const beforeGate = iso(GATE - 1000), atGate = iso(GATE), afterGate = iso(GATE + 1000);
expect('the configured publication time is the official NZ PS5 unlock, 18 hours before the US PS5 time', baseSite.missionPublishAfter === '2026-11-18T11:00:00Z' && /store\.playstation\.com\/en-nz\//.test(baseSite.missionPublishAfterSource) && Date.parse('2026-11-19T05:00:00Z') - GATE === 18 * 36e5, baseSite.missionPublishAfter);
expect('site.json sets a mission publication time earlier than launchDate', Date.parse(baseSite.missionPublishAfter) < Date.parse(baseSite.launchDate), `${baseSite.missionPublishAfter} ${baseSite.launchDate}`);
setSite(gateOn); put('b.md', tested(launchNight));
rejects('tested guide refused one second before the publication time', beforeGate, 'before the mission publication time');
builds('tested guide with release evidence builds at the publication time', atGate);
expect('editorial wording is still pre-launch at that moment', /pre-launch mode/.test(run('build.mjs', atGate).out));
builds('tested guide with release evidence builds after the publication time', afterGate);
setSite({}); rejects('tested guide refused at the publication time without release evidence', atGate, 'releaseConfirmedOn');
setSite({ communityGuides: { enabled: true, releaseConfirmedOn: '', releaseSource: '' } }); rejects('reaching the time does not publish even with the community switch on', atGate, 'releaseConfirmedOn');
clearMissions(); put('a.md', community({ updated: '2026-11-18', checkedDate: '2026-11-18' }));
setSite(gateOn); rejects('community guide refused one second before the publication time', beforeGate, 'before the mission publication time');
builds('community guide with switch and evidence builds at the publication time', atGate);
setSite({ communityGuides: { ...gateOn.communityGuides, enabled: false } }); rejects('community guide refused at the publication time while its switch is off', atGate, 'switched off');
clearMissions(); put('b.md', tested(launchNight));
const noSetting = { ...gateOn, missionPublishAfter: undefined, missionPublishAfterSource: undefined };
setSite(noSetting); rejects('without the setting the gate falls back to launchDate (configured time refused)', atGate, 'before the mission publication time');
rejects('without the setting the US PS5 time is refused too', '2026-11-19T05:00:00Z', 'before the mission publication time');
rejects('fallback refuses one second before launchDate', '2026-11-19T10:59:59Z', 'before the mission publication time');
builds('fallback accepts at launchDate with release evidence', '2026-11-19T11:00:00Z');
clearMissions();
for (const [label, patch, needle] of [
  ['a word', { missionPublishAfter: 'soon' }, 'missionPublishAfter must be'],
  ['a date without a time', { missionPublishAfter: '2026-11-19' }, 'missionPublishAfter must be'],
  ['a time without a zone', { missionPublishAfter: '2026-11-19T05:00:00' }, 'missionPublishAfter must be'],
  ['an impossible date', { missionPublishAfter: '2026-02-30T05:00:00Z' }, 'missionPublishAfter must be'],
  ['an empty value', { missionPublishAfter: '' }, 'missionPublishAfter must be'],
  ['a time far before launch', { missionPublishAfter: '2020-01-01T00:00:00Z' }, '24 hours before launchDate'],
  ['one second more than 24 hours before launchDate', { missionPublishAfter: iso(Date.parse(baseSite.launchDate) - 24 * 36e5 - 1000) }, '24 hours before launchDate'],
  ['a missing source', { missionPublishAfterSource: undefined }, 'missionPublishAfterSource'],
  ['an unofficial source', { missionPublishAfterSource: 'https://www.ign.com/x' }, 'missionPublishAfterSource'],
  ['a non-https source', { missionPublishAfterSource: 'http://store.playstation.com/x' }, 'missionPublishAfterSource'],
]) { setSite({ ...gateOn, ...patch }); rejects(`mission publication setting refused: ${label}`, '2026-11-20', needle); }
setSite(gateOn);

// 3c. Launch-window hub, hub freshness, first-publication date, citations and scope
const hubHtml = () => out('missions/index.html');
const ldOf = (html, type) => [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1])).find((d) => d['@type'] === type);
const lastmod = (url) => (out('sitemap.xml').match(new RegExp(`<loc>https://gtasixmissions.com${url}</loc><lastmod>([^<]+)</lastmod>`)) || [])[1];
const hubDate = () => ({ shown: (hubHtml().match(/Updated <time datetime="([^"]+)"/) || [])[1], ld: ldOf(hubHtml(), 'Article').dateModified, map: lastmod('/missions/') });
const sameDate = (d, v) => d.shown === v && d.ld === v && d.map === v;
const early = atGate; // the earliest regional window, while editorial wording is still pre-launch
clearMissions(); setSite(gateOn);
builds('hub builds with no mission guides in the early unlock window', early);
let h = hubHtml();
expect('hub with zero guides says none are published, and nothing contradicts it', h.includes('No mission guides are published yet') && h.includes('No mission guides are published here yet') && !/\d+ verified walkthrough/.test(h) && !h.includes('There are no verified walkthroughs'));
expect('home with no mission guides points its main button to usable launch help', out('index.html').includes('<a class="btn" href="/navigation-settings/">Choose your minimap</a>') && !out('index.html').includes('Browse mission guides'));
expect('home does not show an empty opening-missions row', !out('index.html').includes('id="opening-missions"'));
expect('hub freshness with zero guides is its own updated date', sameDate(hubDate(), '2026-11-15'), JSON.stringify(hubDate()));
put('b.md', tested({ ...launchNight, updated: '2026-11-19' }));
builds('tested guide builds in the early unlock window', early);
h = hubHtml();
expect('hub with one tested guide lists it and drops every "none published" line', h.includes('1 verified walkthrough') && h.includes('zz-fixture-bank-run') && !/No mission guides are published|no verified walkthroughs/i.test(h) && h.includes('Search the mission name') && h.includes('Mission index</span>'));
expect('adding a guide moves hub date, Article dateModified and sitemap lastmod together', sameDate(hubDate(), '2026-11-19'), JSON.stringify(hubDate()));
clearMissions(); put('a.md', community({ updated: '2026-11-18', checkedDate: '2026-11-18' }));
builds('community guide builds in the early unlock window', early);
h = hubHtml();
expect('community-only hub lists the guide and its status without an empty tested section', h.includes('Community-sourced guides (1)') && h.includes('/missions/zz-fixture-dock-job/') && h.includes('Not tested by us.') && !/\d+ verified walkthrough|No mission guides are published|None of the guides below/.test(h));
expect('community-only hub keeps its existing anchor targets', ['mission-guides', 'walkthroughs', 'community-guides'].every((id) => h.includes(`id="${id}"`)));
expect('home with a community guide opens the mission list and describes public gameplay sources', out('index.html').includes('<a class="btn" href="/missions/">Browse mission guides</a>') && out('index.html').includes('guides built from public gameplay sources'));
put('c.md', community({ title: 'FIXTURE Harbor Job Walkthrough', slug: 'missions/zz-fixture-harbor-job', updated: '2026-11-18', checkedDate: '2026-11-18', order: '91' }));
builds('two community guides build in the early unlock window', early);
h = hubHtml();
expect('multiple community guides appear without inventing tested walkthroughs', h.includes('Community-sourced guides (2)') && ['zz-fixture-dock-job', 'zz-fixture-harbor-job'].every((slug) => h.includes(`/missions/${slug}/`)) && !/\d+ verified walkthrough/.test(h));
put('d.md', community({ title: 'FIXTURE Opening Job', slug: 'missions/zz-fixture-opening-job', updated: '2026-11-18', checkedDate: '2026-11-18', order: '1' }));
put('e.md', community({ title: 'FIXTURE Later Job', slug: 'missions/zz-fixture-later-job', updated: '2026-11-18', checkedDate: '2026-11-18', order: '99' }));
builds('home builds with four mission guides in non-filename order', early);
const openingRow = (out('index.html').match(/<section><h2 id="opening-missions">[\s\S]*?<\/section>/) || [''])[0];
expect('opening row links only the first three guides in story order, above launch help', JSON.stringify([...openingRow.matchAll(/href="([^"]+)"/g)].map((m) => m[1])) === JSON.stringify(['/missions/zz-fixture-opening-job/', '/missions/zz-fixture-dock-job/', '/missions/zz-fixture-harbor-job/']) && out('index.html').indexOf('id="opening-missions"') < out('index.html').indexOf('<h2>Launch help</h2>'));
clearMissions(); put('b.md', tested({ updated: '2026-11-19' }));
builds('hub freshness: first build', '2026-11-20');
const firstHub = hubDate();
builds('hub freshness: unchanged rebuild two days later', '2026-11-22');
expect('an unchanged rebuild does not refresh the hub date', JSON.stringify(hubDate()) === JSON.stringify(firstHub) && firstHub.shown === '2026-11-19', `${JSON.stringify(firstHub)} ${JSON.stringify(hubDate())}`);
put('b.md', tested({ updated: '2026-11-21' }));
builds('hub freshness: listed guide edited', '2026-11-22');
expect('editing a listed guide moves the hub date to that edit', sameDate(hubDate(), '2026-11-21'), JSON.stringify(hubDate()));
expect('the home page and feed still use the newest content date', out('feed.xml').includes('<updated>2026-11-21T12:00:00Z</updated>'));
clearMissions();

// First publication date is kept, never copied from "updated"
r = run('build.mjs', '2026-11-20');
expect('no datePublished is claimed when a guide does not record one', !out('launch-help/index.html').includes('datePublished') && ldOf(out('launch-help/index.html'), 'Article').dateModified === '2026-11-15');
fs.writeFileSync(guideFile, guideText.replace('updated: 2026-11-15', 'updated: 2026-11-15\npublished: 2026-11-15'));
run('build.mjs', '2026-11-20');
expect('a recorded first publication date is used', ldOf(out('launch-help/index.html'), 'Article').datePublished === '2026-11-15');
fs.writeFileSync(guideFile, guideText.replace('updated: 2026-11-15', 'updated: 2026-11-20\npublished: 2026-11-15'));
run('build.mjs', '2026-11-20');
let art = ldOf(out('launch-help/index.html'), 'Article');
expect('editing a guide moves dateModified but keeps datePublished', art.datePublished === '2026-11-15' && art.dateModified === '2026-11-20', JSON.stringify(art));
for (const [label, value, date] of [['later than updated', '2026-11-18', '2026-11-20'], ['impossible', '2026-02-30', '2026-11-20'], ['in the future', '2026-11-25', '2026-11-20']]) {
  fs.writeFileSync(guideFile, guideText.replace('updated: 2026-11-15', `updated: ${label === 'in the future' ? '2026-11-20' : '2026-11-17'}\npublished: ${value}`));
  rejects(`published date refused: ${label}`, date, '"published"');
}
fs.writeFileSync(guideFile, guideText);
put('b.md', tested({ published: '2026-11-15' })); rejects('a mission guide cannot claim publication before launch day', '2026-11-20', '"published"');
clearMissions();

// Citations next to each community step, and scope
put('a.md', community().replace('Fixture crane step. {src:1,2}', 'Fixture crane step.')); rejects('community step without citations refused', '2026-11-20', 'must cite sources from at least two independent groups');
put('a.md', community().replace('Fixture crane step. {src:1,2}', 'Fixture crane step. {src:1}')); rejects('community step citing one group refused', '2026-11-20', 'Fixture crane step');
put('a.md', community().replace('Fixture crane answer. {src:1,2}', 'Fixture crane answer.')); rejects('community FAQ answer without citations refused', '2026-11-20', 'Fixture crane answer');
put('a.md', community({ answer: 'Fixture answer for the dock job.' })); rejects('uncited quick answer refused', '2026-11-20', 'quick answer must cite');
put('a.md', community({ answer: 'Fixture answer for the dock job. {src:1}' })); rejects('quick answer citing one group refused', '2026-11-20', 'quick answer must cite');
put('a.md', community().replace('1. Fixture crane step. {src:1,2}', '1. Fixture crane step. {src:1,2}\n2. Uncited fixture lever step.')); rejects('an uncited list step beside a cited one is refused', '2026-11-20', 'Uncited fixture lever step');
put('a.md', community().replace('Fixture dock start text. {src:1,2}', 'Fixture dock start text. {src:1,2}\n\nUncited fixture paragraph.')); rejects('an uncited paragraph in a cited section is refused', '2026-11-20', 'Uncited fixture paragraph');
put('a.md', community().replace('Fixture dock start text. {src:1,2}', 'Fixture dock start text. {src:1,2}\n\n> Uncited fixture note.')); rejects('an uncited note is refused', '2026-11-20', 'Uncited fixture note');
put('a.md', community().replace('Fixture dock start text. {src:1,2}', 'Fixture dock start text. {src:1,2}\n\n{nav} Press the fixture switch twice.')); rejects('{nav} text without a site link is refused', '2026-11-20', '"{nav}" paragraph');

// Source identity and independence come from the records, not from host names
const yt = (id, extra = '') => `https://www.youtube.com/watch?v=${id}${extra}`;
const A = { url: yt('AAAAAAAAAAA', '&t=754s'), by: 'Creator A', group: 'creator-a', at: '12:34' };
const B = { url: yt('BBBBBBBBBBB'), by: 'Creator B', group: 'creator-b', at: '3:00' };
put('a.md', community({}, [A, B])); builds('two independent YouTube creators on one site are accepted', '2026-11-20');
expect('the scope box shows the derived count of independent groups', out('missions/zz-fixture-dock-job/index.html').includes('by 2 independent creators or publishers'));
put('a.md', community({}, [A, { ...B, by: 'Creator A', group: 'creator-a-two' }])); rejects('two uploads from one creator cannot be two groups', '2026-11-20', 'two origin groups');
put('a.md', community({}, [A, { ...B, by: 'Creator A', group: 'creator-a' }])); rejects('two uploads from one creator count as one group', '2026-11-20', 'two independent origin groups');
for (const [label, variant] of [['youtu.be', 'https://youtu.be/AAAAAAAAAAA'], ['shorts', 'https://www.youtube.com/shorts/AAAAAAAAAAA'], ['mobile', 'https://m.youtube.com/watch?v=AAAAAAAAAAA&feature=share'], ['embed', 'https://www.youtube-nocookie.com/embed/AAAAAAAAAAA'], ['live', 'https://youtube.com/live/AAAAAAAAAAA']]) {
  put('a.md', community({}, [A, { ...B, url: variant }])); rejects(`a ${label} link to the same upload is refused as a second source`, '2026-11-20', 'same upload');
}
put('a.md', community({}, [A, { ...A, url: 'https://youtu.be/AAAAAAAAAAA', at: '3:00' }])); rejects('a URL variant of one upload never adds a second origin, even with matching creator and group', '2026-11-20', 'two independent origin groups');
put('a.md', community({}, [A, { ...A, url: 'https://youtu.be/AAAAAAAAAAA?t=754' }, B])); rejects('the same upload at the same location listed twice is refused', '2026-11-20', 'same location');
put('a.md', community({}, [A, B, { ...A, url: yt('AAAAAAAAAAA', '&t=600'), at: '10:00', by: 'Creator A2' }])); rejects('one upload cannot name a second creator', '2026-11-20', 'different creator or group');
// Long playthroughs: two creators, each cited at two timestamps of one upload
{
  const A1 = { url: yt('AAAAAAAAAAA', '&t=120s'), by: 'Creator A', group: 'creator-a', at: '2:00' };
  const B1 = { url: yt('BBBBBBBBBBB', '&t=150'), by: 'Creator B', group: 'creator-b', at: '2:30' };
  const A2 = { url: `https://youtu.be/AAAAAAAAAAA?t=600`, by: 'creator a', group: 'creator-a', at: '10:00' };
  const B2 = { url: yt('BBBBBBBBBBB', '&t=10m30s'), by: 'Creator B', group: 'creator-b', at: '10:30' };
  put('a.md', community({}, [A1, B1, A2, B2]).replace('1. Fixture crane step. {src:1,2}', '1. Fixture crane step. {src:3,4}'));
  builds('two creators with two timestamp locations each are accepted', '2026-11-20');
  const pg = out('missions/zz-fixture-dock-job/index.html');
  expect('repeated uploads still count as two independent origins', pg.includes('by 2 independent creators or publishers'));
  expect('each timestamp is shown beside its claim and in the source list', /Fixture crane step\.<sup class="cite">\[<a href="#source-3">3<\/a>, <a href="#source-4">4<\/a>\]/.test(pg) && pg.includes('by Creator B · evidence at 10:30 · origin group creator-b'));
  const craneRec = JSON.parse(out('search.json')).find((e) => e.url === '/missions/zz-fixture-dock-job/#crane-step');
  expect('the step search record keeps that step\'s exact timestamps', JSON.stringify(craneRec?.evidence?.map((e) => e.at)) === '["10:00","10:30"]', JSON.stringify(craneRec?.evidence));
  expect('llms-full.txt keeps both locations of one upload', out('llms-full.txt').includes('[1] https://www.youtube.com/watch?v=AAAAAAAAAAA&t=120s (by Creator A · evidence at 2:00') && out('llms-full.txt').includes('[3] https://youtu.be/AAAAAAAAAAA?t=600 (by creator a · evidence at 10:00'));
}
put('a.md', community({}, [DEFAULT_SOURCES[0], { ...DEFAULT_SOURCES[1], url: 'https://www.ign.com/wikis/a?utm_source=x#top' }])); rejects('one article with tracking parameters is the same page', '2026-11-20', 'same upload or page');
put('a.md', community({}, [{ ...DEFAULT_SOURCES[0], group: 'upstream-x' }, { ...DEFAULT_SOURCES[1], group: 'upstream-x' }])); rejects('reports from one upstream source on different sites are one group', '2026-11-20', 'two independent origin groups');
put('a.md', community({}, [{ ...A, at: 'Intro' }, B])); rejects('a video source needs a timestamp', '2026-11-20', 'timestamp');
put('a.md', community({}, [{ ...A, at: '12:35' }, B])); rejects('a video link t= that disagrees with "at" is refused', '2026-11-20', 'does not match');
put('a.md', community({}, [{ url: DEFAULT_SOURCES[0].url, by: 'IGN', at: 'One' }, DEFAULT_SOURCES[1]])); rejects('a source without a group is refused', '2026-11-20', 'needs "group:"');
put('a.md', community({ independentSources: '3' })); rejects('a stated independent count that disagrees with the records is refused', '2026-11-20', 'independentSources');
put('a.md', community({ independentSources: '2' })); builds('a stated count that matches the records is accepted', '2026-11-20');

// Search excerpts carry only their own citations
const C = { url: 'https://www.polygon.com/guide/c', by: 'Polygon', group: 'polygon', at: 'Harbor section' };
put('a.md', community({}, [...DEFAULT_SOURCES, C]).replace('Fixture dock start text. {src:1,2}', 'Fixture dock start text. {src:1,2}\n\n1. Fixture later step. {src:2,3}').replace('## Reach the crane {#crane-step}', '## Getting there\n\n{nav} See [story progression](/progression/).\n\n## Reach the crane {#crane-step}'));
builds('community guide with a third source, a later step and a navigation-only section builds', '2026-11-20');
{
  const idx = JSON.parse(out('search.json'));
  const start = idx.find((e) => e.url === '/missions/zz-fixture-dock-job/#how-to-start');
  expect('a section record carries only the sources cited in its excerpt', start?.sourceScope === 'cited' && start.sources.length === 2 && !start.sources.includes(C.url), JSON.stringify(start?.sources));
  expect('search evidence keeps creator, group and location', start?.evidence?.[0]?.by === 'IGN' && start.evidence[0].group === 'ign' && start.evidence[0].at === 'Dock section');
  expect('a navigation-only section gets no search record', !idx.some((e) => e.url === '/missions/zz-fixture-dock-job/#getting-there'));
  const pg = out('missions/zz-fixture-dock-job/index.html');
  expect('the page lists each source with creator, location and group', pg.includes('<li id="source-3"><a href="https://www.polygon.com/guide/c" rel="noopener">Source 3</a> <span class="source-meta">by Polygon · evidence at Harbor section · origin group polygon</span></li>') && pg.includes('<p class="nav-note">See <a href="/progression/">story progression</a>.</p>'));
  expect('llms-full.txt lists the same source fields', out('llms-full.txt').includes('[3] https://www.polygon.com/guide/c (by Polygon · evidence at Harbor section · origin group polygon)'));
}
put('a.md', community().replace('Fixture crane step. {src:1,2}', 'Fixture crane step. {src:1,9}')); rejects('citation of a missing source refused', '2026-11-20', '{src:9}');
put('a.md', community({ sourcePlatforms: 'PS5, PC' })); rejects('unknown platform in sourcePlatforms refused', '2026-11-20', 'sourcePlatforms');
put('a.md', community({ answer: 'x'.repeat(301) })); rejects('a mission answer longer than 300 characters refused', '2026-11-20', '"answer"');
clearMissions();

// 4. Valid guides keep their labels everywhere
put('a.md', community()); put('b.md', tested());
r = run('build.mjs', '2026-11-20'); expect('valid tested and community guides build after launch', r.ok, r.out);
if (r.ok) {
  // The checker is expected to object here, because fixtures are present. That proves the production guard works.
  const c = run('check.mjs', '2026-11-20'); expect('checker flags fixture content', !c.ok && c.out.includes('test fixture content'), c.out);
  const page = out('missions/zz-fixture-dock-job/index.html');
  expect('community page shows the untested notice and review line', page.includes('Not tested by us yet.') && page.includes('Source check was automated') && page.includes('Community-sourced</span>') && !/Tested on /.test(page));
  expect('guide has the public corrections link with its warning', page.includes('issues/new?title=Correction') && page.includes('leave out game codes'));
  expect('community step shows citation links next to the claim', /Fixture crane step\.<sup class="cite">\[<a href="#source-1">1<\/a>, <a href="#source-2">2<\/a>\]<\/sup>/.test(page) && page.includes('<li id="source-2">') && page.includes('<ol><li id="source-1">'));
  expect('a pinned heading id is used', page.includes('<h2 id="crane-step">Reach the crane</h2>'));
  expect('community page states its evidence scope without a tested claim', page.includes('class="scope"') && page.includes('Built from retail gameplay by 2 independent creators or publishers, as declared under Sources. Not tested by this site.') && page.includes('<dt>Published by</dt><dd>GTA Six Missions</dd>') && !page.includes('No named author'));
  const bankPage = out('missions/zz-fixture-bank-run/index.html');
  expect('tested page states platform, date and untested platforms', bankPage.includes('Tested by this site on PS5 on Nov 20, 2026.') && bankPage.includes('Other platforms</dt><dd>Not tested by us.'));
  const crumbs = ldOf(page, 'BreadcrumbList').itemListElement.map((x) => x.item);
  expect('mission breadcrumb is Home / Missions / guide in both page and JSON-LD', crumbs.length === 3 && crumbs[1].endsWith('/missions/') && crumbs[2].endsWith('/missions/zz-fixture-dock-job/') && /<nav class="crumbs"[^>]*><a href="\/">Home<\/a> <span aria-hidden="true">\/<\/span> <a href="\/missions\/">Missions<\/a>/.test(page));
  expect('mission Article names its hub and claims no first-publication date it lacks', ldOf(page, 'Article').isPartOf?.url.endsWith('/missions/') && !('datePublished' in ldOf(page, 'Article')));
  expect('mission pages link to the neighbouring guide and the full list', page.includes('Next guide in the list</span> <a href="/missions/zz-fixture-bank-run/">') && bankPage.includes('Previous guide in the list</span> <a href="/missions/zz-fixture-dock-job/">') && page.includes('href="/missions/#mission-guides"'));
  const hub = out('missions/index.html');
  expect('hub lists tested and community guides apart', hub.includes('1 verified walkthrough') && hub.includes('id="community-guides"') && hub.indexOf('zz-fixture-bank-run') < hub.indexOf('id="community-guides"') && hub.indexOf('zz-fixture-dock-job') > hub.indexOf('id="community-guides"'));
  const index = JSON.parse(out('search.json'));
  const pageRec = index.find((e) => e.url === '/missions/zz-fixture-dock-job/');
  expect('search page record keeps status, date and source links', pageRec?.status === 'community' && pageRec.date === '2026-11-20' && /not tested/i.test(pageRec.label) && pageRec.sources?.length === 2);
  const dock = index.filter((e) => e.url.startsWith('/missions/zz-fixture-dock-job/'));
  expect('every record from a community guide (page, steps, FAQ) keeps label, date, review state and both sources', dock.length >= 4 && dock.some((e) => e.url.includes('#faq-')) && dock.every((e) => e.status === 'community' && /not tested/i.test(e.label) && /automated check, no human review/.test(e.label) && e.review === 'automated' && e.date === '2026-11-20' && e.sources?.length === 2));
  expect('step and FAQ records carry the parent mission and its aliases', dock.filter((e) => e.url.includes('#')).every((e) => e.parent === 'FIXTURE Dock Job Walkthrough' && e.parentAliases?.includes('harbor job')));
  const bank = index.filter((e) => e.url.startsWith('/missions/zz-fixture-bank-run/'));
  expect('every record from a tested guide keeps its tested label and date', bank.length >= 3 && bank.every((e) => e.status === 'tested' && /^Tested on PS5/.test(e.label) && e.date === '2026-11-20' && Array.isArray(e.sources)));
  const crane = index.find((e) => e.url === '/missions/zz-fixture-dock-job/#crane-step');
  expect('a step record carries the sources that step cites, and its excerpt has no citation numbers', crane?.sourceScope === 'cited' && crane.sources.length === 2 && !/\[1/.test(crane.a));
  expect('llms-full.txt numbers mission sources to match the page citations', out('llms-full.txt').includes('[1] https://www.ign.com/wikis/a') && out('llms-full.txt').includes('Fixture crane step.[1, 2]'));
  const steps = index.filter((e) => e.q === 'How to start' && e.parent);
  expect('both "How to start" steps carry their mission name and label', steps.length === 2 && new Set(steps.map((e) => e.parent)).size === 2 && steps.every((e) => e.label));
  const full = out('llms-full.txt');
  expect('AI exports disclose that the source check was automated', /automated check, no human review/.test(full) && /automated check, no human review/.test(out('llms.txt')));
  expect('llms-full.txt keeps the untested status and citations', /Status: Community-sourced, not tested by this site\. Sources checked/.test(full) && full.includes('[1] https://www.ign.com/wikis/a') && /Status: Tested on PS5/.test(full));
  expect('llms.txt marks each mission with its status', /\[Community-sourced, not tested by this site/.test(out('llms.txt')));
  expect('feed lists the guides with status', out('feed.xml').includes('zz-fixture-dock-job') && /Community-sourced, not tested/.test(out('feed.xml')));

  // Search ranking, using the real search.js outside a browser
  const sandbox = {}; sandbox.globalThis = sandbox; vm.runInNewContext(fs.readFileSync(path.join(tmp, 'assets/search.js'), 'utf8'), sandbox);
  const { normalize, words, prepareEntry, score } = sandbox.__siteSearch;
  const entries = index.map(prepareEntry);
  const top = (query) => { const phrase = normalize(query); const qw = [...new Set(words(phrase))]; return entries.map((e) => ({ e, s: score(e, phrase, qw) })).filter((m) => m.s > 0).sort((a, b) => b.s - a.s).map((m) => m.e.url); };
  expect('"dock job how to start" opens that mission\'s step first', top('dock job how to start')[0] === '/missions/zz-fixture-dock-job/#how-to-start', top('dock job how to start').slice(0, 3).join(' '));
  expect('"how to start bank run" opens the other mission\'s step first', top('how to start bank run')[0] === '/missions/zz-fixture-bank-run/#how-to-start', top('how to start bank run').slice(0, 3).join(' '));
  expect('alias "harbor job reach the crane" finds the step', top('harbor job reach the crane')[0] === '/missions/zz-fixture-dock-job/#crane-step', top('harbor job reach the crane').slice(0, 3).join(' '));
  expect('a mission name alone opens the mission page first', top('dock job')[0] === '/missions/zz-fixture-dock-job/', top('dock job').slice(0, 3).join(' '));
  expect('"dock job reach crane" (small words left out) finds the step', top('dock job reach crane')[0] === '/missions/zz-fixture-dock-job/#crane-step', top('dock job reach crane').slice(0, 3).join(' '));
  expect('"open the vault" still finds its step', top('open the vault')[0] === '/missions/zz-fixture-bank-run/#open-the-vault', top('open the vault').slice(0, 3).join(' '));
}

// 4b. Search engine verification tags: home page only, escaped, absent when not configured
clearMissions(); setSite(gateOn); run('build.mjs', '2026-11-20');
expect('the Bing verification tag from site.json is in the home page head only', baseSite.bingSiteVerification === '89E68620B4EACCF4D49881B96998005A' && out('index.html').includes('<meta name="msvalidate.01" content="89E68620B4EACCF4D49881B96998005A">') && out('index.html').indexOf('msvalidate.01') < out('index.html').indexOf('</head>') && !out('missions/index.html').includes('msvalidate'));
setSite({ ...gateOn, bingSiteVerification: 'a"><script>x</script>' }); run('build.mjs', '2026-11-20');
expect('the Bing verification value is escaped', out('index.html').includes('content="a&quot;&gt;&lt;script&gt;x&lt;/script&gt;"') && !out('index.html').includes('<script>x</script>'));
setSite({ ...gateOn, bingSiteVerification: '' }); run('build.mjs', '2026-11-20');
expect('no Bing tag when the setting is empty', !out('index.html').includes('msvalidate'));
setSite(gateOn);

// 4c. PS5 unlock times by PlayStation Store region: one list in site.json drives the table and the picker
clearMissions(); setSite(gateOn); r = run('build.mjs', '2026-11-17');
expect('real content builds with the unlock list', r.ok, r.out);
{
  const rd = out('release-date/index.html');
  const row = (region) => (rd.match(new RegExp(`<tr><td>${region}</td>.*?</tr>`)) || [''])[0];
  expect('the no-JavaScript table shows every verified store with its UTC time, local midnight and listing', baseSite.ps5Unlocks.length === 4 && baseSite.ps5Unlocks.every((u) => row(u.region).includes(`datetime="${u.time}"`) && row(u.region).includes(`href="${u.source}"`)));
  expect('New Zealand row: 11:00 UTC on Nov 18 is midnight New Zealand Daylight Time', row('New Zealand').includes('Wed, Nov 18, 11:00 AM UTC') && row('New Zealand').includes('Thu, Nov 19, 12:00 AM New Zealand Daylight Time'), row('New Zealand'));
  expect('United States row: 05:00 UTC is midnight Eastern', row('United States').includes('Thu, Nov 19, 5:00 AM UTC') && row('United States').includes('12:00 AM Eastern Standard Time'), row('United States'));
  expect('Australia and UK rows use their own zones', row('Australia').includes('12:00 AM Australian Eastern Daylight Time') && row('United Kingdom').includes('12:00 AM Greenwich Mean Time'));
  expect('the region picker is hidden until its script runs, offers only verified stores, and starts unselected', /<form class="unlock-check" data-unlock-check hidden>/.test(rd) && (rd.match(/<option value="[a-z]{2}"/g) || []).length === 4 && rd.includes('<option value="">Choose a store region</option>') && rd.includes('src="/unlock.js"'));
  expect('the picker never asks for location', !/geolocation|navigator\.language|timeZone\b.*guess/i.test(fs.readFileSync(path.join(tmp, 'assets/unlock.js'), 'utf8')) && /not from where you are/.test(rd));
  expect('only the release date page loads the picker', !out('launch-help/index.html').includes('unlock.js') && !out('index.html').includes('unlock.js'));
  expect('Xbox times are kept separate from the PS5 table', rd.includes('These are PS5 times only') && rd.includes('1 a.m. Eastern on November 19'));
}
const unlocks = baseSite.ps5Unlocks;
const withUnlock = (i, patch) => unlocks.map((u, j) => (j === i ? { ...u, ...patch } : u));
for (const [label, list, needle] of [
  ['a time that is not midnight in its zone', withUnlock(3, { time: '2026-11-19T06:00:00Z' }), 'not midnight'],
  ['a date without a time', withUnlock(3, { time: '2026-11-19' }), 'UTC timestamp'],
  ['an impossible date', withUnlock(3, { time: '2026-02-30T05:00:00Z' }), 'UTC timestamp'],
  ['an unknown time zone', withUnlock(3, { zone: 'Mars/Olympus' }), 'time zone name'],
  ['a missing time zone', withUnlock(3, { zone: undefined }), 'time zone name'],
  ['an empty time zone', withUnlock(3, { zone: '' }), 'time zone name'],
  ['a source that is not a PlayStation Store listing', withUnlock(3, { source: 'https://www.playstation.com/en-us/support/games/gta-vi-support/' }), 'PlayStation Store listing'],
  ['an unofficial source', withUnlock(3, { source: 'https://www.gta6everything.com/unlock-times' }), 'PlayStation Store listing'],
  ['a checked date in the future', withUnlock(3, { checked: '2026-12-01' }), '"checked"'],
  ['a duplicate region id', withUnlock(3, { id: 'nz' }), 'each id'],
  ['an earliest time that disagrees with missionPublishAfter', unlocks.filter((u) => u.id !== 'nz'), 'earliest time in ps5Unlocks'],
]) { setSite({ ...gateOn, ps5Unlocks: list }); rejects(`unlock list refused: ${label}`, '2026-11-17', needle); }
setSite(gateOn);
{
  const sb = {}; sb.globalThis = sb; vm.runInNewContext(fs.readFileSync(path.join(tmp, 'assets/unlock.js'), 'utf8'), sb);
  const { describe } = sb.__unlock;
  const before = new Date('2026-11-17T12:00:00Z');
  const us = describe('United States', '2026-11-19T05:00:00Z', before, 'America/Los_Angeles');
  expect('picker: the US store time shows as 9 p.m. Pacific on Nov 18 for a Los Angeles reader', us?.includes('Wednesday, November 18, 2026 at 9:00 PM Pacific Standard Time') && us.includes('time zone: America/Los_Angeles') && !us.includes('passed'), us);
  const nz = describe('New Zealand', '2026-11-18T11:00:00Z', before, 'Europe/London');
  expect('picker: the NZ store time shows as 11 a.m. GMT on Nov 18 for a London reader', nz?.includes('Wednesday, November 18, 2026 at 11:00 AM Greenwich Mean Time'), nz);
  expect('picker: a time already reached says so', /already passed/.test(describe('United Kingdom', '2026-11-19T00:00:00Z', new Date('2026-11-19T00:00:00Z'), 'UTC')));
  expect('picker: a bad or missing time gives no result instead of a wrong one', describe('X', '2026-11-19', before, 'UTC') === null && describe('X', 'soon', before, 'UTC') === null && describe('X', undefined, before, 'UTC') === null && describe('X', '2026-02-30T05:00:00Z', before, 'UTC') === null);
}

// 4d. Offline play, service status and story setup
{
  const lh = out('launch-help/index.html');
  expect('launch help explains PS5 offline play with the real setting path', lh.includes('id="offline-play-and-service-status"') && lh.includes('Settings → Users and Accounts → Other → Console Sharing and Offline Play') && lh.includes('offline play enabled'));
  expect('launch help links the three official status pages and shows no live status', ['https://status.playstation.com/', 'https://support.xbox.com/en-US/xbox-live-status', 'https://support.rockstargames.com/servicestatus'].every((u) => lh.includes(`href="${u}"`)) && !/all services (are )?(operational|up and running)|status-badge/i.test(lh));
  expect('Xbox offline play is left as not yet known', /Can you play offline on Xbox\?<\/h3>\s*<p><span class="tag tag-unknown">/.test(lh));
  expect('home and launch help jump to the offline and status section', out('index.html').includes('href="/launch-help/#offline-play-and-service-status"') && lh.includes('href="/launch-help/#offline-play-and-service-status"'));
  const idx = JSON.parse(out('search.json'));
  expect('search finds the offline and contact sections', ['#can-you-play-gta-6-offline-on-ps5', '#who-to-contact', '#is-it-down-check-the-official-status-pages'].every((h) => idx.some((e) => e.url === `/launch-help/${h}`)));
  expect('offline aliases survive on a real search record', ['play offline', 'no internet', 'without internet'].every((q) => idx.some((e) => e.url === '/launch-help/#can-you-play-gta-6-offline-on-ps5' && e.aliases.includes(q))));
  expect('outage aliases survive on a real search record', ['servers down', 'is psn down', 'is gta 6 down', 'server status'].every((q) => idx.some((e) => e.url === '/launch-help/#is-it-down-check-the-official-status-pages' && e.aliases.includes(q))));
  const ch = out('characters/index.html');
  const setup = ch.indexOf('id="story-setup"');
  expect('the spoiler note comes before any story setup detail', setup > 0 && ch.indexOf('Spoiler note:', setup) > setup && ch.indexOf('Spoiler note:', setup) < ch.indexOf('goes wrong', setup));
  expect('the shakedown detail is inside the warned story section', ch.indexOf('shakedowns') > ch.indexOf('Spoiler note:', setup));
  expect('Brian gives Jason rent-free housing for shakedowns; no rent wording remains', ch.includes('rent-free') && ch.includes('shakedowns') && !/rents from/.test(ch));
  expect('story setup stays out of search results and the page answer', !idx.some((e) => /goes wrong|Penitentiary|conspiracy/.test(`${e.q} ${e.a}`)));
  expect('the mission hub labels spoilers before the click', /href="\/characters\/#story-setup">[^<]*light spoilers/.test(out('missions/index.html')));
}

// News keeps every cached headline and its publisher; explicit spoiler labels require expansion.
const newsFile = path.join(tmp, 'data/news.json');
const savedNews = fs.readFileSync(newsFile, 'utf8');
const newsCases = [
  ['rumor', 'GTA 6 rumor: a new update'],
  ['leak', 'GTA 6 leak discussed by the publisher'],
  ['spoiler-free', 'GTA 6 spoiler-free review'],
  ['avoid-spoilers', 'How to avoid GTA 6 spoilers'],
  ['spoiler', '[Spoilers] GTA 6 story discussion'],
  ['warning', 'Spoiler warning: GTA 6 story discussion'],
].map(([key, title]) => ({ title, link: `https://www.ign.com/test-news/${key}`, source: `Test publisher ${key}`, date: '2026-11-18T12:00:00Z' }));
fs.writeFileSync(newsFile, JSON.stringify(newsCases));
builds('news renders rumors and spoiler-labeled headlines', '2026-11-20');
const newsHtml = out('news/index.html');
const spoilerDisclosure = (newsHtml.match(/<details><summary>Headlines marked as spoilers[\s\S]*?<\/details>/) || [''])[0];
const visibleNews = newsHtml.replace(spoilerDisclosure, '');
expect('rumor, leak and spoiler-free coverage remain in the visible news list', newsCases.slice(0, 4).every((n) => visibleNews.includes(`href="${n.link}"`)));
expect('explicit spoiler headlines are retained inside a closed disclosure', spoilerDisclosure.includes('Headlines marked as spoilers (2)') && !/<details\b[^>]*\bopen\b/.test(spoilerDisclosure) && newsCases.slice(4).every((n) => spoilerDisclosure.includes(`href="${n.link}"`) && !visibleNews.includes(`href="${n.link}"`)));
expect('every news item keeps its publisher attribution and original link exactly once', newsCases.every((n) => newsHtml.includes(`<span>${n.source} · <time`) && newsHtml.split(`href="${n.link}"`).length === 2));
fs.writeFileSync(newsFile, savedNews);

// 5. Ads stay off unless IDs and both confirmations are present
clearMissions(); put('b.md', tested({ ads: 'yes' }));
const adIds = { adsenseClient: 'ca-pub-0000000000000000', adsenseSlot: '0000000000' };
setSite({ ...gateOn, ...adIds }); run('build.mjs', '2026-11-20');
expect('IDs alone do not turn ads on', !out('missions/zz-fixture-bank-run/index.html').includes('adsbygoogle') && !fs.existsSync(path.join(tmp, 'dist/ads.txt')));
expect('the homepage can verify the publisher for review while ad requests stay off', out('index.html').includes(`<meta name="google-adsense-account" content="${adIds.adsenseClient}">`) && !out('index.html').includes('adsbygoogle.js'));
setSite({ ...gateOn, ...adIds, adsEnabled: true }); run('build.mjs', '2026-11-20');
expect('IDs plus one confirmation still leave ads off', !out('missions/zz-fixture-bank-run/index.html').includes('adsbygoogle'));
setSite({ ...gateOn, ...adIds, adsEnabled: true, adsConsentConfirmed: true }); run('build.mjs', '2026-11-20');
expect('IDs plus both confirmations turn ads on for an opted-in guide only', out('missions/zz-fixture-bank-run/index.html').includes('adsbygoogle') && !out('index.html').includes('adsbygoogle') && fs.existsSync(path.join(tmp, 'dist/ads.txt')));

// 5b. Optional support stays absent until a public creator profile is configured.
clearMissions(); put('a.md', community()); put('b.md', tested());
for (const supportUrl of [undefined, '']) {
  setSite({ ...gateOn, supportUrl });
  r = run('build.mjs', '2026-11-20');
  expect(`support link is absent when the setting is ${supportUrl === undefined ? 'missing' : 'empty'}`, r.ok && ['missions/zz-fixture-dock-job/index.html', 'missions/zz-fixture-bank-run/index.html'].every((file) => !out(file).includes('Support this guide')), r.out);
}
for (const supportUrl of ['https://ko-fi.com/fixture_creator', 'https://buymeacoffee.com/fixture-creator/', 'https://paypal.me/FixtureCreator', 'https://www.ko-fi.com/fixture_creator', 'https://www.buymeacoffee.com/fixture-creator', 'https://www.paypal.me/FixtureCreator/']) {
  setSite({ ...gateOn, supportUrl });
  r = run('build.mjs', '2026-11-20');
  const supportLink = `<a href="${supportUrl}" rel="nofollow noopener">Support this guide</a>`;
  const missionFiles = ['missions/zz-fixture-dock-job/index.html', 'missions/zz-fixture-bank-run/index.html'];
  expect(`public ${new URL(supportUrl).hostname} profile appears once in each mission's closing navigation`, r.ok && missionFiles.every((file) => {
    const html = out(file);
    return html.split(supportLink).length === 2 && html.match(/<nav class="mission-nav"[\s\S]*?<\/nav>/)?.[0].includes(supportLink);
  }), r.out);
  expect('support stays off the homepage, mission index and general guides', ['index.html', 'missions/index.html', 'launch-help/index.html'].every((file) => !out(file).includes('Support this guide')));
}
for (const supportUrl of [
  'http://ko-fi.com/creator', 'https://ko-fi.com/', 'https://other.ko-fi.com/creator', 'https://ko-fi.com.evil.invalid/creator',
  'https://user:pass@ko-fi.com/creator', 'https://ko-fi.com:443/creator', 'https://ko-fi.com/creator?amount=5', 'https://ko-fi.com/creator#tip',
  'https://paypal.me/creator/5', 'https://ko-fi.com/%63reator', 'https://ko-fi.com/../creator', 'https://ko-fi.com/creator\\other',
  'https://buymeacoffee.com/login', 'https://paypal.me/Privacy', ' https://ko-fi.com/creator', 'https://ko-fi.com/creator\n', null, 123,
]) {
  setSite({ ...gateOn, supportUrl });
  rejects('invalid or non-profile support URL is refused', '2026-11-20', 'site.json supportUrl');
}
setSite(gateOn);

// 6. IndexNow submits only what a push changed, and reports failures as failures
fs.copyFileSync(path.join(ROOT, 'indexnow.mjs'), path.join(tmp, 'indexnow.mjs'));
const git = (...args) => spawnSync('git', ['-c', 'user.name=test', '-c', 'user.email=test@test.invalid', '-c', 'commit.gpgsign=false', ...args], { cwd: tmp, encoding: 'utf8' });
const commit = (msg) => { git('add', '-A', 'content', 'site.json', 'build.mjs'); git('commit', '-q', '-m', msg); return git('rev-parse', 'HEAD').stdout.trim(); };
setSite(gateOn); clearMissions(); put('a.md', community()); put('b.md', tested());
git('init', '-q');
const c1 = commit('one');
fs.writeFileSync(guideFile, guideText.replace(/\n---\n/, '\n---\n\nFixture body edit.\n'));
fs.rmSync(path.join(tmp, 'content/missions/b.md'));
const c2 = commit('two');
run('build.mjs', '2026-11-20');
let dry = run('indexnow.mjs', '', { DRY_RUN: '1', BEFORE: c1, AFTER: c2 }).out;
expect('IndexNow lists the edited guide, the removed mission, the hub and home', ['/launch-help/', '/missions/zz-fixture-bank-run/', '/missions/', 'gtasixmissions.com/\n'].every((u) => (dry + '\n').includes(u)) && /would submit 4 URL/.test(dry), dry);
expect('IndexNow leaves out guides that did not change', !dry.includes('/editions-price/') && !dry.includes('zz-fixture-dock-job'), dry);
fs.appendFileSync(path.join(tmp, 'build.mjs'), '\n// comment\n');
const c3 = commit('three');
dry = run('indexnow.mjs', '', { DRY_RUN: '1', BEFORE: c2, AFTER: c3 }).out;
expect('IndexNow submits nothing when only code changed', /nothing submitted/.test(dry), dry);
fs.writeFileSync(guideFile, fs.readFileSync(guideFile, 'utf8').replace('Fixture body edit.', 'Fixture body edit two.'));
const c4 = commit('four');
dry = run('indexnow.mjs', '', { DRY_RUN: '1', BEFORE: c3, AFTER: c4 }).out;
expect('a body-only edit submits that guide without the home page', /would submit 1 URL/.test(dry) && dry.includes('/launch-help/'), dry);
const post = (code) => new Promise((resolve) => {
  const server = http.createServer((req, res) => { req.resume(); res.statusCode = code; res.end(); }).listen(0, '127.0.0.1', () => {
    const env = { ...process.env, BEFORE: c3, AFTER: c4, INDEXNOW_ENDPOINT: `http://127.0.0.1:${server.address().port}/` }; delete env.DRY_RUN;
    const child = spawn('node', ['indexnow.mjs'], { cwd: tmp, env }); let text = '';
    child.stdout.on('data', (d) => { text += d; }); child.stderr.on('data', (d) => { text += d; });
    child.on('close', (status) => { server.close(); resolve({ status, text }); });
  });
});
for (const [code, good] of [[200, true], [202, true], [403, false], [422, false], [429, false]]) {
  const res = await post(code);
  expect(`IndexNow status ${code} is reported as ${good ? 'accepted' : 'FAILED'}`, good ? res.status === 0 && /accepted for processing/.test(res.text) && !/FAILED/.test(res.text) : res.status !== 0 && /FAILED/.test(res.text) && !/accepted for processing/.test(res.text), res.text);
}

// 7. Nothing leaked into the real project
const leak = (dir) => fs.existsSync(dir) && fs.readdirSync(dir, { recursive: true }).some((f) => /zz-fixture/.test(String(f)) || (/\.(html|json|txt|xml|md)$/.test(String(f)) && fs.statSync(path.join(dir, String(f))).isFile() && /FIXTURE|zz-fixture/.test(fs.readFileSync(path.join(dir, String(f)), 'utf8'))));
expect('no fixture in the real content/ or dist/', !leak(path.join(ROOT, 'content')) && !leak(path.join(ROOT, 'dist')));

if (process.env.KEEP) console.log(`Kept fixture build at ${tmp}`); else fs.rmSync(tmp, { recursive: true, force: true });
console.log(failed ? `\n${failed} test(s) failed` : '\nAll tests passed');
process.exit(failed ? 1 : 0);
