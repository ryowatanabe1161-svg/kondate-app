// 画面から呼ばれる操作（store と planner をつなぐ）

import * as store from './store.js';
import * as planner from './planner.js';
import { diffDays, todayKey } from './lib/util.js';

/** 今日を含む献立がなければ作り、あれば壊れた枠を直して返す */
export function ensurePlan() {
  const recipes = store.allRecipes();
  let plan = store.getPlan();
  const today = todayKey();
  const offset = plan ? diffDays(plan.start, today) : -1;

  if (!plan || offset < 0 || offset >= plan.days.length) {
    plan = planner.generateWeek(recipes, today);
    store.setPlan(plan);
    return plan;
  }
  const repaired = planner.repairPlan(plan, recipes);
  if (repaired !== plan) store.setPlan(repaired);
  return repaired;
}

export function todayIndex() {
  const plan = ensurePlan();
  return diffDays(plan.start, todayKey());
}

export function regenerateWeek() {
  const plan = planner.generateWeek(store.allRecipes(), todayKey());
  store.setPlan(plan);
  return plan;
}

export function rerollDish(dayIndex, slot) {
  store.setPlan(planner.rerollDish(ensurePlan(), dayIndex, slot, store.allRecipes()));
}

export function rerollDay(dayIndex) {
  store.setPlan(planner.rerollDay(ensurePlan(), dayIndex, store.allRecipes()));
}

export function setDish(dayIndex, slot, recipeId) {
  store.setPlan(planner.setDish(ensurePlan(), dayIndex, slot, recipeId));
}

export function swapDays(a, b) {
  store.setPlan(planner.swapDays(ensurePlan(), a, b));
}

/** 献立の各日を、レシピオブジェクトに解決して返す */
export function resolvedDays() {
  const plan = ensurePlan();
  const byId = new Map(store.allRecipes().map((r) => [r.id, r]));
  return plan.days.map((d) => ({
    date: d.date,
    main: byId.get(d.main) || null,
    side: byId.get(d.side) || null,
    soup: byId.get(d.soup) || null,
  }));
}
