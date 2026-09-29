// 献立の自動生成ロジック（純粋関数：レシピ一覧と献立を受け取り、新しい献立を返す）
//
// opts（すべて省略可）
//   conditions : 献立の条件（平日は時短・節約・ヘルシー・ジャンルの好み）
//   avoid      : できれば使わないレシピIDの集合（例：来週を作るときの今週の料理）
//   base       : 作り直す前の献立。固定（locked / lockedSlots）された日・料理はそのまま残す
//   report     : 配列を渡すと、条件をゆるめたときの理由を push する（画面のトースト用）

import { addDays, shuffle, uid, weekdayIndex, weightedPick } from './lib/util.js';

export const PLAN_DAYS = 7;

export const SLOTS = [
  { key: 'main', category: '主菜' },
  { key: 'side', category: '副菜' },
  { key: 'soup', category: '汁物' },
];

export const SLOT_CATEGORY = Object.fromEntries(SLOTS.map((s) => [s.key, s.category]));

// 同じ日の中でかぶらないようにする「主な食材」（野菜などは重なってもOK）
const PROTEINS = new Set(['肉', '魚', '卵・豆腐']);

// 麺・丼の日は1週間に最大この日数まで
export const NOODLE_MAX_PER_WEEK = 1;
const NOODLE = '麺・丼';

// 星評価による出やすさ：★5はかなり多め、★4は多め、★2は少なめ、★1はほぼ出ない（未評価・★3は標準）
export const RATING_WEIGHT = { 0: 1, 1: 0.02, 2: 0.35, 3: 1, 4: 2, 5: 4 };

// お気に入りは3倍選ばれやすくする × 星評価の重み
const favWeight = (r) => (r.fav ? 3 : 1) * (RATING_WEIGHT[r.rating || 0] ?? 1);

// ジャンルの基本の出やすさ（家庭の献立らしく和食を多めに）
const CUISINE_WEIGHT = { 和: 3, 洋: 2, 中: 2, その他: 1.2 };

// ---- 条件 ----

// 節約：安い食材・高めの食材（材料名で判定）
const CHEAP = /鶏むね|こま切れ|ひき肉|卵|豆腐|厚揚げ|油揚げ|おから|もやし|キャベツ|白菜|大根|玉ねぎ|じゃがいも|ちくわ|ツナ|大豆|納豆|さば|いわし|手羽/;
const PRICEY = /牛|えび|ぶり|かつお（|鮭|かじき|あさり|しじみ|ベーコン|チーズ|生クリーム|パプリカ|バジル|パクチー|ブロック|厚切り|たら/;
const FRIED = /揚げ|フライ|唐揚げ|天ぷら|カツ|竜田|南蛮|とんかつ/;

export const CONDITION_LABELS = { quick: '平日は時短', kcal: 'カロリー目標' };

export const NO_CONDITIONS = Object.freeze({
  quickWeekday: false, quickScope: 'main', quickLimit: 20, relaxWeekend: true,
  budget: false, healthy: false, kcalTarget: null, cuisinePref: 'none',
});

const cond = (c) => ({ ...NO_CONDITIONS, ...(c || {}) });

/** その日に「時短」を適用するか（休日＝土日） */
export function isQuickDay(dateKey, conditions) {
  const c = cond(conditions);
  if (!c.quickWeekday) return false;
  const wd = weekdayIndex(dateKey);
  return !(c.relaxWeekend && (wd === 0 || wd === 6));
}

/** 条件の「好み」を反映した重み（節約・ヘルシー・ジャンル） */
function preferenceWeight(r, c) {
  let w = 1;
  const names = (r.ingredients || []).map((i) => i.name).join(' ');
  const tags = r.tags || [];
  if (c.budget) {
    if (tags.includes('節約')) w *= 3;
    if (CHEAP.test(names)) w *= 1.8;
    if (PRICEY.test(names)) w *= 0.3;
  }
  if (c.healthy) {
    if (tags.includes('ヘルシー')) w *= 3;
    if (FRIED.test(r.name)) w *= 0.25;
    const base = { 主菜: 380, 副菜: 110, 汁物: 90 }[r.category] || 200;
    if (Number(r.kcal) > 0) w *= Math.min(3, Math.max(0.2, (base / r.kcal) ** 1.5));
  }
  if (c.cuisinePref !== 'none' && r.category === '主菜') {
    w *= r.cuisine === c.cuisinePref ? 3.5 : 0.7;
  }
  return w;
}

