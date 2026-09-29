// 画面2：1週間の献立（今週／来週・日と料理の固定・献立の条件）

import * as actions from '../actions.js';
import { isLocked } from '../planner.js';
import { addDays, esc, formatDateShort, todayKey, weekdayIndex } from '../lib/util.js';
import { categoryClass, icon, toast } from '../lib/ui.js';
import { openRecipePicker } from '../components/recipe-picker.js';
import { mealNutrition, weekNutrition } from '../nutrition.js';
import { dayNutritionLine, weekNutritionSummary } from '../components/nutrition-view.js';
import { openConditionsSheet } from '../components/conditions-sheet.js';
import { conditionChips } from '../components/settings-sheet.js';

let swapSource = null; // 「入替」で最初に選んだ日のインデックス
let viewWeek = 'this'; // 表示中の週（'this' | 'next'）
let viewMeal = 'dinner'; // 表示中の食事
let tabAnim = ''; // タブを切り替えたときのアニメーション（'left' | 'right'）

const MEAL_TAB_ORDER = ['breakfast', 'bento', 'lunch', 'dinner'];
const WEEK_LABEL = { this: '今週', next: '来週' };
const BALANCE_ORDER = ['肉', '魚', '卵・豆腐', '麺・丼', '野菜', '海藻・きのこ', 'その他'];

/** 他の画面から表示する週を切り替える（買い物リストの「来週の献立を作る」など） */
export function showWeek(week) {
  viewWeek = week === 'next' ? 'next' : 'this';
  swapSource = null;
}

/** 表示する食事を切り替える */
export function showMeal(meal) {
  viewMeal = meal;
  swapSource = null;
}

function balanceSummary(days) {
  const counts = {};
  days.forEach((d) => d.main && (counts[d.main.main] = (counts[d.main.main] || 0) + 1));
  return BALANCE_ORDER.filter((k) => counts[k])
    .map((k) => `<span class="balance-chip">${esc(k)} <b>${counts[k]}</b></span>`)
    .join('');
}

function dayCard(day, i, isToday, meal, slots) {
  const wd = weekdayIndex(day.date);
  const wdClass = wd === 0 ? 'sun' : wd === 6 ? 'sat' : '';
  if (day.off) {
    return `
      <article class="day-card is-off" data-day="${i}" style="--i:${i}">
        <header class="day-header">
          <div class="day-title">
            <span class="day-date ${wdClass}">${formatDateShort(day.date)}</span>
            ${isToday ? '<span class="today-pill">今日</span>' : ''}
          </div>
          <span class="off-note">🍱 お弁当なし</span>
        </header>
      </article>`;
  }
  const anyLock = slots.some(({ key }) => isLocked(day, key));
  const classes = ['day-card', isToday && 'is-today', day.locked && 'is-locked', swapSource === i && 'swap-source', swapSource !== null && swapSource !== i && 'swap-target']
    .filter(Boolean)
    .join(' ');

  return `
    <article class="${classes}" data-day="${i}" style="--i:${i}">
      <header class="day-header">
        <div class="day-title">
          <span class="day-date ${wdClass}">${formatDateShort(day.date)}</span>
          ${isToday ? '<span class="today-pill">今日</span>' : ''}
        </div>
        <div class="day-actions">
          <button class="chip-btn lock-btn ${day.locked ? 'active' : ''}" data-lock-day="${i}" aria-pressed="${day.locked}" aria-label="${formatDateShort(day.date)}を${day.locked ? '固定解除' : '固定'}">${icon(day.locked ? 'lock' : 'unlock', { size: 16 })}<span>${day.locked ? '固定中' : '固定'}</span></button>
          <button class="chip-btn ${swapSource === i ? 'active' : ''}" data-swap="${i}" ${anyLock ? 'aria-disabled="true"' : ''} aria-label="この日と他の日を入れ替える">${icon('swap', { size: 16 })}${swapSource === i ? 'やめる' : swapSource !== null ? 'ここと' : '入替'}</button>
          <button class="chip-btn" data-reroll-day="${i}" ${day.locked ? 'aria-disabled="true"' : ''} aria-label="この日の献立をおまかせで選び直す">${icon('reroll', { size: 16 })}おまかせ</button>
        </div>
      </header>
      <ul class="day-dishes">
        ${slots.map(({ key, short, label, categories }) => `
          <li>
            <button class="day-dish ${isLocked(day, key) ? 'locked' : ''}" data-pick="${i}:${key}" data-meal="${meal}" aria-label="${esc(label)}：${esc(day[key]?.name || '未設定')}">
              <span class="dot ${categoryClass(day[key]?.category || categories[0])}">${esc(short)}</span>
              <span class="day-dish-name">${day[key] ? `<span class="inline-emoji" aria-hidden="true">${esc(day[key].emoji)}</span>` : ''}${esc(day[key]?.name || '（未設定）')}</span>
              ${isLocked(day, key) ? `<span class="dish-lock" aria-label="固定中">${icon('lock', { size: 14 })}</span>` : `<span class="day-dish-meta">${esc(day[key]?.main || '')}</span>`}
              ${icon('chevron', { size: 16 })}
            </button>
          </li>`).join('')}
      </ul>
      ${dayNutritionLine(mealNutrition(slots.map(({ key }) => day[key])))}
    </article>`;
}

