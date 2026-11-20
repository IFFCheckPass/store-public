import { getItems, updateQuantity, removeItem, getTotals } from '../cart.js';
import { escapeHtml, safeImage, safeColor, formatMoney, emptyState, toast } from '../ui.js';

function itemHtml(item) {
  const stock = Number(item.stock) || 0;
  const maxed = (stock > 0 && item.quantity >= stock) || item.quantity >= 99;
  return `
    <article class="cart-item" data-key="${escapeHtml(item.key)}">
      <a class="cart-thumb" href="#/product/${encodeURIComponent(item.productId)}" aria-label="${escapeHtml(item.name)}">
        <img src="${escapeHtml(safeImage(item.imageUrl))}" alt="${escapeHtml(item.name)}" loading="lazy">
      </a>
      <div class="cart-info">
        <h3 class="cart-name"><a href="#/product/${encodeURIComponent(item.productId)}">${escapeHtml(item.name)}</a></h3>
        <div class="cart-variant">
          ${item.specName ? `<span class="variant-tag">规格 · ${escapeHtml(item.specName)}</span>` : ''}
          ${item.colorName
            ? `<span class="variant-tag"><i style="background:${escapeHtml(safeColor(item.colorHex))}"></i>${escapeHtml(item.colorName)}</span>`
            : ''}
          ${item.patternName ? `<span class="variant-tag">图案 · ${escapeHtml(item.patternName)}</span>` : ''}
          ${item.isCustom ? '<span class="variant-tag variant-tag--custom">定制</span>' : ''}
        </div>
        <div class="cart-unit">单价 <strong>${formatMoney(item.unitPrice)}</strong></div>
      </div>
      <div class="cart-side">
        <div class="qty qty--sm" role="group" aria-label="数量">
          <button class="qty-btn" type="button" data-act="dec" aria-label="减少数量" ${item.quantity <= 1 ? 'disabled' : ''}>−</button>
          <span class="qty-value">${item.quantity}</span>
          <button class="qty-btn" type="button" data-act="inc" aria-label="增加数量" ${maxed ? 'disabled' : ''}>+</button>
        </div>
        <div class="cart-line-total">${formatMoney(item.unitPrice * item.quantity)}</div>
        <button class="remove-btn" type="button" data-act="remove">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V5h6v2M7 7l1 13h8l1-13"/></svg>
          删除
        </button>
      </div>
    </article>
  `;
}

function summaryHtml() {
  const totals = getTotals();
  return `
    <aside class="summary-card">
      <h3>订单摘要</h3>
      <div class="summary-row"><span>商品件数</span><strong>${totals.quantity} 件</strong></div>
      <div class="summary-row"><span>商品金额</span><strong>${formatMoney(totals.amount)}</strong></div>
      <div class="summary-row"><span>配送费</span><strong>免配送费</strong></div>
      <div class="summary-row summary-row--total">
        <span>合计</span>
        <span class="price"><span class="price__unit">¥</span>${formatMoney(totals.amount).slice(1)}</span>
      </div>
      <div class="summary-actions">
        <a class="btn btn--primary btn--lg btn--block" href="#/checkout">去结算</a>
        <a class="btn btn--ghost btn--block" href="#/">继续逛逛</a>
      </div>
      <p class="summary-note">支持 <b>微信 / 支付宝</b> 扫码支付，也可以使用赠货码直接免支付。下单后可随时查看订单状态。</p>
    </aside>
  `;
}

function listHtml() {
  return `<div class="cart-list">${getItems().map(itemHtml).join('')}</div>`;
}

function bind(root) {
  const list = root.querySelector('.cart-list');
  if (!list) return;

  list.addEventListener('click', (event) => {
    const button = event.target.closest('[data-act]');
    if (!button) return;
    const card = button.closest('[data-key]');
    if (!card) return;
    const key = card.dataset.key;
    const item = getItems().find((entry) => entry.key === key);
    if (!item) return;

    const action = button.dataset.act;
    if (action === 'inc') {
      if (item.quantity >= 99) {
        toast('单件商品最多购买 99 件', 'info');
        return;
      }
      if (item.stock > 0 && item.quantity >= item.stock) {
        toast('已达到当前库存上限', 'info');
        return;
      }
      updateQuantity(key, item.quantity + 1);
      repaint(root);
    } else if (action === 'dec') {
      if (item.quantity <= 1) return;
      updateQuantity(key, item.quantity - 1);
      repaint(root);
    } else if (action === 'remove') {
      removeItem(key);
      toast('已从购物车移除', 'success');
      repaint(root);
    }
  });
}

function repaint(root) {
  const items = getItems();
  const container = root.querySelector('.container');
  if (!container) return;

  if (items.length === 0) {
    container.innerHTML = `
      <div class="page-head">
        <span class="page-eyebrow">Shopping Cart</span>
        <h1 class="page-title">购物车</h1>
      </div>
      ${emptyState({
        title: '购物车还是空的',
        text: '去集市挑几件喜欢的小物吧。',
        action: '<a class="btn btn--primary" href="#/">去逛逛小铺</a>'
      })}
    `;
    return;
  }

  container.innerHTML = `
    <div class="page-head">
      <span class="page-eyebrow">Shopping Cart</span>
      <h1 class="page-title">购物车 <span class="count-pill" data-cart-page-count>${getTotals().quantity} 件</span></h1>
      <p class="page-sub">确认规格与数量后去结算，库存会在下单时确认。</p>
    </div>
    <div class="cart-layout">
      ${listHtml()}
      ${summaryHtml()}
    </div>
  `;
  bind(root);
}

export async function render(root) {
  const items = getItems();

  if (items.length === 0) {
    root.innerHTML = `
      <div class="container">
        <div class="page-head">
          <span class="page-eyebrow">Shopping Cart</span>
          <h1 class="page-title">购物车</h1>
        </div>
        ${emptyState({
          title: '购物车还是空的',
          text: '去集市挑几件喜欢的小物吧。',
          action: '<a class="btn btn--primary" href="#/">去逛逛小铺</a>'
        })}
      </div>
    `;
    return;
  }

  root.innerHTML = `
    <div class="container">
      <div class="page-head">
        <span class="page-eyebrow">Shopping Cart</span>
        <h1 class="page-title">购物车 <span class="count-pill">${getTotals().quantity} 件</span></h1>
        <p class="page-sub">确认规格与数量后去结算，库存会在下单时确认。</p>
      </div>
      <div class="cart-layout">
        ${listHtml()}
        ${summaryHtml()}
      </div>
    </div>
  `;
  bind(root);
}
