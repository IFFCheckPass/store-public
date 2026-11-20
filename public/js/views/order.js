import { api, getCachedUser } from '../api.js';
import {
  escapeHtml,
  safeImage,
  formatMoney,
  formatDate,
  statusBadge,
  statusLabel,
  toast,
  confirmModal,
  setBusy
} from '../ui.js';
import { openLoginModal } from './login.js';
import { openPaymentModal, PAY_META } from './payment.js';

const DELIVERY_LABELS = { class: '送货到班', pickup: '自提点自取' };
const CONTACT_LABELS = { qq: 'QQ', wechat: '微信', phone: '电话·短信' };
const TIME_SLOT_LABELS = {
  day_break: '白天场',
  noon: '午间',
  evening: '傍晚',
  evening_study: '晚自习间'
};
const PAYMENT_STATUS_LABELS = {
  pending: '待支付',
  pending_review: '待核验',
  reviewing: '待核验',
  submitted: '待核验',
  verified: '已确认',
  approved: '已确认',
  paid: '已确认',
  success: '已确认',
  rejected: '已驳回'
};

let promptOpen = false;

function giftIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10h16v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V10Zm-1-4h18v4H3V6Zm9 0v15M12 6c-2.8 0-4.5-1-4.5-2.3S8.8 1.5 10 2.4c1.1.8 2 2.3 2 3.6Zm0 0c2.8 0 4.5-1 4.5-2.3S15.2 1.5 14 2.4c-1.1.8-2 2.3-2 3.6Z"/></svg>';
}

function paymentMeta(order) {
  if (order.paymentMethod === 'gift') {
    return { label: '赠货码', iconClass: 'pay-box__icon--gift', icon: giftIcon() };
  }
  const key = order.paymentMethod === 'alipay' ? 'alipay' : 'wechat';
  return PAY_META[key];
}

function paymentStatusText(order) {
  if (order.status === 'pending_payment') return '等待上传支付截图';
  if (order.status === 'pending_review') return '截图已上传，等待管理员核验';
  if (order.paymentMethod === 'gift') return '赠货码已核销，无需支付';
  const raw = order.payment && order.payment.status;
  if (raw && PAYMENT_STATUS_LABELS[raw]) return PAYMENT_STATUS_LABELS[raw];
  if (raw) return String(raw);
  if (['paid', 'producing', 'packing', 'delivering', 'completed'].includes(order.status)) return '支付已确认';
  return '暂无支付信息';
}

function loginPromptHtml(orderNo) {
  return `
    <div class="container">
      <div class="page-head">
        <span class="page-eyebrow">Order Detail</span>
        <h1 class="page-title">订单详情</h1>
        <p class="page-sub">登录后查看订单 ${escapeHtml(orderNo || '')} 的状态与进度。</p>
      </div>
      <div class="login-prompt">
        <div class="prompt-icon">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3.5h10a1 1 0 0 1 1 1V21l-3-1.8L12 21l-3-1.8L6 21V4.5a1 1 0 0 1 1-1Z"/><path d="M9.5 8h5M9.5 11.5h5"/></svg>
        </div>
        <h2>先登录，再查看订单</h2>
        <p>使用下单时的姓名、班级、座号登录，订单详情会完整展示给你。</p>
        <button class="btn btn--primary" type="button" data-login>立即登录</button>
      </div>
    </div>
  `;
}

function bindLoginPrompt(root, orderNo, params, query) {
  const button = root.querySelector('[data-login]');
  const open = () => {
    if (promptOpen) return;
    promptOpen = true;
    openLoginModal({
      reason: '登录后查看该订单的详情',
      onSuccess() {
        promptOpen = false;
        render(root, params, query);
      },
      onCancel() {
        promptOpen = false;
      }
    });
  };
  if (button) button.addEventListener('click', open);
  window.setTimeout(open, 180);
}

