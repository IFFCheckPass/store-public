/**
 * 管理端 · 订单详情 #/order/:orderNo
 */
import { api } from '../api.js';
import { escapeHtml, safeImage, toast } from '/js/ui.js';
import {
  CONTACT_LABELS,
  DELIVERY_LABELS,
  PAYMENT_STATUS_LABELS,
  TIME_SLOT_LABELS,
  errorBlock,
  loadingBlock,
  money,
  num,
  openConfirmModal,
  openPromptModal,
  orderBadge,
  orderStatusLabel,
  paymentMethodLabel,
  progressHtml,
  taskStatusBadge,
  text
} from '../shared.js';

const DELETION_STATUS_LABELS = {
  pending: '待审批',
  approved: '已通过',
  rejected: '已驳回'
};

const bound = new WeakSet();
let currentRoot = null;
let currentCtx = null;
let currentOrderNo = '';
let currentOrder = null;

function deletionBadge(status) {
  const dataStatus = status === 'approved' ? 'issue' : status === 'rejected' ? 'cancelled' : 'pending_review';
  return `<span class="status-badge" data-status="${dataStatus}">${escapeHtml(
    DELETION_STATUS_LABELS[status] || text(status, '待审批')
  )}</span>`;
}

function itemsHtml(order) {
  const items = Array.isArray(order.items) ? order.items : [];
  const total = num(order.totalAmount);
  if (!items.length) return '<p class="field-hint">暂无商品明细。</p>';

  return `
    <div class="detail-items">
      ${items
        .map((item) => {
          const quantity = num(item.quantity);
          const unitPrice = num(item.unitPrice);
          const subtotal = Number.isFinite(Number(item.subtotal)) ? Number(item.subtotal) : unitPrice * quantity;
          const variant =
            [item.specName, item.colorName, item.patternName].filter(Boolean).join(' · ') ||
            '默认规格';
          return `
            <div class="detail-item">
              <div class="detail-item__thumb">
                <img src="${escapeHtml(safeImage(item.imageUrl))}" alt="${escapeHtml(
                  text(item.productName, '商品')
                )}" loading="lazy">
              </div>
              <div>
                <div class="detail-item__name">${escapeHtml(text(item.productName, '商品'))}</div>
                <div class="detail-item__variant">${escapeHtml(variant)}${
                  item.isCustom
                    ? ' <b class="variant-tag variant-tag--custom">定制</b>'
                    : ''
                }</div>
              </div>
              <div class="detail-item__side">
                <b>${money(subtotal)}</b>
                <small>${money(unitPrice)} × ${quantity}</small>
              </div>
            </div>
          `;
        })
        .join('')}
    </div>
    <div class="detail-total">
      <span>订单合计</span>
      <span class="price"><span class="price__unit">¥</span>${money(total).slice(1)}</span>
    </div>
  `;
}

function deliveryHtml(order) {
  const rows = [
    ['下单客户', text(order.customerName)],
    ['收货班级', text(order.className)],
    ['座号', text(order.seatNo)],
    ['配送方式', text(DELIVERY_LABELS[order.deliveryMethod], text(order.deliveryMethod))],
    ['收货信息', text(order.deliveryDetail)],
    ['建议时间段', text(TIME_SLOT_LABELS[order.timeSlot], text(order.timeSlot))],
    [
      '联系方式',
      `${text(CONTACT_LABELS[order.contactType], '联系')} · ${text(order.contactValue)}`
    ]
  ];

  return `
    <div class="info-grid">
      ${rows
        .map(
          ([label, value]) => `
            <div class="info-item">
              <span class="info-label">${escapeHtml(label)}</span>
              <span class="info-value">${escapeHtml(value)}</span>
            </div>`
        )
        .join('')}
      <div class="info-item" style="grid-column:1/-1">
        <span class="info-label">订单备注</span>
        <span class="info-value ${order.remark ? '' : 'muted'}">${escapeHtml(text(order.remark, '无备注'))}</span>
      </div>
    </div>
  `;
}

