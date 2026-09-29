// 冷蔵庫のあまりものから提案：入力した食材とレシピの材料を照合してランキングする（オフライン・AI不使用）

import { GROUP_ORDER, IGNORED_INGREDIENTS, SEASONING_GROUP, groupOf } from './data/ingredients.js';

/** カタカナ→ひらがな・空白除去・小文字化で表記ゆれを吸収する */
export function normalizeTerm(s) {
  return String(s ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\u30a1-\u30f6]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60))
    .replace(/\s+/g, '');
}

// よくある言い換え（入力した言葉 → 材料名に含まれる言葉）。キーは normalizeTerm 後の形。
const ALIASES = {
  たまねぎ: ['玉ねぎ'], 玉葱: ['玉ねぎ'], ねぎ: ['長ねぎ'], 葱: ['長ねぎ'], 白ねぎ: ['長ねぎ'],
  人参: ['にんじん'], じゃが芋: ['じゃがいも'], 馬鈴薯: ['じゃがいも'], さつま芋: ['さつまいも'],
  たまご: ['卵'], 玉子: ['卵'], 鶏卵: ['卵'], とうふ: ['豆腐'],
  豚肉: ['豚'], ぶたにく: ['豚'], 鶏肉: ['鶏'], とりにく: ['鶏'], 牛肉: ['牛こま', '牛もも'], ぎゅうにく: ['牛こま'],
  ひきにく: ['ひき肉'], ひき肉: ['ひき肉'], みんち: ['ひき肉'],
  さけ: ['鮭'], しゃけ: ['鮭'], 鮭: ['鮭'], えび: ['えび'], 海老: ['えび'],
  きのこ: ['しめじ', 'えのき', 'しいたけ', 'えりんぎ', 'なめこ'],
  そーせーじ: ['ういんなー'], うぃんなー: ['ういんなー'], つな: ['つな'],
  とまと缶: ['とまと缶'], 白菜きむち: ['キムチ'], きむち: ['きむち'],
  ぴーまん: ['ぴーまん'], きゃべつ: ['きゃべつ'], 茄子: ['なす'], 胡瓜: ['きゅうり'], 大葉: ['大葉'], しそ: ['大葉'],
};

// 部分一致させたくない組み合わせ（入力 → 除外する材料名）
const EXCLUDES = {
  牛: ['牛乳'],
  大根: ['切り干し大根', 'かいわれ大根'],
  ねぎ: ['玉ねぎ'],
  長ねぎ: ['玉ねぎ'],
  しいたけ: ['干ししいたけ'],
  とまと: ['カットトマト缶', 'クリームコーン缶'],
  卵: [],
};

function expandTerm(term) {
  const t = normalizeTerm(term);
  const alias = ALIASES[t] || ALIASES[term] || [];
  return [t, ...alias.map(normalizeTerm)];
}

/** 入力した1語が材料名にあてはまるか */
export function termMatches(term, ingredientName) {
  const name = normalizeTerm(ingredientName);
  const t = normalizeTerm(term);
  if (!t) return false;
  const excluded = (EXCLUDES[term] || EXCLUDES[t] || []).map(normalizeTerm);
  if (excluded.includes(name)) return false;
  return expandTerm(term).some((x) => x && (name === x || name.includes(x)));
}

/** 買い物や照合の対象になる「主な材料」（調味料・水・ご飯は除く） */
export function keyIngredients(recipe) {
  return (recipe.ingredients || [])
    .map((i) => i.name.trim())
    .filter((n) => n && !IGNORED_INGREDIENTS.has(n) && groupOf(n) !== SEASONING_GROUP);
}

/**
 * 食材リストに合うレシピを、そろっている食材が多い順に並べる。
 * @returns {Array<{ recipe, matched: string[], missing: string[] }>}
 */
export function rankRecipes(recipes, terms) {
  const list = terms.map((t) => String(t).trim()).filter(Boolean);
  if (!list.length) return [];
  return recipes
    .map((recipe) => {
      const key = [...new Set(keyIngredients(recipe))];
      const matched = key.filter((name) => list.some((t) => termMatches(t, name)));
      const missing = key.filter((name) => !matched.includes(name));
      return { recipe, matched, missing };
    })
    .filter((r) => r.matched.length > 0)
    .sort(
      (a, b) =>
        b.matched.length - a.matched.length ||
        a.missing.length - b.missing.length ||
        Number(b.recipe.fav) - Number(a.recipe.fav) ||
        a.recipe.time - b.recipe.time,
    );
}

/** よく使われる食材（レシピに登場する回数が多い順）を売り場ごとにまとめる */
export function commonIngredientGroups(recipes, limit = 48) {
  const counts = new Map();
  recipes.forEach((r) => new Set(keyIngredients(r)).forEach((n) => counts.set(n, (counts.get(n) || 0) + 1)));
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([n]) => n);
  const groups = new Map(GROUP_ORDER.map((g) => [g, []]));
  top.forEach((n) => groups.get(groupOf(n))?.push(n));
  return [...groups.entries()].filter(([, items]) => items.length).map(([name, items]) => ({ name, items }));
}

/** 入力候補用：すべての主な材料名 */
export function allIngredientNames(recipes) {
  return [...new Set(recipes.flatMap(keyIngredients))].sort((a, b) => a.localeCompare(b, 'ja'));
}
