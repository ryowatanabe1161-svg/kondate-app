// 献立の自動生成ロジック（純粋関数：レシピ一覧と献立を受け取り、新しい献立を返す）

import { addDays, shuffle, uid, weightedPick } from './lib/util.js';

export const PLAN_DAYS = 7;

export const SLOTS = [
  { key: 'main', category: '主菜' },
  { key: 'side', category: '副菜' },
  { key: 'soup', category: '汁物' },
];

export const SLOT_CATEGORY = Object.fromEntries(SLOTS.map((s) => [s.key, s.category]));

// 同じ日の中でかぶらないようにする「主な食材」（野菜などは重なってもOK）
const PROTEINS = new Set(['肉', '魚', '卵・豆腐']);

// お気に入りは3倍選ばれやすくする
const favWeight = (r) => (r.fav ? 3 : 1);

const poolFor = (recipes, slot) => recipes.filter((r) => r.category === SLOT_CATEGORY[slot]);

/**
 * 条件を段階的にゆるめながら1品選ぶ。
 * stages の先頭から順に試し、候補があればその中から（お気に入り優先で）ランダムに選ぶ。
 */
function pickWithFallback(pool, stages) {
  for (const cond of stages) {
    const candidates = pool.filter(cond);
    if (candidates.length) return weightedPick(candidates, favWeight);
  }
  return weightedPick(pool, favWeight);
}

/**
 * 主菜の「主な食材」を n 日分、偏りなく・前日と連続しないように並べる。
 * 例: 肉3・魚2・卵豆腐2 → [肉, 魚, 卵・豆腐, 肉, 魚, 肉, 卵・豆腐]
 */
function mainIngredientSequence(mains, n) {
  const capacity = {};
  mains.forEach((r) => (capacity[r.main] = (capacity[r.main] || 0) + 1));
  const types = shuffle(Object.keys(capacity));

  // 1) 各食材の日数を均等に割り振る（レシピ数が少ない食材は上限あり）
  const counts = Object.fromEntries(types.map((t) => [t, 0]));
  for (let i = 0; i < n; i++) {
    let cands = types.filter((t) => counts[t] < capacity[t]);
    if (!cands.length) cands = types;
    const min = Math.min(...cands.map((t) => counts[t]));
    const chosen = shuffle(cands.filter((t) => counts[t] === min))[0];
    counts[chosen]++;
  }

  // 2) 残りが多い食材から、前日と違うものを選んで並べる
  const seq = [];
  for (let i = 0; i < n; i++) {
    const remaining = types.filter((t) => counts[t] > 0);
    let cands = remaining.filter((t) => t !== seq[i - 1]);
    if (!cands.length) cands = remaining;
    const max = Math.max(...cands.map((t) => counts[t]));
    const chosen = shuffle(cands.filter((t) => counts[t] === max))[0];
    seq.push(chosen);
    counts[chosen]--;
  }
  return seq;
}

/** 副菜・汁物を選ぶ：週内で重複させず、主菜などと主な食材（肉・魚・卵豆腐）がかぶらないように */
function pickCompanion(pool, { mainRecipe, otherRecipe, used, currentId }) {
  const avoid = new Set([mainRecipe?.main, otherRecipe?.main].filter((m) => PROTEINS.has(m)));
  const notCurrent = (r) => r.id !== currentId;
  const notUsed = (r) => !used.has(r.id);
  const noClash = (r) => !avoid.has(r.main);
  return pickWithFallback(pool, [
    (r) => notCurrent(r) && notUsed(r) && noClash(r),
    (r) => notCurrent(r) && notUsed(r),
    (r) => notCurrent(r) && noClash(r),
    notCurrent,
  ]);
}

