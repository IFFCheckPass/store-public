import { api, getCachedUser } from '../api.js';
import {
  escapeHtml,
  safeImage,
  formatMoney,
  formatDate,
  statusBadge,
  emptyState,
  toast,
  confirmModal,
  setBusy
} from '../ui.js';
import { openLoginModal } from './login.js';

let promptOpen = false;

function loginPromptHtml() {
  return `
    <div class="container">
      <div class="page-head">
        <span class="page-eyebrow">My Orders</span>
        <h1 class="page-title">我的订单</h1>
        <p class="page-sub">登录后可以查看与你的姓名、班级、座号匹配的订单。</p>
      </div>
      <div class="login-prompt">
        <div class="prompt-icon">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3.5h10a1 1 0 0 1 1 1V21l-3-1.8L12 21l-3-1.8L6 21V4.5a1 1 0 0 1 1-1Z"/><path d="M9.5 8h5M9.5 11.5h5"/></svg>
        </div>
        <h2>先登录，再查看订单</h2>
        <p>使用下单时的姓名、班级、座号登录，即可看到对应订单的状态与进度。</p>
        <button class="btn btn--primary" type="button" data-login>立即登录</button>
      </div>
    </div>
  `;
}

function bindLoginPrompt(root) {
  const button = root.querySelector('[data-login]');
  const open = () => {
    if (promptOpen) return;
    promptOpen = true;
    openLoginModal({
      reason: '登录后查看你的全部订单',
      onSuccess() {
        promptOpen = false;
        render(root);
      },
      onCancel() {
        promptOpen = false;
      }
    });
  };
  if (button) button.addEventListener('click', open);
  window.setTimeout(open, 180);
}

