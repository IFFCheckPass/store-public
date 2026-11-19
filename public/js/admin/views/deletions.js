/**
 * 管理端 · 删除审批 #/deletions
 */
import { api } from '../api.js';
import { escapeHtml, toast } from '/js/ui.js';
import {
  emptyBlock,
  errorBlock,
  loadingBlock,
  money,
  num,
  openConfirmModal,
  text
} from '../shared.js';

const STATUS_LABELS = {
  pending: '待审批',
  approved: '已通过',
  rejected: '已驳回'
};

const bound = new WeakSet();
let currentRoot = null;
let currentCtx = null;
let currentRequests = [];

function isSuper(staff) {
  return staff && staff.role === 'super_admin';
}

function deletionBadge(status) {
  const dataStatus =
    status === 'approved' ? 'issue' : status === 'rejected' ? 'cancelled' : 'pending_review';
  return `<span class="status-badge" data-status="${dataStatus}">${escapeHtml(
    STATUS_LABELS[status] || text(status, '待审批')
  )}</span>`;
}

function pageHtml(staff) {
  const superAdmin = isSuper(staff);
  return `
    <div class="admin-page-head">
      <div class="admin-page-head__text">
        <span class="admin-eyebrow">Deletion Approval</span>
        <h1>删除审批</h1>
        <p>删除订单需至少两位不同的超级管理员确认，通过后订单归档且不再出现在常规列表。</p>
      </div>
      <div class="admin-page-head__actions">
        <button class="btn btn--line" type="button" data-refresh>刷新</button>
      </div>
    </div>
    ${
      superAdmin
        ? ''
        : `<div class="readonly-note">
             <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5v.5"/></svg>
             <span><b>只读模式：</b>仅超级管理员可确认或驳回删除申请；普通管理员可查看审批进度。</span>
           </div>`
    }
    <div data-deletions>${loadingBlock('正在读取删除申请…')}</div>
  `;
}

function summaryHtml(requests) {
  const counts = { pending: 0, approved: 0, rejected: 0 };
  requests.forEach((request) => {
    if (counts[request.status] !== undefined) counts[request.status] += 1;
  });

  const cards = [
    { label: '待审批', value: counts.pending, tone: 'warn' },
    { label: '已通过', value: counts.approved, tone: 'danger' },
    { label: '已驳回', value: counts.rejected, tone: 'neutral' }
  ];

  return `
    <div class="metric-grid" style="grid-template-columns:repeat(3,minmax(0,1fr));margin-bottom:16px">
      ${cards
        .map(
          (card) => `
            <div class="metric-card metric-card--${card.tone}">
              <div class="metric-card__label">${escapeHtml(card.label)}</div>
              <div class="metric-card__value">${card.value}</div>
              <div class="metric-card__hint">删除申请</div>
            </div>`
        )
        .join('')}
    </div>
  `;
}

function cardHtml(request, viewer) {
  const approvals = Array.isArray(request.approvals) ? request.approvals : [];
  const required = num(request.requiredCount) || 2;
  const approvedByMe = approvals.some(
    (approval) => text(approval.staffName, '') === text(viewer && viewer.displayName, '')
  );
  const superAdmin = isSuper(viewer);
  const pending = request.status === 'pending';
  const percent = Math.min(100, Math.round((approvals.length / required) * 100));

  return `
    <article class="deletion-card" data-status="${escapeHtml(request.status)}">
      <div class="deletion-head">
        <div class="deletion-title">
          <span class="order-no">${escapeHtml(text(request.orderNo))}</span>
          <small>${escapeHtml(text(request.customerName))} · ${escapeHtml(text(request.className))} · ${money(
            request.amount
          )}</small>
        </div>
        <div class="deletion-tags">
          ${deletionBadge(request.status)}
          <span class="badge badge--soft">${approvals.length} / ${required} 确认</span>
        </div>
      </div>

      <div class="deletion-grid">
        <div class="info-item">
          <span class="info-label">客户</span>
          <span class="info-value">${escapeHtml(text(request.customerName))}</span>
        </div>
        <div class="info-item">
          <span class="info-label">班级</span>
          <span class="info-value">${escapeHtml(text(request.className))}</span>
        </div>
        <div class="info-item">
          <span class="info-label">订单金额</span>
          <span class="info-value">${money(request.amount)}</span>
        </div>
        <div class="info-item">
          <span class="info-label">发起人</span>
          <span class="info-value">${escapeHtml(text(request.requestedByName))}</span>
        </div>
        <div class="info-item">
          <span class="info-label">发起时间</span>
          <span class="info-value">${escapeHtml(text(request.createdAt))}</span>
        </div>
        <div class="info-item">
          <span class="info-label">处理时间</span>
          <span class="info-value">${escapeHtml(text(request.resolvedAt))}</span>
        </div>
      </div>

      <div class="deletion-reason"><b>删除原因：</b>${escapeHtml(text(request.reason))}</div>

      <div class="progress-line" style="margin-bottom:10px">
        <span>审批进度</span>
        <div class="progress ${request.status === 'approved' ? 'progress--danger' : 'progress--warn'}" style="flex:1;max-width:220px">
          <span style="width:${percent}%"></span>
        </div>
        <b>${approvals.length}/${required}</b>
      </div>

      ${
        approvals.length
          ? `<div class="approval-list">
               ${approvals
                 .map(
                   (approval) => `
                     <span class="approval-pill">
                       <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>
                       ${escapeHtml(text(approval.staffName))}
                       <small>${escapeHtml(text(approval.createdAt, ''))}</small>
                     </span>`
                 )
                 .join('')}
             </div>`
          : '<p class="approval-empty">尚无审批人确认。</p>'
      }

      <div class="deletion-actions">
        ${
          pending && superAdmin
            ? `<button class="btn btn--primary" type="button" data-deletion-action="approve" data-request-id="${
                request.id
              }"${
                approvedByMe ? ' disabled title="您已确认过该申请"' : ''
              }>确认删除</button>
               <button class="btn btn--danger" type="button" data-deletion-action="reject" data-request-id="${request.id}">驳回申请</button>`
            : pending
              ? '<span class="deletion-actions__note">仅超级管理员可审批该申请</span>'
              : `<span class="deletion-actions__note">该申请已${
                  request.status === 'approved' ? '通过，订单已归档' : '驳回，订单保持可见'
                }</span>`
        }
        <a class="btn btn--ghost" href="#/order/${encodeURIComponent(text(request.orderNo, ''))}">查看订单</a>
        ${
          pending && approvedByMe && superAdmin
            ? '<span class="deletion-actions__note">您已确认，等待另一位超级管理员</span>'
            : ''
        }
      </div>
    </article>
  `;
}

