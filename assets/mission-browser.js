// The complete chapter list and all its links remain usable without this enhancement.
(() => {
  const normalize = (value) => value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/['’]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  for (const root of document.querySelectorAll('[data-mission-browser]')) {
    const form = root.querySelector('[data-catalogue-search]');
    const input = form?.querySelector('input[type="search"]');
    const spoilers = form?.querySelector('[data-include-spoilers]');
    const results = form?.querySelector('[data-catalogue-matches]');
    const status = form?.querySelector('[data-catalogue-status]');
    if (!form || !input || !spoilers || !results || !status) continue;
    const chapters = [...root.querySelectorAll('[data-story-chapter]')];
    const records = chapters.flatMap((chapter) => [...chapter.querySelectorAll('[data-mission-name]')].map((row) => ({ chapter, row, name: normalize(row.dataset.missionName) })));
    const show = () => {
      const terms = normalize(input.value).split(' ').filter(Boolean);
      results.replaceChildren();
      results.hidden = true;
      status.textContent = '';
      if (!terms.length) return;
      const matches = records.filter(({ chapter, row, name }) => (row.dataset.guideKind === 'local' || chapter.dataset.spoiler !== 'true' || chapter.open || spoilers.checked) && terms.every((term) => name.includes(term)));
      for (const { row } of matches) {
        const copy = row.cloneNode(true);
        // Progress controls belong to the full checklist, not duplicate search-result rows.
        copy.querySelector('[data-story-check-control]')?.remove();
        results.append(copy);
      }
      const limited = !spoilers.checked && chapters.some((chapter) => chapter.dataset.spoiler === 'true' && !chapter.open);
      status.textContent = `${matches.length ? `${matches.length} matching ${matches.length === 1 ? 'entry' : 'entries'}.` : 'No matching entry among our guides or the chapters you have revealed.'}${limited ? ' Other names in closed chapters are not searched. Use the spoiler option to include them.' : ''}`;
      results.hidden = matches.length === 0;
    };
    input.addEventListener('input', show);
    spoilers.addEventListener('change', show);
    for (const chapter of chapters) chapter.addEventListener('toggle', show);
    const revealLinkedChapter = () => {
      let id;
      try { id = decodeURIComponent(location.hash.slice(1)); } catch { return; }
      const target = document.getElementById(id);
      if (target && chapters.includes(target)) target.open = true;
    };
    window.addEventListener('hashchange', revealLinkedChapter);
    form.addEventListener('submit', (event) => { event.preventDefault(); results.querySelector('a')?.focus(); });
    form.hidden = false;
    const requested = new URL(location.href).searchParams.get('mission');
    if (requested) input.value = requested.slice(0, 200);
    revealLinkedChapter();
    show();
  }
})();
