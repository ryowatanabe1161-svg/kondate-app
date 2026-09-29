// 食事（朝ごはん・お弁当・昼ごはん・夕ごはん）の定義（純粋データと小さなヘルパー）
//
// - 夕ごはん（dinner）は従来どおり plan.days に保存（主菜・副菜・汁物）
// - ほかの食事は plan.meals[食事].days に同じ日付で保存する
// - レシピの meals（どの食事に使えるか）と、枠ごとの料理の種類（category）で候補を決める

export const MEAL_KEYS = ['breakfast', 'bento', 'lunch', 'dinner'];

export const MEALS = {
  breakfast: {
    key: 'breakfast', label: '朝ごはん', short: '朝', emoji: '🌅', kcalFactor: 0.8,
    slots: [
      { key: 'staple', label: '主食', short: '主', categories: ['主食'] },
      { key: 'okazu', label: 'おかず', short: '菜', categories: ['主菜', '副菜'], primary: true },
      { key: 'soup', label: '汁物・飲み物', short: '汁', categories: ['汁物', '飲み物・デザート'] },
    ],
  },
  bento: {
    key: 'bento', label: 'お弁当', short: '弁当', emoji: '🍱', kcalFactor: 1,
    slots: [
      { key: 'main', label: '主菜', short: '主', categories: ['主菜'], primary: true },
      { key: 'side1', label: '副菜', short: '副', categories: ['副菜'] },
      { key: 'side2', label: '副菜', short: '副', categories: ['副菜'] },
    ],
  },
  lunch: {
    key: 'lunch', label: '昼ごはん', short: '昼', emoji: '☀️', kcalFactor: 1,
    slots: [
      { key: 'dish', label: '一品', short: '品', categories: ['主菜'], primary: true },
      { key: 'side', label: '小鉢・スープ', short: '小', categories: ['副菜', '汁物'], optional: true },
    ],
  },
  dinner: {
    key: 'dinner', label: '夕ごはん', short: '夕', emoji: '🌙', kcalFactor: 1,
    slots: [
      { key: 'main', label: '主菜', short: '主', categories: ['主菜'], primary: true },
      { key: 'side', label: '副菜', short: '副', categories: ['副菜'] },
      { key: 'soup', label: '汁物', short: '汁', categories: ['汁物'] },
    ],
  },
};

export const ALL_SLOT_KEYS = Object.fromEntries(MEAL_KEYS.map((m) => [m, MEALS[m].slots.map((s) => s.key)]));

// ---- 食事の設定 ----
export const DEFAULT_MEAL_SETTINGS = () => ({
  breakfast: false,
  lunch: false,
  bento: false,
  bentoDays: [1, 2, 3, 4, 5], // お弁当を作る曜日（0=日〜6=土）
  lunchSide: true, // 昼ごはんに小鉢・スープも付ける
});

export function sanitizeMealSettings(value) {
  const d = DEFAULT_MEAL_SETTINGS();
  const v = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const days = Array.isArray(v.bentoDays)
    ? [...new Set(v.bentoDays.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6))].sort()
    : d.bentoDays;
  return {
    breakfast: v.breakfast === true,
    lunch: v.lunch === true,
    bento: v.bento === true,
    bentoDays: days,
    lunchSide: v.lunchSide !== false,
  };
}

/** 献立を作る食事（表示順：朝 → お弁当 → 昼 → 夕）。夕ごはんはいつも含む */
export function enabledMealKeys(settings) {
  const s = sanitizeMealSettings(settings);
  return MEAL_KEYS.filter((m) => m === 'dinner' || s[m]);
}

/** 設定を反映した、その食事の枠（昼の小鉢をオフにしたときなど） */
export function mealSlots(meal, settings) {
  const slots = MEALS[meal].slots;
  if (meal === 'lunch' && settings && sanitizeMealSettings(settings).lunchSide === false) return slots.filter((s) => !s.optional);
  return slots;
}

// ---- レシピと食事 ----
const CATEGORY_DEFAULT_MEALS = { 主食: ['breakfast'], '飲み物・デザート': ['breakfast'] };

/** レシピが使える食事（未指定の自作レシピ・古いデータは種類から決める） */
export function recipeMeals(recipe) {
  const list = Array.isArray(recipe?.meals) ? recipe.meals.filter((m) => MEAL_KEYS.includes(m)) : [];
  if (list.length) return list;
  return CATEGORY_DEFAULT_MEALS[recipe?.category] || ['dinner'];
}

/** その食事・枠の候補レシピ */
export function mealPool(recipes, meal, slotKey) {
  const slot = MEALS[meal].slots.find((s) => s.key === slotKey);
  if (!slot) return [];
  return recipes.filter((r) => slot.categories.includes(r.category) && recipeMeals(r).includes(meal));
}

/** レシピを入れられる枠（食事ごとに最初に合う枠） */
export function slotsForRecipe(recipe, meals = MEAL_KEYS) {
  const fits = recipeMeals(recipe);
  const out = [];
  for (const meal of meals) {
    if (!fits.includes(meal)) continue;
    const slot = MEALS[meal].slots.find((s) => s.categories.includes(recipe.category));
    if (slot) out.push({ meal, slot: slot.key, label: slot.label, mealLabel: MEALS[meal].label });
  }
  return out;
}

/** お弁当を作る日か */
export function isBentoDay(dateKey, settings) {
  const [y, m, d] = dateKey.split('-').map(Number);
  return sanitizeMealSettings(settings).bentoDays.includes(new Date(y, m - 1, d).getDay());
}
