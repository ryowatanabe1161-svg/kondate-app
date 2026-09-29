// 画面1：今日の献立（朝・昼・お弁当・夕ごはん）

import * as actions from '../actions.js';
import { isLocked } from '../planner.js';
import { esc, formatDateLong, todayKey } from '../lib/util.js';
import { categoryClass, icon, stars, toast } from '../lib/ui.js';
import { foodArt, headerDecoration, mascot } from '../lib/art.js';
import { openRecipeDetail } from '../components/recipe-detail.js';
import { openSettingsSheet } from '../components/settings-sheet.js';
import { getServings } from '../store.js';
import { mealNutrition } from '../nutrition.js';
import { dayTotalCard, mealNutritionCard } from '../components/nutrition-view.js';

let flashKeys = []; // 直前に入れ替えた枠 'meal:slot'（アニメーション用）
let openMeals = null; // 開いている食事（入れ替えても閉じないように覚えておく）
let openDate = '';

/** 今の時間に合う食事（朝は10時まで、昼・お弁当は14時まで、そのあとは夕ごはん） */
function currentMeal(meals) {
  const h = new Date().getHours();
  const want = h < 10 ? ['breakfast'] : h < 14 ? ['lunch', 'bento'] : ['dinner'];
  return meals.filter((m) => want.includes(m.meal) && !m.day?.off).map((m) => m.meal);
}

function dishCard(meal, slot, recipe, locked, order) {
  const key = `${meal}:${slot.key}`;
  const flash = flashKeys.includes(key) ? 'flash rerolled' : '';
  const cat = recipe?.category || slot.categories[0];
  if (!recipe) {
    return `
      <article class="dish-card ${categoryClass(cat)} empty" style="--i:${order}">
        <div class="dish-cat">${esc(slot.short)}</div>
        <div class="dish-body"><h3>レシピがありません</h3><p class="dish-meta">レシピ一覧から${esc(slot.label)}を追加してください</p></div>
      </article>`;
  }
  return `
    <article class="dish-card ${categoryClass(cat)} ${flash}" data-open="${esc(recipe.id)}" data-slot-card="${key}" tabindex="0" style="--i:${order}">
      <div class="dish-cat">${foodArt(recipe, { size: 'md' })}</div>
      <div class="dish-body">
        <p class="dish-label">${esc(slot.label)}<span>${esc(recipe.cuisine)}</span></p>
        <h3>${esc(recipe.name)}</h3>
        <p class="dish-meta">
          <span>${esc(recipe.main)}</span>
          <span class="meta-time">${icon('clock', { size: 14 })}${esc(recipe.time)}分</span>
          ${recipe.kcal ? `<span class="meta-kcal" data-kcal="${esc(recipe.kcal)}">約${esc(recipe.kcal)}kcal</span>` : ''}
          ${recipe.fav ? `<span class="fav-mark">${icon('star', { filled: true, size: 14 })}</span>` : ''}
          ${stars(recipe.rating)}
        </p>
      </div>
      ${locked
        ? `<button class="reroll-btn is-locked" data-locked="${slot.key}" data-meal="${meal}" aria-label="${esc(slot.label)}は固定中">${icon('lock')}</button>`
        : `<button class="reroll-btn" data-reroll="${slot.key}" data-meal="${meal}" aria-label="${esc(slot.label)}を入れ替える">${icon('reroll')}</button>`}
    </article>`;
}

const dishesOf = (m) => (m.day && !m.day.off ? m.slots.map((s) => m.day[s.key]).filter(Boolean) : []);

