'use strict';

window.EgebitStudy = (() => {
  let principal = '', overview = null, catalog = null, current = null, part = 0, ready = false;
  let topic = null, timer = null, saveTimer = null, saveChain = Promise.resolve(), busy = false;
  let historyCursor = null, historyRows = [], period = 30, serverOffset = 0;
  const labels = {correct:'Верно', incorrect:'Ошибка', unverified:'Не проверено'};
  const root = (route=page) => document.querySelector(`#page-${route} .study-root`);
  const heading = (title, text, action='') => `<div class="page-heading"><div><h1>${esc(title)}</h1><p>${esc(text)}</p></div>${action}</div>`;
  const action = (text, attrs, primary=false) => `<button class="button ${primary ? 'primary' : 'secondary'}" ${attrs}>${text}</button>`;
  const empty = (text) => `<div class="empty-state">${esc(text)}</div>`;
  const tag = (text, kind='') => `<span class="tag ${kind}">${esc(text)}</span>`;
  const percent = (number) => number === null ? '—' : number + '%';

  async function call(path, options={}) {
    const owner = token;
    const result = await api('/api/study' + path, options);
    if (owner !== token || owner !== principal) throw new Error('Сеанс изменился. Открой раздел заново.');
    return result;
  }
  function reset() {
    principal = ''; overview = null; current = null; topic = null; part = 0; ready = false;
    historyCursor = null; historyRows = []; clearInterval(timer); clearTimeout(saveTimer);
    document.querySelectorAll('.study-root').forEach((element)=>element.replaceChildren());
  }
  function identity(value, profile) {
    if (principal === value && ready) return;
    if (principal !== value) { reset(); principal = value; }
    ready = Boolean(profile);
    if (['home','study','trainer','analytics','profile'].includes(page)) show(page);
  }
  async function data() {
    const results = await Promise.all([catalog ? catalog : call('/catalog'), overview ? overview : call('/overview?days='+period)]);
    [catalog, overview] = results;
    return overview;
  }
  function metric(title, value, note) {
    return `<article class="panel metric"><small>${esc(title)}</small><strong>${esc(value)}</strong><p>${esc(note)}</p></article>`;
  }
  function metrics(value) {
    const t = value.totals;
    return `<div class="dashboard-metrics">${metric('Учебных попыток',t.total,'ИИ-заявки считаются отдельно')}${metric('Верных ответов',t.correct,`${t.independent_correct} без помощи`)}${metric('Точность',percent(t.accuracy),'По проверенным числовым ответам')}${metric('Серия занятий',value.streak, 'Дней подряд')}${metric('Темы в практике',`${value.mastered} / ${value.available_topics}`,'От 3 разных упражнений без помощи')}${metric('Доступно ИИ-задач',me.quota.left,`Из ${me.quota.limit} · окно 5 часов`)}</div>`;
  }
  function map(value) {
    return `<div class="topic-map">${value.topics.map((t)=>`<button data-study-topic="${t.number}" data-state="${t.state}" title="№${t.number}: ${esc(t.title)} · ${esc({new:'Не начато',active:'В процессе',success:'Есть самостоятельный результат',repeat:'Требуется повторение'}[t.state])}" aria-label="№${t.number}: ${esc(t.title)} · ${esc({new:'Не начато',active:'В процессе',success:'Есть самостоятельный результат',repeat:'Требуется повторение'}[t.state])}">${t.number}</button>`).join('')}</div><div class="topic-legend"><span><i></i>Не начато</span><span><i class="active"></i>В процессе</span><span><i class="success"></i>Есть результат</span><span><i class="repeat"></i>Повторить</span></div>`;
  }
  function activity(rows) {
    return rows.length ? rows.map((r)=>`<div class="study-row"><span class="job-icon ${r.verdict==='correct'?'done':''}">${r.verdict==='correct'?'✓':'·'}</span><div><button class="text-button" data-resume-study="${esc(r.session)}" data-part="${r.part}">Задание №${r.number}</button><small>${date(r.created)} · ${r.independent ? 'без подсказок' : 'с помощью'}</small></div>${tag(labels[r.verdict],r.verdict==='correct'?'success':r.verdict==='incorrect'?'error':'')}</div>`).join('') : empty('Пока нет учебных попыток. Начни с короткой тренировки.');
  }
  function home(value) {
    const next = value.last_lesson || 7;
    return heading(me.guest ? 'Твоя подготовка' : `Привет, ${me.name}`, 'Учись, пробуй самостоятельно и возвращайся к сложным темам.', action('Решить задание ↗','data-goto="solve"',true)) + metrics(value) + `<div class="study-columns"><div class="study-stack"><section class="panel"><div class="study-section-head"><h2>Продолжить обучение</h2>${tag('№'+next,'active')}</div><h3>${esc(catalog.topics[next-1].title)}</h3><p class="study-label">${esc(catalog.topics[next-1].description)}</p><div class="button-row">${action('Открыть урок','data-study-topic="'+next+'"',true)}${action('Практиковаться','data-practice-topic="'+next+'"')}</div></section><section class="panel"><div class="study-section-head"><h2>Задания 1–27</h2><button class="text-button" data-goto="study">Каталог ↗</button></div>${map(value)}</section></div><div class="study-stack"><section class="panel"><div class="study-section-head"><h2>Что повторить</h2></div>${value.recommendations.slice(0,3).map((n)=>`<div class="study-row"><div><strong>№${n} · ${esc(catalog.topics[n-1].title)}</strong><small>${value.topics[n-1].state==='repeat'?'Есть ошибки в последних попытках':'Следующая доступная тема'}</small></div><button class="text-button" data-practice-topic="${n}">Начать ↗</button></div>`).join('')}</section><section class="panel"><h2>План на неделю</h2><div id="dashboard-plan">Загружаем план…</div><button class="text-button" data-goto="profile">Изменить цель ↗</button></section></div></div><section class="panel"><div class="study-section-head"><h2>Последняя учебная активность</h2><button class="text-button" data-goto="analytics">Вся статистика ↗</button></div>${activity(value.recent)}</section>`;
  }
  function catalogView() {
    return heading('Обучение','Каталог всех номеров ЕГЭ. Начальный курс: четыре проверенные темы.') + `<div class="filter-row"><input id="study-search" type="search" placeholder="Номер, название или тема" aria-label="Поиск темы"></div><div class="topic-catalog" id="topic-catalog">${catalogCards('')}</div><p class="chart-caption">Авторские материалы Egebit. Темы сверены с <a href="${esc(catalog.source)}" target="_blank" rel="noopener noreferrer">навигатором ФИПИ 2026</a>. Для остальных номеров работает ИИ-решатель.</p>`;
  }
  function catalogCards(query) {
    const list = catalog.topics.filter((t)=>`${t.number} ${t.title} ${t.description}`.toLowerCase().includes(query.toLowerCase()));
    return list.map((t)=>`<button class="panel topic-card" data-study-topic="${t.number}"><span class="topic-index">${t.number}</span> ${tag(t.available?'Урок и практика':'ИИ-решатель',t.available?'active':'')}<h2>${esc(t.title)}</h2><p>${esc(t.description)}</p><span class="text-button">${t.available?'Открыть тему':'Посмотреть доступные возможности'} ↗</span></button>`).join('') || empty('Тем с таким названием нет.');
  }
  async function lessonView(number) {
    const t = catalog.topics[number-1];
    if (!t) return catalogView();
    if (!t.available) return heading(`№${number} · ${t.title}`,'Учебный материал ещё не опубликован.') + `<section class="panel"><p>Для этого номера можно отправить своё условие существующему ИИ-решателю. Проверенные уроки доступны для №7, 8, 14 и 23.</p><div class="button-row">${action('Решить с ИИ','data-ai-topic="'+number+'"',true)}${action('Вернуться в каталог','data-study-catalog')}</div></section>`;
    const lesson = await call('/lessons/'+number);
    return heading(`№${number} · ${lesson.title}`,lesson.description,action('Все темы','data-study-catalog')) + `<div class="lesson-layout"><nav class="panel lesson-toc" aria-label="Разделы урока">${[['theory','Что нужно знать'],['algorithm','Алгоритм'],['example','Разбор примера'],['mistakes','Типичные ошибки']].map(([id,label])=>`<a href="#lesson-${id}" data-scroll-lesson="lesson-${id}">${label}</a>`).join('')}</nav><article class="lesson-body"><section class="panel" id="lesson-theory"><h2>Что проверяется</h2><p>${esc(lesson.checks)}</p><h3>Перед началом</h3><ul>${lesson.prerequisites.map((p)=>`<li>${esc(p)}</li>`).join('')}</ul></section><section class="panel" id="lesson-algorithm"><h2>Алгоритм решения</h2><ol>${lesson.algorithm.map((p)=>`<li>${esc(p)}</li>`).join('')}</ol></section><section class="panel" id="lesson-example"><h2>Разберём пример</h2><p>${esc(lesson.example)}</p>${lesson.steps.map((p,i)=>`<details><summary>Шаг ${i+1}</summary><p>${esc(p)}</p></details>`).join('')}<details><summary>Показать код и ответ</summary><pre class="lesson-code"><code>${highlight(lesson.code)}</code></pre><p>Ответ: <strong>${esc(lesson.answer)}</strong></p></details></section><section class="panel" id="lesson-mistakes"><h2>Типичные ошибки</h2><ul>${lesson.errors.map((p)=>`<li>${esc(p)}</li>`).join('')}</ul></section><section class="panel"><h2>Попробуй самостоятельно</h2><p>Выбери объяснение, подсказки или проверку без помощи.</p><div class="button-row">${action('Начать практику','data-practice-topic="'+number+'"',true)}${action('Запомнить место в обучении','data-mark-lesson="'+number+'"')}</div><p class="chart-caption">${esc(lesson.origin)}.</p></section></article></div>`;
  }
  function trainerForm(sessions) {
    return heading('Тренажёр ЕГЭ','Самостоятельные упражнения с эталонной проверкой. Без запросов к ИИ.') + `<div class="study-columns"><section class="panel"><h2>Настроить тренировку</h2><form id="practice-form" class="study-form"><fieldset><legend>Номера заданий</legend><div class="practice-numbers">${catalog.topics.filter((t)=>t.available).map((t)=>`<label><input type="checkbox" name="numbers" value="${t.number}" ${topic===t.number || !topic?'checked':''}>№${t.number}</label>`).join('')}</div></fieldset><div class="form-grid"><label>Режим<select name="mode"><option value="solo">Самостоятельно</option><option value="hints">Подсказки</option><option value="explain">Объясни</option><option value="exam">Мини-экзамен · 20 минут</option></select></label><label>Сложность<select name="difficulty"><option value="all">Любая</option><option value="basic">Базовая</option><option value="advanced">Повышенная в учебном наборе</option></select></label><label>Упражнений<input type="number" name="count" min="1" max="20" value="5" required></label></div><button class="text-button" type="button" id="weak-topics">Выбрать слабые темы</button><button class="button primary" type="submit">Начать тренировку ↗</button><p class="study-label">Мини-экзамен охватывает выбранные учебные темы. Это не полный вариант ЕГЭ и не прогноз экзаменационного балла.</p></form></section><aside class="study-stack"><section class="panel"><h2>Продолжить</h2>${sessions.length?sessions.map((s)=>`<div class="study-row"><div><strong>${s.mode==='exam'?'Мини-экзамен':'Тренировка'} · ${s.count} упражнений</strong><small>${date(s.created)}</small></div><button class="text-button" data-resume-study="${esc(s.id)}">Открыть ↗</button></div>`).join(''):empty('Незавершённых тренировок нет.')}</section><section class="panel"><h2>Как оценивается результат</h2><p class="study-label">Числовой ответ сверяется с проверенным эталоном. Запуск Python показывает вывод, но не доказывает правильность алгоритма. Попытки с подсказками отмечаются отдельно.</p></section></aside></div>`;
  }
  function highlight(code) {
    const pattern = /#[^\n]*|'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|\b(?:from|import|for|in|if|else|elif|while|def|return|True|False|and|or|not|break|continue)\b|\b\d+(?:\.\d+)?\b/g;
    let out='', last=0;
    for (const match of code.matchAll(pattern)) {
      out+=esc(code.slice(last,match.index)); const text=match[0];
      out+=`<span class="${text.startsWith('#')?'syn-comment':/^["']/.test(text)?'syn-string':/^\d/.test(text)?'syn-number':'syn-key'}">${esc(text)}</span>`; last=match.index+text.length;
    }
    return out+esc(code.slice(last))+'\n';
  }
  function feedback(result) {
    if (!result) return '';
    return `<div class="practice-feedback ${result.verdict}"><h3>${labels[result.verdict]}</h3><p>${result.verdict==='unverified'?'Числового ответа нет или формат не подходит. Такая попытка не входит в точность.':result.verdict==='correct'?'Числовой ответ совпал с проверенным эталоном.':'Числовой ответ отличается от эталона. Можно разобрать решение и повторить тему.'} ${result.independent?'Без подсказок.':'С помощью: не считается самостоятельным освоением.'}</p><small>${Math.round(result.duration)} с от открытия, включая паузы.</small></div>`;
  }
  function exercise() {
    const item = current.items[part], checked=Boolean(item.result), exam=current.mode==='exam', finished=current.state==='finished';
    return heading(exam?'Мини-экзамен':'Тренировка',`Задание №${item.number} · ${part+1} из ${current.items.length}`, exam&&!finished?'<span class="exam-timer" id="exam-timer">—</span>':action('К настройкам','data-training-settings')) + `<div class="training-nav" aria-label="Упражнения">${current.items.map((r,i)=>`<button data-study-part="${i}" aria-current="${i===part}">${i+1}${r.result?' ✓':''}</button>`).join('')}</div><section class="panel"><div class="study-section-head">${tag('№'+item.number,'active')}${!exam||finished?`<button class="text-button" data-study-topic="${item.number}">Открыть теорию ↗</button>`:tag('Без подсказок')}</div><p class="practice-statement">${esc(item.statement)}</p><p class="study-label">${esc(item.origin)}</p><form id="practice-answer-form"><div class="practice-answer"><label>Твой ответ<input id="practice-answer" name="answer" inputmode="numeric" autocomplete="off" maxlength="100" value="${esc(item.answer)}" ${checked||finished?'readonly':''}></label>${!checked&&!finished?`<button class="button primary" type="submit">${exam?'Сохранить ответ':'Проверить ответ'}</button>`:''}</div><details ${item.code?'open':''}><summary>Python-редактор</summary><div class="code-wrap"><pre aria-hidden="true" id="code-highlight">${highlight(item.code||'')}</pre><textarea id="practice-code" aria-label="Python-код" spellcheck="false" autocapitalize="off" autocomplete="off" ${checked||finished?'readonly':''}>${esc(item.code||'')}</textarea></div><div class="button-row">${!checked&&!finished&&!exam?'<button type="button" class="button secondary" id="run-study-code">Запустить в изоляции</button>':''}<button type="button" class="text-button" id="copy-study-code">Копировать код</button></div><div id="study-code-output" role="status"></div></details></form><p class="study-status" id="study-save-status" role="status"></p>${feedback(item.result)}<div class="button-row">${!checked&&!finished&&!exam&&current.mode!=='solo'?[1,2,3].map((n)=>action('Подсказка '+n,'data-hint-level="'+n+'"')).join(''):''}${!exam||finished? action(checked?'Разбор решения':'Показать решение','id="show-study-solution"'):''}${part+1<current.items.length?action('Следующее →','data-study-part="'+(part+1)+'"',true):''}</div><div id="study-help" aria-live="polite"></div><div id="study-solution"></div></section><div class="section-heading"><p class="study-label">${finished?'Тренировка завершена. Результаты сохранены.':exam?'Ответы и код сохраняются автоматически. Таймер проверяет сервер.':'Ответ и код сохраняются при вводе и переходе к следующему упражнению.'}</p>${!finished?action('Завершить '+(exam?'мини-экзамен':'тренировку'),'id="finish-study"'):action('Ещё тренировка','data-training-settings',true)}</div>`;
  }
  function armTimer() {
    clearInterval(timer);
    if (!current || current.mode!=='exam' || current.state!=='active' || page!=='trainer') return;
    const tick=()=>{
      if (page!=='trainer' || !current || !$('#exam-timer')) { clearInterval(timer); return; }
      const seconds=Math.max(0,Math.ceil(current.deadline-(Date.now()/1000+serverOffset)));
      $('#exam-timer').textContent=`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;
      if (!seconds&&!busy) finishSession();
    }; tick(); timer=setInterval(tick,1000);
  }
  function renderExercise() { if(page==='trainer' && current) { root().innerHTML=exercise(); armTimer(); } }
  function draft() {
    if (!current || current.state!=='active' || current.items[part].result || !$('#practice-answer')) return null;
    return {session:current.id, owner:principal, part, answer:$('#practice-answer').value, code:$('#practice-code').value};
  }
  async function saveDraft(value=draft()) {
    clearTimeout(saveTimer);
    if (!value || value.owner!==principal) return;
    const write=async()=>{
      if (value.owner!==principal) return;
      await call(`/sessions/${value.session}/save`,{method:'POST',body:{part:value.part,answer:value.answer,code:value.code}});
      if (current?.id===value.session && principal===value.owner) Object.assign(current.items[value.part],{answer:value.answer,code:value.code});
      if ($('#study-save-status')) $('#study-save-status').textContent='Черновик сохранён';
      if ($('#practice-answer-form')) $('#practice-answer-form').dataset.dirty='false';
    };
    saveChain=saveChain.catch(()=>{}).then(write); return saveChain;
  }
  async function resume(id,index=0) {
    await saveDraft(); current=await call('/sessions/'+encodeURIComponent(id)); part=Math.max(0,Math.min(index,current.items.length-1)); serverOffset=current.server_now-Date.now()/1000;
    navigate('trainer');
  }
  async function finishSession() {
    if (busy || !current) return;
    busy=true;
    try { if (!current.deadline || Date.now()/1000+serverOffset < current.deadline) await saveDraft(); current=await call('/sessions/'+current.id+'/finish',{method:'POST',body:{}}); overview=null; renderExercise(); }
    catch(error) { toast(error.message,true); }
    finally { busy=false; }
  }
  function chart(days,field,title) {
    const max=field==='accuracy'?100:Math.max(1,...days.map((d)=>Number(d[field])||0));
    return `<section class="panel"><h2>${title}</h2>${days.some((d)=>d.total)?`<div class="chart" role="img" aria-label="${title}. Значения доступны в таблице ниже.">${days.map((d)=>`<div class="chart-column" title="${d.date}: ${d[field]??'нет проверок'}"><span data-chart-height="${Math.round((Number(d[field])||0)*100/max)}"></span></div>`).join('')}</div><p class="chart-caption">${days[0].date} — ${days.at(-1).date}</p><details><summary>Значения в таблице</summary><table class="chart-table"><thead><tr><th>Дата</th><th>Попытки</th><th>Верно</th><th>Точность</th></tr></thead><tbody>${days.map((d)=>`<tr><td>${d.date}</td><td>${d.total}</td><td>${d.correct}</td><td>${percent(d.accuracy)}</td></tr>`).join('')}</tbody></table></details>`:empty('График появится после первых проверенных попыток.')}</section>`;
  }
  function analytics(value) {
    return heading('Моя статистика','Только учебные попытки. Готовые ИИ-ответы не означают самостоятельного решения.',`<select id="stats-period" aria-label="Период статистики"><option value="7" ${period===7?'selected':''}>Неделя</option><option value="30" ${period===30?'selected':''}>Месяц</option></select>`) + metrics(value) + `<div class="study-columns">${chart(value.days,'total','Активность по дням')}${chart(value.days,'accuracy','Точность ответов')}</div><div class="study-columns"><section class="panel"><h2>Карта прогресса</h2>${map(value)}<p class="chart-caption">Ошибок: ${value.totals.wrong} · непроверенных: ${value.totals.unverified} · с помощью: ${value.totals.assisted}.</p><details><summary>Показатели по номерам</summary><table class="chart-table"><thead><tr><th>№</th><th>Попытки</th><th>Верно</th><th>Ошибки</th></tr></thead><tbody>${value.topics.map((t)=>`<tr><td>${t.number}</td><td>${t.total}</td><td>${t.correct}</td><td>${t.wrong}</td></tr>`).join('')}</tbody></table></details></section><section class="panel"><h2>Календарь занятий</h2><p class="chart-caption">Последние ${period} дней по московскому времени</p><div class="calendar">${value.days.map((d)=>`<div data-active="${d.total>0}" title="${d.date}: ${d.total} попыток">${Number(d.date.slice(-2))}</div>`).join('')}</div></section></div><section class="panel"><div class="study-section-head"><h2>История учебных попыток</h2><label><input id="study-errors-only" type="checkbox"> Только ошибки</label></div><div id="study-history">Загружаем…</div><button class="text-button" id="study-more" hidden>Загрузить ещё</button><p class="chart-caption">${esc(value.time_note)}</p></section>`;
  }
  function schedule(plan) {
    return plan.schedule.map((s)=>`<div class="study-row"><div><strong>${s.date} · ${esc(s.action)} №${s.number}</strong><small>${esc(s.reason)}</small></div><button class="text-button" ${s.action==='Теория'?'data-study-topic':'data-practice-topic'}="${s.number}">Открыть ↗</button></div>`).join('');
  }
  function profile(value,plan) {
    const s=plan.settings;
    return heading('Профиль','Цель подготовки, достижения и настройки.') + `<div class="study-columns"><div class="study-stack"><section class="panel"><h2>Твой аккаунт</h2><dl class="profile-info"><div><dt>Имя</dt><dd>${esc(me.name)}</dd></div><div><dt>Тип входа</dt><dd>${me.telegram?'Telegram':me.guest?'Гостевой':'Логин и пароль'}</dd></div><div><dt>История</dt><dd>${me.guest?'Этот ключ устройства':'Доступна после входа на другом устройстве'}</dd></div></dl>${me.guest?'<div class="button-row">'+action('Войти','data-auth="login"',true)+action('Регистрация','data-auth="register"')+'</div>':!me.telegram?'<button class="button secondary" id="migrate-study">Перенести гостевой учебный прогресс этого устройства</button>':''}<p class="chart-caption">Гостевой прогресс хранится на сервере по ключу браузера. Очистка данных браузера лишит доступа к этому ключу. Telegram и аккаунт сайта не объединяются.</p></section><section class="panel"><h2>План подготовки</h2><form id="study-plan-form" class="study-form"><label>Цель<input name="target" maxlength="150" required value="${esc(s.target)}"></label><div class="form-grid"><label>Желаемый результат<input name="score" maxlength="30" placeholder="Например, 80 баллов" value="${esc(s.score)}"></label><label>Дата экзамена<input type="date" name="exam_date" value="${esc(s.exam_date)}"></label><label>Занятий в неделю<input name="sessions_per_week" type="number" min="1" max="7" required value="${s.sessions_per_week}"></label><label>Самооценка<select name="level">${[['beginner','Начинаю'],['middle','Есть база'],['advanced','Уверенный уровень']].map(([id,label])=>`<option value="${id}" ${s.level===id?'selected':''}>${label}</option>`).join('')}</select></label></div><button class="button primary">Сохранить план</button></form><p class="chart-caption">${esc(plan.note)}</p><div id="profile-plan">${schedule(plan)}</div></section></div><div class="study-stack"><section class="panel"><h2>Достижения</h2><div class="achievement-list">${value.achievements.map((a)=>`<div class="achievement ${a.earned?'earned':''}"><span>${a.earned?'✓':'○'}</span>${esc(a.title)}</div>`).join('')}</div></section><section class="panel"><h2>Приватность и интерфейс</h2><p class="study-label">Тема оформления меняется внизу страницы и сохраняется на этом устройстве. Результаты и учебная история доступны только текущему пользователю; служебный кэш PWA их не хранит.</p><p class="study-label">ИИ-заявки из Telegram-входа публикуются в группе по прежним правилам. Учебные тренировки остаются личными при любом способе входа.</p><button class="text-button" data-goto="analytics">История обучения ↗</button></section></div></div>`;
  }
  async function loadHistory(append=false) {
    const identityToken=token;
    const errors=$('#study-errors-only')?.checked;
    const response=await call('/attempts?limit=20'+(errors?'&errors=1':'')+(append&&historyCursor?'&before='+historyCursor:''));
    if (identityToken!==token || page!=='analytics') return;
    historyRows=append?[...historyRows,...response.attempts]:response.attempts;
    historyCursor=response.next;
    $('#study-history').innerHTML=activity(historyRows); $('#study-more').hidden=!historyCursor;
  }
  async function show(route) {
    clearInterval(timer);
    if (principal!==token) { reset(); principal=token; }
    const owner=token;
    ready=Boolean(me);
    if (!me || !token) { root(route).innerHTML=heading(names[route],'Подключаем личное пространство…')+empty('Дождись подключения или повтори гостевой вход кнопкой ниже.')+action('Повторить подключение','id="guest-retry-study"'); return; }
    try {
      const value=await data();
      if (owner!==token || page!==route) return;
      let html;
      if (route==='home') html=home(value);
      else if (route==='study') html=topic?await lessonView(topic):catalogView();
      else if (route==='trainer') html=current?exercise():trainerForm((await call('/sessions')).sessions);
      else if (route==='analytics') html=analytics(value);
      else html=profile(value,await call('/plan'));
      if (owner!==token || page!==route) return;
      root(route).innerHTML=html;
      root(route).querySelectorAll('[data-chart-height]').forEach((bar)=>bar.style.height=bar.dataset.chartHeight+'%');
      if (route==='home') { const plan=await call('/plan'); if(page===route&&owner===token) $('#dashboard-plan').innerHTML=schedule(plan); }
      if (route==='trainer') armTimer();
      if (route==='analytics') await loadHistory();
    } catch(error) {
      if (owner===token && page===route) root(route).innerHTML=heading(names[route],'')+`<div class="empty-state" role="alert">${esc(error.message)}${action('Повторить','data-goto="'+route+'"')}</div>`;
    }
  }

  document.addEventListener('click',async(event)=>{
    const button=event.target.closest('button,a[data-scroll-lesson]');
    if (!button) return;
    try {
      if (button.dataset.scrollLesson) { event.preventDefault(); $('#'+button.dataset.scrollLesson)?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'}); }
      else if (button.dataset.studyTopic) { topic=Number(button.dataset.studyTopic); navigate('study'); }
      else if (button.hasAttribute('data-study-catalog')) { topic=null; navigate('study'); }
      else if (button.dataset.aiTopic) { selected=Number(button.dataset.aiTopic); renderGrid(); navigate('solve'); }
      else if (button.dataset.practiceTopic) { topic=Number(button.dataset.practiceTopic); current=null; navigate('trainer'); }
      else if (button.dataset.markLesson) { await call('/progress',{method:'POST',body:{number:Number(button.dataset.markLesson)}}); overview=null; toast('Место в обучении сохранено.'); }
      else if (button.dataset.resumeStudy) { await resume(button.dataset.resumeStudy,Number(button.dataset.part||0)); }
      else if (button.dataset.studyPart!==undefined) { await saveDraft(); part=Number(button.dataset.studyPart); renderExercise(); }
      else if (button.hasAttribute('data-training-settings')) { await saveDraft(); current=null; clearInterval(timer); show('trainer'); }
      else if (button.id==='guest-retry-study') { await guestAccess(); await show(page); }
      else if (button.id==='weak-topics') { const selectedNumbers=overview.recommendations.slice(0,2); document.querySelectorAll('#practice-form [name=numbers]').forEach((input)=>input.checked=selectedNumbers.includes(Number(input.value))); }
      else if (button.id==='copy-study-code') { await navigator.clipboard.writeText($('#practice-code').value); toast('Код скопирован.'); }
      else if (button.dataset.hintLevel) {
        const result=await call('/sessions/'+current.id+'/hint',{method:'POST',body:{part,level:Number(button.dataset.hintLevel)}});
        current.items[part].hints_used=Math.max(current.items[part].hints_used,Number(button.dataset.hintLevel));
        $('#study-help').innerHTML=`<div class="notice">${esc(result.text)}</div>`;
      } else if (button.id==='show-study-solution') {
        const item=current.items[part];
        if (!item.result && !confirm('Показать ответ и разбор? Эта попытка будет отмечена как выполненная с помощью.')) return;
        const result=await call('/sessions/'+current.id+'/solution',{method:'POST',body:{part,reveal:true}});
        $('#study-solution').innerHTML=`<div class="notice"><strong>Ответ: ${esc(result.answer)}</strong><ol>${result.steps.map((s)=>`<li>${esc(s)}</li>`).join('')}</ol></div><pre class="lesson-code"><code>${highlight(result.code)}</code></pre>`;
      } else if (button.id==='run-study-code') {
        button.disabled=true;
        try { const result=await call('/sessions/'+current.id+'/run',{method:'POST',body:{part,code:$('#practice-code').value}}); $('#study-code-output').innerHTML=`<div class="code-result"><strong>${esc(result.state==='ok'?'Программа выполнена':'Программа не выполнена')}</strong><pre>${esc(result.stdout||result.stderr)}</pre><p>${esc(result.message)}</p></div>`; }
        finally { button.disabled=false; }
      } else if (button.id==='finish-study') { if(confirm('Завершить тренировку и проверить сохранённые ответы?')) await finishSession(); }
      else if (button.id==='study-more') { button.disabled=true; try { await loadHistory(true); } finally { button.disabled=false; } }
      else if (button.id==='migrate-study') { if(confirm('Перенести гостевые учебные попытки этого устройства в текущий аккаунт? Аккаунт Telegram не изменится.')) { await call('/migrate',{method:'POST',body:{guest_token:localStorage.getItem('egebit-guest')||''}}); overview=null; await show('profile'); toast('Учебный прогресс перенесён.'); } }
    } catch(error) { toast(error.message,true); }
  });
  document.addEventListener('submit',async(event)=>{
    const form=event.target;
    if (!['practice-form','practice-answer-form','study-plan-form'].includes(form.id)) return;
    event.preventDefault();
    const button=form.querySelector('button[type=submit],button:not([type])');
    if (button?.disabled) return;
    if (button) button.disabled=true;
    try {
      const fields=new FormData(form);
      if (form.id==='practice-form') {
        form.dataset.requestId ||= crypto.randomUUID();
        current=await call('/sessions',{method:'POST',headers:{'X-Request-ID':form.dataset.requestId},body:{numbers:fields.getAll('numbers').map(Number),mode:fields.get('mode'),difficulty:fields.get('difficulty'),count:Number(fields.get('count'))}});
        part=0; serverOffset=current.server_now-Date.now()/1000; renderExercise();
      } else if (form.id==='practice-answer-form') {
        const value=draft(); await saveDraft(value);
        if (current.mode==='exam') return;
        await call('/sessions/'+current.id+'/check',{method:'POST',body:{part,answer:value.answer,code:value.code}});
        current=await call('/sessions/'+current.id); overview=null; renderExercise();
      } else {
        const plan=await call('/plan',{method:'POST',body:{...Object.fromEntries(fields),sessions_per_week:Number(fields.get('sessions_per_week'))}});
        $('#profile-plan').innerHTML=schedule(plan); form.dataset.dirty='false'; toast('План сохранён.');
      }
    } catch(error) { toast(error.message,true); }
    finally { if(button?.isConnected) button.disabled=false; }
  });
  document.addEventListener('input',(event)=>{
    if(event.target.id==='study-search') $('#topic-catalog').innerHTML=catalogCards(event.target.value);
    if(['practice-answer','practice-code'].includes(event.target.id)) {
      if(event.target.id==='practice-code') $('#code-highlight').innerHTML=highlight(event.target.value);
      const value=draft(); clearTimeout(saveTimer); saveTimer=setTimeout(()=>saveDraft(value).catch((error)=>toast(error.message,true)),700);
      $('#study-save-status').textContent='Есть несохранённые изменения…';
    }
  });
  document.addEventListener('change',async(event)=>{
    try {
      if(event.target.id==='stats-period') { period=Number(event.target.value); overview=null; await show('analytics'); }
      if(event.target.id==='study-errors-only') await loadHistory();
    } catch(error) { toast(error.message,true); }
  });
  document.addEventListener('keydown',(event)=>{
    const input=event.target;
    if(input.id!=='practice-code' || input.readOnly || !['Tab','Enter'].includes(event.key)) return;
    event.preventDefault();
    const start=input.selectionStart, end=input.selectionEnd;
    const line=input.value.slice(0,start).split('\n').at(-1), spaces=(line.match(/^ */)||[''])[0];
    input.setRangeText(event.key==='Tab'?'    ':'\n'+spaces+(line.trimEnd().endsWith(':')?'    ':''),start,end,'end');
    input.dispatchEvent(new Event('input',{bubbles:true}));
  });
  document.addEventListener('scroll',(event)=>{
    if(event.target.id==='practice-code' && $('#code-highlight')) { $('#code-highlight').scrollTop=event.target.scrollTop; $('#code-highlight').scrollLeft=event.target.scrollLeft; }
  },true);
  function openTopic(number) { topic=number; navigate('study'); }
  return {show,reset,identity,openTopic};
})();
