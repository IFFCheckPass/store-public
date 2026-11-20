/**
 * 生产工作台共享常量与渲染片段
 */
import { escapeHtml, formatMoney, openModal, closeModal, setBusy, toast } from '/js/ui.js';
import { api } from './api.js';

export const ROLE_LABELS = {
  super_admin: '超级管理员',
  admin: '管理员',
  prod_external: '外部生产',
  prod_internal: '内部打包'
};

export const ROLE_HINTS = {
  super_admin: '管理员视角：可查看外部与内部任务',
  admin: '管理员视角：可查看外部与内部任务',
  prod_external: '外部生产：按商品明细接单与生产',
  prod_internal: '内部打包：按订单拣货、打包与配送'
};

export const EXTERNAL_STATUS_LABELS = {
  pending: '待接单',
  accepted: '已接单',
  producing: '生产中',
  done: '已完成',
  issue: '异常',
  cancelled: '已取消'
};

export const INTERNAL_STATUS_LABELS = {
  pending_pack: '待打包',
  packing: '打包中',
  packed: '已打包',
  delivering: '配送中',
  delivered: '已送达',
  issue: '异常',
  cancelled: '已取消'
};

export const TIME_SLOT_LABELS = {
  day_break: '白天场',
  noon: '午间',
  evening: '傍晚',
  evening_study: '晚自习间'
};

export const DELIVERY_LABELS = {
  class: '送货到班',
  pickup: '自提点自取'
};

