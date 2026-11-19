/**
 * 生产端三要素登录视图
 */
import { api } from '../api.js';
import { escapeHtml, toast, setBusy } from '/js/ui.js';
import { currentSettings } from '/js/site-settings.js';
import { brandMark } from '../shared.js';

function fieldError(message) {
  return `<div class="alert alert--error portal-login__alert" role="alert">
    <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5v.5"/></svg>
    <span>${escapeHtml(message)}</span>
  </div>`;
}

export function render(root, options = {}) {
  const { onSuccess, message = '' } = options;
  const settings = currentSettings();

  root.innerHTML = `
    <div class="portal-login">
      <div class="portal-login__inner">
        <div class="portal-login__brand">
          ${brandMark()}
          <div class="portal-login__brand-text">
            <strong>${escapeHtml(settings.brandName)}</strong>
            <small>生产工作台 · PRODUCTION DESK</small>
          </div>
        </div>

        <div class="login-layout">
          <aside class="login-aside">
            <div class="login-aside__tag">生产协同 · 内外一体</div>
            <div>
              <h2 class="login-aside__title">从一件商品<br>到一份送达</h2>
              <p class="login-aside__desc">外部生产负责接单与制作，内部打包负责清点与配送。状态实时同步，订单进度一目了然。</p>
            </div>
            <div class="login-points">
              <div class="login-point"><span>1</span>外部生产：按商品规格、颜色与数量接单</div>
              <div class="login-point"><span>2</span>内部打包：按班级与时间段拣货配送</div>
              <div class="login-point"><span>3</span>状态与备注沉淀在任务时间线</div>
            </div>
            <small>账号由管理端统一创建，如忘记密码请联系超级管理员重置。</small>
          </aside>

          <form class="login-card" data-login-form novalidate>
            <h1>生产端登录</h1>
            <p class="lead">请输入用户名、学号与密码，进入对应工作台。</p>
            <div data-login-alert>
              ${message ? fieldError(message) : ''}
            </div>

            <div class="form-grid">
              <div class="field">
                <label class="field-label" for="login-username">用户名<span class="req">*</span></label>
                <input class="input" id="login-username" name="username" type="text" autocomplete="username" placeholder="如 maker01" required>
                <p class="field-error" data-error-for="username"></p>
              </div>
              <div class="field">
                <label class="field-label" for="login-student-id">学号<span class="req">*</span></label>
                <input class="input" id="login-student-id" name="studentId" type="text" inputmode="numeric" autocomplete="off" placeholder="如 20230301" required>
                <p class="field-error" data-error-for="studentId"></p>
              </div>
              <div class="field field--full">
                <label class="field-label" for="login-password">密码<span class="req">*</span></label>
                <input class="input" id="login-password" name="password" type="password" autocomplete="current-password" placeholder="请输入登录密码" required>
                <p class="field-error" data-error-for="password"></p>
              </div>
            </div>

            <button class="btn btn--primary btn--block portal-login__submit" type="submit" data-submit>进入工作台</button>
            <p class="portal-login__foot">
              外部生产账号进入「外部生产工作台」，内部打包账号进入「内部打包配送」。<br>
              管理员账号可同时查看两类任务，并可前往管理端。
            </p>
          </form>
        </div>
      </div>
    </div>
  `;

  const form = root.querySelector('[data-login-form]');
  const alertBox = root.querySelector('[data-login-alert]');
  const submitBtn = root.querySelector('[data-submit]');

  const clearErrors = () => {
    root.querySelectorAll('[data-error-for]').forEach((el) => {
      el.textContent = '';
    });
    root.querySelectorAll('.input').forEach((el) => el.classList.remove('is-invalid'));
  };

  const setFieldError = (name, message) => {
    const box = root.querySelector(`[data-error-for="${name}"]`);
    const input = form.querySelector(`[name="${name}"]`);
    if (box) box.textContent = message;
    if (input) input.classList.add('is-invalid');
  };

  if (!form || !submitBtn) return;

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
      alertBox.innerHTML = fieldError(messageText);
    }
  });
}
