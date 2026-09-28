// localStorage への保存・読み込みと、レシピ／献立データへのアクセス

import { BUILTIN_RECIPES } from './data/recipes.js';

const STORAGE_KEY = 'kondate.v1';

/** 組み込みレシピ・自作レシピの分量は常に「2人分」で保存する */
export const BASE_SERVINGS = 2;
export const SERVING_OPTIONS = [1, 2, 3, 4];

const DEFAULT_STATE = () => ({
  version: 1,
  customRecipes: [], // ユーザーが追加したレシピ
  favorites: [], // お気に入りのレシピID
  plan: null, // { id, start: 'YYYY-MM-DD', days: [{ date, main, side, soup }] }
  shopping: { planId: null, checked: [], extras: [] }, // 買い物リストのチェック状態
  servings: BASE_SERVINGS, // 何人分で作るか（1〜4人）
});

let state = load();

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE();
    return { ...DEFAULT_STATE(), ...JSON.parse(raw) };
  } catch (err) {
    console.warn('保存データを読み込めませんでした。初期状態で開始します。', err);
    return DEFAULT_STATE();
  }
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.warn('保存に失敗しました', err);
  }
}

// ---- レシピ ----

/** 組み込み＋自作レシピ（fav フラグ付き）を返す */
export function allRecipes() {
  const favs = new Set(state.favorites);
  return [...BUILTIN_RECIPES, ...state.customRecipes].map((r) => ({ ...r, fav: favs.has(r.id) }));
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
  const i = state.customRecipes.findIndex((r) => r.id === clean.id);
  if (i >= 0) state.customRecipes[i] = clean;
  else state.customRecipes.push(clean);
  save();
}

export function deleteCustomRecipe(id) {
  state.customRecipes = state.customRecipes.filter((r) => r.id !== id);
  state.favorites = state.favorites.filter((f) => f !== id);
  save();
}

// ---- 献立 ----

export function getPlan() {
  return state.plan;
}

export function setPlan(plan) {
  state.plan = plan;
  save();
}

// ---- 買い物リスト ----

export function getShopping() {
  // 献立を作り直したらチェック状態はリセット（追加した項目は残す）
  if (state.plan && state.shopping.planId !== state.plan.id) {
    state.shopping = { planId: state.plan.id, checked: [], extras: state.shopping.extras || [] };
    save();
  }
  return state.shopping;
}

export function setShopping(shopping) {
  state.shopping = shopping;
  save();
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

// ---- 全体 ----

export function resetAll() {
  state = DEFAULT_STATE();
  save();
}
