// 設定のボトムシート（何人分で作るか・献立を作る食事・献立の条件）

import * as store from '../store.js';
import * as actions from '../actions.js';
import { esc } from '../lib/util.js';
import { closeSheet, icon, openSheet, toast } from '../lib/ui.js';
import { conditionLabels, openConditionsSheet } from './conditions-sheet.js';
import { MEALS } from '../meals.js';

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

function switchRow(name, title, sub, checked, { disabled = false } = {}) {
  return `
    <label class="switch-row meal-switch ${disabled ? 'is-fixed' : ''}">
      <span class="switch-text"><b>${title}</b><small>${sub}</small></span>
      <input type="checkbox" name="${name}" role="switch" ${checked ? 'checked' : ''} ${disabled ? 'disabled' : ''}>
      <span class="switch" aria-hidden="true"></span>
    </label>`;
}

/** 献立を作る食事の設定（朝・昼・お弁当。夕ごはんはいつも作る） */
function mealSettingsHtml(ms = store.getMealSettings()) {
  return `
    <h3 class="section-title"><span class="title-emoji" aria-hidden="true">🍽️</span>献立を作る食事</h3>
    <div class="meal-settings">
      ${switchRow('meal-breakfast', `${MEALS.breakfast.emoji}朝ごはん`, '主食＋おかず＋汁物・飲み物（軽めの和朝食・洋朝食）', ms.breakfast)}
      ${switchRow('meal-bento', `${MEALS.bento.emoji}お弁当`, '主菜＋副菜2品（作り置きOK・冷めてもおいしいおかず）', ms.bento)}
      <div class="meal-sub-settings bento-days" ${ms.bento ? '' : 'hidden'}>
        <p class="cond-label">お弁当を作る曜日</p>
        <div class="day-chips" role="group" aria-label="お弁当を作る曜日">
          ${WEEKDAY_ORDER.map((d) => `
            <label class="day-chip ${d === 0 ? 'sun' : d === 6 ? 'sat' : ''}"><input type="checkbox" name="bento-day" value="${d}" ${ms.bentoDays.includes(d) ? 'checked' : ''}><span>${WEEKDAYS[d]}</span></label>`).join('')}
        </div>
      </div>
      ${switchRow('meal-lunch', `${MEALS.lunch.emoji}昼ごはん`, '麺・丼・パスタ・チャーハン・サンドなどの一品', ms.lunch)}
      <div class="meal-sub-settings" ${ms.lunch ? '' : 'hidden'}>
        ${switchRow('lunch-side', '小鉢・スープも付ける', 'オフにすると一品だけになります', ms.lunchSide)}
      </div>
      ${switchRow('meal-dinner', `${MEALS.dinner.emoji}夕ごはん`, '主菜＋副菜＋汁物（いつも作ります）', true, { disabled: true })}
    </div>
    <p class="hint">オンにした食事の献立を今週・来週に追加し、買い物リストにもまとめます。</p>`;
}

/** @param {() => void} onChange 設定が変わったときに呼ぶ（画面の再描画用） */
export function openSettingsSheet(onChange) {
  const current = store.getServings();
  openSheet({
    title: '設定',
    body: `
      <section class="settings-section">
        <h3 class="section-title">${icon('user', { size: 18 })}何人分つくる？</h3>
        <div class="segmented servings" role="radiogroup" aria-label="人数">
          ${store.SERVING_OPTIONS.map((n) => `
            <label><input type="radio" name="servings" value="${n}" ${n === current ? 'checked' : ''}><span>${n}人</span></label>`).join('')}
        </div>
        <p class="hint">レシピ詳細と買い物リストの分量が、この人数に合わせて換算されます（「適量」「少々」はそのまま）。</p>
      </section>
      <section class="settings-section meal-settings-section">${mealSettingsHtml()}</section>
      <section class="settings-section">
        <h3 class="section-title">${icon('filter', { size: 18 })}献立の条件</h3>
        <div class="cond-chips">${conditionChips()}</div>
        <button class="btn btn-outline btn-block" data-open-conditions>条件を設定する</button>
      </section>
      <button class="btn btn-primary btn-block" data-close-settings>閉じる</button>`,
    onMount(sheet) {
      sheet.querySelectorAll('input[name=servings]').forEach((input) =>
        input.addEventListener('change', () => {
          store.setServings(Number(input.value));
          toast(`${input.value}人分に変更しました`);
          onChange();
        }),
      );
      sheet.querySelector('[data-close-settings]').addEventListener('click', closeSheet);
      const mealSection = sheet.querySelector('.meal-settings-section');
      mealSection.addEventListener('change', (e) => {
        const input = e.target;
        const before = store.getMealSettings();
        let message = '';
        if (input.name?.startsWith('meal-') && input.name !== 'meal-dinner') {
          const meal = input.name.slice(5);
          store.setMealSettings({ [meal]: input.checked });
          message = input.checked ? `${MEALS[meal].label}の献立を追加しました` : `${MEALS[meal].label}の献立をやめました`;
        } else if (input.name === 'bento-day') {
          const days = [...mealSection.querySelectorAll('input[name=bento-day]:checked')].map((i) => Number(i.value));
          store.setMealSettings({ bentoDays: days });
          message = days.length ? `お弁当の曜日：${WEEKDAY_ORDER.filter((d) => days.includes(d)).map((d) => WEEKDAYS[d]).join('・')}` : 'お弁当を作る曜日がありません';
        } else if (input.name === 'lunch-side') {
          store.setMealSettings({ lunchSide: input.checked });
          message = input.checked ? '昼ごはんに小鉢・スープを付けます' : '昼ごはんは一品だけにします';
        } else return;
        if (JSON.stringify(before) === JSON.stringify(store.getMealSettings())) return;
        actions.ensurePlan();
        actions.getNextPlan();
        mealSection.innerHTML = mealSettingsHtml();
        toast(message);
        onChange();
      });
      sheet.querySelector('[data-open-conditions]').addEventListener('click', () => {
        closeSheet();
        openConditionsSheet(onChange, {
          onRegenerate: () => {
            const msg = actions.relaxMessage(actions.regenerateWeek('this'));
            toast(msg || '条件に合わせて今週の献立を作り直しました');
            onChange();
          },
        });
      });
    },
  });
}

/** 有効な条件のチップ（なければ「条件なし」） */
export function conditionChips(c = store.getConditions()) {
  const labels = conditionLabels(c);
  return labels.length
    ? labels.map((l) => `<span class="cond-chip" data-cond="${l.key}">${esc(l.text)}</span>`).join('')
    : '<span class="cond-chip none">条件なし（おまかせ）</span>';
}
