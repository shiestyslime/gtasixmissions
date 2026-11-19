// HTML for the video collection and its shareable, server-rendered watch pages.
import fs from 'node:fs';

function escape(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

const hasText = (value) => typeof value === 'string' && value.trim().length > 0;
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const videoIdPattern = /^[A-Za-z0-9_-]{11}$/;
const localGuidePattern = /^\/(?:[a-z0-9-]+(?:\/[a-z0-9-]+)*\/?)?(?:#[a-z0-9-]+)?$/;
const timestampPattern = /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;

export const clipUrl = (clip) => '/clips/' + clip.slug + '/';
export const watchUrl = (clip) => 'https://www.youtube.com/watch?v=' + clip.id;
export const embedUrl = (clip) => 'https://www.youtube-nocookie.com/embed/' + clip.id;

function runtime(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds / 60) % 60;
  const remainder = String(seconds % 60).padStart(2, '0');
  return hours
    ? `${hours}:${String(minutes).padStart(2, '0')}:${remainder}`
    : `${minutes}:${remainder}`;
}

function validDay(value) {
  if (!hasText(value) || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const instant = Date.parse(value + 'T00:00:00Z');
  return Number.isFinite(instant) && new Date(instant).toISOString().slice(0, 10) === value;
}

function validThumbnail(value, id) {
  if (!hasText(value)) return false;
  const match = /^https:\/\/i\.ytimg\.com\/(vi|vi_webp)\/([A-Za-z0-9_-]{11})\/(?:maxresdefault|hq720|sddefault|hqdefault|mqdefault|default|[0-3])\.(jpg|webp)(?:\?[^#\s\\]*)?$/u.exec(value);
  return Boolean(match && match[2] === id && match[3] === (match[1] === 'vi_webp' ? 'webp' : 'jpg'));
}

function validCreator(value) {
  if (!hasText(value)) return false;
  return /^https:\/\/(?:www\.)?youtube\.com\/(?:channel\/UC[A-Za-z0-9_-]{22}|(?:@|user\/|c\/)[\p{L}\p{M}\p{N}._-]+)\/?$/u.test(value);
}

function validateClip(clip) {
  const fail = (field) => { throw new Error(`Invalid ${field} for clip ${clip?.slug || '(unnamed)'}`); };
  if (!clip || typeof clip !== 'object' || Array.isArray(clip)) fail('record');
  if (!hasText(clip.id) || !videoIdPattern.test(clip.id)) fail('YouTube ID');
  if (!hasText(clip.slug) || !slugPattern.test(clip.slug)) fail('URL slug');

  for (const key of ['title', 'creator', 'description', 'guideLabel', 'topic']) {
    if (!hasText(clip[key])) fail(key);
  }
  if (clip.description.trim().length < 50) fail('description');
  if (!hasText(clip.guide) || !localGuidePattern.test(clip.guide)) fail('local guide URL');
  if (clip.creatorUrl !== undefined && !validCreator(clip.creatorUrl)) fail('YouTube creator URL');
  if (!validThumbnail(clip.thumb, clip.id)) fail('YouTube thumbnail URL');
  if (!Number.isSafeInteger(clip.seconds) || clip.seconds < 1) fail('duration');
  if (!validDay(clip.added)) fail('catalog date');
  if (!hasText(clip.uploaded) || !timestampPattern.test(clip.uploaded)
    || !validDay(clip.uploaded.slice(0, 10)) || !Number.isFinite(Date.parse(clip.uploaded))) {
    fail('upload timestamp');
  }
  if (clip.thumbWidth !== undefined || clip.thumbHeight !== undefined) {
    for (const value of [clip.thumbWidth, clip.thumbHeight]) {
      if (!Number.isSafeInteger(value) || value < 1) fail('thumbnail dimensions');
    }
  }
  if (clip.spoilers !== undefined && typeof clip.spoilers !== 'boolean') fail('spoiler flag');
  for (const key of ['spoilerNote', 'momentSource']) {
    if (clip[key] !== undefined && !hasText(clip[key])) fail(key);
  }
  if (clip.moments === undefined) return;
  if (!Array.isArray(clip.moments)) fail('video moments');
  let previous = -1;
  for (const moment of clip.moments) {
    if (!Number.isSafeInteger(moment?.at) || moment.at <= previous
      || moment.at >= clip.seconds || !hasText(moment.title)) fail('video moment');
    if (moment.question !== undefined || moment.answer !== undefined) {
      if (!hasText(moment.question) || !hasText(moment.answer)) fail('scene question and answer');
    }
    previous = moment.at;
  }
}

export function readClips(file, day) {
  if (!validDay(day)) throw new Error('Invalid clip build day');
  const entries = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(entries)) throw new Error('Clip catalog must be an array');
  const ids = new Set();
  const slugs = new Set();

  for (const clip of entries) {
    validateClip(clip);
    if (ids.has(clip.id) || slugs.has(clip.slug)) {
      throw new Error(`A clip needs a unique YouTube ID and URL slug: ${clip.slug}`);
    }
    ids.add(clip.id);
    slugs.add(clip.slug);
  }
  return entries.filter((clip) => clip.added <= day && clip.uploaded.slice(0, 10) <= day);
}

function meta(clip) {
  const spoilers = clip.spoilers ? ' · Story spoilers' : '';
  return `<span class="clip-meta">${escape(clip.creator)} <span aria-hidden="true">·</span> ${escape(clip.topic)}${spoilers}</span>`;
}

function thumbnail(clip, eager = false) {
  const dimensions = clip.thumbWidth && clip.thumbHeight
    ? `width="${clip.thumbWidth}" height="${clip.thumbHeight}"`
    : '';
  const loading = eager ? 'loading="eager" fetchpriority="high"' : 'loading="lazy"';
  return `<img src="${escape(clip.thumb)}" alt="" ${dimensions} ${loading} decoding="async" referrerpolicy="no-referrer">`;
}

function tile(clip) {
  const original = !clip.id && hasText(clip.url) && localGuidePattern.test(clip.url);
  const className = original ? 'clip-tile original-clip' : 'clip-tile';
  const href = original ? clip.url : clipUrl(clip);
  return `<a class="${className}" data-clip-topic="${escape(clip.topic)}" href="${escape(href)}">
    <span class="tile-visual">${thumbnail(clip)}<span class="clip-time">${runtime(clip.seconds)}</span></span>
    <strong>${escape(clip.title)}</strong>${meta(clip)}
  </a>`;
}

export function clipFeature(clip, inLibrary = false) {
  const link = inLibrary
    ? '<a class="clip-section-link" href="#browse-videos">Browse by topic ↓</a>'
    : '<a class="clip-section-link" href="/clips/">GTA 6 videos <span aria-hidden="true">↗</span></a>';
  const duration = runtime(clip.seconds);
  const url = clipUrl(clip);
  const featuredMoments = (clip.moments || []).slice(0, 2);
  const sceneLinks = featuredMoments.length === 2
    ? `<p class="clip-feature-moments">${featuredMoments.map((moment) =>
      `<a href="${url}?t=${moment.at}">${runtime(moment.at)} · ${escape(moment.title)}</a>`).join('<br>')}</p>`
    : '';

  return `<section class="clip-lead"><div class="wrap clip-lead-inner">
    <div class="lead-media" data-feature-player>
      <a class="lead-poster" href="${watchUrl(clip)}" data-play-clip="${clip.id}" aria-label="Play ${escape(clip.title)} by ${escape(clip.creator)}">
        ${thumbnail(clip, true)}<span class="clip-play" aria-hidden="true">▶</span><span class="clip-time">${duration}</span>
      </a>
    </div>
    <div class="clip-caption">
      ${link}
      <h2><a href="${url}">${escape(clip.title)}</a></h2>
      ${meta(clip)}
      <p>${escape(clip.description)}</p>
      ${sceneLinks}
      <a href="${url}" class="clip-detail">Watch all ${duration} <span aria-hidden="true">→</span></a>
    </div>
  </div></section>`;
}

export function clipCollection(clips) {
  const topics = new Set(clips.map((clip) => clip.topic));
  const groups = ['All'];
  if (topics.delete('18-second guides')) groups.push('18-second guides');
  groups.push(...topics);
  const filters = groups.map((group, index) =>
    `<button type="button" data-filter="${escape(group)}" aria-pressed="${index === 0}">${escape(group)}</button>`);

  return `<section class="wrap clip-collection">
    <h2 id="browse-videos">Browse videos</h2>
    <div class="clip-filters" data-clip-filters hidden role="group" aria-label="Filter videos by topic">${filters.join('')}</div>
    <p class="clip-count" data-filter-count aria-live="polite"></p>
    <div class="clip-grid">${clips.map(tile).join('')}</div>
  </section>`;
}

export function clipRail(clips) {
  return `<section class="wrap clip-rail">
    <div class="clip-section-head"><h2>More to watch</h2><a href="/clips/">All ${clips.length} videos →</a></div>
    <div class="clip-strip">${clips.slice(1, 6).map(tile).join('')}</div>
  </section>`;
}

function watchMoments(clip) {
  if (!clip.moments?.length) return '';
  const items = clip.moments.map((moment) =>
    `<li><a data-clip-seek="${moment.at}" href="${watchUrl(clip)}&amp;t=${moment.at}s"><time>${runtime(moment.at)}</time> ${escape(moment.title)}</a></li>`);
  const source = clip.momentSource ? `<p>${escape(clip.momentSource)}.</p>` : '';
  return `<section class="clip-moments"><h2>Jump to a moment</h2>${source}<ul>${items.join('')}</ul></section>`;
}

export function clipWatch(clip, clips, guideExists = true) {
  const index = clips.findIndex((entry) => entry.id === clip.id);
  const next = clips.length > 1 ? clips[(index + 1) % clips.length] : undefined;
  const others = clips.filter((entry) => entry.id !== clip.id && entry.id !== next?.id);
  const sameTopic = others.filter((entry) => entry.topic === clip.topic);
  const otherTopics = others.filter((entry) => entry.topic !== clip.topic);
  const related = [next, ...sameTopic, ...otherTopics].filter(Boolean).slice(0, 4);
  const nextLink = next ? `<a href="${clipUrl(next)}">Next video →</a>` : '';
  const spoiler = clip.spoilerNote
    ? `<details class="spoiler-note"><summary>Spoiler details</summary><p>${escape(clip.spoilerNote)}</p></details>`
    : '';
  const answers = (clip.moments || []).filter((moment) => moment.question).map((moment) =>
    `<div><h3>${escape(moment.question)}</h3><p>${escape(moment.answer)}
      <a href="${clipUrl(clip)}?t=${moment.at}" data-clip-seek="${moment.at}">Watch at ${runtime(moment.at)}</a></p></div>`);
  const guide = guideExists ? clip.guide : '/missions/';
  const label = guideExists ? clip.guideLabel : 'Open the mission checklist';

  return `<section class="clip-watch"><div class="wrap">
    <a class="clip-section-link" href="/clips/">← All GTA 6 videos</a>
    <h1>${escape(clip.title)}</h1>${meta(clip)}${spoiler}
    <div class="clip-player" data-watch-player="${clip.id}" data-duration="${clip.seconds}">
      <iframe src="${embedUrl(clip)}?playsinline=1" title="${escape(clip.title)} by ${escape(clip.creator)}"
        referrerpolicy="strict-origin-when-cross-origin" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>
    </div>
    <div class="clip-watch-actions">
      <button type="button" data-share-clip hidden>Share video</button>
      <a href="${watchUrl(clip)}" rel="noopener">Watch on YouTube ↗</a>
      ${nextLink}
    </div>
    <p data-share-message class="clip-count" role="status"></p>
    <p class="clip-intro">${escape(clip.description)}</p>
    ${watchMoments(clip)}
    ${answers.length ? `<section class="scene-answers"><h2>Questions about the footage</h2>${answers.join('')}</section>` : ''}
    <a class="clip-guide-link" href="${escape(guide)}">${escape(label)} →</a>
  </div></section>
  <section class="wrap clip-collection">
    ${related.length ? `<h2>Watch next</h2><div class="clip-grid">${related.map(tile).join('')}</div>` : ''}
    <p class="clip-sponsor"><a href="/about/#sponsorships">Sponsor a guide on GTA Six Missions</a></p>
  </section>`;
}

export function clipSchema(clip, base) {
  const url = base + clipUrl(clip);
  const creator = { '@type': 'Organization', name: clip.creator };
  if (clip.creatorUrl) creator.url = clip.creatorUrl;
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'VideoObject',
    '@id': url + '#video',
    name: clip.title,
    description: clip.description,
    thumbnailUrl: [clip.thumb],
    uploadDate: clip.uploaded,
    duration: `PT${clip.seconds}S`,
    embedUrl: embedUrl(clip),
    url,
    mainEntityOfPage: url,
    creator,
    sameAs: watchUrl(clip),
  };
  if (clip.moments?.length) {
    schema.hasPart = clip.moments.map((moment) => ({
      '@type': 'Clip',
      name: moment.title,
      startOffset: moment.at,
      url: url + '?t=' + moment.at,
    }));
  }
  return schema;
}

export function clipSitemap(clip) {
  return `<video:video>
    <video:thumbnail_loc>${escape(clip.thumb)}</video:thumbnail_loc>
    <video:title>${escape(clip.title)}</video:title>
    <video:description>${escape(clip.description)}</video:description>
    <video:player_loc>${embedUrl(clip)}</video:player_loc>
    <video:duration>${clip.seconds}</video:duration>
    <video:publication_date>${escape(clip.uploaded)}</video:publication_date>
  </video:video>`;
}
