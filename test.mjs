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
for (const item of ['build.mjs', 'clips.mjs', 'check.mjs', 'site.json', 'assets', 'content', 'data']) fs.cpSync(path.join(ROOT, item), path.join(tmp, item), { recursive: true });
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

// The original minimap clip has a dedicated, indexable watch page without third-party playback.
const watchHtml = out('minimap-video/index.html');
const watchLd = [...watchHtml.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1])).find((d) => d['@type'] === 'VideoObject');
const watchTag = watchHtml.match(/<video\b[^>]*>/)?.[0] || '';
expect('watch page puts one native player before the answer and transcript', (watchHtml.match(/<video\b/g) || []).length === 1 && watchHtml.indexOf('<video ') < watchHtml.indexOf('<div class="answer">') && watchHtml.indexOf('<video ') < watchHtml.indexOf('<h2 id="transcript">'));
expect('watch player has controls and accessible text without autoplay or third-party loading', /\bcontrols\b/.test(watchTag) && /\bplaysinline\b/.test(watchTag) && /aria-label="[^"]+"/.test(watchTag) && /aria-describedby="video-description"/.test(watchTag) && watchHtml.includes('id="video-description"') && !/\bautoplay\b|\bloop\b/.test(watchTag) && !/<iframe|src="\/video.js"/.test(watchHtml));
expect('watch page identifies the silent original diagram and includes all four timed instructions', watchHtml.includes('Original diagram, not game footage') && watchHtml.includes('no spoken audio or music') && ['0:00–0:04', '0:04–0:08.5', '0:08.5–0:13.75', '0:13.75–0:18'].every((time) => watchHtml.includes(time)));
expect('video metadata matches the actual clip size, length, creator and first public date', watchLd?.duration === 'PT18S' && watchLd?.width === 1080 && watchLd?.height === 1920 && watchLd?.uploadDate === '2026-11-18' && watchLd?.creator?.name === 'Wasted Loop' && !watchLd?.interactionStatistic);
expect('video and thumbnail metadata point at the actual native-player assets', watchLd?.contentUrl === 'https://gtasixmissions.com/minimap-settings-explainer.mp4' && watchHtml.includes('<source src="/minimap-settings-explainer.mp4" type="video/mp4">') && watchLd?.thumbnailUrl?.[0] === 'https://gtasixmissions.com/minimap-settings-poster.jpg' && watchTag.includes('poster="/minimap-settings-poster.jpg"'));
expect('video assets are copied byte-for-byte into the public build', ['minimap-settings-explainer.mp4', 'minimap-settings-poster.jpg'].every((file) => fs.readFileSync(path.join(tmp, 'dist', file)).equals(fs.readFileSync(path.join(tmp, 'assets', file)))));
expect('watch page is self-canonical and indexable with its own actual-frame social preview', watchHtml.includes('<link rel="canonical" href="https://gtasixmissions.com/minimap-video/">') && watchHtml.includes('content="index, follow,') && watchHtml.includes('<meta property="og:image" content="https://gtasixmissions.com/minimap-settings-poster.jpg">'));
const watchSitemap = out('sitemap.xml').match(/<url><loc>https:\/\/gtasixmissions.com\/minimap-video\/[\s\S]*?<\/url>/)?.[0] || '';
expect('sitemap contains the watch page and its video file, thumbnail and duration', watchSitemap.includes('<video:content_loc>https://gtasixmissions.com/minimap-settings-explainer.mp4</video:content_loc>') && watchSitemap.includes('<video:thumbnail_loc>https://gtasixmissions.com/minimap-settings-poster.jpg</video:thumbnail_loc>') && watchSitemap.includes('<video:duration>18</video:duration>'));
expect('settings guide links to the watch page and site search can find it', out('navigation-settings/index.html').includes('href="/minimap-video/"') && JSON.parse(out('search.json')).some((record) => record.url === '/minimap-video/'));
expect('watch page keeps working without scripts and links back to the menu steps', watchHtml.includes('href="#transcript"') && watchHtml.includes('href="/navigation-settings/#change-the-minimap"') && !/src="\/video.js"|data-video=/.test(watchHtml));
const labWatchHtml = out('lab-fees-video/index.html');
const labWatchLd = [...labWatchHtml.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1])).find((d) => d['@type'] === 'VideoObject');
expect('Lab Fees uses the same primary native watch player', (labWatchHtml.match(/<video\b/g) || []).length === 1 && labWatchHtml.indexOf('<video ') < labWatchHtml.indexOf('<div class="answer">') && labWatchHtml.includes('<source src="/lab-fees-door-codes.mp4" type="video/mp4">'));
expect('Lab Fees video has its own accurate asset metadata', labWatchLd?.contentUrl === 'https://gtasixmissions.com/lab-fees-door-codes.mp4' && labWatchLd?.thumbnailUrl?.[0] === 'https://gtasixmissions.com/lab-fees-door-codes-poster.jpg' && labWatchLd?.duration === 'PT18S' && labWatchLd?.uploadDate === '2026-11-18' && labWatchLd?.width === 1080 && labWatchLd?.height === 1920 && labWatchLd?.creator?.name === 'Wasted Loop');
expect('Lab Fees transcript describes all scenes and the non-speech sound', ['0:00–0:03', '0:03–0:07.75', '0:07.75–0:12.5', '0:12.5–0:18', 'Short keypad tones', 'no spoken dialogue', 'not recordings'].every((text) => labWatchHtml.includes(text)));
expect('Lab Fees watch page preserves community-source context and links to the steps', labWatchHtml.includes('steps have not been tested by us') && labWatchHtml.includes('href="/missions/lab-fees/#lab-door-code"') && labWatchHtml.includes('href="/missions/lab-fees/#lockup-code"') && out('missions/lab-fees/index.html').includes('href="/lab-fees-video/"'));
expect('Lab Fees video assets are copied without changes', ['lab-fees-door-codes.mp4', 'lab-fees-door-codes-poster.jpg'].every((file) => fs.readFileSync(path.join(tmp, 'dist', file)).equals(fs.readFileSync(path.join(tmp, 'assets', file)))));
expect('Lab Fees watch page is discoverable in search and the video sitemap', JSON.parse(out('search.json')).some((record) => record.url === '/lab-fees-video/') && out('sitemap.xml').includes('<loc>https://gtasixmissions.com/lab-fees-video/</loc>') && out('sitemap.xml').includes('<video:content_loc>https://gtasixmissions.com/lab-fees-door-codes.mp4</video:content_loc>'));
expect('watch pages never load mission-only step sharing', [watchHtml, labWatchHtml].every((html) => !/src="\/mission-share.js"|data-mission-steps/.test(html)));