function paymentHtml(order) {
  const payment = order.payment;
  const method = paymentMethodLabel(order.paymentMethod);
  // 优先使用后端鉴权后的截图地址，缺省回退到旧字段
  const screenshotUrl = payment ? payment.screenshotViewUrl || payment.screenshotUrl : '';

  return `
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
      <span class="pay-method pay-method--${escapeHtml(order.paymentMethod || 'wechat')}"><i></i>${escapeHtml(
        method
      )}</span>
      ${
        payment
          ? `<span class="badge badge--soft">${escapeHtml(
              PAYMENT_STATUS_LABELS[payment.status] || text(payment.status, '—')
            )}</span>`
          : '<span class="badge badge--soft">暂无支付记录</span>'
      }
      ${order.giftCode ? `<span class="badge badge--accent">赠货码 ${escapeHtml(order.giftCode)}</span>` : ''}
    </div>

    ${
      order.rejectReason
        ? `<div class="admin-alert admin-alert--error" style="margin-top:12px">
             <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5v.5"/></svg>
             <span><b>驳回原因：</b>${escapeHtml(order.rejectReason)}</span>
           </div>`
        : ''
    }

    ${
      screenshotUrl
        ? `<a class="detail-pay-shot" href="${escapeHtml(screenshotUrl)}" target="_blank" rel="noopener" title="点击查看支付截图大图">
             <img src="${escapeHtml(safeImage(screenshotUrl))}" alt="支付截图" loading="lazy">
             <span class="detail-pay-shot__hint">点击查看大图</span>
           </a>`
        : '<p class="field-hint" style="margin-top:10px">暂无支付截图。</p>'
    }

    <div class="info-grid" style="margin-top:14px">
      <div class="info-item">
        <span class="info-label">OCR 支付单号</span>
        <span class="info-value ${payment && payment.ocrNumber ? '' : 'muted'}">${escapeHtml(
          text(payment && payment.ocrNumber, '未识别 / 未填写')
        )}</span>
      </div>
      <div class="info-item">
        <span class="info-label">截图提交时间</span>
        <span class="info-value">${escapeHtml(text(payment && payment.createdAt))}</span>
      </div>
      ${
        payment && payment.reviewNote && order.paymentMethod !== 'gift'
          ? `<div class="info-item" style="grid-column:1/-1">
               <span class="info-label">核验备注</span>
               <span class="info-value muted">${escapeHtml(payment.reviewNote)}</span>
             </div>`
          : ''
      }
    </div>
  `;
}

function tasksHtml(order) {
  const external = Array.isArray(order.externalTasks) ? order.externalTasks : [];
  const internal = order.internalTask;

  return `
    <div class="detail-card__head">
      <h2>生产与配送</h2>
      <span class="hint">外部任务 ${external.length} 个</span>
    </div>

    ${
      external.length
        ? external
            .map(
              (task) => `
                <div class="task-row">
                  <span class="task-row__name">${escapeHtml(text(task.productName, '商品'))}</span>
                  <span class="task-row__meta">${escapeHtml(
                    [task.specName, task.colorName].filter(Boolean).join(' · ') || '默认规格'
                  )}</span>
                  <span class="task-row__side">
                    <span class="task-row__qty">×${num(task.quantity)}</span>
                    ${taskStatusBadge(task.status, task.statusLabel)}
                  </span>
                </div>`
            )
            .join('')
        : '<p class="field-hint">暂无外部生产任务（商品无需生产或订单尚未通过核验）。</p>'
    }

    <div class="task-row" style="margin-top:4px;padding-top:11px;border-top:1px solid var(--line)">
      <span class="task-row__name">内部打包</span>
      <span class="task-row__meta">${escapeHtml(text(internal && internal.note, '按订单统一打包配送'))}</span>
      <span class="task-row__side">
        <span class="task-row__qty">${internal ? `共 ${num(internal.quantity)} 件` : '未创建'}</span>
        ${
          internal
            ? taskStatusBadge(internal.status, internal.statusLabel)
            : '<span class="badge badge--soft">未创建</span>'
        }
      </span>
    </div>
  `;
}

