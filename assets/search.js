(() => {
  const fillerWords = new Set('a an the is are how can do does i my of on to for in and me what where when gta vi 6 grand theft auto'.split(' '));
  let indexRequest;

  function normalize(value) {
    return value.normalize('NFKD')
      .toLowerCase()
      .replace(/\p{M}/gu, '')
      .replace(/['’‘ʻ]/g, '')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim();
  }

  function words(value) {
    return value.split(' ').filter((word) => word && !fillerWords.has(word));
  }

  function prepareEntry(entry) {
    const strings = (list) => (Array.isArray(list) ? list.filter((item) => typeof item === 'string') : []);
    const own = [entry.q, ...strings(entry.aliases)].map(normalize).filter(Boolean);
    // A step inside a mission also answers "mission name + step" in either order.
    const parents = typeof entry.parent === 'string' ? [entry.parent, ...strings(entry.parentAliases)].map(normalize).filter(Boolean) : [];
    const combined = parents.flatMap((parent) => own.flatMap((phrase) => [`${parent} ${phrase}`, `${phrase} ${parent}`]));
    const phrases = [...own, ...combined];
    const terms = new Set(phrases.flatMap(words));
    const ownTerms = new Set(own.flatMap(words));
    const parentTerms = new Set(parents.flatMap(words));
    const answerTerms = new Set(words(normalize(entry.a)));
    return { ...entry, phrases, terms, ownTerms, parentTerms, answerTerms };
  }

  function loadIndex() {
    if (!indexRequest) {
      indexRequest = fetch('/search.json').then((response) => {
        if (!response.ok) throw new Error('Search index unavailable');
        return response.json();
      }).then((entries) => {
        if (!Array.isArray(entries)) throw new Error('Invalid search index');
        return entries.filter((entry) => entry && typeof entry.q === 'string' && typeof entry.a === 'string'
          && typeof entry.url === 'string' && /^\/(?![/\\])/.test(entry.url)).map(prepareEntry);
      }).catch((error) => {
        indexRequest = undefined;
        throw error;
      });
    }
    return indexRequest;
  }

  function score(entry, phrase, queryWords) {
    // A query that only names the mission should open the mission page first, then its steps.
    if (entry.parentTerms.size && queryWords.length && queryWords.every((word) => entry.parentTerms.has(word) && !entry.ownTerms.has(word))) return 300;
    const parentHits = queryWords.filter((word) => entry.parentTerms.has(word) && !entry.ownTerms.has(word)).length;
    const objectiveBonus = (entry.kind === 'objective' ? 30 : 0) + 5 * parentHits;
    if (entry.phrases.includes(phrase)) return 1000 + objectiveBonus;
    const compact = queryWords.join(' ');
    if (compact && entry.phrases.some((candidate) => words(candidate).join(' ') === compact)) return 900 + objectiveBonus;
    if (entry.phrases.some((candidate) => ` ${candidate} `.includes(` ${phrase} `))) return 800 + objectiveBonus;
    if (!queryWords.length) return 0;

    const titleMatches = queryWords.filter((word) => entry.terms.has(word)).length;
    const answerMatches = queryWords.filter((word) => !entry.terms.has(word) && entry.answerTerms.has(word)).length;
    const matched = titleMatches + answerMatches;
    if (matched === queryWords.length) return 400 + 10 * titleMatches + objectiveBonus;
    if (matched < 2 || matched / queryWords.length < 2 / 3) return 0;
    return 100 + 10 * titleMatches + answerMatches + objectiveBonus;
  }

  function attachSearch(root) {
    const input = root.querySelector('input[type=search]');
    const status = root.querySelector('[data-search-status]');
    const results = root.querySelector('[data-search-results]');
    if (!input || !status || !results) return;

    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'search-retry';
    retry.textContent = 'Retry search';
    retry.hidden = true;
    status.after(retry);

    let revision = 0;
    async function showResults() {
      const currentRevision = ++revision;
      const phrase = normalize(input.value);
      status.textContent = '';
      retry.hidden = true;
      results.hidden = true;
      results.replaceChildren();
      if (phrase.length < 2) return;

      status.textContent = 'Searching…';
      try {
        const entries = await loadIndex();
        if (currentRevision !== revision) return;
        const queryWords = [...new Set(words(phrase))];
        const matches = entries.map((entry) => ({ entry, points: score(entry, phrase, queryWords) }))
          .filter((match) => match.points > 0)
          .sort((left, right) => right.points - left.points)
          .slice(0, 6);
        for (const { entry } of matches) {
          const item = document.createElement('li');
          const link = document.createElement('a');
          link.href = entry.url;
          link.textContent = entry.q;
          item.append(link);
          const context = [typeof entry.parent === 'string' ? entry.parent : '', typeof entry.label === 'string' ? entry.label : ''].filter(Boolean).join(' · ');
          if (context) {
            const meta = document.createElement('span');
            meta.className = 'result-meta';
            meta.textContent = context;
            item.append(meta);
          }
          if (entry.a) {
            const answer = document.createElement('p');
            answer.textContent = entry.a;
            item.append(answer);
          }
          results.append(item);
        }
        results.hidden = matches.length === 0;
        status.textContent = matches.length ? `${matches.length} ${matches.length === 1 ? 'result' : 'results'} shown.`
          : 'No matching answer. Try the mission name, a few words from the objective, or one of the guide links.';
      } catch {
        if (currentRevision !== revision) return;
        status.textContent = 'Search is temporarily unavailable. You can still browse the guide links.';
        retry.hidden = false;
      }
    }

    input.addEventListener('focus', () => {
      if (!input.value.trim()) loadIndex().catch(() => {});
    });
    input.addEventListener('input', showResults);
    retry.addEventListener('click', () => {
      input.focus();
      showResults();
    });
    root.addEventListener('submit', (event) => {
      event.preventDefault();
      results.querySelector('a')?.focus();
    });
    root.hidden = false;
    if (input.value) showResults();
  }

  function revealLinkedAnswer() {
    if (!location.hash.startsWith('#faq-')) return;
    const target = document.getElementById(location.hash.slice(1));
    const answer = target?.closest('details');
    if (answer && !answer.open) {
      answer.open = true;
      target.scrollIntoView();
    }
  }

  // Outside a browser (tests), expose the ranking functions and stop.
  if (typeof document === 'undefined') { globalThis.__siteSearch = { normalize, words, prepareEntry, score }; return; }
  document.querySelectorAll('[data-site-search]').forEach(attachSearch);
  revealLinkedAnswer();
  window.addEventListener('hashchange', revealLinkedAnswer);
})();
