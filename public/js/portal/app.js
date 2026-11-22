/**
 * 生产工作台入口：会话恢复、登录分流、Hash 路由
 */
import { api } from './api.js';
import {
  escapeHtml,
  initials,
  installImageFallback,
  toast,
  closeModal,
  openModal,
  setBusy
} from '/js/ui.js';
import {
  applyTheme,
  brandName,
  currentSettings,
  isSafeImageUrl,
  loadSiteSettings
} from '/js/site-settings.js';
import { brandMark, roleBadge, roleLabel } from './shared.js';
import { render as renderLogin } from './views/login.js';
import { maybePromptStudentId } from '/js/staff-profile-prompt.js';
import * as externalView from './views/external.js';
import * as internalView from './views/internal.js';

const appEl = document.getElementById('portal-app');

const session = { staff: null };

function isAdminRole(role) {
  return role === 'admin' || role === 'super_admin';
}

function allowedTypes(role) {
  if (role === 'prod_external') return ['external'];
  if (role === 'prod_internal') return ['internal'];
  return ['external', 'internal'];
}

function defaultHash(role) {
  return role === 'prod_internal' ? '#/internal' : '#/external';
}

function navIcon(type) {
  if (type === 'internal') {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 8 12 4l7.5 4v8L12 20l-7.5-4V8Z"/><path d="M4.8 8.2 12 12l7.2-3.8M12 12v8"/></svg>';
  }
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14.5 5.5 4 4-2 2-4-4 2-2Z"/><path d="m12.5 7.5-7 7 4 4 7-7"/><path d="M4 20l2.5-2.5"/></svg>';
}

function parsePath() {
  const raw = window.location.hash ? window.location.hash.slice(1) : '/';
  const pathPart = raw.split('?')[0] || '/';
  return pathPart.startsWith('/') ? pathPart : `/${pathPart}`;
}

function navHtml(role) {
  const types = allowedTypes(role);
  const items = [];
  if (types.includes('external')) {
    items.push(
      `<a href="#/external" data-route="external">${navIcon('external')}<span>外部生产</span></a>`
    );
  }
  if (types.includes('internal')) {
    items.push(
      `<a href="#/internal" data-route="internal">${navIcon('internal')}<span>内部打包</span></a>`
    );
  }
  return items.join('');
}

function renderShell() {
  const staff = session.staff;
  if (!staff) return;
  const adminLink = isAdminRole(staff.role)
    ? `<a class="portal-admin-link" href="/admin" title="前往管理端">
         <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 6.5 18.5 12 13 17.5"/></svg>
         <span>管理端入口</span>
       </a>`
    : '';

  appEl.innerHTML = `
    <header class="portal-header">
      <div class="portal-header__inner">
        <a class="portal-brand" href="${defaultHash(staff.role)}">
          ${brandMark()}
          <span class="portal-brand__text">
            <strong data-portal-brand-name>生产工作台</strong>
            <small>生产工作台 · PRODUCTION DESK</small>
          </span>
        </a>

        <nav class="portal-nav" aria-label="工作台导航">${navHtml(staff.role)}</nav>

        <div class="portal-header__right">
          ${adminLink}
          <button class="btn btn--line btn--sm" type="button" data-profile>个人设置</button>
          <div class="portal-user" title="${escapeHtml(staff.displayName || staff.username || '')}">
            <span class="user-avatar">${escapeHtml(initials(staff.displayName || staff.username))}</span>
            <span class="portal-user__meta">
              <strong>${escapeHtml(staff.displayName || staff.username || '成员')}</strong>
              <small>${escapeHtml(roleLabel(staff.role))} · ${escapeHtml(staff.studentId || '—')}</small>
            </span>
            ${roleBadge(staff.role)}
            <button class="portal-logout" type="button" data-logout aria-label="退出登录" title="退出登录">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 8l-4 4 4 4M6 12h9"/></svg>
            </button>
          </div>
        </div>
      </div>
    </header>

    <main class="portal-main" id="portal-view"></main>
  `;

  const logoutBtn = appEl.querySelector('[data-logout]');
  if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);

  const profileBtn = appEl.querySelector('[data-profile]');
  if (profileBtn) profileBtn.addEventListener('click', openProfileModal);

  const settings = currentSettings();
  const brandEl = appEl.querySelector('[data-portal-brand-name]');
  if (brandEl) brandEl.textContent = settings.brandName;
  const logo = isSafeImageUrl(settings.logoUrl) ? String(settings.logoUrl).trim() : '';
  if (logo) {
    appEl.querySelectorAll('.brand-mark').forEach((mark) => {
      if (mark.querySelector('img[data-brand-logo]')) return;
      // 用 DOM API 设置 src，避免 logoUrl 注入 HTML
      const img = document.createElement('img');
      img.setAttribute('data-brand-logo', '');
      img.alt = '';
      img.addEventListener('error', () => img.remove());
      img.src = logo;
      mark.appendChild(img);
    });
  }
}

