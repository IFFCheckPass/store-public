/**
 * 外部生产工作台 #/external
 */
import { api } from '../api.js';
import { escapeHtml, emptyState, safeImage, toast } from '/js/ui.js';
import {
  EXTERNAL_STATUS_LABELS,
  adminBanner,
  canIssue,
  nextActions,
  openTaskStatusModal,
  taskStatusBadge,
  text,
  timelineHtml,
  timeSlotLabel
} from '../shared.js';

const FILTERS = [
  { key: 'all', label: '全部' },
  { key: 'pending', label: '待接单' },
  { key: 'accepted', label: '已接单' },
  { key: 'producing', label: '生产中' },
  { key: 'done', label: '已完成' },
  { key: 'issue', label: '异常' }
];

const state = {
  tasks: [],
  stats: null,
  filter: 'all',
  loading: true,
  error: '',
  open: new Set(),
  seq: 0
};

const bound = new WeakSet();
let currentRoot = null;
let currentCtx = null;

function icon(name) {
  const icons = {
    inbox:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 12.5h3.2l1.6 2.6h5.4l1.6-2.6h3.2"/><path d="M5.5 5.5h13l1.8 7v5.2a1.3 1.3 0 0 1-1.3 1.3H5a1.3 1.3 0 0 1-1.3-1.3V12.5l1.8-7Z"/></svg>',
    hammer:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14.5 5.5 4 4-2 2-4-4 2-2Z"/><path d="m12.5 7.5-7 7 4 4 7-7"/><path d="M4 20l2.5-2.5"/></svg>',
    check:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="m8.2 12.2 2.6 2.6 5-5.2"/></svg>',
    alert:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4.5 21 20H3L12 4.5Z"/><path d="M12 10v4.5M12 17.4v.1"/></svg>'
  };
  return icons[name] || icons.inbox;
}

