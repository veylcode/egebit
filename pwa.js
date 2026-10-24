'use strict';

let installPrompt = null, updateWorker = null, requestedReload = false;

window.addEventListener('beforeinstallprompt',event=>{
  event.preventDefault(); installPrompt = event;
  document.querySelector('#install-app').textContent = 'Установить приложение';
});

window.addEventListener('appinstalled',()=>{
  installPrompt = null;
  document.querySelector('#install-app').textContent = 'Приложение установлено';
});

document.querySelector('#install-app').addEventListener('click',async()=>{
  if (installPrompt) {
    const prompt = installPrompt; installPrompt = null;
    await prompt.prompt(); await prompt.userChoice;
  } else document.querySelector('#install-dialog').showModal();
});

document.querySelector('#close-install').addEventListener('click',()=>document.querySelector('#install-dialog').close());
document.querySelector('#update-app').addEventListener('click',()=>{
  if (!updateWorker) return;
  if (document.querySelector('#condition')?.value || selectedFiles.length || document.querySelector('form[data-dirty="true"]') || document.querySelector('#study-save-status')?.textContent.includes('несохранённые')) { toast('Сначала сохрани или заверши текущую форму. Обновление доступно позже.', true); return; }
  if (!confirm('Обновить приложение сейчас?')) return;
  requestedReload = true; updateWorker.postMessage({type:'ACTIVATE_UPDATE'});
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange',()=>{ if (requestedReload) location.reload(); });
  navigator.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'}).then(registration=>{
    const offer = ()=>{
      if (registration.waiting && navigator.serviceWorker.controller) {
        updateWorker = registration.waiting;
        document.querySelector('#update-app').hidden = false;
      }
    };
    offer();
    registration.addEventListener('updatefound',()=>{
      const worker = registration.installing;
      worker?.addEventListener('statechange',()=>{ if (worker.state==='installed') offer(); });
    });
    return navigator.serviceWorker.ready;
  }).then(()=>{
    document.querySelector('#install-status').textContent = 'Egebit готов. Выбери способ установки для своего браузера.';
  }).catch(()=>{
    document.querySelector('#install-status').textContent = 'Открой сайт в обычном браузере, если установка здесь недоступна.';
  });
} else {
  document.querySelector('#install-status').textContent = 'Установка зависит от браузера. Открой сайт в Safari, Chrome или Edge.';
}

function networkStatus() {
  document.querySelector('#offline-notice').hidden = navigator.onLine;
}
window.addEventListener('offline',networkStatus);
window.addEventListener('online',networkStatus);
networkStatus();