function resultHtml(requests, viewer) {
  if (!requests.length) {
    return emptyBlock(
      '暂无删除申请',
      '在订单详情中发起删除申请后，会出现在这里等待超级管理员确认。'
    );
  }
  return `
    ${summaryHtml(requests)}
    <div class="deletion-list">${requests.map((request) => cardHtml(request, viewer)).join('')}</div>
  `;
}

async function load() {
  const root = currentRoot;
  const ctx = currentCtx;
  if (!root || !ctx) return;
  const container = root.querySelector('[data-deletions]');
  if (!container) return;

  container.innerHTML = loadingBlock('正在读取删除申请…');
  try {
    const data = await api.deletionRequests();
    if (!ctx.isCurrent()) return;
    currentRequests = Array.isArray(data && data.requests) ? data.requests : [];
    container.innerHTML = resultHtml(currentRequests, ctx.staff);
  } catch (err) {
    if (!ctx.isCurrent()) return;
    if (err && err.status === 401) return;
    container.innerHTML = errorBlock((err && err.message) || '删除申请加载失败');
  }
}

function handleApprove(request) {
  openConfirmModal({
    title: '确认删除该订单？',
    eyebrow: `订单 ${request.orderNo}`,
    message: `确认后若审批人数达到 <b>${num(request.requiredCount) || 2}</b> 人，订单将被软删除归档，关联生产任务停止流转。该操作不可撤销。`,
    confirmText: '确认删除',
    danger: true,
    onConfirm: async () => {
      const data = await api.approveDeletion(request.id);
      const updated = data && data.request ? data.request : null;
      if (updated && updated.status === 'approved') {
        toast('删除申请已通过，订单已归档', 'success');
      } else {
        toast('已确认，等待另一位超级管理员确认', 'success');
      }
      await load();
    }
  });
}

function handleReject(request) {
  openConfirmModal({
    title: '驳回该删除申请？',
    eyebrow: `订单 ${request.orderNo}`,
    message: '驳回后订单保持可见，删除申请状态变为「已驳回」。如仍需删除，可重新发起申请。',
    confirmText: '确认驳回',
    danger: true,
    onConfirm: async () => {
      await api.rejectDeletion(request.id);
      toast('删除申请已驳回', 'success');
      await load();
    }
  });
}

async function onClick(event) {
  const root = currentRoot;
  if (!root) return;

  if (event.target.closest('[data-refresh]') || event.target.closest('[data-retry]')) {
    load();
    return;
  }

  const actionBtn = event.target.closest('[data-deletion-action]');
  if (!actionBtn || actionBtn.disabled) return;

  const request = currentRequests.find((item) => item.id === Number(actionBtn.dataset.requestId));
  if (!request) {
    toast('删除申请已更新，请刷新后重试', 'error');
    return;
  }
  if (actionBtn.dataset.deletionAction === 'approve') handleApprove(request);
  else if (actionBtn.dataset.deletionAction === 'reject') handleReject(request);
}

export function render(root, ctx) {
  currentRoot = root;
  currentCtx = ctx;
  currentRequests = [];
  root.innerHTML = pageHtml(ctx.staff);

  if (!bound.has(root)) {
    root.addEventListener('click', onClick);
    bound.add(root);
  }

  load();
}