/** 時間・カロリーの上限を計算するための、各枠の最小値 */
function poolMinimums(recipes) {
  const min = (slot, f) => {
    const vals = poolFor(recipes, slot).map(f).filter((v) => Number.isFinite(v));
    return vals.length ? Math.min(...vals) : 0;
  };
  return {
    time: Object.fromEntries(SLOTS.map(({ key }) => [key, min(key, (r) => Number(r.time) || 0)])),
    kcal: Object.fromEntries(SLOTS.map(({ key }) => [key, min(key, (r) => Number(r.kcal) || 0)])),
  };
}

/**
 * ある日・ある枠のレシピが満たすべき「必須条件」（時短・カロリー目標）。
 * others: その日のほかの枠のレシピ（まだ決まっていない枠は最小値で見積もる）
 */
function hardCondition(c, dateKey, slot, others, mins) {
  const checks = [];
  const reasons = [];
  const rest = (field) =>
    SLOTS.filter((s) => s.key !== slot).reduce((sum, { key }) => sum + (others[key] ? Number(others[key][field]) || 0 : mins[field][key]), 0);
  if (isQuickDay(dateKey, c)) {
    const max = c.quickScope === 'main' ? (slot === 'main' ? c.quickLimit : Infinity) : c.quickLimit - rest('time');
    if (max !== Infinity) {
      checks.push((r) => (Number(r.time) || 0) <= max);
      reasons.push('quick');
    }
  }
  if (c.healthy && c.kcalTarget) {
    const max = c.kcalTarget - rest('kcal');
    checks.push((r) => !(Number(r.kcal) > 0) || Number(r.kcal) <= max);
    reasons.push('kcal');
  }
  return { test: (r) => checks.every((f) => f(r)), reasons, active: checks.length > 0 };
}

/** 主菜用の重み：お気に入り×評価 × ジャンルの出やすさ ÷（その週にすでに出たジャンルの回数+1）× 条件の好み */
function mainWeight(cuisineCounts, c) {
  return (r) =>
    favWeight(r) * preferenceWeight(r, c) * ((CUISINE_WEIGHT[r.cuisine] || 1) / (1 + (cuisineCounts[r.cuisine] || 0)));
}

/** 副菜・汁物用の重み：主菜とジャンルが合うものを選びやすく（和はどれとも合わせやすい） */
function companionWeight(mainRecipe, c) {
  return (r) => {
    let harmony = 1;
    if (mainRecipe) {
      if (r.cuisine === mainRecipe.cuisine) harmony = 3;
      else if (r.cuisine === '和' || mainRecipe.cuisine === '和') harmony = 1;
      else harmony = 0.3; // 例：洋の主菜に中華スープ
    }
    return favWeight(r) * preferenceWeight(r, c) * harmony;
  };
}

const countBy = (items) => items.reduce((c, k) => (k ? ((c[k] = (c[k] || 0) + 1), c) : c), {});

const poolFor = (recipes, slot) => recipes.filter((r) => r.category === SLOT_CATEGORY[slot]);

/** その日・枠が固定されているか */
export function isLocked(day, slot) {
  return !!day && (day.locked === true || (Array.isArray(day.lockedSlots) && day.lockedSlots.includes(slot)));
}

/**
 * 条件を段階的にゆるめながら1品選ぶ。
 * 必須条件（hard）を満たす候補を stages の順に探し、なければ hard を外して同じ順に探す。
 */
function pickWithFallback(pool, stages, weightFn = favWeight, hard = null, report = null) {
  if (hard?.active) {
    for (const s of stages) {
      const candidates = pool.filter((r) => s(r) && hard.test(r));
      if (candidates.length) return weightedPick(candidates, weightFn);
    }
    if (report) hard.reasons.forEach((k) => report.includes(k) || report.push(k));
  }
  for (const s of stages) {
    const candidates = pool.filter(s);
    if (candidates.length) return weightedPick(candidates, weightFn);
  }
  return weightedPick(pool, weightFn);
}

/**
 * 主菜の「主な食材」を n 日分、偏りなく・前日と連続しないように並べる。
 * fixed[i] がある日（固定された主菜）はその食材で確定させる。
 */
