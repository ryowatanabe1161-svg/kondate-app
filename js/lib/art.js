// 料理のイラスト（手描き風のインラインSVG＋大きな絵文字）。外部画像は使わずオフラインで表示できる。

import { esc } from './util.js';

const BREAD = /パン|トースト|サンド|ホットケーキ|パンケーキ|ベーグル|マフィン|ワッフル|グラノーラ|シリアル/;

/** 料理の「器」の種類 */
export function dishKind(recipe) {
  const name = recipe?.name || '';
  switch (recipe?.category) {
    case '汁物': return 'soup';
    case '副菜': return 'kobachi';
    case '飲み物・デザート': return 'cup';
    case '主食': return BREAD.test(name) ? 'board' : 'rice';
    default:
      if (BREAD.test(name) && recipe?.main === 'ご飯・パン') return 'board';
      if (recipe?.main === '麺・丼' || recipe?.main === 'ご飯・パン') return 'bowl';
      return 'plate';
  }
}

/** 色合い（カテゴリごとのやさしい背景色） */
export function artTone(recipe) {
  return { 主菜: 'main', 副菜: 'side', 汁物: 'soup', 主食: 'staple', '飲み物・デザート': 'drink' }[recipe?.category] || 'main';
}

// viewBox 0 0 100 100。色はCSS（.a-*）で付ける
const VESSEL = {
  plate: `
    <ellipse class="a-shadow" cx="50" cy="80" rx="40" ry="8"/>
    <ellipse class="a-dish" cx="50" cy="68" rx="44" ry="17"/>
    <ellipse class="a-rim" cx="50" cy="66" rx="32" ry="11"/>
    <path class="a-line" d="M14 70q36 14 72 0" fill="none"/>`,
  bowl: `
    <ellipse class="a-shadow" cx="50" cy="86" rx="30" ry="6"/>
    <path class="a-dish" d="M12 56h76q-3 28-38 30Q15 84 12 56z"/>
    <path class="a-accent" d="M17 66h66q-2 5-5 8H22q-3-3-5-8z"/>
    <ellipse class="a-rim" cx="50" cy="56" rx="38" ry="7"/>
    <rect class="a-dish" x="40" y="84" width="20" height="5" rx="2"/>`,
  kobachi: `
    <ellipse class="a-shadow" cx="50" cy="84" rx="26" ry="5"/>
    <path class="a-dish" d="M20 60h60q-4 22-30 24Q24 82 20 60z"/>
    <circle class="a-accent" cx="36" cy="71" r="2.6"/><circle class="a-accent" cx="50" cy="75" r="2.6"/><circle class="a-accent" cx="64" cy="71" r="2.6"/>
    <ellipse class="a-rim" cx="50" cy="60" rx="30" ry="6"/>`,
  soup: `
    <path class="a-steam" d="M38 30q-6-7 0-13t0-13" fill="none"/>
    <path class="a-steam s2" d="M52 28q-6-7 0-13t0-13" fill="none"/>
    <path class="a-steam s3" d="M66 30q-6-7 0-13t0-13" fill="none"/>
    <ellipse class="a-shadow" cx="50" cy="86" rx="28" ry="6"/>
    <path class="a-accent" d="M14 56h72q-3 28-36 30Q17 84 14 56z"/>
    <path class="a-dish" d="M20 62h60q-3 18-30 20Q23 80 20 62z" opacity=".25"/>
    <ellipse class="a-rim" cx="50" cy="56" rx="36" ry="7"/>`,
  rice: `
    <ellipse class="a-shadow" cx="50" cy="86" rx="26" ry="5"/>
    <path class="a-dish" d="M18 58h64q-3 25-32 27Q21 83 18 58z"/>
    <path class="a-accent" d="M26 70q6-4 12 0t12 0 12 0 12 0" fill="none" stroke-width="3"/>
    <ellipse class="a-rim" cx="50" cy="58" rx="32" ry="6"/>`,
  board: `
    <ellipse class="a-shadow" cx="50" cy="84" rx="40" ry="6"/>
    <rect class="a-wood" x="10" y="58" width="72" height="22" rx="10"/>
    <rect class="a-wood" x="78" y="64" width="16" height="10" rx="5"/>
    <path class="a-line" d="M20 66h40M26 72h32" fill="none"/>`,
  cup: `
    <ellipse class="a-shadow" cx="50" cy="88" rx="22" ry="5"/>
    <path class="a-straw" d="M58 20l-6 44" fill="none"/>
    <path class="a-glass" d="M28 44h44l-6 42H34z"/>
    <path class="a-accent" d="M31 60h38l-3 26H34z" opacity=".55"/>
    <ellipse class="a-rim" cx="50" cy="44" rx="22" ry="4"/>`,
};

