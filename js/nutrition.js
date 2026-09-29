// カロリー・栄養の「目安」を計算する（純粋関数）
//
// - kcal は各レシピの1人分の目安（ご飯は含まない。丼・麺類は主食込み）
// - P/F/C（たんぱく質・脂質・炭水化物 g）は組み込みレシピには js/data/nutrients.js の目安値を使い、
//   自作レシピはカロリーと料理の種類・材料から大まかに推定する
// - バランスは材料名から「たんぱく源」「野菜の種類」「主食・炭水化物」を数えたもの

import { groupOf } from './data/ingredients.js';

/** ご飯1膳（150g）の目安（表示の注記用） */
export const RICE_KCAL = 234;

// ---- P/F/C の推定（エネルギー比: たんぱく質・脂質・炭水化物） ----

const BASE_PROFILE = {
  '主菜:肉': [0.28, 0.5, 0.22],
  '主菜:魚': [0.38, 0.38, 0.24],
  '主菜:卵・豆腐': [0.3, 0.52, 0.18],
  '主菜:麺・丼': [0.16, 0.26, 0.58],
  '副菜:肉': [0.26, 0.46, 0.28],
  '副菜:魚': [0.32, 0.36, 0.32],
  '副菜:卵・豆腐': [0.28, 0.48, 0.24],
  '副菜:野菜': [0.1, 0.45, 0.45],
  '副菜:海藻・きのこ': [0.15, 0.4, 0.45],
  '汁物:肉': [0.28, 0.4, 0.32],
  '汁物:魚': [0.34, 0.3, 0.36],
  '汁物:卵・豆腐': [0.32, 0.4, 0.28],
};
const DEFAULT_PROFILE = { 主菜: [0.26, 0.46, 0.28], 副菜: [0.12, 0.42, 0.46], 汁物: [0.24, 0.34, 0.42] };

const FRIED = /揚げ|フライ|唐揚げ|天ぷら|カツ|竜田|春巻|コロッケ/;
const LEAN = /ささみ|むね|たら|えび|いか|たこ|かじき|まぐろ|かつお（|豆腐|おから/;
const FATTY = /バラ|ベーコン|ソーセージ|ウインナー|ひき肉|さば|さんま|ぶり|いわし|チーズ|生クリーム|バター|マヨネーズ|練りごま|手羽/;
const STARCHY = /じゃがいも|さつまいも|里芋|かぼちゃ|春雨|マカロニ|スパゲッティ|パスタ|れんこん|コーン|皮$|ルウ/;

/** カロリーと料理の特徴から P/F/C（g, 1人分）を推定する */
export function estimatePFC(recipe) {
  const kcal = Number(recipe.kcal);
  if (!(kcal > 0)) return null;
  const names = (recipe.ingredients || []).map((i) => i.name).join(' ');
  let [p, f, c] = BASE_PROFILE[`${recipe.category}:${recipe.main}`] || DEFAULT_PROFILE[recipe.category] || [0.2, 0.4, 0.4];
  if (FRIED.test(recipe.name) || /揚げ油/.test(names)) [p, f, c] = [p - 0.06, f + 0.12, c - 0.06];
  if (LEAN.test(names)) [p, f, c] = [p + 0.08, f - 0.1, c + 0.02];
  if (FATTY.test(names)) [p, f, c] = [p - 0.03, f + 0.07, c - 0.04];
  if (STARCHY.test(names) && recipe.main !== '麺・丼') [p, f, c] = [p - 0.07, f - 0.08, c + 0.15];
  if ((recipe.tags || []).includes('ヘルシー')) [p, f, c] = [p + 0.03, f - 0.05, c + 0.02];
  [p, f, c] = [p, f, c].map((x) => Math.max(0.05, x));
  const sum = p + f + c;
  return {
    p: Math.round((kcal * (p / sum)) / 4),
    f: Math.round((kcal * (f / sum)) / 9),
    c: Math.round((kcal * (c / sum)) / 4),
  };
}

/** レシピの P/F/C（データにあればそれ、なければ推定） */
export function pfcOf(recipe) {
  if (!recipe) return null;
  const v = recipe.pfc;
  if (v && [v.p, v.f, v.c].every((x) => Number.isFinite(x) && x >= 0)) return v;
  return estimatePFC(recipe);
}

// ---- 材料からのバランス判定 ----

