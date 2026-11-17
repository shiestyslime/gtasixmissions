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
2. Add `content/missions/<slug>.md`. Start with this private draft format and replace each example value with verified information.

   ```text
   ---
   title: GTA 6 Actual Mission Name Walkthrough
   slug: missions/actual-mission-name
   status: draft
   description: A concise summary of the specific objective and the recovery steps the guide covers.
   answer: Put the first useful action here.
   updated: YYYY-MM-DD
   testedPlatform: PS5
   testedDate: YYYY-MM-DD
   testedBuild: Build shown in the game, if available
   aliases: Alternate mission spelling | Another name players use
   order: 10
   ---

   ## How to start

   State the tested prerequisite and start point.

   ## Actual on-screen objective

   Give the next action, the landmark, and what success looks like.

   ### If the checkpoint is stuck

   Explain a verified recovery and when to use it.
   ```

3. Keep the public slug and headings stable once linked. Use distinct H2 or H3 headings for steps so search can jump directly to the right text. Keep story outcomes out of public titles, headings, aliases and search excerpts. Include only fields you verified. `testedBuild`, pipe-separated `aliases`, and numeric `order` are optional. The builder sorts by `order` and shows the tested platform, date and optional build.
4. Review every claim and mark the ready guide `status: published`. The builder omits every mission without that status from pages, the sitemap and search. Keep sensitive drafts local if the repository is public.
5. Rebuild and run the check. On a phone-sized view, search the objective from home and follow the result. With JavaScript disabled, browse links from `/missions/` and check the target. Confirm the intended URL appears in the sitemap and that no draft appears there or in `search.json`.

## Publish a community-sourced mission guide

Use this tier when nobody on the team has played the mission yet. It never carries a tested label.

- Same file location and format as above, with `status: community` and `checkedDate: YYYY-MM-DD`. Leave out `testedPlatform`, `testedDate` and `testedBuild`. The build fails if they are present.
- Write the steps in your own words from public reports published after release. Link at least two different source sites under `## Sources`. The build fails with fewer.
- The page shows a "Community-sourced" label and a "Not tested by us yet" notice. The mission hub lists these guides apart from tested ones.
- To upgrade a guide after real play, switch it to `status: published`, add the tested fields, and rewrite any step your notes do not support. Keep the slug.

## Credit a creator's video

Put this on its own line in any guide:

```text
::: video <11-character YouTube id> | Your neutral label | Channel name
```

The page shows a play button, the channel name and a link to the upload. YouTube loads only after the reader presses play. Use the creator's own upload. Never download, re-upload or cut someone else's footage, and write a spoiler-free label instead of copying a spoiler title.

For general guides, edit `content/*.md`. Keep the current slug and headings that other pages link to, update `updated` after a material change, and put source links under `## Sources`. Questions under `## FAQ` use H3 headings. Use `{confirmed}`, `{reported}` and `{unknown}` for official statements, reporting and unknowns.

## Deployment and updates

The Pages workflow builds and checks pushes to `main`, on its six-hour schedule, or when run manually. It publishes `dist/`. After a push or manual run it also runs `node indexnow.mjs`, which tells Bing and other IndexNow search engines which pages changed. The key is `indexNowKey` in `site.json`. Test a branch or local copy first. Use the last known good build or revert the relevant commit if a release fails. `baseUrl` in `site.json` supplies canonicals and sitemap URLs.

Launch-aware editorial blocks switch on a rebuild using the `launchDate` in `site.json`. Players should check their own region and platform using `/release-date/`. `/news/` is a secondary footer feed, marked `noindex` and left out of the sitemap. The build refreshes it from configured feeds unless `NO_FETCH=1`. Walkthroughs require a manual test and edit.

## Revenue settings

- **Product links.** `aff:ps5-boxed`, `aff:xbox-boxed`, `aff:storage-ps5` and `aff:storage-xbox` currently lead to ordinary product pages. When the program approves this site and SKU, set that record's `affiliateUrl` in `site.json`, keep its ordinary `url` as fallback, and verify the nearby visible disclosure. An active tracked link receives `rel="sponsored nofollow noopener"`.
- **Ads.** Leave ads off until the host, domain, provider and consent setup are cleared. Set both `adsenseClient` and `adsenseSlot` in `site.json`. Compare generated `ads.txt` with the account's entry. Add `ads: yes` only to an eligible published mission with at least three body H2s. Its first optional slot comes after the quick answer and two sections. Build and test a page on mobile before enabling more placements.