function timelineHtml(order) {
  const timeline = Array.isArray(order.timeline) ? order.timeline : [];
  if (!timeline.length) return '<p class="field-hint">暂无订单进度记录。</p>';

  return `
    <div class="timeline detail-timeline">
      ${timeline
        .map((item, index) => {
          const isLast = index === timeline.length - 1;
          return `
            <div class="timeline-item ${isLast ? 'is-current' : 'is-done'}">
              <span class="timeline-dot"></span>
              <div class="timeline-label">${escapeHtml(orderStatusLabel(item.status, item.label))}</div>
              ${item.note ? `<div class="timeline-note">${escapeHtml(item.note)}</div>` : ''}
              <div class="timeline-time">${escapeHtml(text(item.createdAt, ''))}</div>
            </div>`;
        })
        .join('')}
    </div>
  `;
}

function deletionHtml(request) {
  if (!request) return '';
  const approvals = Array.isArray(request.approvals) ? request.approvals : [];
  const required = num(request.requiredCount) || 2;

  return `
    <div class="detail-card">
      <div class="detail-card__head">
        <h2>删除申请</h2>
        ${deletionBadge(request.status)}
      </div>
      <div class="deletion-grid">
        <div class="info-item">
          <span class="info-label">发起人</span>
          <span class="info-value">${escapeHtml(text(request.requestedByName))}</span>
        </div>
        <div class="info-item">
          <span class="info-label">发起时间</span>
          <span class="info-value">${escapeHtml(text(request.createdAt))}</span>
        </div>
        <div class="info-item">
          <span class="info-label">审批进度</span>
          <span class="info-value">${approvals.length} / ${required}</span>
        </div>
        <div class="info-item">
          <span class="info-label">处理时间</span>
          <span class="info-value">${escapeHtml(text(request.resolvedAt))}</span>
        </div>
      </div>
      <div class="deletion-reason"><b>删除原因：</b>${escapeHtml(text(request.reason))}</div>
      ${progressHtml(approvals.length, required, request.status === 'approved' ? 'danger' : 'warn')}
      <div class="approval-list" style="margin-top:10px;margin-bottom:0">
        ${
          approvals.length
            ? approvals
                .map(
                  (approval) => `
                    <span class="approval-pill">${escapeHtml(text(approval.staffName))}
                      <small>${escapeHtml(text(approval.createdAt, ''))}</small>
                    </span>`
                )
                .join('')
            : '<span class="approval-empty">尚无审批人确认。</span>'
        }
      </div>
      ${
        request.status === 'pending'
          ? '<p class="field-hint" style="margin-top:10px">需至少两位不同的超级管理员确认后才会归档删除，请到「删除审批」页面处理。</p>'
          : ''
      }
    </div>
  `;
}