function mealSection(m, open, startOrder) {
  const { meal, def, slots, day } = m;
  if (!day || day.off) {
    return `
      <section class="meal-section meal-${meal} is-off" data-meal-section="${meal}">
        <div class="meal-head">
          <span class="meal-emoji" aria-hidden="true">${def.emoji}</span>
          <span class="meal-titles"><b>${esc(def.label)}</b><small>今日はお弁当なし（曜日は設定で変えられます）</small></span>
        </div>
      </section>`;
  }
  const dishes = dishesOf(m);
  const n = mealNutrition(dishes);
  const time = dishes.reduce((s, r) => s + Number(r.time || 0), 0);
  return `
    <details class="meal-section meal-${meal}" data-meal-section="${meal}" ${open ? 'open' : ''}>
      <summary class="meal-head">
        <span class="meal-emoji" aria-hidden="true">${def.emoji}</span>
        <span class="meal-titles"><b>${esc(def.label)}</b><small class="meal-sub">${dishes.map((r) => esc(r.name)).join('・')}</small></span>
        <span class="meal-kcal" data-meal-section-kcal="${n.kcal}">約${n.kcal}kcal</span>
        <span class="meal-chevron" aria-hidden="true">${icon('chevron', { size: 18 })}</span>
      </summary>
      <div class="meal-body">
        <div class="dish-list">
          ${slots.map((s, j) => dishCard(meal, s, day[s.key], isLocked(day, s.key), startOrder + j)).join('')}
        </div>
        <div class="meal-foot">
          <span class="meal-foot-info">${icon('clock', { size: 14 })}約${time}分<span class="sep">／</span>約${n.kcal}kcal${n.staple ? '' : '<small>（ご飯別）</small>'}</span>
          <button class="chip-btn" data-reroll-all data-meal="${meal}">${icon('reroll', { size: 16 })}まるごと入れ替える</button>
        </div>
      </div>
    </details>`;
}

function hero(meals) {
  const multi = meals.length > 1;
  return `
    <section class="today-hero">
      ${headerDecoration()}
      <div class="hero-row">
        <div class="hero-text">
          <p class="today-date">${formatDateLong(todayKey())}</p>
          <p class="today-lead">今日のごはんはこれにしよう
            <button class="servings-chip" data-settings>${icon('user', { size: 14 })}${getServings()}人分</button>
          </p>
          ${multi ? `<p class="hero-meals" aria-label="献立を作る食事">${meals.map((m) => `<span class="hero-meal ${m.day?.off ? 'off' : ''}">${m.def.emoji}${esc(m.def.short)}</span>`).join('')}</p>` : ''}
        </div>
        ${mascot()}
      </div>
    </section>`;
}

const fridgeCta = `
  <a class="fridge-cta" href="#fridge">
    <span class="fridge-cta-icon">${icon('fridge', { size: 26 })}</span>
    <span class="fridge-cta-text"><b>冷蔵庫のあまりもので探す</b><small>ある食材を選ぶと、作れる料理を提案します</small></span>
    ${icon('chevron', { size: 18 })}
  </a>`;

function tomorrowCard(index) {
  const all = actions.enabledMeals();
  const rows = all
    .map((meal) => {
      const day = actions.resolvedMealDays('this', meal)[index + 1];
      if (!day) return null;
      const def = actions.slotsOf(meal);
      const text = day.off ? 'お弁当なし' : def.map((s) => esc(day[s.key]?.name || '—')).join('<span class="sep">／</span>');
      return { meal, text };
    })
    .filter(Boolean);
  if (!rows.length) return '';
  const single = rows.length === 1;
  return `
    <section class="card tomorrow">
      <h3 class="section-title">明日の献立</h3>
      ${single ? `<p>${rows[0].text}</p>` : `<ul class="tomorrow-list">${rows.map((r) => `<li><span class="tm-label">${actions.mealDef(r.meal).emoji}${esc(actions.mealDef(r.meal).short)}</span><span>${r.text}</span></li>`).join('')}</ul>`}
      <a class="link-btn" href="#week">1週間の献立を見る ${icon('chevron', { size: 16 })}</a>
    </section>`;
}