// 飾り・薬味程度で「野菜1種」と数えないもの
const GARNISH = new Set(['水', 'ご飯', '生姜', 'レモン', 'パセリ', 'バジル', '大葉', 'パクチー', '三つ葉', '紅しょうが', '青のり', 'にんにく']);
const TUBERS = /じゃがいも|さつまいも|里芋|長いも|山芋/;
// 乾物・缶詰でも野菜・きのこ・海藻として数えるもの
const VEG_EXTRA = /干ししいたけ|たけのこ|キムチ|トマト缶|ひじき|わかめ|切り干し大根|コーン|昆布|もずく|めかぶ/;
const PROTEIN_EXTRA = /大豆|納豆|厚揚げ|油揚げ/;
const PROTEIN_SKIP = /牛乳|粉チーズ|ヨーグルト|かつお節/;
const CARB = /ご飯|麺|うどん|そば|スパゲッティ|パスタ|マカロニ|春雨|餅|パン$|皮$|じゃがいも|さつまいも|里芋|長いも/;

export function isVegetable(name) {
  const n = name.trim();
  if (GARNISH.has(n) || TUBERS.test(n) || /塩昆布/.test(n)) return false;
  return groupOf(n) === '野菜・きのこ' || VEG_EXTRA.test(n);
}

export function isProteinSource(name) {
  const n = name.trim();
  if (PROTEIN_SKIP.test(n)) return false;
  const g = groupOf(n);
  return g === '肉・魚' || g === '卵・豆腐・乳製品' || PROTEIN_EXTRA.test(n);
}

export const isCarbSource = (name) => CARB.test(name.trim());

/** 1食分（主菜・副菜・汁物のレシピ配列）の目安 */
export function mealNutrition(recipes) {
  const list = recipes.filter(Boolean);
  let kcal = 0;
  let unknown = 0;
  const pfc = { p: 0, f: 0, c: 0 };
  const veg = new Set();
  let proteinDishes = 0;
  let carbDishes = 0;
  for (const r of list) {
    if (Number(r.kcal) > 0) kcal += Number(r.kcal);
    else unknown++;
    const n = pfcOf(r);
    if (n) (pfc.p += n.p), (pfc.f += n.f), (pfc.c += n.c);
    const names = (r.ingredients || []).map((i) => i.name);
    names.filter(isVegetable).forEach((v) => veg.add(v));
    if (names.some(isProteinSource) || ['肉', '魚', '卵・豆腐'].includes(r.main)) proteinDishes++;
    if (names.some(isCarbSource)) carbDishes++;
  }
  const staple = list.some((r) => r.main === '麺・丼');
  return {
    kcal,
    unknown,
    pfc,
    vegKinds: veg.size,
    vegNames: [...veg],
    proteinDishes,
    carbDishes,
    staple, // 主食（麺・丼）が含まれるか。含まれない場合はご飯を添える前提
    protein: pfc.p >= 20 && proteinDishes ? 'good' : proteinDishes ? 'ok' : 'low',
    vegetable: veg.size >= 5 ? 'good' : veg.size >= 3 ? 'ok' : 'low',
  };
}

/** 1週間分（各日のレシピ配列の配列）の目安 */
export function weekNutrition(daysRecipes) {
  const meals = daysRecipes.map(mealNutrition);
  const n = meals.length || 1;
  const totalKcal = meals.reduce((s, m) => s + m.kcal, 0);
  const sum = (k) => meals.reduce((s, m) => s + m.pfc[k], 0);
  return {
    meals,
    days: meals.length,
    totalKcal,
    avgKcal: Math.round(totalKcal / n),
    unknown: meals.reduce((s, m) => s + m.unknown, 0),
    avgPfc: { p: Math.round(sum('p') / n), f: Math.round(sum('f') / n), c: Math.round(sum('c') / n) },
    avgVegKinds: Math.round((meals.reduce((s, m) => s + m.vegKinds, 0) / n) * 10) / 10,
    proteinDays: meals.filter((m) => m.protein !== 'low').length,
    proteinGoodDays: meals.filter((m) => m.protein === 'good').length,
    vegDays: meals.filter((m) => m.vegetable !== 'low').length,
    vegGoodDays: meals.filter((m) => m.vegetable === 'good').length,
    stapleDays: meals.filter((m) => m.staple).length,
  };
}

export const LEVEL_MARK = { good: '◎', ok: '○', low: '△' };
