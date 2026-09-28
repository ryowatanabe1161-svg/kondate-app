// 画面3：買い物リスト

import * as actions from '../actions.js';
import * as store from '../store.js';
import { buildShoppingList } from '../shopping.js';
import { SEASONING_GROUP } from '../data/ingredients.js';
import { esc, formatDateShort, uid } from '../lib/util.js';
import { icon, toast } from '../lib/ui.js';
import { openSettingsSheet } from '../components/settings-sheet.js';

let seasoningOpen = false;

function itemRow({ key, name, amount, dishes, checked, removable }) {
  return `
    <li class="shop-item ${checked ? 'checked' : ''}">
      <label class="shop-label">
        <input type="checkbox" class="visually-hidden" data-check="${esc(key)}" ${checked ? 'checked' : ''}>
        <span class="checkbox" aria-hidden="true">${icon('check', { size: 16 })}</span>
        <span class="item-main">
          <span class="item-name">${esc(name)}</span>
          ${dishes?.length ? `<span class="item-dishes">${esc(dishes.join('・'))}</span>` : ''}
        </span>
        ${amount ? `<span class="item-amount">${esc(amount)}</span>` : ''}
      </label>
      ${removable ? `<button class="icon-btn" data-remove-extra="${esc(key)}" aria-label="${esc(name)}を削除">${icon('close', { size: 18 })}</button>` : ''}
    </li>`;
}

export function renderShopping(container, { rerender }) {
  const days = actions.resolvedDays();
  const servings = store.getServings();
  const groups = buildShoppingList(days, store.servingFactor());
  const shopping = store.getShopping();
  const checked = new Set(shopping.checked);

  const extras = shopping.extras || [];
  const total = groups.reduce((s, g) => s + g.items.length, 0) + extras.length;
  const done =
    groups.reduce((s, g) => s + g.items.filter((i) => checked.has(i.name)).length, 0) +
    extras.filter((x) => x.checked).length;

  const groupHtml = groups
    .map((g) => {
      const doneInGroup = g.items.filter((i) => checked.has(i.name)).length;
      const list = `<ul class="shop-list">${g.items
        .map((i) => itemRow({ key: i.name, ...i, checked: checked.has(i.name) }))
        .join('')}</ul>`;
      const count = `<span class="group-count">${doneInGroup}/${g.items.length}</span>`;
      if (g.name === SEASONING_GROUP) {
        return `
          <details class="shop-group seasoning" ${seasoningOpen ? 'open' : ''}>
            <summary><span>${esc(g.name)} <small>家にあるか確認</small></span>${count}</summary>
            ${list}
          </details>`;
      }
      return `<section class="shop-group"><h3>${esc(g.name)}${count}</h3>${list}</section>`;
    })
    .join('');

  const extrasHtml = extras.length
    ? `<section class="shop-group"><h3>追加した項目<span class="group-count">${extras.filter((x) => x.checked).length}/${extras.length}</span></h3>
         <ul class="shop-list">${extras
           .map((x) => itemRow({ key: x.id, name: x.name, checked: x.checked, removable: true }))
           .join('')}</ul></section>`
    : '';

  container.innerHTML = `
    <section class="card shop-head">
      <div class="shop-head-row">
        <p class="week-range">${formatDateShort(days[0].date)} 〜 ${formatDateShort(days[days.length - 1].date)} の7日分</p>
        <button class="servings-chip" data-settings aria-label="人数を変更（現在${servings}人分）">${icon('user', { size: 14 })}${servings}人分</button>
      </div>
      <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${done}">
        <div class="progress-bar" style="width:${total ? (done / total) * 100 : 0}%"></div>
      </div>
      <p class="progress-label"><b>${done}</b> / ${total} 品 チェック済み</p>
    </section>

    ${groupHtml}
    ${extrasHtml}

    <form class="add-item">
      <input class="input" name="itemName" placeholder="買うものを追加（例：牛乳）" aria-label="買うものを追加" autocomplete="off">
      <button class="btn btn-primary" type="submit">${icon('plus', { size: 18 })}追加</button>
    </form>

    <button class="btn btn-ghost btn-block" data-clear ${done ? '' : 'disabled'}>チェックをすべて外す</button>
  `;

  const details = container.querySelector('details.seasoning');
  details?.addEventListener('toggle', () => (seasoningOpen = details.open));

  container.addEventListener('change', (e) => {
    const box = e.target.closest('[data-check]');
    if (!box) return;
    const key = box.dataset.check;
    const current = store.getShopping();
    const extra = current.extras.find((x) => x.id === key);
    if (extra) {
      extra.checked = box.checked;
    } else {
      const set = new Set(current.checked);
      box.checked ? set.add(key) : set.delete(key);
      current.checked = [...set];
    }
    store.setShopping(current);
    rerender();
  });

  container.addEventListener('click', (e) => {
    if (e.target.closest('[data-settings]')) {
      openSettingsSheet(rerender);
      return;
    }
    const remove = e.target.closest('[data-remove-extra]');
    if (remove) {
      const current = store.getShopping();
      current.extras = current.extras.filter((x) => x.id !== remove.dataset.removeExtra);
      store.setShopping(current);
      rerender();
      return;
    }
    if (e.target.closest('[data-clear]')) {
      const current = store.getShopping();
      current.checked = [];
      current.extras = current.extras.map((x) => ({ ...x, checked: false }));
      store.setShopping(current);
      toast('チェックをすべて外しました');
      rerender();
    }
  });

  container.querySelector('.add-item').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = e.target.elements.itemName;
    const name = input.value.trim();
    if (!name) return;
    const current = store.getShopping();
    current.extras = [...(current.extras || []), { id: uid('x'), name, checked: false }];
    store.setShopping(current);
    toast(`「${name}」を追加しました`);
    rerender();
  });
}
