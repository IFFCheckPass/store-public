import { api, getCachedUser, setCachedUser } from '../api.js';
import { escapeHtml, toast, openModal, setBusy, scrollToElement } from '../ui.js';
import { currentSettings } from '../site-settings.js';

function fieldsHtml(prefix) {
  return `
    <div class="form-grid">
      <div class="field field--full">
        <label class="field-label" for="${prefix}-name">姓名 <span class="req">*</span></label>
        <input class="input" id="${prefix}-name" name="name" type="text" autocomplete="name" placeholder="请输入你的姓名" maxlength="20">
      </div>
      <div class="field">
        <label class="field-label" for="${prefix}-class">班级 <span class="req">*</span></label>
        <input class="input" id="${prefix}-class" name="className" type="text" placeholder="如 高二(3)班" maxlength="30">
      </div>
      <div class="field">
        <label class="field-label" for="${prefix}-seat">座号 <span class="req">*</span></label>
        <input class="input" id="${prefix}-seat" name="seatNo" type="text" inputmode="numeric" placeholder="如 12" maxlength="10">
      </div>
    </div>
    <button class="student-toggle" type="button" data-toggle-student>
      需要学号？
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
    </button>
    <div class="student-field" data-student-field hidden>
      <div class="field">
        <label class="field-label" for="${prefix}-student">学号 <span class="opt">选填 · 用于领取核验</span></label>
        <input class="input" id="${prefix}-student" name="studentId" type="text" inputmode="numeric" placeholder="没有可以留空" maxlength="30">
      </div>
    </div>
    <div class="form-error" data-form-error></div>
  `;
}

function markInvalid(input, message) {
  if (!input) return;
  input.classList.add('is-invalid');
  const field = input.closest('.field');
  if (!field) return;
  let error = field.querySelector('.field-error');
  if (!error) {
    error = document.createElement('div');
    error.className = 'field-error';
    error.dataset.dyn = '1';
    field.appendChild(error);
  }
  error.textContent = message;
}

function clearErrors(form) {
  form.querySelectorAll('.is-invalid').forEach((el) => el.classList.remove('is-invalid'));
  form.querySelectorAll('.field-error[data-dyn="1"]').forEach((el) => el.remove());
  const box = form.querySelector('[data-form-error]');
  if (box) box.innerHTML = '';
}

function showFormError(form, message) {
  const box = form.querySelector('[data-form-error]');
  if (!box) return;
  box.innerHTML = `
    <div class="alert alert--error" style="margin-top:12px">
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5v.5"/></svg>
      <span>${escapeHtml(message)}</span>
    </div>
  `;
}

function bindForm(form, { onSuccess, onCancel }) {
  if (!form) return;

  const toggle = form.querySelector('[data-toggle-student]');
  const studentField = form.querySelector('[data-student-field]');
  if (toggle && studentField) {
    toggle.addEventListener('click', () => {
      const opening = studentField.hidden;
      studentField.hidden = !opening;
      toggle.innerHTML = opening
        ? '不需要学号了 <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="m6 15 6-6 6 6"/></svg>'
        : '需要学号？ <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
      if (opening) {
        const studentInput = studentField.querySelector('input');
        if (studentInput) {
          try {
            studentInput.focus({ preventScroll: true });
          } catch (err) {
            studentInput.focus();
          }
        }
      }
    });
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearErrors(form);

    const nameInput = form.querySelector('[name="name"]');
    const classInput = form.querySelector('[name="className"]');
    const seatInput = form.querySelector('[name="seatNo"]');
    const studentInput = form.querySelector('[name="studentId"]');
    const submit = form.querySelector('[data-submit]');

    const name = (nameInput && nameInput.value.trim()) || '';
    const className = (classInput && classInput.value.trim()) || '';
    const seatNo = (seatInput && seatInput.value.trim()) || '';
    const studentId = (studentInput && studentInput.value.trim()) || '';

    let firstInvalid = null;
    if (!name) {
      markInvalid(nameInput, '请填写姓名');
      firstInvalid = firstInvalid || nameInput;
    }
    if (!className) {
      markInvalid(classInput, '请填写班级');
      firstInvalid = firstInvalid || classInput;
    }
    if (!seatNo) {
      markInvalid(seatInput, '请填写座号');
      firstInvalid = firstInvalid || seatInput;
    }
    if (studentId && !/^[A-Za-z0-9]{6,20}$/.test(studentId)) {
      markInvalid(studentInput, '学号需为 6–20 位字母或数字');
      firstInvalid = firstInvalid || studentInput;
    }
    if (firstInvalid) {
      scrollToElement(firstInvalid.closest('.field'));
      return;
    }

    const payload = { name, className, seatNo };
    if (studentId) payload.studentId = studentId;

    setBusy(submit, true, '登录中…');
    try {
      const data = await api.loginUser(payload);
      const user = (data && data.user) || null;
      setCachedUser(user);
      window.dispatchEvent(new CustomEvent('auth:change'));
      toast(`欢迎，${name}`, 'success');
      if (typeof onSuccess === 'function') onSuccess(user);
    } catch (err) {
      showFormError(form, err && err.message ? err.message : '登录失败，请稍后重试');
    } finally {
      setBusy(submit, false);
    }
  });
}

