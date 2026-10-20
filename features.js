'use strict';

let selectedFiles = [], fileThumbUrls = [];

function addAttachments(files) {
  const combined = [...selectedFiles, ...files];
  if (combined.length > 5) return toast('Можно прикрепить до 5 файлов.', true);
  if (combined.some((file) => file.size > 4 * 1024 * 1024)) return toast('Каждый файл — до 4 МБ.', true);
  if (combined.reduce((sum, file) => sum + file.size, 0) > 16 * 1024 * 1024) return toast('Все вложения вместе — до 16 МБ.', true);
  selectedFiles = combined; requestId = null; filePreview();
}

function filePreview() {
  fileThumbUrls.forEach((url) => URL.revokeObjectURL(url)); fileThumbUrls = [];
  $('#file-preview').hidden = !selectedFiles.length;
  $('#file-preview').innerHTML = selectedFiles.map((file, index) => {
    const url = file.type.startsWith('image/') ? URL.createObjectURL(file) : null;
    if (url) fileThumbUrls.push(url);
    return `<div class="attachment-item">${url ? `<img src="${esc(url)}" alt="Прикреплённое условие">` : '<span class="upload-icon">▤</span>'}<span><strong>${esc(file.name)}</strong><small>${(file.size / 1024).toFixed(1)} КБ</small></span><button class="icon-button" data-remove-attachment="${index}" aria-label="Убрать ${esc(file.name)}">×</button></div>`;
  }).join('');
}

function clearAttachments() { selectedFiles = []; $('#attachment').value = ''; filePreview(); }

function renderService() {
  const service = me?.service;
  if (!service) return;
  const labels = {ready:'Доступен',low:'Бюджет заканчивается',busy:'Часть бюджета занята запросами',exhausted:'Платные запросы остановлены',paused:'Решения приостановлены'};
  $('#service-status').textContent = labels[service.status] || 'Загружается';
  $('#service-card').dataset.state = service.status;
  $('#service-available').textContent = `${Number(service.available).toFixed(2)} ₽`;
  $('#service-total').textContent = `из общего предела ${service.limit} ₽ за 7 суток`;
  $('#service-info').textContent = `Учтено ${Number(service.used).toFixed(2)} ₽ · в резерве запросов ${Number(service.reserved).toFixed(2)} ₽. До ${service.per_task} ₽ на задачу.`;
  $('#service-release').textContent = service.next_release ? `Старые расходы начнут освобождаться ${date(service.next_release)}.` : 'Общий бюджет расходуется только при обращении к модели.';
  $('#service-period').textContent = service.temporary_until ? `С ${date(Date.parse(service.temporary_until) / 1000)} — до ${service.after_temporary} ₽ на задачу.` : '';
}

function draftTask(task, index) {
  return `<article class="draft-task"><div class="result-title"><h3 class="preview-caption">Задача ${index + 1}</h3><button type="button" class="text-button" data-remove-preview>Удалить</button></div><div class="draft-fields"><label>Номер ЕГЭ<select name="number">${Array.from({length:27},(_,i)=>`<option value="${i+1}" ${task.number===i+1?'selected':''}>${i+1}</option>`).join('')}</select></label><label>ID источника, если есть<input name="source_id" value="${esc(task.source_id || '')}" inputmode="numeric" pattern="[0-9]{0,9}" maxlength="9"></label></div><label>Проверь и исправь условие<textarea name="condition" required maxlength="12000">${esc(task.text || '')}</textarea></label></article>`;
}

