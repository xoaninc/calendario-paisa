'use strict';

const SUBJECTS = {
  FP: { name: 'Fundamentos del Paisajismo', short: 'Fundamentos', color: '--c-fp' },
  DDN: { name: 'Dibujo del Natural', short: 'Dibujo', color: '--c-ddn' },
  IPP: { name: 'Introducción a Proyectos de Paisajismo', short: 'Proyectos', color: '--c-ipp' },
  SCS: { name: 'Sostenibilidad y Compromiso Social', short: 'Sostenibilidad', color: '--c-scs' },
  HAP: { name: 'Historia de la Arquitectura y el Paisaje', short: 'Historia', color: '--c-hap' },
};
const TAGS = {
  obligatoria: 'Obligatoria', examen: 'Examen', entrega: 'Entrega',
  presentacion: 'Presentación', visita: 'Salida', sinclase: 'No hay clase',
};
const KEY_TAGS = ['obligatoria', 'examen', 'entrega', 'presentacion'];
const DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
  'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MOBILE = matchMedia('(max-width: 719px)');
const HOUR_PX = 52;

const $ = (sel) => document.querySelector(sel);
function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false && kid !== '') n.append(kid);
  return n;
}

// Preferencias de cada persona (vista, grupo, filtros); si no hay almacenamiento, se usan las de por defecto
const store = {
  get(k, d) {
    try { const v = localStorage.getItem('calpaisa.' + k); return v == null ? d : JSON.parse(v); } catch { return d; }
  },
  set(k, v) {
    try { localStorage.setItem('calpaisa.' + k, JSON.stringify(v)); } catch { /* modo privado */ }
  },
};

// ---------- fechas: todo en hora local (el calendario es de Madrid)
const day0 = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const monday = (d) => addDays(day0(d), -((d.getDay() + 6) % 7));
const pad = (n) => String(n).padStart(2, '0');
const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const longDay = (d) => `${DAYS[d.getDay()]} ${d.getDate()} de ${MONTHS[d.getMonth()]}`;
const shortDate = (d) => `${DAYS[d.getDay()].slice(0, 3)} ${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`;
function parseLocal(s) {
  const [date, time] = s.split('T');
  const [y, m, d] = date.split('-').map(Number);
  if (!time) return new Date(y, m - 1, d);
  const [h, mi] = time.split(':').map(Number);
  return new Date(y, m - 1, d, h, mi);
}
function homeCursor() {
  const t = day0(new Date());
  return t.getDay() === 0 || t.getDay() === 6 ? addDays(monday(t), 7) : t;
}

// ---------- estado
const state = {
  view: store.get('view', MOBILE.matches ? 'agenda' : 'week'),
  group: store.get('group', 0),
  hidden: new Set(store.get('hidden', [])),
  onlyKey: store.get('onlyKey', false),
  cursor: homeCursor(),
  selected: null,
  showPast: false,
};
let ALL = [];
let BY_DAY = new Map();

function prepare(raw) {
  const e = { ...raw, s: parseLocal(raw.start), f: parseLocal(raw.end) };
  e.days = [];
  if (e.allDay) {
    for (let d = day0(e.s); d < e.f && e.days.length < 31; d = addDays(d, 1)) e.days.push(keyOf(d));
  }
  if (!e.days.length) e.days.push(keyOf(e.s));
  e.point = !e.allDay && e.f <= e.s; // plazos: entregas a una hora concreta
  e.key = e.tags.some((t) => KEY_TAGS.includes(t));
  return e;
}
function visible(e) {
  if (e.subjects.length && e.subjects.every((c) => state.hidden.has(c))) return false;
  if (state.group && e.group && e.group !== state.group) return false;
  if (state.onlyKey && !e.key) return false;
  return true;
}
const order = (a, b) => (b.allDay - a.allDay) || (a.s - b.s) || a.title.localeCompare(b.title, 'es');
function reindex() {
  BY_DAY = new Map();
  for (const e of ALL) {
    if (!visible(e)) continue;
    for (const k of e.days) {
      if (!BY_DAY.has(k)) BY_DAY.set(k, []);
      BY_DAY.get(k).push(e);
    }
  }
  for (const list of BY_DAY.values()) list.sort(order);
}