// The creator library, individual watch pages and search results must point at the same videos.
const clipLibrary = out('clips/index.html');
const librarySchema = [...clipLibrary.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)]
  .map((match) => JSON.parse(match[1])).find((item) => item['@type'] === 'CollectionPage').mainEntity;
const liveClips = JSON.parse(fs.readFileSync(path.join(tmp, 'data/clips.json'), 'utf8'))
  .filter((clip) => fs.existsSync(path.join(tmp, 'dist/clips', clip.slug, 'index.html')));
const libraryLinks = librarySchema.itemListElement.map((item) => item.url);
const clipIndex = JSON.parse(out('search.json'));
const liveSitemap = out('sitemap.xml');
expect('library lists both original animations and creator uploads', libraryLinks.length === librarySchema.numberOfItems
  && ['/taxi-video/', '/lab-fees-video/', '/minimap-video/'].every((url) => libraryLinks.includes(productionSite.baseUrl + url))
  && liveClips.every((clip) => libraryLinks.includes(productionSite.baseUrl + '/clips/' + clip.slug + '/')));
expect('homepage features the selected clip and keeps mission search', out('index.html').includes('data-play-clip="' + liveClips[0].id + '"') && out('index.html').includes('data-site-search'));
expect('videos, clips and shorts resolve to the collection', ['videos','clips','shorts'].every((term) => clipIndex.find((item) => item.url === '/clips/').aliases.includes(term)));
expect('each creator video has the right player, runtime, source, canonical URL and searchable page', liveClips.every((clip) => {
  const route = '/clips/' + clip.slug + '/';
  const html = out('clips/' + clip.slug + '/index.html');
  const video = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)]
    .map((match) => JSON.parse(match[1])).find((item) => item['@type'] === 'VideoObject');
  return video?.creator.name === clip.creator && video.duration === 'PT' + clip.seconds + 'S'
    && video.embedUrl.endsWith('/' + clip.id) && video.thumbnailUrl.includes(clip.thumb)
    && video.url === productionSite.baseUrl + route && clipIndex.some((item) => item.url === route)
    && liveSitemap.includes('<video:player_loc>' + video.embedUrl + '</video:player_loc>')
    && html.includes('href="https://www.youtube.com/watch?v=' + clip.id + '"')
    && (clip.moments || []).every((moment) => html.includes('data-clip-seek="' + moment.at + '"')
      && video.hasPart.some((entry) => entry.startOffset === moment.at && entry.url === video.url + '?t=' + moment.at));
}));
expect('scene questions appear on the watch page and search jumps to the matching second', liveClips.every((clip) => {
  const page = out('clips/' + clip.slug + '/index.html');
  return (clip.moments || []).filter((moment) => moment.question).every((moment) =>
    page.includes('<h3>' + moment.question + '</h3>')
    && clipIndex.some((entry) => entry.q === moment.question && entry.url === '/clips/' + clip.slug + '/?t=' + moment.at));
}));
const taxiPage = out('taxi-video/index.html');
expect('the original fare short links to its transcript, sources and transit guide', ['taxi-skip.mp4','id="transcript"','/map-locations/#fast-travel','id="sources"'].every((value) => taxiPage.includes(value))
  && out('map-locations/index.html').includes('href="/taxi-video/"'));

