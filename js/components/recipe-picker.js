// 献立の1品を選ぶボトムシート（週の献立で料理をタップしたとき）

import * as store from '../store.js';
import { esc } from '../lib/util.js';
import { closeSheet, icon, openSheet, stars } from '../lib/ui.js';
import { mealPool } from '../meals.js';

/**
 * @param {object} opts
 * @param {string} opts.title
 * @param {string} opts.category 表示用の枠の名前（'主菜' など）
 * @param {string} [opts.meal] 食事（'dinner' など）。slot と一緒に渡すとその枠に合うレシピだけを出す
 * @param {string} [opts.slot] 枠（'main' など）
 * @param {string|null} opts.currentId
 * @param {(id: string) => void} opts.onPick
 * @param {() => void} opts.onRandom
 * @param {boolean} [opts.locked] この料理が固定されているか
 * @param {() => boolean} [opts.onToggleLock] 固定の切り替え（新しい状態を返す）。なければ固定の欄を出さない
 */
export function openRecipePicker({ title, category, meal, slot, currentId, onPick, onRandom, locked = false, onToggleLock }) {
  const all = store.allRecipes();
  const pool = meal && slot ? mealPool(all, meal, slot) : all.filter((r) => r.category === category);
  const recipes = pool
    .slice()
    .sort((a, b) => Number(b.fav) - Number(a.fav) || b.rating - a.rating); // お気に入り → 評価の高い順

  const items = recipes
    .map((r) => `
      <li>
        <button class="picker-item ${r.id === currentId ? 'current' : ''}" data-pick="${esc(r.id)}" data-name="${esc(r.name)}">
          <span class="picker-name"><span class="inline-emoji" aria-hidden="true">${esc(r.emoji)}</span>${r.fav ? `<span class="fav-mark">${icon('star', { filled: true, size: 14 })}</span>` : ''}${esc(r.name)}${stars(r.rating, { size: 12 })}</span>
          <span class="picker-meta">${esc(r.cuisine)}・${esc(r.main)}・${esc(r.time)}分${r.kcal ? `・${esc(r.kcal)}kcal` : ''}</span>
          ${r.id === currentId ? `<span class="picker-check">${icon('check', { size: 18 })}</span>` : ''}
        </button>
      </li>`)
    .join('');

  openSheet({
    title,
    body: `
      ${onToggleLock ? `
        <label class="switch-row lock-row">
          <span class="switch-text"><b>${icon('lock', { size: 16 })}この${esc(category)}を固定する</b><small>固定すると「作り直す」や条件の変更でも変わりません</small></span>
          <input type="checkbox" name="lockDish" role="switch" ${locked ? 'checked' : ''}>
          <span class="switch" aria-hidden="true"></span>
        </label>` : ''}
      <button class="btn btn-primary btn-block" data-random ${locked ? 'disabled' : ''}>${icon('reroll', { size: 18 })}${locked ? '固定中のためおまかせ不可' : 'おまかせで選び直す'}</button>
      <div class="search-box in-sheet">
        ${icon('search', { size: 18 })}
        <input type="search" class="search-input" placeholder="${esc(category)}を検索" aria-label="${esc(category)}を検索">
      </div>
      <ul class="picker-list">${items}</ul>`,
    onMount(sheet) {
      sheet.querySelector('input[name=lockDish]')?.addEventListener('change', (e) => {
        const on = onToggleLock();
        e.target.checked = on;
        const random = sheet.querySelector('[data-random]');
        random.disabled = on;
        random.innerHTML = `${icon('reroll', { size: 18 })}${on ? '固定中のためおまかせ不可' : 'おまかせで選び直す'}`;
      });
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