function mainIngredientSequence(mains, n, fixed = []) {
  const capacity = {};
  mains.forEach((r) => (capacity[r.main] = (capacity[r.main] || 0) + 1));
  if (capacity[NOODLE] && Object.keys(capacity).length > 1) {
    capacity[NOODLE] = Math.min(capacity[NOODLE], NOODLE_MAX_PER_WEEK);
  }
  const types = shuffle(Object.keys(capacity));
  const counts = Object.fromEntries(types.map((t) => [t, 0]));
  fixed.forEach((t) => t && counts[t] !== undefined && counts[t]++);
  const free = fixed.length ? fixed.filter((t) => !t).length + (n - fixed.length) : n;

  // 1) 固定されていない日数を、食材ごとに均等に割り振る
  for (let i = 0; i < free; i++) {
    let cands = types.filter((t) => counts[t] < capacity[t]);
    if (!cands.length) cands = types;
    const min = Math.min(...cands.map((t) => counts[t]));
    const chosen = shuffle(cands.filter((t) => counts[t] === min))[0];
    counts[chosen]++;
  }
  fixed.forEach((t) => t && counts[t] !== undefined && counts[t]--);

  // 2) 残りが多い食材から、前後の日と違うものを選んで並べる
  const seq = [];
  for (let i = 0; i < n; i++) {
    if (fixed[i]) {
      seq.push(fixed[i]);
      continue;
    }
    const remaining = types.filter((t) => counts[t] > 0);
    let cands = remaining.filter((t) => t !== seq[i - 1] && t !== fixed[i + 1]);
    if (!cands.length) cands = remaining.length ? remaining : types;
    const max = Math.max(...cands.map((t) => counts[t] || 0));
    const chosen = shuffle(cands.filter((t) => (counts[t] || 0) === max))[0];
    seq.push(chosen);
    if (counts[chosen] > 0) counts[chosen]--;
  }
  return seq;
}

/** 副菜・汁物を選ぶ：週内で重複させず、主菜などと主な食材（肉・魚・卵豆腐）がかぶらないように */
function pickCompanion(pool, { mainRecipe, otherRecipe, used, avoid, currentId, hard, report, c }) {
  const clash = new Set([mainRecipe?.main, otherRecipe?.main].filter((m) => PROTEINS.has(m)));
  const notCurrent = (r) => r.id !== currentId;
  const notUsed = (r) => !used.has(r.id);
  const notAvoid = (r) => !avoid?.has(r.id);
  const noClash = (r) => !clash.has(r.main);
  return pickWithFallback(
    pool,
    [
      (r) => notCurrent(r) && notUsed(r) && notAvoid(r) && noClash(r),
      (r) => notCurrent(r) && notUsed(r) && noClash(r),
      (r) => notCurrent(r) && notUsed(r),
      (r) => notCurrent(r) && noClash(r),
      notCurrent,
    ],
    companionWeight(mainRecipe, c),
    hard,
    report,
  );
}