function weekTabs(thisDays) {
  const nextStart = actions.nextWeekStart();
  const range = (start) => `${formatDateShort(start).replace(/（.）/, '')}〜`;
  return `
    <div class="segmented week-tabs" role="tablist" aria-label="表示する週">
      <label><input type="radio" name="week" value="this" ${viewWeek === 'this' ? 'checked' : ''}><span>今週<small>${range(thisDays[0].date)}</small></span></label>
      <label><input type="radio" name="week" value="next" ${viewWeek === 'next' ? 'checked' : ''}><span>来週<small>${range(nextStart)}</small></span></label>
    </div>`;
}

function mealTabs(meals) {
  if (meals.length < 2) return '';
  return `
    <div class="segmented meal-tabs" role="tablist" aria-label="表示する食事" style="grid-template-columns: repeat(${meals.length}, 1fr)">
      ${meals.map((m) => {
        const def = actions.mealDef(m);
        return `<label><input type="radio" name="meal" value="${m}" ${viewMeal === m ? 'checked' : ''}><span><i aria-hidden="true">${def.emoji}</i>${esc(def.short)}</span></label>`;
      }).join('')}
    </div>`;
}

function conditionsBar() {
  return `
    <div class="cond-bar">
      <div class="cond-chips">${conditionChips()}</div>
      <button class="chip-btn" data-conditions>${icon('filter', { size: 16 })}条件</button>
    </div>`;
}