export function renderToday(container, { rerender, headerAction }) {
  headerAction.innerHTML = `<button class="icon-btn header-icon" data-settings aria-label="設定（人数・食事）">${icon('gear')}</button>`;
  headerAction.querySelector('[data-settings]').addEventListener('click', () => openSettingsSheet(rerender));

  const index = actions.todayIndex();
  const meals = actions.todayMeals();
  const multi = meals.length > 1;
  if (openDate !== todayKey() || !openMeals) {
    openDate = todayKey();
    const cur = currentMeal(meals);
    openMeals = new Set(cur.length ? cur : [meals.find((m) => !m.day?.off)?.meal || 'dinner']);
  }

  if (!multi) {
    const m = meals[0];
    const dishes = dishesOf(m);
    const totalTime = dishes.reduce((s, r) => s + Number(r.time || 0), 0);
    const n = mealNutrition(dishes);
    container.innerHTML = `
      ${hero(meals)}
      <div class="dish-list">
        ${m.slots.map((s, j) => dishCard('dinner', s, m.day[s.key], isLocked(m.day, s.key), j)).join('')}
      </div>
      <p class="today-total">${icon('clock', { size: 16 })}調理時間の目安 合計 約${totalTime}分<span class="sep">／</span>約${n.kcal}kcal<small>（1人分・目安）</small></p>
      <button class="btn btn-primary btn-block btn-lg" data-reroll-all data-meal="dinner">
        ${icon('reroll')}まるごと入れ替える
      </button>
      ${fridgeCta}
      ${mealNutritionCard(n)}
      ${tomorrowCard(index)}`;
  } else {
    let order = 0;
    const sections = meals.map((m) => {
      const html = mealSection(m, openMeals.has(m.meal), order);
      order += m.slots.length;
      return html;
    });
    const perMeal = meals.filter((m) => !m.day?.off).map((m) => ({ def: m.def, meal: m.meal, n: mealNutrition(dishesOf(m)) }));
    container.innerHTML = `
      ${hero(meals)}
      <div class="meal-sections">${sections.join('')}</div>
      <p class="hint meal-hint">見出しをタップすると開いたり閉じたりできます</p>
      ${fridgeCta}
      ${dayTotalCard(perMeal, mealNutrition(meals.flatMap(dishesOf)))}
      ${tomorrowCard(index)}`;
    container.querySelectorAll('details.meal-section').forEach((d) =>
      d.addEventListener('toggle', () => {
        if (d.open) openMeals.add(d.dataset.mealSection);
        else openMeals.delete(d.dataset.mealSection);
      }),
    );
  }
  flashKeys = [];

  container.addEventListener('click', (e) => {
    if (e.target.closest('[data-settings]')) {
      openSettingsSheet(rerender);
      return;
    }
    if (e.target.closest('[data-locked]')) {
      e.stopPropagation();
      toast('固定中の料理です（1週間の画面で解除できます）');
      return;
    }
    const reroll = e.target.closest('[data-reroll]');
    if (reroll) {
      e.stopPropagation();
      const slot = reroll.dataset.reroll;
      const meal = reroll.dataset.meal || 'dinner';
      const msg = actions.relaxMessage(actions.rerollDish(index, slot, 'this', meal));
      if (msg) toast(msg);
      flashKeys = [`${meal}:${slot}`];
      openMeals.add(meal);
      rerender();
      return;
    }
    const all = e.target.closest('[data-reroll-all]');
    if (all) {
      const meal = all.dataset.meal || 'dinner';
      const m = meals.find((x) => x.meal === meal);
      const free = m.slots.filter((s) => !isLocked(m.day, s.key)).map((s) => s.key);
      const label = multi ? `今日の${m.def.label}` : '今日の献立';
      if (!free.length) {
        toast(`${label}はすべて固定中です（1週間の画面で解除できます）`);
        return;
      }
      const msg = actions.relaxMessage(actions.rerollDay(index, 'this', meal));
      flashKeys = free.map((k) => `${meal}:${k}`);
      openMeals.add(meal);
      toast(msg || (free.length < m.slots.length ? '固定していない料理を入れ替えました' : `${label}を入れ替えました`));
      rerender();
      return;
    }
    const card = e.target.closest('[data-open]');
    if (card) openRecipeDetail(card.dataset.open, rerender);
  });
}
