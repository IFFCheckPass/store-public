/**
 * 管理端 · 账号管理 #/accounts
 */
import { api } from '../api.js';
import { escapeHtml, toast, openModal, closeModal, setBusy } from '/js/ui.js';
import {
  ROLE_OPTIONS,
  emptyBlock,
  errorBlock,
  loadingBlock,
  openConfirmModal,
  roleBadge,
  text
} from '../shared.js';

const bound = new WeakSet();
let currentRoot = null;
let currentCtx = null;
let currentStaff = [];

function isSuper(staff) {
  return staff && staff.role === 'super_admin';
}

function statusBadge(status) {
  const active = status === 'active';
  return `<span class="status-badge status-badge--sm" data-status="${
    active ? 'completed' : 'cancelled'
  }">${active ? '启用' : '停用'}</span>`;
}

function pageHtml(staff) {
  const superAdmin = isSuper(staff);
  return `
    <div class="admin-page-head">
      <div class="admin-page-head__text">
        <span class="admin-eyebrow">Accounts</span>
        <h1>账号管理</h1>
        <p>维护生产端与管理端账号。普通管理员仅可查看，超级管理员可执行写操作。</p>
      </div>
      <div class="admin-page-head__actions">
        <button class="btn btn--line" type="button" data-refresh>刷新</button>
        ${
          superAdmin
            ? `<button class="btn btn--line" type="button" data-export-backup>导出全部数据</button>
               <button class="btn btn--soft" type="button" data-import-backup>导入全部数据</button>
               <input type="file" accept="application/json,.json" hidden data-import-file>
               <button class="btn btn--primary" type="button" data-new-staff>新建账号</button>`
            : ''
        }
      </div>
    </div>
    ${
      superAdmin
        ? ''
        : `<div class="readonly-note">
             <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5v.5"/></svg>
             <span><b>只读模式：</b>当前账号为普通管理员，新建、编辑、重置密码与启停入口已隐藏；写操作会被服务端拒绝（403）。</span>
           </div>`
    }
    ${
      superAdmin
        ? `<p class="field-hint" style="margin:0 0 14px">
             导出的完整备份包含账号密码哈希、商品、订单、赠货码、生产任务、站点设置以及上传的商品与配置图片；导入时会一并恢复到服务器。
           </p>`
        : ''
    }
    <div data-accounts>${loadingBlock('正在读取账号列表…')}</div>
  `;
}