// ---------- piezas
function colorStyle(codes) {
  const vars = codes.filter((c) => SUBJECTS[c]).map((c) => `var(${SUBJECTS[c].color})`);
  return vars.length ? `--c:${vars[0]};${vars[1] ? `--c2:${vars[1]};` : ''}` : null;
}
const displayTitle = (e) => e.title.replace(/^OBLIGATORIA · /, '');
const subjectShort = (e) => e.subjects.map((c) => SUBJECTS[c]?.short || c).join(' + ');
function timeLabel(e) {
  if (e.allDay) return 'Todo el día';
  if (e.point) return `hasta ${hm(e.s)}`;
  return `${hm(e.s)}–${hm(e.f)}`;
}
function whenText(e) {
  if (e.allDay) {
    const last = parseLocal(e.days[e.days.length - 1]);
    return e.days.length > 1
      ? `Del ${longDay(e.s)} al ${longDay(last)}`
      : `${cap(longDay(e.s))} · todo el día`;
  }
  return `${cap(longDay(e.s))} · ${e.point ? `hasta las ${hm(e.s)}` : `de ${hm(e.s)} a ${hm(e.f)}`}`;
}
function badges(e) {
  const tags = e.tags.filter((t) => TAGS[t]);
  return tags.length ? el('div', { class: 'badges' }, tags.map((t) => el('span', { class: `badge ${t}` }, TAGS[t]))) : null;
}
function evButton(e, compact = false) {
  const cls = ['ev', e.tags.includes('sinclase') && 'sinclase', e.key && 'key'].filter(Boolean).join(' ');
  return el('button', {
    type: 'button', class: cls, style: colorStyle(e.subjects), title: compact ? displayTitle(e) : null,
    onclick: () => openDetail(e),
  },
  el('div', { class: 't' }, displayTitle(e)),
  compact
    ? el('div', { class: 'meta' }, timeLabel(e))
    : [el('div', { class: 'meta' }, [subjectShort(e), e.location].filter(Boolean).join(' · ')), badges(e)]);
}
function linkify(text) {
  return text.split(/(https?:\/\/[^\s)]+)/).map((part, i) => (i % 2
    ? el('a', { href: part, target: '_blank', rel: 'noopener' }, part)
    : document.createTextNode(part)));
}

// ---------- agenda
function dayBlock(k, emptyText = 'Nada en el calendario.') {
  const d = parseLocal(k);
  const isToday = k === keyOf(new Date());
  const list = BY_DAY.get(k) || [];
  return el('section', { class: 'day' + (isToday ? ' is-today' : ''), id: 'd-' + k },
    el('h3', {}, cap(longDay(d)), isToday && el('span', { class: 'tag' }, 'Hoy')),
    list.length
      ? el('div', { class: 'list' }, list.map((e) => el('div', { class: 'row' },
        el('div', { class: 'time' }, timeLabel(e)), evButton(e))))
      : el('p', { class: 'empty' }, emptyText));
}
function nextCard() {
  const now = new Date();
  const today = day0(now);
  const limit = addDays(today, 21);
  const items = ALL.filter((e) => visible(e) && e.key && !e.tags.includes('sinclase') && e.s < limit
    && (e.allDay ? parseLocal(e.days[e.days.length - 1]) >= today : (e.point ? e.s : e.f) >= now))
    .sort((a, b) => a.s - b.s).slice(0, 6);
  if (!items.length) return null;
  return el('section', { class: 'next' },
    el('h3', {}, 'Lo próximo importante (3 semanas)'),
    el('ul', {}, items.map((e) => el('li', {},
      el('button', { type: 'button', onclick: () => openDetail(e) },
        el('span', { class: 'when' }, `${shortDate(e.s)}${e.allDay ? '' : ' ' + hm(e.s)}`),
        el('span', {}, el('span', { class: 'dot', style: colorStyle(e.subjects) }),
          el('span', { class: 'what' }, displayTitle(e))))))));
}
function renderAgenda() {
  const todayKey = keyOf(new Date());
  const keys = [...BY_DAY.keys()].sort();
  if (!keys.includes(todayKey)) keys.push(todayKey), keys.sort();
  const past = keys.filter((k) => k < todayKey);
  const shown = state.showPast ? keys : keys.filter((k) => k >= todayKey);
  $('#main').replaceChildren(...[
    nextCard(),
    past.length && el('button', {
      type: 'button', class: 'btn more',
      onclick: () => { state.showPast = !state.showPast; render(); },
    }, state.showPast ? 'Ocultar los días anteriores' : `Ver los días anteriores (${past.length})`),
    ...shown.map((k) => dayBlock(k, k === todayKey ? 'Hoy no hay nada en el calendario.' : undefined)),
  ].filter(Boolean));
}

