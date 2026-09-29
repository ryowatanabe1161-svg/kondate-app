// 画面2：1週間の献立

import * as actions from '../actions.js';
import { SLOTS } from '../planner.js';
import { esc, formatDateShort, todayKey, weekdayIndex } from '../lib/util.js';
import { categoryClass, icon, toast } from '../lib/ui.js';
import { openRecipePicker } from '../components/recipe-picker.js';
import { mealNutrition, weekNutrition } from '../nutrition.js';
import { dayNutritionLine, weekNutritionSummary } from '../components/nutrition-view.js';

let swapSource = null; // 「入替」で最初に選んだ日のインデックス

const SHORT = { main: '主', side: '副', soup: '汁' };
const BALANCE_ORDER = ['肉', '魚', '卵・豆腐', '麺・丼', '野菜', '海藻・きのこ', 'その他'];

function balanceSummary(days) {
  const counts = {};
  days.forEach((d) => d.main && (counts[d.main.main] = (counts[d.main.main] || 0) + 1));
  return BALANCE_ORDER.filter((k) => counts[k])
    .map((k) => `<span class="balance-chip">${esc(k)} <b>${counts[k]}</b></span>`)
    .join('');
}

function dayCard(day, i, isToday) {
  const wd = weekdayIndex(day.date);
  const wdClass = wd === 0 ? 'sun' : wd === 6 ? 'sat' : '';
  const classes = ['day-card', isToday && 'is-today', swapSource === i && 'swap-source', swapSource !== null && swapSource !== i && 'swap-target']
    .filter(Boolean)
    .join(' ');

  return `
    <article class="${classes}">
      <header class="day-header">
        <div class="day-title">
          <span class="day-date ${wdClass}">${formatDateShort(day.date)}</span>
          ${isToday ? '<span class="today-pill">今日</span>' : ''}
        </div>
        <div class="day-actions">
          <button class="chip-btn ${swapSource === i ? 'active' : ''}" data-swap="${i}" aria-label="この日と他の日を入れ替える">${icon('swap', { size: 16 })}${swapSource === i ? 'やめる' : swapSource !== null ? 'ここと入替' : '入替'}</button>
          <button class="chip-btn" data-reroll-day="${i}" aria-label="この日の献立をおまかせで選び直す">${icon('reroll', { size: 16 })}おまかせ</button>
        </div>
      </header>
      <ul class="day-dishes">
        ${SLOTS.map(({ key, category }) => `
          <li>
            <button class="day-dish" data-pick="${i}:${key}">
              <span class="dot ${categoryClass(category)}">${SHORT[key]}</span>
              <span class="day-dish-name">${day[key] ? `<span class="inline-emoji" aria-hidden="true">${esc(day[key].emoji)}</span>` : ''}${esc(day[key]?.name || '（未設定）')}</span>
              <span class="day-dish-meta">${esc(day[key]?.main || '')}</span>
              ${icon('chevron', { size: 16 })}
            </button>
          </li>`).join('')}
      </ul>
      ${dayNutritionLine(mealNutrition(SLOTS.map(({ key }) => day[key])))}
    </article>`;
}

export function renderWeek(container, { rerender, headerAction }) {
  const days = actions.resolvedDays();
  const todayIdx = actions.todayIndex();
  const today = todayKey();

  headerAction.innerHTML = `<button class="header-btn" data-regenerate>${icon('reroll', { size: 18 })}作り直す</button>`;
  headerAction.querySelector('[data-regenerate]').addEventListener('click', () => {
    if (!confirm('1週間の献立を作り直しますか？\n（買い物リストのチェックもリセットされます）')) return;
    swapSource = null;
    actions.regenerateWeek();
    toast('新しい1週間の献立を作りました');
    rerender();
  });

  container.innerHTML = `
    <section class="card week-summary">
      <p class="week-range">${formatDateShort(days[0].date)} 〜 ${formatDateShort(days[days.length - 1].date)}</p>
      <div class="balance"><span class="balance-label">主菜のバランス</span>${balanceSummary(days)}</div>
      ${weekNutritionSummary(weekNutrition(days.map((d) => SLOTS.map(({ key }) => d[key]))))}
      <p class="hint">料理をタップすると好きなレシピに変更できます</p>
    </section>
    ${swapSource !== null ? `
      <div class="swap-banner" role="status">
        <span>「${formatDateShort(days[swapSource].date)}」と入れ替える日の<b>「ここと入替」</b>を押してください</span>
      </div>` : ''}
    <div class="day-list">
      ${days.map((d, i) => dayCard(d, i, d.date === today || i === todayIdx)).join('')}
    </div>`;

  container.addEventListener('click', (e) => {
    const swap = e.target.closest('[data-swap]');
    if (swap) {
      const i = Number(swap.dataset.swap);
      if (swapSource === null) swapSource = i;
      else if (swapSource === i) swapSource = null;
      else {
        actions.swapDays(swapSource, i);
        toast(`${formatDateShort(days[swapSource].date)}と${formatDateShort(days[i].date)}を入れ替えました`);
        swapSource = null;
      }
      rerender();
      return;
    }

    const rerollDay = e.target.closest('[data-reroll-day]');
    if (rerollDay) {
      const i = Number(rerollDay.dataset.rerollDay);
      actions.rerollDay(i);
      toast(`${formatDateShort(days[i].date)}の献立を選び直しました`);
      rerender();
      return;
    }

    const pick = e.target.closest('[data-pick]');
    if (pick) {
      const [i, slot] = pick.dataset.pick.split(':');
      const dayIndex = Number(i);
      const category = SLOTS.find((s) => s.key === slot).category;
      openRecipePicker({
        title: `${formatDateShort(days[dayIndex].date)}の${category}`,
        category,
        currentId: days[dayIndex][slot]?.id ?? null,
        onPick: (id) => {
          actions.setDish(dayIndex, slot, id);
          rerender();
        },
        onRandom: () => {
          actions.rerollDish(dayIndex, slot);
          rerender();
        },
      });
    }
  });
}