function bodyHtml(order, staff) {
  const isDeleted = order.status === 'deleted';
  const request = order.deletionRequest;
  const pendingRequest = request && request.status === 'pending';
  const canRequestDelete = !isDeleted && !pendingRequest;
  const canReview = order.status === 'pending_review';
  const total = num(order.totalAmount);
  const approvals = pendingRequest && Array.isArray(request.approvals) ? request.approvals.length : 0;
  const required = pendingRequest ? num(request.requiredCount) || 2 : 2;

  return `
    <div class="detail-layout">
      <div class="detail-main">
        <div class="detail-card">
          <div class="detail-card__head">
            <h2>商品明细</h2>
            <span class="hint">共 ${Array.isArray(order.items) ? order.items.length : 0} 项</span>
          </div>
          ${itemsHtml(order)}
        </div>

        <div class="detail-card">
          <div class="detail-card__head">
            <h2>收货与联系方式</h2>
          </div>
          ${deliveryHtml(order)}
        </div>

        <div class="detail-card">
          <div class="detail-card__head">
            <h2>支付信息</h2>
            ${
              canReview
                ? '<span class="badge badge--accent">待核验</span>'
                : order.paymentMethod === 'gift'
                  ? '<span class="badge badge--soft">赠货码免支付</span>'
                  : ''
            }
          </div>
          ${paymentHtml(order)}
        </div>

        <div class="detail-card">${tasksHtml(order)}</div>

        <div class="detail-card">
          <div class="detail-card__head">
            <h2>订单时间线</h2>
            <span class="hint">${Array.isArray(order.timeline) ? order.timeline.length : 0} 条记录</span>
          </div>
          ${timelineHtml(order)}
        </div>

        ${deletionHtml(request)}
      </div>

      <aside class="detail-aside">
        <div class="detail-summary">
          ${orderBadge(order.status, order.statusLabel)}
          <h2>${escapeHtml(orderStatusLabel(order.status, order.statusLabel))}</h2>
          <div class="detail-summary__no">订单号 ${escapeHtml(text(order.orderNo))}</div>
          <div class="detail-summary__amount">
            <span class="price"><span class="price__unit">¥</span>${money(total).slice(1)}</span>
            <span>${order.paymentMethod === 'gift' ? '赠货码免支付' : '订单金额'}</span>
          </div>

          <div class="detail-summary__meta">
            ${
              num(order.discountAmount) > 0
                ? `<div class="detail-summary__row"><span>商品金额</span><b>${money(
                    num(order.originalAmount) || total
                  )}</b></div>
                   <div class="detail-summary__row"><span>赠货码抵扣</span><b>-${money(
                     num(order.discountAmount)
                   )}</b></div>`
                : ''
            }
            <div class="detail-summary__row"><span>下单时间</span><b>${escapeHtml(text(order.createdAt))}</b></div>
            <div class="detail-summary__row"><span>支付时间</span><b>${escapeHtml(text(order.paidAt))}</b></div>
            <div class="detail-summary__row"><span>支付方式</span><b>${escapeHtml(
              paymentMethodLabel(order.paymentMethod)
            )}</b></div>
            <div class="detail-summary__row"><span>完成时间</span><b>${escapeHtml(text(order.completedAt))}</b></div>
            <div class="detail-summary__row"><span>客户</span><b>${escapeHtml(text(order.customerName))}</b></div>
            <div class="detail-summary__row"><span>班级</span><b>${escapeHtml(text(order.className))}</b></div>
          </div>

          ${
            pendingRequest
              ? `<div class="detail-summary__meta">
                   <div class="detail-summary__row"><span>删除审批</span><b>${approvals} / ${required}</b></div>
                   ${progressHtml(approvals, required, 'warn')}
                 </div>`
              : ''
          }

          <div class="detail-summary__actions">
            ${canReview
              ? `<button class="btn btn--primary" type="button" data-detail-action="approve">核验通过</button>
                 <button class="btn btn--danger" type="button" data-detail-action="reject">驳回支付</button>`
              : ''}
            ${
              canRequestDelete
                ? `<button class="btn btn--line" type="button" data-detail-action="delete-request">发起删除申请</button>`
                : ''
            }
            ${
              isDeleted
                ? '<div class="admin-alert admin-alert--error"><span>该订单已删除归档，仅保留查看。</span></div>'
                : ''
            }
            <a class="btn btn--ghost" href="#/orders">返回订单列表</a>
          </div>

          <p class="summary-note">
            操作人：${escapeHtml(text(staff && staff.displayName, '管理员'))}<br>
            删除订单需两位超级管理员确认。
          </p>
        </div>
      </aside>
    </div>
  `;
}

function pageHtml() {
  return `
    <div class="admin-page-head">
      <div class="admin-page-head__text">
        <span class="admin-eyebrow">Order Detail</span>
        <h1>订单详情</h1>
        <p data-order-sub>查看商品、支付、生产与配送的完整链路。</p>
      </div>
      <div class="admin-page-head__actions">
        <a class="btn btn--line" href="#/orders">返回列表</a>
        <button class="btn btn--soft" type="button" data-refresh>刷新</button>
      </div>
    </div>
    <div data-order-detail>${loadingBlock('正在读取订单详情…')}</div>
  `;
}

async function findSubmittedPayment(orderNo) {
  const data = await api.payments('submitted');
  const list = Array.isArray(data && data.payments) ? data.payments : [];
  return list.find((payment) => payment.orderNo === orderNo) || null;
}

