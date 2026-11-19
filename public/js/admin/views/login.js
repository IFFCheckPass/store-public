/**
 * 管理端三要素登录
 */
import { api } from '../api.js';
import { escapeHtml, toast, setBusy } from '/js/ui.js';
import { currentSettings } from '/js/site-settings.js';
import { brandMark } from '../shared.js';

function alertHtml(message) {
  return `<div class="alert alert--error admin-login__alert" role="alert">
    <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5v.5"/></svg>
    <span>${escapeHtml(message)}</span>
  </div>`;
}

export function render(root, options = {}) {
  const { onSuccess, message = '' } = options;
  const settings = currentSettings();

  root.innerHTML = `
    <div class="admin-login">
      <div class="admin-login__inner">
        <div class="admin-login__brand">
          ${brandMark()}
          <div class="admin-login__brand-text">
            <strong>${escapeHtml(settings.brandName)}</strong>
            <small>管理中心 · OPERATION CONSOLE</small>
          </div>
        </div>

        <div class="login-layout">
          <aside class="login-aside">
            <div class="login-aside__tag">运营管理 · 全链路</div>
            <div>
              <h2 class="login-aside__title">让每一笔订单<br>都有迹可循</h2>
              <p class="login-aside__desc">订单检索、收款核验、生产配送进度、账号与赠货码，都在同一个管理中心完成。</p>
            </div>
            <div class="login-points">
              <div class="login-point"><span>1</span>收款截图与 OCR 单号人工核验</div>
              <div class="login-point"><span>2</span>订单全链路：支付、生产、打包、配送</div>
              <div class="login-point"><span>3</span>删除订单需两位超级管理员确认</div>
            </div>
            <small>仅管理员与超级管理员可进入，生产账号请前往生产工作台。</small>
          </aside>

          <form class="login-card" data-login-form novalidate>
            <h1>管理中心登录</h1>
            <p class="lead">请输入用户名、学号与密码，仅管理员账号可进入。</p>
            <div data-login-alert>${message ? alertHtml(message) : ''}</div>

            <div class="form-grid">
              <div class="field">
                <label class="field-label" for="admin-username">用户名<span class="req">*</span></label>
                <input class="input" id="admin-username" name="username" type="text" autocomplete="username" placeholder="如 manager01" required>
                <p class="field-error" data-error-for="username"></p>
              </div>
              <div class="field">
                <label class="field-label" for="admin-student-id">学号<span class="req">*</span></label>
                <input class="input" id="admin-student-id" name="studentId" type="text" inputmode="numeric" autocomplete="off" placeholder="如 20230201" required>
                <p class="field-error" data-error-for="studentId"></p>
              </div>
              <div class="field field--full">
                <label class="field-label" for="admin-password">密码<span class="req">*</span></label>
                <input class="input" id="admin-password" name="password" type="password" autocomplete="current-password" placeholder="请输入登录密码" required>
                <p class="field-error" data-error-for="password"></p>
              </div>
            </div>

            <button class="btn btn--primary btn--block admin-login__submit" type="submit" data-submit>进入管理中心</button>
            <p class="admin-login__foot">
              生产端账号请访问 <a href="/portal" style="color:var(--brand-strong);font-weight:700">生产工作台</a>；<br>
              管理员仅具备只读账号管理权限，超级管理员可执行全部写操作。
            </p>
          </form>
        </div>
      </div>
    </div>
  `;

  const form = root.querySelector('[data-login-form]');
  const alertBox = root.querySelector('[data-login-alert]');
  const submitBtn = root.querySelector('[data-submit]');
  if (!form || !submitBtn) return;

  const clearErrors = () => {
    root.querySelectorAll('[data-error-for]').forEach((el) => {
      el.textContent = '';
    });
    root.querySelectorAll('.input').forEach((el) => el.classList.remove('is-invalid'));
  };

  const setFieldError = (name, textValue) => {
    const box = root.querySelector(`[data-error-for="${name}"]`);
    const input = form.querySelector(`[name="${name}"]`);
    if (box) box.textContent = textValue;
    if (input) input.classList.add('is-invalid');
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearErrors();
    alertBox.innerHTML = '';

    const username = form.username.value.trim();
    const studentId = form.studentId.value.trim();
    const password = form.password.value;

    let invalid = false;
    if (!username) {
      setFieldError('username', '请填写用户名');
      invalid = true;
    }
    if (!studentId) {
      setFieldError('studentId', '请填写学号');
      invalid = true;
    }
    if (!password) {
      setFieldError('password', '请填写密码');
      invalid = true;
    }
    if (invalid) return;

    setBusy(submitBtn, true, '登录中…');
    try {
      const data = await api.staffLogin({ username, studentId, password });
      const staff = data && data.staff ? data.staff : null;
      if (!staff) throw new Error('登录返回信息不完整，请重试');
      toast(`欢迎回来，${staff.displayName || staff.username}`, 'success');
      if (typeof onSuccess === 'function') onSuccess(staff);
    } catch (err) {
      setBusy(submitBtn, false);
      const messageText = (err && err.message) || '登录失败，请稍后重试';
      alertBox.innerHTML = alertHtml(messageText);
    }
  });
}