export function renderWeek(container, { rerender, headerAction }) {
  const thisDays = actions.resolvedDays('this');
  const hasNext = !!actions.getNextPlan();
  if (viewWeek === 'next' && swapSource !== null && !hasNext) swapSource = null;
  const meals = MEAL_TAB_ORDER.filter((m) => actions.enabledMeals().includes(m));
  if (!meals.includes(viewMeal)) viewMeal = 'dinner';
  const week = viewWeek;
  const meal = viewMeal;
  const def = actions.mealDef(meal);
  const multi = meals.length > 1;
  const slots = actions.slotsOf(meal);
  const days = week === 'next' ? (hasNext ? actions.resolvedMealDays('next', meal) : []) : actions.resolvedMealDays('this', meal);
  const activeDays = days.filter((d) => !d.off);
  const anim = tabAnim;
  tabAnim = '';
  const todayIdx = week === 'this' ? actions.todayIndex() : -1;
  const today = todayKey();

  const regenerate = () => {
    const locked = multi
      ? meals.some((m) => actions.resolvedMealDays(week, m).some((d) => actions.slotsOf(m).some(({ key }) => isLocked(d, key))))
      : days.some((d) => slots.some(({ key }) => isLocked(d, key)));
    const msg = actions.relaxMessage(actions.regenerateWeek(week));
    swapSource = null;
    toast(msg || `${WEEK_LABEL[week]}の献立を作り直しました${locked ? '（固定はそのまま）' : ''}`);
    rerender();
  };

  headerAction.innerHTML = days.length ? `<button class="header-btn" data-regenerate>${icon('reroll', { size: 18 })}作り直す</button>` : '';
  headerAction.querySelector('[data-regenerate]')?.addEventListener('click', () => {
    const what = multi ? `（${meals.map((m) => actions.mealDef(m).label).join('・')}）` : '';
    if (!confirm(`${WEEK_LABEL[week]}の献立${what}を作り直しますか？\n（固定した日・料理はそのまま。買い物リストのチェックはリセットされます）`)) return;
    regenerate();
  });

  const openConditions = () =>
    openConditionsSheet(rerender, { onRegenerate: days.length ? regenerate : null, weekLabel: WEEK_LABEL[week] });

  if (week === 'next' && !hasNext) {
    const start = actions.nextWeekStart();
    container.innerHTML = `
      ${weekTabs(thisDays)}
      <section class="card week-summary">${conditionsBar()}</section>
      <section class="card next-empty">
        <p class="next-empty-icon" aria-hidden="true">🗓️</p>
        <h3>来週（${formatDateShort(start)} 〜 ${formatDateShort(addDays(start, 6))}）の献立はまだありません</h3>
        <p class="hint">今週の料理とできるだけ重ならないように、条件に合わせて7日分を作ります。今週が終わると、そのまま今週の献立になります。</p>
        <button class="btn btn-primary btn-block btn-lg" data-create-next>${icon('plus', { size: 20 })}来週の献立を作る</button>
      </section>`;
  } else {
    const allAvg = multi
      ? Math.round(actions.allMealsDays(week).reduce((s, d) => s + d.recipes.reduce((t, r) => t + (Number(r.kcal) || 0), 0), 0) / days.length)
      : null;
    container.innerHTML = `
      ${weekTabs(thisDays)}
      ${mealTabs(meals)}
      <section class="card week-summary ${anim ? `tab-enter-${anim}` : ''}">
        <p class="week-range">${multi ? `<span class="week-meal">${def.emoji}${esc(def.label)}</span>` : ''}${formatDateShort(days[0].date)} 〜 ${formatDateShort(days[days.length - 1].date)}</p>
        ${conditionsBar()}
        ${meal === 'dinner' ? `<div class="balance"><span class="balance-label">主菜のバランス</span>${balanceSummary(days)}</div>` : ''}
        ${activeDays.length
          ? weekNutritionSummary(weekNutrition(activeDays.map((d) => slots.map(({ key }) => d[key]))), {
              title: multi ? `${def.label}の目安` : 'カロリー・栄養の目安',
              note: meal === 'dinner' || meal === 'bento' ? '1人分・ご飯別' : '1人分',
              pills: meal === 'dinner',
              allAvg,
            })
          : '<p class="hint">この週はお弁当の日がありません（設定で曜日を選べます）</p>'}
        <p class="hint">料理をタップすると好きなレシピに変更・固定できます。${icon('lock', { size: 13 })}固定した日は「作り直す」や条件の変更でも変わりません</p>
      </section>
      ${swapSource !== null ? `
        <div class="swap-banner" role="status">
          <span>「${formatDateShort(days[swapSource].date)}」と入れ替える日の<b>「ここと」</b>を押してください</span>
        </div>` : ''}
      <div class="day-list ${anim ? `tab-enter-${anim}` : ''}">
        ${days.map((d, i) => dayCard(d, i, week === 'this' && (d.date === today || i === todayIdx), meal, slots)).join('')}
      </div>`;
  }

  container.addEventListener('change', (e) => {
    const mealTab = e.target.closest('input[name=meal]');
    if (mealTab) {
      tabAnim = meals.indexOf(mealTab.value) > meals.indexOf(viewMeal) ? 'left' : 'right';
      showMeal(mealTab.value);
      rerender();
      return;
    }
    const tab = e.target.closest('input[name=week]');
    if (!tab) return;
    tabAnim = tab.value === 'next' ? 'left' : 'right';
    showWeek(tab.value);
    rerender();
  });

  container.addEventListener('click', (e) => {
    if (e.target.closest('[data-conditions]')) {
      openConditions();
      return;
    }
    if (e.target.closest('[data-create-next]')) {
      const msg = actions.relaxMessage(actions.createNextWeek());
      toast(msg || '来週の献立を作りました（今週の料理とはできるだけ重ならないようにしています）');
      rerender();
      return;
    }

    const lock = e.target.closest('[data-lock-day]');
    if (lock) {
      const i = Number(lock.dataset.lockDay);
      const on = actions.toggleDayLock(i, week, meal);
      if (on && swapSource !== null) swapSource = null;
      toast(on ? `${formatDateShort(days[i].date)}を固定しました（作り直しても変わりません）` : `${formatDateShort(days[i].date)}の固定を解除しました`);
      rerender();
      return;
    }

    const swap = e.target.closest('[data-swap]');
    if (swap) {
      const i = Number(swap.dataset.swap);
      if (swap.getAttribute('aria-disabled') === 'true') {
        toast('固定中の日は入れ替えできません');
        return;
      }
      if (swapSource === null) swapSource = i;
      else if (swapSource === i) swapSource = null;
      else {
        if (actions.swapDays(swapSource, i, week, meal)) {
          toast(`${formatDateShort(days[swapSource].date)}と${formatDateShort(days[i].date)}を入れ替えました`);
        }
        swapSource = null;
      }
      rerender();
      return;
    }

    const rerollDay = e.target.closest('[data-reroll-day]');
    if (rerollDay) {
      const i = Number(rerollDay.dataset.rerollDay);
      if (rerollDay.getAttribute('aria-disabled') === 'true') {
        toast('固定中の日です（「固定中」を押すと解除できます）');
        return;
      }
      const msg = actions.relaxMessage(actions.rerollDay(i, week, meal));
      toast(msg || `${formatDateShort(days[i].date)}の献立を選び直しました`);
      rerender();
      return;
    }

    const pick = e.target.closest('[data-pick]');
    if (pick) {
      const [i, slot] = pick.dataset.pick.split(':');
      const dayIndex = Number(i);
      const slotDef = slots.find((s) => s.key === slot);
      const category = slotDef.label;
      const day = days[dayIndex];
      openRecipePicker({
        title: `${formatDateShort(day.date)}の${multi ? `${def.short}・` : ''}${category}`,
        category,
        meal,
        slot,
        currentId: day[slot]?.id ?? null,
        locked: isLocked(day, slot),
        dayLocked: day.locked,
        onPick: (id) => {
          actions.setDish(dayIndex, slot, id, week, meal);
          rerender();
        },
        onRandom: () => {
          const msg = actions.relaxMessage(actions.rerollDish(dayIndex, slot, week, meal));
          if (msg) toast(msg);
          rerender();
        },
        onToggleLock: () => {
          const on = actions.toggleDishLock(dayIndex, slot, week, meal);
          toast(on ? `${category}を固定しました` : `${category}の固定を解除しました`);
          rerender();
          return on;
        },
      });
    }
  });
}
