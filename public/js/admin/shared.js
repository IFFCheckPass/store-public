/**
 * 管理端共享常量、渲染片段与轻量弹窗
 */
import { escapeHtml, formatMoney, openModal, closeModal, setBusy } from '/js/ui.js';

export const ROLE_LABELS = {
  super_admin: '超级管理员',
  admin: '管理员',
  prod_external: '外部生产',
  prod_internal: '内部打包'
};

export const ROLE_OPTIONS = [
  { value: 'super_admin', label: '超级管理员' },
  { value: 'admin', label: '管理员' },
  { value: 'prod_external', label: '外部生产' },
  { value: 'prod_internal', label: '内部打包' }
];

export const ORDER_STATUS_LABELS = {
  pending_payment: '待付款',
  pending_review: '待核验',
  paid: '已付款',
  producing: '生产中',
  packing: '打包中',
  delivering: '配送中',
  completed: '已完成',
  cancelled: '已取消',
  deleted: '已删除'
};

export const ORDER_STATUS_OPTIONS = [
  'pending_payment',
  'pending_review',
  'paid',
  'producing',
  'packing',
  'delivering',
  'completed',
  'cancelled',
  'deleted'
];

export const PAYMENT_METHOD_LABELS = {
  wechat: '微信支付',
  alipay: '支付宝',
  gift: '赠货码'
};

export const PAYMENT_STATUS_LABELS = {
  submitted: '待核验',
  verified: '已通过',
  rejected: '已驳回',
  pending: '待核验'
};

export const DELIVERY_LABELS = {
  class: '送货到班',
  pickup: '自提点自取'
};

export const TIME_SLOT_LABELS = {
  day_break: '白天场',
  noon: '午间',
  evening: '傍晚',
  evening_study: '晚自习间'
};

export const CONTACT_LABELS = {
  qq: 'QQ',
  wechat: '微信',
  phone: '电话·短信'
};

export const TASK_TYPE_LABELS = {
  external: '外部生产',
  internal: '内部打包'
};

export const AUDIT_ACTION_LABELS = {
  'staff.login': '账号登录',
  'staff.create': '新建账号',
  'staff.update': '更新账号',
  'staff.reset_password': '重置密码',
  'payment.approve': '支付核验通过',
  'payment.reject': '支付核验驳回',
  'gift_code.create': '生成赠货码',
  'gift_code.update': '更新赠货码',
  'gift_code.redeem': '赠货码核销',
  'order.deletion_request': '发起删除申请',
  'order.deletion_approve': '确认删除申请',
  'order.deletion_reject': '驳回删除申请',
  'order.delete': '订单删除归档',
  'user.login': '用户登录',
  'upload.create': '上传图片',
  'product.create': '新建商品',
  'product.update': '编辑商品',
  'settings.update': '更新站点设置',
  'staff.self_update': '自行修改学号',
  'staff.change_password': '自行修改密码',
  'accounts.export': '导出账号',
  'accounts.import': '导入账号',
  'backup.export': '导出完整备份',
  'backup.import': '导入完整备份'
};

export function text(value, fallback = '—') {
  if (value === undefined || value === null) return fallback;
  const output = String(value).trim();
  if (!output || output === 'undefined' || output === 'null' || output === 'NaN') return fallback;
  return output;
}

export function money(value) {
  return formatMoney(value);
}

