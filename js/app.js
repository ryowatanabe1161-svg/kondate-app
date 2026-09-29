// エントリーポイント：ハッシュによる画面切り替えとタブバー

import { renderToday } from './views/today.js';
import { renderWeek } from './views/week.js';
import { renderShopping } from './views/shopping.js';
import { renderRecipes } from './views/recipes.js';
import { renderFridge } from './views/fridge.js';
import { closeSheet } from './lib/ui.js';

const APP_NAME = 'デミさんクッキング';

const ROUTES = {
  today: { title: '今日の献立', render: renderToday },
  week: { title: '1週間の献立', render: renderWeek },
  shopping: { title: '買い物リスト', render: renderShopping },
  recipes: { title: 'レシピ一覧', render: renderRecipes },
  fridge: { title: '冷蔵庫から提案', render: renderFridge },
};

const viewEl = document.getElementById('view');
const titleEl = document.getElementById('page-title');
const headerActionEl = document.getElementById('header-action');

function currentRoute() {
  const key = location.hash.replace('#', '');
  return ROUTES[key] ? key : 'today';
}

function render({ enter = false } = {}) {
  const key = currentRoute();
  const route = ROUTES[key];

  titleEl.textContent = route.title;
  document.body.dataset.route = key; // 今日の画面ではロゴを大きく表示
  document.title = `${route.title}｜${APP_NAME}`;
  document.querySelectorAll('.tabbar a').forEach((a) => {
    const active = a.dataset.tab === key;
    a.classList.toggle('active', active);
    if (active) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });

  // 毎回新しい要素に描画する（イベントリスナーが重複しないように）
  const page = document.createElement('div');
  page.className = `page page-${key}${enter ? ' page-enter' : ''}`; // 画面を切り替えたときだけ入場アニメーション
  const headerAction = document.createElement('div');
  viewEl.replaceChildren(page);
  headerActionEl.replaceChildren(headerAction);

  route.render(page, { rerender: () => render(), headerAction });
}

window.addEventListener('hashchange', () => {
  closeSheet();
  render({ enter: true });
  window.scrollTo(0, 0);
});

render({ enter: true });

// PWA：オフラインでも開けるように Service Worker を登録
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('Service Worker の登録に失敗しました', err));
  });
}
