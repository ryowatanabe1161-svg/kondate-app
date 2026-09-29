// レシピ詳細のボトムシート

import * as store from '../store.js';
import * as actions from '../actions.js';
import { esc } from '../lib/util.js';
import { categoryBadge, closeSheet, icon, openSheet, starInput, toast } from '../lib/ui.js';
import { pfcOf } from '../nutrition.js';
import { openRecipeForm } from './recipe-form.js';
import { scaleAmount } from '../shopping.js';
import { recipeHeroArt } from '../lib/art.js';
import { MEALS, recipeMeals } from '../meals.js';

let reopen = null; // 評価・お気に入りで開き直すとき { pop: 星の数 }

function todayButton(t, withMeal, small) {
  const def = MEALS[t.meal];
  const text = small ? `${def.emoji}${def.short}の${t.label}に` : `今日の${withMeal ? `${def.short}の` : ''}${t.label}にする`;
  return `<button class="btn ${small ? 'btn-outline btn-sm' : 'btn-primary'}" data-act="today" data-meal="${t.meal}" data-slot="${t.slot}">${esc(text)}</button>`;
}

/**
 * @param {string} recipeId
 * @param {() => void} onChange データが変わったときに呼ぶ（画面の再描画用）
 */
export function openRecipeDetail(recipeId, onChange) {
  const recipe = store.getRecipe(recipeId);
  if (!recipe) return;
  const targets = actions.todayTargets(recipe);
  const multiMeals = actions.enabledMeals().length > 1;

  const servings = store.getServings();
  const factor = store.servingFactor();
  const ingredients = recipe.ingredients.length
    ? `<ul class="ing-list">${recipe.ingredients
        .map((i) => `<li><span>${esc(i.name)}</span><span class="ing-amount">${esc(scaleAmount(i.amount, factor))}</span></li>`)
        .join('')}</ul>`
    : '<p class="muted">材料が登録されていません。</p>';

  const steps = recipe.steps?.length
    ? `<h3 class="section-title">作り方 <small>（${recipe.steps.length}ステップ）</small></h3>
       ${servings === store.BASE_SERVINGS ? '' : '<p class="steps-note">※ 作り方の中の分量・時間は2人分の目安です</p>'}
       <ol class="steps">${recipe.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>`
    : '';
  const tips = recipe.tips?.length
    ? `<aside class="tips-box" aria-label="コツ・ポイント">
         <h3 class="tips-title"><span aria-hidden="true">💡</span>コツ・ポイント</h3>
         <ul class="tips-list">${recipe.tips.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
       </aside>`
    : '';

  const ownerActions = recipe.builtin
    ? `<button class="btn btn-outline" data-act="copy">${icon('copy', { size: 18 })}コピーして自分用に編集</button>`
    : `<div class="btn-row">
         <button class="btn btn-outline" data-act="edit">${icon('edit', { size: 18 })}編集</button>
         <button class="btn btn-danger-outline" data-act="delete">${icon('trash', { size: 18 })}削除</button>
       </div>`;

  const pfc = pfcOf(recipe);
  const nutrition = recipe.kcal
    ? `<p class="detail-nutri" aria-label="栄養の目安">
         <span class="detail-nutri-label">目安/1人分</span>
         <span>約<b>${esc(recipe.kcal)}</b>kcal</span>
         ${pfc ? `<span>たんぱく質 <b>${pfc.p}</b>g</span><span>脂質 <b>${pfc.f}</b>g</span><span>炭水化物 <b>${pfc.c}</b>g</span>` : ''}
       </p>`
    : '<p class="detail-nutri muted">カロリーが未登録のため、栄養の目安は表示できません</p>';
  const RATING_TEXT = ['まだ評価していません', 'いまいち（献立にほぼ出なくなります）', 'ふつう以下（出にくくなります）', 'ふつう', 'おいしい（出やすくなります）', 'とてもおいしい（よく出ます）'];
  const rating = `
    <div class="rating-box">
      <div class="rating-head"><span class="rating-title">わが家の評価</span>
        ${recipe.rating ? '<button class="link-btn small" data-act="unrate">評価を消す</button>' : ''}</div>
      ${starInput(recipe.rating)}
      <p class="rating-text">${RATING_TEXT[recipe.rating || 0]}</p>
    </div>`;

  openSheet({
    title: recipe.name,
    body: `
      ${recipeHeroArt(recipe)}
      <div class="detail-hero">
        <div class="detail-meta">
          ${categoryBadge(recipe.category)}
          <span class="chip-static">${esc(recipe.cuisine)}</span>
          <span class="chip-static">${esc(recipe.main)}</span>
          <span class="meta-time">${icon('clock', { size: 16 })}約${esc(recipe.time)}分</span>
          ${recipe.builtin ? '' : '<span class="chip-static mine">自分のレシピ</span>'}
          <span class="meal-fit" aria-label="向いている食事">${recipeMeals(recipe).map((m) => `<span class="meal-fit-chip">${MEALS[m].emoji}${esc(MEALS[m].short)}</span>`).join('')}</span>
        </div>
      </div>
      ${nutrition}
      ${rating}
      ${recipe.tags.length ? `<div class="tag-row">${recipe.tags.map((t) => `<span class="tag">#${esc(t)}</span>`).join('')}</div>` : ''}
      <h3 class="section-title">材料 <small>（${servings}人分${servings === store.BASE_SERVINGS ? '' : '・2人分から換算'}）</small></h3>
      ${ingredients}
      ${steps}
      ${tips}
      <div class="sheet-actions">
        <div class="btn-row">
          <button class="btn btn-outline fav-toggle ${recipe.fav ? 'on' : ''}" data-act="fav">
            ${icon('star', { filled: recipe.fav, size: 18 })}${recipe.fav ? 'お気に入り済み' : 'お気に入り'}
          </button>
          ${targets.length === 1 ? todayButton(targets[0], multiMeals, false) : ''}
        </div>
        ${targets.length > 1 ? `<div class="today-targets"><p class="today-targets-label">今日の献立に入れる</p>${targets.map((t) => todayButton(t, true, true)).join('')}</div>` : ''}
        ${ownerActions}
      </div>`,
    onMount(sheet) {
      if (reopen) {
        // 開き直したときはシートのスライドを出さず、押した星をぽんと弾ませる
        sheet.classList.add('no-enter');
        sheet.previousElementSibling?.classList.add('no-enter');
        if (reopen.pop) sheet.querySelectorAll('.star-btn.on').forEach((b, i) => { b.classList.add('pop'); b.style.setProperty('--i', i); });
        if (reopen.fav) sheet.querySelector('.fav-toggle')?.classList.add('pop');
        if (reopen.scroll) sheet.querySelector('.sheet-body').scrollTop = reopen.scroll;
        reopen = null;
      }
      const again = (extra = {}) => {
        reopen = { scroll: sheet.querySelector('.sheet-body').scrollTop, ...extra };
        openRecipeDetail(recipe.id, onChange);
      };
      sheet.addEventListener('click', (e) => {
        const rate = e.target.closest('[data-rate]');
        if (rate) {
          const n = store.setRating(recipe.id, Number(rate.dataset.rate));
          toast(`「${recipe.name}」を星${n}つにしました`);
          onChange();
          again({ pop: n });
          return;
        }
        const act = e.target.closest('[data-act]')?.dataset.act;
        if (!act) return;
        if (act === 'unrate') {
          store.setRating(recipe.id, 0);
          toast('評価を消しました');
          onChange();
          again();
          return;
        }
        if (act === 'fav') {
          const on = store.toggleFavorite(recipe.id);
          toast(on ? 'お気に入りに追加しました' : 'お気に入りから外しました');
          onChange();
          again({ fav: on });
        } else if (act === 'today') {
          const btn = e.target.closest('[data-act]');
          const meal = btn.dataset.meal || 'dinner';
          const t = targets.find((x) => x.meal === meal) || targets[0];
          actions.setDish(actions.todayIndex(), t.slot, recipe.id, 'this', t.meal);
          toast(`今日の${multiMeals ? `${MEALS[t.meal].short}の` : ''}${t.label}を「${recipe.name}」にしました`);
          closeSheet();
          onChange();
        } else if (act === 'edit') {
          openRecipeForm(recipe, onChange);
        } else if (act === 'copy') {
          const { id, fav, builtin, rating, pfc, ...rest } = recipe;
          openRecipeForm({ ...rest, name: `${recipe.name}（アレンジ）` }, onChange);
        } else if (act === 'delete') {
          if (!confirm(`「${recipe.name}」を削除しますか？`)) return;
          store.deleteCustomRecipe(recipe.id);
          toast('レシピを削除しました');
          closeSheet();
          onChange();
        }
      });
    },
  });
}
