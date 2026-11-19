/**
 * 管理端 · 仪表盘 #/dashboard
 */
import { api } from '../api.js';
import { escapeHtml } from '/js/ui.js';
import {
  emptyBlock,
  errorBlock,
  loadingBlock,
  money,
  num,
  orderRowHtml
} from '../shared.js';

const bound = new WeakSet();
let currentRoot = null;
let currentCtx = null;

function metricIcon(name) {
  const icons = {
    orders:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4h12a1 1 0 0 1 1 1v15l-3.5-2-3.5 2-3.5-2L5 20V5a1 1 0 0 1 1-1Z"/><path d="M8.5 9h7M8.5 12.5h5"/></svg>',
    today:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5.5" width="16" height="14" rx="2"/><path d="M4 10h16M8.5 4v3M15.5 4v3"/></svg>',
    revenue:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4.5v15M15.5 7.5c-.7-1-1.9-1.6-3.5-1.6-2 0-3.5 1-3.5 2.6 0 3.7 7 1.7 7 5.4 0 1.7-1.5 2.8-3.5 2.8-1.6 0-3-.7-3.7-1.8"/></svg>',
    review:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v5l3 1.8"/></svg>',
    producing:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14.5 5.5 4 4-2 2-4-4 2-2Z"/><path d="m12.5 7.5-7 7 4 4 7-7"/><path d="M4 20l2.5-2.5"/></svg>',
    delivering:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 6.5h10v9h-10z"/><path d="M13.5 10h3.4l3 3.2v2.3h-6.4z"/><circle cx="7" cy="17.5" r="1.6"/><circle cx="17" cy="17.5" r="1.6"/></svg>',
    completed:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="m8.2 12.2 2.6 2.6 5-5.2"/></svg>',
    accounts:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8.5" r="3"/><path d="M3.5 19.5c.5-3.2 2.8-5 5.5-5s5 1.8 5.5 5"/><path d="M15.5 5.5a3 3 0 0 1 0 6"/></svg>',
    deletion:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M9 7V4.5h6V7M6.5 7l.8 12a1.5 1.5 0 0 0 1.5 1.4h6.4a1.5 1.5 0 0 0 1.5-1.4l.8-12"/><path d="M10 11v5M14 11v5"/></svg>',
    gift:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10h16v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-9Z"/><path d="M3 6h18v4H3zM12 6v14"/><path d="M12 6c-2.4 0-4-.9-4-2.1S9.2 2.1 10.2 3c.9.7 1.8 2 1.8 3Zm0 0c2.4 0 4-.9 4-2.1S14.8 2.1 13.8 3c-.9.7-1.8 2-1.8 3Z"/></svg>',
    audit:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5 19 6v5.6c0 4.2-2.9 7.6-7 8.9-4.1-1.3-7-4.7-7-8.9V6l7-2.5Z"/><path d="m9 12 2 2 4-4.2"/></svg>'
  };
  return icons[name] || icons.orders;
}

function pageHtml() {
  return `
    <div class="admin-page-head">
      <div class="admin-page-head__text">
        <span class="admin-eyebrow">Dashboard</span>
        <h1>仪表盘</h1>
        <p>掌握订单、收款与生产配送的整体进度。</p>
      </div>
      <div class="admin-page-head__actions">
        <button class="btn btn--line" type="button" data-refresh>刷新数据</button>
        <a class="btn btn--primary" href="#/orders">订单管理</a>
      </div>
    </div>
    <div data-dashboard>${loadingBlock('正在汇总经营数据…')}</div>
  `;
}

function metricCard(card) {
  return `
    <div class="metric-card metric-card--${card.tone}">
      <div class="metric-card__label">${metricIcon(card.icon)}${escapeHtml(card.label)}</div>
      <div class="metric-card__value">${card.value}</div>
      <div class="metric-card__hint">${escapeHtml(card.hint || '')}</div>
    </div>
  `;
}

function quickCard(href, icon, title, hint, tone = '') {
  return `
    <a class="quick-card${tone ? ` quick-card--${tone}` : ''}" href="${href}">
      <span class="quick-card__icon" aria-hidden="true">${metricIcon(icon)}</span>
      <span class="quick-card__body">
        <strong>${escapeHtml(title)}</strong>
        <small>${escapeHtml(hint)}</small>
      </span>
    </a>
  `;
}

