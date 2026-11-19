// Keep each entry independent so changes in another tab do not overwrite a different mission.
(() => {
  const output = document.querySelector('[data-story-progress]');
  const inputs = [...document.querySelectorAll('[data-story-check]')];
  if (!output || !inputs.length) return;
  const prefix = 'gtasixmissions:check:v1:';
  const byKey = new Map(inputs.map((input) => [prefix + input.dataset.storyCheck, input]));
  let persistent = true;

  function updateCount() {
    const count = inputs.filter((input) => input.checked).length;
    const message = persistent ? 'Progress stays in this browser.' : 'Progress is available for this visit only.';
    output.textContent = `${count} of ${inputs.length} entries checked. ${message}`;
  }

  for (const [key, input] of byKey) {
    try {
      input.checked = localStorage.getItem(key) === '1';
    } catch {
      persistent = false;
    }
    input.closest('[data-story-check-control]').hidden = false;
    input.addEventListener('change', () => {
      try {
        if (input.checked) localStorage.setItem(key, '1');
        else localStorage.removeItem(key);
      } catch {
        persistent = false;
      }
      updateCount();
    });
  }

  window.addEventListener('storage', (event) => {
    if (event.storageArea !== window.localStorage) return;
    if (event.key === null) {
      for (const input of inputs) input.checked = false;
    } else {
      const input = byKey.get(event.key);
      if (!input) return;
      input.checked = event.newValue === '1';
    }
    updateCount();
  });
  updateCount();
  output.hidden = false;
})();
