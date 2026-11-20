/**
 * 未预置学号（00000000）的账号登录后，强制引导本人补全真实学号。
 * 学号只允许本人修改，管理员无法代填，因此这里走 /api/auth/staff/profile。
 */
import { escapeHtml, openModal, setBusy, toast } from '/js/ui.js';

export const PLACEHOLDER_STUDENT_ID = '00000000';

export function needsStudentId(staff) {
  return Boolean(staff && String(staff.studentId || '') === PLACEHOLDER_STUDENT_ID);
}

/**
 * @param {object} options
 * @param {object} options.staff  当前登录账号（会被就地更新 studentId）
 * @param {object} options.api    admin / portal 的 api 实例（需有 updateOwnProfile）
 * @param {Function} [options.onChange] 补全成功后的回调
 * @returns {boolean} 是否弹出了引导弹窗
 */
export function maybePromptStudentId({ staff, api, onChange } = {}) {
  if (!needsStudentId(staff) || !api || typeof api.updateOwnProfile !== 'function') return false;

  const handle = openModal({
    title: '请补全登录学号',
    eyebrow: 'Account Setup',
    sub: `当前账号的学号是 ${PLACEHOLDER_STUDENT_ID}（未预置）。请填写真实学号并验证当前密码，完成后才能继续使用。`,
    dismissible: false,
    body: `
      <div class="form-modal">
        <div class="form-grid">
          <div class="field field--full">
            <label class="field-label" for="force-student-id">真实学号<span class="req">*</span></label>
            <input class="input" id="force-student-id" type="text" maxlength="20" inputmode="numeric" autocomplete="off" placeholder="6-20 位字母或数字">
            <p class="field-hint">学号只能由本人设置，管理员无法代为修改。</p>
          </div>
          <div class="field field--full">
            <label class="field-label" for="force-current-password">当前密码<span class="req">*</span></label>
            <input class="input" id="force-current-password" type="password" maxlength="72" autocomplete="current-password" placeholder="用于验证身份">
          </div>
        </div>
        <div data-modal-error class="form-modal__error"></div>
      </div>
    `,
    footer: `
      <button class="btn btn--ghost" type="button" data-logout>退出登录</button>
      <button class="btn btn--primary" type="button" data-submit>保存学号</button>
    `
  });
  if (!handle) return false;

  const body = handle.body;
  const studentInput = body.querySelector('#force-student-id');
  const passwordInput = body.querySelector('#force-current-password');
  const errorBox = body.querySelector('[data-modal-error]');
  const submitBtn = handle.foot.querySelector('[data-submit]');
  const logoutBtn = handle.foot.querySelector('[data-logout]');

  const showError = (message) => {
    errorBox.innerHTML = message
      ? `<div class="admin-alert admin-alert--error"><span>${escapeHtml(message)}</span></div>`
      : '';
  };

  const submit = async () => {
    const studentId = studentInput.value.trim();
    const currentPassword = passwordInput.value;
    if (!/^[A-Za-z0-9]{6,20}$/.test(studentId)) {
      showError('学号需为 6-20 位字母或数字');
      return;
    }
    if (studentId === PLACEHOLDER_STUDENT_ID) {
      showError(`请填写真实学号，${PLACEHOLDER_STUDENT_ID} 只是未预置学号的占位值`);
      return;
    }
    if (!currentPassword) {
      showError('请输入当前密码');
      return;
    }
    setBusy(submitBtn, true, '保存中…');
    try {
      const data = await api.updateOwnProfile({ studentId, currentPassword });
      const updated = data && data.staff ? data.staff : null;
      staff.studentId = updated ? updated.studentId : studentId;
      handle.close();
      toast('学号已更新', 'success');
      if (typeof onChange === 'function') onChange(staff);
    } catch (err) {
      setBusy(submitBtn, false);
      if (err && err.status === 401) {
        handle.close();
        return;
      }
      showError((err && err.message) || '保存失败，请稍后重试');
      if (err && err.status === 400) passwordInput.select();
    }
  };

  if (submitBtn) submitBtn.addEventListener('click', submit);
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      try {
        await api.staffLogout();
      } catch (err) {
        /* 退出失败也直接刷新回登录页 */
      }
      window.location.reload();
    });
  }
  [studentInput, passwordInput].forEach((el) => {
    if (!el) return;
    el.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        submit();
      }
    });
  });

  return true;
}
