// 画面から呼ばれる操作（store と planner をつなぐ）
//
// week 引数: 'this'（今週・既定） | 'next'（来週）
// meal 引数: 'dinner'（夕ごはん・既定） | 'breakfast' | 'lunch' | 'bento'
// 選び直し系の操作は、条件をゆるめた・固定中だった などの理由を配列で返す（画面でトースト表示）

import * as store from './store.js';
import * as planner from './planner.js';
import { MEALS, enabledMealKeys, isBentoDay, mealSlots, slotsForRecipe } from './meals.js';
import { addDays, diffDays, todayKey } from './lib/util.js';

const RELAX_TEXT = { quick: '時短', kcal: 'カロリー目標' };

/** 条件をゆるめた理由を、トースト用の文にする（なければ空文字） */
export function relaxMessage(reasons) {
  const list = (reasons || []).filter((r) => RELAX_TEXT[r]);
  if (!list.length) return '';
  return `条件（${list.map((r) => RELAX_TEXT[r]).join('・')}）に合うレシピが足りないため、一部ゆるめて選びました`;
}

const opts = (extra = {}) => ({ conditions: store.getConditions(), ...extra });

// ---- 食事 ----

/** 献立を作る食事（朝 → お弁当 → 昼 → 夕の順。夕ごはんはいつも含む） */
export function enabledMeals() {
  return enabledMealKeys(store.getMealSettings());
}

/** 設定を反映したその食事の枠 */
/** 食事の定義（名前・絵文字など） */
export const mealDef = (meal) => MEALS[meal] || MEALS.dinner;

export function slotsOf(meal = 'dinner') {
  return mealSlots(meal, store.getMealSettings());
}

function mealOpts(meal, extra = {}) {
  const s = store.getMealSettings();
  return opts({
    slots: mealSlots(meal, s),
    activeDay: meal === 'bento' ? (date) => isBentoDay(date, s) : undefined,
    ...extra,
  });
}

/** plan の中のその食事の部分（夕ごはんは plan そのもの） */
function mealPlanOf(plan, meal) {
  if (!plan) return null;
  if (meal === 'dinner') return plan;
  const mp = plan.meals?.[meal];
  return mp ? { id: plan.id, start: plan.start, days: mp.days } : null;
}

function withMealPlan(plan, meal, mp) {
  if (meal === 'dinner') return { ...mp, meals: plan.meals || {} };
  return { ...plan, meals: { ...(plan.meals || {}), [meal]: { days: mp.days } } };
}

const dayIds = (day, meal) => MEALS[meal].slots.map((s) => day?.[s.key]).filter(Boolean);

/** 献立（全食事）の料理ID（来週を作るときなどに、できるだけ重ならないように） */
function idsOf(plan) {
  if (!plan) return new Set();
  const ids = plan.days.flatMap((d) => dayIds(d, 'dinner'));
  for (const [meal, mp] of Object.entries(plan.meals || {})) mp.days.forEach((d) => ids.push(...dayIds(d, meal)));
  return new Set(ids);
}

/** 同じ日のほかの食事の料理（例：朝とお弁当で同じ卵焼きにしない） */
function dayUsedMap(plan, exceptMeal) {
  const map = new Map();
  for (const meal of enabledMeals()) {
    if (meal === exceptMeal) continue;
    const mp = mealPlanOf(plan, meal);
    (mp?.days || []).forEach((d) => {
      if (!map.has(d.date)) map.set(d.date, new Set());
      dayIds(d, meal).forEach((id) => map.get(d.date).add(id));
    });
  }
  return map;
}

/** 有効な食事の献立がそろっているか確認し、足りなければ作る（お弁当の曜日・昼の小鉢の設定も反映） */
function syncMeals(plan, avoid = new Set()) {
  if (!plan) return plan;
  const s = store.getMealSettings();
  const recipes = store.allRecipes();
  let result = plan;
  for (const meal of enabledMeals()) {
    if (meal === 'dinner') continue;
    const cur = result.meals?.[meal];
    const aligned = cur && cur.days.length === result.days.length && cur.days.every((d, i) => d.date === result.days[i].date);
    if (!aligned) {
      const mp = planner.generateMealWeek(recipes, result.start, meal, mealOpts(meal, { avoid, dayUsed: dayUsedMap(result, meal) }));
      result = withMealPlan(result, meal, mp);
      continue;
    }
    let days = cur.days;
    if (meal === 'bento') {
      let moved = false;
      days = days.map((d) => {
        const on = isBentoDay(d.date, s);
        if (!on && !d.off) {
          moved = true;
          return { date: d.date, main: null, side1: null, side2: null, locked: false, lockedSlots: [], off: true };
        }
        if (on && d.off) {
          moved = true;
          return { ...d, off: false };
        }
        return d;
      });
      if (!moved) days = cur.days;
    }
    const mp = { days };
    const repaired = planner.repairMealPlan(mp, recipes, meal, mealOpts(meal, { dayUsed: dayUsedMap(result, meal) }));
    if (repaired !== mp || days !== cur.days) result = withMealPlan(result, meal, repaired);
  }
  return result;
}