// ---------- semana
function layout(list) {
  // reparte en carriles los eventos que se solapan (p. ej. Grupo 1 y Grupo 2 a la vez)
  const items = [...list].sort((a, b) => a.s - b.s || b.f - a.f);
  const out = [];
  let cluster = [];
  let clusterEnd = 0;
  const flush = () => {
    const ends = [];
    for (const it of cluster) {
      let lane = ends.findIndex((t) => t <= it.e.s);
      if (lane < 0) { lane = ends.length; ends.push(0); }
      ends[lane] = it.e.f;
      it.lane = lane;
    }
    for (const it of cluster) it.lanes = ends.length;
    out.push(...cluster);
    cluster = [];
  };
  for (const e of items) {
    if (cluster.length && e.s >= clusterEnd) flush();
    cluster.push({ e });
    clusterEnd = Math.max(clusterEnd, +e.f);
  }
  if (cluster.length) flush();
  return out;
}
function weekTitle(start) {
  const end = addDays(start, 6);
  const m1 = MONTHS[start.getMonth()].slice(0, 3);
  const m2 = MONTHS[end.getMonth()].slice(0, 3);
  return start.getMonth() === end.getMonth()
    ? `${start.getDate()} – ${end.getDate()} ${m2} ${end.getFullYear()}`
    : `${start.getDate()} ${m1} – ${end.getDate()} ${m2} ${end.getFullYear()}`;
}
function renderWeek() {
  const start = monday(state.cursor);
  const all = [...Array(7)].map((_, i) => addDays(start, i));
  const weekend = all.slice(5).some((d) => BY_DAY.has(keyOf(d)));
  const shown = weekend ? all : all.slice(0, 5);
  const todayKey = keyOf(new Date());
  $('#period').textContent = weekTitle(start);

  if (MOBILE.matches) {
    $('#main').replaceChildren(...shown.map((d) => dayBlock(keyOf(d),
      d.getDay() === 0 || d.getDay() === 6 ? 'Fin de semana.' : 'Nada en el calendario.')));
    return;
  }

  const lists = shown.map((d) => BY_DAY.get(keyOf(d)) || []);
  const timed = lists.map((l) => l.filter((e) => !e.allDay && !e.point));
  const strips = lists.map((l) => l.filter((e) => e.allDay || e.point));
  let h0 = 9;
  let h1 = 15;
  for (const e of timed.flat()) {
    h0 = Math.min(h0, e.s.getHours());
    h1 = Math.max(h1, e.f.getHours() + (e.f.getMinutes() ? 1 : 0));
  }
  h0 = Math.max(7, h0);
  h1 = Math.min(24, Math.max(h1, h0 + 1));

  const week = el('div', { class: 'week', style: `--days:${shown.length};--hour:${HOUR_PX}px` },
    el('div', { class: 'week-head' }, el('div'), shown.map((d) => el('div', { class: keyOf(d) === todayKey ? 'is-today' : null },
      cap(DAYS[d.getDay()]), el('small', {}, `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`)))));
  if (strips.some((l) => l.length)) {
    week.append(el('div', { class: 'week-strip' }, el('div', {}, 'Plazos'),
      strips.map((l) => el('div', {}, l.map((e) => evButton(e, true))))));
  }
  const body = el('div', { class: 'week-body', style: `height:${(h1 - h0) * HOUR_PX}px` });
  const hours = el('div', { class: 'hours' });
  for (let h = h0 + 1; h < h1; h++) hours.append(el('span', { style: `top:${(h - h0) * HOUR_PX}px` }, `${h}:00`));
  body.append(hours);
  shown.forEach((d, i) => {
    const isToday = keyOf(d) === todayKey;
    const col = el('div', { class: 'col' + (isToday ? ' is-today' : '') });
    for (const { e, lane, lanes } of layout(timed[i])) {
      const b = evButton(e, true);
      b.style.top = `${(e.s.getHours() + e.s.getMinutes() / 60 - h0) * HOUR_PX + 1}px`;
      b.style.height = `${Math.max(24, ((e.f - e.s) / 3600000) * HOUR_PX - 3)}px`;
      b.style.left = `calc(${(lane / lanes) * 100}% + 3px)`;
      b.style.width = `calc(${100 / lanes}% - 6px)`;
      col.append(b);
    }
    if (isToday) {
      const now = new Date();
      const t = now.getHours() + now.getMinutes() / 60 - h0;
      if (t > 0 && t < h1 - h0) col.append(el('div', { class: 'now', style: `top:${t * HOUR_PX}px` }));
    }
    body.append(col);
  });
  week.append(body);
  $('#main').replaceChildren(week);
}