export function openLoginModal(options = {}) {
  const { reason = '登录后即可下单并查看订单', onSuccess, onCancel } = options;
  if (getCachedUser()) {
    if (typeof onSuccess === 'function') onSuccess(getCachedUser());
    return null;
  }

  const modal = openModal({
    eyebrow: '账户登录',
    title: '先登录，再下单',
    sub: reason,
    body: `
      <form class="modal-form" data-login-form novalidate>
        ${fieldsHtml('modal')}
        <button class="btn btn--primary btn--block btn--lg" type="submit" data-submit style="margin-top:16px">
          登录并继续
        </button>
        <p class="modal-tip">用下单时的 <b>姓名 + 班级 + 座号</b> 登录，即可查看对应订单。学号仅在需要领取核验时填写。</p>
      </form>
    `,
    onClose() {
      if (typeof onCancel === 'function') onCancel();
    }
  });

  if (!modal) return null;
  const form = modal.modal.querySelector('[data-login-form]');
  bindForm(form, {
    onSuccess(user) {
      modal.close();
      if (typeof onSuccess === 'function') onSuccess(user);
    }
  });
  return modal;
}

function accountHtml(user) {
  return `
    <div class="login-prompt">
      <div class="prompt-icon">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8.5" r="3.5"/><path d="M5 20c.6-3.4 3.4-5.5 7-5.5s6.4 2.1 7 5.5"/></svg>
      </div>
      <h2>${escapeHtml(user.name || '同学')}，你已经登录了</h2>
      <p>${escapeHtml(user.className || '—')} · 座号 ${escapeHtml(user.seatNo || '—')}${user.studentId ? ' · 学号 ' + escapeHtml(user.studentId) : ''}</p>
      <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:20px">
        <a class="btn btn--primary" href="#/orders">查看我的订单</a>
        <a class="btn btn--line" href="#/">继续逛逛</a>
        <button class="btn btn--ghost" type="button" data-logout>退出登录</button>
      </div>
    </div>
  `;
}

export async function render(root, params = {}, query = {}) {
  const user = getCachedUser();
  const settings = currentSettings();
  const next = query && query.next ? String(query.next) : '';
  const redirect = next.startsWith('/') ? '#' + next : '#/orders';

  if (user) {
    root.innerHTML = `<div class="container">${accountHtml(user)}</div>`;
    const logoutBtn = root.querySelector('[data-logout]');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', async () => {
        setBusy(logoutBtn, true, '退出中…');
        try {
          await api.logoutUser();
        } catch (err) {
          /* 即使接口失败也清理本地状态 */
        }
        setCachedUser(null);
        window.dispatchEvent(new CustomEvent('auth:change'));
        toast('已退出登录', 'info');
        render(root, params, query);
      });
    }
    return;
  }

  root.innerHTML = `
    <div class="container">
      <div class="page-head">
        <span class="page-eyebrow">Welcome Back</span>
        <h1 class="page-title">登录小铺</h1>
        <p class="page-sub">用下单时的姓名、班级和座号登录，查看属于你的订单。</p>
      </div>

      <div class="login-layout">
        <aside class="login-aside">
          <div>
            <h2>一点点喜欢，<br>都值得被认真送到</h2>
            <p>本店由同学经营，下单后我们会按班级把商品送到你手上。</p>
          </div>
          <div class="login-points">
            <div class="login-point"><span>🛍️</span><div>免登录浏览与加购，想好了再登录下单</div></div>
            <div class="login-point"><span>📦</span><div>用姓名、班级、座号匹配你的订单</div></div>
            <div class="login-point"><span>🎁</span><div>支持赠货码，喜提免支付小惊喜</div></div>
          </div>
          <small>${escapeHtml(settings.brandName)}${
            settings.brandTagline ? ` · ${escapeHtml(settings.brandTagline)}` : ''
          }</small>
        </aside>

        <section class="login-card">
          <h1>用下单信息登录</h1>
          <p class="lead">不需要注册账号，姓名、班级、座号与订单一致即可。</p>
          <form data-login-form novalidate>
            ${fieldsHtml('page')}
            <button class="btn btn--primary btn--block btn--lg" type="submit" data-submit style="margin-top:18px">
              登录并查看订单
            </button>
          </form>
          <div class="modal-tip">演示账号：<b>林小满</b> / <b>高二(3)班</b> / 座号 <b>12</b></div>
        </section>
      </div>
    </div>
  `;

  const form = root.querySelector('[data-login-form]');
  bindForm(form, {
    onSuccess() {
      window.location.hash = redirect;
    }
  });
}