function bodyHtml(overview, orders) {
  const metrics = [
    { label: '订单总数', value: num(overview.ordersTotal), hint: '未删除订单', tone: 'green', icon: 'orders' },
    { label: '今日订单', value: num(overview.todayOrders), hint: '今日新增', tone: 'green', icon: 'today' },
    { label: '营收', value: money(overview.revenue), hint: '已付款及后续状态', tone: 'green', icon: 'revenue' },
    { label: '待核验', value: num(overview.pendingReview), hint: '等待收款核验', tone: 'warn', icon: 'review' },
    { label: '生产中', value: num(overview.producing), hint: '外部生产进行中', tone: 'blue', icon: 'producing' },
    { label: '配送中', value: num(overview.delivering), hint: '正在配送', tone: 'purple', icon: 'delivering' },
    { label: '已完成', value: num(overview.completed), hint: '已送达完成', tone: 'green', icon: 'completed' },
    { label: '账号数', value: num(overview.accounts), hint: '生产与管理账号', tone: 'neutral', icon: 'accounts' },
    {
      label: '待审批删除',
      value: num(overview.pendingDeletions),
      hint: '需两位超管确认',
      tone: 'danger',
      icon: 'deletion'
    }
  ];

  const latest = Array.isArray(orders) ? orders.slice(0, 8) : [];

  return `
    <div class="metric-grid">${metrics.map(metricCard).join('')}</div>

    <div class="section-card">
      <div class="section-card__head">
        <h2>快捷入口</h2>
        <span class="hint">常用运营操作</span>
      </div>
      <div class="quick-grid">
        ${quickCard('#/orders', 'orders', '订单管理', '筛选与查看订单全链路', '')}
        ${quickCard('#/payments', 'review', '收款核验', `${num(overview.pendingReview)} 笔待处理`, 'warn')}
        ${quickCard('#/deletions', 'deletion', '删除审批', `${num(overview.pendingDeletions)} 个待审批`, 'danger')}
        ${quickCard('#/gift-codes', 'gift', '赠货码', '生成与启停控制', '')}
        ${quickCard('#/accounts', 'accounts', '账号管理', '角色与启停维护', 'blue')}
        ${quickCard('#/audit', 'audit', '审计日志', '关键操作记录', '')}
      </div>
    </div>

    <div class="section-card">
      <div class="section-card__head">
        <h2>最新订单</h2>
        <a class="section-link" href="#/orders">查看全部订单
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 6.5 18.5 12 13 17.5"/></svg>
        </a>
      </div>
      ${
        latest.length
          ? `<div class="table-wrap">
               <table class="admin-table">
                 <thead>
                   <tr>
                     <th>订单号</th><th>客户</th><th>班级</th><th>金额</th>
                     <th>支付方式</th><th>状态</th><th>下单时间</th><th></th>
                   </tr>
                 </thead>
                 <tbody>${latest.map((order) => orderRowHtml(order)).join('')}</tbody>
               </table>
             </div>`
          : emptyBlock('还没有订单', '用户完成下单后，最新的 8 笔订单会显示在这里。')
      }
    </div>
  `;
}

async function load() {
  const root = currentRoot;
  const ctx = currentCtx;
  if (!root || !ctx) return;
  const container = root.querySelector('[data-dashboard]');
  if (!container) return;

  container.innerHTML = loadingBlock('正在汇总经营数据…');
  try {
    const [overview, ordersData] = await Promise.all([api.overview(), api.orders()]);
    if (!ctx.isCurrent()) return;
    const orders = Array.isArray(ordersData && ordersData.orders) ? ordersData.orders : [];
    container.innerHTML = bodyHtml(overview || {}, orders);
  } catch (err) {
    if (!ctx.isCurrent()) return;
    if (err && err.status === 401) return;
    container.innerHTML = errorBlock((err && err.message) || '经营数据加载失败');
  }
}

async function onClick(event) {
  const root = currentRoot;
  if (!root) return;

  if (event.target.closest('[data-refresh]') || event.target.closest('[data-retry]')) {
    load();
    return;
  }

  const row = event.target.closest('[data-order-no]');
  if (row) {
    window.location.hash = `#/order/${encodeURIComponent(row.dataset.orderNo)}`;
  }
}

export function render(root, ctx) {
  currentRoot = root;
  currentCtx = ctx;
  root.innerHTML = pageHtml();

  if (!bound.has(root)) {
    root.addEventListener('click', onClick);
    bound.add(root);
  }

  load();
}
