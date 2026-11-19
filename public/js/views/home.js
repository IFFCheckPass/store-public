import { api } from '../api.js';
import {
  escapeHtml,
  safeImage,
  formatMoney,
  emptyState
} from '../ui.js';
import { currentSettings } from '../site-settings.js';

const ALL = '全部';

const state = {
  products: [],
  category: ALL
};

function categories() {
  const map = new Map();
  state.products.forEach((product) => {
    const name = String(product.category || '其他').trim() || '其他';
    map.set(name, (map.get(name) || 0) + 1);
  });
  return Array.from(map.entries());
}

function chipsHtml() {
  const items = categories();
  const total = state.products.length;
  return [
    `<button type="button" class="chip${state.category === ALL ? ' is-active' : ''}" data-category="${ALL}">
       全部 <span class="chip__count">${total}</span>
     </button>`
  ]
    .concat(
      items.map(
        ([name, count]) => `
          <button type="button" class="chip${state.category === name ? ' is-active' : ''}" data-category="${escapeHtml(name)}">
            ${escapeHtml(name)} <span class="chip__count">${count}</span>
          </button>`
      )
    )
    .join('');
}

function stockBadge(product) {
  if (product.isPresale) return '<span class="badge badge--presale">预售</span>';
  const num = Number(product.stock);
  const safe = Number.isFinite(num) ? num : 0;
  if (safe <= 0) return '<span class="badge badge--low">售罄</span>';
  if (safe <= 5) return `<span class="badge badge--low">仅剩 ${safe} 件</span>`;
  return `<span class="badge badge--stock">库存 ${safe}</span>`;
}

function productCard(product) {
  const id = product.id;
  const name = product.name || '未命名商品';
  const description = product.description || '店主精选 · 集市好物';
  return `
    <article class="product-card">
      <a class="card-media" href="#/product/${encodeURIComponent(id)}" aria-label="${escapeHtml(name)}">
        <img src="${escapeHtml(safeImage(product.coverUrl))}" alt="${escapeHtml(name)}" loading="lazy">
        <span class="card-badges">
          ${product.needProduction ? '<span class="badge badge--make">定制</span>' : ''}
          ${stockBadge(product)}
        </span>
      </a>
      <div class="card-body">
        <span class="card-cat">${escapeHtml(product.category || '精选')}</span>
        <h3 class="card-title"><a href="#/product/${encodeURIComponent(id)}">${escapeHtml(name)}</a></h3>
        <p class="card-desc">${escapeHtml(description)}</p>
        <div class="card-foot">
          <span class="price"><span class="price__unit">¥</span>${formatMoney(product.basePrice).slice(1)}</span>
          <a class="quick-btn" href="#/product/${encodeURIComponent(id)}">
            <span>快速查看</span>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
          </a>
        </div>
      </div>
    </article>
  `;
}

function gridHtml() {
  const list =
    state.category === ALL
      ? state.products
      : state.products.filter((product) => (String(product.category || '其他').trim() || '其他') === state.category);

  if (list.length === 0) {
    return emptyState({
      title: '这个分类还没有上架商品',
      text: '换个分类看看，或者稍后再来，小铺每天都在补新货。',
      action: `<button class="btn btn--soft" type="button" data-category="${ALL}">看看全部商品</button>`
    });
  }

  return `<div class="product-grid">${list.map(productCard).join('')}</div>`;
}

function skeletonHtml() {
  return `
    <div class="product-grid">
      ${Array.from({ length: 6 })
        .map(
          () => `
            <div class="product-card skel-card" aria-hidden="true">
              <div class="card-media"><div class="skeleton" style="width:100%;height:100%;border-radius:0"></div></div>
              <div class="card-body">
                <div class="skeleton skel-line" style="width:30%"></div>
                <div class="skeleton skel-line w80"></div>
                <div class="skeleton skel-line w60"></div>
                <div class="skeleton skel-line" style="width:45%;margin-top:16px"></div>
              </div>
            </div>`
        )
        .join('')}
    </div>
  `;
}

