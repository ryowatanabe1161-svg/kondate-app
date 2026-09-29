// 画面から呼ばれる操作（store と planner をつなぐ）
//
// week 引数: 'this'（今週・既定） | 'next'（来週）
// 選び直し系の操作は、条件をゆるめた・固定中だった などの理由を配列で返す（画面でトースト表示）

import * as store from './store.js';
import * as planner from './planner.js';
import { addDays, diffDays, todayKey } from './lib/util.js';

const RELAX_TEXT = { quick: '時短', kcal: 'カロリー目標' };

/** 条件をゆるめた理由を、トースト用の文にする（なければ空文字） */
export function relaxMessage(reasons) {
  const list = (reasons || []).filter((r) => RELAX_TEXT[r]);
  if (!list.length) return '';
  return `条件（${list.map((r) => RELAX_TEXT[r]).join('・')}）に合うレシピが足りないため、一部ゆるめて選びました`;
}

const opts = (extra = {}) => ({ conditions: store.getConditions(), ...extra });

/** 今週と来週の料理ID（重複をできるだけ避けるため） */
function idsOf(plan) {
  return new Set((plan?.days || []).flatMap((d) => [d.main, d.side, d.soup]).filter(Boolean));
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
      plan = planner.generateWeek(recipes, today, opts());
      store.setPlan(plan);
      store.setPlan(null, 'next'); // 日付がずれた来週の献立は使わない
      return plan;
    }
  }
  const repaired = planner.repairPlan(plan, recipes, opts());
  if (repaired !== plan) store.setPlan(repaired);
  return repaired;
}

/** 来週の献立（あれば壊れた枠を直して返す。なければ null） */
export function getNextPlan() {
  ensurePlan();
  const next = store.getPlan('next');
  if (!next) return null;
  if (next.start !== nextWeekStart()) {
    store.setPlan(null, 'next');
    return null;
  }
  const repaired = planner.repairPlan(next, store.allRecipes(), opts());
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

/** 週の献立を作り直す。固定した日・料理はそのまま。条件をゆるめた理由を返す */
export function regenerateWeek(week = 'this') {
  const report = [];
  const current = planOf(week);
  const start = current ? current.start : week === 'next' ? nextWeekStart() : todayKey();
  const plan = planner.generateWeek(store.allRecipes(), start, opts({ base: current, avoid: otherWeekIds(week), report }));
  store.setPlan(plan, week);
  return report;
}

/** 来週の献立を新しく作る（今週の料理はできるだけ避ける） */
export function createNextWeek() {
  ensurePlan();
  const report = [];
  const plan = planner.generateWeek(store.allRecipes(), nextWeekStart(), opts({ avoid: idsOf(store.getPlan()), report }));
  store.setPlan(plan, 'next');
  return report;
}

export function rerollDish(dayIndex, slot, week = 'this') {
  const report = [];
  store.setPlan(planner.rerollDish(planOf(week), dayIndex, slot, store.allRecipes(), opts({ avoid: otherWeekIds(week), report })), week);
  return report;
}

export function rerollDay(dayIndex, week = 'this') {
  const report = [];
  store.setPlan(planner.rerollDay(planOf(week), dayIndex, store.allRecipes(), opts({ avoid: otherWeekIds(week), report })), week);
  return report;
}

export function setDish(dayIndex, slot, recipeId, week = 'this') {
  store.setPlan(planner.setDish(planOf(week), dayIndex, slot, recipeId), week);
}

/** 入れ替えできたら true（固定された日は入れ替えない） */
export function swapDays(a, b, week = 'this') {
  const plan = planOf(week);
  const next = planner.swapDays(plan, a, b);
  store.setPlan(next, week);
  return next !== plan;
}

export function toggleDayLock(dayIndex, week = 'this') {
  const plan = planOf(week);
  const locked = !plan.days[dayIndex].locked;
  store.setPlan(planner.setDayLock(plan, dayIndex, locked), week);
  return locked;
}

export function toggleDishLock(dayIndex, slot, week = 'this') {
  const plan = planOf(week);
  const locked = !planner.isLocked(plan.days[dayIndex], slot);
  store.setPlan(planner.setDishLock(plan, dayIndex, slot, locked), week);
  return locked;
}

/** 献立の各日を、レシピオブジェクトに解決して返す（来週がなければ空配列） */
export function resolvedDays(week = 'this') {
  const plan = planOf(week);
  if (!plan) return [];
  const byId = new Map(store.allRecipes().map((r) => [r.id, r]));
  return plan.days.map((d) => ({
    date: d.date,
    main: byId.get(d.main) || null,
    side: byId.get(d.side) || null,
    soup: byId.get(d.soup) || null,
    locked: d.locked === true,
    lockedSlots: d.lockedSlots || [],
  }));
}