/** 来週の開始日（今週の最終日の翌日） */
export function nextWeekStart(plan = store.getPlan()) {
  return plan ? addDays(plan.start, plan.days.length) : addDays(todayKey(), planner.PLAN_DAYS);
}

/**
 * 今日を含む献立を用意する。
 * - 今週の献立が今日を含めばそのまま（壊れた枠は直す）
 * - 今週が終わっていて、来週の献立が今日を含めば、来週の献立をそのまま今週にする（作り直さない）
 * - どちらでもなければ、今日から7日分を新しく作る
 * いずれも、有効な食事（朝・昼・お弁当）の献立がなければ作り足す
 */
export function ensurePlan() {
  const recipes = store.allRecipes();
  const today = todayKey();
  const covers = (p) => p && diffDays(p.start, today) >= 0 && diffDays(p.start, today) < p.days.length;
  let plan = store.getPlan();

  if (!covers(plan)) {
    const next = store.getPlan('next');
    if (plan && covers(next) && diffDays(plan.start, today) >= plan.days.length) {
      store.rolloverToNextWeek();
      plan = store.getPlan();
    } else {
      plan = syncMeals({ ...planner.generateWeek(recipes, today, opts()), meals: {} });
      store.setPlan(plan);
      store.setPlan(null, 'next'); // 日付がずれた来週の献立は使わない
      return plan;
    }
  }
  const repaired = syncMeals(planner.repairPlan(plan, recipes, opts()));
  if (repaired !== plan) store.setPlan(repaired);
  return repaired;
}

/** 来週の献立（あれば壊れた枠を直して返す。なければ null） */
export function getNextPlan() {
  const thisPlan = ensurePlan();
  const next = store.getPlan('next');
  if (!next) return null;
  if (next.start !== nextWeekStart()) {
    store.setPlan(null, 'next');
    return null;
  }
  const repaired = syncMeals(planner.repairPlan(next, store.allRecipes(), opts()), idsOf(thisPlan));
  if (repaired !== next) store.setPlan(repaired, 'next');
  return repaired;
}

function planOf(week) {
  return week === 'next' ? getNextPlan() : ensurePlan();
}

/** もう一方の週の料理（できるだけ重ならないように） */
function otherWeekIds(week) {
  return idsOf(week === 'next' ? ensurePlan() : store.getPlan('next'));
}

export function todayIndex() {
  const plan = ensurePlan();
  return diffDays(plan.start, todayKey());
}

/** 夕ごはん＋有効な食事の1週間分を作る（base の固定はそのまま） */
function buildWeek(start, base, avoid, report) {
  const recipes = store.allRecipes();
  let plan = { ...planner.generateWeek(recipes, start, opts({ base, avoid, report })), meals: {} };
  for (const meal of enabledMeals()) {
    if (meal === 'dinner') continue;
    const mp = planner.generateMealWeek(recipes, start, meal, mealOpts(meal, { base: mealPlanOf(base, meal), avoid, report, dayUsed: dayUsedMap(plan, meal) }));
    plan = withMealPlan(plan, meal, mp);
  }
  return plan;
}

/** 週の献立（全食事）を作り直す。固定した日・料理はそのまま。条件をゆるめた理由を返す */
export function regenerateWeek(week = 'this') {
  const report = [];
  const current = planOf(week);
  const start = current ? current.start : week === 'next' ? nextWeekStart() : todayKey();
  store.setPlan(buildWeek(start, current, otherWeekIds(week), report), week);
  return report;
}

/** 来週の献立を新しく作る（今週の料理はできるだけ避ける） */
export function createNextWeek() {
  const thisPlan = ensurePlan();
  const report = [];
  store.setPlan(buildWeek(nextWeekStart(), null, idsOf(thisPlan), report), 'next');
  return report;
}

/** 食事ごとの操作をまとめる（夕ごはんは従来の planner 関数、ほかは汎用の関数） */
function updateMeal(week, meal, fn) {
  const plan = planOf(week);
  const mp = mealPlanOf(plan, meal);
  if (!mp) return plan;
  const next = fn(mp);
  if (next === mp) return plan;
  const updated = withMealPlan(plan, meal, next);
  store.setPlan(updated, week);
  return updated;
}