function shopBodyHtml() {
  const s = currentSettings();
  const hasHeading = !!String(s.shopTitle || '').trim() || !!String(s.shopSubtitle || '').trim();
  return `
    ${hasHeading ? `<div class="section-head">
      <div>
        ${String(s.shopTitle || '').trim() ? `<h2 class="section-title">${escapeHtml(s.shopTitle)}</h2>` : ''}
        ${String(s.shopSubtitle || '').trim() ? `<p class="section-sub">${escapeHtml(s.shopSubtitle)}</p>` : ''}
      </div>
      <span class="section-sub">共 <b>${state.products.length}</b> 件好物</span>
    </div>` : ''}
    <div class="filter-bar" role="tablist" aria-label="商品分类">
      <div class="chips" data-chips>${chipsHtml()}</div>
    </div>
    <div data-grid>${gridHtml()}</div>
  `;
}

function bind(root) {
  const chips = root.querySelector('[data-chips]');
  if (chips) {
    chips.addEventListener('click', (event) => {
      const button = event.target.closest('[data-category]');
      if (!button) return;
      state.category = button.dataset.category || ALL;
      chips.innerHTML = chipsHtml();
      const grid = root.querySelector('[data-grid]');
      if (grid) {
        grid.innerHTML = gridHtml();
        bindGrid(root);
      }
    });
  }

  bindGrid(root);
}

function bindGrid(root) {
  const grid = root.querySelector('[data-grid]');
  if (!grid) return;
  const emptyButton = grid.querySelector('[data-category]');
  if (emptyButton) {
    emptyButton.addEventListener('click', () => {
      state.category = ALL;
      const chips = root.querySelector('[data-chips]');
      if (chips) chips.innerHTML = chipsHtml();
      grid.innerHTML = gridHtml();
      bindGrid(root);
    });
  }
}

function errorHtml() {
  return `
    <div class="container">
      <div class="section">
        <div class="empty-state">
          <svg class="empty-art" viewBox="0 0 178 150" fill="none" aria-hidden="true">
            <ellipse cx="89" cy="132" rx="58" ry="9" fill="#E9F6F0"/>
            <rect x="50" y="52" width="78" height="64" rx="16" fill="#EAF8F2" stroke="#BFE9D8" stroke-width="2.5"/>
            <path d="M76 52V44a13 13 0 0 1 26 0v8" stroke="#BFE9D8" stroke-width="2.5"/>
            <circle cx="78" cy="82" r="3" fill="#12A67A"/>
            <circle cx="100" cy="82" r="3" fill="#12A67A"/>
            <path d="M80 95c5-5 13-5 18 0" stroke="#12A67A" stroke-width="2.5" stroke-linecap="round"/>
            <path d="m141 40 3 7 7 3-7 3-3 7-3-7-7-3 7-3 3-7Z" fill="#FFC79B"/>
          </svg>
          <h3>小铺暂时没有连上货架</h3>
          <p>商品数据加载失败，可能是服务还没启动。请稍后刷新，或重新进入首页试试。</p>
          <button class="btn btn--primary" type="button" data-retry>重新加载</button>
        </div>
      </div>
    </div>
  `;
}

export async function render(root) {
  state.category = ALL;
  root.innerHTML = `
    <div class="container">
      <section class="section" id="shop">
        ${skeletonHtml()}
      </section>
    </div>
  `;

  try {
    const data = await api.getProducts();
    const products = data && Array.isArray(data.products) ? data.products : [];
    state.products = products;

    if (products.length === 0) {
      root.innerHTML = `
        <div class="container">
          <section class="section" id="shop">
            ${emptyState({
              title: '小铺还在备货中',
              text: '今天的好物正在上架，稍后刷新看看，也可以先去购物车逛逛。',
              action: '<a class="btn btn--soft" href="#/cart">打开购物车</a>'
            })}
          </section>
        </div>
      `;
      bind(root);
      return;
    }

    root.innerHTML = `
      <div class="container">
        <section class="section" id="shop">
          ${shopBodyHtml()}
        </section>
      </div>
    `;
    bind(root);
  } catch (err) {
    root.innerHTML = errorHtml();
    const retry = root.querySelector('[data-retry]');
    if (retry) {
      retry.addEventListener('click', () => render(root));
    }
  }
}