/** 1週間分の献立を新しく作る（base の固定された日・料理は残す） */
export function generateWeek(recipes, startKey, opts = {}) {
  const c = cond(opts.conditions);
  const avoid = opts.avoid instanceof Set ? opts.avoid : new Set(opts.avoid || []);
  const report = opts.report || null;
  const byId = new Map(recipes.map((r) => [r.id, r]));
  const mains = poolFor(recipes, 'main');
  const sides = poolFor(recipes, 'side');
  const soups = poolFor(recipes, 'soup');
  const mins = poolMinimums(recipes);
  const baseDays = new Map((opts.base?.days || []).map((d) => [d.date, d]));

  // 固定された料理を先に確定させる
  const skeleton = Array.from({ length: PLAN_DAYS }, (_, i) => {
    const date = addDays(startKey, i);
    const old = baseDays.get(date);
    const day = { date, main: null, side: null, soup: null, locked: !!old?.locked, lockedSlots: [...(old?.lockedSlots || [])] };
    SLOTS.forEach(({ key }) => {
      if (old && isLocked(old, key) && byId.has(old[key])) day[key] = old[key];
    });
    return day;
  });
  const used = new Set(skeleton.flatMap((d) => [d.main, d.side, d.soup]).filter(Boolean));
  const fixedTypes = skeleton.map((d) => (d.main ? byId.get(d.main).main : null));
  const sequence = mains.length ? mainIngredientSequence(mains, PLAN_DAYS, fixedTypes) : [];
  const cuisineCounts = countBy(skeleton.map((d) => d.main && byId.get(d.main).cuisine));
  let noodleCount = skeleton.filter((d) => d.main && byId.get(d.main).main === NOODLE).length;

  let prevMain = null;
  skeleton.forEach((day, i) => {
    const chosen = { main: byId.get(day.main) || null, side: byId.get(day.side) || null, soup: byId.get(day.soup) || null };
    if (!chosen.main && mains.length) {
      // 洋・中・その他は2日続けない（和と、好みのジャンルは続いてもOK）
      const notSameForeign = (r) => r.cuisine === '和' || r.cuisine === c.cuisinePref || r.cuisine !== prevMain?.cuisine;
      const fresh = (r) => !used.has(r.id) && (r.main !== NOODLE || noodleCount < NOODLE_MAX_PER_WEEK);
      const freshAvoid = (r) => fresh(r) && !avoid.has(r.id);
      const notPrevType = (r) => r.main !== prevMain?.main;
      chosen.main = pickWithFallback(
        mains,
        [
          (r) => r.main === sequence[i] && freshAvoid(r) && notSameForeign(r),
          (r) => r.main === sequence[i] && freshAvoid(r),
          (r) => r.main === sequence[i] && fresh(r),
          (r) => freshAvoid(r) && notPrevType(r),
          (r) => fresh(r) && notPrevType(r),
          fresh,
          (r) => !used.has(r.id),
        ],
        mainWeight(cuisineCounts, c),
        hardCondition(c, day.date, 'main', chosen, mins),
        report,
      );
      if (chosen.main) {
        used.add(chosen.main.id);
        cuisineCounts[chosen.main.cuisine] = (cuisineCounts[chosen.main.cuisine] || 0) + 1;
        if (chosen.main.main === NOODLE) noodleCount++;
      }
    }
    prevMain = chosen.main;
    if (!chosen.side && sides.length) {
      chosen.side = pickCompanion(sides, { mainRecipe: chosen.main, otherRecipe: chosen.soup, used, avoid, c, report, hard: hardCondition(c, day.date, 'side', chosen, mins) });
      if (chosen.side) used.add(chosen.side.id);
    }
    if (!chosen.soup && soups.length) {
      chosen.soup = pickCompanion(soups, { mainRecipe: chosen.main, otherRecipe: chosen.side, used, avoid, c, report, hard: hardCondition(c, day.date, 'soup', chosen, mins) });
      if (chosen.soup) used.add(chosen.soup.id);
    }
    SLOTS.forEach(({ key }) => (day[key] = chosen[key]?.id ?? null));
  });
  return { id: uid('p'), start: startKey, days: skeleton };
}

/** 指定した日の1品だけを選び直す（固定された料理はそのまま） */
export function rerollDish(plan, dayIndex, slot, recipes, opts = {}) {
  const day = plan.days[dayIndex];
  if (!opts.force && isLocked(day, slot)) {
    opts.report?.includes('locked') || opts.report?.push('locked');
    return plan;
  }
  const c = cond(opts.conditions);
  const avoid = opts.avoid instanceof Set ? opts.avoid : new Set(opts.avoid || []);
  const byId = new Map(recipes.map((r) => [r.id, r]));
  const pool = poolFor(recipes, slot);
  const mins = poolMinimums(recipes);
  const used = new Set(
    plan.days.flatMap((d, i) => (i === dayIndex ? [] : [d.main, d.side, d.soup])).filter(Boolean),
  );
  const others = Object.fromEntries(SLOTS.map(({ key }) => [key, key === slot ? null : byId.get(day[key]) || null]));
  const hard = hardCondition(c, day.date, slot, others, mins);

  let picked;
  if (slot === 'main') {
    // 前後の日と主な食材が連続しないように & 1つの食材に偏りすぎないように
    const neighbors = new Set(
      [plan.days[dayIndex - 1], plan.days[dayIndex + 1]]
        .filter(Boolean)
        .map((d) => byId.get(d.main)?.main)
        .filter(Boolean),
    );
    const otherMains = plan.days.filter((_, i) => i !== dayIndex).map((d) => byId.get(d.main)).filter(Boolean);
    const counts = countBy(otherMains.map((r) => r.main));
    const cuisineCounts = countBy(otherMains.map((r) => r.cuisine));
    const typeCount = new Set(pool.map((r) => r.main)).size || 1;
    const maxPerType = Math.ceil(plan.days.length / typeCount);
    const noodleOk = (r) => r.main !== NOODLE || (counts[NOODLE] || 0) < NOODLE_MAX_PER_WEEK;

    // 同じ日の副菜・汁物と主な食材（肉・魚・卵豆腐）がかぶらないように
    const sameDay = new Set([others.side?.main, others.soup?.main].filter((m) => PROTEINS.has(m)));
    const fresh = (r) => r.id !== day.main && !used.has(r.id);
    const freshAvoid = (r) => fresh(r) && !avoid.has(r.id);
    picked = pickWithFallback(
      pool,
      [
        (r) => freshAvoid(r) && noodleOk(r) && !neighbors.has(r.main) && (counts[r.main] || 0) < maxPerType && !sameDay.has(r.main),
        (r) => fresh(r) && noodleOk(r) && !neighbors.has(r.main) && (counts[r.main] || 0) < maxPerType && !sameDay.has(r.main),
        (r) => fresh(r) && noodleOk(r) && !neighbors.has(r.main) && (counts[r.main] || 0) < maxPerType,
        (r) => fresh(r) && noodleOk(r) && !neighbors.has(r.main),
        (r) => fresh(r) && noodleOk(r),
        fresh,
        (r) => r.id !== day.main,
      ],
      mainWeight(cuisineCounts, c),
      hard,
      opts.report,
    );
  } else {
    const otherSlot = slot === 'side' ? 'soup' : 'side';
    picked = pickCompanion(pool, {
      mainRecipe: others.main,
      otherRecipe: others[otherSlot],
      used,
      avoid,
      currentId: day[slot],
      hard,
      report: opts.report,
      c,
    });
  }
  return setDish(plan, dayIndex, slot, picked?.id ?? day[slot]);
}

