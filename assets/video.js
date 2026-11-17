// Community videos load from YouTube only after the reader presses play.
for (const fig of document.querySelectorAll('figure[data-video]')) {
  const btn = fig.querySelector('.video-play');
  if (!btn) continue;
  btn.hidden = false;
  btn.addEventListener('click', () => {
    const frame = document.createElement('iframe');
    frame.src = 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(fig.dataset.video) + '?autoplay=1';
    frame.title = fig.querySelector('b')?.textContent || 'Video';
    frame.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    frame.allowFullscreen = true;
    const box = document.createElement('div');
    box.className = 'video-frame';
    box.append(frame);
    btn.replaceWith(box);
  });
}
