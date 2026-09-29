// 画面5：冷蔵庫のあまりものから提案

import * as store from '../store.js';
import * as actions from '../actions.js';
import { SLOTS } from '../planner.js';
import { allIngredientNames, commonIngredientGroups, rankRecipes } from '../fridge.js';
import { esc } from '../lib/util.js';
import { categoryBadge, categoryClass, icon, toast } from '../lib/ui.js';
import { openRecipeDetail } from '../components/recipe-detail.js';

const PAGE_SIZE = 20;
const FILTERS = ['すべて', '主菜', '副菜', '汁物'];

// 画面を切り替えても表示状態を覚えておく
const viewState = { tab: null, filter: 'すべて', limit: PAGE_SIZE };

function selectedChips(items) {
  if (!items.length) return '<p class="hint">まだ食材が選ばれていません。下の一覧から選ぶか、入力して追加してください。</p>';
  return `
    <div class="chip-wrap">
      ${items.map((n) => `
        <button class="chip selected-chip" data-remove="${esc(n)}" aria-label="${esc(n)}を外す">${esc(n)}${icon('close', { size: 14 })}</button>`).join('')}
    </div>`;
}

function pickerHtml(groups, selected) {
  return groups
    .map((g) => `
      <section class="fridge-group">
        <h3 class="fridge-group-title">${esc(g.name)}</h3>
        <div class="chip-wrap">
          ${g.items.map((n) => `
            <button class="chip ing-chip ${selected.has(n) ? 'active' : ''}" data-toggle="${esc(n)}" aria-pressed="${selected.has(n)}">${esc(n)}</button>`).join('')}
        </div>
      </section>`)
    .join('');
}

function resultCard({ recipe, matched, missing }, todayIds) {
  const slot = SLOTS.find((s) => s.category === recipe.category);
  const total = matched.length + missing.length;
  const inToday = todayIds.includes(recipe.id);
  return `
    <li class="fridge-result ${categoryClass(recipe.category)}">
      <button class="fridge-result-main" data-open="${esc(recipe.id)}">
        <span class="emoji-circle">${esc(recipe.emoji)}</span>
        <span class="fridge-result-body">
          <span class="recipe-name">${esc(recipe.name)}</span>
          <span class="recipe-meta">${categoryBadge(recipe.category)}<span>${esc(recipe.cuisine)}</span><span class="meta-time">${icon('clock', { size: 14 })}${esc(recipe.time)}分</span></span>
        </span>
        <span class="match-score" aria-label="${total}品中${matched.length}品そろっています"><b>${matched.length}</b>/${total}</span>
      </button>
      <div class="match-detail">
        <p class="match-have"><span class="match-label">ある</span>${matched.map(esc).join('・')}</p>
        ${missing.length
          ? `<p class="match-missing"><span class="match-label">足りない</span>${missing.map(esc).join('・')}</p>`
          : '<p class="match-complete">主な材料がすべてそろっています（調味料は省略）</p>'}
      </div>
      <div class="fridge-result-actions">
        <button class="btn btn-outline btn-sm" data-open="${esc(recipe.id)}">レシピを見る</button>
        ${inToday
          ? `<span class="in-today">${icon('check', { size: 16 })}今日の献立です</span>`
          : `<button class="btn btn-primary btn-sm" data-set-today="${esc(recipe.id)}" data-slot="${slot.key}">今日の${esc(recipe.category)}にする</button>`}
      </div>
    </li>`;
}

