import { api, getCachedUser, setCachedUser } from './api.js';
import { getCount } from './cart.js';
import { escapeHtml, initials, installImageFallback, toast } from './ui.js';
import { applyBranding, applyTheme, brandName, loadSiteSettings } from './site-settings.js';
import * as homeView from './views/home.js';
import * as productView from './views/product.js';
import * as cartView from './views/cart.js';
import * as checkoutView from './views/checkout.js';
import * as loginView from './views/login.js';
import * as ordersView from './views/orders.js';
import * as orderView from './views/order.js';

const ROUTES = [
  { pattern: /^\/?$/, view: homeView, nav: 'home', title: '首页' },
  { pattern: /^\/product\/([^/]+)\/?$/, view: productView, nav: 'home', title: '商品详情' },
  { pattern: /^\/cart\/?$/, view: cartView, nav: 'cart', title: '购物车' },
  { pattern: /^\/checkout\/?$/, view: checkoutView, nav: 'cart', title: '结算' },
  { pattern: /^\/login\/?$/, view: loginView, nav: '', title: '登录' },
  { pattern: /^\/orders\/?$/, view: ordersView, nav: 'orders', title: '我的订单' },
  { pattern: /^\/order\/([^/]+)\/?$/, view: orderView, nav: 'orders', title: '订单详情' }
];

const PARAM_NAMES = {
  '^\\/product\\/([^/]+)\\/?$': ['id'],
  '^\\/order\\/([^/]+)\\/?$': ['orderNo']
};

const app = document.getElementById('app');

function parseHash() {
  const raw = window.location.hash ? window.location.hash.slice(1) : '/';
  const [pathPart, queryPart] = raw.split('?');
  let path = pathPart || '/';
  if (!path.startsWith('/')) path = '/' + path;

  const query = {};
  new URLSearchParams(queryPart || '').forEach((value, key) => {
    query[key] = value;
  });

  return { path, query };
}

function decodeParam(value) {
  try {
    return decodeURIComponent(value);
  } catch (err) {
    return value;
  }
}

function matchRoute(path) {
  for (const route of ROUTES) {
    const match = path.match(route.pattern);
    if (!match) continue;
    const names = PARAM_NAMES[route.pattern.source] || [];
    const params = {};
    names.forEach((name, index) => {
      params[name] = decodeParam(match[index + 1] || '');
    });
    return { route, params };
  }
  return null;
}

function setActiveNav(nav) {
  document.querySelectorAll('[data-nav]').forEach((link) => {
    link.classList.toggle('is-active', !!nav && link.dataset.nav === nav);
  });
}

function navIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8.5" r="3.5"/><path d="M5 20c.6-3.4 3.4-5.5 7-5.5s6.4 2.1 7 5.5"/></svg>';
}

function renderUserArea() {
  const area = document.querySelector('[data-user-area]');
  if (!area) return;
  const user = getCachedUser();

  if (!user) {
    area.innerHTML = `<a class="user-login-btn" href="#/login">${navIcon()}<span>登录</span></a>`;
    return;
  }

  area.innerHTML = `
    <div class="user-chip" title="${escapeHtml(user.name || '同学')}">
      <span class="user-avatar">${escapeHtml(initials(user.name))}</span>
      <span class="user-meta">
        <strong>${escapeHtml(user.name || '同学')}</strong>
        <small>${escapeHtml(user.className || '—')} · ${escapeHtml(user.seatNo || '—')} 座</small>
      </span>
      <button class="logout-btn" type="button" data-logout aria-label="退出登录">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 8l-4 4 4 4M6 12h9"/></svg>
      </button>
    </div>
  `;

  const logoutBtn = area.querySelector('[data-logout]');
  if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);
}

function renderCartCount() {
  const badges = document.querySelectorAll('[data-cart-count]');
  const count = getCount();
  badges.forEach((badge) => {
    badge.textContent = count > 99 ? '99+' : String(count);
    badge.hidden = count <= 0;
  });
}

async function handleLogout() {
  const { path } = parseHash();
  try {
    await api.logoutUser();
  } catch (err) {
    /* 接口失败也清理本地登录态 */
  }
  setCachedUser(null);
  renderUserArea();
  toast('已退出登录', 'info');

  if (path.startsWith('/orders') || path.startsWith('/order/') || path.startsWith('/checkout')) {
    window.location.hash = '#/';
  } else {
    window.dispatchEvent(new Event('hashchange'));
  }
}

