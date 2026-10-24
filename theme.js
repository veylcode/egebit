'use strict';

(() => {
  const system = matchMedia('(prefers-color-scheme: dark)');
  let choice = 'system';
  try { choice = localStorage.getItem('egebit-theme') || 'system'; } catch {}
  function apply() {
    document.documentElement.dataset.theme = choice === 'system' ? (system.matches ? 'dark' : 'light') : choice;
    document.documentElement.style.colorScheme = document.documentElement.dataset.theme;
  }
  apply();
  system.addEventListener('change', apply);
  document.addEventListener('DOMContentLoaded', () => {
    const select = document.querySelector('#theme-select');
    select.value = choice;
    select.addEventListener('change', () => {
      choice = select.value;
      try { localStorage.setItem('egebit-theme', choice); } catch {}
      apply();
    });
  });
})();
