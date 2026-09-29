// 献立の1品を選ぶボトムシート（週の献立で料理をタップしたとき）

import * as store from '../store.js';
import { esc } from '../lib/util.js';
import { closeSheet, icon, openSheet } from '../lib/ui.js';

/**
 * @param {object} opts
 * @param {string} opts.title
 * @param {string} opts.category '主菜' | '副菜' | '汁物'
 * @param {string|null} opts.currentId
 * @param {(id: string) => void} opts.onPick
 * @param {() => void} opts.onRandom
 */
export function openRecipePicker({ title, category, currentId, onPick, onRandom }) {
  const recipes = store
    .allRecipes()
    .filter((r) => r.category === category)
    .sort((a, b) => Number(b.fav) - Number(a.fav));

  const items = recipes
    .map((r) => `
      <li>
        <button class="picker-item ${r.id === currentId ? 'current' : ''}" data-pick="${esc(r.id)}" data-name="${esc(r.name)}">
          <span class="picker-name"><span class="inline-emoji" aria-hidden="true">${esc(r.emoji)}</span>${r.fav ? `<span class="fav-mark">${icon('star', { filled: true, size: 14 })}</span>` : ''}${esc(r.name)}</span>
          <span class="picker-meta">${esc(r.cuisine)}・${esc(r.main)}・${esc(r.time)}分</span>
          ${r.id === currentId ? `<span class="picker-check">${icon('check', { size: 18 })}</span>` : ''}
        </button>
      </li>`)
    .join('');

  openSheet({
    title,
    body: `
      <button class="btn btn-primary btn-block" data-random>${icon('reroll', { size: 18 })}おまかせで選び直す</button>
      <div class="search-box in-sheet">
        ${icon('search', { size: 18 })}
        <input type="search" class="search-input" placeholder="${esc(category)}を検索" aria-label="${esc(category)}を検索">
      </div>
      <ul class="picker-list">${items}</ul>`,
    onMount(sheet) {
      sheet.querySelector('[data-random]').addEventListener('click', () => {
        closeSheet();
        onRandom();
      });
      sheet.querySelector('.picker-list').addEventListener('click', (e) => {
        const btn = e.target.closest('[data-pick]');
        if (!btn) return;
        closeSheet();
        onPick(btn.dataset.pick);
      });
      sheet.querySelector('.search-input').addEventListener('input', (e) => {
        const q = e.target.value.trim();
        sheet.querySelectorAll('[data-pick]').forEach((btn) => {
          btn.parentElement.hidden = q !== '' && !btn.dataset.name.includes(q);
        });
      });
    },
  });
}