function errorHtml(message) {
  return `
    <div class="container">
      <div class="page-head">
        <span class="page-eyebrow">Order Detail</span>
        <h1 class="page-title">订单详情</h1>
      </div>
      <div class="empty-state">
        <svg class="empty-art" viewBox="0 0 178 150" fill="none" aria-hidden="true">
          <ellipse cx="89" cy="132" rx="58" ry="9" fill="#E9F6F0"/>
          <path d="M52 58h74l-7 68a10 10 0 0 1-10 9H69a10 10 0 0 1-10-9l-7-68Z" fill="#EAF8F2" stroke="#BFE9D8" stroke-width="2.5"/>
          <path d="M72 58V48a17 17 0 0 1 34 0v10" stroke="#BFE9D8" stroke-width="2.5"/>
          <circle cx="78" cy="94" r="3" fill="#12A67A"/>
          <circle cx="100" cy="94" r="3" fill="#12A67A"/>
          <path d="M82 108c4-4 10-4 14 0" stroke="#12A67A" stroke-width="2.5" stroke-linecap="round"/>
          <path d="m124 40 2 5 5 2-5 2-2 5-2-5-5-2 5-2 2-5Z" fill="#FFC79B"/>
        </svg>
        <h3>${escapeHtml(message)}</h3>
        <p>订单链接可能不完整，或者该订单不属于当前登录身份。</p>
        <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
          <a class="btn btn--soft" href="#/orders">返回订单列表</a>
          <a class="btn btn--primary" href="#/">回到首页</a>
        </div>
      </div>
    </div>
  `;
}

function itemsPanelHtml(order) {
  const items = Array.isArray(order.items) ? order.items : [];
  const total = Number(order.totalAmount) || 0;
  const original = Number(order.originalAmount) || total;
  const discount = Number(order.discountAmount) || 0;

  return `
    <section class="panel">
      <div class="panel-head">
        <h2 class="panel-title"><span class="step-dot">🛍️</span>商品明细</h2>
        <span class="badge badge--soft">共 ${items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0)} 件</span>
      </div>
      ${
        items.length
          ? items
              .map((item) => {
                const quantity = Number(item.quantity) || 0;
                const unit = Number(item.unitPrice) || 0;
                const subtotal = Number(item.subtotal);
                const lineTotal = Number.isFinite(subtotal) ? subtotal : unit * quantity;
                return `
                  <div class="order-item-row">
                    <div class="thumb-sm"><img src="${escapeHtml(safeImage(item.imageUrl))}" alt="${escapeHtml(item.productName || '商品')}" loading="lazy"></div>
                    <div>
                      <div class="order-item-name">${escapeHtml(item.productName || '商品')}</div>
                      <div class="order-item-variant">
                        ${escapeHtml([item.specName, item.colorName, item.patternName].filter(Boolean).join(' · ') || '默认规格')}
                        ${item.isCustom ? '<span class="variant-tag variant-tag--custom">定制</span>' : ''}
                      </div>
                    </div>
                    <div class="order-item-side">
                      <div class="line-price">${formatMoney(lineTotal)}</div>
                      <small>${formatMoney(unit)} × ${quantity}</small>
                    </div>
                  </div>`;
              })
              .join('')
          : '<p class="field-hint">暂无商品明细。</p>'
      }
      ${
        discount > 0
          ? `<div class="summary-row" style="margin-top:12px"><span>商品金额</span><strong>${formatMoney(
              original
            )}</strong></div>
             <div class="summary-row"><span>赠货码抵扣</span><strong>-${formatMoney(discount)}</strong></div>`
          : ''
      }
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:14px;padding-top:14px;border-top:1px dashed var(--line-strong)">
        <span style="font-size:13px;font-weight:700;color:var(--ink-2)">${discount > 0 ? '应付金额' : '订单合计'}</span>
        <span class="price" style="font-size:24px"><span class="price__unit">¥</span>${formatMoney(total).slice(1)}</span>
      </div>
    </section>
  `;
}

function deliveryPanelHtml(order) {
  const rows = [
    ['收货班级', order.className || '—'],
    ['座号', order.seatNo || '—'],
    ['下单人', order.customerName || '—'],
    ['配送方式', DELIVERY_LABELS[order.deliveryMethod] || order.deliveryMethod || '—'],
    ['收货信息', order.deliveryDetail || '—'],
    ['建议时间段', TIME_SLOT_LABELS[order.timeSlot] || order.timeSlot || '—'],
    ['联系方式', `${CONTACT_LABELS[order.contactType] || '联系'} · ${order.contactValue || '—'}`]
  ];

  return `
    <section class="panel">
      <div class="panel-head">
        <h2 class="panel-title"><span class="step-dot">📍</span>收货与联系</h2>
      </div>
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
          <span class="info-label">备注</span>
          <span class="info-value ${order.remark ? '' : 'muted'}">${escapeHtml(order.remark || '无备注')}</span>
        </div>
        ${order.giftCode
          ? `<div class="info-item" style="grid-column:1/-1">
               <span class="info-label">赠货码</span>
               <span class="info-value">${escapeHtml(order.giftCode)}</span>
             </div>`
          : ''}
      </div>
    </section>
  `;
}