/**
 * 料理のイラスト（器のSVGの上に大きな絵文字）
 * @param {object} recipe
 * @param {{size?: 'sm'|'md'|'lg', className?: string}} [opts]
 */
export function foodArt(recipe, { size = 'md', className = '' } = {}) {
  const kind = dishKind(recipe);
  return `<span class="food-art art-${size} kind-${kind} tone-${artTone(recipe)} ${className}" aria-hidden="true">
    <svg class="art-svg" viewBox="0 0 100 100" focusable="false">${VESSEL[kind]}</svg>
    <span class="art-emoji">${esc(recipe?.emoji || '🍽️')}</span>
  </span>`;
}

// きらきら・湯気・葉っぱの飾り
const SPARKLE = '<path d="M0-8C1-2 2-1 8 0 2 1 1 2 0 8-1 2-2 1-8 0-2-1-1-2 0-8z"/>';
const LEAF = '<path d="M0 0c6-10 18-10 22-8C18 4 8 8 0 0z"/><path d="M0 0l14-5" fill="none" stroke-width="1.4"/>';

/** レシピ詳細の上部に出す大きなイラスト */
export function recipeHeroArt(recipe) {
  return `<div class="recipe-hero tone-${artTone(recipe)} cuisine-${esc({ 和食: 'wa', 洋食: 'yo', 中華: 'chu' }[recipe.cuisine] || 'etc')}">
    <svg class="hero-deco" viewBox="0 0 320 170" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <circle class="d-dot" cx="36" cy="30" r="22"/><circle class="d-dot" cx="292" cy="140" r="30"/><circle class="d-dot small" cx="270" cy="34" r="10"/>
      <g class="d-sparkle" transform="translate(64 128)">${SPARKLE}</g>
      <g class="d-sparkle s2" transform="translate(252 70) scale(.8)">${SPARKLE}</g>
      <g class="d-sparkle s3" transform="translate(110 30) scale(.6)">${SPARKLE}</g>
      <g class="d-leaf" transform="translate(26 150) rotate(-20)">${LEAF}</g>
      <g class="d-leaf" transform="translate(300 30) rotate(160)">${LEAF}</g>
    </svg>
    ${foodArt(recipe, { size: 'lg' })}
  </div>`;
}

/** 今日の画面の飾り（ロゴの周りの小さなイラスト） */
export function headerDecoration() {
  return `<svg class="today-deco" viewBox="0 0 360 150" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
    <circle class="d-sun" cx="318" cy="26" r="40"/>
    <g class="d-sparkle" transform="translate(28 30)">${SPARKLE}</g>
    <g class="d-sparkle s2" transform="translate(250 118) scale(.7)">${SPARKLE}</g>
    <g class="d-sparkle s3" transform="translate(190 20) scale(.5)">${SPARKLE}</g>
    <g class="d-leaf" transform="translate(10 136) rotate(-30)">${LEAF}</g>
    <path class="d-wave" d="M0 140q45-16 90 0t90 0 90 0 90 0v10H0z"/>
  </svg>`;
}

/** 小さなマスコット（ほほえむフライパン） */
export function mascot() {
  return `<svg class="mascot" viewBox="0 0 96 64" aria-hidden="true" focusable="false">
    <rect class="m-handle" x="60" y="30" width="34" height="9" rx="4.5"/>
    <ellipse class="m-pan" cx="34" cy="36" rx="30" ry="22"/>
    <ellipse class="m-pan-in" cx="34" cy="34" rx="24" ry="16"/>
    <path class="m-white" d="M20 32c-2-8 8-12 14-9 6-5 16-1 15 6 5 3 2 11-5 11H26c-7 0-10-5-6-8z"/>
    <circle class="m-yolk" cx="35" cy="32" r="7"/>
    <circle class="m-eye" cx="32" cy="31" r="1.3"/><circle class="m-eye" cx="38" cy="31" r="1.3"/>
    <path class="m-smile" d="M32.5 34.5q2.5 2 5 0" fill="none"/>
    <circle class="m-cheek" cx="29" cy="34" r="1.6"/><circle class="m-cheek" cx="41" cy="34" r="1.6"/>
    <path class="m-steam" d="M20 12q-4-4 0-8M34 10q-4-4 0-8M48 12q-4-4 0-8" fill="none"/>
  </svg>`;
}