function orderCardHtml(order) {
  const items = Array.isArray(order.items) ? order.items : [];
  const count = Number(order.itemCount);
  const itemCount = Number.isFinite(count) ? count : items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
  const thumbs = items.slice(0, 3);
  const firstName =
    order.firstProductName || (items[0] && items[0].productName) || '';
  const firstImage = order.firstImage || (items[0] && items[0].imageUrl) || '';
  const names = items.slice(0, 2).map((item) => item.productName || '商品').join('、');
  const status = order.status || 'pending_payment';

  return `
    <article class="order-card">
      <div class="order-card__head">
        <div class="order-no">
          <span class="order-label">订单号</span>
          ${escapeHtml(order.orderNo || '—')}
        </div>
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
          <span class="order-time">${escapeHtml(formatDate(order.createdAt))}</span>
          ${statusBadge(status, order.statusLabel)}
        </div>
      </div>

      <div class="order-card__body">
        <div class="order-thumbs">
          ${thumbs.length
            ? thumbs
                .map(
                  (item) => `
                    <span class="order-thumb">
                      <img src="${escapeHtml(safeImage(item.imageUrl))}" alt="${escapeHtml(item.productName || '商品')}">
                    </span>`
                )
                .join('')
            : `<span class="order-thumb">
                 <img src="${escapeHtml(safeImage(firstImage))}" alt="${escapeHtml(firstName || '订单商品')}">
               </span>`}
          ${items.length > 3 ? `<span class="order-thumb order-thumb--more">+${items.length - 3}</span>` : ''}
        </div>
        <div class="order-meta">
          <strong>${escapeHtml(names || firstName || '订单商品')}</strong>
          <span>共 ${itemCount} 件商品${order.paymentMethod === 'gift' ? ' · 赠货码免支付' : ''}</span>
        </div>
        <div class="order-total">
          <small>订单金额</small>
          <strong>${formatMoney(order.totalAmount)}</strong>
        </div>
      </div>

      <div class="order-card__foot">
        <a class="btn btn--line btn--sm" href="#/order/${encodeURIComponent(order.orderNo)}">查看详情</a>
        ${status === 'pending_payment'
          ? `<a class="btn btn--primary btn--sm" href="#/order/${encodeURIComponent(order.orderNo)}?pay=1">去支付</a>
             <button class="btn btn--ghost btn--sm" type="button" data-cancel-order="${escapeHtml(
               order.orderNo
             )}">取消订单</button>`
          : ''}
        ${status === 'pending_review'
          ? '<span class="badge badge--accent">等待管理员核验</span>'
          : ''}
      </div>
    </article>
  `;
}

function bindCancelActions(root) {
  root.querySelectorAll('[data-cancel-order]').forEach((button) => {
    button.addEventListener('click', async () => {
      const orderNo = button.dataset.cancelOrder;
      const ok = await confirmModal({
        title: '取消订单',
        message: `确定取消订单 <b>${escapeHtml(
          orderNo
        )}</b> 吗？取消后库存会释放，赠货码使用次数也会退回。`,
        confirmText: '取消订单',
        cancelText: '再想想',
        danger: true
      });
      if (!ok) return;
      setBusy(button, true, '取消中…');
      try {
        await api.cancelOrder(orderNo);
        toast('订单已取消', 'success');
        await render(root);
      } catch (err) {
        setBusy(button, false);
        toast((err && err.message) || '取消失败，请稍后重试', 'error');
      }
    });
  });
}

function listHtml(orders) {
  if (!orders.length) {
    return emptyState({
      title: '还没有订单',
      text: '挑一件喜欢的小物，下单后可选择班级配送。',
      action: '<a class="btn btn--primary" href="#/">去逛逛小铺</a>'
    });
  }
  return `<div class="orders-list">${orders.map(orderCardHtml).join('')}</div>`;
}

export async function render(root) {
  const user = getCachedUser();
  if (!user) {
    root.innerHTML = loginPromptHtml();
    bindLoginPrompt(root);
    return;
  }

  root.innerHTML = `
    <div class="container">
      <div class="page-head">
        <span class="page-eyebrow">My Orders</span>
        <h1 class="page-title">我的订单</h1>
        <p class="page-sub">${escapeHtml(user.name || '同学')} · ${escapeHtml(user.className || '—')} · ${escapeHtml(user.seatNo || '—')} 座</p>
      </div>
      <div class="page-loading"><span class="spinner"></span><p>正在整理你的订单…</p></div>
    </div>
  `;

  try {
    const data = await api.getMyOrders();
    const orders = data && Array.isArray(data.orders) ? data.orders : [];

    root.innerHTML = `
      <div class="container">
        <div class="page-head">
          <span class="page-eyebrow">My Orders</span>
          <h1 class="page-title">我的订单
            ${orders.length ? `<span class="count-pill">${orders.length} 单</span>` : ''}
          </h1>
          <p class="page-sub">${escapeHtml(user.name || '同学')} · ${escapeHtml(user.className || '—')} · ${escapeHtml(user.seatNo || '—')} 座 · 仅展示与你身份匹配的订单</p>
        </div>
        ${listHtml(orders)}
      </div>
    `;
    bindCancelActions(root);
  } catch (err) {
    if (err && err.status === 401) {
      root.innerHTML = loginPromptHtml();
      bindLoginPrompt(root);
      return;
    }
    root.innerHTML = `
      <div class="container">
        <div class="page-head">
          <span class="page-eyebrow">My Orders</span>
          <h1 class="page-title">我的订单</h1>
        </div>
        <div class="empty-state">
          <svg class="empty-art" viewBox="0 0 178 150" fill="none" aria-hidden="true">
            <ellipse cx="89" cy="132" rx="58" ry="9" fill="#E9F6F0"/>
            <rect x="50" y="52" width="78" height="64" rx="16" fill="#EAF8F2" stroke="#BFE9D8" stroke-width="2.5"/>
            <path d="M76 52V44a13 13 0 0 1 26 0v8" stroke="#BFE9D8" stroke-width="2.5"/>
            <circle cx="78" cy="82" r="3" fill="#12A67A"/>
            <circle cx="100" cy="82" r="3" fill="#12A67A"/>
            <path d="M80 95c5-5 13-5 18 0" stroke="#12A67A" stroke-width="2.5" stroke-linecap="round"/>
            <path d="m141 40 3 7 7 3-7 3-3 7-3-7-7-3 7-3 3-7Z" fill="#FFC79B"/>
          </svg>
          <h3>订单加载失败</h3>
          <p>${escapeHtml((err && err.message) || '请检查网络后重试')}</p>
          <button class="btn btn--primary" type="button" data-retry>重新加载</button>
        </div>
      </div>
    `;
    const retry = root.querySelector('[data-retry]');
    if (retry) retry.addEventListener('click', () => render(root));
    toast('订单加载失败，请稍后重试', 'error');
  }
}