function previewForm(job) {
  return `<div class="notice">Найдено задач: <strong id="preview-task-count">${job.preview.length}</strong>. Проверь числа, степени и основания. Решение начнётся после подтверждения. Лишние задачи можно удалить.</div><form class="preview-form" data-job="${job.id}"><div id="preview-tasks">${job.preview.map(draftTask).join('')}</div><div class="detail-actions"><button class="button secondary" type="button" data-add-preview>＋ Добавить пропущенную задачу</button><label>Формат результата<select name="mode"><option value="concise" ${job.mode==='concise'?'selected':''}>Код и ответ</option><option value="explained" ${job.mode==='explained'?'selected':''}>С объяснением</option></select></label></div><p>После подтверждения лимит учтёт оставленные задачи. Расход распознавания сохраняется.</p><button class="button primary" type="submit">Начать решение ↗</button></form>`;
}

function resultControls(job, part) {
  const collection = job.saved?.[part.part], report = job.reports?.[part.part];
  return `<div class="result-tools"><details><summary>${collection ? `★ ${esc(collection)}` : '☆ Сохранить в подборку'}</summary><form class="favorite-form" data-job="${job.id}" data-part="${part.part}"><label>Название подборки<input name="collection" value="${esc(collection || 'Избранное')}" maxlength="60" required list="collection-names"></label><button class="button secondary">Сохранить</button>${collection ? `<button class="text-button" type="button" data-unsave="${part.part}" data-id="${job.id}">Убрать из избранного</button>`:''}</form></details><details><summary>${report ? 'Жалоба отправлена' : 'Ответ неверный'}</summary>${report ? `<p>Статус: ${esc({open:'ожидает проверки',reviewed:'проверена',fixed:'исправлена'}[report] || report)}.</p>` : `<form class="report-form" data-job="${job.id}" data-part="${part.part}"><label>Что именно неверно?<textarea name="text" required minlength="5" maxlength="2000" placeholder="Например: неверно распознано основание или код не учитывает ограничение"></textarea></label><button class="button secondary">Отправить владельцу</button></form>`}</details></div>`;
}

async function loadLibrary() {
  if (!token) return;
  const identityToken = token, data = await api('/api/library');
  if (identityToken !== token) return;
  const selection = $('#collection-filter').value;
  const collections = [...new Set(data.items.map((item)=>item.collection))].sort();
  $('#collection-filter').innerHTML = '<option value="">Все подборки</option>' + collections.map((name)=>`<option value="${esc(name)}">${esc(name)}</option>`).join('');
  if (collections.includes(selection)) $('#collection-filter').value = selection;
  $('#collection-names').innerHTML = collections.map((name)=>`<option value="${esc(name)}"></option>`).join('');
  const query = $('#library-search').value.trim().toLowerCase(), filter = $('#collection-filter').value;
  const items = data.items.filter((item)=>(!filter || filter===item.collection) && (!query || `${item.text} ${item.source_id} ${item.number}`.toLowerCase().includes(query)));
  $('#library-items').innerHTML = items.map((item)=>`<article class="panel saved-card"><span class="tag">${esc(item.collection)}</span><h2>Задача #${esc(item.source_id || item.part+1)} · ЕГЭ ${item.number}</h2><p class="preserve">${esc(item.text)}</p>${item.result?.status==='solution'?`<details><summary>Код и ответ</summary><pre><code>${esc(item.result.code)}</code></pre><strong>${esc(item.result.answer)}</strong></details>`:'<p>Решение обновляется.</p>'}<button class="text-button" data-job="${item.job}">Открыть заявку #${item.job} ↗</button></article>`).join('') || '<div class="empty-state">Сохрани готовое решение в подборку кнопкой под ответом.</div>';
}

async function loadReports() {
  if (!me?.admin) return;
  const identityToken = token, data = await api('/api/admin/reports');
  if (identityToken !== token || !me?.admin || !$('#reports-list')) return;
  $('#reports-list').innerHTML = data.reports.map((report)=>`<article class="report-card"><h3>Заявка #${report.job} · задача ${report.part+1} · ${esc(report.name)}</h3><p class="preserve">${esc(report.text)}</p><details><summary>Условие, код и ответ на момент жалобы</summary><p class="preserve">${esc(report.snapshot.text)}</p><pre><code>${esc(report.snapshot.result.code)}</code></pre><p>Ответ: ${esc(report.snapshot.result.answer)}</p></details><form class="review-report-form" data-report="${report.id}"><label>Статус<select name="state">${[['open','Ожидает проверки'],['reviewed','Проверена'],['fixed','Исправлена']].map(([value,label])=>`<option value="${value}" ${report.state===value?'selected':''}>${label}</option>`).join('')}</select></label><button class="button secondary">Сохранить статус</button></form></article>`).join('') || '<p>Жалоб пока нет.</p>';
}