function resultHtml(staffList, viewer) {
  if (!staffList.length) {
    return emptyBlock('暂无账号', '新建账号后，生产端与管理端成员会显示在这里。');
  }
  const superAdmin = isSuper(viewer);

  return `
    <div class="table-card">
      <div class="table-toolbar">
        <span class="table-toolbar__count">共 <b>${staffList.length}</b> 个账号</span>
        <span class="table-toolbar__count">${superAdmin ? '超级管理员可编辑' : '只读视图'}</span>
      </div>
      <div class="table-wrap">
        <table class="admin-table" style="min-width:${superAdmin ? '900px' : '720px'}">
          <thead>
            <tr>
              <th>用户名</th>
              <th>姓名</th>
              <th>学号</th>
              <th>角色</th>
              <th>状态</th>
              <th>创建时间</th>
              ${superAdmin ? '<th>操作</th>' : ''}
            </tr>
          </thead>
          <tbody>
            ${staffList
              .map((item) => {
                const self = item.id === (viewer && viewer.id);
                return `
                  <tr data-staff-id="${item.id}">
                    <td><span class="cell-strong cell-mono">${escapeHtml(text(item.username))}</span>${
                      self ? '<span class="cell-sub">当前账号</span>' : ''
                    }</td>
                    <td>${escapeHtml(text(item.displayName))}</td>
                    <td class="cell-mono cell-muted">${escapeHtml(text(item.studentId))}</td>
                    <td>${roleBadge(item.role)}</td>
                    <td>${statusBadge(item.status)}</td>
                    <td class="cell-muted cell-nowrap">${escapeHtml(text(item.createdAt))}</td>
                    ${
                      superAdmin
                        ? `<td class="cell-actions">
                             <button class="btn btn--sm btn--ghost" type="button" data-staff-action="edit" data-staff-id="${item.id}">编辑</button>
                             <button class="btn btn--sm btn--ghost" type="button" data-staff-action="reset" data-staff-id="${item.id}">重置密码</button>
                             <button class="btn btn--sm ${item.status === 'active' ? 'btn--danger' : 'btn--soft'}" type="button" data-staff-action="toggle" data-staff-id="${item.id}"${
                               self && item.status === 'active' ? ' disabled title="不能停用自己的账号"' : ''
                             }>${item.status === 'active' ? '停用' : '启用'}</button>
                           </td>`
                        : ''
                    }
                  </tr>
                `;
              })
              .join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

async function load() {
  const root = currentRoot;
  const ctx = currentCtx;
  if (!root || !ctx) return;
  const container = root.querySelector('[data-accounts]');
  if (!container) return;

  container.innerHTML = loadingBlock('正在读取账号列表…');
  try {
    const data = await api.staffList();
    if (!ctx.isCurrent()) return;
    currentStaff = Array.isArray(data && data.staff) ? data.staff : [];
    container.innerHTML = resultHtml(currentStaff, ctx.staff);
  } catch (err) {
    if (!ctx.isCurrent()) return;
    if (err && err.status === 401) return;
    container.innerHTML = errorBlock((err && err.message) || '账号列表加载失败');
  }
}

function fieldHtml(id, label, inputHtml, hint = '') {
  return `
    <div class="field">
      <label class="field-label" for="${id}">${label}</label>
      ${inputHtml}
      ${hint ? `<p class="field-hint">${hint}</p>` : ''}
    </div>
  `;
}

function openStaffForm(mode, record) {
  const isEdit = mode === 'edit';
  const roleOptions = ROLE_OPTIONS.map((option) => {
    const selected = isEdit ? record.role === option.value : option.value === 'admin';
    return `<option value="${option.value}"${selected ? ' selected' : ''}>${option.label}</option>`;
  }).join('');

  const handle = openModal({
    title: isEdit ? '编辑账号' : '新建账号',
    eyebrow: 'Staff Account',
    sub: isEdit
      ? `账号 ${record.username}，用户名与学号不可修改。`
      : '创建后可使用用户名、学号与密码登录对应门户。',
    body: `
      <div class="form-modal">
        <div class="form-grid">
          ${fieldHtml(
            'staff-username',
            '用户名',
            `<input class="input" id="staff-username" data-field="username" type="text" value="${escapeHtml(
              isEdit ? record.username : ''
            )}" placeholder="3-30 位字母、数字或下划线" ${isEdit ? 'disabled' : ''}>`
          )}
          ${fieldHtml(
            'staff-student-id',
            '学号',
            `<input class="input" id="staff-student-id" data-field="studentId" type="text" value="${escapeHtml(
              isEdit ? record.studentId : ''
            )}" placeholder="6-20 位字母或数字" ${isEdit ? 'disabled' : ''}>`
          )}
          ${fieldHtml(
            'staff-name',
            '姓名',
            `<input class="input" id="staff-name" data-field="displayName" type="text" maxlength="30" value="${escapeHtml(
              isEdit ? record.displayName : ''
            )}" placeholder="用于展示的名称">`
          )}
          ${fieldHtml(
            'staff-role',
            '角色',
            `<select class="select" id="staff-role" data-field="role">${roleOptions}</select>`
          )}
          ${
            isEdit
              ? fieldHtml(
                  'staff-status',
                  '账号状态',
                  `<select class="select" id="staff-status" data-field="status">
                     <option value="active"${record.status === 'active' ? ' selected' : ''}>启用</option>
                     <option value="disabled"${record.status === 'disabled' ? ' selected' : ''}>停用</option>
                   </select>`
                )
              : fieldHtml(
                  'staff-password',
                  '初始密码',
                  '<input class="input" id="staff-password" data-field="password" type="password" autocomplete="new-password" placeholder="至少 6 位">',
                  '密码长度不少于 6 位，创建后可随时重置。'
                )
          }
        </div>
        <div data-modal-error class="form-modal__error"></div>
      </div>
    `,
    footer: `
      <button class="btn btn--ghost" type="button" data-cancel>取消</button>
      <button class="btn btn--primary" type="button" data-confirm>${isEdit ? '保存修改' : '创建账号'}</button>
    `
  });
  if (!handle) return;

  const body = handle.body;
  const errorBox = body.querySelector('[data-modal-error]');
  const cancelBtn = handle.foot.querySelector('[data-cancel]');
  const confirmBtn = handle.foot.querySelector('[data-confirm]');

  const read = (name) => {
    const el = body.querySelector(`[data-field="${name}"]`);
    return el ? el.value.trim() : '';
  };

  const showError = (message) => {
    errorBox.innerHTML = `<div class="admin-alert admin-alert--error"><span>${escapeHtml(
      message
    )}</span></div>`;
  };

  const validate = () => {
    if (!isEdit) {
      const username = read('username');
      if (!/^[A-Za-z0-9_]{3,30}$/.test(username)) {
        return '用户名需为 3-30 位字母、数字或下划线';
      }
      if (!/^[A-Za-z0-9]{6,20}$/.test(read('studentId'))) {
        return '学号需为 6-20 位字母或数字';
      }
      const password = body.querySelector('[data-field="password"]').value;
      if (password.length < 6) return '密码长度不能少于 6 位';
      if (password.length > 72) return '密码长度不能超过 72 位';
    }
    const displayName = read('displayName');
    if (!displayName || displayName.length > 30) return '请填写 1-30 字的姓名';
    return '';
  };

  if (cancelBtn) cancelBtn.addEventListener('click', () => closeModal());
  if (confirmBtn) {
    confirmBtn.addEventListener('click', async () => {
      const message = validate();
      if (message) {
        showError(message);
        return;
      }
      setBusy(confirmBtn, true, '保存中…');
      try {
        if (isEdit) {
          await api.updateStaff(record.id, {
            displayName: read('displayName'),
            role: read('role'),
            status: read('status')
          });
          toast('账号信息已更新', 'success');
        } else {
          await api.createStaff({
            username: read('username'),
            studentId: read('studentId'),
            displayName: read('displayName'),
            password: body.querySelector('[data-field="password"]').value,
            role: read('role')
          });
          toast('账号已创建', 'success');
        }
        closeModal();
        await load();
      } catch (err) {
        setBusy(confirmBtn, false);
        if (err && err.status === 401) {
          closeModal();
          return;
        }
        showError((err && err.message) || '保存失败，请稍后重试');
      }
    });
  }
}

function openResetPassword(record) {
  const handle = openModal({
    title: '重置登录密码',
    eyebrow: `账号 ${record.username}`,
    sub: '重置后请及时告知本人，旧密码将立即失效。',
    body: `
      <div class="form-modal">
        <div class="form-grid">
          ${fieldHtml(
            'reset-password',
            '新密码',
            '<input class="input" id="reset-password" type="password" autocomplete="new-password" placeholder="至少 6 位">',
            '密码长度不少于 6 位。'
          )}
          ${fieldHtml(
            'reset-password-confirm',
            '确认新密码',
            '<input class="input" id="reset-password-confirm" type="password" autocomplete="new-password" placeholder="再次输入新密码">'
          )}
        </div>
        <div data-modal-error class="form-modal__error"></div>
      </div>
    `,
    footer: `
      <button class="btn btn--ghost" type="button" data-cancel>取消</button>
      <button class="btn btn--primary" type="button" data-confirm>确认重置</button>
    `
  });
  if (!handle) return;

  const errorBox = handle.body.querySelector('[data-modal-error]');
  const input = handle.body.querySelector('#reset-password');
  const confirmInput = handle.body.querySelector('#reset-password-confirm');
  const cancelBtn = handle.foot.querySelector('[data-cancel]');
  const confirmBtn = handle.foot.querySelector('[data-confirm]');

  const showError = (message) => {
    errorBox.innerHTML = `<div class="admin-alert admin-alert--error"><span>${escapeHtml(
      message
    )}</span></div>`;
  };

  if (cancelBtn) cancelBtn.addEventListener('click', () => closeModal());
  window.setTimeout(() => input && input.focus(), 70);

  if (confirmBtn) {
    confirmBtn.addEventListener('click', async () => {
      const password = input.value;
      if (password.length < 6) {
        showError('密码长度不能少于 6 位');
        return;
      }
      if (password.length > 72) {
        showError('密码长度不能超过 72 位');
        return;
      }
      if (password !== confirmInput.value) {
        showError('两次输入的密码不一致');
        return;
      }
      setBusy(confirmBtn, true, '重置中…');
      try {
        await api.resetStaffPassword(record.id, password);
        toast('密码已重置', 'success');
        closeModal();
      } catch (err) {
        setBusy(confirmBtn, false);
        if (err && err.status === 401) {
          closeModal();
          return;
        }
        showError((err && err.message) || '重置失败，请稍后重试');
      }
    });
  }
}

function openToggleStatus(record) {
  const nextStatus = record.status === 'active' ? 'disabled' : 'active';
  const actionLabel = nextStatus === 'disabled' ? '停用' : '启用';
  openConfirmModal({
    title: `${actionLabel}账号 ${record.username}`,
    eyebrow: '账号状态',
    message:
      nextStatus === 'disabled'
        ? `停用后，<b>${escapeHtml(text(record.displayName))}</b> 将无法登录生产端或管理端，已有会话在下次请求时失效。`
        : `启用后，<b>${escapeHtml(text(record.displayName))}</b> 可重新使用账号密码登录。`,
    confirmText: `确认${actionLabel}`,
    danger: nextStatus === 'disabled',
    onConfirm: async () => {
      await api.updateStaff(record.id, { status: nextStatus });
      toast(`账号已${actionLabel}`, 'success');
      await load();
    }
  });
}

async function exportBackup() {
  try {
    const blob = await api.exportBackup();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `store-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    toast('账号与业务数据已导出', 'success');
  } catch (err) {
    if (err && err.status === 401) return;
    toast((err && err.message) || '导出失败，请稍后重试', 'error');
  }
}

