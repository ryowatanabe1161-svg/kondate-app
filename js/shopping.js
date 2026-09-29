// 献立から買い物リストを作る（材料の合算・売り場ごとのグループ分け）

import { GROUP_ORDER, IGNORED_INGREDIENTS, groupOf } from './data/ingredients.js';

// 「大さじ1.5」「200g」「1/2個」などを { prefix, value, suffix } に分解する
const AMOUNT_RE = /^(大さじ|小さじ|カップ)?\s*(\d+(?:\.\d+)?(?:\/\d+)?)\s*(.*)$/;

function toHalfWidth(s) {
  return s.replace(/[０-９．／]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0));
}

export function parseAmount(text) {
  const s = toHalfWidth(String(text ?? '').trim());
  const m = s.match(AMOUNT_RE);
  if (!m) return { text: s };
  const [, prefix = '', num, suffix] = m;
  const value = num.includes('/')
    ? Number(num.split('/')[0]) / Number(num.split('/')[1])
    : Number(num);
  if (!Number.isFinite(value)) return { text: s };
  return { prefix, value, suffix: suffix.trim() };
}

function fractionText(whole, n, d) {
  const f = `${n}/${d}`;
  return whole ? `${whole}と${f}` : f;
}

/**
 * 数値を読みやすく表示する。
 * 0.5 → "1/2"、1.5 → "1と1/2"、0.833… → "5/6"、2 → "2"、37.5（10以上）→ "38"
 * きれいな分数にならない小さな値は 1/8 単位に丸める（例：3/16 → "1/4"）。
 */
export function formatNumber(v) {
  const rounded = Math.round(v);
  if (Math.abs(v - rounded) < 1e-6) return String(rounded);
  if (v >= 10) return String(rounded); // 225g や 37.5g → 38g のように整数で
  const whole = Math.floor(v);
  const frac = v - whole;
  for (const d of [2, 3, 4, 6, 8, 12]) {
    const n = frac * d;
    if (Math.abs(n - Math.round(n)) < 1e-6) return fractionText(whole, Math.round(n), d);
  }
  // 1/8 単位に丸めて約分（0 にはしない）
  let eighths = Math.max(1, Math.round(v * 8));
  const w = Math.floor(eighths / 8);
  let n = eighths % 8;
  if (n === 0) return String(w);
  let d = 8;
  while (n % 2 === 0) { n /= 2; d /= 2; }
  return fractionText(w, n, d);
}

/** 1つの分量を factor 倍する（「適量」「少々」など数値でないものはそのまま） */
export function scaleAmount(text, factor = 1) {
  const p = parseAmount(text);
  if ('text' in p) return p.text;
  if (factor === 1) return String(text).trim();
  return `${p.prefix}${formatNumber(p.value * factor)}${p.suffix}`;
}

/** 同じ単位どうしは足し算し（factor 倍して）、「少々」「適量」などはそのまま並べる */
export function mergeAmounts(amounts, factor = 1) {
  const sums = new Map(); // key: prefix|suffix
  const texts = [];
  for (const a of amounts) {
    const p = parseAmount(a);
    if ('text' in p) {
      if (p.text && !texts.includes(p.text)) texts.push(p.text);
      continue;
    }
    const key = `${p.prefix}|${p.suffix}`;
    const cur = sums.get(key) || { ...p, value: 0 };
    cur.value += p.value * factor;
    sums.set(key, cur);
  }
  const parts = [...sums.values()].map((p) => `${p.prefix}${formatNumber(p.value)}${p.suffix}`);
  return [...parts, ...texts].join('＋');
}

/**
 * @param {Array<{recipes?: object[], main?, side?, soup?}>} days レシピに解決済みの献立（recipes があればすべての食事の料理）
 * @param {number} factor 分量の倍率（人数 / 2）
 * @returns {Array<{ name: string, items: Array<{ name, amount, dishes: string[] }> }>}
 */
export function buildShoppingList(days, factor = 1) {
  const byName = new Map();
  for (const day of days) {
    for (const recipe of day.recipes || [day.main, day.side, day.soup]) {
      if (!recipe) continue;
      for (const ing of recipe.ingredients || []) {
        const name = ing.name.trim();
        if (!name || IGNORED_INGREDIENTS.has(name)) continue;
        const entry = byName.get(name) || { name, amounts: [], dishes: [] };
        entry.amounts.push(ing.amount);
        if (!entry.dishes.includes(recipe.name)) entry.dishes.push(recipe.name);
        byName.set(name, entry);
      }
    }
  }

  const groups = new Map(GROUP_ORDER.map((g) => [g, []]));
  for (const entry of byName.values()) {
    const group = groupOf(entry.name);
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push({ name: entry.name, amount: mergeAmounts(entry.amounts, factor), dishes: entry.dishes });
  }
  return [...groups.entries()]
    .filter(([, items]) => items.length)
    .map(([name, items]) => ({ name, items }));
}