function openProfileModal() {
  const staff = session.staff;
  if (!staff) return;
  const handle = openModal({
    title: '个人设置',
    eyebrow: '账号安全',
    sub: '可自行修改登录学号与密码，修改前需验证当前密码。',
    body: `
      <div class="form-grid">
        <div class="field field--full">
          <label class="field-label" for="portal-student-id">登录学号</label>
          <input class="input" id="portal-student-id" type="text" maxlength="20" value="${escapeHtml(
            staff.studentId || ''
          )}" placeholder="6-20 位字母或数字">
        </div>
        <div class="field field--full">
          <label class="field-label" for="portal-profile-password">当前密码</label>
          <input class="input" id="portal-profile-password" type="password" maxlength="72" autocomplete="current-password">
        </div>
      </div>
      <div data-profile-error class="form-modal__error"></div>
      <div style="display:flex;justify-content:flex-end;margin-bottom:18px">
        <button class="btn btn--soft" type="button" data-save-profile>保存学号</button>
      </div>

      <div class="form-grid">
        <div class="field field--full">
          <label class="field-label" for="portal-current-password">当前密码</label>
          <input class="input" id="portal-current-password" type="password" maxlength="72" autocomplete="current-password">
        </div>
        <div class="field">
          <label class="field-label" for="portal-new-password">新密码</label>
          <input class="input" id="portal-new-password" type="password" maxlength="72" autocomplete="new-password">
        </div>
        <div class="field">
          <label class="field-label" for="portal-confirm-password">确认新密码</label>
          <input class="input" id="portal-confirm-password" type="password" maxlength="72" autocomplete="new-password">
        </div>
      </div>
      <div data-password-error class="form-modal__error"></div>
      <div style="display:flex;justify-content:flex-end">
        <button class="btn btn--primary" type="button" data-save-password>更新密码</button>
      </div>
    `,
    footer: '<button class="btn btn--ghost" type="button" data-cancel>关闭</button>'
  });
  if (!handle) return;

  const body = handle.body;
  const studentInput = body.querySelector('#portal-student-id');
  const profilePassword = body.querySelector('#portal-profile-password');
  const profileError = body.querySelector('[data-profile-error]');
  const profileBtn = body.querySelector('[data-save-profile]');
  const currentPassword = body.querySelector('#portal-current-password');
  const newPassword = body.querySelector('#portal-new-password');
  const confirmPassword = body.querySelector('#portal-confirm-password');
  const passwordError = body.querySelector('[data-password-error]');
  const passwordBtn = body.querySelector('[data-save-password]');
  const cancelBtn = handle.foot.querySelector('[data-cancel]');

  const setError = (el, message) => {
    el.innerHTML = message
      ? `<div class="admin-alert admin-alert--error"><span>${escapeHtml(message)}</span></div>`
      : '';
  };

  cancelBtn.addEventListener('click', () => closeModal());

  profileBtn.addEventListener('click', async () => {
    const studentId = studentInput.value.trim();
    if (!/^[A-Za-z0-9]{6,20}$/.test(studentId)) {
      setError(profileError, '学号需为 6-20 位字母或数字');
      return;
    }
    if (!profilePassword.value) {
      setError(profileError, '请输入当前密码');
      return;
    }
    setBusy(profileBtn, true, '保存中…');
    try {
      const data = await api.updateOwnProfile({
        studentId,
        currentPassword: profilePassword.value
      });
      session.staff.studentId = data && data.staff ? data.staff.studentId : studentId;
      closeModal();
      renderShell();
      toast('学号已更新', 'success');
    } catch (err) {
      if (err && err.status === 401) return;
      setError(profileError, (err && err.message) || '保存失败');
    } finally {
      setBusy(profileBtn, false);
    }
  });

  passwordBtn.addEventListener('click', async () => {
    const current = currentPassword.value;
    const next = newPassword.value;
    if (!current) return setError(passwordError, '请输入当前密码');
    if (next.length < 6) return setError(passwordError, '新密码长度不能少于 6 位');
    if (next === current) return setError(passwordError, '新密码不能与当前密码相同');
    if (next !== confirmPassword.value) return setError(passwordError, '两次输入的新密码不一致');

    setBusy(passwordBtn, true, '更新中…');
    try {
      await api.changeOwnPassword({ currentPassword: current, newPassword: next });
      currentPassword.value = '';
      newPassword.value = '';
      confirmPassword.value = '';
      setError(passwordError, '');
      toast('密码已更新，下次登录请使用新密码', 'success');
    } catch (err) {
      if (err && err.status === 401) return;
      setError(passwordError, (err && err.message) || '更新失败');
    } finally {
      setBusy(passwordBtn, false);
    }
  });
}

