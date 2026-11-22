/**
 * 管理端 · 收款核验 #/payments
 */
import { api } from '../api.js';
import { escapeHtml, toast } from '/js/ui.js';
import {
  emptyBlock,
  errorBlock,
  loadingBlock,
  money,
  openConfirmModal,
  openPromptModal,
  paymentMethodLabel,
  text
} from '../shared.js';

const bound = new WeakSet();
let currentRoot = null;
let currentCtx = null;
let currentPayments = [];

function isSuperAdmin(staff) {
  return !!staff && staff.role === 'super_admin';
}

function pageHtml(canReview = false) {
  return `
    <div class="admin-page-head">
      <div class="admin-page-head__text">
        <span class="admin-eyebrow">Payment Review</span>
        <h1>收款核验</h1>
        <p>核对支付截图与 OCR 单号，通过后订单进入生产与打包流程。</p>
      </div>
      <div class="admin-page-head__actions">
        <button class="btn btn--line" type="button" data-refresh>刷新队列</button>
      </div>
    </div>
    ${
      canReview
        ? ''
        : `<div class="readonly-note">
             <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5v.5"/></svg>
             <span><b>只读模式：</b>普通管理员可查看待核验收款，核验通过 / 驳回仅限超级管理员操作。</span>
           </div>`
    }
    <div data-payments>${loadingBlock('正在读取待核验收款…')}</div>
  `;
}

function thumbHtml(payment) {
  // 优先使用后端鉴权后的截图地址，避免直连可公开访问的静态路径
  const url = payment.screenshotViewUrl || payment.screenshotUrl;
  if (!url) {
    return '<span class="pay-thumb pay-thumb--empty">无截图</span>';
  }
  return `
    <a class="pay-thumb" href="${escapeHtml(url)}" target="_blank" rel="noopener" title="点击查看支付截图大图">
      <img src="${escapeHtml(url)}" alt="支付截图" loading="lazy">
    </a>
  `;
}

function resultHtml(payments, canReview = true) {
  if (!payments.length) {
    return emptyBlock(
      '暂无待核验收款',
      '用户提交支付截图后会出现在这里，通过核验的订单会自动进入生产流程。',
      '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="6" width="17" height="12" rx="2"/><path d="M3.5 10h17M7 14.5h3"/></svg>'
    );
  }

  return `
    <div class="table-card">
      <div class="table-toolbar">
        <span class="table-toolbar__count">待核验 <b>${payments.length}</b> 笔</span>
        <span class="table-toolbar__count">请核对金额与支付单号</span>
      </div>
      <div class="table-wrap">
        <table class="admin-table" style="min-width:900px">
          <thead>
            <tr>
              <th>截图</th>
              <th>订单号</th>
              <th>客户 / 班级</th>
              <th>金额</th>
              <th>支付方式</th>
              <th>OCR 支付单号</th>
              <th>提交时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            ${payments
              .map(
                (payment) => `
                  <tr data-payment-id="${payment.id}">
                    <td>${thumbHtml(payment)}</td>
                    <td>
                      <a class="cell-strong cell-mono" href="#/order/${encodeURIComponent(
                        text(payment.orderNo, '')
                      )}">${escapeHtml(text(payment.orderNo))}</a>
                    </td>
                    <td>
                      <span class="cell-strong">${escapeHtml(text(payment.customerName))}</span>
                      <span class="cell-sub">${escapeHtml(text(payment.className))}</span>
                    </td>
                    <td class="cell-amount">${money(payment.amount)}</td>
                    <td>${escapeHtml(paymentMethodLabel(payment.method))}</td>
                    <td>
                      <span class="ocr-code ${payment.ocrNumber ? '' : 'ocr-code--empty'}">${escapeHtml(
                        text(payment.ocrNumber, '未识别')
                      )}</span>
                    </td>
                    <td class="cell-muted cell-nowrap">${escapeHtml(text(payment.createdAt))}</td>
                    <td class="cell-actions">
                      ${
                        canReview
                          ? `<button class="btn btn--sm btn--soft" type="button" data-pay-action="approve" data-pay-id="${payment.id}">通过</button>
                      <button class="btn btn--sm btn--danger" type="button" data-pay-action="reject" data-pay-id="${payment.id}">驳回</button>`
                          : '<span class="cell-muted">需超级管理员核验</span>'
                      }
                    </td>
                  </tr>
                `
              )
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
  const container = root.querySelector('[data-payments]');
  if (!container) return;

  container.innerHTML = loadingBlock('正在读取待核验收款…');
  try {
    const data = await api.payments('submitted');
    if (!ctx.isCurrent()) return;
    currentPayments = Array.isArray(data && data.payments) ? data.payments : [];
    container.innerHTML = resultHtml(currentPayments, isSuperAdmin(ctx.staff));
  } catch (err) {
    if (!ctx.isCurrent()) return;
    if (err && err.status === 401) return;
    container.innerHTML = errorBlock((err && err.message) || '收款核验队列加载失败');
  }
}

function handleApprove(paymentId) {
  const payment = currentPayments.find((item) => item.id === paymentId);
  if (!payment) {
    toast('收款记录已更新，请刷新后重试', 'error');
    return;
  }
  openConfirmModal({
    title: '确认通过该笔收款？',
    eyebrow: `订单 ${payment.orderNo}`,
    message: `客户 <b>${escapeHtml(text(payment.customerName))}</b> 的订单金额为 <b>${money(
      payment.amount
    )}</b>。请确认支付截图与金额一致后通过核验。`,
    confirmText: '核验通过',
    onConfirm: async () => {
      await api.reviewPayment(paymentId, 'approve', '收款核验通过');
      toast('已通过核验，订单进入生产流程', 'success');
      await load();
    }
  });
}

function handleReject(paymentId) {
  const payment = currentPayments.find((item) => item.id === paymentId);
  if (!payment) {
    toast('收款记录已更新，请刷新后重试', 'error');
    return;
  }
  openPromptModal({
    title: '驳回该笔收款',
    eyebrow: `订单 ${payment.orderNo}`,
    sub: '驳回后订单回到「待付款」，用户可见驳回原因并重新上传。',
    label: '驳回原因',
    placeholder: '例如：支付金额与订单不一致、截图不清晰等',
    required: true,
    confirmText: '确认驳回',
    danger: true,
    maxLength: 300,
    onConfirm: async (reason) => {
      await api.reviewPayment(paymentId, 'reject', reason);
      toast('已驳回该笔收款', 'success');
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

  const actionBtn = event.target.closest('[data-pay-action]');
  if (!actionBtn) return;
  if (!isSuperAdmin(currentCtx && currentCtx.staff)) {
    toast('需超级管理员核验', 'error');
    return;
  }
  const id = Number(actionBtn.dataset.payId);
  if (!Number.isInteger(id)) return;
  if (actionBtn.dataset.payAction === 'approve') handleApprove(id);
  else if (actionBtn.dataset.payAction === 'reject') handleReject(id);
}

export function render(root, ctx) {
  currentRoot = root;
  currentCtx = ctx;
  currentPayments = [];
  root.innerHTML = pageHtml(isSuperAdmin(ctx && ctx.staff));

  if (!bound.has(root)) {
    root.addEventListener('click', onClick);
    bound.add(root);
  }

  load();
}
