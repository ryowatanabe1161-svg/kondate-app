// 画面4：レシピ一覧

import * as store from '../store.js';
import { esc } from '../lib/util.js';
import { categoryBadge, categoryClass, icon, stars, toast } from '../lib/ui.js';
import { openRecipeDetail } from '../components/recipe-detail.js';
import { openRecipeForm } from '../components/recipe-form.js';
import { foodArt } from '../lib/art.js';
import { recipeMeals } from '../meals.js';

const FILTERS = [
  { key: 'all', label: 'すべて', test: () => true },
  { key: '主菜', label: '主菜', test: (r) => r.category === '主菜' },
  { key: '副菜', label: '副菜', test: (r) => r.category === '副菜' },
  { key: '汁物', label: '汁物', test: (r) => r.category === '汁物' },
  { key: '主食', label: '主食', test: (r) => r.category === '主食' },
  { key: '飲み物・デザート', label: '飲み物', test: (r) => r.category === '飲み物・デザート' },
  { key: 'meal:breakfast', label: '🌅朝ごはん', test: (r) => recipeMeals(r).includes('breakfast') },
  { key: 'meal:lunch', label: '☀️昼ごはん', test: (r) => recipeMeals(r).includes('lunch') },
  { key: 'meal:bento', label: '🍱お弁当', test: (r) => recipeMeals(r).includes('bento') },
  { key: 'meal:dinner', label: '🌙夕ごはん', test: (r) => recipeMeals(r).includes('dinner') },
  { key: 'fav', label: 'お気に入り', test: (r) => r.fav },
  { key: 'mine', label: '自分のレシピ', test: (r) => !r.builtin },
];

// 星評価での絞り込み・並び順
const RATING_FILTERS = [
  { key: 'any', label: '評価：すべて', test: () => true },
  { key: '5', label: '★5だけ', test: (r) => r.rating === 5 },
  { key: '4', label: '★4以上', test: (r) => r.rating >= 4 },
  { key: '3', label: '★3以上', test: (r) => r.rating >= 3 },
  { key: 'low', label: '★2以下', test: (r) => r.rating > 0 && r.rating <= 2 },
  { key: 'none', label: '未評価', test: (r) => !r.rating },
];
const SORTS = [
  { key: 'default', label: '標準の並び', compare: () => 0 },
  { key: 'rating', label: '評価が高い順', compare: (a, b) => b.rating - a.rating },
  { key: 'rating-asc', label: '評価が低い順', compare: (a, b) => (a.rating || 9) - (b.rating || 9) },
];

// 画面を切り替えても検索条件を覚えておく
const filterState = { filter: 'all', query: '', rating: 'any', sort: 'default' };

function matches(recipe, query) {
  if (!query) return true;
  const q = query.toLowerCase();
  return (
    recipe.name.toLowerCase().includes(q) ||
    recipe.main.includes(q) ||
    recipe.ingredients.some((i) => i.name.includes(q)) ||
    recipe.tags.some((t) => t.includes(q))
  );
}

function recipeRow(r) {
  return `
    <li class="recipe-row ${categoryClass(r.category)}">
      ${foodArt(r, { size: 'sm', className: 'emoji-circle' })}
      <button class="recipe-open" data-open="${esc(r.id)}">
        <span class="recipe-name">${esc(r.name)}${r.builtin ? '' : '<span class="mine-dot">自作</span>'}</span>
        <span class="recipe-meta">
          ${categoryBadge(r.category)}
          <span>${esc(r.cuisine)}・${esc(r.main)}</span>
          <span class="meta-time">${icon('clock', { size: 14 })}${esc(r.time)}分</span>
          ${r.kcal ? `<span>${esc(r.kcal)}kcal</span>` : ''}
          ${stars(r.rating)}
        </span>
      </button>
      <button class="fav-btn ${r.fav ? 'on' : ''}" data-fav="${esc(r.id)}" aria-pressed="${r.fav}" aria-label="${esc(r.name)}をお気に入り${r.fav ? 'から外す' : 'に追加'}">
        ${icon('star', { filled: r.fav, size: 24 })}
      </button>
    </li>`;
}

