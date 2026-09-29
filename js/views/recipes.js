// 画面4：レシピ一覧

import * as store from '../store.js';
import { esc } from '../lib/util.js';
import { categoryBadge, categoryClass, icon, toast } from '../lib/ui.js';
import { openRecipeDetail } from '../components/recipe-detail.js';
import { openRecipeForm } from '../components/recipe-form.js';

const FILTERS = [
  { key: 'all', label: 'すべて', test: () => true },
  { key: '主菜', label: '主菜', test: (r) => r.category === '主菜' },
  { key: '副菜', label: '副菜', test: (r) => r.category === '副菜' },
  { key: '汁物', label: '汁物', test: (r) => r.category === '汁物' },
  { key: 'fav', label: 'お気に入り', test: (r) => r.fav },
  { key: 'mine', label: '自分のレシピ', test: (r) => !r.builtin },
];

// 画面を切り替えても検索条件を覚えておく
const filterState = { filter: 'all', query: '' };

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
      <span class="emoji-circle" aria-hidden="true">${esc(r.emoji)}</span>
      <button class="recipe-open" data-open="${esc(r.id)}">
        <span class="recipe-name">${esc(r.name)}${r.builtin ? '' : '<span class="mine-dot">自作</span>'}</span>
        <span class="recipe-meta">
          ${categoryBadge(r.category)}
          <span>${esc(r.cuisine)}・${esc(r.main)}</span>
          <span class="meta-time">${icon('clock', { size: 14 })}${esc(r.time)}分</span>
          ${r.kcal ? `<span>${esc(r.kcal)}kcal</span>` : ''}
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
    const recipes = store.allRecipes().filter((r) => filter.test(r) && matches(r, filterState.query));
    countEl.textContent = `${recipes.length}件のレシピ`;
    listEl.innerHTML = recipes.length
      ? recipes.map(recipeRow).join('')
      : `<li class="empty-state">${filterState.filter === 'mine' && !filterState.query
          ? '右下の「＋」から自分のレシピを追加できます'
          : '該当するレシピがありません'}</li>`;
  }
  renderList();

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
      if (!confirm('自作レシピ・お気に入り・献立・買い物リストをすべて削除して初期状態に戻しますか？')) return;
      store.resetAll();
      filterState.filter = 'all';
      filterState.query = '';
      toast('データを初期化しました');
      rerender();
    }
  });
}
