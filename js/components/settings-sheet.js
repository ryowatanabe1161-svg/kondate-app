// 設定のボトムシート（何人分で作るか・献立の条件）

import * as store from '../store.js';
import * as actions from '../actions.js';
import { esc } from '../lib/util.js';
import { closeSheet, icon, openSheet, toast } from '../lib/ui.js';
import { conditionLabels, openConditionsSheet } from './conditions-sheet.js';

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
