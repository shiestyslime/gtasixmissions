// Monetization readiness report. Run: node audit.mjs
// It separates what is ACTIVE (can earn or measure today) from what is only PREPARED in code.
// It prints no IDs or keys, and it never estimates earnings. Prepared settings are not revenue.
import fs from 'node:fs';
import path from 'node:path';
const site = JSON.parse(fs.readFileSync('site.json', 'utf8'));
const read = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.md')).map((f) => fs.readFileSync(path.join(dir, f), 'utf8')) : []);
const guides = read('content');
const missions = read('content/missions');
const status = (text) => (text.match(/^status:\s*(\S+)/m) || [])[1];
const line = (state, what, note = '') => console.log(`  [${state}] ${what}${note ? ` - ${note}` : ''}`);
let active = 0;

console.log(`Monetization readiness for ${site.baseUrl}\n`);

console.log('Measurement');
const built = fs.existsSync('dist') ? fs.readdirSync('dist', { recursive: true }).filter((f) => String(f).endsWith('.html')).map((f) => fs.readFileSync(path.join('dist', String(f)), 'utf8')).join('') : '';
const trackers = ['googletagmanager.com', 'google-analytics.com', 'plausible.io', 'cloudflareinsights.com', 'umami', 'posthog'].filter((t) => built.includes(t));
line(trackers.length ? 'ACTIVE' : 'MISSING', 'On-site analytics', trackers.length ? `found: ${trackers.join(', ')}` : built ? 'no analytics script in the built pages. Visits and clicks are not measured on-site' : 'run the build first to scan pages');
line(site.googleSiteVerification ? 'PREPARED' : 'MISSING', 'Google Search Console', site.googleSiteVerification ? 'verification tag is in the home page. Account state, sitemap and indexing cannot be checked from here' : 'no verification tag');
line(site.bingSiteVerification ? 'PREPARED' : 'MISSING', 'Bing Webmaster Tools', site.bingSiteVerification ? 'verification tag is in the home page. Whether Bing has verified the site, read the sitemap or indexed anything cannot be checked from here' : 'no verification tag');
line(site.indexNowKey ? 'PREPARED' : 'MISSING', 'IndexNow (Bing)', site.indexNowKey ? 'key file is built. An accepted submission is not proof of indexing' : 'no key');

console.log('\nAds');
const ids = Boolean(site.adsenseClient && site.adsenseSlot);
const adsOn = ids && site.adsEnabled === true && site.adsConsentConfirmed === true;
if (adsOn) active++;
line(adsOn ? 'ACTIVE' : 'NOT ACTIVE', 'Display ads', adsOn ? 'IDs set and both confirmations given. Check the ad account for real impressions' : `publisher and slot IDs ${ids ? 'set' : 'empty'}, adsEnabled ${site.adsEnabled === true}, adsConsentConfirmed ${site.adsConsentConfirmed === true}. All are required`);
const adPages = missions.filter((m) => /^ads:\s*yes/m.test(m) && ['published', 'community'].includes(status(m))).length;
line('INFO', 'Guides opted in to ads', String(adPages));

console.log('\nAffiliate links');
const content = [...guides, ...missions].join('\n');
for (const [key, a] of Object.entries(site.affiliates || {})) {
  const placements = content.split(`(aff:${key})`).length - 1;
  const on = Boolean(a.affiliateUrl) && placements > 0;
  if (on) active++;
  line(on ? 'ACTIVE' : 'NOT ACTIVE', key, `${placements} placement(s), ${a.affiliateUrl ? 'tracked link set' : `plain link to ${new URL(a.url).hostname}, no tracking, earns nothing`}`);
}

console.log('\nTrust and corrections');
line(site.correctionsUrl ? 'ACTIVE' : 'MISSING', 'Public corrections route', site.correctionsUrl ? `links to ${new URL(site.correctionsUrl).hostname}` : 'none');
line(site.contactEmail ? 'ACTIVE' : 'MISSING', 'Private contact address', site.contactEmail ? 'set' : 'none. Needed for sponsors and ad network applications');

console.log('\nContent');
line('INFO', 'General guides', String(guides.length));
line('INFO', 'Tested mission guides', String(missions.filter((m) => status(m) === 'published').length));
line('INFO', 'Community-sourced mission guides', String(missions.filter((m) => status(m) === 'community').length));
line('INFO', 'Earliest mission publication time', `${site.missionPublishAfter || `${site.launchDate} (launchDate, no separate setting)`}. Passing it publishes nothing without the release confirmation`);
line(site.communityGuides?.releaseConfirmedOn ? 'RECORDED' : 'MISSING', 'Release confirmation', site.communityGuides?.releaseConfirmedOn ? `confirmed on ${site.communityGuides.releaseConfirmedOn}` : 'no mission guide of either kind can build until an editor records it in site.json');
line(site.communityGuides?.enabled === true ? 'ON' : 'OFF', 'Community guide switch', site.communityGuides?.enabled === true ? `release confirmed on ${site.communityGuides.releaseConfirmedOn}` : 'no community guide can be built until an editor confirms the release in site.json');

console.log(`\nRevenue sources active: ${active}.`);
console.log(active ? 'Read actual clicks and earnings in each program\'s own dashboard. This report cannot see them.' : 'Nothing on the site can earn money in its current configuration. Earnings to date cannot be measured from here and should be treated as $0.');
