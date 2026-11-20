/**
 * 管理中心入口：会话恢复、角色校验、Hash 路由
 */
import { api } from './api.js';
import { escapeHtml, initials, installImageFallback, toast, closeModal } from '/js/ui.js';
import { applyTheme, brandName, currentSettings, loadSiteSettings } from '/js/site-settings.js';
import { brandMark, roleBadge, roleLabel } from './shared.js';
import { render as renderLogin } from './views/login.js';
import { maybePromptStudentId } from '/js/staff-profile-prompt.js';
import * as dashboardView from './views/dashboard.js';
import * as ordersView from './views/orders.js';
import * as orderView from './views/order.js';
import * as paymentsView from './views/payments.js';
import * as accountsView from './views/accounts.js';
import * as productsView from './views/products.js';
import * as giftCodesView from './views/gift-codes.js';
import * as deletionsView from './views/deletions.js';
import * as settingsView from './views/settings.js';
import * as profileView from './views/profile.js';
import * as auditView from './views/audit.js';

const appEl = document.getElementById('admin-app');

const session = { staff: null };

const NAV_ITEMS = [
  { key: 'dashboard', label: '仪表盘', hash: '#/dashboard', icon: 'dashboard' },
  { key: 'orders', label: '订单管理', hash: '#/orders', icon: 'orders' },
  { key: 'products', label: '商品管理', hash: '#/products', icon: 'products' },
  { key: 'payments', label: '收款核验', hash: '#/payments', icon: 'payments' },
  { key: 'accounts', label: '账号管理', hash: '#/accounts', icon: 'accounts' },
  { key: 'gift-codes', label: '赠货码', hash: '#/gift-codes', icon: 'gift' },
  { key: 'deletions', label: '删除审批', hash: '#/deletions', icon: 'delete' },
  { key: 'settings', label: '站点设置', hash: '#/settings', icon: 'settings' },
  { key: 'profile', label: '个人设置', hash: '#/profile', icon: 'profile' },
  { key: 'audit', label: '审计日志', hash: '#/audit', icon: 'audit' }
];

const ROUTES = [
  { pattern: /^\/dashboard\/?$/, view: dashboardView, nav: 'dashboard', title: '仪表盘' },
  { pattern: /^\/orders\/?$/, view: ordersView, nav: 'orders', title: '订单管理' },
  { pattern: /^\/order\/([^/]+)\/?$/, view: orderView, nav: 'orders', title: '订单详情', param: 'orderNo' },
  { pattern: /^\/products\/?$/, view: productsView, nav: 'products', title: '商品管理' },
  { pattern: /^\/payments\/?$/, view: paymentsView, nav: 'payments', title: '收款核验' },
  { pattern: /^\/accounts\/?$/, view: accountsView, nav: 'accounts', title: '账号管理' },
  { pattern: /^\/gift-codes\/?$/, view: giftCodesView, nav: 'gift-codes', title: '赠货码' },
  { pattern: /^\/deletions\/?$/, view: deletionsView, nav: 'deletions', title: '删除审批' },
  { pattern: /^\/settings\/?$/, view: settingsView, nav: 'settings', title: '站点设置' },
  { pattern: /^\/profile\/?$/, view: profileView, nav: 'profile', title: '个人设置' },
  { pattern: /^\/audit\/?$/, view: auditView, nav: 'audit', title: '审计日志' }
];

let renderSeq = 0;

function isAdminRole(role) {
  return role === 'admin' || role === 'super_admin';
}

