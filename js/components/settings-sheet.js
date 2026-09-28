// 設定のボトムシート（何人分で作るか）

import * as store from '../store.js';
import { closeSheet, icon, openSheet, toast } from '../lib/ui.js';

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
    },
  });
}