function markEdited(target) {
  const form = target.closest('.refine-form,.preview-form,.favorite-form,.report-form');
  if (form) form.dataset.dirty = 'true';
}

document.addEventListener('click', async (event)=>{
  const button = event.target.closest('button');
  if (!button) return;
  try {
    if (button.dataset.removeAttachment !== undefined) {
      selectedFiles.splice(Number(button.dataset.removeAttachment),1); requestId=null; filePreview();
    } else if (button.hasAttribute('data-remove-preview')) {
      const form=button.closest('.preview-form'); button.closest('.draft-task').remove(); form.dataset.dirty='true'; renumberPreview();
    } else if (button.hasAttribute('data-add-preview')) {
      $('#preview-tasks').insertAdjacentHTML('beforeend',draftTask({number:selected,text:''},document.querySelectorAll('.draft-task').length)); markEdited(button); renumberPreview();
    } else if (button.dataset.unsave !== undefined) {
      await api(`/api/jobs/${button.dataset.id}/parts/${button.dataset.unsave}/favorite`,{method:'DELETE'}); $('#detail-content').dataset.signature=''; await renderDetail();
    }
  } catch (error) { toast(error.message,true); }
});

function renumberPreview() { const tasks=[...document.querySelectorAll('.draft-task')]; tasks.forEach((row,i)=>row.querySelector('.preview-caption').textContent=`Задача ${i+1}`); $('#preview-task-count').textContent=tasks.length; }

document.addEventListener('submit', async(event)=>{
  const form=event.target;
  if (!form.matches('.preview-form,.favorite-form,.report-form,.review-report-form')) return;
  event.preventDefault();
  const button=form.querySelector('button[type="submit"],button:not([type])');
  if (button?.disabled) return;
  if (button) button.disabled=true;
  try {
    const fields=new FormData(form);
    if (form.matches('.preview-form')) {
      const tasks=[...form.querySelectorAll('.draft-task')].map((row)=>({number:Number(row.querySelector('[name="number"]').value),source_id:row.querySelector('[name="source_id"]').value.trim(),text:row.querySelector('[name="condition"]').value.trim()}));
      await api(`/api/jobs/${form.dataset.job}/confirm`,{method:'POST',body:{tasks,mode:fields.get('mode')}});
      toast('Подтверждено. Решения появятся в этой заявке.');
    } else if (form.matches('.favorite-form')) {
      await api(`/api/jobs/${form.dataset.job}/parts/${form.dataset.part}/favorite`,{method:'POST',body:{collection:fields.get('collection')}});
      toast('Решение сохранено в подборку.');
    } else if (form.matches('.report-form')) {
      await api(`/api/jobs/${form.dataset.job}/parts/${form.dataset.part}/report`,{method:'POST',body:{text:fields.get('text')}});
      toast('Жалоба отправлена в админку владельца.');
    } else {
      await api(`/api/admin/reports/${form.dataset.report}`,{method:'POST',body:{state:fields.get('state')}}); await loadReports(); return;
    }
    form.dataset.dirty='false'; $('#detail-content').dataset.signature=''; await refresh(true);
  } catch(error) { toast(error.message,true); }
  finally { if (button?.isConnected) button.disabled=false; }
});

document.addEventListener('input',(event)=>markEdited(event.target));
document.addEventListener('change',(event)=>markEdited(event.target));
