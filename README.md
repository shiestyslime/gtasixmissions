# GTA Six Missions

Independent GTA VI guide at https://gtasixmissions.com. The site builds static HTML with Node.js. GitHub Actions uses Node 22.

## Build and preview

```bash
NO_FETCH=1 node build.mjs
node check.mjs
python3 -m http.server 4173 --bind 127.0.0.1 --directory dist
```

Open http://127.0.0.1:4173. The check verifies titles, internal links and anchors, structured data, and required files. For a production build, run `node build.mjs` so it can refresh headlines. To preview the post-launch wording, run `NO_FETCH=1 BUILD_DATE=2026-11-20 node build.mjs` and then `node check.mjs`.

## Publish a verified mission

1. Play the retail game. Record the mission and on-screen objective, the steps that worked, the success cue, and any reproduced recovery steps. Record the console, test date, and build if shown. Keep recordings and sensitive source notes out of the repo.
2. Copy `templates/tested-mission.md` to `content/missions/<slug>.md` and replace every example value with verified information. Leave `status: draft` until review.
3. Guide format, for both tiers:
   - `answer` is one direct action of 300 characters or fewer. The build refuses longer answers.
   - Use H2 or H3 headings for each step so search can jump to it. Pin a step's URL with `{#id}` at the end of the heading, for example `## Open the garage {#open-the-garage}`. Keep pinned ids when you reword a heading.
   - Add "Before you start" and "If the objective does not advance" only when you have evidence for them.
   - `published` is the first day the guide went public. Set it once and never change it. Leave it out if you do not know it; the page then claims no first-publication date.
   - `updated` moves on every substantive edit. The mission hub's date, its structured data and its sitemap entry follow the newest listed guide automatically. If you remove or unpublish a guide, set `updated` on `content/missions.md` as well.
   - Keep story outcomes out of titles, headings, aliases and answers. `testedBuild`, pipe-separated `aliases` and numeric `order` (story order when known) are optional.
4. Review every claim and mark the ready guide `status: published`. The builder omits every mission without that status from pages, the sitemap and search. Keep sensitive drafts local if the repository is public.
5. Rebuild and run the check. On a phone-sized view, search the objective from home and follow the result. With JavaScript disabled, browse links from `/missions/` and check the target. Confirm the intended URL appears in the sitemap and that no draft appears there or in `search.json`.

Each mission page shows a scope box (evidence, platform, game version or source check, publisher), a Home / Missions / guide breadcrumb, numbered sources, and links to the neighbouring guides in the list.

## Release confirmation (needed for every mission guide)

No mission guide of either kind builds until both are true:

1. The build time has reached `missionPublishAfter` in `site.json`. This is the earliest verified regional retail unlock on a platform we cover, with its official page in `missionPublishAfterSource`. Today it is 2026-11-18T11:00:00Z, midnight on November 19 in New Zealand, from the New Zealand PlayStation Store listing for PS5. It is the start of an earliest regional publication window, not a worldwide unlock: most regions, including the US (05:00 UTC on November 19 on PS5), unlock later. If the setting is absent, `launchDate` is used. `launchDate` itself only switches the pre-launch and post-launch wording; player-facing unlock times live in the guides. The value may be at most 24 hours before `launchDate`.

   This replaces the earlier US-only gate (2026-11-19T05:00:00Z), which held back legitimate New Zealand retail sources for 18 hours.
2. An editor has recorded the retail release in `site.json` under `communityGuides`: `releaseConfirmedOn` (the day you confirmed it, from launch day to today) and `releaseSource` (an https page on Rockstar, PlayStation or Xbox that shows the game is out).

A date written inside a guide never opens this gate. Reaching the window does not prove that any source shows the released game, and a source dated before a given US time is not automatically a leak. Judge each source by its own platform and region: it may be used only if that region had actually released when it was recorded, and only if it shows real retail gameplay. A tested guide needs the two fields above. A community guide also needs `communityGuides.enabled: true`.

Every guide's `updated` date must be a real calendar date and not later than the build day. The same holds for `testedDate` and `checkedDate`, which also cannot be earlier than launch day.

## Publish a community-sourced mission guide

Use this tier when nobody on the team has played the mission yet. It never carries a tested label.

- **The switch.** Community guides need the release confirmation described under "Release confirmation" below, and also `communityGuides.enabled: true` in `site.json`. The daily task may not change either setting.
- Same file location and format as above, with these fields. Leave out `testedPlatform`, `testedDate` and `testedBuild`.

  ```text
  status: community
  checkedDate: YYYY-MM-DD
  sourceBasis: retail-gameplay
  sourceReview: automated
  ```

  - `checkedDate` is a real date, from launch day to today.
  - `sourceBasis: retail-gameplay` states that every linked source shows or says it played the released game. Pre-release previews, leaks and datamines do not qualify.
  - The build counts independent sources from the source records (see below). Leave `independentSources` out. If you write it, it must match the count.
  - `sourceReview` is `owner`, `approved-tester` or `automated`. The page shows which one. Never write a person's name here and never claim a review that did not happen.