export function renderRecipes(container, { rerender }) {
  container.innerHTML = `
    <div class="search-box">
      ${icon('search', { size: 18 })}
      <input type="search" class="search-input" placeholder="料理名・材料・タグで検索" value="${esc(filterState.query)}" aria-label="レシピを検索">
    </div>
    <div class="chips" role="tablist">
      ${FILTERS.map((f) => `
        <button class="chip ${f.key === filterState.filter ? 'active' : ''}" role="tab" aria-selected="${f.key === filterState.filter}" data-filter="${f.key}">
          ${f.key === 'fav' ? icon('star', { filled: true, size: 14 }) : ''}${f.label}
        </button>`).join('')}
    </div>
    <div class="list-tools">
      <label class="select-wrap"><span class="visually-hidden">評価で絞り込み</span>
        <select class="input select" data-rating-filter aria-label="評価で絞り込み">
          ${RATING_FILTERS.map((f) => `<option value="${f.key}" ${f.key === filterState.rating ? 'selected' : ''}>${f.label}</option>`).join('')}
        </select>
      </label>
      <label class="select-wrap"><span class="visually-hidden">並び順</span>
        <select class="input select" data-sort aria-label="並び順">
          ${SORTS.map((f) => `<option value="${f.key}" ${f.key === filterState.sort ? 'selected' : ''}>${f.label}</option>`).join('')}
        </select>
      </label>
    </div>
    <p class="list-count"></p>
    <ul class="recipe-list"></ul>
    <p class="data-footer">
      <button class="link-btn" data-reset>すべてのデータを初期化</button>
    </p>
    <button class="fab" data-add aria-label="レシピを追加">${icon('plus', { size: 28 })}</button>
  `;

  const listEl = container.querySelector('.recipe-list');
  const countEl = container.querySelector('.list-count');

  function renderList() {
    const filter = FILTERS.find((f) => f.key === filterState.filter);
    const ratingFilter = RATING_FILTERS.find((f) => f.key === filterState.rating) || RATING_FILTERS[0];
    const sort = SORTS.find((f) => f.key === filterState.sort) || SORTS[0];
    const recipes = store
      .allRecipes()
      .filter((r) => filter.test(r) && ratingFilter.test(r) && matches(r, filterState.query))
      .map((r, i) => ({ r, i }))
      .sort((a, b) => sort.compare(a.r, b.r) || a.i - b.i) // 同じ評価なら元の順
      .map(({ r }) => r);
    countEl.textContent = `${recipes.length}件のレシピ`;
    listEl.innerHTML = recipes.length
      ? recipes.map(recipeRow).join('')
      : `<li class="empty-state">${filterState.filter === 'mine' && !filterState.query
          ? '右下の「＋」から自分のレシピを追加できます'
          : '該当するレシピがありません'}</li>`;
  }
  renderList();

  container.querySelector('[data-rating-filter]').addEventListener('change', (e) => {
    filterState.rating = e.target.value;
    renderList();
  });
  container.querySelector('[data-sort]').addEventListener('change', (e) => {
    filterState.sort = e.target.value;
    renderList();
  });

  container.querySelector('.search-input').addEventListener('input', (e) => {
    filterState.query = e.target.value.trim();
    renderList();
  });

  container.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-filter]');
    if (chip) {
      filterState.filter = chip.dataset.filter;
      container.querySelectorAll('[data-filter]').forEach((c) => {
        const active = c === chip;
        c.classList.toggle('active', active);
        c.setAttribute('aria-selected', active);
      });
      renderList();
      return;
    }
    const fav = e.target.closest('[data-fav]');
    if (fav) {
      const on = store.toggleFavorite(fav.dataset.fav);
      toast(on ? 'お気に入りに追加しました' : 'お気に入りから外しました');
      renderList();
      return;
    }
    const open = e.target.closest('[data-open]');
    if (open) {
      openRecipeDetail(open.dataset.open, renderList);
      return;
    }
    if (e.target.closest('[data-add]')) {
      openRecipeForm(null, renderList);
      return;
    }
    if (e.target.closest('[data-reset]')) {
      if (!confirm('自作レシピ・お気に入り・評価・献立・買い物リストをすべて削除して初期状態に戻しますか？')) return;
      store.resetAll();
      filterState.filter = 'all';
      filterState.query = '';
      filterState.rating = 'any';
      filterState.sort = 'default';
      toast('データを初期化しました');
      rerender();
    }
  });
}