export function rerollDish(dayIndex, slot, week = 'this', meal = 'dinner') {
  const report = [];
  const recipes = store.allRecipes();
  const plan = planOf(week);
  updateMeal(week, meal, (mp) =>
    meal === 'dinner'
      ? planner.rerollDish(mp, dayIndex, slot, recipes, opts({ avoid: otherWeekIds(week), report }))
      : planner.rerollMealDish(mp, dayIndex, slot, recipes, meal, mealOpts(meal, { avoid: otherWeekIds(week), report, dayUsed: dayUsedMap(plan, meal) })),
  );
  return report;
}

export function rerollDay(dayIndex, week = 'this', meal = 'dinner') {
  const report = [];
  const recipes = store.allRecipes();
  const plan = planOf(week);
  updateMeal(week, meal, (mp) =>
    meal === 'dinner'
      ? planner.rerollDay(mp, dayIndex, recipes, opts({ avoid: otherWeekIds(week), report }))
      : planner.rerollMealDay(mp, dayIndex, recipes, meal, mealOpts(meal, { avoid: otherWeekIds(week), report, dayUsed: dayUsedMap(plan, meal) })),
  );
  return report;
}

export function setDish(dayIndex, slot, recipeId, week = 'this', meal = 'dinner') {
  updateMeal(week, meal, (mp) => (mp.days[dayIndex]?.off ? mp : planner.setDish(mp, dayIndex, slot, recipeId)));
}

/** 入れ替えできたら true（固定された日・お弁当なしの日は入れ替えない） */
export function swapDays(a, b, week = 'this', meal = 'dinner') {
  const keys = MEALS[meal].slots.map((s) => s.key);
  let swapped = false;
  updateMeal(week, meal, (mp) => {
    const next = planner.swapDays(mp, a, b, keys);
    swapped = next !== mp;
    return next;
  });
  return swapped;
}

export function toggleDayLock(dayIndex, week = 'this', meal = 'dinner') {
  let locked = false;
  updateMeal(week, meal, (mp) => {
    if (mp.days[dayIndex]?.off) return mp;
    locked = !mp.days[dayIndex].locked;
    return planner.setDayLock(mp, dayIndex, locked);
  });
  return locked;
}

export function toggleDishLock(dayIndex, slot, week = 'this', meal = 'dinner') {
  const keys = MEALS[meal].slots.map((s) => s.key);
  let locked = false;
  updateMeal(week, meal, (mp) => {
    if (mp.days[dayIndex]?.off) return mp;
    locked = !planner.isLocked(mp.days[dayIndex], slot);
    return planner.setDishLock(mp, dayIndex, slot, locked, keys);
  });
  return locked;
}

/** その食事の各日を、レシピオブジェクトに解決して返す（来週がなければ空配列） */
export function resolvedMealDays(week = 'this', meal = 'dinner') {
  const mp = mealPlanOf(planOf(week), meal);
  if (!mp) return [];
  const byId = new Map(store.allRecipes().map((r) => [r.id, r]));
  const keys = slotsOf(meal).map((s) => s.key);
  return mp.days.map((d) => {
    const day = { date: d.date, locked: d.locked === true, lockedSlots: d.lockedSlots || [], off: d.off === true };
    keys.forEach((k) => (day[k] = d.off ? null : byId.get(d[k]) || null));
    return day;
  });
}

/** 夕ごはんの各日（従来の呼び出し用） */
export function resolvedDays(week = 'this') {
  return resolvedMealDays(week, 'dinner');
}

/** 1日分のすべての食事のレシピ（買い物リスト・栄養用）: [{ date, recipes, byMeal: { 食事: [レシピ] } }] */
export function allMealsDays(week = 'this') {
  const meals = enabledMeals();
  const perMeal = Object.fromEntries(meals.map((m) => [m, resolvedMealDays(week, m)]));
  const base = perMeal.dinner;
  return base.map((d, i) => {
    const byMeal = {};
    for (const m of meals) {
      const day = perMeal[m][i];
      byMeal[m] = day && !day.off ? slotsOf(m).map((s) => day[s.key]).filter(Boolean) : [];
    }
    return { date: d.date, byMeal, recipes: meals.flatMap((m) => byMeal[m]) };
  });
}

/** 今日の各食事: [{ meal, def, slots, day }] */
export function todayMeals() {
  const i = todayIndex();
  return enabledMeals().map((meal) => ({ meal, def: MEALS[meal], slots: slotsOf(meal), day: resolvedMealDays('this', meal)[i] }));
}

/** レシピを「今日の◯◯」にできる枠（有効な食事だけ。お弁当なしの日は除く） */
export function todayTargets(recipe) {
  const i = todayIndex();
  const plan = ensurePlan();
  return slotsForRecipe(recipe, enabledMeals()).filter(({ meal, slot }) => {
    if (!slotsOf(meal).some((s) => s.key === slot)) return false;
    const mp = mealPlanOf(plan, meal);
    return mp && !mp.days[i]?.off;
  });
}