/** 1週間分の献立を新しく作る */
export function generateWeek(recipes, startKey) {
  const mains = poolFor(recipes, 'main');
  const sides = poolFor(recipes, 'side');
  const soups = poolFor(recipes, 'soup');
  const sequence = mains.length ? mainIngredientSequence(mains, PLAN_DAYS) : [];
  const used = new Set();

  const days = [];
  for (let i = 0; i < PLAN_DAYS; i++) {
    const main = pickWithFallback(mains, [
      (r) => r.main === sequence[i] && !used.has(r.id),
      (r) => !used.has(r.id),
    ]);
    if (main) used.add(main.id);
    const side = pickCompanion(sides, { mainRecipe: main, used });
    if (side) used.add(side.id);
    const soup = pickCompanion(soups, { mainRecipe: main, otherRecipe: side, used });
    if (soup) used.add(soup.id);

    days.push({
      date: addDays(startKey, i),
      main: main?.id ?? null,
      side: side?.id ?? null,
      soup: soup?.id ?? null,
    });
  }
  return { id: uid('p'), start: startKey, days };
}

/** 指定した日の1品だけを選び直す */
export function rerollDish(plan, dayIndex, slot, recipes) {
  const byId = new Map(recipes.map((r) => [r.id, r]));
  const day = plan.days[dayIndex];
  const pool = poolFor(recipes, slot);
  const used = new Set(
    plan.days.flatMap((d, i) => (i === dayIndex ? [] : [d.main, d.side, d.soup])).filter(Boolean),
  );

  let picked;
  if (slot === 'main') {
    // 前後の日と主な食材が連続しないように & 1つの食材に偏りすぎないように
    const neighbors = new Set(
      [plan.days[dayIndex - 1], plan.days[dayIndex + 1]]
        .filter(Boolean)
        .map((d) => byId.get(d.main)?.main)
        .filter(Boolean),
    );
    const counts = {};
    plan.days.forEach((d, i) => {
      const m = i !== dayIndex && byId.get(d.main)?.main;
      if (m) counts[m] = (counts[m] || 0) + 1;
    });
    const typeCount = new Set(pool.map((r) => r.main)).size || 1;
    const maxPerType = Math.ceil(plan.days.length / typeCount);

    // 同じ日の副菜・汁物と主な食材（肉・魚・卵豆腐）がかぶらないように
    const sameDay = new Set([byId.get(day.side)?.main, byId.get(day.soup)?.main].filter((m) => PROTEINS.has(m)));
    const fresh = (r) => r.id !== day.main && !used.has(r.id);
    picked = pickWithFallback(pool, [
      (r) => fresh(r) && !neighbors.has(r.main) && (counts[r.main] || 0) < maxPerType && !sameDay.has(r.main),
      (r) => fresh(r) && !neighbors.has(r.main) && (counts[r.main] || 0) < maxPerType,
      (r) => fresh(r) && !neighbors.has(r.main),
      fresh,
      (r) => r.id !== day.main,
    ]);
  } else {
    const otherSlot = slot === 'side' ? 'soup' : 'side';
    picked = pickCompanion(pool, {
      mainRecipe: byId.get(day.main),
      otherRecipe: byId.get(day[otherSlot]),
      used,
      currentId: day[slot],
    });
  }
  return setDish(plan, dayIndex, slot, picked?.id ?? day[slot]);
}

/** 指定した日の献立をまるごと選び直す */
export function rerollDay(plan, dayIndex, recipes) {
  return SLOTS.reduce((p, { key }) => rerollDish(p, dayIndex, key, recipes), plan);
}

/** 指定した日の1品を、選んだレシピに差し替える */
export function setDish(plan, dayIndex, slot, recipeId) {
  const days = plan.days.map((d, i) => (i === dayIndex ? { ...d, [slot]: recipeId } : d));
  return { ...plan, days };
}

/** 2つの日の献立を入れ替える（日付はそのまま） */
export function swapDays(plan, a, b) {
  const menu = (d) => ({ main: d.main, side: d.side, soup: d.soup });
  const days = plan.days.map((d, i) => {
    if (i === a) return { ...d, ...menu(plan.days[b]) };
    if (i === b) return { ...d, ...menu(plan.days[a]) };
    return d;
  });
  return { ...plan, days };
}

/** 削除されたレシピなど、存在しないIDを含む枠を埋め直す */
export function repairPlan(plan, recipes) {
  const ids = new Set(recipes.map((r) => r.id));
  let result = plan;
  plan.days.forEach((day, i) => {
    SLOTS.forEach(({ key }) => {
      const missing = !day[key] || !ids.has(day[key]);
      if (missing && poolFor(recipes, key).length) {
        result = rerollDish(result, i, key, recipes);
      }
    });
  });
  return result;
}
