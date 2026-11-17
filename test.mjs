// Regression tests. Run: node test.mjs
// Every fixture is created in a temporary copy of the project. Nothing is written to content/ or dist/ here.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gsm-test-'));
for (const item of ['build.mjs', 'check.mjs', 'site.json', 'assets', 'content', 'data']) fs.cpSync(path.join(ROOT, item), path.join(tmp, item), { recursive: true });
fs.mkdirSync(path.join(tmp, 'content/missions'), { recursive: true });
const baseSite = JSON.parse(fs.readFileSync(path.join(tmp, 'site.json'), 'utf8'));
const setSite = (patch) => fs.writeFileSync(path.join(tmp, 'site.json'), JSON.stringify({ ...baseSite, ...patch }, null, 2));
const gateOn = { communityGuides: { enabled: true, releaseConfirmedOn: '2026-11-19', releaseSource: 'https://www.rockstargames.com/VI' } };
const run = (script, date) => { const r = spawnSync('node', [script], { cwd: tmp, encoding: 'utf8', env: { ...process.env, NO_FETCH: '1', BUILD_DATE: date } }); return { ok: r.status === 0, out: r.stdout + r.stderr }; };
const out = (rel) => fs.readFileSync(path.join(tmp, 'dist', rel), 'utf8');
const clearMissions = () => { for (const f of fs.readdirSync(path.join(tmp, 'content/missions'))) fs.rmSync(path.join(tmp, 'content/missions', f)); };

const community = (over = {}, sources = ['https://www.ign.com/wikis/a', 'https://www.gamespot.com/guides/b']) => {
  const meta = { title: 'FIXTURE Dock Job Walkthrough', slug: 'missions/zz-fixture-dock-job', status: 'community', description: 'Private regression fixture for the community-sourced guide layout. Never published.', answer: 'Fixture answer for the dock job.', updated: '2026-11-20', checkedDate: '2026-11-20', sourceBasis: 'retail-gameplay', independentSources: '2', sourceReview: 'automated', aliases: 'dock job | harbor job', order: '90', ...over };
  return `---\n${Object.entries(meta).filter(([, v]) => v !== null).map(([k, v]) => `${k}: ${v}`).join('\n')}\n---\n\n## How to start\n\nFixture dock start text.\n\n## Reach the crane\n\n1. Fixture crane step.\n\n## Sources\n\n${sources.map((u, i) => `- [Source ${i + 1}](${u})`).join('\n')}\n`;
};
const tested = (over = {}) => {
  const meta = { title: 'FIXTURE Bank Run Walkthrough', slug: 'missions/zz-fixture-bank-run', status: 'published', description: 'Private regression fixture for the tested guide layout. It is never published anywhere.', answer: 'Fixture answer for the bank run.', updated: '2026-11-20', testedPlatform: 'PS5', testedDate: '2026-11-20', order: '91', ...over };
  return `---\n${Object.entries(meta).map(([k, v]) => `${k}: ${v}`).join('\n')}\n---\n\n## How to start\n\nFixture bank start text.\n\n## Open the vault\n\n1. Fixture vault step.\n\n## Leave the area\n\nFixture exit text.\n`;
};
const put = (name, text) => fs.writeFileSync(path.join(tmp, 'content/missions', name), text);