// Verify the real catalog against its current data, without hardcoding editorial counts.
const productionCatalog = JSON.parse(fs.readFileSync(path.join(tmp, 'data/story-missions.json'), 'utf8'));
const productionEntries = productionCatalog.chapters.flatMap((chapter) => chapter.missions);
const productionHub = out('missions/index.html');
const catalogueEsc = (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
expect('every current catalog entry and title is server-rendered', productionEntries.every((entry) => productionHub.includes(`data-story-key="${entry.key}"`) && productionHub.includes(catalogueEsc(entry.title))) && (productionHub.match(/data-story-key=/g) || []).length === productionEntries.length);
expect('catalog count agrees with the actual rows rather than a claimed story total', productionHub.includes(`data-catalogue-count="${productionEntries.length}"`) && productionHub.includes('catalog entries across') && productionHub.includes(catalogueEsc(productionCatalog.coverage.note)));
expect('catalog source URLs remain directly accessible in the rendered HTML', productionEntries.every((entry) => entry.sourceUrls.every((url) => productionHub.includes(`href="${catalogueEsc(url)}"`))));
expect('spoiler chapters start closed and their summaries warn before revealing titles', productionCatalog.chapters.every((chapter) => { const tag = productionHub.match(new RegExp(`<details class="catalogue-chapter" id="catalogue-${chapter.id}"[^>]*>`))?.[0] || ''; return tag && (!chapter.spoiler || (!/\sopen(?:\s|>)/.test(tag) && productionHub.includes('Show titles (spoilers)'))); }));
expect('only explicitly optional catalog entries carry the optional marker', (productionHub.match(/class="catalogue-optional"/g) || []).length === productionEntries.filter((entry) => entry.optional === true).length);
expect('checklist controls have stable keys and stay hidden until enhanced', productionEntries.every((entry) => productionHub.includes(`data-story-check="${entry.key}"`) && productionHub.includes(`aria-label="Mark ${catalogueEsc(entry.title)} complete"`)) && productionHub.includes('data-story-check-control hidden'));
expect('catalog search and persistence load on the hub, not ordinary guides', productionHub.includes('src="/mission-browser.js"') && productionHub.includes('src="/story-progress.js"') && !out('launch-help/index.html').includes('src="/mission-browser.js"'));
const chapterOneRecap = productionCatalog.chapters[0].missions.filter((entry) => entry.recapSources?.length);
const actualRow = (key) => productionHub.match(new RegExp(`<li data-story-key="${key}"[\\s\\S]*?</li>`))?.[0] || '';
expect('all 22 Chapter 1 recap missions resolve to their own distinct authored guides', chapterOneRecap.length === 22 && new Set(chapterOneRecap.map((entry) => entry.key)).size === 22 && chapterOneRecap.every((entry) => actualRow(entry.key).includes(`href="/missions/${entry.key}/"`) && fs.existsSync(path.join(tmp, 'dist/missions', entry.key, 'index.html'))));
expect('later entries without an authored canonical target do not acquire a Chapter 1 guide through aliases', productionCatalog.chapters.slice(1).flatMap((chapter) => chapter.missions).filter((entry) => !fs.existsSync(path.join(tmp, 'dist/missions', entry.key, 'index.html')) && !entry.localSlug).every((entry) => !/data-guide-kind="local"/.test(actualRow(entry.key))));

// Keep production missions, release switches and editorial dates out of simulated cases.
// Production content and its real dates were checked above; publication-date fixtures are added below.
clearMissions();
setSite({});
// The current campaign catalog is editorial data, not evidence for historical fixtures.
for (const file of ['story-missions.json', 'mission-tips.json']) fs.rmSync(path.join(tmp, 'data', file), { force: true });
const guideFiles = fs.readdirSync(path.join(tmp, 'content')).filter((f) => f.endsWith('.md'));
for (const f of guideFiles) {
  const file = path.join(tmp, 'content', f);
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace(/^---\n([\s\S]*?)\n---/, (_, meta) => `---\n${meta.replace(/^updated: .*$/m, 'updated: 2026-11-15').replace(/^videoUploadDate: .*$/m, 'videoUploadDate: 2026-11-15').replace(/^published: .*\n?/m, '')}\n---`));
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

// Watch metadata must survive rebuilds, and incomplete or inaccessible media fails the build.
const watchFile = path.join(tmp, 'content/minimap-video.md');
const watchText = fs.readFileSync(watchFile, 'utf8');
fs.writeFileSync(watchFile, watchText.replace('updated: 2026-11-15', 'updated: 2026-11-20'));
r = run('build.mjs', '2026-11-20');
expect('editing a watch page does not reset the original video upload date', r.ok && out('minimap-video/index.html').includes('"uploadDate":"2026-11-15"'), r.out);
for (const [name, from, to, needle] of [
  ['missing local MP4', 'videoFile: minimap-settings-explainer.mp4', 'videoFile: missing-clip.mp4', '"videoFile"'],
  ['path traversal', 'videoFile: minimap-settings-explainer.mp4', 'videoFile: ../minimap-settings-explainer.mp4', '"videoFile"'],
  ['missing poster', 'videoPoster: minimap-settings-poster.jpg', 'videoPoster: missing-poster.jpg', '"videoPoster"'],
  ['zero duration', 'videoSeconds: 18', 'videoSeconds: 0', '"videoSeconds"'],
  ['impossible upload date', 'videoUploadDate: 2026-11-15', 'videoUploadDate: 2026-02-30', '"videoUploadDate"'],
  ['future upload date', 'videoUploadDate: 2026-11-15', 'videoUploadDate: 2099-12-31', '"videoUploadDate"'],
  ['missing creator', 'videoCreator: Wasted Loop\n', '', '"videoCreator"'],
  ['missing transcript', '{#transcript}', '{#other-text}', '"transcript"'],
]) {
  fs.writeFileSync(watchFile, watchText.replace(from, to));
  rejects(`watch page refuses ${name}`, '2026-11-20', needle);
}
fs.writeFileSync(watchFile, watchText);

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
expect('home with community guides points to the mission list or chapter checklist', /<a class="btn" href="\/missions\/">(Browse mission guides|Open mission checklist)<\/a>/.test(out('index.html')) && /public gameplay sources|five-chapter checklist/.test(out('index.html')));
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

// Catalog routing and counts use deliberately small fixtures, independent of today's campaign data.
const catalogFile = path.join(tmp, 'data/story-missions.json');
const tipsFile = path.join(tmp, 'data/mission-tips.json');
const sourceList = 'https://www.powerpyx.com/catalog/#chapter';
const catalogRow = (key, title, extra = {}) => ({ key, title, aliases: [], optional: null, sourceUrls: [sourceList], ...extra });
const catalogFixture = {
  checkedDate: '2026-11-20', sources: [{ publisher: 'PowerPyx', url: sourceList }], coverage: { note: 'FIXTURE catalog includes story and optional entries, not a required mission count.' },
  chapters: [
    { id: 'opening', title: 'Opening chapter', spoiler: false, missions: [
      catalogRow('zz-fixture-dock-job', 'FIXTURE Direct Guide', { aliases: ['FIXTURE Alternate Name'], localSlug: 'missions/zz-fixture-bank-run' }),
      catalogRow('different-key', 'FIXTURE Alternate Name', { localSlug: 'missions/zz-fixture-bank-run' }),
    ] },
    { id: 'middle', title: 'FIXTURE Hidden Chapter', spoiler: true, missions: [
      catalogRow('zz-fixture-external', 'FIXTURE External Mission', { aliases: ['FIXTURE Alternate Name', 'harbor job'], walkthrough: { publisher: 'PowerPyx', url: 'https://www.powerpyx.com/real-observed-walkthrough/' } }),
      catalogRow('zz-fixture-unpublished', 'FIXTURE Unpublished Local', { localSlug: 'missions/zz-fixture-not-published', walkthrough: { publisher: 'VGC', url: 'https://www.videogameschronicle.com/guide/observed/' } }),
      catalogRow('zz-fixture-optional', 'FIXTURE Optional Entry', { optional: true, walkthrough: { publisher: 'PowerPyx', url: 'https://www.powerpyx.com/optional-observed/' } }),
    ] },
    { id: 'last', title: 'FIXTURE Final Chapter', spoiler: true, missions: [catalogRow('zz-fixture-source-only', 'FIXTURE Source Only', { sourceUrls: [sourceList, 'https://www.gtabase.com/gta-6/missions/observed-mission'] })] },
  ],
};
const putCatalog = (data = catalogFixture) => fs.writeFileSync(catalogFile, JSON.stringify(data));
put('a.md', community()); put('b.md', tested({ aliases: 'FIXTURE Alternate Name' })); setSite(gateOn);
const companionFile = path.join(tmp, 'content/chapter-3-missions.md');
const savedCompanion = fs.existsSync(companionFile) ? fs.readFileSync(companionFile, 'utf8') : null;
fs.writeFileSync(companionFile, '---\ntitle: FIXTURE Chapter Companion\nslug: chapter-3-missions\ndescription: Private test of supplemental objective links into an existing chapter companion.\nanswer: Fixture chapter objective help.\nupdated: 2026-11-20\n---\n\n## FIXTURE Objective {#zz-fixture-source-only}\n\nA fixture objective paragraph.\n');
const tipFixture = { checkedDate: '2026-11-20', sourceReview: 'automated', testedByUs: false, tips: { 'zz-fixture-source-only': { items: [{ question: 'FIXTURE Which door?', answer: 'FIXTURE Use the marked door.', sources: [{ publisher: 'PowerPyx', url: sourceList, at: 'Third chapter paragraph' }] }] } } };
putCatalog(); fs.writeFileSync(tipsFile, JSON.stringify(tipFixture));
builds('catalog builds a mix of authored, publisher and source-only entries', '2026-11-20');
let catalogHtml = hubHtml();
const fixtureRowHtml = (key) => catalogHtml.match(new RegExp(`<li data-story-key="${key}"[\\s\\S]*?</li>`))?.[0] || '';
expect('catalog coverage derives exact independent row totals', catalogHtml.includes('data-catalogue-count="6" data-local-count="2" data-publisher-count="3" data-source-count="1" data-objective-help-count="1"'));
expect('canonical mission identity takes priority over aliases and a conflicting override', fixtureRowHtml('zz-fixture-dock-job').includes('href="/missions/zz-fixture-dock-job/"') && !fixtureRowHtml('zz-fixture-dock-job').includes('href="/missions/zz-fixture-bank-run/"'));
expect('an explicit override links only to a real authored page', fixtureRowHtml('different-key').includes('href="/missions/zz-fixture-bank-run/"'));
expect('shared generic objective aliases never attach an unrelated local guide', fixtureRowHtml('zz-fixture-external').includes('data-guide-kind="publisher"') && !fixtureRowHtml('zz-fixture-external').includes('href="/missions/'));
expect('external fallback credits the original publisher and preserves the observed URL', fixtureRowHtml('zz-fixture-external').includes('href="https://www.powerpyx.com/real-observed-walkthrough/"') && fixtureRowHtml('zz-fixture-external').includes('PowerPyx walkthrough (external)'));
expect('unpublished local override falls back without fabricating a local page', !catalogHtml.includes('href="/missions/zz-fixture-not-published/"') && fixtureRowHtml('zz-fixture-unpublished').includes('https://www.videogameschronicle.com/guide/observed/'));
expect('a campaign reference gets one verified companion link without a fake walkthrough', fixtureRowHtml('zz-fixture-source-only').split('href="/chapter-3-missions/#zz-fixture-source-only"').length === 2 && fixtureRowHtml('zz-fixture-source-only').includes('Campaign reference') && !catalogHtml.includes('href="/missions/zz-fixture-source-only/"'));
expect('an observed GTA Base mission URL receives a descriptive reference label', fixtureRowHtml('zz-fixture-source-only').includes('<a href="https://www.gtabase.com/gta-6/missions/observed-mission" rel="noopener">GTA Base mission entry</a>'));
expect('unknown optional status does not become a required label', (catalogHtml.match(/class="catalogue-optional"/g) || []).length === 1 && !catalogHtml.includes('Required mission'));
expect('native chapter disclosures protect later names without needing JavaScript', /id="catalogue-opening"[^>]* open>/.test(catalogHtml) && !/id="catalogue-middle"[^>]* open>/.test(catalogHtml) && !/id="catalogue-last"[^>]* open>/.test(catalogHtml) && catalogHtml.indexOf('Spoiler warning:') < catalogHtml.indexOf('<h3>FIXTURE Hidden Chapter'));
expect('catalog tips retain their exact answer and evidence location with one provenance note', catalogHtml.includes('FIXTURE Use the marked door.') && catalogHtml.includes('Third chapter paragraph') && (catalogHtml.match(/Quick answers cite published gameplay sources/g) || []).length === 1);
expect('catalog source checks move hub, schema and sitemap freshness together', sameDate(hubDate(), '2026-11-20'));
for (const [label, mutate, needle] of [
  ['future source date', (d) => d.checkedDate = '2099-12-31', 'checkedDate'],
  ['duplicate entry key', (d) => d.chapters[1].missions[0].key = d.chapters[0].missions[0].key, 'globally unique'],
  ['missing evidence link', (d) => d.chapters[0].missions[0].sourceUrls = [], 'every entry needs'],
  ['unsafe walkthrough URL', (d) => d.chapters[1].missions[0].walkthrough.url = 'javascript:alert(1)', 'walkthrough needs'],
  ['unguarded later chapter', (d) => d.chapters[1].spoiler = false, 'spoiler protection'],
]) { const changed = structuredClone(catalogFixture); mutate(changed); putCatalog(changed); rejects(`catalog refuses ${label}`, '2026-11-20', needle); }
putCatalog();
for (const [label, mutate, needle] of [
  ['a false personally-tested claim', (d) => d.testedByUs = true, 'testedByUs:false'],
  ['an unknown mission identity', (d) => d.tips['zz-fixture-source-only'].missionKey = 'not-in-catalog', 'catalog mission key'],
  ['an unsupported answer', (d) => d.tips['zz-fixture-source-only'].items[0].sources = [], 'linked publisher evidence'],
]) { const changed = structuredClone(tipFixture); mutate(changed); fs.writeFileSync(tipsFile, JSON.stringify(changed)); rejects(`catalog tip refuses ${label}`, '2026-11-20', needle); }
for (const file of [catalogFile, tipsFile]) fs.rmSync(file, { force: true });
if (savedCompanion === null) fs.rmSync(companionFile); else fs.writeFileSync(companionFile, savedCompanion);
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
  expect('community page shows the untested notice and review line', page.includes('Not tested by this site.') && !page.includes('Not tested by us yet.') && page.includes('Source check was automated') && page.includes('Community-sourced</span>') && !/Tested on /.test(page));
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
  expect('Xbox cloud and installed-copy guidance stays distinct', lh.includes('Xbox Cloud Gaming needs an internet connection throughout play') && lh.includes('using-xbox-one-offline'));
  expect('guides omit legacy fact badges', !/Not yet known|class="tag tag-(unknown|confirmed)"|Fact labels/i.test(lh));
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

// 5. Publisher verification works before ads; serving still needs a slot and both confirmations.
clearMissions(); put('b.md', tested({ ads: 'yes' }));
const adIds = { adsenseClient: 'ca-pub-0000000000000000', adsenseSlot: '0000000000' };
const expectedAdsTxt = 'google.com, pub-0000000000000000, DIRECT, f08c47fec0942fa0\n';
setSite({ ...gateOn, adsenseClient: adIds.adsenseClient, adsenseSlot: '' });
expect('publisher-only verification builds without an ad slot', run('build.mjs', '2026-11-20').ok);
expect('publisher-only verification writes the exact ads.txt seller record', out('ads.txt') === expectedAdsTxt);
expect('publisher-only verification makes no ad requests', !out('index.html').includes('adsbygoogle') && !out('missions/zz-fixture-bank-run/index.html').includes('adsbygoogle'));
setSite({ ...gateOn, ...adIds }); run('build.mjs', '2026-11-20');
expect('IDs alone do not turn ads on and keep verification available', !out('missions/zz-fixture-bank-run/index.html').includes('adsbygoogle') && out('ads.txt') === expectedAdsTxt);
expect('the homepage can verify the publisher for review while ad requests stay off', out('index.html').includes(`<meta name="google-adsense-account" content="${adIds.adsenseClient}">`) && !out('index.html').includes('adsbygoogle.js'));
setSite({ ...gateOn, ...adIds, adsEnabled: true }); run('build.mjs', '2026-11-20');
expect('IDs plus one confirmation still leave ads off', !out('missions/zz-fixture-bank-run/index.html').includes('adsbygoogle'));
setSite({ ...gateOn, ...adIds, adsConsentConfirmed: true }); run('build.mjs', '2026-11-20');
expect('consent alone still leaves ads off', !out('missions/zz-fixture-bank-run/index.html').includes('adsbygoogle'));
setSite({ ...gateOn, ...adIds, adsEnabled: true, adsConsentConfirmed: true }); run('build.mjs', '2026-11-20');
expect('IDs plus both confirmations turn ads on for an opted-in guide only', out('missions/zz-fixture-bank-run/index.html').includes('adsbygoogle') && !out('index.html').includes('adsbygoogle') && fs.existsSync(path.join(tmp, 'dist/ads.txt')));
for (const adsenseSlot of ['', undefined, 'not-a-slot', '123\n', 123]) {
  setSite({ ...gateOn, adsenseClient: adIds.adsenseClient, adsenseSlot, adsEnabled: true, adsConsentConfirmed: true }); run('build.mjs', '2026-11-20');
  expect(`missing or invalid slot ${JSON.stringify(adsenseSlot)} stays unmonetized with verification available`, !out('missions/zz-fixture-bank-run/index.html').includes('adsbygoogle') && out('ads.txt') === expectedAdsTxt);
}
for (const adsenseClient of ['', undefined]) {
  setSite({ ...gateOn, adsenseClient, adsenseSlot: adIds.adsenseSlot, adsEnabled: true, adsConsentConfirmed: true }); run('build.mjs', '2026-11-20');
  expect(`omitted publisher ${JSON.stringify(adsenseClient)} removes verification and ad output`, !fs.existsSync(path.join(tmp, 'dist/ads.txt')) && !out('index.html').includes('google-adsense-account') && !out('missions/zz-fixture-bank-run/index.html').includes('adsbygoogle'));
}
for (const adsenseClient of ['pub-0000000000000000', 'ca-pub-123', 'ca-pub-0000000000000000\n', ' ca-pub-0000000000000000', 'ca-pub-0000000000000000, RESELLER', null, false, 123, ['ca-pub-0000000000000000']]) {
  setSite({ ...gateOn, adsenseClient });
  rejects(`invalid publisher ${JSON.stringify(adsenseClient)} is rejected`, '2026-11-20', 'adsenseClient must be empty or an AdSense publisher ID');
}

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

// 5c. Mission-step sharing: native controls, exact anchors and a selectable fallback.
clearMissions(); put('a.md', community()); setSite(gateOn);
r = run('build.mjs', '2026-11-20');
const sharePage = out('missions/zz-fixture-dock-job/index.html');
expect('mission steps stay static and get the share script, with FAQ outside its scope', r.ok && sharePage.includes('<div data-mission-steps><h2 id="how-to-start">') && sharePage.includes('Fixture crane step.') && sharePage.includes('src="/mission-share.js"') && sharePage.includes('</div>\n<section class="faq">') && !sharePage.includes('Copy link to this step'), r.out);
expect('step sharing is absent from the hub, general guides and watch page', ['missions/index.html', 'launch-help/index.html', 'minimap-video/index.html'].every((file) => !/data-mission-steps|src="\/mission-share.js"/.test(out(file))));
{
  // A small DOM fixture exercises the actual browser script without adding a runtime dependency.
  class Element {
    constructor(tag, text = '') { this.tagName = tag.toUpperCase(); this.textContent = text; this.children = []; this.dataset = {}; this.attrs = {}; this.events = {}; this.id = ''; this.className = ''; }
    append(...nodes) { for (const node of nodes) { node.parent = this; this.children.push(node); } }
    get nextElementSibling() { return this.parent?.children[this.parent.children.indexOf(this) + 1] || null; }
    after(node) { node.parent = this.parent; this.parent.children.splice(this.parent.children.indexOf(this) + 1, 0, node); }
    matches(selector) { return selector.split(',').some((part) => { const s = part.trim(); return s.startsWith('.') ? this.className.split(' ').includes(s.slice(1)) : s === 'figure[data-video]' ? this.tagName === 'FIGURE' && this.dataset.video !== undefined : /^h[23]\[id\]$/.test(s) ? this.tagName === s.slice(0, 2).toUpperCase() && Boolean(this.id) : this.tagName === s.toUpperCase(); }); }
    querySelectorAll(selector) { return this.children.flatMap((child) => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]); }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    setAttribute(name, value) { this.attrs[name] = value; }
    addEventListener(name, fn) { this.events[name] = fn; }
    focus() { this.focused = true; }
    select() { this.selected = true; }
    setSelectionRange(start, end) { this.selectionStart = start; this.selectionEnd = end; }
  }
  const heading = (tag, id, text) => Object.assign(new Element(tag, text), { id });
  const script = fs.readFileSync(path.join(tmp, 'assets/mission-share.js'), 'utf8');
  const fixture = (clipboard, canonical = 'https://gtasixmissions.com/missions/zz-fixture-dock-job/') => {
    const root = new Element('div');
    const first = heading('h2', 'crane-step', 'Reach the crane');
    const sub = heading('h3', 'if-stuck', 'If the crane stops');
    const video = new Element('figure'); video.dataset.video = 'AAAAAAAAAAA';
    const nav = new Element('p', 'Back to the mission list'); nav.className = 'nav-note';
    root.append(first, new Element('p', 'The objective instructions remain.'), sub, new Element('ol', 'Try the recovery step.'), heading('h2', 'watch', 'Watch gameplay'), new Element('p', 'Video introduction'), video, heading('h2', 'more-links', 'More guides'), nav, heading('h2', 'empty', 'Empty section'));
    const document = { querySelectorAll: (s) => s === '[data-mission-steps]' ? [root] : [], querySelector: (s) => s === 'link[rel="canonical"]' && canonical ? { href: canonical } : null, createElement: (tag) => new Element(tag) };
    const context = { document, navigator: clipboard ? { clipboard } : {}, location: { href: 'https://gtasixmissions.com/missions/zz-fixture-dock-job/?tracking=discard#old' }, URL };
    vm.runInNewContext(script, context);
    return { root, first, context, controls: first.nextElementSibling, buttons: root.querySelectorAll('button') };
  };
  const copied = [];
  const success = fixture({ writeText: async (value) => copied.push(value) });
  expect('one native keyboard button per playable H2/H3, excluding video, navigation-only and empty sections', success.buttons.length === 2 && success.buttons.every((button) => button.tagName === 'BUTTON' && button.type === 'button') && success.first.textContent === 'Reach the crane');
  const [button, status, manual] = success.controls.children;
  expect('copy controls have distinct step names and announced feedback', button.attrs['aria-label'] === 'Copy link to this step: Reach the crane' && status.attrs.role === 'status' && status.attrs['aria-live'] === 'polite' && button.attrs['aria-describedby'] === status.id && manual.hidden);
  await button.events.click();
  expect('clipboard success writes the canonical URL and exact objective anchor', copied[0] === 'https://gtasixmissions.com/missions/zz-fixture-dock-job/#crane-step' && status.textContent === 'Link copied.' && manual.hidden && !button.disabled);
  let finishCopy;
  let requests = 0;
  const pending = fixture({ writeText: () => { requests++; return new Promise((resolve) => { finishCopy = resolve; }); } });
  const pendingButton = pending.buttons[0];
  const firstCopy = pendingButton.events.click();
  await pendingButton.events.click();
  expect('copying preserves native keyboard focusability and ignores repeated activation', !pendingButton.disabled && pendingButton.attrs['aria-disabled'] === 'true' && requests === 1);
  finishCopy(); await firstCopy;
  expect('the copy action becomes available again without replacing its button', pendingButton.attrs['aria-disabled'] === 'false' && pending.buttons[0] === pendingButton);
  vm.runInNewContext(script, success.context);
  expect('running the enhancement again does not duplicate controls', success.root.querySelectorAll('button').length === 2);
  for (const [label, clipboard] of [['denied', { writeText: async () => { throw new Error('Denied'); } }], ['unavailable', undefined]]) {
    const fallback = fixture(clipboard, null);
    const [b, message, input] = fallback.controls.children;
    await b.events.click();
    expect(`clipboard ${label} exposes and selects the exact link for keyboard or touch copying`, !input.hidden && input.readOnly && input.value === 'https://gtasixmissions.com/missions/zz-fixture-dock-job/#crane-step' && input.focused && input.selected && input.selectionStart === 0 && input.selectionEnd === input.value.length && /keyboard|touch/.test(message.textContent) && !/copied/i.test(message.textContent) && !b.disabled);
    fallback.context.navigator.clipboard = { writeText: async () => {} };
    await b.events.click();
    expect('a successful retry hides the manual fallback', input.hidden && message.textContent === 'Link copied.');
  }
}