export function num(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

export function roleLabel(role) {
  return ROLE_LABELS[role] || text(role, '成员');
}

export function roleBadge(role, status) {
  if (status === 'disabled') {
    return `<span class="role-badge role-badge--disabled">${escapeHtml(text(roleLabel(role)))} · 已停用</span>`;
  }
  const tone =
    role === 'super_admin'
      ? 'role-badge--super'
      : role === 'admin'
        ? 'role-badge--admin'
        : role === 'prod_internal'
          ? 'role-badge--internal'
          : 'role-badge--external';
  return `<span class="role-badge ${tone}">${escapeHtml(roleLabel(role))}</span>`;
}

export function brandMark() {
  return `
    <span class="brand-mark" aria-hidden="true">
      <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="48" height="48" rx="15" fill="#12A67A"/>
        <path d="M24 36V22" stroke="#fff" stroke-width="3" stroke-linecap="round"/>
        <path d="M24 25.5c-1.2-6.4-5.4-9.5-11.5-9.5 0 6.4 4.4 10.6 11.5 9.5Z" fill="#fff" opacity=".96"/>
        <path d="M24 29c1.2-6.4 5.4-9.5 11.5-9.5 0 6.4-4.4 10.6-11.5 9.5Z" fill="#E3FFF6" opacity=".92"/>
      </svg>
    </span>
  `;
}

export function orderStatusLabel(status, label) {
  return text(label, '') || ORDER_STATUS_LABELS[status] || text(status, '处理中');
}

export function orderBadge(status, label, small = false) {
  const cls = small ? ' status-badge--sm' : '';
  const statusClass = status === 'deleted' ? ' status-badge--deleted' : '';
  return `<span class="status-badge${cls}${statusClass}" data-status="${escapeHtml(
    status || 'unknown'
  )}">${escapeHtml(orderStatusLabel(status, label))}</span>`;
}

export function taskStatusBadge(status, label) {
  return `<span class="status-badge status-badge--sm" data-status="${escapeHtml(
    status || 'unknown'
  )}">${escapeHtml(text(label, '') || text(status, '处理中'))}</span>`;
}

export function paymentMethodLabel(method) {
  return PAYMENT_METHOD_LABELS[method] || text(method, '—');
}

export function progressHtml(done, total, tone = '') {
  const safeTotal = num(total) || 1;
  const safeDone = Math.min(num(done), safeTotal);
  const percent = Math.round((safeDone / safeTotal) * 100);
  return `<div class="progress ${tone ? `progress--${tone}` : ''}" title="${safeDone}/${safeTotal}"><span style="width:${percent}%"></span></div>`;
}

export function statusOptionsHtml(selected, includeAll = true) {
  const options = includeAll ? ['<option value="">全部状态</option>'] : [];
  ORDER_STATUS_OPTIONS.forEach((status) => {
    options.push(
      `<option value="${status}"${selected === status ? ' selected' : ''}>${
        ORDER_STATUS_LABELS[status]
      }</option>`
    );
  });
  return options.join('');
}

export function auditActionLabel(action) {
  return AUDIT_ACTION_LABELS[action] || text(action, '其他操作');
}

export function auditActionKind(action) {
  if (!action) return '';
  if (action === 'order.delete' || action === 'payment.reject' || action === 'order.deletion_reject') {
    return 'danger';
  }
  if (
    action === 'order.deletion_request' ||
    action === 'payment.approve' ||
    action === 'gift_code.update'
  ) {
    return 'warn';
  }
  if (action.startsWith('staff.')) return 'blue';
  return '';
}

export function orderRowHtml(order, options = {}) {
  const { showActions = true } = options;
  const rowClass = order.status === 'deleted' ? ' class="is-deleted"' : '';
  return `
    <tr${rowClass} data-order-no="${escapeHtml(order.orderNo)}">
      <td><span class="cell-strong cell-mono">${escapeHtml(order.orderNo)}</span></td>
      <td>${escapeHtml(text(order.customerName))}</td>
      <td>${escapeHtml(text(order.className))}</td>
      <td class="cell-amount">${money(order.totalAmount)}</td>
      <td>${escapeHtml(paymentMethodLabel(order.paymentMethod))}</td>
      <td>${orderBadge(order.status, order.statusLabel, true)}</td>
      <td class="cell-muted cell-nowrap">${escapeHtml(text(order.createdAt))}</td>
      ${
        showActions
          ? `<td class="cell-actions"><button class="btn btn--sm btn--ghost" type="button" data-order-detail="${escapeHtml(
              order.orderNo
            )}">详情</button></td>`
          : ''
      }
    </tr>
  `;
}

/* -------------------------------------------------------------------------- */
/* 轻量弹窗                                                                    */
/* -------------------------------------------------------------------------- */

export async function copyText(value) {
  const content = String(value === undefined || value === null ? '' : value);
  if (!content) return false;
  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(content);
      return true;
    }
  } catch (err) {
    /* 降级到 execCommand */
  }
  try {
    const area = document.createElement('textarea');
    area.value = content;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.left = '-9999px';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    return ok;
  } catch (err) {
    return false;
  }
}

export function openPromptModal(options = {}) {
  const {
    title = '填写信息',
    eyebrow = '',
    sub = '',
    label = '说明',
    placeholder = '',
    hint = '',
    required = true,
    confirmText = '确认',
    danger = false,
    value = '',
    maxLength = 300
  } = options;

  const handle = openModal({
    title,
    eyebrow,
    sub,
    body: `
      ${hint ? `<div class="modal-hint-line"><span>${hint}</span></div>` : ''}
      <div class="field">
        <label class="field-label" for="prompt-input">${escapeHtml(label)}${
          required ? '<span class="req">*</span>' : '<span class="opt">选填</span>'
        }</label>
        <textarea class="textarea" id="prompt-input" rows="3" maxlength="${maxLength}" placeholder="${escapeHtml(
          placeholder
        )}">${escapeHtml(value)}</textarea>
      </div>
      <div data-modal-error></div>
    `,
    footer: `
      <button class="btn btn--ghost" type="button" data-cancel>取消</button>
      <button class="btn ${danger ? 'btn--danger' : 'btn--primary'}" type="button" data-confirm>${escapeHtml(
        confirmText
      )}</button>
    `
  });
  if (!handle) return null;

  const input = handle.body.querySelector('#prompt-input');
  const errorBox = handle.body.querySelector('[data-modal-error]');
  const cancelBtn = handle.foot.querySelector('[data-cancel]');
  const confirmBtn = handle.foot.querySelector('[data-confirm]');

  if (cancelBtn) cancelBtn.addEventListener('click', () => closeModal());
  if (input) {
    window.setTimeout(() => {
      try {
        input.focus({ preventScroll: true });
      } catch (err) {
        input.focus();
      }
    }, 70);
  }

  if (confirmBtn) {
    confirmBtn.addEventListener('click', async () => {
      const output = input ? input.value.trim() : '';
      if (required && !output) {
        errorBox.innerHTML = `<div class="admin-alert admin-alert--error"><span>请填写${escapeHtml(
          label
        )}。</span></div>`;
        if (input) input.focus();
        return;
      }
      setBusy(confirmBtn, true, '处理中…');
      try {
        if (typeof options.onConfirm === 'function') {
          await options.onConfirm(output);
        }
        closeModal();
      } catch (err) {
        setBusy(confirmBtn, false);
        if (err && err.status === 401) {
          closeModal();
          return;
        }
        const message = (err && err.message) || '操作失败，请稍后重试';
        errorBox.innerHTML = `<div class="admin-alert admin-alert--error"><span>${escapeHtml(
          message
        )}</span></div>`;
      }
    });
  }

  return handle;
}

export function openConfirmModal(options = {}) {
  const {
    title = '确认操作',
    eyebrow = '',
    message = '',
    confirmText = '确认',
    danger = false
  } = options;

  const handle = openModal({
    title,
    eyebrow,
    body: `
      <p class="clamp-note">${message}</p>
      <div data-modal-error style="margin-top:12px"></div>
    `,
    footer: `
      <button class="btn btn--ghost" type="button" data-cancel>取消</button>
      <button class="btn ${danger ? 'btn--danger' : 'btn--primary'}" type="button" data-confirm>${escapeHtml(
        confirmText
      )}</button>
    `
  });
  if (!handle) return null;

  const errorBox = handle.body.querySelector('[data-modal-error]');
  const cancelBtn = handle.foot.querySelector('[data-cancel]');
  const confirmBtn = handle.foot.querySelector('[data-confirm]');

  if (cancelBtn) cancelBtn.addEventListener('click', () => closeModal());
  if (confirmBtn) {
    confirmBtn.addEventListener('click', async () => {
      setBusy(confirmBtn, true, '处理中…');
      try {
        if (typeof options.onConfirm === 'function') {
          await options.onConfirm();
        }
        closeModal();
      } catch (err) {
        setBusy(confirmBtn, false);
        if (err && err.status === 401) {
          closeModal();
          return;
        }
        const messageText = (err && err.message) || '操作失败，请稍后重试';
        errorBox.innerHTML = `<div class="admin-alert admin-alert--error"><span>${escapeHtml(
          messageText
        )}</span></div>`;
      }
    });
  }

  return handle;
}

/**
 * 通用加载 / 错误块
 */
export function loadingBlock(textValue = '正在读取数据…') {
  return `<div class="admin-loading"><span class="spinner"></span><p>${escapeHtml(
    textValue
  )}</p></div>`;
}

export function errorBlock(message, onRetryAttribute = 'data-retry') {
  return `
    <div class="admin-error-block">
      <strong>数据加载失败</strong>
      <p>${escapeHtml(text(message, '请稍后重试'))}</p>
      <button class="btn btn--soft" type="button" ${onRetryAttribute}>重新加载</button>
    </div>
  `;
}

export function emptyBlock(title, description, iconSvg = '') {
  const icon =
    iconSvg ||
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16v13H4z"/><path d="M4 11h16M9 7V4.5h6V7"/></svg>';
  return `
    <div class="admin-empty">
      <span class="admin-empty__icon" aria-hidden="true">${icon}</span>
      <strong>${escapeHtml(title)}</strong>
      ${description ? `<p>${escapeHtml(description)}</p>` : ''}
    </div>
  `;
}
