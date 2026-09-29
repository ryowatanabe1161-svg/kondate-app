// 献立の条件のボトムシート（平日は時短・節約・ヘルシー・ジャンルの好み）

import * as store from '../store.js';
import { closeSheet, icon, openSheet } from '../lib/ui.js';

const CUISINE_TEXT = { none: 'おまかせ', 和: '和食多め', 洋: '洋食多め', 中: '中華多め' };

/** 有効な条件を、チップ表示用の短い文にして返す（なければ空配列） */
export function conditionLabels(c = store.getConditions()) {
  const list = [];
  if (c.quickWeekday) {
    list.push({ key: 'quick', text: `${c.relaxWeekend ? '平日' : '毎日'}は時短（${c.quickScope === 'main' ? '主菜' : '3品合計'}${c.quickLimit}分以内）` });
  }
  if (c.budget) list.push({ key: 'budget', text: '節約' });
  if (c.healthy) list.push({ key: 'healthy', text: c.kcalTarget ? `ヘルシー（1食${c.kcalTarget}kcal以内）` : 'ヘルシー' });
  if (c.cuisinePref !== 'none') list.push({ key: 'cuisine', text: CUISINE_TEXT[c.cuisinePref] });
  return list;
}

const toggle = (name, label, checked, hint) => `
  <label class="switch-row">
    <span class="switch-text"><b>${label}</b>${hint ? `<small>${hint}</small>` : ''}</span>
    <input type="checkbox" name="${name}" ${checked ? 'checked' : ''} role="switch">
    <span class="switch" aria-hidden="true"></span>
  </label>`;

const segmented = (name, options, current, cls = '') => `
  <div class="segmented cond-seg ${cls}" role="radiogroup" style="grid-template-columns: repeat(${options.length}, 1fr)">
    ${options.map(([value, label]) => `
      <label><input type="radio" name="${name}" value="${value}" ${String(value) === String(current) ? 'checked' : ''}><span>${label}</span></label>`).join('')}
  </div>`;

function formHtml(c) {
  return `
    <section class="cond-section">
      ${toggle('quickWeekday', '平日は時短', c.quickWeekday, '忙しい日は調理時間の短いレシピから選びます')}
      <div class="cond-sub" ${c.quickWeekday ? '' : 'hidden'}>
        <p class="cond-label">対象</p>
        ${segmented('quickScope', [['main', '主菜の時間'], ['total', '3品の合計']], c.quickScope)}
        <p class="cond-label">上限</p>
        ${segmented('quickLimit', store.QUICK_LIMITS[c.quickScope].map((n) => [n, `${n}分`]), c.quickLimit)}
        ${toggle('relaxWeekend', '休日（土日）はゆっくりOK', c.relaxWeekend, 'オフにすると毎日時短にします')}
      </div>
    </section>
    <section class="cond-section">
      ${toggle('budget', '節約モード', c.budget, '「節約」タグや、鶏むね・豚こま・卵・豆腐・もやしなど手ごろな食材の料理を優先')}
    </section>
    <section class="cond-section">
      ${toggle('healthy', 'ヘルシーモード', c.healthy, '「ヘルシー」タグや低カロリーの料理を優先し、揚げ物を控えめに')}
      <div class="cond-sub" ${c.healthy ? '' : 'hidden'}>
        <p class="cond-label">1食（1人分）のカロリー目標 <small>夕・お弁当はご飯別／朝は主食込みで8割</small></p>
        ${segmented('kcalTarget', [['', 'なし'], ...store.KCAL_TARGETS.map((n) => [n, `${n}`])], c.kcalTarget ?? '', 'small')}
      </div>
    </section>
    <section class="cond-section">
      <p class="cond-title">ジャンルの好み</p>
      ${segmented('cuisinePref', store.CUISINE_PREFS.map((k) => [k, CUISINE_TEXT[k]]), c.cuisinePref, 'small')}
    </section>`;
}

/**
 * @param {() => void} onChange 条件が変わったとき（画面の再描画用）
 * @param {{ onRegenerate?: () => void, weekLabel?: string }} [opts] 「この条件で作り直す」を押したとき
 */
export function openConditionsSheet(onChange, { onRegenerate, weekLabel = '今週' } = {}) {
  openSheet({
    title: '献立の条件',
    body: `
      <p class="hint cond-lead">${icon('filter', { size: 16 })}おまかせ・作り直す・今日の入れ替えに使われます。合うレシピが足りないときは条件をゆるめて選びます。</p>
      <form class="cond-form">${formHtml(store.getConditions())}</form>
      <div class="sheet-actions">
        ${onRegenerate ? `<button class="btn btn-primary btn-block" data-regenerate>${icon('reroll', { size: 18 })}この条件で${weekLabel}を作り直す</button>
        <p class="hint center">${icon('lock', { size: 14 })}固定した日・料理はそのまま残ります</p>` : ''}
        <button class="btn btn-outline btn-block" data-close-conditions>閉じる</button>
      </div>`,
    onMount(sheet) {
      const form = sheet.querySelector('.cond-form');
      form.addEventListener('change', (e) => {
        const el = e.target;
        const patch = {};
        if (el.type === 'checkbox') patch[el.name] = el.checked;
        else if (el.name === 'quickScope') patch.quickScope = el.value;
        else if (el.name === 'quickLimit') patch.quickLimit = Number(el.value);
        else if (el.name === 'kcalTarget') patch.kcalTarget = el.value ? Number(el.value) : null;
        else if (el.name === 'cuisinePref') patch.cuisinePref = el.value;
        const c = store.setConditions(patch);
        form.innerHTML = formHtml(c);
        onChange();
      });
      form.addEventListener('submit', (e) => e.preventDefault());
      sheet.querySelector('[data-regenerate]')?.addEventListener('click', () => {
        closeSheet();
        onRegenerate();
      });
      sheet.querySelector('[data-close-conditions]').addEventListener('click', closeSheet);
    },
  });
}