function navIcon(name) {
  const icons = {
    dashboard:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="6.5" height="6.5" rx="1.6"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.6"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.6"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.6"/></svg>',
    orders:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4h12a1 1 0 0 1 1 1v15l-3.5-2-3.5 2-3.5-2L5 20V5a1 1 0 0 1 1-1Z"/><path d="M8.5 9h7M8.5 12.5h5"/></svg>',
    payments:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="6" width="17" height="12" rx="2"/><path d="M3.5 10h17M7 14.5h3"/></svg>',
    products:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 8 12 4l7.5 4v8L12 20l-7.5-4V8Z"/><path d="M4.8 8.2 12 12l7.2-3.8M12 12v8"/></svg>',
    settings:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14.2 3h-4l-.3 2.7a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.5a7 7 0 0 0 0 2.4l-2 1.5 2 3.4 2.4-1a7 7 0 0 0 2 1.2l.3 2.7h4l.3-2.7a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.5c.1-.4.1-.8.1-1.2Z"/></svg>',
    profile:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8.5" r="3.2"/><path d="M5 20c.6-3.4 3.4-5.5 7-5.5s6.4 2.1 7 5.5"/><path d="M17.5 4.5h3M19 3v3"/></svg>',
    accounts:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8.5" r="3"/><path d="M3.5 19.5c.5-3.2 2.8-5 5.5-5s5 1.8 5.5 5"/><path d="M15.5 5.5a3 3 0 0 1 0 6M16.5 14.8c2.2.3 3.7 1.9 4 4.7"/></svg>',
    gift:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10h16v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-9Z"/><path d="M3 6h18v4H3zM12 6v14"/><path d="M12 6c-2.4 0-4-.9-4-2.1S9.2 2.1 10.2 3c.9.7 1.8 2 1.8 3Zm0 0c2.4 0 4-.9 4-2.1S14.8 2.1 13.8 3c-.9.7-1.8 2-1.8 3Z"/></svg>',
    delete:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M9 7V4.5h6V7M6.5 7l.8 12a1.5 1.5 0 0 0 1.5 1.4h6.4a1.5 1.5 0 0 0 1.5-1.4l.8-12"/><path d="M10 11v5M14 11v5"/></svg>',
    audit:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5 19 6v5.6c0 4.2-2.9 7.6-7 8.9-4.1-1.3-7-4.7-7-8.9V6l7-2.5Z"/><path d="m9 12 2 2 4-4.2"/></svg>'
  };
  return icons[name] || icons.dashboard;
}

function navHtml() {
  return NAV_ITEMS.map(
    (item) =>
      `<a href="${item.hash}" data-nav="${item.key}">${navIcon(item.icon)}<span>${item.label}</span></a>`
  ).join('');
}

function parseHash() {
  const raw = window.location.hash ? window.location.hash.slice(1) : '/';
  const [pathPart] = raw.split('?');
  let path = pathPart || '/';
  if (!path.startsWith('/')) path = `/${path}`;
  return path;
}

function renderShell() {
  const staff = session.staff;
  if (!staff) return;

  appEl.innerHTML = `
    <div class="admin-shell">
      <aside class="admin-side">
        <a class="admin-brand" href="#/dashboard">
          ${brandMark()}
          <span class="admin-brand__text">
            <strong data-admin-brand-name>管理中心</strong>
            <small>OPERATION CONSOLE</small>
          </span>
        </a>

        <nav class="admin-nav" aria-label="管理端导航">${navHtml()}</nav>

        <div class="admin-side-foot">
          <a href="/portal">前往生产工作台</a>
          <a href="/">前往用户端商城</a>
          <span data-admin-brand-footer>运营后台</span>
        </div>
      </aside>

      <div class="admin-main">
        <header class="admin-topbar">
          <div class="admin-topbar__crumb">
            <small>Operation Console</small>
            <h1 data-page-title>仪表盘</h1>
          </div>
          <div class="admin-user">
            <div class="user-chip" title="${escapeHtml(staff.displayName || staff.username || '')}">
              <span class="user-avatar">${escapeHtml(initials(staff.displayName || staff.username))}</span>
              <span class="user-meta">
                <strong>${escapeHtml(staff.displayName || staff.username || '管理员')}</strong>
                <small>${escapeHtml(roleLabel(staff.role))} · ${escapeHtml(staff.username || '')}</small>
              </span>
              <span class="admin-user__meta">${roleBadge(staff.role)}</span>
              <button class="logout-btn" type="button" data-logout aria-label="退出登录" title="退出登录">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 8l-4 4 4 4M6 12h9"/></svg>
              </button>
            </div>
          </div>
        </header>

        <main class="admin-view" id="admin-view"></main>
      </div>
    </div>
  `;

  const logoutBtn = appEl.querySelector('[data-logout]');
  if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);

  applyAdminBranding();
}

function applyAdminBranding() {
  const settings = currentSettings();
  const nameEl = appEl.querySelector('[data-admin-brand-name]');
  if (nameEl) nameEl.textContent = `${settings.brandName} · 管理中心`;
  const foot = appEl.querySelector('[data-admin-brand-footer]');
  if (foot) foot.textContent = `${settings.brandName} · 运营后台`;
  if (settings.logoUrl) {
    appEl.querySelectorAll('.brand-mark').forEach((mark) => {
      mark.innerHTML = `<img src="${settings.logoUrl}" alt="">`;
    });
  }
}

function setActiveNav(key) {
  appEl.querySelectorAll('[data-nav]').forEach((link) => {
    link.classList.toggle('is-active', link.dataset.nav === key);
  });
}