function setActiveNav(type) {
  appEl.querySelectorAll('[data-route]').forEach((link) => {
    link.classList.toggle('is-active', link.dataset.route === type);
  });
}

function route() {
  if (!session.staff) {
    showLogin();
    return;
  }
  const staff = session.staff;
  const path = parsePath();
  const allowed = allowedTypes(staff.role);
  let type = path === '/internal' ? 'internal' : path === '/external' ? 'external' : '';

  if (!type || !allowed.includes(type)) {
    type = allowed.includes('external') ? 'external' : 'internal';
    try {
      window.history.replaceState(null, '', `#/${type}`);
    } catch (err) {
      window.location.hash = `#/${type}`;
    }
  }

  setActiveNav(type);
  const view = document.getElementById('portal-view');
  if (!view) return;

  document.title =
    type === 'internal'
      ? `内部打包配送 · 生产工作台 · ${brandName()}`
      : `外部生产 · 生产工作台 · ${brandName()}`;

  const ctx = { staff };
  if (type === 'internal') {
    internalView.render(view, ctx);
  } else {
    externalView.render(view, ctx);
  }
}

function showLogin(message = '') {
  session.staff = null;
  renderLogin(appEl, {
    message,
    onSuccess(staff) {
      session.staff = staff;
      const target = defaultHash(staff.role);
      try {
        window.history.replaceState(null, '', target);
      } catch (err) {
        window.location.hash = target;
      }
      renderShell();
      route();
      maybePromptStudentId({ staff, api });
    }
  });
}

async function handleLogout() {
  try {
    await api.staffLogout();
  } catch (err) {
    /* 退出接口失败也清理本地状态 */
  }
  session.staff = null;
  toast('已退出登录', 'info');
  showLogin();
}

function onUnauthorized() {
  if (!session.staff) return;
  session.staff = null;
  closeModal(true);
  showLogin('登录状态已失效，请重新登录');
}

async function bootstrap() {
  installImageFallback();
  window.addEventListener('hashchange', route);
  window.addEventListener('staff:unauthorized', onUnauthorized);

  const settings = await loadSiteSettings();
  applyTheme(settings);

  try {
    const data = await api.staffMe();
    if (data && data.staff) {
      session.staff = data.staff;
      const allowed = allowedTypes(session.staff.role);
      const path = parsePath();
      const type = path === '/internal' ? 'internal' : path === '/external' ? 'external' : '';
      if (!type || !allowed.includes(type)) {
        try {
          window.history.replaceState(null, '', defaultHash(session.staff.role));
        } catch (err) {
          window.location.hash = defaultHash(session.staff.role);
        }
      }
      renderShell();
      route();
      maybePromptStudentId({ staff: session.staff, api });
      return;
    }
  } catch (err) {
    /* 未登录或会话失效，进入登录视图 */
  }

  showLogin();
}

bootstrap();
