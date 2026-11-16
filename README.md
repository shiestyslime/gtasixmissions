# GTA Six Missions (unofficial GTA 6 guide site, gtasixmissions.com)

A static site. No dependencies except Node 18+.

## Build and preview

```bash
node build.mjs
```

```bash
python3 -m http.server 4173 --directory dist
```

Then open http://localhost:4173.

## Files

- `site.json` : site name, domain, ad and affiliate settings
- `content/*.md` : one file per guide page
- `assets/` : stylesheet and icon
- `build.mjs` : turns the above into `dist/`
- `dist/` : the finished site. Upload this folder to any static host.

## Edit or add a guide

Copy a file in `content/`. Keep the front matter keys: `title`, `nav`, `slug`, `order`, `description`, `answer`, `updated`.

- `answer` is the one-line answer shown at the top. Search engines and AI tools quote it.
- Put `{confirmed}`, `{reported}` or `{unknown}` before a claim to label it.
- Questions under `## FAQ` (as `### Question`) become FAQ structured data.
- Links under `## Sources` become the source list.
- Change `updated` each time you edit, then rebuild.

## Before you deploy

1. Set `baseUrl` in `site.json` to your real domain. Canonical links, the sitemap and `llms.txt` depend on it.
2. Set `adPlaceholders` to `false`, or add your AdSense ID (below).
3. Rebuild and upload `dist/` (Cloudflare Pages, Netlify and GitHub Pages all work and have free tiers).
4. Submit `https://your-domain/sitemap.xml` in Google Search Console and Bing Webmaster Tools.

## Monetize

- **Ads:** set `adsenseClient` in `site.json` to your ID (`ca-pub-...`). The build then adds the ad script, the ad units and `ads.txt`.
- **Affiliate links:** fill `affiliateUrl` for each store in `site.json`. Links written as `[text](aff:amazon)` switch to the affiliate URL and get `rel="sponsored"`.
- **Sponsorships:** add a contact address to `content/about.md`.

## What the build adds for search and AI discovery

- Canonical URLs, meta descriptions, Open Graph tags
- JSON-LD: `WebSite`, `Article`, `BreadcrumbList`, `FAQPage`
- `sitemap.xml`, `robots.txt` (search and AI crawlers allowed)
- `llms.txt` and `llms-full.txt` (plain-text summaries for AI tools)

## What updates by itself

- **Countdown:** switches to "Out now" in the visitor's browser at launch. No rebuild needed.
- **Launch-aware text:** blocks marked `::: prelaunch` and `::: postlaunch` in `content/*.md` switch on the first rebuild after the launch date in `site.json`. Test with `BUILD_DATE=2026-11-20 node build.mjs`.
- **News page:** each rebuild pulls GTA 6 headlines from the publisher feeds listed in `site.json` and caches them in `data/news.json`. Skip the fetch with `NO_FETCH=1`.
- **Scheduled rebuild:** `.github/workflows/deploy.yml` rebuilds and publishes every 6 hours once the folder is in a GitHub repo with Pages enabled.

Guide text (walkthroughs, payouts) does not write itself. `UPDATE_ROUTINE.md` is the instruction sheet for a daily update pass by a person or an AI agent.

## Check the build

```bash
node check.mjs
```

It reports broken links, bad structured data and missing titles.