/** 指定した日の献立をまるごと選び直す（固定された料理はそのまま） */
export function rerollDay(plan, dayIndex, recipes, opts = {}) {
  const report = opts.report;
  return SLOTS.reduce((p, { key }) => {
    if (isLocked(p.days[dayIndex], key)) return p;
    return rerollDish(p, dayIndex, key, recipes, { ...opts, report });
  }, plan);
}

/** 指定した日の1品を、選んだレシピに差し替える（固定フラグは保つ） */
export function setDish(plan, dayIndex, slot, recipeId) {
  const days = plan.days.map((d, i) => (i === dayIndex ? { ...d, [slot]: recipeId } : d));
  return { ...plan, days };
}

/** 日の固定を切り替える */
export function setDayLock(plan, dayIndex, locked) {
  const days = plan.days.map((d, i) => (i === dayIndex ? { ...d, locked: !!locked, lockedSlots: locked ? d.lockedSlots || [] : [] } : d));
  return { ...plan, days };
}

/** 料理ごとの固定を切り替える */
export function setDishLock(plan, dayIndex, slot, locked) {
  const days = plan.days.map((d, i) => {
    if (i !== dayIndex) return d;
    // 日ごと固定されていた日の1品だけ解除するときは、残りの料理を料理ごとの固定に切り替える
    const set = new Set(!locked && d.locked ? SLOTS.map((s) => s.key) : d.lockedSlots || []);
    locked ? set.add(slot) : set.delete(slot);
    return { ...d, lockedSlots: SLOTS.map((s) => s.key).filter((k) => set.has(k)), locked: locked ? d.locked : false };
  });
  return { ...plan, days };
}

/** 2つの日の献立を入れ替える（日付はそのまま）。固定された日は入れ替えない */
export function swapDays(plan, a, b) {
  const dayA = plan.days[a];
  const dayB = plan.days[b];
  if (SLOTS.some(({ key }) => isLocked(dayA, key) || isLocked(dayB, key))) return plan;
  const menu = (d) => ({ main: d.main, side: d.side, soup: d.soup });
  const days = plan.days.map((d, i) => {
    if (i === a) return { ...d, ...menu(dayB) };
    if (i === b) return { ...d, ...menu(dayA) };
    return d;
  });
  return { ...plan, days };
}

/** 削除されたレシピなど、存在しないIDを含む枠を埋め直す（固定されていても埋め直す） */
export function repairPlan(plan, recipes, opts = {}) {
  const ids = new Set(recipes.map((r) => r.id));
  let result = plan;
  plan.days.forEach((day, i) => {
    SLOTS.forEach(({ key }) => {
      const missing = !day[key] || !ids.has(day[key]);
      if (missing && poolFor(recipes, key).length) {
        result = rerollDish(result, i, key, recipes, { ...opts, force: true });
      }
    });
  });
  return result;
}
