'use strict';

(() => {
  const root = document.documentElement;
  const system = matchMedia('(prefers-color-scheme: dark)');
  const palettes = {default:'#3457f0', ocean:'#006b9e', violet:'#7044c0', forest:'#157357', rose:'#ad386b', sunset:'#b44b2b', slate:'#52657a', mint:'#007c78', berry:'#a13c86', amber:'#986000'};
  const fonts = {system:'-apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif', arial:'Arial, sans-serif', georgia:'Georgia, serif', verdana:'Verdana, sans-serif', trebuchet:'"Trebuchet MS", sans-serif'};
  const defaults = {preset:'default', accent:palettes.default, font:'system', size:'15', radius:'16', motion:'on'};
  let choice = 'system', settings = {...defaults};
  try {
    choice = localStorage.getItem('egebit-theme') || 'system';
    const saved = JSON.parse(localStorage.getItem('egebit-appearance') || '{}');
    settings = {...settings, ...saved};
  } catch {}
  if (!['system','light','dark'].includes(choice)) choice = 'system';
  function apply() {
    const dark = choice === 'system' ? system.matches : choice === 'dark';
    root.dataset.theme = dark ? 'dark' : 'light';
    root.style.colorScheme = root.dataset.theme;
    const color = /^#[0-9a-f]{6}$/i.test(settings.accent) ? settings.accent : palettes.default;
    if (settings.preset === 'default' && color === palettes.default) {
      for (const v of ['--accent','--accent-dark','--accent-light','--accent-soft']) root.style.removeProperty(v);
    } else {
      root.style.setProperty('--accent', color);
      root.style.setProperty('--accent-dark', color);
      root.style.setProperty('--accent-light', color);
      root.style.setProperty('--accent-soft', `color-mix(in srgb, ${color} ${dark ? '22%' : '10%'}, ${dark ? '#13161f' : '#fff'})`);
    }
    root.style.fontFamily = fonts[settings.font] || fonts.system;
    root.style.fontSize = (['14','15','17','19'].includes(settings.size) ? settings.size : '15') + 'px';
    const radius = ['8','16','24'].includes(settings.radius) ? Number(settings.radius) : 16;
    root.style.setProperty('--radius', radius+'px'); root.style.setProperty('--radius-sm', Math.max(4,radius-6)+'px'); root.style.setProperty('--radius-lg', (radius+6)+'px');
    root.dataset.motion = settings.motion === 'off' ? 'off' : 'on';
  }
  function save() { try { localStorage.setItem('egebit-appearance',JSON.stringify(settings)); } catch {} }
  apply(); system.addEventListener('change', apply);
  document.addEventListener('DOMContentLoaded', () => {
    const select = document.querySelector('#theme-select'); select.value = choice;
    select.addEventListener('change', () => { choice=select.value; try { localStorage.setItem('egebit-theme',choice); } catch {} apply(); });
    const dialog = document.querySelector('#appearance-dialog');
    const fields = Object.fromEntries(Object.keys(defaults).map(k=>[k,document.querySelector('#appearance-'+k)]));
    function sync() { for (const [key,input] of Object.entries(fields)) input.value=settings[key]; }
    sync();
    for (const [key,input] of Object.entries(fields)) input.addEventListener('input', () => {
      settings[key]=input.value;
      if (key==='preset' && palettes[input.value]) { settings.accent=palettes[input.value]; fields.accent.value=settings.accent; }
      if (key==='accent') { settings.preset='custom'; fields.preset.value='custom'; }
      apply(); save();
    });
    document.querySelector('#appearance-open').addEventListener('click',()=>dialog.showModal());
    document.querySelector('#appearance-close').addEventListener('click',()=>dialog.close());
    document.querySelector('#appearance-done').addEventListener('click',()=>dialog.close());
    document.querySelector('#appearance-reset').addEventListener('click',()=>{settings={...defaults};sync();apply();save();});
  });
})();