function paymentPanelHtml(order) {
  const meta = paymentMeta(order);
  const payment = order.payment || null;
  return `
    <section class="panel">
      <div class="panel-head">
        <h2 class="panel-title"><span class="step-dot">💳</span>支付信息</h2>
        ${order.paymentMethod === 'gift' ? '<span class="badge badge--accent">赠货码免支付</span>' : ''}
      </div>

      ${order.rejectReason
        ? `<div class="alert alert--error" style="margin-bottom:14px">
             <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5v.5"/></svg>
             <span><strong>支付被驳回：</strong>${escapeHtml(order.rejectReason)}</span>
           </div>`
        : ''}

      <div class="pay-box">
        <span class="pay-box__icon ${meta.iconClass}">${meta.icon}</span>
        <div class="pay-box__body">
          <strong>${escapeHtml(meta.label)}</strong>
          <small>${escapeHtml(paymentStatusText(order))}</small>
        </div>
      </div>

      ${payment && payment.screenshotUrl
        ? `<div class="pay-shot">
             <img src="${escapeHtml(safeImage(payment.screenshotUrl))}" alt="支付截图" loading="lazy">
           </div>`
        : ''}

      ${payment && payment.ocrNumber
        ? `<div class="pay-ocr"><span class="badge badge--soft">支付单号</span><b>${escapeHtml(payment.ocrNumber)}</b></div>`
        : order.paymentMethod === 'gift'
          ? ''
          : `<p class="field-hint" style="margin-top:10px">${
              payment && payment.screenshotUrl
                ? '未填写支付单号，管理员将根据截图人工核对。'
                : '暂未上传支付截图与单号。'
            }</p>`}

      ${payment && payment.reviewNote && order.paymentMethod !== 'gift'
        ? `<div class="alert alert--warn" style="margin-top:12px">
             <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5v.5"/></svg>
             <span>管理员备注：${escapeHtml(payment.reviewNote)}</span>
           </div>`
        : ''}

      ${order.status === 'pending_payment'
        ? `<div class="order-actions" style="margin-top:16px;flex-direction:row;flex-wrap:wrap">
             <button class="btn btn--primary" type="button" data-pay>去支付</button>
             <button class="btn btn--soft" type="button" data-pay>上传支付截图</button>
           </div>`
        : ''}
    </section>
  `;
}

function timelinePanelHtml(order) {
  const timeline = Array.isArray(order.timeline) ? order.timeline : [];
  const isFinal = ['completed', 'cancelled', 'deleted'].includes(order.status);

  return `
    <section class="panel">
      <div class="panel-head">
        <h2 class="panel-title"><span class="step-dot">🕒</span>订单时间线</h2>
      </div>
      ${
        timeline.length
          ? `<div class="timeline">
               ${timeline
                 .map((item, index) => {
                   const isLast = index === timeline.length - 1;
                   const cls = isLast && !isFinal ? 'is-current' : 'is-done';
                   return `
                     <div class="timeline-item ${cls}">
                       <span class="timeline-dot"></span>
                       <div class="timeline-label">${escapeHtml(item.label || statusLabel(item.status, item.label))}</div>
                       ${item.note ? `<div class="timeline-note">${escapeHtml(item.note)}</div>` : ''}
                       <div class="timeline-time">${escapeHtml(formatDate(item.createdAt))}</div>
                     </div>`;
                 })
                 .join('')}
             </div>`
          : '<p class="field-hint">订单进度更新后会显示在这里。</p>'
      }
    </section>
  `;
}

