(() => {
  const form = document.querySelector('form[data-storage-check]');
  const available = form?.querySelector('input[name=available]');
  const required = form?.querySelector('input[name=required]');
  const result = form?.querySelector('[data-storage-result]');
  if (!form || !available || !required || !result) return;

  const format = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

  function calculate() {
    if (!available.validity.valid || !required.validity.valid) {
      result.textContent = '';
      return;
    }

    const difference = Math.max(0, required.valueAsNumber - available.valueAsNumber);
    if (difference === 0) {
      result.textContent = 'You have enough free space for the requirement you entered.';
    } else if (difference < 0.01) {
      result.textContent = 'You need to free less than 0.01 GB more.';
    } else {
      result.textContent = `You need to free ${format.format(difference)} GB more.`;
    }
  }

  form.addEventListener('input', calculate);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    calculate();
  });
  form.hidden = false;
  calculate();
})();
