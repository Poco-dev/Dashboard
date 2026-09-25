/* ==========================================================================
   Пробка — доска заметок
   Чистый JS без зависимостей. Данные хранятся в localStorage.
   ========================================================================== */
(() => {
  'use strict';

  /* ================= helpers ================= */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const uid = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = (name, cls = '') => `<svg class="i ${cls}"><use href="#i-${name}"/></svg>`;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform);

  const COLORS = [
    { id: 'yellow', name: 'Жёлтый', hex: '#fff176' },
    { id: 'pink', name: 'Розовый', hex: '#ffb4c8' },
    { id: 'blue', name: 'Голубой', hex: '#a9dcff' },
    { id: 'green', name: 'Зелёный', hex: '#bff0a8' },
    { id: 'orange', name: 'Оранжевый', hex: '#ffcb8e' },
    { id: 'purple', name: 'Сиреневый', hex: '#d9c6ff' },
    { id: 'white', name: 'Белый', hex: '#fbfbf8' },
  ];
  const colorHex = (id) => (COLORS.find((c) => c.id === id) || COLORS[0]).hex;
  const STRING_COLORS = ['#d63031', '#1e6fd9', '#11a36a', '#f0a500', '#8e44ad', '#2d3436'];
  const THEMES = [
    { id: 'cork', name: 'Пробковая', bg: '#c69c6d', meta: '#c69c6d' },
    { id: 'paper', name: 'Белая', bg: '#f3f1ec', meta: '#f3f1ec' },
    { id: 'chalk', name: 'Грифельная', bg: '#2f4a3b', meta: '#2f4a3b' },
    { id: 'night', name: 'Ночная', bg: '#151a25', meta: '#151a25' },
  ];
  const PRIORITY = ['Без приоритета', 'Низкий', 'Средний', 'Высокий'];
  const NOTE_W = 220, NOTE_H = 200, MIN_W = 140, MIN_H = 110;
  const MIN_Z = 0.15, MAX_Z = 3;
  const STORAGE_KEY = 'probka-board:v1';
  const CLIP_MARK = 'PROBKA-BOARD:';
  const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

  const isoDate = (offset = 0) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const plural = (n, one, few, many) => {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
  };

  /* ================= state ================= */
  let state = null;
  let selected = new Set();
  let selectedLink = null;
  let editingId = null;
  let editSnap = null;
  let editFresh = false;
  let linkMode = false;
  let linkSource = null;
  let tempLink = null;
  let filter = 'all';
  let query = '';
  let menuTargets = [];
  let menuPoint = null;
  let searchCursor = -1;
  const hist = { past: [], future: [] };

  const defaultSettings = () => ({
    theme: matchMedia('(prefers-color-scheme: dark)').matches ? 'night' : 'cork',
    sound: true,
    tilt: true,
    hand: true,
    stringsOver: true,
  });

  function makeBoard(name) {
    return { id: uid(), name, notes: [], links: [], view: null, created: Date.now() };
  }

  function makeNote(p = {}, b = board()) {
    return Object.assign({
      id: uid(), x: 0, y: 0, w: NOTE_W, h: NOTE_H,
      text: '', color: state ? state.newColor : 'yellow',
      rot: +(Math.random() * 5 - 2.5).toFixed(2),
      done: false, doneAt: null, priority: 0, due: null, locked: false,
      z: nextZ(b), created: Date.now(),
    }, p);
  }

  function nextZ(b = board()) {
    return b ? b.notes.reduce((m, n) => Math.max(m, n.z || 0), 0) + 1 : 1;
  }

  function seedWelcome(b) {
    const add = (x, y, color, text, extra = {}) => {
      const n = makeNote(Object.assign({ x, y, color, text }, extra), b);
      b.notes.push(n);
      return n;
    };
    const a = add(-400, -250, 'yellow', '# Привет! 👋\nЭто твоя пробковая доска.\n\nДважды кликни по пустому месту — приклеится новая заметка.', { rot: -2.2, h: 230 });
    const c = add(-110, -275, 'pink', 'Дважды кликни по заметке, чтобы её **редактировать**.\n\nМожно *курсив*, ~~зачёркнутое~~, списки и #теги', { rot: 1.6, h: 250 });
    const d = add(190, -225, 'blue', '🧵 Потяни за **булавку** сверху заметки к другой — они соединятся нитью.\n\nКликни по нити, чтобы перекрасить или подписать её.', { rot: -1.2, w: 240, h: 265 });
    const e = add(-380, 70, 'green', '✅ Сделал дело — жми на кружок в углу!\n\nВот так выглядит выполненная задача.', { rot: 2.1, done: true, doneAt: Date.now() });
    const f = add(-70, 50, 'orange', 'Планы на неделю:\n[x] Завести доску\n[ ] Приклеить свои задачи\n[ ] Соединить идеи нитями\n[ ] Всё выполнить 🎉\n#цели', { rot: -1.4, priority: 2, due: isoDate(3), w: 240, h: 230 });
    const g = add(250, 75, 'purple', '⌨️ **Горячие клавиши**\n- N — новая заметка\n- L — режим нитей\n- F — показать всё\n- ? — вся справка', { rot: 1.1 });
    const L = (from, to, color = STRING_COLORS[0], label = '') => b.links.push({ id: uid(), from: from.id, to: to.id, color, label });
    L(a, c);
    L(c, d);
    L(a, e, STRING_COLORS[2], 'готово!');
    L(d, g, STRING_COLORS[1]);
    L(c, f, STRING_COLORS[0]);
  }

  function defaultState() {
    const b = makeBoard('Моя доска');
    seedWelcome(b);
    return { v: 1, boards: [b], currentId: b.id, newColor: 'yellow', stringColor: STRING_COLORS[0], settings: defaultSettings() };
  }

  function normalizeNote(n) {
    if (!n || typeof n !== 'object') return null;
    const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
    return {
      id: typeof n.id === 'string' ? n.id : uid(),
      x: num(n.x, 0), y: num(n.y, 0),
      w: Math.max(MIN_W, num(n.w, NOTE_W)), h: Math.max(MIN_H, num(n.h, NOTE_H)),
      text: typeof n.text === 'string' ? n.text : '',
      color: COLORS.some((c) => c.id === n.color) ? n.color : 'yellow',
      rot: clamp(num(n.rot, 0), -8, 8),
      done: !!n.done, doneAt: n.doneAt || null,
      priority: clamp(Math.round(num(n.priority, 0)), 0, 3),
      due: typeof n.due === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(n.due) ? n.due : null,
      locked: !!n.locked,
      z: num(n.z, 1), created: num(n.created, Date.now()),
    };
  }

  function normalizeBoard(raw, keepId = false) {
    const b = makeBoard(typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, 60) : 'Доска');
    if (keepId && typeof raw.id === 'string') b.id = raw.id;
    b.notes = (Array.isArray(raw.notes) ? raw.notes : []).map(normalizeNote).filter(Boolean);
    const ids = new Set(b.notes.map((n) => n.id));
    b.links = (Array.isArray(raw.links) ? raw.links : [])
      .filter((l) => l && ids.has(l.from) && ids.has(l.to) && l.from !== l.to)
      .map((l) => ({
        id: typeof l.id === 'string' ? l.id : uid(), from: l.from, to: l.to,
        color: typeof l.color === 'string' && /^#[0-9a-f]{3,8}$/i.test(l.color) ? l.color : STRING_COLORS[0],
        label: typeof l.label === 'string' ? l.label.slice(0, 40) : '',
        straight: !!l.straight,
      }));
    if (raw.view && isFinite(raw.view.x) && isFinite(raw.view.y) && isFinite(raw.view.z)) {
      b.view = { x: raw.view.x, y: raw.view.y, z: clamp(raw.view.z, MIN_Z, MAX_Z) };
    }
    if (raw.created) b.created = raw.created;
    return b;
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (s && Array.isArray(s.boards) && s.boards.length) {
          const st = {
            v: 1,
            boards: s.boards.map((b) => normalizeBoard(b, true)),
            currentId: s.currentId,
            newColor: COLORS.some((c) => c.id === s.newColor) ? s.newColor : 'yellow',
            stringColor: s.stringColor || STRING_COLORS[0],
            settings: Object.assign(defaultSettings(), s.settings),
          };
          if (!st.boards.some((b) => b.id === st.currentId)) st.currentId = st.boards[0].id;
          return st;
        }
      }
    } catch (err) {
      console.warn('Не удалось прочитать сохранённые данные', err);
    }
    return defaultState();
  }

  let saveTimer = null;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 250);
  }
  function saveNow() {
    clearTimeout(saveTimer);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
      toast('Не удалось сохранить: хранилище браузера переполнено');
    }
  }

  const board = () => state && state.boards.find((b) => b.id === state.currentId);
  const getNote = (id) => board().notes.find((n) => n.id === id);

  /* ================= history ================= */
  const snapshot = () => {
    const b = board();
    return JSON.stringify({ notes: b.notes, links: b.links });
  };
  function pushHistory(snap = snapshot()) {
    hist.past.push(snap);
    if (hist.past.length > 150) hist.past.shift();
    hist.future = [];
    updateHistoryButtons();
  }
  function restore(snap) {
    const d = JSON.parse(snap);
    const b = board();
    b.notes = d.notes;
    b.links = d.links;
    selected = new Set([...selected].filter((id) => b.notes.some((n) => n.id === id)));
    if (selectedLink && !b.links.some((l) => l.id === selectedLink)) selectedLink = null;
    renderAll();
    save();
  }
  function undo() {
    if (editingId) endEdit();
    if (!hist.past.length) return;
    hist.future.push(snapshot());
    restore(hist.past.pop());
    updateHistoryButtons();
  }
  function redo() {
    if (editingId) endEdit();
    if (!hist.future.length) return;
    hist.past.push(snapshot());
    restore(hist.future.pop());
    updateHistoryButtons();
  }
  function updateHistoryButtons() {
    $('#undo-btn').disabled = !hist.past.length;
    $('#redo-btn').disabled = !hist.future.length;
  }
  /** Изменение доски с записью в историю */
  function mutate(fn) {
    const snap = snapshot();
    const res = fn(board());
    pushHistory(snap);
    renderAll();
    save();
    return res;
  }

  /* ================= DOM ================= */
  const viewport = $('#viewport');
  const world = $('#world');
  const notesLayer = $('#notes');
  const linksSvg = $('#links');
  const selectBox = $('#select-box');
  const noteEls = new Map();

  /* ================= view ================= */
  function applyView() {
    const v = board().view;
    world.style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.z})`;
    viewport.style.setProperty('--z', v.z);
    viewport.style.setProperty('--bgx', `${v.x}px`);
    viewport.style.setProperty('--bgy', `${v.y}px`);
    $('#zoom-label').textContent = `${Math.round(v.z * 100)}%`;
    positionLinkBar();
    scheduleMinimap();
    save();
  }

  function vpRect() { return viewport.getBoundingClientRect(); }

  function screenToWorld(sx, sy) {
    const r = vpRect(), v = board().view;
    return { x: (sx - r.left - v.x) / v.z, y: (sy - r.top - v.y) / v.z };
  }
  function worldToScreen(wx, wy) {
    const r = vpRect(), v = board().view;
    return { x: wx * v.z + v.x + r.left, y: wy * v.z + v.y + r.top };
  }
  function viewCenterWorld() {
    const r = vpRect();
    return screenToWorld(r.left + r.width / 2, r.top + r.height / 2 + 20);
  }

  function zoomAt(sx, sy, factor) {
    const v = board().view, r = vpRect();
    const px = sx - r.left, py = sy - r.top;
    const nz = clamp(v.z * factor, MIN_Z, MAX_Z);
    const k = nz / v.z;
    v.x = px - (px - v.x) * k;
    v.y = py - (py - v.y) * k;
    v.z = nz;
    applyView();
  }
  function zoomCenter(factor) {
    const r = vpRect();
    zoomAt(r.left + r.width / 2, r.top + r.height / 2, factor);
  }

  let viewAnim = null;
  function animateView(target, dur = 380) {
    cancelAnimationFrame(viewAnim);
    const v = board().view;
    const from = { ...v };
    if (reducedMotion) { Object.assign(v, target); applyView(); return; }
    const t0 = performance.now();
    const ease = (t) => 1 - Math.pow(1 - t, 3);
    const step = (now) => {
      const t = Math.min(1, (now - t0) / dur), e = ease(t);
      v.x = from.x + (target.x - from.x) * e;
      v.y = from.y + (target.y - from.y) * e;
      v.z = from.z + (target.z - from.z) * e;
      applyView();
      if (t < 1) viewAnim = requestAnimationFrame(step);
    };
    viewAnim = requestAnimationFrame(step);
  }

  function bbox(notes) {
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const n of notes) {
      x1 = Math.min(x1, n.x); y1 = Math.min(y1, n.y);
      x2 = Math.max(x2, n.x + n.w); y2 = Math.max(y2, n.y + n.h);
    }
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  }

  function fitTarget(notes) {
    const r = vpRect();
    if (!notes.length) return { x: r.width / 2, y: r.height / 2, z: 1 };
    const bb = bbox(notes);
    const small = r.width < 860;
    const padX = small ? 24 : 90, padTop = small ? 70 : 90, padBottom = small ? 80 : 90;
    const z = clamp(Math.min((r.width - padX * 2) / bb.w, (r.height - padTop - padBottom) / bb.h), 0.2, 1.05);
    return {
      z,
      x: r.width / 2 - (bb.x + bb.w / 2) * z,
      y: padTop + (r.height - padTop - padBottom) / 2 - (bb.y + bb.h / 2) * z,
    };
  }
  function fitAll(animate = true) {
    const t = fitTarget(board().notes);
    if (animate) animateView(t);
    else { Object.assign(board().view, t); applyView(); }
  }
  function centerOn(n, zoom) {
    const r = vpRect(), v = board().view;
    const z = zoom || Math.max(v.z, 0.8);
    animateView({ z, x: r.width / 2 - (n.x + n.w / 2) * z, y: r.height / 2 - (n.y + n.h / 2) * z });
  }

  /* ================= markdown-lite ================= */
  const CB_RE = /^\s*(?:[-*]\s*)?\[( |x|X|х|Х)?\]\s?(.*)$/;
  const CHECK_SVG = '<svg class="i" viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>';

  function inline(raw) {
    let s = esc(raw);
    s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
    s = s.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
    s = s.replace(/~~([^~]+)~~/g, '<s>$1</s>');
    s = s.replace(/(^|[\s(])\*([^*\s][^*]*?)\*(?=[\s).,!?:;]|$)/g, '$1<i>$2</i>');
    s = s.replace(/(^|[\s(])_([^_\s][^_]*?)_(?=[\s).,!?:;]|$)/g, '$1<i>$2</i>');
    s = s.replace(/(https?:\/\/[^\s<]+[^\s<.,!?;:)])/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
    s = s.replace(/(^|\s)#([\p{L}\p{N}_-]+)/gu, '$1<span class="tag" data-tag="$2">#$2</span>');
    return s;
  }

  function renderText(text) {
    if (!text.trim()) return '<span class="placeholder">Пустая заметка…</span>';
    return text.split('\n').map((line, i) => {
      let m;
      if ((m = line.match(CB_RE))) {
        const on = m[1] && m[1] !== ' ';
        return `<div class="cb-line${on ? ' checked' : ''}"><span class="cb" data-line="${i}">${on ? CHECK_SVG : ''}</span><span>${inline(m[2]) || '&nbsp;'}</span></div>`;
      }
      if ((m = line.match(/^\s*[-*•]\s+(.*)$/))) return `<div class="li">${inline(m[1])}</div>`;
      if ((m = line.match(/^#{1,3}\s+(.*)$/))) return `<div class="h">${inline(m[1])}</div>`;
      if (!line.trim()) return '<div class="br"></div>';
      return `<div>${inline(line)}</div>`;
    }).join('');
  }

  function checklistStats(text) {
    let total = 0, done = 0;
    for (const line of text.split('\n')) {
      const m = line.match(CB_RE);
      if (m) { total++; if (m[1] && m[1] !== ' ') done++; }
    }
    return { total, done };
  }

  const plainText = (text) => text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/~~(.+?)~~/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/(^|[\s(])[*_]([^*_\s][^*_]*?)[*_](?=[\s).,!?:;]|$)/gm, '$1$2')
    .replace(/^\s*(?:[-*]\s*)?\[(x|X|х|Х)\]\s?/gm, '☑ ')
    .replace(/^\s*(?:[-*]\s*)?\[ ?\]\s?/gm, '☐ ')
    .replace(/^\s*[-*]\s+/gm, '• ')
    .replace(/^#{1,3}\s+/gm, '');

  /* ================= render ================= */
  function matches(n) {
    if (filter === 'active' && n.done) return false;
    if (filter === 'done' && !n.done) return false;
    if (query && !n.text.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  }

  function dueInfo(due, done) {
    if (!due) return null;
    const today = isoDate(0), tomorrow = isoDate(1);
    const [y, m, d] = due.split('-').map(Number);
    let label = `${d} ${MONTHS[m - 1]}`;
    if (y !== new Date().getFullYear()) label += ` ${y}`;
    let cls = '';
    if (due === today) { label = 'Сегодня'; cls = done ? '' : 'today'; }
    else if (due === tomorrow) label = 'Завтра';
    else if (due < today && !done) cls = 'overdue';
    return { label, cls };
  }

  function createNoteEl(n) {
    const el = document.createElement('div');
    el.className = 'note';
    el.dataset.id = n.id;
    el.innerHTML = `
      <div class="paper">
        <div class="pin" title="Потяни к другой заметке, чтобы соединить нитью"><i></i></div>
        <div class="note-head">
          <button class="check" tabindex="-1">${icon('check')}</button>
          <div class="meta"></div>
          <button class="more" tabindex="-1" title="Меню">${icon('more')}</button>
        </div>
        <div class="note-body"></div>
        <div class="note-foot"></div>
        <svg class="stamp" viewBox="0 0 120 120" aria-hidden="true"><circle class="ring" cx="60" cy="60" r="52"/><circle class="ring2" cx="60" cy="60" r="44"/><path class="tick" d="M35 62 L53 80 L88 40"/></svg>
        <div class="resize" title="Потяни, чтобы изменить размер"></div>
      </div>`;
    notesLayer.appendChild(el);
    noteEls.set(n.id, el);
    return el;
  }

  function placeNote(n, el = noteEls.get(n.id)) {
    if (!el) return;
    el.style.left = `${n.x}px`;
    el.style.top = `${n.y}px`;
    el.style.width = `${n.w}px`;
    el.style.height = `${n.h}px`;
  }

  function updateNoteEl(n) {
    const el = noteEls.get(n.id) || createNoteEl(n);
    placeNote(n, el);
    el.style.setProperty('--rot', `${state.settings.tilt ? n.rot : 0}deg`);
    el.style.zIndex = n.id === editingId ? 100000 : n.z;
    if (el.dataset.color !== n.color) el.dataset.color = n.color;
    el.classList.toggle('done', n.done);
    el.classList.toggle('selected', selected.has(n.id));
    el.classList.toggle('locked', n.locked);
    el.classList.toggle('dimmed', !matches(n));
    el.classList.toggle('link-source', linkSource === n.id);

    if (el._text !== n.text && editingId !== n.id) {
      el.querySelector('.note-body').innerHTML = renderText(n.text);
      el._text = n.text;
    }

    let meta = '';
    if (n.priority) meta += `<span class="chip p${n.priority}" title="Приоритет: ${PRIORITY[n.priority]}">${icon('flag')}${'!'.repeat(n.priority)}</span>`;
    const due = dueInfo(n.due, n.done);
    if (due) meta += `<span class="chip ${due.cls}" title="Срок">${icon('calendar')}${due.label}</span>`;
    if (n.locked) meta += `<span class="chip lock" title="Закреплена">${icon('lock')}</span>`;
    if (el._meta !== meta) { el.querySelector('.meta').innerHTML = meta; el._meta = meta; }

    const cl = checklistStats(n.text);
    const foot = cl.total
      ? `<div class="cl-progress"><i style="width:${(cl.done / cl.total) * 100}%"></i></div><span class="cl-count">${cl.done}/${cl.total}</span>`
      : '';
    if (el._foot !== foot) { el.querySelector('.note-foot').innerHTML = foot; el._foot = foot; }

    el.querySelector('.check').title = n.done ? 'Вернуть в работу (D)' : 'Отметить выполненной (D)';
    return el;
  }

  function syncNotes() {
    const b = board();
    const alive = new Set();
    for (const n of b.notes) { alive.add(n.id); updateNoteEl(n); }
    for (const [id, el] of noteEls) {
      if (!alive.has(id)) {
        noteEls.delete(id);
        if (reducedMotion) el.remove();
        else { el.classList.add('leaving'); setTimeout(() => el.remove(), 230); }
      }
    }
  }

  function anchorOf(n) {
    const cx = n.x + n.w / 2, cy = n.y + n.h / 2;
    const r = ((state.settings.tilt ? n.rot : 0) * Math.PI) / 180;
    const oy = -n.h / 2 + 4;
    return { x: cx - oy * Math.sin(r), y: cy + oy * Math.cos(r) };
  }
  function linkGeom(a, b, straight) {
    if (straight) return { d: `M${a.x},${a.y} L${b.x},${b.y}`, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    const sag = Math.min(130, 16 + dist * 0.2);
    const c = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 + sag };
    return {
      d: `M${a.x.toFixed(1)},${a.y.toFixed(1)} Q${c.x.toFixed(1)},${c.y.toFixed(1)} ${b.x.toFixed(1)},${b.y.toFixed(1)}`,
      mid: { x: (a.x + 2 * c.x + b.x) / 4, y: (a.y + 2 * c.y + b.y) / 4 },
    };
  }

  function renderLinks() {
    const b = board();
    const byId = new Map(b.notes.map((n) => [n.id, n]));
    let out = '';
    for (const l of b.links) {
      const A = byId.get(l.from), B = byId.get(l.to);
      if (!A || !B) continue;
      const a = anchorOf(A), c = anchorOf(B);
      const g = linkGeom(a, c, l.straight);
      const dim = !matches(A) && !matches(B);
      let label = '';
      if (l.label) {
        const w = l.label.length * 7.4 + 22;
        label = `<g class="link-label" data-id="${l.id}" transform="translate(${g.mid.x.toFixed(1)},${g.mid.y.toFixed(1)}) rotate(-2)">
          <rect x="${-w / 2}" y="-12" width="${w}" height="24" rx="4"/><text>${esc(l.label)}</text></g>`;
      }
      out += `<g class="link${l.id === selectedLink ? ' selected' : ''}${dim ? ' dimmed' : ''}" style="--c:${l.color}">
        <path class="link-shadow" d="${g.d}"/><path class="link-line" d="${g.d}"/><path class="link-hit" data-id="${l.id}" d="${g.d}"/>
        <circle class="knot" cx="${a.x.toFixed(1)}" cy="${a.y.toFixed(1)}" r="4"/><circle class="knot" cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="4"/>
        ${label}</g>`;
    }
    if (tempLink) out += `<path class="link-temp" d="${linkGeom(tempLink.a, tempLink.b).d}"/>`;
    linksSvg.innerHTML = out;
  }

  let linksQueued = false;
  function scheduleLinks() {
    if (linksQueued) return;
    linksQueued = true;
    requestAnimationFrame(() => { linksQueued = false; renderLinks(); positionLinkBar(); scheduleMinimap(); });
  }

  function updateStats() {
    const ns = board().notes;
    const total = ns.length, done = ns.filter((n) => n.done).length;
    const C = 94.25;
    $('#progress .fill').style.strokeDashoffset = total ? C * (1 - done / total) : C;
    $('#progress-text').textContent = `${done}/${total}`;
    $('#progress').title = total ? `Выполнено ${done} из ${total}` : 'Заметок пока нет';
    $('#progress').classList.toggle('complete', total > 0 && done === total);
    $('#empty-hint').classList.toggle('show', total === 0);
    const count = query ? ns.filter(matches).length : 0;
    $('#search-count').textContent = query ? String(count) : '';
  }

  function renderAll() {
    syncNotes();
    renderLinks();
    updateStats();
    updateSelBar();
    positionLinkBar();
    scheduleMinimap();
    $('#board-name').textContent = board().name;
  }

  function fullRender() {
    for (const el of noteEls.values()) el.remove();
    noteEls.clear();
    renderAll();
  }

  /* ================= selection ================= */
  function selectOnly(...ids) {
    selected = new Set(ids.filter(Boolean));
    selectedLink = null;
    refreshSelection();
  }
  function refreshSelection() {
    for (const [id, el] of noteEls) el.classList.toggle('selected', selected.has(id));
    renderLinks();
    updateSelBar();
    positionLinkBar();
  }
  function selectLink(id) {
    selected.clear();
    selectedLink = id;
    refreshSelection();
    const l = board().links.find((x) => x.id === id);
    if (l) $('#link-label').value = l.label || '';
  }

  function updateSelBar() {
    const bar = $('#sel-bar');
    const n = selected.size;
    bar.hidden = n < 2 || !!editingId;
    if (!bar.hidden) $('#sel-count').textContent = `Выбрано: ${n}`;
  }

  function positionLinkBar() {
    const bar = $('#link-bar');
    const l = selectedLink && board().links.find((x) => x.id === selectedLink);
    if (!l) { bar.hidden = true; return; }
    const A = getNote(l.from), B = getNote(l.to);
    if (!A || !B) { bar.hidden = true; return; }
    const g = linkGeom(anchorOf(A), anchorOf(B), l.straight);
    const p = worldToScreen(g.mid.x, g.mid.y);
    const wasHidden = bar.hidden;
    bar.hidden = false;
    const w = bar.offsetWidth, h = bar.offsetHeight;
    let x = clamp(p.x - w / 2, 8, innerWidth - w - 8);
    let y = p.y - h - 22;
    if (y < 70) y = p.y + 26;
    bar.style.left = `${x}px`;
    bar.style.top = `${y}px`;
    if (wasHidden || bar._for !== l.id) {
      bar._for = l.id;
      $$('#link-swatches .sw').forEach((s) => s.classList.toggle('on', s.dataset.lcolor === l.color));
      $('#link-style-btn use').setAttribute('href', l.straight ? '#i-straight' : '#i-curve');
    }
  }

  /* ================= actions ================= */
  function addNote(opts = {}) {
    let { x, y } = opts;
    if (x == null) {
      const c = viewCenterWorld();
      x = c.x - NOTE_W / 2 + (Math.random() * 80 - 40);
      y = c.y - NOTE_H / 2 + (Math.random() * 60 - 30);
    }
    const n = mutate((b) => {
      const note = makeNote({ x: Math.round(x), y: Math.round(y), text: opts.text || '', color: opts.color || state.newColor });
      b.notes.push(note);
      return note;
    });
    selectOnly(n.id);
    sound('pop');
    flashClass(n.id, 'pop-in', 500);
    if (opts.edit !== false) startEdit(n.id, true);
    return n;
  }

  function flashClass(id, cls, ms) {
    const el = noteEls.get(id);
    if (!el) return;
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
    setTimeout(() => el.classList.remove(cls), ms);
  }

  function deleteNotes(ids) {
    ids = ids.filter((id) => getNote(id));
    if (!ids.length) return;
    if (editingId && ids.includes(editingId)) endEdit(true);
    const set = new Set(ids);
    mutate((b) => {
      b.notes = b.notes.filter((n) => !set.has(n.id));
      b.links = b.links.filter((l) => !set.has(l.from) && !set.has(l.to));
    });
    ids.forEach((id) => selected.delete(id));
    updateSelBar();
    sound('delete');
    toast(ids.length > 1 ? `Удалено ${ids.length} ${plural(ids.length, 'заметка', 'заметки', 'заметок')}` : 'Заметка удалена', { action: 'Отменить', onAction: undo });
  }

  function toggleDone(ids) {
    const b = board();
    const notes = ids.map(getNote).filter(Boolean);
    if (!notes.length) return;
    const val = !notes.every((n) => n.done);
    mutate(() => notes.forEach((n) => { n.done = val; n.doneAt = val ? Date.now() : null; }));
    if (val) {
      sound('check');
      notes.slice(0, 12).forEach((n) => {
        const el = noteEls.get(n.id);
        const r = el && el.querySelector('.check').getBoundingClientRect();
        if (r) confetti.burst(r.left + r.width / 2, r.top + r.height / 2, notes.length > 1 ? 18 : 36);
      });
      if (b.notes.length > 1 && b.notes.every((n) => n.done)) {
        setTimeout(() => { confetti.rain(); sound('win'); toast('Все задачи выполнены! Ты молодец 🎉'); }, 350);
      }
    } else {
      sound('uncheck');
    }
  }

  function toggleChecklistItem(id, lineIdx) {
    const n = getNote(id);
    if (!n) return;
    const lines = n.text.split('\n');
    const m = lines[lineIdx] && lines[lineIdx].match(CB_RE);
    if (!m) return;
    const on = m[1] && m[1] !== ' ';
    mutate(() => {
      lines[lineIdx] = lines[lineIdx].replace(/\[( |x|X|х|Х)?\]/, on ? '[ ]' : '[x]');
      n.text = lines.join('\n');
    });
    sound(on ? 'uncheck' : 'tick');
    const cl = checklistStats(n.text);
    if (!on && cl.total > 1 && cl.done === cl.total && !n.done) {
      toast('Все пункты отмечены', { action: 'Закрыть задачу', onAction: () => toggleDone([id]) });
    }
  }

  function setColor(ids, color) {
    mutate(() => ids.map(getNote).filter(Boolean).forEach((n) => { n.color = color; }));
  }
  function setPriority(ids, p) {
    mutate(() => ids.map(getNote).filter(Boolean).forEach((n) => { n.priority = p; }));
  }
  function setDue(ids, due) {
    mutate(() => ids.map(getNote).filter(Boolean).forEach((n) => { n.due = due || null; }));
  }
  function toggleLock(ids) {
    const notes = ids.map(getNote).filter(Boolean);
    const val = !notes.every((n) => n.locked);
    mutate(() => notes.forEach((n) => { n.locked = val; }));
    toast(val ? 'Заметка закреплена — её нельзя сдвинуть' : 'Заметка откреплена');
  }
  function bringToFront(ids, record = true) {
    const b = board();
    const notes = ids.map(getNote).filter(Boolean).sort((a, c) => a.z - c.z);
    const apply = () => { let z = nextZ(b); notes.forEach((n) => { n.z = z++; }); };
    if (record) mutate(apply);
    else { apply(); notes.forEach((n) => updateNoteEl(n)); }
  }
  function unlinkNotes(ids) {
    const set = new Set(ids);
    const count = board().links.filter((l) => set.has(l.from) || set.has(l.to)).length;
    if (!count) { toast('У этой заметки нет нитей'); return; }
    mutate((b) => { b.links = b.links.filter((l) => !set.has(l.from) && !set.has(l.to)); });
    toast(`Убрано ${count} ${plural(count, 'нить', 'нити', 'нитей')}`, { action: 'Отменить', onAction: undo });
  }

  function insertNotes(notes, links, offset) {
    const map = new Map();
    const created = [];
    mutate((b) => {
      let z = nextZ(b);
      for (const src of notes) {
        const n = normalizeNote(src);
        if (!n) continue;
        const id = uid();
        map.set(n.id, id);
        const c = { ...n, id, x: Math.round(n.x + offset.x), y: Math.round(n.y + offset.y), z: z++, created: Date.now() };
        b.notes.push(c);
        created.push(c.id);
      }
      for (const l of links) {
        if (map.has(l.from) && map.has(l.to)) b.links.push({ ...l, id: uid(), from: map.get(l.from), to: map.get(l.to) });
      }
    });
    selected = new Set(created);
    selectedLink = null;
    refreshSelection();
    created.forEach((id) => flashClass(id, 'pop-in', 500));
    return created;
  }

  function duplicate(ids) {
    const b = board();
    const set = new Set(ids);
    const notes = b.notes.filter((n) => set.has(n.id));
    if (!notes.length) return;
    const links = b.links.filter((l) => set.has(l.from) && set.has(l.to));
    insertNotes(notes, links, { x: 30, y: 30 });
    sound('pop');
  }

  function addLink(from, to, quiet) {
    if (from === to) return false;
    const b = board();
    if (b.links.some((l) => (l.from === from && l.to === to) || (l.from === to && l.to === from))) {
      if (!quiet) toast('Эти заметки уже связаны');
      return false;
    }
    mutate((bb) => bb.links.push({ id: uid(), from, to, color: state.stringColor || STRING_COLORS[0], label: '' }));
    if (!quiet) sound('link');
    return true;
  }

  function chainLink(ids) {
    const notes = ids.map(getNote).filter(Boolean).sort((a, c) => (a.x + a.w / 2) - (c.x + c.w / 2));
    if (notes.length < 2) return;
    const snap = snapshot();
    const b = board();
    let added = 0;
    for (let i = 0; i < notes.length - 1; i++) {
      const f = notes[i].id, t = notes[i + 1].id;
      if (!b.links.some((l) => (l.from === f && l.to === t) || (l.from === t && l.to === f))) {
        b.links.push({ id: uid(), from: f, to: t, color: state.stringColor || STRING_COLORS[0], label: '' });
        added++;
      }
    }
    if (added) { pushHistory(snap); renderAll(); save(); sound('link'); toast(`Протянуто ${added} ${plural(added, 'нить', 'нити', 'нитей')}`); }
    else toast('Эти заметки уже связаны');
  }

  function deleteLink(id) {
    mutate((b) => { b.links = b.links.filter((l) => l.id !== id); });
    selectedLink = null;
    positionLinkBar();
    sound('delete');
  }

  function toggleLinkMode(force) {
    linkMode = typeof force === 'boolean' ? force : !linkMode;
    document.body.classList.toggle('link-mode', linkMode);
    $('#link-btn').classList.toggle('on', linkMode);
    if (!linkMode) cancelPendingLink();
    else toast('Режим нитей: кликни по двум заметкам или протяни от одной к другой. Esc — выход');
  }
  function cancelPendingLink() {
    if (linkSource) {
      const el = noteEls.get(linkSource);
      if (el) el.classList.remove('link-source');
    }
    linkSource = null;
    tempLink = null;
    renderLinks();
  }

  function startEdit(id, fresh = false) {
    if (editingId) endEdit();
    const n = getNote(id);
    const el = noteEls.get(id);
    if (!n || !el) return;
    editingId = id;
    editSnap = snapshot();
    editFresh = fresh;
    selectOnly(id);
    el.style.zIndex = 100000;
    const ta = document.createElement('textarea');
    ta.className = 'note-edit';
    ta.value = n.text;
    ta.placeholder = 'Напиши что-нибудь…\n[ ] пункт списка\n#тег';
    el.querySelector('.paper').insertBefore(ta, el.querySelector('.note-foot'));
    el.classList.add('editing');
    document.body.classList.add('is-editing');
    updateSelBar();
    ta.addEventListener('input', () => { n.text = ta.value; save(); });
    ta.addEventListener('blur', () => setTimeout(() => { if (editingId === id && document.activeElement !== ta) endEdit(); }, 0));
    ta.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) { e.preventDefault(); endEdit(); }
    });
    ta.focus({ preventScroll: true });
    ta.setSelectionRange(ta.value.length, ta.value.length);
  }

  function endEdit(silent = false) {
    const id = editingId;
    if (!id) return;
    editingId = null;
    document.body.classList.remove('is-editing');
    const el = noteEls.get(id);
    const n = getNote(id);
    const ta = el && el.querySelector('.note-edit');
    if (ta) {
      if (n) n.text = ta.value;
      ta.remove();
    }
    if (el) el.classList.remove('editing');
    if (n && !silent) {
      const before = JSON.parse(editSnap).notes.find((x) => x.id === id);
      if (editFresh && !n.text.trim()) {
        // пустую новую заметку убираем без следа
        board().notes = board().notes.filter((x) => x !== n);
        hist.past.pop();
        updateHistoryButtons();
        selected.delete(id);
      } else if (!before || before.text !== n.text) {
        pushHistory(editSnap);
      }
    }
    editSnap = null;
    renderAll();
    save();
  }

  function arrange() {
    const b = board();
    if (b.notes.length < 2) return;
    const sorted = [...b.notes].sort((a, c) => (a.done - c.done) || (c.priority - a.priority) || (a.created - c.created));
    const r = vpRect();
    const cols = Math.max(1, Math.round(Math.sqrt(sorted.length * (r.width / r.height) * 0.9)));
    const gap = 48;
    const colW = Math.max(...sorted.map((n) => n.w)) + gap;
    const bb = bbox(b.notes);
    const targets = new Map();
    let y = bb.y;
    for (let i = 0; i < sorted.length; i += cols) {
      const row = sorted.slice(i, i + cols);
      const rh = Math.max(...row.map((n) => n.h));
      row.forEach((n, j) => targets.set(n.id, { x: Math.round(bb.x + j * colW), y: Math.round(y) }));
      y += rh + gap;
    }
    tweenNotes(targets, () => {
      fitAll(true);
      toast('Заметки разложены по порядку', { action: 'Отменить', onAction: undo });
    });
  }

  function tweenNotes(targets, done) {
    const b = board();
    const snap = snapshot();
    const from = new Map(b.notes.map((n) => [n.id, { x: n.x, y: n.y }]));
    const t0 = performance.now(), dur = reducedMotion ? 1 : 520;
    const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    const step = (now) => {
      const t = Math.min(1, (now - t0) / dur), e = ease(t);
      for (const n of b.notes) {
        const f = from.get(n.id), to = targets.get(n.id);
        if (!f || !to) continue;
        n.x = f.x + (to.x - f.x) * e;
        n.y = f.y + (to.y - f.y) * e;
        placeNote(n);
      }
      renderLinks();
      if (t < 1) requestAnimationFrame(step);
      else { pushHistory(snap); renderAll(); save(); done && done(); }
    };
    requestAnimationFrame(step);
  }

  async function clearDone() {
    const ids = board().notes.filter((n) => n.done).map((n) => n.id);
    if (!ids.length) { toast('Выполненных заметок пока нет'); return; }
    const ok = await dialog({
      title: 'Убрать выполненные?',
      text: `С доски будут сняты ${ids.length} ${plural(ids.length, 'выполненная заметка', 'выполненные заметки', 'выполненных заметок')}. Действие можно отменить.`,
      ok: 'Убрать', danger: true,
    });
    if (ok) deleteNotes(ids);
  }

  function selectAll() {
    selected = new Set(board().notes.filter(matches).map((n) => n.id));
    selectedLink = null;
    refreshSelection();
  }

  /* ================= boards ================= */
  function switchBoard(id) {
    if (editingId) endEdit();
    if (!state.boards.some((b) => b.id === id)) return;
    state.currentId = id;
    selected.clear();
    selectedLink = null;
    hist.past = []; hist.future = [];
    updateHistoryButtons();
    cancelPendingLink();
    fullRender();
    const b = board();
    if (!b.view) { b.view = { x: 0, y: 0, z: 1 }; fitAll(false); }
    applyView();
    save();
  }
  async function newBoard() {
    const name = await dialog({ title: 'Новая доска', input: `Доска ${state.boards.length + 1}`, ok: 'Создать' });
    if (name == null) return;
    const b = makeBoard(name.trim() || `Доска ${state.boards.length + 1}`);
    state.boards.push(b);
    switchBoard(b.id);
    toast(`Доска «${b.name}» создана`);
  }
  async function renameBoard(id = state.currentId) {
    const b = state.boards.find((x) => x.id === id);
    if (!b) return;
    const name = await dialog({ title: 'Переименовать доску', input: b.name, ok: 'Сохранить' });
    if (name == null || !name.trim()) return;
    b.name = name.trim().slice(0, 60);
    renderAll();
    save();
  }
  async function deleteBoard(id) {
    const b = state.boards.find((x) => x.id === id);
    if (!b) return;
    const ok = await dialog({
      title: `Удалить доску «${b.name}»?`,
      text: `На ней ${b.notes.length} ${plural(b.notes.length, 'заметка', 'заметки', 'заметок')}. Это действие нельзя отменить.`,
      ok: 'Удалить', danger: true,
    });
    if (!ok) return;
    state.boards = state.boards.filter((x) => x.id !== id);
    if (!state.boards.length) state.boards.push(makeBoard('Моя доска'));
    if (state.currentId === id || !board()) switchBoard(state.boards[0].id);
    save();
    toast('Доска удалена');
  }

  /* ================= settings ================= */
  function applySettings() {
    const s = state.settings;
    document.body.dataset.theme = s.theme;
    document.body.classList.toggle('hand', s.hand);
    world.classList.toggle('strings-under', !s.stringsOver);
    const t = THEMES.find((x) => x.id === s.theme) || THEMES[0];
    $('meta[name="theme-color"]').setAttribute('content', t.meta);
    $('#color-btn .dot').style.setProperty('--c', colorHex(state.newColor));
  }

  /* ================= popovers ================= */
  let openPop = null;
  function openPopover(html, anchor, { align = 'start', cls = '', trigger = null } = {}) {
    closePopover();
    const pop = document.createElement('div');
    pop.className = `popover ${cls}`;
    pop.innerHTML = html;
    pop._trigger = trigger;
    document.body.appendChild(pop);
    const pw = pop.offsetWidth, ph = pop.offsetHeight;
    let x, y, above = null;
    if (anchor instanceof Element) {
      const r = anchor.getBoundingClientRect();
      x = align === 'end' ? r.right - pw : align === 'center' ? r.left + r.width / 2 - pw / 2 : r.left;
      y = r.bottom + 8;
      above = r.top - ph - 8;
    } else {
      x = anchor.x; y = anchor.y;
      above = anchor.y - ph;
    }
    if (y + ph > innerHeight - 8) y = above != null && above > 8 ? above : Math.max(8, innerHeight - ph - 8);
    x = clamp(x, 8, innerWidth - pw - 8);
    pop.style.left = `${x}px`;
    pop.style.top = `${y}px`;
    if (trigger) trigger.classList.add('on');
    openPop = pop;
    requestAnimationFrame(() => pop.classList.add('open'));
    return pop;
  }
  function closePopover() {
    if (!openPop) return;
    if (openPop._trigger) openPop._trigger.classList.remove('on');
    openPop.remove();
    openPop = null;
  }
  function togglePopover(trigger, build, opts = {}) {
    if (openPop && openPop._trigger === trigger) { closePopover(); return; }
    openPopover(build(), trigger, { ...opts, trigger });
  }
  document.addEventListener('pointerdown', (e) => {
    if (openPop && !openPop.contains(e.target) && !(openPop._trigger && openPop._trigger.contains(e.target))) closePopover();
  }, true);

  function swatchesHTML(act, current, round = false) {
    return COLORS.map((c) => `<button class="sw${round ? ' round' : ''}${c.id === current ? ' on' : ''}" data-act="${act}" data-color="${c.id}" style="--c:${c.hex}" title="${c.name}"></button>`).join('');
  }

  function noteMenuHTML(ids) {
    const notes = ids.map(getNote).filter(Boolean);
    const n = notes[0];
    const multi = notes.length > 1;
    const allDone = notes.every((x) => x.done);
    const allLocked = notes.every((x) => x.locked);
    const k = isMac ? '⌘' : 'Ctrl+';
    return `
      ${multi ? `<div class="pop-title">Выбрано: ${notes.length}</div>` : ''}
      <div class="pop-swatches">${swatchesHTML('note-color', multi ? null : n.color)}</div>
      <button class="pop-item" data-act="note-done">${icon(allDone ? 'undo' : 'check')}<span>${allDone ? 'Вернуть в работу' : 'Выполнено!'}</span><kbd>D</kbd></button>
      ${multi ? '' : `<button class="pop-item" data-act="note-edit">${icon('pencil')}<span>Редактировать</span><kbd>Enter</kbd></button>`}
      <div class="pop-row"><span class="pop-label">${icon('flag')}Приоритет</span>
        <div class="mini-seg">${[0, 1, 2, 3].map((p) => `<button data-act="note-priority" data-p="${p}" class="p${p}${!multi && n.priority === p ? ' on' : ''}" title="${PRIORITY[p]}">${p ? '!'.repeat(p) : '—'}</button>`).join('')}</div>
      </div>
      <div class="pop-row"><span class="pop-label">${icon('calendar')}Срок</span>
        <span class="date-wrap"><input type="date" class="pop-date" data-change="note-due" value="${!multi && n.due ? n.due : ''}">
        ${!multi && n.due ? `<button class="btn icon" data-act="note-due-clear" title="Убрать срок">${icon('x', 'sm')}</button>` : ''}</span>
      </div>
      <div class="pop-sep"></div>
      <button class="pop-item" data-act="note-lock">${icon(allLocked ? 'unlock' : 'lock')}<span>${allLocked ? 'Открепить' : 'Закрепить на месте'}</span></button>
      <button class="pop-item" data-act="note-dup">${icon('copy')}<span>Дублировать</span><kbd>${k}D</kbd></button>
      <button class="pop-item" data-act="note-front">${icon('layers')}<span>На передний план</span></button>
      <button class="pop-item" data-act="note-link">${icon('link')}<span>Протянуть нить…</span><kbd>L</kbd></button>
      <button class="pop-item" data-act="note-unlink">${icon('unlink')}<span>Убрать нити</span></button>
      <div class="pop-sep"></div>
      <button class="pop-item danger" data-act="note-delete">${icon('trash')}<span>Удалить</span><kbd>Del</kbd></button>`;
  }
  function openNoteMenu(ids, anchor) {
    menuTargets = ids;
    openPopover(noteMenuHTML(ids), anchor, { align: anchor instanceof Element ? 'end' : 'start' });
  }

  function boardMenuHTML(pointOnly) {
    if (pointOnly) {
      return `
        <button class="pop-item" data-act="add-here">${icon('plus')}<span>Новая заметка здесь</span><kbd>N</kbd></button>
        <button class="pop-item" data-act="select-all">${icon('check-check')}<span>Выделить всё</span><kbd>${isMac ? '⌘' : 'Ctrl+'}A</kbd></button>
        <button class="pop-item" data-act="arrange">${icon('grid')}<span>Упорядочить</span></button>
        <button class="pop-item" data-act="fit">${icon('fit')}<span>Показать всё</span><kbd>F</kbd></button>`;
    }
    const items = state.boards.map((b) => `
      <div class="board-item${b.id === state.currentId ? ' on' : ''}">
        <button class="pop-item" data-act="board-open" data-id="${b.id}">${icon(b.id === state.currentId ? 'check' : 'pin')}<span class="name">${esc(b.name)}</span><span class="count">${b.notes.length}</span></button>
        <button class="btn icon" data-act="board-rename" data-id="${b.id}" title="Переименовать">${icon('pencil', 'sm')}</button>
        <button class="btn icon danger" data-act="board-delete" data-id="${b.id}" title="Удалить">${icon('trash', 'sm')}</button>
      </div>`).join('');
    return `<div class="pop-title">Мои доски</div>${items}<div class="pop-sep"></div>
      <button class="pop-item" data-act="board-new">${icon('file-plus')}<span>Новая доска</span></button>`;
  }

  function moreMenuHTML() {
    const s = state.settings;
    const tg = (key, label) => `<button class="pop-item toggle${s[key] ? ' on' : ''}" data-act="toggle" data-key="${key}"><span>${label}</span><i class="switch"></i></button>`;
    return `
      <div class="show-sm-block">
        <div class="pop-title">Показывать</div>
        <div class="pop-row"><div class="mini-seg" style="width:100%">
          ${[['all', 'Все'], ['active', 'В работе'], ['done', 'Готово']].map(([f, l]) => `<button style="flex:1" data-act="filter" data-filter="${f}" class="${filter === f ? 'on' : ''}">${l}</button>`).join('')}
        </div></div>
        <div class="pop-sep"></div>
      </div>
      <button class="pop-item" data-act="arrange">${icon('grid')}<span>Упорядочить заметки</span></button>
      <button class="pop-item" data-act="clear-done">${icon('check-check')}<span>Убрать выполненные</span></button>
      <button class="pop-item" data-act="fit">${icon('fit')}<span>Показать всё</span><kbd>F</kbd></button>
      <div class="pop-sep"></div>
      <button class="pop-item" data-act="export-png">${icon('image')}<span>Сохранить картинкой</span></button>
      <button class="pop-item" data-act="export-json">${icon('download')}<span>Скачать файл доски</span></button>
      <button class="pop-item" data-act="import-json">${icon('upload')}<span>Загрузить из файла</span></button>
      <button class="pop-item" data-act="share">${icon('share')}<span>Поделиться ссылкой</span></button>
      <div class="pop-sep"></div>
      <div class="pop-title">Настройки</div>
      ${tg('stringsOver', 'Нити поверх заметок')}
      ${tg('tilt', 'Наклон бумажек')}
      ${tg('hand', 'Рукописный шрифт')}
      ${tg('sound', 'Звуки')}
      <div class="pop-sep"></div>
      <button class="pop-item" data-act="help">${icon('help')}<span>Справка и горячие клавиши</span><kbd>?</kbd></button>`;
  }

  function themeMenuHTML() {
    return `<div class="pop-title">Оформление доски</div><div class="theme-grid">${THEMES.map((t) => `
      <button class="theme-card${state.settings.theme === t.id ? ' on' : ''}" data-act="theme" data-theme="${t.id}">
        <span class="prev" style="background:${t.bg}"></span><span>${t.name}</span></button>`).join('')}</div>`;
  }

  function statsHTML() {
    const ns = board().notes;
    const total = ns.length, done = ns.filter((n) => n.done).length;
    const today = isoDate(0);
    const overdue = ns.filter((n) => !n.done && n.due && n.due < today).length;
    const dueToday = ns.filter((n) => !n.done && n.due === today).length;
    const high = ns.filter((n) => !n.done && n.priority === 3).length;
    const pct = total ? Math.round((done / total) * 100) : 0;
    return `<div class="stats">
      <div class="stats-big">${pct}%<small>выполнено</small></div>
      <div class="stats-bar"><i style="width:${pct}%"></i></div>
      <div class="stats-rows">
        <span>Всего заметок</span><b>${total}</b>
        <span>✅ Готово</span><b>${done}</b>
        <span>⏳ В работе</span><b>${total - done}</b>
        <span>🔥 Высокий приоритет</span><b>${high}</b>
        <span>📅 На сегодня</span><b>${dueToday}</b>
        <span>⚠️ Просрочено</span><b class="${overdue ? 'red' : ''}">${overdue}</b>
      </div></div>
      <div class="pop-sep"></div>
      <button class="pop-item" data-act="filter" data-filter="active">${icon('flag')}<span>Показать только активные</span></button>
      ${overdue ? `<button class="pop-item" data-act="goto-overdue">${icon('calendar')}<span>К просроченной задаче</span></button>` : ''}`;
  }

  /* ================= dialogs & toasts ================= */
  function dialog({ title, text = '', input = null, ok = 'ОК', cancel = 'Отмена', danger = false }) {
    return new Promise((resolve) => {
      const modal = $('#dialog');
      const form = $('#dialog-form');
      const inp = $('#dialog-input');
      $('#dialog-title').textContent = title;
      $('#dialog-text').textContent = text;
      $('#dialog-ok').textContent = ok;
      $('#dialog-ok').classList.toggle('danger', danger);
      $('#dialog-cancel').textContent = cancel;
      inp.hidden = input == null;
      inp.value = input || '';
      modal.hidden = false;
      setTimeout(() => (input != null ? (inp.focus(), inp.select()) : $('#dialog-ok').focus()), 30);
      const finish = (val) => {
        modal.hidden = true;
        form.onsubmit = null;
        $('#dialog-cancel').onclick = null;
        modal.onpointerdown = null;
        modal.onkeydown = null;
        resolve(val);
      };
      form.onsubmit = (e) => { e.preventDefault(); finish(input != null ? inp.value : true); };
      $('#dialog-cancel').onclick = () => finish(input != null ? null : false);
      modal.onpointerdown = (e) => { if (e.target === modal) finish(input != null ? null : false); };
      modal.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Escape') finish(input != null ? null : false); };
    });
  }

  function toast(msg, { action, onAction, ms = 3800 } = {}) {
    const box = $('#toasts');
    while (box.children.length >= 3) box.firstChild.remove();
    const t = document.createElement('div');
    t.className = 'toast';
    t.innerHTML = `<span>${esc(msg)}</span>${action ? `<button>${esc(action)}</button>` : ''}`;
    const close = () => { t.classList.add('out'); setTimeout(() => t.remove(), 200); };
    if (action) t.querySelector('button').onclick = () => { onAction && onAction(); close(); };
    box.appendChild(t);
    setTimeout(close, ms);
  }

  /* ================= confetti ================= */
  const confetti = (() => {
    const cv = $('#confetti');
    const ctx = cv.getContext('2d');
    const palette = ['#ff5a3c', '#ffd23f', '#3ec1d3', '#1f9d55', '#a66cff', '#ff8fab', '#fff176'];
    let parts = [];
    let running = false;
    const dpr = () => Math.min(2, window.devicePixelRatio || 1);
    function resize() {
      cv.width = innerWidth * dpr();
      cv.height = innerHeight * dpr();
    }
    function spawn(x, y, vx, vy) {
      parts.push({
        x, y, vx, vy, g: 0.22 + Math.random() * 0.1,
        rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4,
        w: 5 + Math.random() * 6, h: 3 + Math.random() * 5,
        c: palette[(Math.random() * palette.length) | 0],
        life: 80 + Math.random() * 50, shape: Math.random() < 0.3 ? 1 : 0,
      });
    }
    function burst(x, y, count = 36) {
      if (reducedMotion) return;
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2, s = 2 + Math.random() * 6;
        spawn(x, y, Math.cos(a) * s, Math.sin(a) * s - 3);
      }
      if (!running) loop();
    }
    function rain() {
      if (reducedMotion) return;
      for (let i = 0; i < 180; i++) spawn(Math.random() * innerWidth, -20 - Math.random() * innerHeight * 0.4, (Math.random() - 0.5) * 3, Math.random() * 3);
      parts.forEach((p) => { p.life += 80; });
      if (!running) loop();
    }
    function loop() {
      running = true;
      const k = dpr();
      ctx.setTransform(k, 0, 0, k, 0, 0);
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      parts = parts.filter((p) => p.life > 0 && p.y < innerHeight + 30);
      for (const p of parts) {
        p.life--;
        p.vy += p.g; p.vx *= 0.985; p.vy *= 0.985;
        p.x += p.vx; p.y += p.vy; p.rot += p.vr;
        ctx.save();
        ctx.globalAlpha = Math.min(1, p.life / 25);
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.c;
        if (p.shape) { ctx.beginPath(); ctx.arc(0, 0, p.h / 1.4, 0, Math.PI * 2); ctx.fill(); }
        else ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.rot * 2)) + 1);
        ctx.restore();
      }
      if (parts.length) requestAnimationFrame(loop);
      else { running = false; ctx.clearRect(0, 0, innerWidth, innerHeight); }
    }
    resize();
    addEventListener('resize', resize);
    return { burst, rain };
  })();

  /* ================= sound ================= */
  let actx = null;
  function sound(type) {
    if (!state.settings.sound) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
      const t = actx.currentTime;
      const tone = (freq, start, dur, vol = 0.07, wave = 'sine', end) => {
        const o = actx.createOscillator(), g = actx.createGain();
        o.type = wave;
        o.frequency.setValueAtTime(freq, t + start);
        if (end) o.frequency.exponentialRampToValueAtTime(end, t + start + dur);
        g.gain.setValueAtTime(0.0001, t + start);
        g.gain.exponentialRampToValueAtTime(vol, t + start + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, t + start + dur);
        o.connect(g).connect(actx.destination);
        o.start(t + start);
        o.stop(t + start + dur + 0.03);
      };
      switch (type) {
        case 'check': tone(660, 0, 0.12); tone(990, 0.08, 0.22); break;
        case 'tick': tone(880, 0, 0.09, 0.05); break;
        case 'uncheck': tone(520, 0, 0.14, 0.05, 'sine', 340); break;
        case 'pop': tone(320, 0, 0.13, 0.08, 'sine', 720); break;
        case 'link': tone(196, 0, 0.35, 0.06, 'triangle', 185); tone(392, 0, 0.12, 0.03, 'triangle'); break;
        case 'delete': tone(420, 0, 0.16, 0.05, 'sine', 140); break;
        case 'win': [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.3, 0.06)); break;
        default: break;
      }
    } catch (err) { /* звук не обязателен */ }
  }

  /* ================= minimap ================= */
  const mm = $('#minimap');
  const mmCtx = mm.getContext('2d');
  let mmQueued = false;
  let mmMap = null;
  function scheduleMinimap() {
    if (mmQueued) return;
    mmQueued = true;
    requestAnimationFrame(drawMinimap);
  }
  function drawMinimap() {
    mmQueued = false;
    const b = board();
    const wrap = $('#minimap-wrap');
    wrap.classList.toggle('hidden', b.notes.length === 0);
    if (!b.notes.length || !mm.offsetWidth) return;
    const W = mm.clientWidth, H = mm.clientHeight, k = Math.min(2, devicePixelRatio || 1);
    if (mm.width !== W * k) { mm.width = W * k; mm.height = H * k; }
    const r = vpRect(), v = b.view;
    const vw = { x: -v.x / v.z, y: -v.y / v.z, w: r.width / v.z, h: r.height / v.z };
    const nb = bbox(b.notes);
    const x1 = Math.min(nb.x, vw.x) - 60, y1 = Math.min(nb.y, vw.y) - 60;
    const x2 = Math.max(nb.x + nb.w, vw.x + vw.w) + 60, y2 = Math.max(nb.y + nb.h, vw.y + vw.h) + 60;
    const s = Math.min(W / (x2 - x1), H / (y2 - y1));
    const ox = (W - (x2 - x1) * s) / 2, oy = (H - (y2 - y1) * s) / 2;
    mmMap = { x1, y1, s, ox, oy };
    const tx = (x) => ox + (x - x1) * s, ty = (y) => oy + (y - y1) * s;
    const ctx = mmCtx;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const dark = ['chalk', 'night'].includes(state.settings.theme);
    ctx.fillStyle = dark ? 'rgba(255,255,255,.04)' : 'rgba(0,0,0,.04)';
    ctx.fillRect(0, 0, W, H);
    const byId = new Map(b.notes.map((n) => [n.id, n]));
    ctx.lineWidth = 1;
    for (const l of b.links) {
      const A = byId.get(l.from), B = byId.get(l.to);
      if (!A || !B) continue;
      ctx.strokeStyle = l.color;
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.moveTo(tx(A.x + A.w / 2), ty(A.y + 6));
      ctx.lineTo(tx(B.x + B.w / 2), ty(B.y + 6));
      ctx.stroke();
    }
    for (const n of [...b.notes].sort((a, c) => a.z - c.z)) {
      ctx.globalAlpha = matches(n) ? (n.done ? 0.55 : 1) : 0.2;
      ctx.fillStyle = colorHex(n.color);
      ctx.fillRect(tx(n.x), ty(n.y), Math.max(2, n.w * s), Math.max(2, n.h * s));
      if (n.done) {
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#1f9d55';
        ctx.beginPath();
        ctx.arc(tx(n.x + n.w / 2), ty(n.y + n.h / 2), Math.max(1.5, Math.min(n.w, n.h) * s * 0.22), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#ff5a3c';
    ctx.lineWidth = 1.5;
    ctx.fillStyle = 'rgba(255,90,60,.08)';
    ctx.fillRect(tx(vw.x), ty(vw.y), vw.w * s, vw.h * s);
    ctx.strokeRect(tx(vw.x), ty(vw.y), vw.w * s, vw.h * s);
  }
  (() => {
    let frozen = null;
    const go = (e) => {
      if (!frozen) return;
      const rr = mm.getBoundingClientRect();
      const wx = (e.clientX - rr.left - frozen.ox) / frozen.s + frozen.x1;
      const wy = (e.clientY - rr.top - frozen.oy) / frozen.s + frozen.y1;
      const r = vpRect(), v = board().view;
      v.x = r.width / 2 - wx * v.z;
      v.y = r.height / 2 - wy * v.z;
      applyView();
    };
    mm.addEventListener('pointerdown', (e) => { frozen = mmMap && { ...mmMap }; mm.setPointerCapture(e.pointerId); go(e); });
    mm.addEventListener('pointermove', go);
    mm.addEventListener('pointerup', () => { frozen = null; });
    mm.addEventListener('pointercancel', () => { frozen = null; });
  })();

  /* ================= pointer interaction ================= */
  let drag = null;
  const pointers = new Map();
  let lastTap = null;
  let longPressTimer = null;
  let lastLongPress = 0;

  function registerTap(e, key) {
    const now = performance.now();
    if (lastTap && lastTap.key === key && now - lastTap.t < 400 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 26) {
      lastTap = null;
      return true;
    }
    lastTap = { key, t: now, x: e.clientX, y: e.clientY };
    return false;
  }
  function startLongPress(e, fn) {
    clearTimeout(longPressTimer);
    if (e.pointerType !== 'touch') return;
    longPressTimer = setTimeout(() => {
      if (drag && drag.moved) return;
      lastLongPress = Date.now();
      if (drag && drag.snap && drag.moved) pushHistory(drag.snap);
      drag = null;
      document.body.classList.remove('is-dragging');
      if (navigator.vibrate) navigator.vibrate(12);
      fn();
    }, 520);
  }

  function noteAtPoint(x, y, excludeId) {
    const els = document.elementsFromPoint(x, y);
    for (const el of els) {
      const ne = el.closest && el.closest('.note');
      if (ne && ne.dataset.id !== excludeId && !ne.classList.contains('leaving')) return ne.dataset.id;
    }
    return null;
  }

  function beginPinch() {
    if (drag && drag.type === 'note' && drag.moved) { pushHistory(drag.snap); save(); }
    if (drag && drag.type === 'link') { tempLink = null; renderLinks(); }
    clearTimeout(longPressTimer);
    const [p1, p2] = [...pointers.values()];
    const r = vpRect();
    drag = {
      type: 'pinch',
      dist: Math.hypot(p1.x - p2.x, p1.y - p2.y) || 1,
      mid: { x: (p1.x + p2.x) / 2 - r.left, y: (p1.y + p2.y) / 2 - r.top },
      view: { ...board().view },
      moved: true,
    };
    $$('.note.dragging').forEach((el) => el.classList.remove('dragging'));
  }

  viewport.addEventListener('pointerdown', (e) => {
    if (e.button === 2) return;
    if (!$('#dialog').hidden || !$('#help-modal').hidden) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) { beginPinch(); return; }
    if (pointers.size > 2) return;

    const t = e.target;
    const start = { x: e.clientX, y: e.clientY };

    if (e.button === 1) {
      e.preventDefault();
      drag = { type: 'pan', start, view: { ...board().view }, moved: false };
      return;
    }

    const noteEl = t.closest('.note');
    if (editingId && (!noteEl || noteEl.dataset.id !== editingId)) endEdit();

    if (noteEl && !noteEl.classList.contains('leaving')) {
      const id = noteEl.dataset.id;
      const n = getNote(id);
      if (!n) return;
      if (t.closest('textarea')) return;
      if (t.closest('a')) { lastTap = null; return; }

      if (linkSource && linkSource !== id) {
        addLink(linkSource, id);
        cancelPendingLink();
        if (!linkMode) selectOnly(id);
        lastTap = null;
        return;
      }
      if (t.closest('.check')) { lastTap = null; toggleDone(selected.has(id) && selected.size > 1 ? [...selected] : [id]); return; }
      if (t.closest('.more')) {
        lastTap = null;
        if (!selected.has(id)) selectOnly(id);
        openNoteMenu([...selected], t.closest('.more'));
        return;
      }
      const cb = t.closest('.cb');
      if (cb) { lastTap = null; toggleChecklistItem(id, +cb.dataset.line); return; }
      const tag = t.closest('.tag');
      if (tag && !e.shiftKey) { lastTap = null; setQuery(`#${tag.dataset.tag}`); return; }

      if (t.closest('.pin') || linkMode) {
        const a = anchorOf(n);
        drag = { type: 'link', from: id, start, moved: false };
        tempLink = { a, b: { ...a } };
        return;
      }
      if (t.closest('.resize')) {
        drag = { type: 'resize', id, start, orig: { w: n.w, h: n.h }, snap: snapshot(), moved: false };
        return;
      }

      if (e.shiftKey || e.ctrlKey || e.metaKey) {
        if (selected.has(id)) selected.delete(id); else selected.add(id);
        selectedLink = null;
        refreshSelection();
        if (!selected.has(id)) return;
      } else if (!selected.has(id)) {
        selectOnly(id);
      } else if (selectedLink) {
        selectedLink = null;
        refreshSelection();
      }
      bringToFront([...selected], false);
      const ids = [...selected].filter((sid) => { const sn = getNote(sid); return sn && !sn.locked; });
      drag = {
        type: 'note', id, ids, start, moved: false, snap: snapshot(),
        orig: new Map(ids.map((sid) => { const sn = getNote(sid); return [sid, { x: sn.x, y: sn.y }]; })),
        pointerType: e.pointerType,
      };
      startLongPress(e, () => { if (!selected.has(id)) selectOnly(id); openNoteMenu([...selected], { x: start.x, y: start.y }); });
      return;
    }

    const hit = t.closest('.link-hit, .link-label');
    if (hit) {
      if (registerTap(e, `l:${hit.dataset.id}`)) { selectLink(hit.dataset.id); setTimeout(() => $('#link-label').focus(), 30); }
      else selectLink(hit.dataset.id);
      return;
    }

    // пустое место на доске
    if (linkSource) { cancelPendingLink(); }
    if (e.shiftKey) {
      drag = { type: 'box', start, base: new Set(selected), moved: false };
    } else {
      drag = { type: 'pan', start, view: { ...board().view }, moved: false };
      startLongPress(e, () => {
        menuPoint = screenToWorld(start.x, start.y);
        openPopover(boardMenuHTML(true), { x: start.x, y: start.y });
      });
    }
  });

  window.addEventListener('pointermove', (e) => {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (drag && drag.type === 'pinch') {
      if (pointers.size < 2) return;
      const [p1, p2] = [...pointers.values()];
      const r = vpRect();
      const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y) || 1;
      const mid = { x: (p1.x + p2.x) / 2 - r.left, y: (p1.y + p2.y) / 2 - r.top };
      const o = drag.view;
      const z = clamp(o.z * (dist / drag.dist), MIN_Z, MAX_Z);
      const wx = (drag.mid.x - o.x) / o.z, wy = (drag.mid.y - o.y) / o.z;
      const v = board().view;
      v.z = z;
      v.x = mid.x - wx * z;
      v.y = mid.y - wy * z;
      applyView();
      return;
    }

    if (!drag) {
      if (linkSource && tempLink) {
        tempLink.b = screenToWorld(e.clientX, e.clientY);
        scheduleLinks();
      }
      return;
    }

    const dx = e.clientX - drag.start.x, dy = e.clientY - drag.start.y;
    if (!drag.moved) {
      const threshold = e.pointerType === 'touch' ? 8 : 4;
      if (Math.hypot(dx, dy) < threshold) return;
      drag.moved = true;
      clearTimeout(longPressTimer);
      if (drag.type === 'note') {
        drag.ids.forEach((id) => { const el = noteEls.get(id); if (el) el.classList.add('dragging'); });
        document.body.classList.add('is-dragging');
        if (!drag.ids.length) toast('Заметка закреплена — открепи её в меню, чтобы двигать');
      }
      if (drag.type === 'pan') viewport.classList.add('panning');
      if (drag.type === 'link' || drag.type === 'resize') document.body.classList.add('is-dragging');
    }
    const z = board().view.z;

    switch (drag.type) {
      case 'pan': {
        const v = board().view;
        v.x = drag.view.x + dx;
        v.y = drag.view.y + dy;
        applyView();
        break;
      }
      case 'note': {
        for (const id of drag.ids) {
          const n = getNote(id), o = drag.orig.get(id);
          if (!n || !o) continue;
          n.x = Math.round(o.x + dx / z);
          n.y = Math.round(o.y + dy / z);
          placeNote(n);
        }
        scheduleLinks();
        break;
      }
      case 'resize': {
        const n = getNote(drag.id);
        if (!n) break;
        n.w = Math.round(Math.max(MIN_W, drag.orig.w + dx / z));
        n.h = Math.round(Math.max(MIN_H, drag.orig.h + dy / z));
        placeNote(n);
        scheduleLinks();
        break;
      }
      case 'link': {
        tempLink.b = screenToWorld(e.clientX, e.clientY);
        const over = noteAtPoint(e.clientX, e.clientY, drag.from);
        if (over !== drag.over) {
          if (drag.over) { const el = noteEls.get(drag.over); if (el) el.classList.remove('link-target'); }
          if (over) { const el = noteEls.get(over); if (el) el.classList.add('link-target'); }
          drag.over = over;
        }
        scheduleLinks();
        break;
      }
      case 'box': {
        const r = vpRect();
        const x1 = Math.min(drag.start.x, e.clientX), y1 = Math.min(drag.start.y, e.clientY);
        const x2 = Math.max(drag.start.x, e.clientX), y2 = Math.max(drag.start.y, e.clientY);
        Object.assign(selectBox.style, { display: 'block', left: `${x1 - r.left}px`, top: `${y1 - r.top}px`, width: `${x2 - x1}px`, height: `${y2 - y1}px` });
        const a = screenToWorld(x1, y1), c = screenToWorld(x2, y2);
        selected = new Set(drag.base);
        for (const n of board().notes) {
          if (n.x < c.x && n.x + n.w > a.x && n.y < c.y && n.y + n.h > a.y && matches(n)) selected.add(n.id);
        }
        for (const [id, el] of noteEls) el.classList.toggle('selected', selected.has(id));
        break;
      }
      default: break;
    }
  });

  function endPointer(e) {
    pointers.delete(e.pointerId);
    clearTimeout(longPressTimer);
    if (!drag) return;
    if (drag.type === 'pinch') {
      if (pointers.size < 2) { drag = null; save(); }
      return;
    }
    const d = drag;
    drag = null;
    document.body.classList.remove('is-dragging');
    viewport.classList.remove('panning');
    if (e.type === 'pointercancel') {
      if (d.type === 'link') { tempLink = null; renderLinks(); }
      if (d.type === 'note' || d.type === 'resize') { if (d.moved) { pushHistory(d.snap); save(); } $$('.note.dragging').forEach((el) => el.classList.remove('dragging')); }
      selectBox.style.display = 'none';
      return;
    }

    switch (d.type) {
      case 'note': {
        d.ids.forEach((id) => { const el = noteEls.get(id); if (el) el.classList.remove('dragging'); });
        if (d.moved) {
          pushHistory(d.snap);
          renderAll();
          save();
        } else {
          if (!(e.shiftKey || e.ctrlKey || e.metaKey) && selected.size > 1) selectOnly(d.id);
          if (Date.now() - lastLongPress > 700 && registerTap(e, `n:${d.id}`)) startEdit(d.id);
          // порядок наложения (z) сохраняем без записи в историю
          save();
        }
        break;
      }
      case 'resize': {
        if (d.moved) { pushHistory(d.snap); renderAll(); save(); }
        break;
      }
      case 'link': {
        const el = d.over && noteEls.get(d.over);
        if (el) el.classList.remove('link-target');
        if (d.moved) {
          const target = noteAtPoint(e.clientX, e.clientY, d.from);
          tempLink = null;
          if (target) addLink(d.from, target);
          else renderLinks();
        } else {
          // клик по булавке: ждём вторую заметку
          linkSource = d.from;
          const se = noteEls.get(d.from);
          if (se) se.classList.add('link-source');
          selectOnly(d.from);
          renderLinks();
        }
        break;
      }
      case 'pan': {
        if (!d.moved) {
          if (selected.size || selectedLink) selectOnly();
          if (Date.now() - lastLongPress > 700 && registerTap(e, 'board')) {
            const w = screenToWorld(e.clientX, e.clientY);
            addNote({ x: w.x - NOTE_W / 2, y: w.y - 24 });
          }
        }
        save();
        break;
      }
      case 'box': {
        selectBox.style.display = 'none';
        refreshSelection();
        break;
      }
      default: break;
    }
  }
  window.addEventListener('pointerup', endPointer);
  window.addEventListener('pointercancel', endPointer);

  viewport.addEventListener('contextmenu', (e) => {
    if (e.target.closest('textarea')) return;
    e.preventDefault();
    if (Date.now() - lastLongPress < 900) return;
    if (drag && drag.snap && drag.moved) pushHistory(drag.snap);
    drag = null;
    const noteEl = e.target.closest('.note');
    if (noteEl) {
      const id = noteEl.dataset.id;
      if (!selected.has(id)) selectOnly(id);
      openNoteMenu([...selected], { x: e.clientX, y: e.clientY });
      return;
    }
    const hit = e.target.closest('.link-hit, .link-label');
    if (hit) { selectLink(hit.dataset.id); return; }
    menuPoint = screenToWorld(e.clientX, e.clientY);
    openPopover(boardMenuHTML(true), { x: e.clientX, y: e.clientY });
  });

  viewport.addEventListener('wheel', (e) => {
    const scroller = e.target.closest('.note-body, .note-edit');
    if (scroller && !e.ctrlKey && !e.metaKey && scroller.scrollHeight > scroller.clientHeight + 1) {
      const atTop = scroller.scrollTop <= 0 && e.deltaY < 0;
      const atBottom = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1 && e.deltaY > 0;
      if (!atTop && !atBottom) return;
    }
    e.preventDefault();
    const isMouseWheel = e.deltaMode === 1 || (e.deltaX === 0 && Math.abs(e.deltaY) >= 50 && Number.isInteger(e.deltaY));
    if (e.ctrlKey || e.metaKey) {
      zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.01));
    } else if (isMouseWheel && !e.shiftKey) {
      const dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
      zoomAt(e.clientX, e.clientY, Math.exp(-dy * 0.0016));
    } else {
      const v = board().view;
      v.x -= e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX;
      v.y -= e.shiftKey && !e.deltaX ? 0 : e.deltaY;
      applyView();
    }
  }, { passive: false });

  // Safari: жест щипка на трекпаде
  let gestureZ = 1;
  viewport.addEventListener('gesturestart', (e) => { e.preventDefault(); gestureZ = 1; });
  viewport.addEventListener('gesturechange', (e) => {
    e.preventDefault();
    zoomAt(e.clientX, e.clientY, e.scale / gestureZ);
    gestureZ = e.scale;
  });

  /* ================= search & filter ================= */
  function setQuery(q) {
    query = q;
    searchCursor = -1;
    const inp = $('#search');
    if (inp.value !== q) inp.value = q;
    if (q && innerWidth <= 860) document.body.classList.add('search-open');
    renderAll();
  }
  function setFilter(f) {
    filter = f;
    $$('#filter button').forEach((b) => b.classList.toggle('on', b.dataset.filter === f));
    renderAll();
    if (f !== 'all') {
      const count = board().notes.filter(matches).length;
      toast(f === 'done' ? `Выполненных: ${count}` : `В работе: ${count}`);
    }
  }
  function nextMatch(dir = 1) {
    const list = board().notes.filter(matches).sort((a, c) => (a.y - c.y) || (a.x - c.x));
    if (!list.length) return;
    searchCursor = (searchCursor + dir + list.length) % list.length;
    const n = list[searchCursor];
    centerOn(n);
    selectOnly(n.id);
    flashClass(n.id, 'flash', 900);
  }

  /* ================= export / import / share ================= */
  function download(name, blob) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  const safeName = (s) => s.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'доска';

  function exportJSON() {
    const b = board();
    const data = { app: 'probka-board', v: 1, exported: new Date().toISOString(), board: { name: b.name, notes: b.notes, links: b.links } };
    download(`${safeName(b.name)}.json`, new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    toast('Файл доски скачан');
  }

  function importData(data) {
    let raws = [];
    if (data && Array.isArray(data.boards)) raws = data.boards;
    else if (data && data.board) raws = [data.board];
    else if (data && Array.isArray(data.notes)) raws = [data];
    if (!raws.length) throw new Error('bad format');
    const added = raws.map((r) => normalizeBoard(r));
    added.forEach((b) => {
      if (state.boards.some((x) => x.name === b.name)) b.name += ' (копия)';
      state.boards.push(b);
    });
    switchBoard(added[0].id);
    fitAll(false);
    return added;
  }

  function importJSONFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const added = importData(JSON.parse(reader.result));
        toast(added.length > 1 ? `Загружено досок: ${added.length}` : `Доска «${added[0].name}» загружена`);
      } catch (err) {
        toast('Не получилось прочитать файл — это точно файл доски?');
      }
    };
    reader.readAsText(file);
  }

  const b64url = (bytes) => {
    let s = '';
    const arr = new Uint8Array(bytes);
    for (let i = 0; i < arr.length; i += 0x8000) s += String.fromCharCode.apply(null, arr.subarray(i, i + 0x8000));
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };
  const fromB64url = (str) => {
    const s = atob(str.replace(/-/g, '+').replace(/_/g, '/'));
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  };

  async function encodeBoard(b) {
    const json = JSON.stringify({ name: b.name, notes: b.notes, links: b.links });
    if ('CompressionStream' in window) {
      try {
        const stream = new Blob([json]).stream().pipeThrough(new CompressionStream('deflate-raw'));
        return `z${b64url(await new Response(stream).arrayBuffer())}`;
      } catch (err) { /* fallback ниже */ }
    }
    return `j${b64url(new TextEncoder().encode(json))}`;
  }
  async function decodeBoard(str) {
    const kind = str[0], bytes = fromB64url(str.slice(1));
    if (kind === 'z') {
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return JSON.parse(await new Response(stream).text());
    }
    return JSON.parse(new TextDecoder().decode(bytes));
  }

  async function shareLink() {
    const b = board();
    if (!b.notes.length) { toast('На доске пока нечем делиться'); return; }
    const code = await encodeBoard(b);
    const url = `${location.origin}${location.pathname}#share=${code}`;
    if (url.length > 60000) toast('Доска очень большая — ссылка может не открыться. Лучше скачать файл.');
    try {
      if (navigator.share && matchMedia('(pointer: coarse)').matches) {
        await navigator.share({ title: `Доска «${b.name}»`, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      toast('Ссылка на доску скопирована — отправь её кому угодно');
    } catch (err) {
      if (err && err.name === 'AbortError') return;
      await dialog({ title: 'Ссылка на доску', text: 'Скопируй ссылку вручную:', input: url, ok: 'Готово', cancel: 'Закрыть' });
    }
  }

  async function checkShareHash() {
    const m = location.hash.match(/^#share=(.+)$/);
    if (!m) return;
    history.replaceState(null, '', location.pathname + location.search);
    try {
      const data = await decodeBoard(m[1]);
      const ok = await dialog({
        title: `Открыть доску «${data.name || 'Доска'}»?`,
        text: `С тобой поделились доской (${(data.notes || []).length} ${plural((data.notes || []).length, 'заметка', 'заметки', 'заметок')}). Она добавится к твоим доскам — твои данные не пострадают.`,
        ok: 'Открыть',
      });
      if (ok) { const added = importData(data); toast(`Доска «${added[0].name}» добавлена`); }
    } catch (err) {
      toast('Ссылка на доску повреждена');
    }
  }

  async function exportPNG() {
    const b = board();
    if (!b.notes.length) { toast('Доска пустая — нечего сохранять'); return; }
    if (state.settings.hand && document.fonts) { try { await document.fonts.load('500 23px Caveat'); } catch (err) { /* ok */ } }
    const pad = 70;
    const bb = bbox(b.notes);
    const W = bb.w + pad * 2, H = bb.h + pad * 2;
    const scale = clamp(Math.min(2, 8000 / W, 8000 / H), 0.3, 2);
    const cv = document.createElement('canvas');
    cv.width = Math.round(W * scale);
    cv.height = Math.round(H * scale);
    const ctx = cv.getContext('2d');
    ctx.scale(scale, scale);
    ctx.translate(pad - bb.x, pad - bb.y);
    const theme = THEMES.find((t) => t.id === state.settings.theme) || THEMES[0];
    ctx.fillStyle = theme.bg;
    ctx.fillRect(bb.x - pad, bb.y - pad, W, H);
    // лёгкая фактура
    const rnd = (s) => { const x = Math.sin(s) * 10000; return x - Math.floor(x); };
    ctx.fillStyle = ['chalk', 'night'].includes(theme.id) ? 'rgba(255,255,255,.05)' : 'rgba(80,45,10,.12)';
    for (let i = 0; i < (W * H) / 900; i++) ctx.fillRect(bb.x - pad + rnd(i) * W, bb.y - pad + rnd(i + 0.5) * H, 1.6, 1.6);

    const byId = new Map(b.notes.map((n) => [n.id, n]));
    const drawLinks = () => {
      for (const l of b.links) {
        const A = byId.get(l.from), B = byId.get(l.to);
        if (!A || !B) continue;
        const a = anchorOf(A), c = anchorOf(B);
        const dist = Math.hypot(c.x - a.x, c.y - a.y);
        const cp = { x: (a.x + c.x) / 2, y: (a.y + c.y) / 2 + (l.straight ? 0 : Math.min(130, 16 + dist * 0.2)) };
        ctx.lineCap = 'round';
        ctx.strokeStyle = 'rgba(0,0,0,.2)';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(a.x + 2, a.y + 5); ctx.quadraticCurveTo(cp.x + 2, cp.y + 5, c.x + 2, c.y + 5); ctx.stroke();
        ctx.strokeStyle = l.color;
        ctx.lineWidth = 2.6;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo(cp.x, cp.y, c.x, c.y); ctx.stroke();
        if (l.label) {
          const mx = (a.x + 2 * cp.x + c.x) / 4, my = (a.y + 2 * cp.y + c.y) / 4;
          ctx.font = '700 13px Nunito, sans-serif';
          const w = ctx.measureText(l.label).width + 20;
          ctx.fillStyle = '#fffdf5';
          ctx.fillRect(mx - w / 2, my - 12, w, 24);
          ctx.fillStyle = '#3a332c';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(l.label, mx, my);
          ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
        }
      }
    };
    const wrap = (text, maxW) => {
      const out = [];
      for (const para of text.split('\n')) {
        if (!para) { out.push(''); continue; }
        let line = '';
        for (const word of para.split(' ')) {
          const test = line ? `${line} ${word}` : word;
          if (ctx.measureText(test).width > maxW && line) { out.push(line); line = word; }
          else line = test;
        }
        out.push(line);
      }
      return out;
    };
    if (!state.settings.stringsOver) drawLinks();
    const fontSize = state.settings.hand ? 23 : 15;
    const lineH = state.settings.hand ? 26 : 20;
    const font = state.settings.hand ? `500 ${fontSize}px Caveat, cursive` : `${fontSize}px Nunito, sans-serif`;
    for (const n of [...b.notes].sort((a, c) => a.z - c.z)) {
      ctx.save();
      ctx.translate(n.x + n.w / 2, n.y + n.h / 2);
      ctx.rotate(((state.settings.tilt ? n.rot : 0) * Math.PI) / 180);
      ctx.translate(-n.w / 2, -n.h / 2);
      ctx.shadowColor = 'rgba(0,0,0,.3)';
      ctx.shadowBlur = 16;
      ctx.shadowOffsetY = 8;
      ctx.fillStyle = colorHex(n.color);
      ctx.fillRect(0, 0, n.w, n.h);
      ctx.shadowColor = 'transparent';
      const grd = ctx.createLinearGradient(0, 0, 0, n.h * 0.5);
      grd.addColorStop(0, 'rgba(255,255,255,.35)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, n.w, n.h);
      ctx.save();
      ctx.beginPath(); ctx.rect(10, 10, n.w - 20, n.h - 20); ctx.clip();
      ctx.font = font;
      ctx.fillStyle = n.done ? 'rgba(42,37,32,.5)' : '#2a2520';
      const lines = wrap(plainText(n.text), n.w - 28);
      lines.forEach((ln, i) => ctx.fillText(ln, 14, 40 + i * lineH));
      ctx.restore();
      if (n.done) {
        ctx.save();
        ctx.translate(n.w - 56, n.h - 58);
        ctx.rotate(-0.28);
        ctx.strokeStyle = 'rgba(31,157,85,.85)';
        ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(0, 0, 40, 0, Math.PI * 2); ctx.stroke();
        ctx.lineWidth = 9; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.beginPath(); ctx.moveTo(-20, 1); ctx.lineTo(-6, 15); ctx.lineTo(22, -16); ctx.stroke();
        ctx.restore();
      }
      // булавка
      ctx.fillStyle = '#e53935';
      ctx.beginPath(); ctx.arc(n.w / 2, 0, 8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.5)';
      ctx.beginPath(); ctx.arc(n.w / 2 - 2.5, -2.5, 2.5, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    if (state.settings.stringsOver) drawLinks();
    cv.toBlob((blob) => {
      if (!blob) { toast('Не удалось создать картинку'); return; }
      download(`${safeName(b.name)}.png`, blob);
      toast('Картинка сохранена');
    }, 'image/png');
  }

  /* ================= clipboard ================= */
  function copySelection(e) {
    const b = board();
    const notes = b.notes.filter((n) => selected.has(n.id));
    if (!notes.length) return false;
    const links = b.links.filter((l) => selected.has(l.from) && selected.has(l.to));
    const payload = CLIP_MARK + JSON.stringify({ notes, links });
    if (e && e.clipboardData) { e.clipboardData.setData('text/plain', payload); e.preventDefault(); }
    return notes.length;
  }
  const inField = (el) => el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);

  document.addEventListener('copy', (e) => {
    if (inField(document.activeElement)) return;
    const n = copySelection(e);
    if (n) toast(n > 1 ? `Скопировано ${n} ${plural(n, 'заметка', 'заметки', 'заметок')}` : 'Заметка скопирована');
  });
  document.addEventListener('cut', (e) => {
    if (inField(document.activeElement)) return;
    if (copySelection(e)) deleteNotes([...selected]);
  });
  document.addEventListener('paste', (e) => {
    if (inField(document.activeElement)) return;
    const text = (e.clipboardData && e.clipboardData.getData('text/plain')) || '';
    if (!text.trim()) return;
    e.preventDefault();
    if (text.startsWith(CLIP_MARK)) {
      try {
        const data = JSON.parse(text.slice(CLIP_MARK.length));
        const notes = data.notes || [];
        if (!notes.length) return;
        const bb = bbox(notes);
        const c = lastPointerWorld || viewCenterWorld();
        insertNotes(notes, data.links || [], { x: c.x - (bb.x + bb.w / 2), y: c.y - (bb.y + bb.h / 2) });
        sound('pop');
      } catch (err) { /* ignore */ }
      return;
    }
    const c = lastPointerWorld || viewCenterWorld();
    addNote({ x: c.x - NOTE_W / 2, y: c.y - NOTE_H / 2, text: text.trim().slice(0, 5000), edit: false });
  });
  let lastPointerWorld = null;
  viewport.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse') lastPointerWorld = screenToWorld(e.clientX, e.clientY);
  });
  viewport.addEventListener('pointerleave', () => { lastPointerWorld = null; });

  /* ================= keyboard ================= */
  let lastNudge = 0;
  document.addEventListener('keydown', (e) => {
    const helpOpen = !$('#help-modal').hidden;
    if (helpOpen) {
      if (e.key === 'Escape' || e.key === '?') { e.preventDefault(); $('#help-modal').hidden = true; }
      return;
    }
    if (!$('#dialog').hidden) return;
    const target = e.target;
    if (target.id === 'search') {
      if (e.key === 'Enter') { e.preventDefault(); nextMatch(e.shiftKey ? -1 : 1); }
      if (e.key === 'Escape') { setQuery(''); target.blur(); document.body.classList.remove('search-open'); }
      return;
    }
    if (target.id === 'link-label') {
      if (e.key === 'Enter' || e.key === 'Escape') target.blur();
      return;
    }
    if (inField(target)) return;

    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    const sel = [...selected];

    if (mod && (key === 'z' || key === 'я')) { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
    if (mod && (key === 'y' || key === 'н')) { e.preventDefault(); redo(); return; }
    if (mod && (key === 'a' || key === 'ф')) { e.preventDefault(); selectAll(); return; }
    if (mod && (key === 'd' || key === 'в')) { e.preventDefault(); if (sel.length) duplicate(sel); return; }
    if (mod && (key === 'f' || key === 'а')) { e.preventDefault(); focusSearch(); return; }
    if (mod) return;

    if (e.key === 'Escape') {
      closePopover();
      if (linkSource) cancelPendingLink();
      else if (linkMode) toggleLinkMode(false);
      else if (selected.size || selectedLink) selectOnly();
      else if (query) setQuery('');
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      if (selectedLink) deleteLink(selectedLink);
      else if (sel.length) deleteNotes(sel);
      return;
    }
    if (e.key.startsWith('Arrow') && sel.length) {
      e.preventDefault();
      const step = e.shiftKey ? 40 : 8;
      const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
      const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
      const now = Date.now();
      if (now - lastNudge > 800) pushHistory();
      lastNudge = now;
      sel.map(getNote).filter((n) => n && !n.locked).forEach((n) => { n.x += dx; n.y += dy; placeNote(n); });
      scheduleLinks();
      save();
      return;
    }
    if (e.key === 'Enter' && sel.length === 1) { e.preventDefault(); startEdit(sel[0]); return; }
    if (e.key === '?' || (e.shiftKey && e.code === 'Slash')) { e.preventDefault(); openHelp(); return; }
    if (e.key === '/' || e.code === 'Slash') { e.preventDefault(); focusSearch(); return; }
    if (e.key === '+' || e.key === '=') { zoomCenter(1.2); return; }
    if (e.key === '-' || e.key === '_') { zoomCenter(1 / 1.2); return; }
    if (e.key === '0') { resetZoom(); return; }
    if (/^[1-7]$/.test(e.key)) {
      const c = COLORS[+e.key - 1].id;
      if (sel.length) setColor(sel, c);
      else setNewColor(c);
      return;
    }
    switch (e.code) {
      case 'KeyN': e.preventDefault(); addNote(); break;
      case 'KeyL': toggleLinkMode(); break;
      case 'KeyF': fitAll(true); break;
      case 'KeyD': if (sel.length) toggleDone(sel); break;
      default: break;
    }
  });

  function focusSearch() {
    document.body.classList.add('search-open');
    const inp = $('#search');
    inp.focus();
    inp.select();
  }
  function resetZoom() {
    const r = vpRect(), v = board().view;
    const c = screenToWorld(r.left + r.width / 2, r.top + r.height / 2);
    animateView({ z: 1, x: r.width / 2 - c.x, y: r.height / 2 - c.y });
  }
  function openHelp() { closePopover(); $('#help-modal').hidden = false; }
  function setNewColor(c) {
    state.newColor = c;
    applySettings();
    save();
  }

  /* ================= click actions ================= */
  const actions = {
    'note-color': (el) => { setColor(menuTargets, el.dataset.color); closePopover(); },
    'note-done': () => { closePopover(); toggleDone(menuTargets); },
    'note-edit': () => { closePopover(); startEdit(menuTargets[0]); },
    'note-priority': (el) => { setPriority(menuTargets, +el.dataset.p); closePopover(); },
    'note-due-clear': () => { setDue(menuTargets, null); closePopover(); },
    'note-lock': () => { closePopover(); toggleLock(menuTargets); },
    'note-dup': () => { closePopover(); duplicate(menuTargets); },
    'note-front': () => { closePopover(); bringToFront(menuTargets); },
    'note-link': () => {
      closePopover();
      const id = menuTargets[0];
      const n = getNote(id);
      if (!n) return;
      linkSource = id;
      tempLink = { a: anchorOf(n), b: anchorOf(n) };
      updateNoteEl(n);
      toast('Теперь кликни по заметке, к которой протянуть нить');
    },
    'note-unlink': () => { closePopover(); unlinkNotes(menuTargets); },
    'note-delete': () => { closePopover(); deleteNotes(menuTargets); },
    'add-here': () => { closePopover(); if (menuPoint) addNote({ x: menuPoint.x - NOTE_W / 2, y: menuPoint.y - 24 }); },
    'select-all': () => { closePopover(); selectAll(); },
    arrange: () => { closePopover(); arrange(); },
    fit: () => { closePopover(); fitAll(true); },
    'clear-done': () => { closePopover(); clearDone(); },
    'export-png': () => { closePopover(); exportPNG(); },
    'export-json': () => { closePopover(); exportJSON(); },
    'import-json': () => { closePopover(); $('#file-input').click(); },
    share: () => { closePopover(); shareLink(); },
    help: () => openHelp(),
    'close-modal': () => { $('#help-modal').hidden = true; },
    toggle: (el) => {
      const k = el.dataset.key;
      state.settings[k] = !state.settings[k];
      el.classList.toggle('on', state.settings[k]);
      applySettings();
      renderAll();
      save();
      if (k === 'sound' && state.settings.sound) sound('tick');
    },
    theme: (el) => {
      state.settings.theme = el.dataset.theme;
      $$('.theme-card').forEach((c) => c.classList.toggle('on', c === el));
      applySettings();
      scheduleMinimap();
      save();
    },
    'new-color': (el) => { setNewColor(el.dataset.color); closePopover(); },
    filter: (el) => { closePopover(); setFilter(el.dataset.filter); },
    'goto-overdue': () => {
      closePopover();
      const today = isoDate(0);
      const n = board().notes.find((x) => !x.done && x.due && x.due < today);
      if (n) { centerOn(n); selectOnly(n.id); flashClass(n.id, 'flash', 900); }
    },
    'board-open': (el) => { closePopover(); switchBoard(el.dataset.id); },
    'board-rename': (el) => { closePopover(); renameBoard(el.dataset.id); },
    'board-delete': (el) => { closePopover(); deleteBoard(el.dataset.id); },
    'board-new': () => { closePopover(); newBoard(); },
    'zoom-in': () => zoomCenter(1.25),
    'zoom-out': () => zoomCenter(1 / 1.25),
    'zoom-reset': () => resetZoom(),
    'sel-done': () => toggleDone([...selected]),
    'sel-color': (el) => setColor([...selected], el.dataset.color),
    'sel-chain': () => chainLink([...selected]),
    'sel-dup': () => duplicate([...selected]),
    'sel-delete': () => deleteNotes([...selected]),
    'link-color': (el) => {
      const l = board().links.find((x) => x.id === selectedLink);
      if (!l) return;
      state.stringColor = el.dataset.lcolor;
      mutate(() => { l.color = el.dataset.lcolor; });
      $$('#link-swatches .sw').forEach((s) => s.classList.toggle('on', s === el));
    },
    'link-style': () => {
      const l = board().links.find((x) => x.id === selectedLink);
      if (!l) return;
      mutate(() => { l.straight = !l.straight; });
      $('#link-style-btn use').setAttribute('href', l.straight ? '#i-straight' : '#i-curve');
    },
    'link-delete': () => { if (selectedLink) deleteLink(selectedLink); },
  };

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || !actions[el.dataset.act]) return;
    e.preventDefault();
    actions[el.dataset.act](el, e);
  });
  document.addEventListener('change', (e) => {
    if (e.target.dataset.change === 'note-due') {
      setDue(menuTargets, e.target.value);
      closePopover();
    }
  });

  /* ================= header wiring ================= */
  function wireHeader() {
    $('#add-btn').addEventListener('click', () => addNote());
    $('#color-btn').addEventListener('click', (e) => togglePopover(e.currentTarget, () =>
      `<div class="pop-title">Цвет новой заметки</div><div class="pop-swatches">${swatchesHTML('new-color', state.newColor)}</div>`));
    $('#link-btn').addEventListener('click', () => toggleLinkMode());
    $('#undo-btn').addEventListener('click', undo);
    $('#redo-btn').addEventListener('click', redo);
    $$('#filter button').forEach((b) => b.addEventListener('click', () => setFilter(b.dataset.filter)));
    $('#search').addEventListener('input', (e) => setQuery(e.target.value.trim()));
    $('#search').addEventListener('blur', () => { if (!query) document.body.classList.remove('search-open'); });
    $('#search-toggle').addEventListener('click', () => {
      if (document.body.classList.contains('search-open')) { document.body.classList.remove('search-open'); setQuery(''); }
      else focusSearch();
    });
    $('#board-btn').addEventListener('click', (e) => togglePopover(e.currentTarget, () => boardMenuHTML(false)));
    $('#board-btn').addEventListener('dblclick', () => { closePopover(); renameBoard(); });
    $('#theme-btn').addEventListener('click', (e) => togglePopover(e.currentTarget, themeMenuHTML, { align: 'end' }));
    $('#more-btn').addEventListener('click', (e) => togglePopover(e.currentTarget, moreMenuHTML, { align: 'end', cls: 'more-menu' }));
    $('#progress').addEventListener('click', (e) => togglePopover(e.currentTarget, statsHTML, { align: 'end' }));
    $('#file-input').addEventListener('change', (e) => {
      const f = e.target.files[0];
      if (f) importJSONFile(f);
      e.target.value = '';
    });

    $('#sel-swatches').innerHTML = COLORS.map((c) => `<button class="sw round" data-act="sel-color" data-color="${c.id}" style="--c:${c.hex}" title="${c.name}"></button>`).join('');
    $('#link-swatches').innerHTML = STRING_COLORS.map((c) => `<button class="sw round" data-act="link-color" data-lcolor="${c}" style="--c:${c}"></button>`).join('');

    let labelSnap = null;
    const label = $('#link-label');
    label.addEventListener('focus', () => { labelSnap = snapshot(); });
    label.addEventListener('input', () => {
      const l = board().links.find((x) => x.id === selectedLink);
      if (!l) return;
      l.label = label.value.slice(0, 40);
      renderLinks();
      save();
    });
    label.addEventListener('blur', () => {
      if (labelSnap && labelSnap !== snapshot()) pushHistory(labelSnap);
      labelSnap = null;
    });

    // файлы можно просто перетащить на доску
    viewport.addEventListener('dragover', (e) => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) e.preventDefault(); });
    viewport.addEventListener('drop', (e) => {
      const f = e.dataTransfer && e.dataTransfer.files[0];
      if (!f) return;
      e.preventDefault();
      if (/json/.test(f.type) || f.name.endsWith('.json')) importJSONFile(f);
      else if (f.type.startsWith('text/')) {
        f.text().then((txt) => {
          const w = screenToWorld(e.clientX, e.clientY);
          addNote({ x: w.x - NOTE_W / 2, y: w.y - 24, text: txt.slice(0, 5000), edit: false });
        });
      }
    });
  }

  // стиль для блока фильтра в меню на мобильных
  const styleSm = document.createElement('style');
  styleSm.textContent = '.show-sm-block{display:none}@media (max-width:860px){.show-sm-block{display:block}}';
  document.head.appendChild(styleSm);

  /* ================= init ================= */
  function init() {
    state = load();
    applySettings();
    wireHeader();
    updateHistoryButtons();
    const b = board();
    fullRender();
    if (!b.view) { b.view = { x: 0, y: 0, z: 1 }; fitAll(false); }
    applyView();
    requestAnimationFrame(() => requestAnimationFrame(() => document.body.classList.remove('no-anim')));

    addEventListener('resize', () => { positionLinkBar(); scheduleMinimap(); });
    addEventListener('beforeunload', saveNow);
    document.addEventListener('visibilitychange', () => { if (document.hidden) saveNow(); });
    // синхронизация между вкладками
    addEventListener('storage', (e) => {
      if (e.key !== STORAGE_KEY || !e.newValue || editingId || drag) return;
      try {
        const cur = state.currentId;
        state = load();
        if (state.boards.some((x) => x.id === cur)) state.currentId = cur;
        applySettings();
        fullRender();
        applyView();
      } catch (err) { /* ignore */ }
    });
    // раз в минуту обновляем «Сегодня/Завтра/просрочено»
    setInterval(() => { for (const el of noteEls.values()) el._meta = null; syncNotes(); }, 60000);

    checkShareHash();

    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }

  init();
})();