export async function render(root, params = {}, query = {}) {
  const orderNo = params.orderNo ? decodeURIComponent(params.orderNo) : '';
  const user = getCachedUser();

  if (!orderNo) {
    root.innerHTML = errorHtml('订单号缺失');
    return;
  }

  if (!user) {
    root.innerHTML = loginPromptHtml(orderNo);
    bindLoginPrompt(root, orderNo, params, query);
    return;
  }

  root.innerHTML = `
    <div class="container">
      <div class="page-loading"><span class="spinner"></span><p>正在读取订单…</p></div>
    </div>
  `;

  let order;
  try {
    const data = await api.getOrder(orderNo);
    order = data && data.order;
  } catch (err) {
    if (err && err.status === 401) {
      root.innerHTML = loginPromptHtml(orderNo);
      bindLoginPrompt(root, orderNo, params, query);
      return;
    }
    root.innerHTML = errorHtml(
      err && err.status === 404 ? '没有找到这个订单' : '订单加载失败'
    );
    return;
  }

  if (!order) {
    root.innerHTML = errorHtml('订单不存在');
    return;
  }

  const status = order.status || 'pending_payment';
  const total = Number(order.totalAmount) || 0;
  const canPay = status === 'pending_payment';

  root.innerHTML = `
    <div class="container">
      <nav class="breadcrumb" aria-label="面包屑">
        <a href="#/orders">我的订单</a>
        <span class="sep">/</span>
        <span class="current">订单详情</span>
      </nav>

      <div class="page-head">
        <span class="page-eyebrow">Order Detail</span>
        <h1 class="page-title">订单详情</h1>
        <p class="page-sub">订单号 ${escapeHtml(order.orderNo || orderNo)} · 下单于 ${escapeHtml(formatDate(order.createdAt))}</p>
      </div>

      <div class="order-detail-grid">
        <div class="checkout-main">
          ${status === 'pending_payment' && order.rejectReason
            ? `<div class="alert alert--error">
                 <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5v.5"/></svg>
                 <span><strong>上次支付未通过：</strong>${escapeHtml(order.rejectReason)}，请重新上传支付截图。</span>
               </div>`
            : ''}
          ${itemsPanelHtml(order)}
          ${deliveryPanelHtml(order)}
          ${paymentPanelHtml(order)}
          ${timelinePanelHtml(order)}
        </div>

        <aside class="order-summary-card">
          ${statusBadge(status, order.statusLabel)}
          <h2>${escapeHtml(statusLabel(status, order.statusLabel))}</h2>
          <div class="order-no-line">${escapeHtml(order.orderNo || orderNo)}</div>
          <div class="order-summary-price">
            <span class="price"><span class="price__unit">¥</span>${formatMoney(total).slice(1)}</span>
            <span>${order.paymentMethod === 'gift' ? '赠货码免支付' : '订单金额'}</span>
          </div>
          <div class="order-actions">
            ${canPay
              ? `<button class="btn btn--primary btn--block" type="button" data-pay>去支付</button>
                 <button class="btn btn--soft btn--block" type="button" data-pay>上传支付截图</button>
                 <button class="btn btn--ghost btn--block" type="button" data-cancel-order>取消订单</button>`
              : ''}
            ${status === 'pending_review'
              ? '<div class="alert alert--warn" style="justify-content:center"><span>已提交支付信息，等待管理员核验</span></div>'
              : ''}
            <a class="btn btn--ghost btn--block" href="#/orders">返回订单列表</a>
          </div>
          <p class="summary-note">下单时间：${escapeHtml(formatDate(order.createdAt))}<br>如需修改信息，请在订单备注或联系小铺说明。</p>
        </aside>
      </div>
    </div>
  `;

  root.querySelectorAll('[data-pay]').forEach((button) => {
    button.addEventListener('click', () => openPaymentModal(order));
  });

  root.querySelectorAll('[data-cancel-order]').forEach((button) => {
    button.addEventListener('click', async () => {
      const ok = await confirmModal({
        title: '取消订单',
        message: `确定取消订单 <b>${escapeHtml(
          order.orderNo || orderNo
        )}</b> 吗？取消后库存会释放，赠货码使用次数也会退回。`,
        confirmText: '取消订单',
        cancelText: '再想想',
        danger: true
      });
      if (!ok) return;
      setBusy(button, true, '取消中…');
      try {
        await api.cancelOrder(order.orderNo || orderNo);
        toast('订单已取消', 'success');
        await render(root, params, query);
      } catch (err) {
        setBusy(button, false);
        toast((err && err.message) || '取消失败，请稍后重试', 'error');
      }
    });
  });

  if (query && String(query.pay) === '1') {
    try {
      window.history.replaceState(null, '', '#/order/' + encodeURIComponent(order.orderNo || orderNo));
    } catch (err) {
      /* 某些浏览器在 file:// 下不支持，忽略即可 */
    }
    if (canPay) {
      window.setTimeout(() => openPaymentModal(order), 200);
    }
  }
}