function loadingHtml() {
  return `
    <div class="container">
      <div class="page-loading">
        <span class="spinner"></span>
        <p>正在打开页面…</p>
      </div>
    </div>
  `;
}

function notFoundHtml() {
  return `
    <div class="container">
      <div class="empty-state">
        <svg class="empty-art" viewBox="0 0 178 150" fill="none" aria-hidden="true">
          <ellipse cx="89" cy="132" rx="58" ry="9" fill="#E9F6F0"/>
          <path d="M52 58h74l-7 68a10 10 0 0 1-10 9H69a10 10 0 0 1-10-9l-7-68Z" fill="#EAF8F2" stroke="#BFE9D8" stroke-width="2.5"/>
          <path d="M72 58V48a17 17 0 0 1 34 0v10" stroke="#BFE9D8" stroke-width="2.5"/>
          <circle cx="78" cy="94" r="3" fill="#12A67A"/>
          <circle cx="100" cy="94" r="3" fill="#12A67A"/>
          <path d="M82 108c4-4 10-4 14 0" stroke="#12A67A" stroke-width="2.5" stroke-linecap="round"/>
          <path d="m124 40 2 5 5 2-5 2-2 5-2-5-5-2 5-2 2-5Z" fill="#FFC79B"/>
        </svg>
        <h3>这个页面走丢了</h3>
        <p>链接可能不太完整，回到首页继续逛小铺吧。</p>
        <a class="btn btn--primary" href="#/">回到首页</a>
      </div>
    </div>
  `;
}

function fatalHtml(message) {
  return `
    <div class="container">
      <div class="empty-state">
        <svg class="empty-art" viewBox="0 0 178 150" fill="none" aria-hidden="true">
          <ellipse cx="89" cy="132" rx="58" ry="9" fill="#E9F6F0"/>
          <rect x="50" y="52" width="78" height="64" rx="16" fill="#EAF8F2" stroke="#BFE9D8" stroke-width="2.5"/>
          <path d="M76 52V44a13 13 0 0 1 26 0v8" stroke="#BFE9D8" stroke-width="2.5"/>
          <circle cx="78" cy="82" r="3" fill="#12A67A"/>
          <circle cx="100" cy="82" r="3" fill="#12A67A"/>
          <path d="M80 95c5-5 13-5 18 0" stroke="#12A67A" stroke-width="2.5" stroke-linecap="round"/>
        </svg>
        <h3>页面加载遇到问题</h3>
        <p>${escapeHtml(message || '请刷新页面后重试')}</p>
        <button class="btn btn--primary" type="button" data-reload>刷新页面</button>
      </div>
    </div>
  `;
}

let renderSeq = 0;

async function renderRoute() {
  const seq = ++renderSeq;
  const { path, query } = parseHash();
  const matched = matchRoute(path);

  setActiveNav(matched ? matched.route.nav : '');
  window.scrollTo(0, 0);

  if (!matched) {
    document.title = `页面不存在 · ${brandName()}`;
    app.innerHTML = notFoundHtml();
    return;
  }

  document.title = `${matched.route.title} · ${brandName()}`;
  app.innerHTML = loadingHtml();

  try {
    await matched.route.view.render(app, matched.params, query);
  } catch (err) {
    if (seq !== renderSeq) return;
    app.innerHTML = fatalHtml((err && err.message) || '请刷新页面后重试');
    const reload = app.querySelector('[data-reload]');
    if (reload) reload.addEventListener('click', () => renderRoute());
  }
}

async function bootstrapAuth() {
  try {
    const data = await api.getMe();
    setCachedUser(data && data.user ? data.user : null);
  } catch (err) {
    setCachedUser(null);
  }
  renderUserArea();
}

function bindGlobalEvents() {
  window.addEventListener('hashchange', renderRoute);
  window.addEventListener('cart:change', renderCartCount);
  window.addEventListener('auth:change', renderUserArea);

  let unauthorizedAt = 0;
  window.addEventListener('api:unauthorized', () => {
    renderUserArea();
    if (Date.now() - unauthorizedAt > 3000) {
      unauthorizedAt = Date.now();
      toast('登录状态已失效，请重新登录', 'error');
    }
  });
}

async function start() {
  installImageFallback();
  bindGlobalEvents();

  const settings = await loadSiteSettings();
  applyTheme(settings);
  applyBranding(settings);

  renderCartCount();

  await bootstrapAuth();
  renderUserArea();
  renderRoute();
}

start();