let failed = 0;
const expect = (name, cond, detail = '') => { if (!cond) failed++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${cond || !detail ? '' : `\n     ${detail.trim().split('\n').slice(-2).join(' ')}`}`); };
const rejects = (name, date, needle) => { const r = run('build.mjs', date); expect(name, !r.ok && r.out.includes(needle), r.out); };

// 1. Production content, untouched
let r = run('build.mjs', '2026-11-16'); expect('production content builds before launch', r.ok, r.out);
r = run('check.mjs', '2026-11-16'); expect('production content passes the checker', r.ok, r.out);

// 2. Community gate
put('a.md', community());
rejects('community guide refused while the switch is off', '2026-11-20', 'switched off');
setSite(gateOn);
rejects('community guide refused before launch even with the switch on', '2026-11-16', 'before launchDate');
setSite({ communityGuides: { ...gateOn.communityGuides, releaseSource: 'https://www.ign.com/x' } });
rejects('release confirmation must cite an official site', '2026-11-20', 'releaseSource');
setSite({ communityGuides: { ...gateOn.communityGuides, releaseConfirmedOn: '2026-11-30' } });
rejects('release confirmation cannot be dated in the future', '2026-11-20', 'releaseConfirmedOn');
setSite(gateOn);

// 3. Dates and evidence fields
put('a.md', community({ checkedDate: '2099-12-31' })); rejects('checkedDate 2099-12-31 refused', '2026-11-20', 'checkedDate');
put('a.md', community({ checkedDate: '2026-02-30' })); rejects('impossible calendar date refused', '2026-11-20', 'checkedDate');
put('a.md', community({ checkedDate: '2026-11-10' })); rejects('checkedDate before launch refused', '2026-11-20', 'checkedDate');
put('a.md', community({}, ['https://example.com/a', 'https://other.example.com/b'])); rejects('example.com sources refused', '2026-11-20', 'placeholder');
put('a.md', community({}, ['https://www.ign.com/a', 'https://uk.ign.com/b'])); rejects('two pages on one site are not two sources', '2026-11-20', 'two different source sites');
put('a.md', community({ sourceBasis: null })); rejects('missing sourceBasis refused', '2026-11-20', 'sourceBasis');
put('a.md', community({ independentSources: '1' })); rejects('one independent source refused', '2026-11-20', 'independentSources');
put('a.md', community({ independentSources: '5' })); rejects('independent count above linked sites refused', '2026-11-20', 'independentSources');
put('a.md', community({ sourceReview: 'Alex Example' })); rejects('invented reviewer identity refused', '2026-11-20', 'sourceReview');
put('a.md', community({ testedPlatform: 'PS5' })); rejects('community guide with tested fields refused', '2026-11-20', 'tested fields');
clearMissions();
put('b.md', tested({ testedDate: '2026-12-25' })); rejects('tested date in the future refused', '2026-11-20', 'testedDate');
put('b.md', tested({ testedDate: '2026-11-01' })); rejects('tested date before launch refused', '2026-11-20', 'testedDate');

// 4. Valid guides keep their labels everywhere
put('a.md', community()); put('b.md', tested());
r = run('build.mjs', '2026-11-20'); expect('valid tested and community guides build after launch', r.ok, r.out);
if (r.ok) {
  // The checker is expected to object here, because fixtures are present. That proves the production guard works.
  const c = run('check.mjs', '2026-11-20'); expect('checker flags fixture content', !c.ok && c.out.includes('test fixture content'), c.out);
  const page = out('missions/zz-fixture-dock-job/index.html');
  expect('community page shows the untested notice and review line', page.includes('Not tested by us yet.') && page.includes('Source check was automated') && page.includes('Community-sourced</span>') && !/Tested on /.test(page));
  expect('guide has the public corrections link with its warning', page.includes('issues/new?title=Correction') && page.includes('leave out game codes'));
  const hub = out('missions/index.html');
  expect('hub lists tested and community guides apart', hub.includes('1 verified walkthrough') && hub.includes('id="community-guides"') && hub.indexOf('zz-fixture-bank-run') < hub.indexOf('id="community-guides"') && hub.indexOf('zz-fixture-dock-job') > hub.indexOf('id="community-guides"'));
  const index = JSON.parse(out('search.json'));
  const pageRec = index.find((e) => e.url === '/missions/zz-fixture-dock-job/');
  expect('search page record keeps status, date and source links', pageRec?.status === 'community' && pageRec.date === '2026-11-20' && /not tested/i.test(pageRec.label) && pageRec.sources?.length === 2);
  const steps = index.filter((e) => e.q === 'How to start' && e.parent);
  expect('both "How to start" steps carry their mission name and label', steps.length === 2 && new Set(steps.map((e) => e.parent)).size === 2 && steps.every((e) => e.label));
  const full = out('llms-full.txt');
  expect('llms-full.txt keeps the untested status and citations', /Status: Community-sourced, not tested by this site\. Sources checked/.test(full) && full.includes('- https://www.ign.com/wikis/a') && /Status: Tested on PS5/.test(full));
  expect('llms.txt marks each mission with its status', /\[Community-sourced, not tested by this site/.test(out('llms.txt')));
  expect('feed lists the guides with status', out('feed.xml').includes('zz-fixture-dock-job') && /Community-sourced, not tested/.test(out('feed.xml')));

  // Search ranking, using the real search.js outside a browser
  const sandbox = {}; sandbox.globalThis = sandbox; vm.runInNewContext(fs.readFileSync(path.join(tmp, 'assets/search.js'), 'utf8'), sandbox);
  const { normalize, words, prepareEntry, score } = sandbox.__siteSearch;
  const entries = index.map(prepareEntry);
  const top = (query) => { const phrase = normalize(query); const qw = [...new Set(words(phrase))]; return entries.map((e) => ({ e, s: score(e, phrase, qw) })).filter((m) => m.s > 0).sort((a, b) => b.s - a.s).map((m) => m.e.url); };
  expect('"dock job how to start" opens that mission\'s step first', top('dock job how to start')[0] === '/missions/zz-fixture-dock-job/#how-to-start', top('dock job how to start').slice(0, 3).join(' '));
  expect('"how to start bank run" opens the other mission\'s step first', top('how to start bank run')[0] === '/missions/zz-fixture-bank-run/#how-to-start', top('how to start bank run').slice(0, 3).join(' '));
  expect('alias "harbor job reach the crane" finds the step', top('harbor job reach the crane')[0] === '/missions/zz-fixture-dock-job/#reach-the-crane', top('harbor job reach the crane').slice(0, 3).join(' '));
  expect('a mission name alone opens the mission page first', top('dock job')[0] === '/missions/zz-fixture-dock-job/', top('dock job').slice(0, 3).join(' '));
  expect('"open the vault" still finds its step', top('open the vault')[0] === '/missions/zz-fixture-bank-run/#open-the-vault', top('open the vault').slice(0, 3).join(' '));
}

// 5. Ads stay off unless IDs and both confirmations are present
clearMissions(); put('b.md', tested({ ads: 'yes' }));
const adIds = { adsenseClient: 'ca-pub-0000000000000000', adsenseSlot: '0000000000' };
setSite({ ...gateOn, ...adIds }); run('build.mjs', '2026-11-20');
expect('IDs alone do not turn ads on', !out('missions/zz-fixture-bank-run/index.html').includes('adsbygoogle') && !fs.existsSync(path.join(tmp, 'dist/ads.txt')));
setSite({ ...gateOn, ...adIds, adsEnabled: true }); run('build.mjs', '2026-11-20');
expect('IDs plus one confirmation still leave ads off', !out('missions/zz-fixture-bank-run/index.html').includes('adsbygoogle'));
setSite({ ...gateOn, ...adIds, adsEnabled: true, adsConsentConfirmed: true }); run('build.mjs', '2026-11-20');
expect('IDs plus both confirmations turn ads on for an opted-in guide only', out('missions/zz-fixture-bank-run/index.html').includes('adsbygoogle') && !out('index.html').includes('adsbygoogle') && fs.existsSync(path.join(tmp, 'dist/ads.txt')));

// 6. Nothing leaked into the real project
const leak = (dir) => fs.existsSync(dir) && fs.readdirSync(dir, { recursive: true }).some((f) => /zz-fixture/.test(String(f)) || (/\.(html|json|txt|xml|md)$/.test(String(f)) && fs.statSync(path.join(dir, String(f))).isFile() && /FIXTURE|zz-fixture/.test(fs.readFileSync(path.join(dir, String(f)), 'utf8'))));
expect('no fixture in the real content/ or dist/', !leak(path.join(ROOT, 'content')) && !leak(path.join(ROOT, 'dist')));

if (process.env.KEEP) console.log(`Kept fixture build at ${tmp}`); else fs.rmSync(tmp, { recursive: true, force: true });
console.log(failed ? `\n${failed} test(s) failed` : '\nAll tests passed');
process.exit(failed ? 1 : 0);