function num(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function counts() {
  const result = { pending: 0, accepted: 0, producing: 0, done: 0, issue: 0 };
  state.tasks.forEach((task) => {
    if (result[task.status] !== undefined) result[task.status] += 1;
  });
  return result;
}

function skeletonStats() {
  return Array.from({ length: 4 })
    .map(() => '<div class="portal-stat-skeleton" aria-hidden="true"></div>')
    .join('');
}

function pageHtml(role) {
  return `
    ${adminBanner(role)}
    <div class="portal-page-head">
      <div>
        <span class="portal-eyebrow">External Production</span>
        <h1>外部生产工作台</h1>
        <p>按商品明细接单与生产，完成后自动同步到内部打包环节。</p>
      </div>
      <div class="portal-page-head__actions">
        <button class="btn btn--line btn--sm" type="button" data-refresh>刷新任务</button>
      </div>
    </div>

    <div class="portal-stats" data-stats>${skeletonStats()}</div>

    <div class="portal-toolbar">
      <div class="portal-chips" data-chips></div>
      <div class="portal-filter-selects">
        <span class="portal-mini-field">当前共 <b data-total>—</b> 个任务</span>
      </div>
    </div>

    <div data-list>
      <div class="portal-loading"><span class="spinner"></span><p>正在读取生产任务…</p></div>
    </div>
  `;
}

function statsHtml(ctx) {
  const computed = counts();
  const useApiStats = ctx.staff.role === 'prod_external' && state.stats;
  const read = (key, fallback) => (useApiStats ? num(state.stats[key]) : fallback);

  const cards = [
    {
      label: '待接单',
      value: read('pending', computed.pending),
      tone: 'warn',
      icon: 'inbox',
      hint: '等待接单的任务'
    },
    {
      label: '生产中',
      value: read('processing', computed.accepted + computed.producing),
      tone: 'blue',
      icon: 'hammer',
      hint: '已接单与制作中'
    },
    {
      label: '已完成',
      value: read('done', computed.done),
      tone: 'green',
      icon: 'check',
      hint: '生产完成的任务'
    },
    {
      label: '异常',
      value: read('issue', computed.issue),
      tone: 'danger',
      icon: 'alert',
      hint: '需要跟进处理'
    }
  ];

  return cards
    .map(
      (card) => `
        <div class="portal-stat portal-stat--${card.tone}">
          <span class="portal-stat__icon" aria-hidden="true">${icon(card.icon)}</span>
          <div class="portal-stat__body">
            <strong>${card.value}</strong>
            <span>${escapeHtml(card.label)}</span>
          </div>
        </div>
      `
    )
    .join('');
}

function chipsHtml() {
  const computed = counts();
  return FILTERS.map((filter) => {
    const count = filter.key === 'all' ? state.tasks.length : computed[filter.key] || 0;
    const active = state.filter === filter.key ? ' is-active' : '';
    return `<button class="chip${active}" type="button" data-filter="${filter.key}">${escapeHtml(
      filter.label
    )}<span class="chip__count">${count}</span></button>`;
  }).join('');
}

function actionsHtml(task) {
  const actions = nextActions('external', task.status);
  const buttons = actions
    .map(
      (action) => `
        <button class="btn btn--sm ${action.tone === 'primary' ? 'btn--primary' : 'btn--soft'}"
          type="button" data-task-action data-task-id="${task.id}" data-next="${action.status}">
          ${escapeHtml(action.label)}
        </button>`
    )
    .join('');
  const issue = canIssue(task.status)
    ? `<button class="btn btn--sm btn--warn" type="button" data-task-action data-task-id="${task.id}" data-next="issue">上报异常</button>`
    : '';
  if (!buttons && !issue) return '<span class="task-ended">该任务已结束</span>';
  return buttons + issue;
}

function cardHtml(task) {
  const open = state.open.has(task.id);
  const spec = text(task.specName, '');
  const color = text(task.colorName, '');
  const pattern = text(task.patternName, '');
  const quantity = num(task.quantity);
  const events = Array.isArray(task.events) ? task.events : [];

  return `
    <article class="task-card" data-task-id="${task.id}">
      <div class="task-card__top">
        <div class="task-card__order">
          <span>订单号</span>
          <b>${escapeHtml(text(task.orderNo))}</b>
        </div>
        ${taskStatusBadge(task.status, EXTERNAL_STATUS_LABELS)}
      </div>

      <div class="task-card__main">
        <div class="task-thumb">
          <img src="${escapeHtml(safeImage(task.imageUrl))}" alt="${escapeHtml(text(task.productName, '商品'))}" loading="lazy">
        </div>
        <div class="task-info">
          <div class="task-name">${escapeHtml(text(task.productName, '商品'))}</div>
          <div class="task-tags">
            <span class="variant-tag">规格 · ${escapeHtml(spec || '默认')}</span>
            <span class="variant-tag">颜色 · ${escapeHtml(color || '默认')}</span>
            ${pattern ? `<span class="variant-tag">图案 · ${escapeHtml(pattern)}</span>` : ''}
            ${task.isCustom ? '<span class="variant-tag variant-tag--custom">定制</span>' : ''}
          </div>
        </div>
        <div class="task-qty"><strong>×${quantity}</strong>数量</div>
      </div>

      <div class="task-meta">
        <span>下单 <b>${escapeHtml(text(task.createdAt))}</b></span>
        <span>班级 <b>${escapeHtml(text(task.className))}</b></span>
        <span>建议 <b>${escapeHtml(timeSlotLabel(task.timeSlot))}</b></span>
      </div>

      ${task.note ? `<div class="pick-note">备注 <b>${escapeHtml(text(task.note))}</b></div>` : ''}

      <div class="task-actions">
        ${actionsHtml(task)}
        <span class="task-actions__spacer"></span>
        <button class="toggle-events${open ? ' is-open' : ''}" type="button" data-toggle-events="${task.id}" aria-expanded="${open}">
          <span>时间线 ${events.length}</span>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
        </button>
      </div>

      <div class="task-events" data-task-events="${task.id}" ${open ? '' : 'hidden'}>
        ${timelineHtml(events, EXTERNAL_STATUS_LABELS)}
      </div>
    </article>
  `;
}

function listHtml() {
  if (state.loading) {
    return '<div class="portal-loading"><span class="spinner"></span><p>正在读取生产任务…</p></div>';
  }
  if (state.error) {
    return `
      <div class="portal-list-error">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5v.5"/></svg>
        <span>${escapeHtml(state.error)}</span>
        <button class="btn btn--sm btn--line" type="button" data-refresh>重试</button>
      </div>`;
  }

  const filtered =
    state.filter === 'all' ? state.tasks : state.tasks.filter((task) => task.status === state.filter);

  if (filtered.length === 0) {
    if (state.tasks.length === 0) {
      return emptyState({
        title: '暂无生产任务',
        text: '当用户完成支付并通过核验后，需要生产商品的任务会出现在这里。'
      });
    }
    return `<div class="portal-empty"><strong>该状态下暂无任务</strong>切换到其他状态看看，或稍后刷新。</div>`;
  }

  return `<div class="task-grid">${filtered.map((task) => cardHtml(task)).join('')}</div>`;
}

function paint() {
  const root = currentRoot;
  if (!root) return;
  const statEl = root.querySelector('[data-stats]');
  const chipsEl = root.querySelector('[data-chips]');
  const listEl = root.querySelector('[data-list]');
  const totalEl = root.querySelector('[data-total]');

  if (statEl) statEl.innerHTML = statsHtml(currentCtx);
  if (chipsEl) chipsEl.innerHTML = chipsHtml();
  if (listEl) listEl.innerHTML = listHtml();
  if (totalEl) totalEl.textContent = String(state.tasks.length);
}

async function load(ctx, seq) {
  if (seq !== state.seq) return;
  state.loading = true;
  state.error = '';
  paint();

  try {
    const [tasksData, statsData] = await Promise.all([
      api.getTasks({ type: 'external' }),
      api.getStats()
    ]);
    if (seq !== state.seq) return;
    state.tasks = Array.isArray(tasksData && tasksData.tasks) ? tasksData.tasks : [];
    state.stats = statsData || null;
    state.loading = false;
  } catch (err) {
    if (seq !== state.seq) return;
    if (err && err.status === 401) return;
    state.loading = false;
    state.error = (err && err.message) || '任务加载失败，请稍后重试';
  }
  paint();
}

function reload() {
  state.seq += 1;
  const seq = state.seq;
  return load(currentCtx, seq);
}

async function onClick(event) {
  const root = currentRoot;
  if (!root) return;

  const filterBtn = event.target.closest('[data-filter]');
  if (filterBtn) {
    state.filter = filterBtn.dataset.filter;
    paint();
    return;
  }

  const toggleBtn = event.target.closest('[data-toggle-events]');
  if (toggleBtn) {
    const id = Number(toggleBtn.dataset.toggleEvents);
    const panel = root.querySelector(`[data-task-events="${id}"]`);
    if (!panel) return;
    const willOpen = panel.hasAttribute('hidden');
    if (willOpen) {
      panel.removeAttribute('hidden');
      state.open.add(id);
    } else {
      panel.setAttribute('hidden', '');
      state.open.delete(id);
    }
    toggleBtn.classList.toggle('is-open', willOpen);
    toggleBtn.setAttribute('aria-expanded', String(willOpen));
    return;
  }

  const actionBtn = event.target.closest('[data-task-action]');
  if (actionBtn) {
    const task = state.tasks.find((item) => item.id === Number(actionBtn.dataset.taskId));
    if (!task) {
      toast('任务信息已更新，请刷新后重试', 'error');
      return;
    }
    openTaskStatusModal({
      task,
      labels: EXTERNAL_STATUS_LABELS,
      next: actionBtn.dataset.next,
      onDone: reload
    });
    return;
  }

  if (event.target.closest('[data-refresh]')) {
    reload();
  }
}

export function render(root, ctx) {
  currentRoot = root;
  currentCtx = ctx;
  state.filter = 'all';
  state.open = new Set();
  state.loading = true;
  state.error = '';
  const seq = ++state.seq;

  root.innerHTML = pageHtml(ctx.staff.role);

  if (!bound.has(root)) {
    root.addEventListener('click', onClick);
    bound.add(root);
  }

  load(ctx, seq);
}