export const CONTACT_LABELS = {
  qq: 'QQ',
  wechat: '微信',
  phone: '电话'
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

export function roleLabel(role) {
  return ROLE_LABELS[role] || text(role, '成员');
}

export function roleBadge(role) {
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

export function adminBanner(role) {
  if (role !== 'admin' && role !== 'super_admin') return '';
  return `
    <div class="portal-admin-banner">
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5v.5"/></svg>
      <span>您正在以管理员身份查看生产任务，可切换“外部生产”与“内部打包”两个视角；完整的运营管理请前往 <a href="/admin">管理端入口</a>。</span>
    </div>
  `;
}

export function taskStatusBadge(status, labels = {}) {
  const label = labels[status] || status || '处理中';
  return `<span class="status-badge" data-status="${escapeHtml(status || 'unknown')}">${escapeHtml(label)}</span>`;
}

/**
 * 根据后端允许的流转规则，返回当前状态可执行的下一步操作
 */
export function nextActions(type, status) {
  if (type === 'external') {
    switch (status) {
      case 'pending':
        return [{ status: 'accepted', label: '接单', tone: 'primary' }];
      case 'accepted':
        return [{ status: 'producing', label: '开始生产', tone: 'primary' }];
      case 'producing':
        return [{ status: 'done', label: '生产完成', tone: 'primary' }];
      case 'issue':
        return [
          { status: 'accepted', label: '恢复接单', tone: 'soft' },
          { status: 'producing', label: '恢复生产', tone: 'soft' }
        ];
      default:
        return [];
    }
  }

  switch (status) {
    case 'pending_pack':
      return [{ status: 'packing', label: '开始打包', tone: 'primary' }];
    case 'packing':
      return [{ status: 'packed', label: '打包完成', tone: 'primary' }];
    case 'packed':
      return [{ status: 'delivering', label: '开始配送', tone: 'primary' }];
    case 'delivering':
      return [{ status: 'delivered', label: '确认送达', tone: 'primary' }];
    case 'issue':
      return [
        { status: 'pending_pack', label: '恢复待打包', tone: 'soft' },
        { status: 'packing', label: '恢复打包', tone: 'soft' }
      ];
    default:
      return [];
  }
}

export function canIssue(status) {
  return !['done', 'delivered', 'cancelled', 'issue'].includes(status);
}

export function contactIcon(type) {
  if (type === 'qq') {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 8.5c0-2.2 1.6-3.8 3.5-3.8s3.5 1.6 3.5 3.8c0 1.2.6 1.9 1.3 2.8.9 1.2 1.2 2.4 1.2 3.7 0 2.9-2.7 5.2-6 5.2s-6-2.3-6-5.2c0-1.3.3-2.5 1.2-3.7.7-.9 1.3-1.6 1.3-2.8Z"/><circle cx="10.3" cy="9.4" r=".8" fill="currentColor" stroke="none"/><circle cx="13.7" cy="9.4" r=".8" fill="currentColor" stroke="none"/></svg>';
  }
  if (type === 'wechat') {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10.2 4.2c-3.6 0-6.4 2.3-6.4 5.2 0 1.6.9 3.1 2.4 4.1l-.7 2.2 2.5-1.3c.7.2 1.4.3 2.2.3.2 0 .4 0 .6-.1a4.9 4.9 0 0 1-.4-1.9c0-3 2.8-5.3 6.2-5.3h.3c-.8-2-3.2-3.2-6.7-3.2Z"/><path d="M20 14.4c0-2.3-2.2-4.2-4.9-4.2s-4.9 1.9-4.9 4.2 2.2 4.2 4.9 4.2c.6 0 1.2-.1 1.7-.3l2 1-.5-1.8c1-.8 1.7-1.9 1.7-3.1Z"/></svg>';
  }
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 4.5h2.6l1.2 3.2-1.6 1.3a11 11 0 0 0 5.7 5.7l1.3-1.6 3.2 1.2v2.6a1.7 1.7 0 0 1-1.9 1.7C10.3 18 6 13.7 4.9 6.4a1.7 1.7 0 0 1 1.7-1.9Z"/></svg>';
}

export function timeSlotLabel(slot) {
  return TIME_SLOT_LABELS[slot] || text(slot);
}

export function timelineHtml(events, labels = {}) {
  if (!Array.isArray(events) || events.length === 0) {
    return '<p class="field-hint">暂无进度记录。</p>';
  }
  return `
    <div class="timeline">
      ${events
        .map((event, index) => {
          const isLast = index === events.length - 1;
          const label = labels[event.status] || event.status || '状态更新';
          return `
            <div class="timeline-item ${isLast ? 'is-current' : 'is-done'}">
              <span class="timeline-dot"></span>
              <div class="timeline-label">${escapeHtml(label)}${
                event.actorName ? ` · ${escapeHtml(event.actorName)}` : ''
              }</div>
              ${event.note ? `<div class="timeline-note">${escapeHtml(event.note)}</div>` : ''}
              <div class="timeline-time">${escapeHtml(text(event.createdAt, ''))}</div>
            </div>
          `;
        })
        .join('')}
    </div>
  `;
}

/**
 * 内部任务仅保存商品汇总文本时，尽量解析为可扫读的清单
 */
export function internalItems(task) {
  if (Array.isArray(task.items) && task.items.length) {
    return task.items.map((item) => ({
      name: text(item.productName, '商品'),
      spec: text(item.specName, ''),
      color: text(item.colorName, ''),
      pattern: text(item.patternName, ''),
      isCustom: Boolean(item.isCustom),
      quantity: Number(item.quantity) || 0,
      imageUrl: item.imageUrl || task.imageUrl || ''
    }));
  }

  const rawName = text(task.productName, '商品');
  const spec = text(task.specName, '');
  const color = text(task.colorName, '');
  const pattern = text(task.patternName, '');
  const total = Number(task.quantity);
  const fallbackQty = Number.isFinite(total) && total > 0 ? total : 0;
  const imageUrl = task.imageUrl || '';

  const parseLine = (segment) => {
    const match = String(segment).match(/^(.*?)\s*[×xX*]\s*(\d+)\s*$/);
    if (match) {
      return { name: text(match[1], '商品'), quantity: Number(match[2]) || 0 };
    }
    return { name: text(segment, '商品'), quantity: 0 };
  };

  const segments = rawName.split('、').map((item) => item.trim()).filter(Boolean);
  if (segments.length <= 1) {
    const parsed = parseLine(rawName);
    return [
      {
        name: parsed.name,
        spec,
        color,
        quantity: parsed.quantity || fallbackQty,
        imageUrl
      }
    ];
  }

  return segments.map((segment) => {
    const parsed = parseLine(segment);
    return { name: parsed.name, spec: '', color: '', quantity: parsed.quantity, imageUrl };
  });
}

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

/**
 * 更新任务状态弹窗
 */
export function openTaskStatusModal({ task, labels, next, onDone }) {
  const fromLabel = labels[task.status] || task.status || '当前状态';
  const toLabel = labels[next] || next;
  const needNote = next === 'issue';

  const handle = openModal({
    title: needNote ? '上报生产异常' : '更新任务状态',
    eyebrow: `任务 #${task.id}`,
    sub: text(task.productName, '生产任务'),
    body: `
      <div class="status-flow">
        <span class="status-badge" data-status="${escapeHtml(task.status)}">${escapeHtml(fromLabel)}</span>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 6.5 18.5 12 13 17.5"/></svg>
        <span class="status-badge" data-status="${escapeHtml(next)}">${escapeHtml(toLabel)}</span>
        <span class="status-flow__task">订单 ${escapeHtml(text(task.orderNo))}</span>
      </div>
      <div class="field">
        <label class="field-label" for="task-note">处理备注${needNote ? '<span class="req">*</span>' : '<span class="opt">选填</span>'}</label>
        <textarea class="textarea" id="task-note" rows="3" maxlength="500" placeholder="${
          needNote ? '请简要说明异常原因，例如：原料不足、设备故障等' : '可填写交接说明，便于后续跟进（选填）'
        }"></textarea>
        <p class="field-hint">${
          needNote ? '异常任务会同步到管理端订单详情，请如实填写。' : '备注会记录在任务时间线中。'
        }</p>
      </div>
      <div data-modal-error></div>
    `,
    footer: `
      <button class="btn btn--ghost" type="button" data-cancel>取消</button>
      <button class="btn ${needNote ? 'btn--danger' : 'btn--primary'}" type="button" data-confirm>${
        needNote ? '确认上报异常' : '确认更新'
      }</button>
    `
  });

  if (!handle) return;

  const noteInput = handle.body.querySelector('#task-note');
  const errorBox = handle.body.querySelector('[data-modal-error]');
  const cancelBtn = handle.foot.querySelector('[data-cancel]');
  const confirmBtn = handle.foot.querySelector('[data-confirm]');

  if (cancelBtn) cancelBtn.addEventListener('click', () => closeModal());

  if (noteInput) {
    window.setTimeout(() => {
      try {
        noteInput.focus({ preventScroll: true });
      } catch (err) {
        noteInput.focus();
      }
    }, 80);
  }

  if (confirmBtn) {
    confirmBtn.addEventListener('click', async () => {
      const note = noteInput ? noteInput.value.trim() : '';
      if (needNote && !note) {
        errorBox.innerHTML =
          '<div class="alert alert--error"><span>请填写异常说明后再提交。</span></div>';
        if (noteInput) noteInput.focus();
        return;
      }
      setBusy(confirmBtn, true, '提交中…');
      try {
        await api.updateTaskStatus(task.id, next, note);
        closeModal();
        toast(needNote ? '异常已上报' : '任务状态已更新', needNote ? 'info' : 'success');
        if (typeof onDone === 'function') onDone();
      } catch (err) {
        setBusy(confirmBtn, false);
        if (err && err.status === 401) {
          closeModal();
          return;
        }
        const message = (err && err.message) || '提交失败，请稍后重试';
        errorBox.innerHTML = `<div class="alert alert--error"><span>${escapeHtml(message)}</span></div>`;
        toast(message, 'error');
      }
    });
  }
}
