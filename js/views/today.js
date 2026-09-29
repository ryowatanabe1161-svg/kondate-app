// 画面1：今日の献立

import * as actions from '../actions.js';
import { SLOTS } from '../planner.js';
import { esc, formatDateLong, todayKey } from '../lib/util.js';
import { categoryClass, icon, toast } from '../lib/ui.js';
import { openRecipeDetail } from '../components/recipe-detail.js';
import { openSettingsSheet } from '../components/settings-sheet.js';
import { getServings } from '../store.js';

let flashSlots = []; // 直前に入れ替えた枠（アニメーション用）

function dishCard(slot, category, recipe) {
  const flash = flashSlots.includes(slot) ? 'flash' : '';
  if (!recipe) {
    return `
      <article class="dish-card ${categoryClass(category)} empty">
        <div class="dish-cat">${category}</div>
        <div class="dish-body"><h3>レシピがありません</h3><p class="dish-meta">レシピ一覧から${category}を追加してください</p></div>
      </article>`;
  }
  return `
    <article class="dish-card ${categoryClass(category)} ${flash}" data-open="${esc(recipe.id)}" tabindex="0">
      <div class="dish-cat" aria-hidden="true">${esc(recipe.emoji)}</div>
      <div class="dish-body">
        <p class="dish-label">${category}<span>${esc(recipe.cuisine)}</span></p>
        <h3>${esc(recipe.name)}</h3>
        <p class="dish-meta">
          <span>${esc(recipe.main)}</span>
          <span class="meta-time">${icon('clock', { size: 14 })}${esc(recipe.time)}分</span>
          ${recipe.fav ? `<span class="fav-mark">${icon('star', { filled: true, size: 14 })}</span>` : ''}
        </p>
      </div>
      <button class="reroll-btn" data-reroll="${slot}" aria-label="${category}を入れ替える">${icon('reroll')}</button>
    </article>`;
}

export function renderToday(container, { rerender, headerAction }) {
  headerAction.innerHTML = `<button class="icon-btn header-icon" data-settings aria-label="設定（人数）">${icon('gear')}</button>`;
  headerAction.querySelector('[data-settings]').addEventListener('click', () => openSettingsSheet(rerender));

  const index = actions.todayIndex();
  const days = actions.resolvedDays();
  const today = days[index];
  const tomorrow = days[index + 1];
  const dishes = SLOTS.map(({ key }) => today[key]).filter(Boolean);
  const totalTime = dishes.reduce((s, r) => s + Number(r.time || 0), 0);

  container.innerHTML = `
    <section class="today-hero">
      <p class="today-date">${formatDateLong(todayKey())}</p>
      <p class="today-lead">今日のごはんはこれにしよう
        <button class="servings-chip" data-settings>${icon('user', { size: 14 })}${getServings()}人分</button>
      </p>
    </section>

    <div class="dish-list">
      ${SLOTS.map(({ key, category }) => dishCard(key, category, today[key])).join('')}
    </div>

    <p class="today-total">${icon('clock', { size: 16 })}調理時間の目安 合計 約${totalTime}分</p>

    <button class="btn btn-primary btn-block btn-lg" data-reroll-all>
      ${icon('reroll')}まるごと入れ替える
    </button>

    <a class="fridge-cta" href="#fridge">
      <span class="fridge-cta-icon">${icon('fridge', { size: 26 })}</span>
      <span class="fridge-cta-text"><b>冷蔵庫のあまりもので探す</b><small>ある食材を選ぶと、作れる料理を提案します</small></span>
      ${icon('chevron', { size: 18 })}
    </a>

    ${tomorrow ? `
      <section class="card tomorrow">
        <h3 class="section-title">明日の献立</h3>
        <p>${SLOTS.map(({ key }) => esc(tomorrow[key]?.name || '—')).join('<span class="sep">／</span>')}</p>
        <a class="link-btn" href="#week">1週間の献立を見る ${icon('chevron', { size: 16 })}</a>
      </section>` : ''}
  `;
  flashSlots = [];

  container.addEventListener('click', (e) => {
    if (e.target.closest('[data-settings]')) {
      openSettingsSheet(rerender);
      return;
    }
    const reroll = e.target.closest('[data-reroll]');
    if (reroll) {
      e.stopPropagation();
      const slot = reroll.dataset.reroll;
      actions.rerollDish(index, slot);
      flashSlots = [slot];
      rerender();
      return;
    }
    if (e.target.closest('[data-reroll-all]')) {
      actions.rerollDay(index);
      flashSlots = SLOTS.map((s) => s.key);
      toast('今日の献立を入れ替えました');
      rerender();
      return;
    }
    const card = e.target.closest('[data-open]');
    if (card) openRecipeDetail(card.dataset.open, rerender);
  });
}
