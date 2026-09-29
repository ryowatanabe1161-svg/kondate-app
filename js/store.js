// localStorage への保存・読み込みと、レシピ／献立データへのアクセス

import { BUILTIN_RECIPES, normalizeRecipe } from './data/recipes.js';

const STORAGE_KEY = 'kondate.v1'; // キー名は初期版から据え置き（中身の version で移行を管理）
const CURRENT_VERSION = 4;

export const RATING_MAX = 5;

/** 組み込みレシピ・自作レシピの分量は常に「2人分」で保存する */
export const BASE_SERVINGS = 2;
export const SERVING_OPTIONS = [1, 2, 3, 4];

// ---- 献立の条件 ----
export const QUICK_LIMITS = { main: [15, 20, 30], total: [30, 40, 45, 60] };
export const KCAL_TARGETS = [500, 600, 700, 800];
export const CUISINE_PREFS = ['none', '和', '洋', '中'];

export const DEFAULT_CONDITIONS = () => ({
  quickWeekday: false, // 平日は時短
  quickScope: 'main', // 'main'（主菜の調理時間） | 'total'（3品の合計）
  quickLimit: 20, // 分
  relaxWeekend: true, // 休日（土日）は時短にしない
  budget: false, // 節約モード
  healthy: false, // ヘルシーモード
  kcalTarget: null, // ヘルシーモードの1日（夕食1食）のカロリー目標（1人分）。null は目標なし
  cuisinePref: 'none', // ジャンルの好み（'none' | '和' | '洋' | '中'）
});

/** 保存データの条件を安全な値にそろえる */
export function sanitizeConditions(value) {
  const d = DEFAULT_CONDITIONS();
  const v = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const c = {
    quickWeekday: v.quickWeekday === true,
    quickScope: v.quickScope === 'total' ? 'total' : 'main',
    quickLimit: Number(v.quickLimit),
    relaxWeekend: v.relaxWeekend !== false,
    budget: v.budget === true,
    healthy: v.healthy === true,
    kcalTarget: KCAL_TARGETS.includes(Number(v.kcalTarget)) ? Number(v.kcalTarget) : null,
    cuisinePref: CUISINE_PREFS.includes(v.cuisinePref) ? v.cuisinePref : 'none',
  };
  if (!QUICK_LIMITS[c.quickScope].includes(c.quickLimit)) c.quickLimit = c.quickScope === 'main' ? d.quickLimit : 40;
  return c;
}

const SLOT_KEYS = ['main', 'side', 'soup'];

/** 献立データを安全な形にそろえる（固定フラグを含む）。壊れていれば null */
function sanitizePlan(plan) {
  if (!plan || typeof plan !== 'object' || !Array.isArray(plan.days) || typeof plan.start !== 'string') return null;
  return {
    ...plan,
    days: plan.days.map((d) => ({
      ...d,
      locked: d.locked === true,
      lockedSlots: Array.isArray(d.lockedSlots) ? SLOT_KEYS.filter((k) => d.lockedSlots.includes(k)) : [],
    })),
  };
}

const emptyShopping = (planId = null) => ({ planId, checked: [], extras: [] });

function sanitizeShopping(value) {
  const s = { ...emptyShopping(), ...(value && typeof value === 'object' ? value : {}) };
  if (!Array.isArray(s.checked)) s.checked = [];
  if (!Array.isArray(s.extras)) s.extras = [];
  return s;
}

const DEFAULT_STATE = () => ({
  version: CURRENT_VERSION,
  customRecipes: [], // ユーザーが追加したレシピ
  favorites: [], // お気に入りのレシピID
  plan: null, // 今週 { id, start: 'YYYY-MM-DD', days: [{ date, main, side, soup, locked, lockedSlots }] }
  nextPlan: null, // 来週（今週の最終日の翌日から7日分。作ったときだけ）
  shopping: emptyShopping(), // 今週の買い物リストのチェック状態
  shoppingNext: emptyShopping(), // 来週の買い物リスト
  conditions: DEFAULT_CONDITIONS(), // 献立の条件
  servings: BASE_SERVINGS, // 何人分で作るか（1〜4人）
  fridge: [], // 冷蔵庫にある食材（提案機能で選んだもの）
  ratings: {}, // レシピの星評価 { レシピID: 1〜5 }（未評価は含めない）
});

let state = load();

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE();
    return migrate(JSON.parse(raw));
  } catch (err) {
    console.warn('保存データを読み込めませんでした。初期状態で開始します。', err);
    return DEFAULT_STATE();
  }
}

/**
 * 古い保存データを現在の形式にそろえる。
 * v1（初期版）→ v2: 冷蔵庫の食材リストを追加。自作レシピのジャンル等は読み込み時に補完する。
 * v2 → v3: レシピの星評価（ratings）を追加。壊れた値は捨てる。
 * v3 → v4: 献立の条件・来週の献立・来週の買い物リスト・日／料理の固定フラグを追加。
 */
