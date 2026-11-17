// PS5 unlock picker. The reader chooses their PlayStation Store region; this shows that listed time on the reader's own clock.
// It never asks for or guesses location. Without JavaScript the table on the page has every time and source.
(() => {
  const VALID = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

  // Returns the sentence to show, or null when the listed time is not a valid timestamp.
  function describe(region, time, now, timeZone) {
    if (!VALID.test(time || '') || Number.isNaN(Date.parse(time))) return null;
    const when = new Date(time);
    if (when.toISOString().replace('.000Z', 'Z') !== time) return null; // refuses dates such as February 30 instead of rolling them over
    const options = { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'long' };
    if (timeZone) options.timeZone = timeZone;
    const format = new Intl.DateTimeFormat('en-US', options);
    const zone = format.resolvedOptions().timeZone;
    const passed = now >= when ? ' That time has already passed.' : '';
    return `The ${region} PlayStation Store lists the PS5 unlock as ${format.format(when)} on your clock (time zone: ${zone}).${passed}`;
  }

  if (typeof document === 'undefined') { globalThis.__unlock = { describe }; return; }

  const form = document.querySelector('form[data-unlock-check]');
  const select = form?.querySelector('select[name=region]');
  const result = form?.querySelector('[data-unlock-result]');
  if (!form || !select || !result) return;

  function show() {
    result.replaceChildren();
    const option = select.selectedOptions[0];
    if (!select.value || !option) return;
    const text = option && describe(option.textContent, option.dataset.time, new Date());
    if (!text) {
      result.textContent = 'That region has no verified time here. Use the table below and your console store.';
      return;
    }
    result.append(text, ' ');
    const link = document.createElement('a');
    link.href = option.dataset.source;
    link.rel = 'noopener';
    link.textContent = 'Store listing';
    result.append(link, '.');
  }

  select.addEventListener('change', show);
  form.addEventListener('submit', (event) => { event.preventDefault(); show(); });
  form.hidden = false;
  if (select.value) show();
})();