function openImportFile() {
  const root = currentRoot;
  if (!root) return;
  const input = root.querySelector('[data-import-file]');
  if (input) input.click();
}

async function handleImportFile(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    if (!parsed || typeof parsed !== 'object') throw new Error('备份文件格式不正确');
    if (parsed.type && parsed.type !== 'store-backup') {
      throw new Error('不是有效的店铺备份文件');
    }
    const accounts = Array.isArray(parsed.accounts) ? parsed.accounts : [];
    const data = parsed.data && typeof parsed.data === 'object' ? parsed.data : null;
    if (!accounts.length && !data) throw new Error('备份文件中没有可导入的数据');
    const count = (key) => (Array.isArray(data && data[key]) ? data[key].length : 0);

    const fileCount = Array.isArray(parsed.files) ? parsed.files.length : 0;

    openConfirmModal({
      title: '导入完整备份',
      eyebrow: file.name,
      message: `备份包含 <b>${accounts.length}</b> 个账号、<b>${count('products')}</b> 件商品、<b>${count(
        'orders'
      )}</b> 个订单、<b>${count('giftCodes')}</b> 个赠货码、<b>${fileCount}</b> 张图片与站点设置。<br><br>导入会用备份内容<b>覆盖现有全部业务数据</b>，账号按用户名更新或新建。是否继续？`,
      confirmText: '覆盖并导入',
      danger: true,
      onConfirm: async () => {
        const result = await api.importBackup(parsed);
        toast(
          `导入完成：账号新增 ${result.created} 个、更新 ${result.updated} 个，订单恢复 ${
            (result.restored && result.restored.orders) || 0
          } 个，图片恢复 ${result.files || 0} 张`,
          'success'
        );
        await load();
      }
    });
  } catch (err) {
    toast((err && err.message) || '导入文件格式不正确', 'error');
  } finally {
    input.value = '';
  }
}