function migrate(saved) {
  const base = DEFAULT_STATE();
  const s = { ...base, ...saved };
  s.customRecipes = Array.isArray(s.customRecipes) ? s.customRecipes : [];
  s.favorites = Array.isArray(s.favorites) ? s.favorites : [];
  s.fridge = Array.isArray(s.fridge) ? s.fridge : [];
  s.ratings = sanitizeRatings(s.ratings);
  s.shopping = sanitizeShopping(s.shopping);
  s.shoppingNext = sanitizeShopping(s.shoppingNext);
  s.conditions = sanitizeConditions(s.conditions);
  s.plan = sanitizePlan(s.plan);
  s.nextPlan = sanitizePlan(s.nextPlan);
  if (s.version !== CURRENT_VERSION) {
    s.version = CURRENT_VERSION;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    } catch {
      /* 保存できなくても表示は続ける */
    }
  }
  return s;
}

function sanitizeRatings(value) {
  const out = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return out;
  for (const [id, n] of Object.entries(value)) {
    const v = Number(n);
    if (id && Number.isInteger(v) && v >= 1 && v <= RATING_MAX) out[id] = v;
  }
  return out;
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.warn('保存に失敗しました', err);
  }
}

// ---- レシピ ----

/** 組み込み＋自作レシピ（fav フラグ・rating 付き。rating は未評価なら 0）を返す */
export function allRecipes() {
  const favs = new Set(state.favorites);
  return [...BUILTIN_RECIPES, ...state.customRecipes.map(normalizeRecipe)].map((r) => ({
    ...r,
    fav: favs.has(r.id),
    rating: state.ratings[r.id] || 0,
  }));
}

export function getRecipe(id) {
  return allRecipes().find((r) => r.id === id) || null;
}

export function isFavorite(id) {
  return state.favorites.includes(id);
}

export function toggleFavorite(id) {
  state.favorites = isFavorite(id)
    ? state.favorites.filter((f) => f !== id)
    : [...state.favorites, id];
  save();
  return isFavorite(id);
}

export function saveCustomRecipe(recipe) {
  const clean = { ...recipe, builtin: false };
  delete clean.fav;
  delete clean.rating; // 評価は ratings に別で保存する
  delete clean.pfc; // 自作レシピの栄養はカロリーから推定する
  const i = state.customRecipes.findIndex((r) => r.id === clean.id);
  if (i >= 0) state.customRecipes[i] = clean;
  else state.customRecipes.push(clean);
  save();
}

export function deleteCustomRecipe(id) {
  state.customRecipes = state.customRecipes.filter((r) => r.id !== id);
  state.favorites = state.favorites.filter((f) => f !== id);
  delete state.ratings[id];
  save();
}

// ---- 星評価 ----

export function getRating(id) {
  return state.ratings[id] || 0;
}

/** 1〜5 で評価を付ける。0 を渡すと評価を消す */
export function setRating(id, n) {
  const v = Number(n);
  if (Number.isInteger(v) && v >= 1 && v <= RATING_MAX) state.ratings[id] = v;
  else delete state.ratings[id];
  save();
  return getRating(id);
}

// ---- 献立 ----

// week: 'this'（今週） | 'next'（来週）
const PLAN_KEY = { this: 'plan', next: 'nextPlan' };
const SHOP_KEY = { this: 'shopping', next: 'shoppingNext' };

export function getPlan(week = 'this') {
  return state[PLAN_KEY[week] || 'plan'];
}

export function setPlan(plan, week = 'this') {
  state[PLAN_KEY[week] || 'plan'] = plan;
  save();
}

/** 今週が終わったとき：来週の献立と買い物リストをそのまま今週にする（作り直さない） */
export function rolloverToNextWeek() {
  state.plan = state.nextPlan;
  state.nextPlan = null;
  state.shopping = state.shoppingNext;
  state.shoppingNext = emptyShopping();
  save();
}

// ---- 買い物リスト ----

export function getShopping(week = 'this') {
  const key = SHOP_KEY[week] || 'shopping';
  const plan = getPlan(week);
  // 献立を作り直したらチェック状態はリセット（追加した項目は残す）
  if (plan && state[key].planId !== plan.id) {
    state[key] = { planId: plan.id, checked: [], extras: state[key].extras || [] };
    save();
  }
  return state[key];
}

export function setShopping(shopping, week = 'this') {
  state[SHOP_KEY[week] || 'shopping'] = shopping;
  save();
}

// ---- 献立の条件 ----

export function getConditions() {
  return { ...state.conditions };
}

export function setConditions(conditions) {
  state.conditions = sanitizeConditions({ ...state.conditions, ...conditions });
  save();
  return getConditions();
}

// ---- 人数設定 ----

export function getServings() {
  return SERVING_OPTIONS.includes(state.servings) ? state.servings : BASE_SERVINGS;
}

export function setServings(n) {
  if (!SERVING_OPTIONS.includes(n)) return;
  state.servings = n;
  save();
}

/** レシピの分量（2人分）に掛ける倍率 */
export function servingFactor() {
  return getServings() / BASE_SERVINGS;
}

// ---- 冷蔵庫の食材 ----

export function getFridge() {
  return [...state.fridge];
}

export function setFridge(items) {
  state.fridge = [...new Set(items.map((s) => String(s).trim()).filter(Boolean))];
  save();
}

// ---- 全体 ----

export function resetAll() {
  state = DEFAULT_STATE();
  save();
}
