// Playback starts only when the visitor requests it.
const play = document.querySelector('[data-play-clip]');
play?.addEventListener('click', (event) => {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  const frame = document.createElement('iframe');
  frame.src = 'https://www.youtube-nocookie.com/embed/' + play.dataset.playClip + '?autoplay=1&playsinline=1';
  frame.title = play.getAttribute('aria-label');
  frame.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
  frame.referrerPolicy = 'strict-origin-when-cross-origin';
  frame.allowFullscreen = true;
  play.replaceWith(frame);
  frame.focus();
});
const filters = document.querySelector('[data-clip-filters]');
if (filters) {
  const cards = [...document.querySelectorAll('.clip-collection [data-clip-topic]')];
  filters.hidden = false;
  filters.addEventListener('click', (event) => {
    const current=event.target.closest('button[data-filter]');
    if (!current) return;
    filters.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b===current)));
    for (const card of cards) card.hidden = current.dataset.filter !== 'All' && current.dataset.filter !== card.dataset.clipTopic;
    const count=cards.filter(c=>!c.hidden).length;
    document.querySelector('[data-filter-count]').textContent = count+' '+(count===1?'video':'videos');
  });
}
const player = document.querySelector('[data-watch-player]');
const sharedUrl = new URL(document.querySelector('link[rel=canonical]').href);
if (player) {
  const frame = player.querySelector('iframe');
  const source = frame.src;
  const start = new URL(location.href).searchParams.get('t');
  function selectMoment(seconds, fromClick) {
    if (!/^\d+$/.test(seconds) || Number(seconds) >= Number(player.dataset.duration)) return;
    const embed = new URL(source);
    embed.searchParams.set('start', seconds);
    if (fromClick) embed.searchParams.set('autoplay', '1');
    frame.src = embed.href;
    sharedUrl.searchParams.set('t', seconds);
    const original = document.querySelector('.clip-watch-actions a[href*="youtube.com"]');
    if (original) {
      const url = new URL(original.href);
      url.searchParams.set('t', seconds + 's');
      original.href = url.href;
    }
    if (fromClick) {
      const current = new URL(location.href);
      current.searchParams.set('t', seconds);
      history.replaceState(null, '', current);
      player.scrollIntoView({block: 'center', behavior: 'instant'});
    }
  }
  if (start !== null) selectMoment(start, false);
  for (const link of document.querySelectorAll('[data-clip-seek]')) {
    link.addEventListener('click', (event) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      selectMoment(link.dataset.clipSeek, true);
    });
  }
}
const share = document.querySelector('[data-share-clip]');
if (share) {
  share.hidden = false;
  share.addEventListener('click', async () => {
    const url = sharedUrl.href;
    const message = document.querySelector('[data-share-message]');
    if (navigator.share) {
      try { await navigator.share({title:document.querySelector('h1').textContent,url}); return; }
      catch (error) { if (error.name === 'AbortError') return; }
    }
    try {
      await navigator.clipboard.writeText(url);
      message.textContent='Video link copied.';
    } catch {
      const field = document.createElement('input');
      field.readOnly=true; field.value=url; field.setAttribute('aria-label','Video link to copy');
      message.replaceChildren('Copy this link ',field); field.focus(); field.select();
    }
  });
}
