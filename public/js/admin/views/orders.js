/**
 * 管理端 · 订单管理 #/orders
 */
import { api } from '../api.js';
import { escapeHtml } from '/js/ui.js';
import {
  emptyBlock,
  errorBlock,
  loadingBlock,
  orderRowHtml,
  statusOptionsHtml
} from '../shared.js';

const filters = {
  status: '',
  className: '',
  keyword: '',
  from: '',
  to: '',
  includeDeleted: false
};

const bound = new WeakSet();
let currentRoot = null;
let currentCtx = null;

function pageHtml() {
  return `
    <div class="admin-page-head">
      <div class="admin-page-head__text">
        <span class="admin-eyebrow">Orders</span>
        <h1>订单管理</h1>
        <p>按状态、班级、关键词与日期检索全部订单，点击任意一行查看完整链路。</p>
      </div>
      <div class="admin-page-head__actions">
        <button class="btn btn--line" type="button" data-refresh>刷新</button>
      </div>
    </div>

    <form class="filter-card" data-orders-filter>
      <div class="filter-grid">
        <div class="field">
          <label class="field-label" for="order-status">订单状态</label>
          <select class="select" id="order-status" name="status">${statusOptionsHtml(filters.status)}</select>
        </div>
        <div class="field">
          <label class="field-label" for="order-class">班级</label>
          <input class="input" id="order-class" name="className" type="text" placeholder="如 高二(3)班" value="${escapeHtml(
            filters.className
          )}">
        </div>
        <div class="field">
          <label class="field-label" for="order-keyword">关键词</label>
          <input class="input" id="order-keyword" name="keyword" type="text" placeholder="订单号 / 客户 / 联系方式" value="${escapeHtml(
            filters.keyword
          )}">
        </div>
        <div class="field">
          <label class="field-label" for="order-from">开始日期</label>
          <input class="input" id="order-from" name="from" type="date" value="${escapeHtml(filters.from)}">
        </div>
        <div class="field">
          <label class="field-label" for="order-to">结束日期</label>
          <input class="input" id="order-to" name="to" type="date" value="${escapeHtml(filters.to)}">
        </div>
      </div>
      <div class="filter-actions">
        <label class="filter-check">
          <input type="checkbox" name="includeDeleted"${filters.includeDeleted ? ' checked' : ''}>
          包含已删除订单
        </label>
        <button class="btn btn--ghost" type="button" data-reset>重置筛选</button>
        <button class="btn btn--primary" type="submit">查询订单</button>
      </div>
    </form>

    <div data-orders-result>${loadingBlock('正在读取订单…')}</div>
  `;
}

function readForm(form) {
  const data = new FormData(form);
  filters.status = String(data.get('status') || '');
  filters.className = String(data.get('className') || '').trim();
  filters.keyword = String(data.get('keyword') || '').trim();
  filters.from = String(data.get('from') || '');
  filters.to = String(data.get('to') || '');
  filters.includeDeleted = data.get('includeDeleted') === 'on';
}

function resultHtml(orders) {
  if (!orders.length) {
    return emptyBlock(
      '没有匹配的订单',
      '试试调整筛选条件，或包含已删除订单后再查询。',
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4h12a1 1 0 0 1 1 1v15l-3.5-2-3.5 2-3.5-2L5 20V5a1 1 0 0 1 1-1Z"/><path d="M8.5 9h7M8.5 12.5h5"/></svg>'
    );
  }

  return `
    <div class="table-card">
      <div class="table-toolbar">
        <span class="table-toolbar__count">共 <b>${orders.length}</b> 笔订单</span>
        <span class="table-toolbar__count">点击行可查看订单详情</span>
      </div>
      <div class="table-wrap">
        <table class="admin-table">
          <thead>
            <tr>
              <th>订单号</th>
              <th>客户</th>
              <th>班级</th>
              <th>金额</th>
              <th>支付方式</th>
              <th>状态</th>
              <th>下单时间</th>
              <th></th>
            </tr>
          </thead>
          <tbody>${orders.map((order) => orderRowHtml(order)).join('')}</tbody>
        </table>
      </div>
    </div>
  `;
}

async function load() {
  const root = currentRoot;
  const ctx = currentCtx;
  if (!root || !ctx) return;
  const container = root.querySelector('[data-orders-result]');
  if (!container) return;

  container.innerHTML = loadingBlock('正在读取订单…');
  const params = {};
  if (filters.status) params.status = filters.status;
  if (filters.className) params.className = filters.className;
  if (filters.keyword) params.keyword = filters.keyword;
  if (filters.from) params.from = filters.from;
  if (filters.to) params.to = filters.to;
  if (filters.includeDeleted) params.includeDeleted = 1;

  try {
    const data = await api.orders(params);
    if (!ctx.isCurrent()) return;
    const orders = Array.isArray(data && data.orders) ? data.orders : [];
    container.innerHTML = resultHtml(orders);
  } catch (err) {
    if (!ctx.isCurrent()) return;
    if (err && err.status === 401) return;
    container.innerHTML = errorBlock((err && err.message) || '订单加载失败');
  }
}

async function onSubmit(event) {
  if (!event.target.matches('[data-orders-filter]')) return;
  event.preventDefault();
  readForm(event.target);
  load();
}

async function onClick(event) {
  const root = currentRoot;
  if (!root) return;

  if (event.target.closest('[data-reset]')) {
    const form = root.querySelector('[data-orders-filter]');
    filters.status = '';
    filters.className = '';
    filters.keyword = '';
    filters.from = '';
    filters.to = '';
    filters.includeDeleted = false;
    if (form) {
      form.reset();
      const status = form.querySelector('[name="status"]');
      if (status) status.value = '';
    }
    load();
    return;
  }

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
    root.addEventListener('submit', onSubmit);
    root.addEventListener('click', onClick);
    bound.add(root);
  }

  load();
}
