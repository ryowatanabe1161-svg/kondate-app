// レシピの追加・編集フォーム（ボトムシート）

import * as store from '../store.js';
import { CATEGORIES, CUISINES, MAIN_INGREDIENTS } from '../data/recipes.js';
import { esc, uid } from '../lib/util.js';
import { closeSheet, icon, openSheet, toast } from '../lib/ui.js';

function ingredientRow(ing = { name: '', amount: '' }) {
  return `
    <div class="ing-row">
      <input class="input" name="ingName" placeholder="材料名（例：玉ねぎ）" value="${esc(ing.name)}" aria-label="材料名">
      <input class="input input-amount" name="ingAmount" placeholder="分量" value="${esc(ing.amount)}" aria-label="分量">
      <button type="button" class="icon-btn" data-remove-ing aria-label="この材料を削除">${icon('close', { size: 18 })}</button>
    </div>`;
}

/**
 * @param {object|null} recipe 編集するレシピ（id がなければ新規として保存）
 * @param {() => void} onSaved
 */
export function openRecipeForm(recipe, onSaved) {
  const isEdit = Boolean(recipe?.id);
  const r = {
    name: '',
    category: '主菜',
    main: '肉',
    cuisine: '和',
    time: 20,
    kcal: '',
    ingredients: [],
    steps: [],
    ...recipe,
  };
  const rows = (r.ingredients.length ? r.ingredients : [{}, {}, {}]).map(ingredientRow).join('');

  openSheet({
    title: isEdit ? 'レシピを編集' : 'レシピを追加',
    body: `
      <form class="recipe-form" novalidate>
        <label class="field">
          <span class="field-label">料理名 <em>必須</em></span>
          <input class="input" name="name" value="${esc(r.name)}" placeholder="例：豚こまのケチャップ炒め" required>
        </label>

        <fieldset class="field">
          <legend class="field-label">種類</legend>
          <div class="segmented">
            ${CATEGORIES.map((c) => `
              <label><input type="radio" name="category" value="${c}" ${c === r.category ? 'checked' : ''}><span>${c}</span></label>`).join('')}
          </div>
        </fieldset>

        <div class="field-row">
          <label class="field">
            <span class="field-label">主な食材</span>
            <select class="input" name="main">
              ${MAIN_INGREDIENTS.map((m) => `<option ${m === r.main ? 'selected' : ''}>${m}</option>`).join('')}
            </select>
          </label>
          <label class="field">
            <span class="field-label">ジャンル</span>
            <select class="input" name="cuisine">
              ${CUISINES.map((c) => `<option ${c === r.cuisine ? 'selected' : ''}>${c}</option>`).join('')}
            </select>
          </label>
        </div>

        <div class="field-row">
          <label class="field">
            <span class="field-label">調理時間（分）</span>
            <input class="input" name="time" type="number" inputmode="numeric" min="1" max="600" value="${esc(r.time)}">
          </label>
          <label class="field">
            <span class="field-label">カロリー <small>（1人分・任意）</small></span>
            <input class="input" name="kcal" type="number" inputmode="numeric" min="0" max="3000" value="${esc(r.kcal ?? '')}" placeholder="例：400">
          </label>
        </div>

        <div class="field">
          <span class="field-label">材料 <small>（2人分の分量で入力）</small></span>
          <div class="ing-rows">${rows}</div>
          <button type="button" class="btn btn-ghost" data-add-ing>${icon('plus', { size: 18 })}材料を追加</button>
        </div>

        <label class="field">
          <span class="field-label">作り方 <small>（1行に1ステップ）</small></span>
          <textarea class="input" name="steps" rows="4" placeholder="例：玉ねぎを薄切りにする">${esc(r.steps.join('\n'))}</textarea>
        </label>

        <p class="form-error" hidden></p>
        <button type="submit" class="btn btn-primary btn-block">${isEdit ? '保存する' : '追加する'}</button>
      </form>`,
    onMount(sheet) {
      const form = sheet.querySelector('form');
      const rowsEl = form.querySelector('.ing-rows');

      form.addEventListener('click', (e) => {
        if (e.target.closest('[data-add-ing]')) {
          rowsEl.insertAdjacentHTML('beforeend', ingredientRow());
          rowsEl.lastElementChild.querySelector('input').focus();
        }
        const remove = e.target.closest('[data-remove-ing]');
        if (remove) remove.closest('.ing-row').remove();
      });

      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const data = new FormData(form);
        const name = data.get('name').trim();
        const error = form.querySelector('.form-error');
        if (!name) {
          error.textContent = '料理名を入力してください。';
          error.hidden = false;
          form.elements.namedItem('name').focus();
          return;
        }
        const names = data.getAll('ingName');
        const amounts = data.getAll('ingAmount');
        const ingredients = names
          .map((n, i) => ({ name: n.trim(), amount: amounts[i].trim() }))
          .filter((i) => i.name);

        store.saveCustomRecipe({
          id: r.id || uid('u'),
          name,
          category: data.get('category'),
          main: data.get('main'),
          cuisine: data.get('cuisine'),
          kcal: Number(data.get('kcal')) || null,
          emoji: r.emoji,
          tags: (r.tags || []).filter((t) => t !== '時短'),
          time: Math.max(1, Number(data.get('time')) || 20),
          ingredients,
          steps: data.get('steps').split('\n').map((s) => s.trim()).filter(Boolean),
        });
        toast(isEdit ? 'レシピを保存しました' : 'レシピを追加しました');
        closeSheet();
        onSaved();
      });
    },
  });
}