// ---------- mes
function renderMonth() {
  const first = new Date(state.cursor.getFullYear(), state.cursor.getMonth(), 1);
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
  const start = monday(first);
  const end = addDays(monday(last), 7);
  const todayKey = keyOf(new Date());
  $('#period').textContent = cap(`${MONTHS[first.getMonth()]} ${first.getFullYear()}`);

  const inMonth = (k) => k >= keyOf(first) && k <= keyOf(last);
  const sel = state.selected && inMonth(state.selected) ? state.selected : (inMonth(todayKey) ? todayKey : null);
  const grid = el('div', { class: 'month-grid' });
  for (let d = start; d < end; d = addDays(d, 1)) {
    const k = keyOf(d);
    const list = BY_DAY.get(k) || [];
    const cls = ['cell', d.getMonth() !== first.getMonth() && 'out', k === todayKey && 'is-today', k === sel && 'sel']
      .filter(Boolean).join(' ');
    grid.append(el('button', {
      type: 'button', class: cls,
      'aria-label': `${longDay(d)}: ${list.length ? `${list.length} en el calendario` : 'nada'}`,
      onclick: () => { state.selected = k; render(); },
    },
    el('span', { class: 'n' }, String(d.getDate())),
    list.slice(0, 3).map((e) => el('span', { class: 'pill' + (e.key ? ' key' : ''), style: colorStyle(e.subjects) }, displayTitle(e))),
    list.length > 3 && el('span', { class: 'plus' }, `+${list.length - 3} más`),
    list.length > 0 && el('span', { class: 'dots' }, list.slice(0, 6).map((e) => el('i', { style: colorStyle(e.subjects) })))));
  }
  $('#main').replaceChildren(...[
    el('div', { class: 'month' },
      el('div', { class: 'month-head' }, ['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((x) => el('div', {}, x))), grid),
    sel && el('div', { class: 'dayview' }, dayBlock(sel)),
  ].filter(Boolean));
}

// ---------- controles
function render() {
  reindex();
  for (const b of document.querySelectorAll('#views button')) b.setAttribute('aria-pressed', String(b.dataset.view === state.view));
  for (const b of document.querySelectorAll('#groups button')) b.setAttribute('aria-pressed', String(Number(b.dataset.group) === state.group));
  for (const b of document.querySelectorAll('#subjects .chip')) b.setAttribute('aria-pressed', String(!state.hidden.has(b.dataset.code)));
  $('#pager').hidden = state.view === 'agenda';
  if (state.view === 'week') renderWeek();
  else if (state.view === 'month') renderMonth();
  else renderAgenda();
}
function shift(n) {
  state.cursor = state.view === 'week'
    ? addDays(state.cursor, 7 * n)
    : new Date(state.cursor.getFullYear(), state.cursor.getMonth() + n, 1);
  state.selected = null;
  render();
}
function setupControls() {
  $('#views').addEventListener('click', (ev) => {
    const b = ev.target.closest('button[data-view]');
    if (!b) return;
    state.view = b.dataset.view;
    store.set('view', state.view);
    render();
  });
  $('#groups').addEventListener('click', (ev) => {
    const b = ev.target.closest('button[data-group]');
    if (!b) return;
    state.group = Number(b.dataset.group);
    store.set('group', state.group);
    render();
  });
  for (const [code, s] of Object.entries(SUBJECTS)) {
    $('#subjects').append(el('button', {
      type: 'button', class: 'chip', 'data-code': code, style: `--c:var(${s.color})`, title: s.name,
      onclick: () => {
        if (state.hidden.has(code)) state.hidden.delete(code); else state.hidden.add(code);
        store.set('hidden', [...state.hidden]);
        render();
      },
    }, s.short));
  }
  const only = $('#onlyKey');
  only.checked = state.onlyKey;
  only.addEventListener('change', () => { state.onlyKey = only.checked; store.set('onlyKey', state.onlyKey); render(); });
  $('#prev').addEventListener('click', () => shift(-1));
  $('#next').addEventListener('click', () => shift(1));
  $('#today').addEventListener('click', () => { state.cursor = homeCursor(); state.selected = null; render(); });
  document.addEventListener('keydown', (ev) => {
    if (state.view === 'agenda' || document.querySelector('dialog[open]') || ev.target.closest('input')) return;
    if (ev.key === 'ArrowLeft') shift(-1);
    if (ev.key === 'ArrowRight') shift(1);
  });
  MOBILE.addEventListener('change', () => { if (ALL.length) render(); });
  for (const d of document.querySelectorAll('dialog')) {
    d.addEventListener('click', (ev) => {
      const r = d.getBoundingClientRect();
      if (ev.clientX < r.left || ev.clientX > r.right || ev.clientY < r.top || ev.clientY > r.bottom) d.close();
    });
  }
}
function openDetail(e) {
  const d = $('#detail');
  d.setAttribute('style', colorStyle(e.subjects) || '');
  $('#d-subj').textContent = e.subjects.map((c) => SUBJECTS[c]?.name || c).join(' + ');
  $('#d-title').textContent = displayTitle(e);
  $('#d-when').textContent = whenText(e);
  $('#d-where').textContent = e.location || '';
  $('#d-tags').replaceChildren(...(badges(e)?.children ? [...badges(e).children] : []));
  $('#d-desc').replaceChildren(...linkify(e.description || ''));
  $('#d-src').textContent = e.source ? `Fuente: ${e.source}.` : '';
  const link = $('#d-link');
  link.hidden = !e.url;
  if (e.url) link.href = e.url;
  d.showModal();
}
function setupSubscribe() {
  const https = new URL('calendario.ics', location.href).href;
  const webcal = https.replace(/^https?:/, 'webcal:');
  $('#s-url').value = https;
  $('#s-apple').href = webcal;
  $('#s-google').href = 'https://calendar.google.com/calendar/render?cid=' + encodeURIComponent(webcal);
  $('#s-outlook').href = 'https://outlook.office.com/calendar/0/addfromweb?url=' + encodeURIComponent(https)
    + '&name=' + encodeURIComponent('1º Paisajismo · Mañana A');
  $('#subscribe').addEventListener('click', () => $('#subs').showModal());
  $('#s-copy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(https);
      $('#s-copy').textContent = 'Copiado';
    } catch {
      $('#s-url').select();
    }
  });
}
function showUpdated(iso) {
  const t = new Date(iso);
  const min = Math.round((Date.now() - t) / 60000);
  $('#updated').textContent = min < 2 ? 'actualizado ahora'
    : min < 60 ? `actualizado hace ${min} min`
      : min < 48 * 60 ? `actualizado hace ${Math.round(min / 60)} h`
        : `actualizado el ${t.toLocaleDateString('es-ES')}`;
  $('#updated').title = t.toLocaleString('es-ES');
}

async function load() {
  try {
    const res = await fetch('eventos.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    ALL = data.events.map(prepare);
    showUpdated(data.updated);
    render();
  } catch {
    $('#updated').textContent = 'sin datos';
    $('#main').replaceChildren(el('div', { class: 'error' },
      'No se ha podido cargar el calendario. Vuelve a intentarlo dentro de un rato.'));
  }
}

setupControls();
setupSubscribe();
load();