- Copy `templates/community-mission.md`. The build refuses its placeholder links until you replace them.
- Public-source workflow, at launch:
  1. Find gameplay of the released retail game: a creator's own full playthrough video or an outlet's guide that says it played the launch version. Previews, trailers, leaks and datamines never count.
     Check the source's platform and region had actually released when it was recorded. A date alone proves neither the release nor the gameplay.
  2. Watch the gameplay or read a first-hand written account yourself. A video title, description or thumbnail alone never supports a step.
  3. Write each step in your own short sentences. Never copy a guide, transcript or caption, and never download, clip or re-upload footage.
  4. List each source once under `## Sources`, in this form:

     ```text
     - [What the source shows](https://www.youtube.com/watch?v=VIDEO_ID&t=754s) | by: Creator or publisher | group: creator-a | at: 12:34
     ```

     - `by` is the public creator or publisher. `at` is where the evidence is: a timestamp for a video, the section name for an article. If a video link has `t=`, it must match `at`.
     - `group` is the origin. Sources share a group when they share a creator or publisher, or when one copies, embeds, cites or summarizes the other. Different groups must be genuinely independent.
     - Two independent YouTube creators are two groups, even on the same site. Two uploads by one creator are one group.
     - For a long playthrough, list the same upload again for each evidence location (source 1 at 2:00, source 3 at 10:00), with the same `by` and `group`. It still counts as one origin. The build treats youtu.be, shorts, live, embed and mobile links to one video as the same upload, refuses one upload that names a different creator or group, and refuses the same upload at the same location twice.
     - The build checks these declarations for consistency. It cannot check that the footage shows what you say or that the groups are truly independent. That is your review, shown by `sourceReview`.
  5. Cite at least two groups beside the quick answer and every paragraph, list step, table row and note: `{src:1,2}`. The build refuses any of them without that. A paragraph that only links to other pages on this site may start with `{nav} ` instead. Search results and `llms-full.txt` carry only the sources cited in each excerpt.
  6. Set `sourcePlatforms` (comma-separated: `PS5`, `Xbox Series X|S`) only to platforms the sources show. Leave it out if they do not say.
  7. If sources disagree, say "Reports differ" or leave the step out.
- The page shows a "Community-sourced" label and a "Not tested by us yet" notice. The mission hub lists these guides apart from tested ones.
- To upgrade a guide after real play, switch it to `status: published`, add the tested fields, and rewrite any step your notes do not support. Keep the slug.

## Credit a creator's video

Put this on its own line in any guide:

```text
::: video <11-character YouTube id> | Your neutral label | Channel name
```

The page shows a play button, the channel name and a link to the upload. YouTube loads only after the reader presses play. Use the creator's own upload. Never download, re-upload or cut someone else's footage, and write a spoiler-free label instead of copying a spoiler title.

## Tests and readiness report

```bash
node test.mjs
node audit.mjs
```

`test.mjs` builds temporary copies of the site with fixture missions and checks the rules above, search ranking and the ad gate. It never writes fixtures into `content/` or `dist/`. The deploy workflow runs it before publishing.

`audit.mjs` reports what can earn or measure today and what is only prepared. It prints no IDs and estimates no earnings.

For general guides, edit `content/*.md`. Keep the current slug and headings that other pages link to, update `updated` after a material change, and put source links under `## Sources`. Questions under `## FAQ` use H3 headings. Use `{confirmed}`, `{reported}` and `{unknown}` for official statements, reporting and unknowns.

## Deployment and updates

The Pages workflow builds and checks pushes to `main`, on its six-hour schedule, or when run manually. It publishes `dist/`. After a push it also runs `node indexnow.mjs`, which tells Bing and other IndexNow search engines about guides whose source file changed in that push. A removed guide is submitted so engines drop it. The mission hub and home page are added only when a mission changed, and the home page when a guide's `updated` date changed. Unchanged pages are never resubmitted. Only HTTP 200 or 202 counts as accepted; anything else is logged as FAILED. An accepted submission is not proof of indexing. The key is `indexNowKey` in `site.json`.

`/feed.xml` is an Atom feed of guide updates, built from each guide's `updated` date. The corrections link on each guide comes from `correctionsUrl` in `site.json`. Test a branch or local copy first. Use the last known good build or revert the relevant commit if a release fails. `baseUrl` in `site.json` supplies canonicals and sitemap URLs. `googleSiteVerification` and `bingSiteVerification` add the Google Search Console and Bing Webmaster Tools verification tags to the home page only. A tag in the page is not proof that either account has verified the site.

Launch-aware editorial blocks switch on a rebuild using the `launchDate` in `site.json`. Players should check their own region and platform using `/release-date/`. `/news/` is a secondary footer feed, marked `noindex` and left out of the sitemap. The build refreshes it from configured feeds unless `NO_FETCH=1`. Walkthroughs require a manual test and edit.

## Revenue settings

- **Product links.** `aff:ps5-boxed`, `aff:xbox-boxed`, `aff:storage-ps5` and `aff:storage-xbox` currently lead to ordinary product pages. When the program approves this site and SKU, set that record's `affiliateUrl` in `site.json`, keep its ordinary `url` as fallback, and verify the nearby visible disclosure. An active tracked link receives `rel="sponsored nofollow noopener"`.
- **Ads.** Leave ads off until the host, domain, provider and consent setup are cleared. Ads need four settings in `site.json`: `adsenseClient`, `adsenseSlot`, `adsEnabled: true` (the provider approved this site) and `adsConsentConfirmed: true` (the consent and privacy setup is done and the privacy page matches it). IDs alone do nothing. Compare generated `ads.txt` with the account's entry. Add `ads: yes` only to an eligible published mission with at least three body H2s. Its first optional slot comes after the quick answer and two sections. Build and test a page on mobile before enabling more placements.
