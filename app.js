'use strict';

const API = 'https://egebit-5-83-140-108.sslip.io';
const $ = (selector) => document.querySelector(selector);
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[char]));
const names = {solve: 'Новая задача', history: 'Мои заявки', templates: 'Шаблоны', help: 'Как пользоваться', admin: 'Управление'};
const states = {queued: 'В очереди', retry: 'Ожидание повтора', running: 'Решаем', delivering: 'Отправляем ответ', done: 'Готово', needs_details: 'Нужно уточнение', failed: 'Ошибка', cancelled: 'Отменено', delivery_failed: 'Ошибка доставки'};
let token = sessionStorage.getItem('egebit-session') || localStorage.getItem('egebit-account') || localStorage.getItem('egebit-guest') || '';
let me = null, jobs = [], selected = 14, page = 'solve', detailId = null, pollBusy = false, requestId = null, imageUrl = null, submitting = false;

function toast(text, error = false) {
  $('#toast').textContent = text;
  $('#toast').className = error ? 'error' : '';
  $('#toast').hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { $('#toast').hidden = true; }, 6500);
}

function connection(text, ok = false) {
  $('#connection').textContent = text;
  $('#connection').classList.toggle('online', ok);
}

async function api(path, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.method ? 120000 : 15000);
  const requestToken = token;
  const headers = {...(requestToken ? {Authorization: `Bearer ${requestToken}`} : {}), ...options.headers};
  if (options.body && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(options.body);
  }
  try {
    const response = await fetch(API + path, {...options, headers, signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer'});
    const data = await response.json();
    if (!response.ok) {
      if (token === requestToken && ((response.status === 401 && path !== '/api/login' && !path.startsWith('/api/account/')) || (response.status === 403 && path === '/api/me'))) signedOut();
      throw new Error(data.error || `Ошибка ${response.status}`);
    }
    connection('На связи', true);
    return data;
  } catch (error) {
    if (error instanceof TypeError || error.name === 'AbortError') {
      connection('Нет связи с сервером');
      throw new Error('Сервер не ответил. Проверь историю перед повторной отправкой.');
    }
    throw error;
  } finally { clearTimeout(timeout); }
}

function date(value) {
  return value ? new Intl.DateTimeFormat('ru-RU', {day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow'}).format(new Date(value * 1000)) + ' МСК' : '—';
}

function navigate(next) {
  page = Object.hasOwn(names, next) && (next !== 'admin' || me?.admin) ? next : 'solve';
  document.querySelectorAll('.page').forEach((element) => { element.hidden = element.id !== `page-${page}`; });
  document.querySelectorAll('[data-page]').forEach((element) => element.classList.toggle('active', element.dataset.page === page));
  $('#page-name').textContent = names[page];
  if (location.hash !== `#${page}`) history.replaceState(null, '', `#${page}`);
  renderJobs();
  if (page === 'admin') return loadAdmin().catch((error) => toast(error.message, true));
}

function signedOut() {
  if (token === localStorage.getItem('egebit-account')) localStorage.removeItem('egebit-account');
  if (token === localStorage.getItem('egebit-guest')) localStorage.removeItem('egebit-guest');
  token = ''; me = null; jobs = [];
  sessionStorage.removeItem('egebit-session');
  $('#login-card').hidden = false;
  $('#guest-retry').hidden = false;
  $('#logout').hidden = true;
  $('#account-logout').hidden = true;
  $('#account-actions').hidden = false;
  $('#submit').disabled = true;
  $('#user-name').textContent = 'Подключение';
  $('#user-subtitle').textContent = 'Гостевой доступ без входа';
  $('#avatar').textContent = '?';
  $('#quota-left').textContent = '—';
  $('#quota-percent').textContent = 'Загрузка лимита';
  $('#quota-reset').textContent = '5 часов';
  $('#quota-bar').style.width = '0%';
  $('#admin-content').replaceChildren();
  $('#detail-content').replaceChildren();
  $('#job-dialog').close(); detailId = null;
  document.querySelectorAll('.admin-only').forEach((element) => { element.hidden = true; });
  navigate('solve'); renderGrid(); renderTemplates();
}

function renderMe() {
  $('#login-card').hidden = !me.guest;
  $('#account-strip').hidden = me.telegram;
  $('#account-actions').hidden = !me.guest;
  $('#account-logout').hidden = me.guest;
  $('#account-label').textContent = me.guest ? 'Гостевой режим' : me.name;
  $('#logout').hidden = me.guest;
  $('#submit').disabled = submitting;
  $('#user-name').textContent = me.name;
  $('#user-subtitle').textContent = me.guest ? 'Без входа · этот браузер' : me.admin ? 'Владелец · кабинет' : me.telegram ? 'Участник группы' : 'Аккаунт сайта';
  $('#submission-note').textContent = me.telegram ? 'Условие и ответы появятся в группе. На сайте и в боте — общая очередь и лимит.' : me.guest ? 'Условия и ответы доступны в этом браузере. Лимит — 15 задач на устройство за 5 часов.' : 'Условия и ответы сохранятся в аккаунте. Лимит — 15 задач на устройство за 5 часов.';
  $('#history-note').textContent = me.telegram ? 'Очередь, код и ответы из сайта и Telegram.' : me.guest ? 'Заявки этого браузера.' : 'Заявки твоего аккаунта.';
  $('#avatar').textContent = me.name.slice(0, 1).toUpperCase();
  $('#quota-left').textContent = me.quota.left;
  $('#quota-total').textContent = `из ${me.quota.limit} задач осталось`;
  $('#quota-percent').textContent = `${me.quota.percent}% доступно`;
  $('#quota-reset').textContent = me.quota.reset ? `Обновится ${date(me.quota.reset)}` : 'Окно начнётся с первой задачи';
  $('#quota-bar').style.width = `${me.quota.percent}%`;
  $('#submit').disabled = submitting || me.quota.left < 1;
  document.querySelectorAll('.admin-only').forEach((element) => { element.hidden = !me.admin; });
  if (me.paused) connection('Новые решения приостановлены');
  renderGrid(); renderTemplates();
}

function renderGrid() {
  const templates = new Set((me?.templates || []).map((item) => item.number));
  $('#task-grid').innerHTML = Array.from({length: 27}, (_, index) => {
    const number = index + 1;
    return `<button class="task-button ${number === selected ? 'selected' : ''} ${templates.has(number) ? 'has-template' : ''}" data-number="${number}" aria-pressed="${number === selected}" title="Задание №${number}${templates.has(number) ? ' · есть шаблон' : ''}"><span>${number}</span>${templates.has(number) ? '<i aria-label="Есть шаблон"></i>' : ''}</button>`;
  }).join('');
  $('#selected-label').textContent = `№${selected}`;
}

function renderTemplates() {
  if (!me) {
    $('#template-grid').innerHTML = '<div class="empty-state">Библиотека загружается после подключения к серверу.</div>';
    return;
  }
  $('#template-grid').innerHTML = Array.from({length: 27}, (_, index) => {
    const number = index + 1, item = me.templates.find((template) => template.number === number);
    return `<button class="template-card ${item ? 'available' : ''}" data-template="${number}"><div><span class="template-number">${number}</span><span class="tag">${item ? 'Есть шаблон' : 'Базовый подход'}</span></div><h3>Задание №${number}</h3><p>${item ? `${esc(item.filename)}<br>${item.examples || 1} примеров · ${date(item.updated)}` : 'Индивидуальное решение условия'}</p><span class="text-button">${me.admin ? 'Открыть шаблон' : 'Решить задачу'} ↗</span></button>`;
  }).join('');
}

function errorMessage(code) {
  const messages = {
    ai_task_budget: 'Не хватило доступного API-бюджета для продолжения этой задачи. Заявка и готовые части сохранены. Повтор не списывает лимит задач заново.',
    ai_budget: 'Сейчас недостаточно общего API-бюджета сервиса. Заявка сохранена; администратору нужно проверить расходы.',
    ai_rate_limit: 'Сервис модели временно ограничил частоту запросов. Заявка сохранена.',
    ai_network: 'Не удалось связаться с моделью. Можно повторить сохранённую заявку.',
    ai_server: 'Сервис модели временно недоступен. Можно повторить заявку позже.',
    ai_invalid_result: 'Модель не подготовила корректное решение после проверок. Непроверенный код не опубликован.',
    ai_code_style: 'Не удалось подготовить код в нужном формате. Можно повторить заявку.',
    ai_free_checkin: 'Эта старая ошибка относится к отключённому APInex. Теперь доступен Яндекс; можно повторить заявку.',
  };
  return messages[code] || 'Обработка не завершилась. Заявка сохранена; можно повторить её без нового списания лимита задач.';
}

function taskWord(number) { return number % 10 === 1 && number % 100 !== 11 ? 'задача' : number % 10 >= 2 && number % 10 <= 4 && !(number % 100 >= 12 && number % 100 <= 14) ? 'задачи' : 'задач'; }

function jobCard(job) {
  const active = ['queued', 'retry', 'running', 'delivering'].includes(job.state);
  return `<button class="job-row" data-job="${job.id}"><span class="job-icon ${job.state}">${job.state === 'done' ? '✓' : active ? '◷' : '·'}</span><span class="job-main"><strong>Заявка #${job.id} <span>· №${job.number}</span></strong><small>${esc((job.kind && job.kind !== 'task' ? 'Загрузка шаблона' : job.text || 'Вложение с условием').replace(/\s+/g, ' ').slice(0, 140))}${job.count > 1 ? ` · ${job.count} ${taskWord(job.count)}` : ''}</small></span><span class="job-date">${date(job.created)}</span><span class="status ${job.state}">${esc(states[job.state] || job.state)}${job.position ? ` · ${job.position}` : ''}</span><span class="row-arrow">↗</span></button>`;
}

function renderJobs() {
  $('#jobs-count').textContent = me ? jobs.length : '—';
  $('#recent-count').textContent = me && jobs.length ? String(jobs.length) : '';
  $('#recent-jobs').innerHTML = jobs.slice(0, 3).map(jobCard).join('') || `<div class="empty-state">${me ? 'Пока пусто. Отправь первую задачу — она появится здесь.' : 'Здесь появятся отправленные задачи.'}</div>`;
  const query = $('#job-search').value.trim().toLowerCase(), filter = $('#job-filter').value;
  const list = jobs.filter((job) => (!query || `${job.id} ${job.text}`.toLowerCase().includes(query)) && (!filter || (filter === 'active' ? ['queued', 'retry', 'running', 'delivering'].includes(job.state) : job.state === filter)));
  $('#history-jobs').innerHTML = list.map(jobCard).join('') || '<div class="empty-state">Заявок с такими условиями нет.</div>';
}

function filePreview() {
  const file = $('#attachment').files[0];
  if (imageUrl) { URL.revokeObjectURL(imageUrl); imageUrl = null; }
  $('#file-preview').hidden = !file;
  if (!file) return;
  if (file.size > 4 * 1024 * 1024) { $('#attachment').value = ''; toast('Максимальный размер файла — 4 МБ.', true); filePreview(); return; }
  const preview = file.type.startsWith('image/');
  if (preview) imageUrl = URL.createObjectURL(file);
  $('#file-preview').innerHTML = `${preview ? `<img src="${esc(imageUrl)}" alt="Прикреплённое условие">` : '<span class="upload-icon">▤</span>'}<span><strong>${esc(file.name)}</strong><small>${(file.size / 1024).toFixed(1)} КБ</small></span><button id="remove-file" class="icon-button" aria-label="Убрать файл">×</button>`;
}

async function submit() {
  if (submitting) return;
  if (!me) return toast('Дождись подключения гостевого доступа или нажми повтор подключения.', true);
  const text = $('#condition').value.trim(), file = $('#attachment').files[0];
  if (!text && !file) return toast('Добавь условие задачи.', true);
  const body = new FormData(); body.set('text', text); body.set('number', selected);
  if (file) body.set('file', file);
  requestId ||= crypto.randomUUID();
  submitting = true;
  $('#submit').disabled = true; $('#submit').textContent = 'Принимаем…';
  try {
    const result = await api('/api/jobs', {method: 'POST', body, headers: {'X-Request-ID': requestId}});
    requestId = null; $('#condition').value = ''; $('#attachment').value = ''; filePreview();
    $('#char-count').textContent = '0 / 12 000';
    toast(`Заявка #${result.id} принята. Статус обновится автоматически.`);
    await refresh(); await openJob(result.id);
  } catch (error) { toast(error.message, true); }
  finally { submitting = false; $('#submit').innerHTML = 'Отправить задачу <span>↗</span>'; $('#submit').disabled = !me || me.quota.left < 1; }
}

function download(name, content) {
  const url = URL.createObjectURL(new Blob([content], {type: 'text/plain;charset=utf-8'}));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function openJob(id) {
  detailId = Number(id);
  $('#detail-title').textContent = `#${id}`;
  $('#detail-content').dataset.signature = '';
  $('#detail-content').innerHTML = '<div class="empty-state">Загружаем заявку…</div>';
  if (!$('#job-dialog').open) $('#job-dialog').showModal();
  await renderDetail();
}

async function renderDetail() {
  if (!detailId || !token) return;
  const detailToken = token;
  const id = detailId, job = await api(`/api/jobs/${id}`);
  if (token !== detailToken) return;
  if (detailId !== id) return;
  const signature = JSON.stringify(job);
  if ($('#detail-content').dataset.signature === signature) return;
  // Preserve an unfinished clarification while the polling refreshes the main queue.
  if ($('#detail-content .refine-form[data-dirty="true"]')) return;
  const parts = job.parts || [];
  $('#detail-content').innerHTML = `<div class="detail-meta"><span class="status ${job.state}">${esc(states[job.state] || job.state)}</span><span>${date(job.created)} · №${job.number} · ${job.count || '?'} ${taskWord(job.count || 0)}</span></div>${job.text ? `<details><summary>Исходное условие</summary><p class="preserve">${esc(job.text)}</p></details>` : ''}${job.error ? `<div class="notice" role="alert">${esc(errorMessage(job.error))}</div>` : ''}<div class="detail-actions">${['queued', 'retry'].includes(job.state) ? `<button class="button secondary" data-job-action="cancel" data-id="${id}">Отменить заявку</button>` : ''}${['failed', 'delivery_failed'].includes(job.state) ? `<button class="button primary" data-job-action="retry" data-id="${id}">Повторить заявку</button>` : ''}</div>${parts.map((part) => {
    const result = part.result;
    if (!result) return `<article class="result-card"><h3>✦ Задача #${esc(part.source_id || part.part + 1)}</h3><p>${job.state === 'failed' || job.state === 'delivery_failed' ? 'Обработка остановлена. Решение ещё не получено; причина указана выше.' : job.state === 'cancelled' ? 'Заявка отменена.' : 'Задача принята. Здесь появится результат обработки.'}</p></article>`;
    if (result.status === 'needs_details') return `<article class="result-card"><h3>✦ Задача #${esc(part.source_id || part.part + 1)} · уточнение</h3><p>${esc(result.answer)}</p><form class="refine-form" data-part="${part.part}" data-job="${id}"><textarea name="text" placeholder="Уточнённое условие" maxlength="12000"></textarea>${(result.choices || []).map((choice) => `<label class="choice"><input type="radio" name="choice" value="${esc(choice.value)}">${esc(choice.text)}</label>`).join('')}<label class="file-label">Исходные данные TXT/CSV <input type="file" name="file" accept=".txt,.csv"></label><button class="button primary" type="submit">Продолжить решение ↗</button></form></article>`;
    return `<article class="result-card"><div class="result-title"><h3>✦ Задача #${esc(part.source_id || part.part + 1)}</h3><button class="text-button" data-copy-part="${part.part}">Копировать код ⧉</button></div><pre><code>${esc(result.code || '')}</code></pre><div class="answer"><span>ОТВЕТ</span><strong>${esc(result.answer)}</strong></div>${result.explanation ? `<p>${esc(result.explanation)}</p>` : ''}<small class="verification">${esc(result.verification || '')}</small><button class="text-button" data-download-part="${part.part}">Скачать .py ↓</button></article>`;
  }).join('')}${!parts.length && job.kind !== 'task' && job.result ? `<div class="notice">${esc(job.result.answer)}<br>${esc(job.result.explanation || '')}</div>` : !parts.length ? '<div class="empty-state">Условия выделяются после приёма заявки. На фото количество задач пока может быть неизвестно.</div>' : ''}`;
  $('#detail-content').dataset.job = JSON.stringify(job);
  $('#detail-content').dataset.signature = signature;
}

function stripHtml(value) { return String(value).replace(/<[^>]*>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"'); }

async function loadAdmin() {
  if (!me?.admin) return;
  const adminToken = token;
  const data = await api('/api/admin'), settings = data.settings;
  if (token !== adminToken || !me?.admin) return;
  $('#admin-content').innerHTML = `<div class="admin-layout"><section class="panel admin-panel"><h2>Режим работы</h2><div class="admin-actions"><button class="button ${settings.paused === '1' ? 'primary' : 'secondary'}" data-admin="set" data-args="paused ${settings.paused === '1' ? '0' : '1'}">${settings.paused === '1' ? 'Продолжить очередь' : 'Приостановить решения'}</button><button class="button secondary" data-admin="emoji_on">Вернуть эмодзи</button></div><form id="settings-form">${[['user_limit', 'Telegram: задач за 5 часов', 1, 100], ['workers', 'Параллельных задач', 1, 2], ['api_interval', 'Интервал API, секунд', 1, 3600]].map(([name, label, min, max]) => `<label>${label}<input type="number" name="${name}" min="${min}" max="${max}" value="${esc(settings[name])}" required></label>`).join('')}<label>Модель решения<select name="model">${['deepseek-v4.1-flash', 'qwen3.6-35b-a3b'].map((model) => `<option ${settings.model === model ? 'selected' : ''}>${model}</option>`).join('')}</select></label><label>Модель распознавания<select name="vision_model">${['qwen3.6-35b-a3b', 'deepseek-v4.1-flash'].map((model) => `<option ${settings.vision_model === model ? 'selected' : ''}>${model}</option>`).join('')}</select></label><button class="button primary">Сохранить настройки</button></form></section><section class="panel admin-panel"><h2>Расходы и очередь</h2><p class="preserve">${esc(stripHtml(data.budget))}</p>${data.free_budget ? `<details><summary>Бесплатный резерв</summary><p class="preserve">${esc(stripHtml(data.free_budget))}</p></details>` : ''}<p class="preserve">${esc(stripHtml(data.statistics))}</p><button class="button secondary" data-admin="price_refresh">Сверить тариф</button></section></div><section class="panel admin-panel"><h2>Python-шаблоны</h2><p>Загрузи .py или .txt, либо редактируй здесь. Объявление в группе и закреплённая панель обновятся после сохранения.</p><div class="template-editor-bar"><select id="edit-number" aria-label="Номер шаблона">${Array.from({length: 27}, (_, i) => `<option value="${i + 1}">Задание №${i + 1}${me.templates.some((t) => t.number === i + 1) ? ' · есть шаблон' : ''}</option>`).join('')}</select><button class="button secondary" id="load-template">Открыть</button><label class="button secondary">Загрузить .py / .txt<input id="template-upload" type="file" accept=".py,.txt" hidden></label></div><input id="template-filename" value="task1.py" aria-label="Имя файла шаблона"><textarea id="template-code" class="code-editor" placeholder="Открой шаблон или загрузи файл"></textarea><div class="admin-actions"><button class="button primary" id="save-template">Сохранить шаблон</button><button class="button secondary" id="download-template">Скачать</button><button class="button danger" id="delete-template">Удалить</button></div></section><section class="panel admin-panel"><h2>Инструкция модели</h2><textarea id="system-prompt" maxlength="8000">${esc(settings.system_prompt)}</textarea><div class="admin-actions"><button class="button primary" id="save-prompt">Сохранить инструкцию</button><button class="button secondary" data-admin="prompt_reset" data-confirm="Восстановить исходную инструкцию модели?">Восстановить исходную</button></div></section><section class="panel admin-panel"><h2>Лимиты участников</h2><div class="quota-table">${data.quotas.map((quota) => `<div><code>${quota.user}</code><span>${quota.used} использований · окно до ${date(quota.started + 18000)}</span><button class="text-button" data-admin="quota_reset" data-args="${quota.user}" data-confirm="Обнулить лимит этого участника?">Сбросить</button></div>`).join('') || '<p>Пока нет записей.</p>'}</div></section><details class="panel admin-panel"><summary>Точные шаблоны и обслуживание</summary><p>Точные шаблоны привязываются к полному условию. Обычные Python-образцы загружай в разделе выше.</p><div class="quota-table">${(data.exact_keys || []).map((item) => `<div><span>№${item.number} · ${esc(item.condition.slice(0, 100))}</span><button class="text-button" data-exact-delete="${esc(item.key)}">Удалить</button></div>`).join('')}</div><textarea id="exact-templates" class="code-editor">${esc(JSON.stringify(data.exact_templates, null, 2))}</textarea><div class="admin-actions"><button class="button secondary" id="export-exact">Экспорт JSON</button><button class="button secondary" id="import-exact">Импорт списка</button><button class="button danger" data-admin="cache_clear" data-confirm="Очистить кэш? Следующие решения могут потребовать новый запрос API.">Очистить кэш</button></div></details>`;
}

async function adminAction(action, args = '') {
  const result = await api('/api/admin/action', {method: 'POST', body: {action, args}});
  if (action === 'price_refresh' && !result.ok) toast('Тариф не удалось сверить. Сохранённая дата не изменена.', true);
  else toast('Изменения сохранены.');
  await refresh(); await loadAdmin();
}

async function loadTemplate(number) {
  const templateToken = token;
  await navigate('admin');
  $('#edit-number').value = number;
  const data = await api(`/api/admin/templates/${number}`);
  if (token !== templateToken || !me?.admin) return;
  $('#template-code').value = data.code;
  $('#template-code').dataset.number = number;
  $('#template-filename').value = data.filename;
  $('#template-code').scrollIntoView({behavior: 'smooth', block: 'center'});
}

async function refresh(force = false) {
  if (!token || (pollBusy && !force)) return;
  const refreshToken = token;
  pollBusy = true;
  try {
    const profile = await api('/api/me');
    if (token !== refreshToken) return;
    me = profile; renderMe();
    const data = await api('/api/jobs' + (me.admin && $('#all-jobs').checked ? '?all=1' : ''));
    if (token !== refreshToken) return;
    jobs = data.jobs; renderJobs();
    if (detailId && $('#job-dialog').open) await renderDetail();
  } finally { pollBusy = false; }
}

document.addEventListener('click', async (event) => {
  const button = event.target.closest('button, [data-goto]');
  if (!button) return;
  try {
    if (button.dataset.page || button.dataset.goto) navigate(button.dataset.page || button.dataset.goto);
    else if (button.dataset.number) { selected = Number(button.dataset.number); requestId = null; renderGrid(); }
    else if (button.dataset.job) await openJob(button.dataset.job);
    else if (button.dataset.template) { if (me?.admin) await loadTemplate(button.dataset.template); else { selected = Number(button.dataset.template); renderGrid(); navigate('solve'); } }
    else if (button.dataset.jobAction) { await api(`/api/jobs/${button.dataset.id}/${button.dataset.jobAction}`, {method: 'POST', body: {}}); await refresh(); }
    else if (button.dataset.copyPart || button.dataset.downloadPart) {
      const job = JSON.parse($('#detail-content').dataset.job), part = job.parts.find((item) => item.part === Number(button.dataset.copyPart ?? button.dataset.downloadPart));
      if (button.dataset.copyPart) { await navigator.clipboard.writeText(part.result.code); toast('Код скопирован.'); }
      else download(`task-${part.source_id || part.part + 1}.py`, part.result.code);
    } else if (button.dataset.exactDelete) {
      if (confirm('Удалить этот точный шаблон?')) { await api('/api/admin/action', {method: 'POST', body: {action: 'exact_delete', key: button.dataset.exactDelete}}); await loadAdmin(); }
    } else if (button.dataset.admin) {
      if (button.dataset.confirm && !confirm(button.dataset.confirm)) return;
      await adminAction(button.dataset.admin, button.dataset.args);
    } else if (button.id === 'submit') await submit();
    else if (button.id === 'refresh') await refresh();
    else if (button.id === 'remove-file') { $('#attachment').value = ''; requestId = null; filePreview(); }
    else if (button.id === 'copy-web') { await navigator.clipboard.writeText('/web'); toast('Команда /web скопирована. Отправь её в группе.'); }
    else if (button.id === 'logout' || button.id === 'account-logout') { await api('/api/logout', {method: 'POST', body: {}}); signedOut(); await guestAccess(); }
    else if (button.dataset.auth) openAuth(button.dataset.auth);
    else if (button.id === 'close-auth') $('#auth-dialog').close();
    else if (button.id === 'guest-retry') await guestAccess();
    else if (button.id === 'close-detail') { $('#job-dialog').close(); detailId = null; }
    else if (button.id === 'load-template') await loadTemplate($('#edit-number').value);
    else if (button.id === 'download-template') download($('#template-filename').value || 'template.py', $('#template-code').value);
    else if (button.id === 'save-template') {
      if ($('#template-code').dataset.number !== $('#edit-number').value) throw new Error('Сначала открой шаблон выбранного номера.');
      await api(`/api/admin/templates/${$('#edit-number').value}`, {method: 'POST', body: {code: $('#template-code').value, filename: $('#template-filename').value}});
      toast('Шаблон сохранён. Объявление поставлено в очередь.'); await refresh();
    } else if (button.id === 'delete-template') {
      if (confirm(`Удалить шаблон задания №${$('#edit-number').value}?`)) { await api(`/api/admin/templates/${$('#edit-number').value}`, {method: 'DELETE'}); await refresh(); await loadAdmin(); }
    } else if (button.id === 'save-prompt') await adminAction('set', `system_prompt ${$('#system-prompt').value}`);
    else if (button.id === 'export-exact') download('exact-templates.json', $('#exact-templates').value);
    else if (button.id === 'import-exact') {
      const value = $('#exact-templates').value; JSON.parse(value);
      await api('/api/admin/action', {method: 'POST', body: {action: 'exact_import', text: value}}); toast('Точные шаблоны импортированы.');
    }
  } catch (error) { toast(error.message, true); }
});

document.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.target;
  try {
    if (form.id === 'account-form') {
      const submitButton = $('#auth-submit');
      if (submitButton.disabled) return;
      submitButton.disabled = true; $('#auth-error').textContent = '';
      try {
        const data = await api(`/api/account/${form.dataset.mode}`, {method:'POST', body:{login:$('#auth-login').value, password:$('#auth-password').value, device:localStorage.getItem('egebit-device') || ''}});
        token = data.token; localStorage.setItem('egebit-account',token); localStorage.setItem('egebit-device',data.device);
        sessionStorage.removeItem('egebit-session');
        form.reset(); $('#auth-dialog').close();
        await refresh(true); await navigate(me.admin ? 'admin' : 'solve'); toast('Вход выполнен.');
      } catch (error) { $('#auth-error').textContent = error.message; }
      finally { submitButton.disabled = false; }
    } else if (form.id === 'settings-form') {
      const values = new FormData(form);
      for (const [name, value] of values) await api('/api/admin/action', {method: 'POST', body: {action: 'set', args: `${name} ${value}`}});
      toast('Настройки сохранены.'); await refresh(); await loadAdmin();
    } else if (form.classList.contains('refine-form')) {
      const body = new FormData(form), file = body.get('file');
      if (!file?.size) body.delete('file');
      await api(`/api/jobs/${form.dataset.job}/parts/${form.dataset.part}`, {method: 'POST', body});
      form.reset(); form.dataset.dirty = 'false';
      $('#detail-content').dataset.signature = '';
      toast('Уточнение принято без нового списания квоты.'); await refresh();
    }
  } catch (error) { toast(error.message, true); }
});

$('#condition').addEventListener('input', () => { $('#char-count').textContent = `${$('#condition').value.length.toLocaleString('ru-RU')} / 12 000`; requestId = null; });
$('#attachment').addEventListener('change', () => { requestId = null; filePreview(); });
$('#job-search').addEventListener('input', renderJobs);
$('#job-filter').addEventListener('change', renderJobs);
$('#all-jobs').addEventListener('change', () => refresh().catch((error) => toast(error.message, true)));
document.addEventListener('change', async (event) => {
  if (event.target.closest('.refine-form')) event.target.closest('.refine-form').dataset.dirty = 'true';
  if (event.target.id !== 'template-upload') return;
  const file = event.target.files[0];
  if (!file) return;
  if (file.size > 65536) return toast('Шаблон должен быть не больше 64 КБ.', true);
  let raw = new TextDecoder('utf-8').decode(await file.arrayBuffer());
  if (raw.includes('\uFFFD')) raw = new TextDecoder('windows-1251').decode(await file.arrayBuffer());
  $('#template-code').value = raw; $('#template-filename').value = file.name;
  $('#template-code').dataset.number = $('#edit-number').value;
});
document.addEventListener('input', (event) => {
  if (event.target.closest('.refine-form')) event.target.closest('.refine-form').dataset.dirty = 'true';
});
for (const name of ['dragenter', 'dragover']) $('#dropzone').addEventListener(name, (event) => { event.preventDefault(); $('#dropzone').classList.add('dragging'); });
for (const name of ['dragleave', 'drop']) $('#dropzone').addEventListener(name, (event) => { event.preventDefault(); $('#dropzone').classList.remove('dragging'); });
$('#dropzone').addEventListener('drop', (event) => {
  if (event.dataTransfer.files.length !== 1) return toast('Выбери один файл. Внутри может быть несколько задач.', true);
  $('#attachment').files = event.dataTransfer.files; requestId = null; filePreview();
});
$('#job-dialog').addEventListener('close', () => { detailId = null; });
window.addEventListener('hashchange', () => navigate(location.hash.slice(1)));
setInterval(() => { if (token && !document.hidden) refresh().catch(() => {}); }, 6000);

async function boot() {
  const hash = new URLSearchParams(location.hash.slice(1));
  const login = hash.get('login');
  if (login) {
    token = ''; sessionStorage.removeItem('egebit-session');
    history.replaceState(null, '', location.pathname + '#solve');
    try {
      const data = await api('/api/login', {method: 'POST', body: {token: login}});
      token = data.token; sessionStorage.setItem('egebit-session', token);
    } catch (error) { token = localStorage.getItem('egebit-guest') || ''; toast(error.message, true); }
  }
  renderGrid(); renderTemplates(); navigate(location.hash.slice(1));
  if (token && (!localStorage.getItem('egebit-device') && !sessionStorage.getItem('egebit-session') && !localStorage.getItem('egebit-account'))) {
    await guestAccess();
  } else if (token) {
    try { await refresh(); } catch (error) { toast(error.message, true); }
  }
  if (!token) await guestAccess();
}

async function guestAccess() {
  try {
    const data = await api('/api/guest', {method: 'POST', body: {device:localStorage.getItem('egebit-device') || ''}});
    token = data.token; localStorage.setItem('egebit-guest', token);
    localStorage.setItem('egebit-device',data.device);
    await refresh(true);
    $('#guest-retry').hidden = true;
  } catch (error) { toast(error.message, true); $('#guest-retry').hidden = false; }
}

function openAuth(mode) {
  const register = mode === 'register';
  $('#account-form').dataset.mode = mode;
  $('#auth-title').textContent = register ? 'Регистрация' : 'Вход';
  $('#auth-submit').textContent = register ? 'Создать аккаунт' : 'Войти';
  $('#auth-password').autocomplete = register ? 'new-password' : 'current-password';
  $('#auth-error').textContent = '';
  $('#auth-register-note').hidden = !register;
  if (!$('#auth-dialog').open) $('#auth-dialog').showModal();
}
$('#auth-dialog').addEventListener('close', () => { $('#auth-password').value = ''; });
boot();