function setPageTitle(title) {
  const el = appEl.querySelector('[data-page-title]');
  if (el) el.textContent = title;
  document.title = `${title} · 管理中心 · ${brandName()}`;
}

function route() {
  if (!session.staff) {
    showLogin();
    return;
  }
  if (!isAdminRole(session.staff.role)) {
    showNoAccess(session.staff);
    return;
  }

  const path = parseHash();
  const matched = ROUTES.find((item) => item.pattern.test(path));

  if (!matched) {
    try {
      window.history.replaceState(null, '', '#/dashboard');
    } catch (err) {
      window.location.hash = '#/dashboard';
    }
    route();
    return;
  }

  const match = path.match(matched.pattern);
  const params = {};
  if (matched.param) {
    try {
      params[matched.param] = decodeURIComponent(match[1] || '');
    } catch (err) {
      params[matched.param] = match[1] || '';
    }
  }

  setActiveNav(matched.nav);
  setPageTitle(matched.title);

  const view = document.getElementById('admin-view');
  if (!view) return;

  const seq = ++renderSeq;
  const ctx = {
    staff: session.staff,
    isCurrent: () => seq === renderSeq
  };

  try {
    matched.view.render(view, ctx, params);
  } catch (err) {
    view.innerHTML = `<div class="admin-error-block"><strong>页面渲染失败</strong><p>${escapeHtml(
      (err && err.message) || '请刷新页面后重试'
    )}</p><button class="btn btn--soft" type="button" data-reload-page>刷新页面</button></div>`;
    const reloadBtn = view.querySelector('[data-reload-page]');
    if (reloadBtn) reloadBtn.addEventListener('click', () => window.location.reload());
  }
}

function showLogin(message = '') {
  session.staff = null;
  renderLogin(appEl, {
    message,
    onSuccess(staff) {
      session.staff = staff;
      if (!isAdminRole(staff.role)) {
        showNoAccess(staff);
        return;
      }
      try {
        window.history.replaceState(null, '', '#/dashboard');
      } catch (err) {
        window.location.hash = '#/dashboard';
      }
      renderShell();
      route();
      maybePromptStudentId({ staff, api });
    }
  });
}

function showNoAccess(staff) {
  session.staff = staff;
  appEl.innerHTML = `
    <div class="admin-gate">
      <div class="login-prompt">
        <div class="prompt-icon">
          <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4.5" y="10.5" width="15" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5M12 14.5v2.5"/></svg>
        </div>
        <h2>当前账号无权进入管理中心</h2>
        <p>您当前登录的是「${escapeHtml(roleLabel(staff.role))}」账号（${escapeHtml(
          staff.displayName || staff.username || '成员'
        )}）。管理中心仅对管理员与超级管理员开放，生产任务请前往生产工作台处理。</p>
        <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
          <a class="btn btn--primary" href="/portal">前往生产工作台</a>
          <button class="btn btn--line" type="button" data-switch>换个账号登录</button>
        </div>
      </div>
    </div>
  `;

  const switchBtn = appEl.querySelector('[data-switch]');
  if (switchBtn) {
    switchBtn.addEventListener('click', async () => {
      try {
        await api.staffLogout();
      } catch (err) {
        /* 忽略退出失败 */
      }
      session.staff = null;
      showLogin();
    });
  }
}

async function handleLogout() {
  try {
    await api.staffLogout();
  } catch (err) {
    /* 忽略退出失败 */
  }
  session.staff = null;
  renderSeq += 1;
  toast('已退出登录', 'info');
  showLogin();
}

function onUnauthorized() {
  if (!session.staff) return;
  session.staff = null;
  renderSeq += 1;
  closeModal(true);
  showLogin('登录状态已失效，请重新登录');
}

async function bootstrap() {
  installImageFallback();
  window.addEventListener('hashchange', route);
  window.addEventListener('admin:unauthorized', onUnauthorized);

  const settings = await loadSiteSettings();
  applyTheme(settings);

  try {
    const data = await api.staffMe();
    if (data && data.staff) {
      session.staff = data.staff;
      if (!isAdminRole(session.staff.role)) {
        showNoAccess(session.staff);
        return;
      }
      const path = parseHash();
      if (!ROUTES.some((item) => item.pattern.test(path))) {
        try {
          window.history.replaceState(null, '', '#/dashboard');
        } catch (err) {
          window.location.hash = '#/dashboard';
        }
      }
      renderShell();
      route();
      maybePromptStudentId({ staff: session.staff, api });
      return;
    }
  } catch (err) {
    /* 未登录，进入登录视图 */
  }

  showLogin();
}

bootstrap();