async function onClick(event) {
  const root = currentRoot;
  if (!root) return;

  if (event.target.closest('[data-refresh]') || event.target.closest('[data-retry]')) {
    load();
    return;
  }

  if (event.target.closest('[data-export-backup]')) {
    await exportBackup();
    return;
  }

  if (event.target.closest('[data-import-backup]')) {
    openImportFile();
    return;
  }

  if (event.target.closest('[data-new-staff]')) {
    openStaffForm('create', null);
    return;
  }

  const actionBtn = event.target.closest('[data-staff-action]');
  if (!actionBtn || actionBtn.disabled) return;

  const id = Number(actionBtn.dataset.staffId);
  const record = currentStaff.find((item) => item.id === id);
  if (!record) {
    toast('账号信息已更新，请刷新后重试', 'error');
    return;
  }

  const action = actionBtn.dataset.staffAction;
  if (action === 'edit') openStaffForm('edit', record);
  else if (action === 'reset') openResetPassword(record);
  else if (action === 'toggle') openToggleStatus(record);
}

function onChange(event) {
  const input = event.target.closest('[data-import-file]');
  if (input) handleImportFile(input);
}

export function render(root, ctx) {
  currentRoot = root;
  currentCtx = ctx;
  currentStaff = [];
  root.innerHTML = pageHtml(ctx.staff);

  if (!bound.has(root)) {
    root.addEventListener('click', onClick);
    root.addEventListener('change', onChange);
    bound.add(root);
  }

  load();
}