export function renderFridge(container, { rerender }) {
  const recipes = store.allRecipes();
  const fridge = store.getFridge();
  const selected = new Set(fridge);
  const results = rankRecipes(recipes, fridge);
  const filtered = results.filter((r) => viewState.filter === 'すべて' || r.recipe.category === viewState.filter);
  const tab = viewState.tab || (fridge.length ? 'results' : 'pick');
  const todayPlan = actions.resolvedDays()[actions.todayIndex()];
  const todayIds = SLOTS.map((s) => todayPlan[s.key]?.id).filter(Boolean);

  container.innerHTML = `
    <section class="card fridge-head">
      <p class="fridge-lead">${icon('fridge', { size: 20 })}あまっている食材から、作れる料理を探します</p>
      <form class="add-item fridge-add">
        <input class="input" name="ingredient" list="fridge-ingredients" placeholder="食材を入力（例：キャベツ、豚肉）" aria-label="食材を入力" autocomplete="off">
        <button class="btn btn-primary" type="submit">${icon('plus', { size: 18 })}追加</button>
      </form>
      <datalist id="fridge-ingredients">
        ${allIngredientNames(recipes).map((n) => `<option value="${esc(n)}"></option>`).join('')}
      </datalist>
      <div class="selected-head">
        <span class="selected-title">選んだ食材 <b>${fridge.length}</b></span>
        ${fridge.length ? '<button class="link-btn" data-clear>すべてクリア</button>' : ''}
      </div>
      ${selectedChips(fridge)}
    </section>

    <div class="segmented fridge-tabs" role="tablist">
      <label><input type="radio" name="fridge-tab" value="pick" ${tab === 'pick' ? 'checked' : ''}><span>食材を選ぶ</span></label>
      <label><input type="radio" name="fridge-tab" value="results" ${tab === 'results' ? 'checked' : ''}><span>提案 <b class="count-pill">${results.length}</b></span></label>
    </div>

    ${tab === 'pick'
      ? `<div class="fridge-picker">${pickerHtml(commonIngredientGroups(recipes), selected)}
           <p class="hint">一覧にない食材は上の入力欄から追加できます。</p>
         </div>`
      : `<div class="fridge-results">
           <div class="chips">
             ${FILTERS.map((f) => `<button class="chip ${f === viewState.filter ? 'active' : ''}" data-filter="${f}">${f}</button>`).join('')}
           </div>
           ${!fridge.length
             ? '<p class="empty-state">「食材を選ぶ」から冷蔵庫にある食材を選んでください。</p>'
             : filtered.length
               ? `<p class="list-count">${filtered.length}件（そろっている食材が多い順）</p>
                  <ul class="fridge-list">${filtered.slice(0, viewState.limit).map((r) => resultCard(r, todayIds)).join('')}</ul>
                  ${filtered.length > viewState.limit ? `<button class="btn btn-ghost btn-block" data-more>もっと見る（残り${filtered.length - viewState.limit}件）</button>` : ''}`
               : '<p class="empty-state">この条件に合うレシピが見つかりませんでした。</p>'}
         </div>`}
  `;

  const update = (items) => {
    viewState.tab = tab; // 食材を選んでいる途中でタブが切り替わらないように
    store.setFridge(items);
    viewState.limit = PAGE_SIZE;
    rerender();
  };

  container.querySelector('.fridge-add').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = e.target.elements.namedItem('ingredient');
    const words = input.value.split(/[、,，\s]+/).map((w) => w.trim()).filter(Boolean);
    if (!words.length) return;
    update([...fridge, ...words]);
    toast(`「${words.join('・')}」を追加しました`);
  });

  container.querySelectorAll('input[name=fridge-tab]').forEach((radio) =>
    radio.addEventListener('change', () => {
      viewState.tab = radio.value;
      rerender();
    }),
  );

  container.addEventListener('click', (e) => {
    const toggle = e.target.closest('[data-toggle]');
    if (toggle) {
      const name = toggle.dataset.toggle;
      update(selected.has(name) ? fridge.filter((n) => n !== name) : [...fridge, name]);
      return;
    }
    const remove = e.target.closest('[data-remove]');
    if (remove) {
      update(fridge.filter((n) => n !== remove.dataset.remove));
      return;
    }
    if (e.target.closest('[data-clear]')) {
      update([]);
      return;
    }
    const filter = e.target.closest('[data-filter]');
    if (filter) {
      viewState.filter = filter.dataset.filter;
      viewState.limit = PAGE_SIZE;
      rerender();
      return;
    }
    if (e.target.closest('[data-more]')) {
      viewState.limit += PAGE_SIZE;
      rerender();
      return;
    }
    const setToday = e.target.closest('[data-set-today]');
    if (setToday) {
      const recipe = store.getRecipe(setToday.dataset.setToday);
      actions.setDish(actions.todayIndex(), setToday.dataset.slot, recipe.id);
      toast(`今日の${recipe.category}を「${recipe.name}」にしました`);
      rerender();
      return;
    }
    const open = e.target.closest('[data-open]');
    if (open) openRecipeDetail(open.dataset.open, rerender);
  });
}