async function loadDetail() {
  const root = currentRoot;
  const ctx = currentCtx;
  if (!root || !ctx) return;
  const container = root.querySelector('[data-order-detail]');
  if (!container) return;
  container.innerHTML = loadingBlock('正在读取订单详情…');

  if (!currentOrderNo) {
    container.innerHTML = errorBlock('订单号缺失');
    return;
  }

  try {
    const data = await api.order(currentOrderNo);
    if (!ctx.isCurrent()) return;
    const order = data && data.order ? data.order : null;
    if (!order) {
      container.innerHTML = errorBlock('订单不存在或已被移除');
      return;
    }
    currentOrder = order;
    container.innerHTML = bodyHtml(order, ctx.staff);

    const sub = root.querySelector('[data-order-sub]');
    if (sub) {
      sub.textContent = `订单号 ${text(order.orderNo, currentOrderNo)} · 下单于 ${text(order.createdAt)}`;
    }
  } catch (err) {
    if (!ctx.isCurrent()) return;
    if (err && err.status === 401) return;
    container.innerHTML = errorBlock(
      (err && err.message) || '订单详情加载失败',
      'data-retry'
    );
  }
}

function handleApprove() {
  const order = currentOrder;
  if (!order) return;
  openConfirmModal({
    title: '核验通过该笔支付？',
    eyebrow: `订单 ${order.orderNo}`,
    message: `请先确认订单金额 <b>${money(num(order.totalAmount))}</b> 与支付截图一致。通过后订单将进入生产与打包流程。`,
    confirmText: '核验通过',
    onConfirm: async () => {
      const payment = await findSubmittedPayment(order.orderNo);
      if (!payment) {
        throw new Error('未找到该订单的待核验支付记录，请到「收款核验」页面查看');
      }
      await api.reviewPayment(payment.id, 'approve', '订单详情核验通过');
      toast('支付核验已通过', 'success');
      await loadDetail();
    }
  });
}

async function handleReject() {
  const order = currentOrder;
  if (!order) return;
  let payment = null;
  try {
    payment = await findSubmittedPayment(order.orderNo);
  } catch (err) {
    if (err && err.status === 401) return;
    toast((err && err.message) || '读取支付记录失败', 'error');
    return;
  }
  if (!payment) {
    toast('未找到该订单的待核验支付记录', 'error');
    return;
  }

  openPromptModal({
    title: '驳回支付核验',
    eyebrow: `订单 ${order.orderNo}`,
    sub: '驳回后订单将回到「待付款」，用户可重新上传支付截图。',
    label: '驳回原因',
    placeholder: '例如：截图金额与订单金额不一致，请重新上传',
    hint: '驳回原因会展示给用户，请填写清楚。',
    required: true,
    confirmText: '确认驳回',
    danger: true,
    maxLength: 300,
    onConfirm: async (reason) => {
      await api.reviewPayment(payment.id, 'reject', reason);
      toast('已驳回该笔支付', 'success');
      await loadDetail();
    }
  });
}

function handleDeleteRequest() {
  const order = currentOrder;
  if (!order) return;
  openPromptModal({
    title: '发起删除申请',
    eyebrow: `订单 ${order.orderNo}`,
    sub: '删除申请需至少两位不同的超级管理员确认后才会归档。',
    label: '删除原因',
    placeholder: '请说明删除该订单的原因，例如：重复下单、测试订单等',
    hint: '申请人若为超级管理员，其确认会自动计入一次；同一账号不能重复确认。',
    required: true,
    confirmText: '提交申请',
    danger: true,
    maxLength: 300,
    onConfirm: async (reason) => {
      await api.createDeletionRequest(order.orderNo, reason);
      toast('删除申请已提交', 'success');
      await loadDetail();
    }
  });
}

async function onClick(event) {
  const root = currentRoot;
  if (!root) return;

  if (event.target.closest('[data-refresh]') || event.target.closest('[data-retry]')) {
    loadDetail();
    return;
  }

  const actionBtn = event.target.closest('[data-detail-action]');
  if (!actionBtn) return;
  const action = actionBtn.dataset.detailAction;
  if (action === 'approve') handleApprove();
  else if (action === 'reject') handleReject();
  else if (action === 'delete-request') handleDeleteRequest();
}

export function render(root, ctx, params = {}) {
  currentRoot = root;
  currentCtx = ctx;
  currentOrderNo = params.orderNo || '';
  currentOrder = null;

  root.innerHTML = pageHtml();

  if (!bound.has(root)) {
    root.addEventListener('click', onClick);
    bound.add(root);
  }

  loadDetail();
}