// 6. IndexNow submits only what a push changed, and reports failures as failures
fs.copyFileSync(path.join(ROOT, 'indexnow.mjs'), path.join(tmp, 'indexnow.mjs'));
const git = (...args) => spawnSync('git', ['-c', 'user.name=test', '-c', 'user.email=test@test.invalid', '-c', 'commit.gpgsign=false', ...args], { cwd: tmp, encoding: 'utf8' });
const commit = (msg) => { git('add', '-A', 'content', 'data', 'site.json', 'build.mjs'); git('commit', '-q', '-m', msg); return git('rev-parse', 'HEAD').stdout.trim(); };
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
// A catalog-only publish updates the existing mission hub without adding member URLs.
fs.appendFileSync(path.join(tmp, 'data/story-missions.json'), '\n');
const catalogCommit = commit('catalog only');
const catalogDry = run('indexnow.mjs', '', { DRY_RUN: '1', BEFORE: c4, AFTER: catalogCommit }).out;
expect('a catalog-only edit submits just the mission hub', /would submit 1 URL/.test(catalogDry) && catalogDry.trim().endsWith('https://gtasixmissions.com/missions/'), catalogDry);
// Clip changes use actual public routes and rendered differences, not every catalog member.
const clipFile = path.join(tmp, 'data/clips.json');
const beforeClipTests = fs.readFileSync(clipFile, 'utf8');
const sitemapBeforeClipTests = fs.readFileSync(path.join(tmp, 'dist/sitemap.xml'), 'utf8');
const clipFixture = (id, slug, added = '2000-01-01') => ({ id, slug, title: `FIXTURE ${slug}`, creator: 'Fixture creator', topic: 'Details', seconds: 60, uploaded: `${added}T00:00:00Z`, added, thumb: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, thumbWidth: 640, thumbHeight: 360, description: 'An original fixture description long enough to validate this private video record.', guide: '/launch-help/', guideLabel: 'Launch help' });
const clipA = clipFixture('aaaaaaaaaaa', 'zz-fixture-clip-a');
const clipB = clipFixture('bbbbbbbbbbb', 'zz-fixture-clip-b');
const futureClip = clipFixture('fffffffffff', 'zz-fixture-future-clip', '2099-01-01');
const saveClips = (clips) => fs.writeFileSync(clipFile, JSON.stringify(clips, null, 2));
const publicClips = (clips) => fs.writeFileSync(path.join(tmp, 'dist/sitemap.xml'), `<urlset>${['/', '/clips/', ...clips.map((c) => `/clips/${c.slug}/`)].map((route) => `<url><loc>https://gtasixmissions.com${route}</loc></url>`).join('')}</urlset>`);
const submittedRoutes = (before, after) => run('indexnow.mjs', '', { DRY_RUN: '1', BEFORE: before, AFTER: after }).out;
const exactlyRoutes = (output, routes) => JSON.stringify(output.split('\n').filter((line) => line.startsWith('https://gtasixmissions.com')).sort()) === JSON.stringify(routes.map((route) => 'https://gtasixmissions.com' + route).sort());
saveClips([clipA, futureClip]); publicClips([clipA]);
let clipBefore = commit('clip baseline');
clipA.moments = [{ at: 10, title: 'Fixture moment' }]; saveClips([clipA, futureClip]);
let clipAfter = commit('clip moment edit');
let clipDry = submittedRoutes(clipBefore, clipAfter);
expect('a clip moment edit submits only its public watch page', exactlyRoutes(clipDry, ['/clips/zz-fixture-clip-a/']), clipDry);
clipBefore = clipAfter; clipA.thumbWidth = 1280; clipA.thumbHeight = 720; saveClips([clipA, futureClip]);
clipAfter = commit('clip thumbnail dimensions edit'); clipDry = submittedRoutes(clipBefore, clipAfter);
expect('featured thumbnail dimensions update its watch page, hub and home', exactlyRoutes(clipDry, ['/clips/zz-fixture-clip-a/', '/clips/', '/']), clipDry);
clipBefore = clipAfter; clipA.description += ' An updated explanation.'; saveClips([clipA, futureClip]);
clipAfter = commit('featured clip description edit'); clipDry = submittedRoutes(clipBefore, clipAfter);
expect('a featured clip edit submits its watch page and affected hub/home', exactlyRoutes(clipDry, ['/clips/zz-fixture-clip-a/', '/clips/', '/']), clipDry);
clipBefore = clipAfter; futureClip.description += ' Unpublished edit.'; saveClips([clipA, futureClip]);
clipAfter = commit('future clip edit'); clipDry = submittedRoutes(clipBefore, clipAfter);
expect('editing an unpublished future clip submits nothing', /nothing submitted/.test(clipDry), clipDry);
clipBefore = clipAfter;
fs.writeFileSync(clipFile, JSON.stringify([clipA, futureClip].map((clip) => Object.fromEntries(Object.entries(clip).reverse()))));
clipAfter = commit('clip json formatting'); clipDry = submittedRoutes(clipBefore, clipAfter);
expect('clip JSON formatting and object-key order do not resubmit unchanged pages', /nothing submitted/.test(clipDry), clipDry);
clipBefore = clipAfter; saveClips([clipA, clipB, futureClip]); publicClips([clipA, clipB]);
clipAfter = commit('public clip added'); clipDry = submittedRoutes(clipBefore, clipAfter);
expect('a public clip addition includes its route and changed next-video links', exactlyRoutes(clipDry, ['/clips/zz-fixture-clip-a/', '/clips/zz-fixture-clip-b/', '/clips/', '/']), clipDry);
clipBefore = clipAfter; clipB.slug = 'zz-fixture-renamed-clip'; saveClips([clipA, clipB, futureClip]); publicClips([clipA, clipB]);
clipAfter = commit('public clip renamed'); clipDry = submittedRoutes(clipBefore, clipAfter);
expect('a public clip rename submits the old and new routes plus changed listings', exactlyRoutes(clipDry, ['/clips/zz-fixture-clip-a/', '/clips/zz-fixture-clip-b/', '/clips/zz-fixture-renamed-clip/', '/clips/', '/']), clipDry);
clipBefore = clipAfter; saveClips([clipA, futureClip]); publicClips([clipA]);
clipAfter = commit('public clip removed'); clipDry = submittedRoutes(clipBefore, clipAfter);
expect('removing a public clip submits its old route and affected pages', exactlyRoutes(clipDry, ['/clips/zz-fixture-clip-a/', '/clips/zz-fixture-renamed-clip/', '/clips/', '/']), clipDry);
clipBefore = clipAfter; saveClips([clipA]);
clipAfter = commit('future clip removed'); clipDry = submittedRoutes(clipBefore, clipAfter);
expect('removing a never-published future clip submits nothing', /nothing submitted/.test(clipDry), clipDry);
clipBefore = clipAfter; saveClips([]); publicClips([]);
clipAfter = commit('last public clip removed'); clipDry = submittedRoutes(clipBefore, clipAfter);
expect('removing the last public clip updates its old route and the empty listings', exactlyRoutes(clipDry, ['/clips/zz-fixture-clip-a/', '/clips/', '/']), clipDry);
// Native watch pages appear in the same library; body-only edits do not change their cards.
const nativeFile = path.join(tmp, 'content/zz-fixture-native-video.md');
const nativeMeta = { title: 'FIXTURE native watch', nav: 'Fixture original video', slug: 'zz-fixture-native-video', updated: '2000-01-01', videoFile: 'fixture.mp4', videoPoster: 'fixture.jpg', videoSeconds: '18', videoCreator: 'Fixture creator' };
const writeNative = (body = 'Fixture transcript.') => fs.writeFileSync(nativeFile, `---\n${Object.entries(nativeMeta).map(([key, value]) => `${key}: ${value}`).join('\n')}\n---\n${body}\n`);
const nativeSitemap = (routes) => fs.writeFileSync(path.join(tmp, 'dist/sitemap.xml'), `<urlset>${['/', '/clips/', ...routes].map((route) => `<url><loc>https://gtasixmissions.com${route}</loc></url>`).join('')}</urlset>`);
let nativeBefore = clipAfter;
writeNative(); nativeSitemap(['/zz-fixture-native-video/']);
let nativeAfter = commit('original video added'); let nativeDry = submittedRoutes(nativeBefore, nativeAfter);
expect('adding a public original video updates its watch page, library and home', exactlyRoutes(nativeDry, ['/zz-fixture-native-video/', '/clips/', '/']), nativeDry);
for (const [key, value] of [['nav', 'Renamed original video card'], ['videoPoster', 'different-poster.jpg'], ['videoSeconds', '19'], ['videoCreator', 'Different fixture creator']]) {
  nativeBefore = nativeAfter; nativeMeta[key] = value; writeNative();
  nativeAfter = commit(`original video ${key} changed`); nativeDry = submittedRoutes(nativeBefore, nativeAfter);
  expect(`changing original video ${key} updates the watch page and library only`, exactlyRoutes(nativeDry, ['/zz-fixture-native-video/', '/clips/']), nativeDry);
}
nativeBefore = nativeAfter; writeNative('Changed fixture transcript only.');
nativeAfter = commit('original video body changed'); nativeDry = submittedRoutes(nativeBefore, nativeAfter);
expect('a native video body-only edit leaves the library out', exactlyRoutes(nativeDry, ['/zz-fixture-native-video/']), nativeDry);
nativeBefore = nativeAfter; nativeMeta.slug = 'zz-fixture-native-renamed'; writeNative(); nativeSitemap(['/zz-fixture-native-renamed/']);
nativeAfter = commit('original video route renamed'); nativeDry = submittedRoutes(nativeBefore, nativeAfter);
expect('renaming a native watch route updates both routes and the library', exactlyRoutes(nativeDry, ['/zz-fixture-native-video/', '/zz-fixture-native-renamed/', '/clips/']), nativeDry);
nativeBefore = nativeAfter; fs.rmSync(nativeFile); nativeSitemap([]);
nativeAfter = commit('original video removed'); nativeDry = submittedRoutes(nativeBefore, nativeAfter);
expect('removing a public original video updates its old route and the library', exactlyRoutes(nativeDry, ['/zz-fixture-native-renamed/', '/clips/']), nativeDry);
fs.writeFileSync(clipFile, beforeClipTests);
fs.writeFileSync(path.join(tmp, 'dist/sitemap.xml'), sitemapBeforeClipTests);
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
