/**
 * 管理端 · 个人设置 #/profile
 * 登录后可自行修改学号与登录密码
 */
import { api } from '../api.js';
import { escapeHtml, toast, setBusy } from '/js/ui.js';
import { roleLabel } from '../shared.js';

function pageHtml(staff) {
  return `
    <div class="admin-page-head">
      <div class="admin-page-head__text">
        <span class="admin-eyebrow">Account Security</span>
        <h1>个人设置</h1>
        <p>自行维护登录学号与密码。修改学号或密码都需要验证当前密码。</p>
      </div>
    </div>

    <div class="settings-layout">
      <section class="settings-card">
        <div class="settings-card__head">
          <h2>账号信息</h2>
          <p>用户名与角色由超级管理员维护，登录学号可自行修改。</p>
        </div>
        <div class="form-grid">
          <div class="field">
            <label class="field-label">用户名</label>
            <input class="input" type="text" value="${escapeHtml(staff.username || '')}" disabled>
          </div>
          <div class="field">
            <label class="field-label">姓名</label>
            <input class="input" type="text" value="${escapeHtml(staff.displayName || '')}" disabled>
          </div>
          <div class="field">
            <label class="field-label">角色</label>
            <input class="input" type="text" value="${escapeHtml(roleLabel(staff.role))}" disabled>
          </div>
          <div class="field">
            <label class="field-label" for="profile-student-id">登录学号<span class="req">*</span></label>
            <input class="input" id="profile-student-id" type="text" maxlength="20" value="${escapeHtml(
              staff.studentId || ''
            )}" placeholder="6-20 位字母或数字">
          </div>
          <div class="field field--full">
            <label class="field-label" for="profile-current-password">当前密码<span class="req">*</span></label>
            <input class="input" id="profile-current-password" type="password" maxlength="72" autocomplete="current-password" placeholder="修改学号需要验证当前密码">
          </div>
        </div>
        <div data-profile-error class="form-modal__error"></div>
        <div class="settings-actions">
          <button class="btn btn--primary" type="button" data-save-profile>保存学号</button>
        </div>
      </section>

      <section class="settings-card">
        <div class="settings-card__head">
          <h2>修改密码</h2>
          <p>密码长度 6-72 位，修改后立即生效，下次登录使用新密码。</p>
        </div>
        <div class="form-grid">
          <div class="field field--full">
            <label class="field-label" for="password-current">当前密码<span class="req">*</span></label>
            <input class="input" id="password-current" type="password" maxlength="72" autocomplete="current-password">
          </div>
          <div class="field">
            <label class="field-label" for="password-new">新密码<span class="req">*</span></label>
            <input class="input" id="password-new" type="password" maxlength="72" autocomplete="new-password">
          </div>
          <div class="field">
            <label class="field-label" for="password-confirm">确认新密码<span class="req">*</span></label>
            <input class="input" id="password-confirm" type="password" maxlength="72" autocomplete="new-password">
          </div>
        </div>
        <div data-password-error class="form-modal__error"></div>
        <div class="settings-actions">
          <button class="btn btn--primary" type="button" data-save-password>更新密码</button>
        </div>
      </section>
    </div>
  `;
}

function showError(container, message) {
  if (!container) return;
  container.innerHTML = message
    ? `<div class="admin-alert admin-alert--error"><span>${escapeHtml(message)}</span></div>`
    : '';
}

export function render(root, ctx) {
  root.innerHTML = pageHtml(ctx.staff);

  const studentInput = root.querySelector('#profile-student-id');
  const currentPassword = root.querySelector('#profile-current-password');
  const profileError = root.querySelector('[data-profile-error]');
  const saveProfileBtn = root.querySelector('[data-save-profile]');
  const passwordCurrent = root.querySelector('#password-current');
  const passwordNew = root.querySelector('#password-new');
  const passwordConfirm = root.querySelector('#password-confirm');
  const passwordError = root.querySelector('[data-password-error]');
  const savePasswordBtn = root.querySelector('[data-save-password]');

  saveProfileBtn.addEventListener('click', async () => {
    const studentId = studentInput.value.trim();
    const password = currentPassword.value;
    if (!/^[A-Za-z0-9]{6,20}$/.test(studentId)) {
      showError(profileError, '学号需为 6-20 位字母或数字');
      return;
    }
    if (!password) {
      showError(profileError, '请输入当前密码');
      return;
    }
    setBusy(saveProfileBtn, true, '保存中…');
    try {
      const data = await api.updateOwnProfile({ studentId, currentPassword: password });
      if (data && data.staff) {
        ctx.staff.studentId = data.staff.studentId;
        studentInput.value = data.staff.studentId;
      }
      currentPassword.value = '';
      showError(profileError, '');
      toast('学号已更新', 'success');
    } catch (err) {
      if (err && err.status === 401) return;
      showError(profileError, (err && err.message) || '保存失败');
    } finally {
      setBusy(saveProfileBtn, false);
    }
  });

  savePasswordBtn.addEventListener('click', async () => {
    const current = passwordCurrent.value;
    const next = passwordNew.value;
    const confirm = passwordConfirm.value;
    if (!current) return showError(passwordError, '请输入当前密码');
    if (next.length < 6) return showError(passwordError, '新密码长度不能少于 6 位');
    if (next === current) return showError(passwordError, '新密码不能与当前密码相同');
    if (next !== confirm) return showError(passwordError, '两次输入的新密码不一致');

    setBusy(savePasswordBtn, true, '更新中…');
    try {
      await api.changeOwnPassword({ currentPassword: current, newPassword: next });
      passwordCurrent.value = '';
      passwordNew.value = '';
      passwordConfirm.value = '';
      showError(passwordError, '');
      toast('密码已更新，下次登录请使用新密码', 'success');
    } catch (err) {
      if (err && err.status === 401) return;
      showError(passwordError, (err && err.message) || '更新失败');
    } finally {
      setBusy(savePasswordBtn, false);
    }
  });
}
