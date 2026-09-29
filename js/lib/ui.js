// ボトムシート・トースト・アイコンなど共通UI部品

import { esc } from './util.js';

// ---- アイコン（インラインSVG） ----
const ICON_PATHS = {
  reroll: '<path d="M20 11a8 8 0 0 0-14.6-4.5L4 8"/><path d="M4 3v5h5"/><path d="M4 13a8 8 0 0 0 14.6 4.5L20 16"/><path d="M20 21v-5h-5"/>',
  swap: '<path d="M7 4v16"/><path d="M3 8l4-4 4 4"/><path d="M17 20V4"/><path d="M13 16l4 4 4-4"/>',
  star: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9 6.8 19.6l1-5.8-4.3-4.1 5.9-.9z"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  trash: '<path d="M4 7h16"/><path d="M9 7V4.5h6V7"/><path d="M6.5 7l1 13h9l1-13"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4 4"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  chevron: '<path d="M9 6l6 6-6 6"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  fridge: '<rect x="5.5" y="2.5" width="13" height="19" rx="2.5"/><path d="M5.5 9.5h13M9 5.5v2M9 12.5v3"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
};

export function icon(name, { filled = false, size = 22 } = {}) {
  const fill = filled ? 'currentColor' : 'none';
  return `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="${fill}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[name] || ''}</svg>`;
}

// ---- 星評価 ----

/** 読み取り専用の星（未評価なら空文字） */
export function stars(rating, { size = 13, showEmpty = false } = {}) {
  const n = Number(rating) || 0;
  if (!n && !showEmpty) return '';
  const items = [1, 2, 3, 4, 5].map((i) => `<span class="star ${i <= n ? 'on' : ''}">${icon('star', { filled: i <= n, size })}</span>`).join('');
  return `<span class="stars" role="img" aria-label="${n ? `星${n}つ` : '未評価'}" data-rating="${n}">${items}</span>`;
}

/** タップで評価できる星（data-rate="1〜5"） */
export function starInput(rating, { size = 30 } = {}) {
  const n = Number(rating) || 0;
  return `<div class="star-input" role="radiogroup" aria-label="星評価">${[1, 2, 3, 4, 5]
    .map((i) => `<button type="button" class="star-btn ${i <= n ? 'on' : ''}" data-rate="${i}" role="radio" aria-checked="${i === n}" aria-label="星${i}つ">${icon('star', { filled: i <= n, size })}</button>`)
    .join('')}</div>`;
}

// ---- カテゴリ表示 ----
const CATEGORY_CLASS = { 主菜: 'cat-main', 副菜: 'cat-side', 汁物: 'cat-soup' };

export function categoryBadge(category) {
  return `<span class="badge ${CATEGORY_CLASS[category] || ''}">${esc(category)}</span>`;
}

export function categoryClass(category) {
  return CATEGORY_CLASS[category] || '';
}

// ---- ボトムシート ----
let sheetOnClose = null;

/**
 * ボトムシートを開く。
 * @param {object} opts
 * @param {string} opts.title
 * @param {string} opts.body  HTML文字列
 * @param {(el: HTMLElement) => void} [opts.onMount] 表示後にイベント登録などを行う
 * @param {() => void} [opts.onClose]
 */
export function openSheet({ title, body, onMount, onClose }) {
  closeSheet();
  const root = document.getElementById('sheet-root');
  root.innerHTML = `
    <div class="sheet-backdrop" data-close></div>
    <section class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="sheet-handle"></div>
      <header class="sheet-header">
        <h2>${esc(title)}</h2>
        <button class="icon-btn" data-close aria-label="閉じる">${icon('close')}</button>
      </header>
      <div class="sheet-body">${body}</div>
    </section>`;
  root.classList.add('open');
  document.body.classList.add('sheet-open');
  root.querySelectorAll('[data-close]').forEach((el) => el.addEventListener('click', closeSheet));
  sheetOnClose = onClose || null;
  onMount?.(root.querySelector('.sheet'));
}

export function closeSheet() {
  const root = document.getElementById('sheet-root');
  if (!root || !root.classList.contains('open')) return;
  root.classList.remove('open');
  root.innerHTML = '';
  document.body.classList.remove('sheet-open');
  const cb = sheetOnClose;
  sheetOnClose = null;
  cb?.();
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeSheet();
});

// ---- トースト ----
let toastTimer = null;

export function toast(message) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
}
