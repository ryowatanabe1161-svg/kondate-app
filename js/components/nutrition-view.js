// カロリー・栄養バランスの「目安」表示部品（今日・1週間で共通）

import { LEVEL_MARK, RICE_KCAL } from '../nutrition.js';
import { esc } from '../lib/util.js';

const LEVEL_TEXT = { good: 'しっかり', ok: 'まずまず', low: '少なめ' };

function pill(kind, label, level, detail) {
  return `<span class="bal-pill ${level}" data-bal="${kind}" data-level="${level}"><span class="bal-mark">${LEVEL_MARK[level] || ''}</span>${esc(label)}<small>${esc(detail)}</small></span>`;
}

/** たんぱく質・野菜・主食のバランス表示 */
export function balancePills(meal) {
  return `<div class="bal-row">
    ${pill('protein', 'たんぱく質', meal.protein, meal.proteinDishes ? `${meal.proteinDishes}品` : 'なし')}
    ${pill('vegetable', '野菜', meal.vegetable, `${meal.vegKinds}種`)}
    ${meal.staple
      ? pill('carb', '炭水化物', 'good', '主食込み')
      : pill('carb', '炭水化物', 'ok', 'ご飯を添えて')}
  </div>`;
}

const kcalText = (meal) => `${meal.kcal}${meal.unknown ? '＋α' : ''}`;

/** 今日の画面：1食分の目安カード */
export function mealNutritionCard(meal) {
  const withRice = meal.staple ? '' : `<span class="nutri-rice">ご飯1膳（150g）を足すと 約${meal.kcal + RICE_KCAL}kcal</span>`;
  return `
    <section class="card nutri-card" aria-label="この献立のカロリー・栄養の目安">
      <h3 class="section-title">カロリー・栄養の目安 <small>1人分${meal.staple ? '' : '・ご飯別'}</small></h3>
      <p class="nutri-kcal">約<b data-meal-kcal="${meal.kcal}">${kcalText(meal)}</b>kcal ${withRice}</p>
      <p class="nutri-pfc">
        <span>たんぱく質 <b>${meal.pfc.p}</b>g</span>
        <span>脂質 <b>${meal.pfc.f}</b>g</span>
        <span>炭水化物 <b>${meal.pfc.c}</b>g</span>
      </p>
      ${balancePills(meal)}
      <p class="nutri-note">※ レシピのデータから計算した大まかな目安です。${meal.unknown ? `カロリー未登録の料理が${meal.unknown}品あります。` : ''}◎しっかり ○まずまず △少なめ</p>
    </section>`;
}

/** 1週間の画面：各日の1行表示 */
export function dayNutritionLine(meal) {
  return `
    <div class="day-nutri" aria-label="この日の栄養の目安">
      <span class="day-kcal">目安 約<b data-day-kcal="${meal.kcal}">${kcalText(meal)}</b>kcal</span>
      <span class="mini-bal ${meal.protein}" data-bal="protein" title="たんぱく質${LEVEL_TEXT[meal.protein]}">たんぱく質${LEVEL_MARK[meal.protein]}</span>
      <span class="mini-bal ${meal.vegetable}" data-bal="vegetable" title="野菜${LEVEL_TEXT[meal.vegetable]}">野菜${LEVEL_MARK[meal.vegetable]}${meal.vegKinds}種</span>
      ${meal.staple ? '<span class="mini-bal good" data-bal="carb">主食込み</span>' : ''}
    </div>`;
}

/** 1週間の画面：週のまとめ */
export function weekNutritionSummary(week) {
  const level = (n) => (n >= week.days - 1 ? 'good' : n >= Math.ceil(week.days / 2) ? 'ok' : 'low');
  return `
    <div class="week-nutri" aria-label="1週間の栄養の目安">
      <p class="week-nutri-title">カロリー・栄養の目安 <small>1人分・ご飯別</small></p>
      <div class="week-kcal">
        <span>1日平均 約<b data-week-avg="${week.avgKcal}">${week.avgKcal}</b>kcal</span>
        <span>${week.days}日合計 約<b data-week-total="${week.totalKcal}">${week.totalKcal}</b>kcal</span>
      </div>
      <p class="nutri-pfc small">1日平均 たんぱく質 <b>${week.avgPfc.p}</b>g・脂質 <b>${week.avgPfc.f}</b>g・炭水化物 <b>${week.avgPfc.c}</b>g</p>
      <div class="bal-row">
        ${pill('protein', 'たんぱく質', level(week.proteinDays), `${week.proteinDays}/${week.days}日`)}
        ${pill('vegetable', '野菜3種以上', level(week.vegDays), `${week.vegDays}/${week.days}日・平均${week.avgVegKinds}種`)}
        ${pill('carb', '麺・丼', week.stapleDays <= 2 ? 'good' : 'ok', `${week.stapleDays}日`)}
      </div>
    </div>`;
}
