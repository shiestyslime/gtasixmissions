// Progressive enhancement: the guide and its anchor links work without this script.
(() => {
  for (const root of document.querySelectorAll('[data-mission-steps]')) {
    for (const heading of root.querySelectorAll('h2[id], h3[id]')) {
      if (heading.dataset.shareReady) continue;
      let hasStep = false;
      let hasVideo = false;
      for (let next = heading.nextElementSibling; next && !/^H[23]$/.test(next.tagName); next = next.nextElementSibling) {
        if (next.matches('figure[data-video], video') || next.querySelector('figure[data-video], video')) hasVideo = true;
        if (next.matches('p, ol, ul, blockquote, table, .table-wrap') && !next.matches('.nav-note') && next.textContent.trim()) hasStep = true;
      }
      if (!hasStep || hasVideo) continue;
      heading.dataset.shareReady = 'true';
      const title = heading.textContent.trim();
      const url = new URL(document.querySelector('link[rel="canonical"]')?.href || location.href, location.href);
      url.search = '';
      url.hash = heading.id;
      const controls = document.createElement('div');
      controls.className = 'step-share';
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = 'Copy link to this step';
      button.setAttribute('aria-label', `Copy link to this step: ${title}`);
      const status = document.createElement('span');
      status.id = `share-status-${heading.id}`;
      status.setAttribute('role', 'status');
      status.setAttribute('aria-live', 'polite');
      status.setAttribute('aria-atomic', 'true');
      button.setAttribute('aria-describedby', status.id);
      const manual = document.createElement('input');
      manual.type = 'text';
      manual.readOnly = true;
      manual.value = url.href;
      manual.hidden = true;
      manual.setAttribute('aria-label', `Link to step: ${title}`);
      manual.setAttribute('aria-describedby', status.id);
      controls.append(button, status, manual);
      heading.after(controls);
      let copying = false;
      button.addEventListener('click', async () => {
        if (copying) return;
        copying = true;
        button.setAttribute('aria-disabled', 'true');
        status.textContent = '';
        try {
          if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
          await navigator.clipboard.writeText(url.href);
          manual.hidden = true;
          status.textContent = 'Link copied.';
        } catch {
          manual.hidden = false;
          status.textContent = 'Use your keyboard’s copy command, or touch and hold the selected link to copy.';
          manual.focus({ preventScroll: true });
          manual.select();
          manual.setSelectionRange(0, manual.value.length);
        } finally {
          button.setAttribute('aria-disabled', 'false');
          copying = false;
        }
      });
    }
  }
})();
