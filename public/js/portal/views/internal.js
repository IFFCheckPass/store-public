/**
 * 内部打包配送工作台 #/internal
 */
import { api } from '../api.js';
import { classSortValue } from '/js/class-name.js';
import { escapeHtml, emptyState, safeImage, toast } from '/js/ui.js';
import {
  CONTACT_LABELS,
  DELIVERY_LABELS,
  INTERNAL_STATUS_LABELS,
  adminBanner,
  canIssue,
  contactIcon,
  copyText,
  internalItems,
  nextActions,
  openTaskStatusModal,
  taskStatusBadge,
  text,
  timelineHtml,
  timeSlotLabel
} from '../shared.js';

const STATUS_KEYS = ['pending_pack', 'packing', 'packed', 'delivering', 'delivered', 'issue'];

const state = {
  tasks: [],
  status: 'all',
  className: 'all',
  slot: 'all',
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
    box:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 8 12 4l7.5 4v8L12 20l-7.5-4V8Z"/><path d="M4.8 8.2 12 12l7.2-3.8M12 12v8"/></svg>',
    pack:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8h14v11H5z"/><path d="M8 8V6.5A2.5 2.5 0 0 1 10.5 4h3A2.5 2.5 0 0 1 16 6.5V8M9 12h6"/></svg>',
    check:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="m8.2 12.2 2.6 2.6 5-5.2"/></svg>',
    truck:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 6.5h10v9h-10z"/><path d="M13.5 10h3.4l3 3.2v2.3h-6.4z"/><circle cx="7" cy="17.5" r="1.6"/><circle cx="17" cy="17.5" r="1.6"/></svg>',
    pin:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s6-5.2 6-9.5a6 6 0 1 0-12 0C6 14.8 12 20 12 20Z"/><circle cx="12" cy="10.3" r="2.1"/></svg>',
    phone:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 4.5h2.6l1.2 3.2-1.6 1.3a11 11 0 0 0 5.7 5.7l1.3-1.6 3.2 1.2v2.6a1.7 1.7 0 0 1-1.9 1.7C10.3 18 6 13.7 4.9 6.4a1.7 1.7 0 0 1 1.7-1.9Z"/></svg>',
    alert:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4.5 21 20H3L12 4.5Z"/><path d="M12 10v4.5M12 17.4v.1"/></svg>'
  };
  return icons[name] || icons.box;
}

function num(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function counts() {
  const result = {};
  STATUS_KEYS.forEach((key) => {
    result[key] = 0;
  });
  state.tasks.forEach((task) => {
    if (result[task.status] !== undefined) result[task.status] += 1;
  });
  return result;
}

function skeletonStats() {
  return Array.from({ length: 6 })
    .map(() => '<div class="portal-stat-skeleton" aria-hidden="true"></div>')
    .join('');
}

function uniqueClasses() {
  // 按「年段 -> 班号」排序，而不是字符串比较（否则“高二”会排到“高一”前面）
  return [...new Set(state.tasks.map((task) => text(task.className, '')).filter(Boolean))].sort(
    (a, b) => classSortValue(a) - classSortValue(b)
  );
}

function pageHtml(role) {
  return `
    ${adminBanner(role)}
    <div class="portal-page-head">
      <div>
        <span class="portal-eyebrow">Packing & Delivery</span>
        <h1>内部打包配送工作台</h1>
        <p>按订单清点商品、打包并配送到班，班级与时间段优先展示。</p>
      </div>
      <div class="portal-page-head__actions">
        <button class="btn btn--line btn--sm" type="button" data-refresh>刷新任务</button>
      </div>
    </div>

    <div class="portal-stats portal-stats--six" data-stats>${skeletonStats()}</div>

    <div class="portal-toolbar">
      <div class="portal-chips" data-chips></div>
      <div class="portal-filter-selects" data-filters>
        <span class="portal-mini-field">班级
          <select class="select" data-filter-class aria-label="按班级筛选"><option value="all">全部班级</option></select>
        </span>
        <span class="portal-mini-field">时间段
          <select class="select" data-filter-slot aria-label="按时间段筛选">
            <option value="all">全部时段</option>
            <option value="day_break">白天场</option>
            <option value="noon">午间</option>
            <option value="evening">傍晚</option>
            <option value="evening_study">晚自习间</option>
          </select>
        </span>
      </div>
    </div>

    <div data-list>
      <div class="portal-loading"><span class="spinner"></span><p>正在读取打包任务…</p></div>
    </div>
  `;
}

function statsHtml() {
  const computed = counts();
  const cards = [
    { key: 'pending_pack', label: '待打包', tone: 'warn', icon: 'box' },
    { key: 'packing', label: '打包中', tone: 'blue', icon: 'pack' },
    { key: 'packed', label: '已打包', tone: 'green', icon: 'check' },
    { key: 'delivering', label: '配送中', tone: 'purple', icon: 'truck' },
    { key: 'delivered', label: '已送达', tone: 'green', icon: 'pin' },
    { key: 'issue', label: '异常', tone: 'danger', icon: 'alert' }
  ];

  return cards
    .map(
      (card) => `
        <div class="portal-stat portal-stat--${card.tone}">
          <span class="portal-stat__icon" aria-hidden="true">${icon(card.icon)}</span>
          <div class="portal-stat__body">
            <strong>${computed[card.key]}</strong>
            <span>${escapeHtml(card.label)}</span>
          </div>
        </div>
      `
    )
    .join('');
}

function chipsHtml() {
  const computed = counts();
  const defs = [{ key: 'all', label: '全部' }].concat(
    STATUS_KEYS.map((key) => ({ key, label: INTERNAL_STATUS_LABELS[key] }))
  );
  return defs
    .map((item) => {
      const count = item.key === 'all' ? state.tasks.length : computed[item.key] || 0;
      const active = state.status === item.key ? ' is-active' : '';
      return `<button class="chip${active}" type="button" data-status-filter="${item.key}">${escapeHtml(
        item.label
      )}<span class="chip__count">${count}</span></button>`;
    })
    .join('');
}

function classOptionsHtml() {
  const classes = uniqueClasses();
  const options = ['<option value="all">全部班级</option>']
    .concat(
      classes.map(
        (name) =>
          `<option value="${escapeHtml(name)}"${state.className === name ? ' selected' : ''}>${escapeHtml(
            name
          )}</option>`
      )
    )
    .join('');
  return options;
}

function actionsHtml(task) {
  const actions = nextActions('internal', task.status);
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

function contactHtml(task) {
  const ctype = task.contactType;
  const value = text(task.contactValue, '');
  const label = CONTACT_LABELS[ctype] || '联系';
  const tel = ctype === 'phone' && value ? `<a class="pick-contact__btn" href="tel:${escapeHtml(value)}" title="拨打电话">${icon(
    'phone'
  )}<span>拨号</span></a>` : '';
  return `
    <div class="pick-contact">
      ${contactIcon(ctype)}
      <span class="pick-contact__value">${escapeHtml(label)} · ${escapeHtml(value || '未填写')}</span>
      <div class="pick-contact__actions">
        ${
          value
            ? `<button class="pick-contact__btn" type="button" data-copy-contact="${escapeHtml(
                value
              )}" title="复制联系方式"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M15 5H6a1 1 0 0 0-1 1v9"/></svg><span>复制</span></button>`
            : ''
        }
        ${tel}
      </div>
    </div>
  `;
}

function itemsHtml(task) {
  const items = internalItems(task);
  if (!items.length) return '<p class="field-hint">暂无商品明细。</p>';
  return `
    <div class="pick-items">
      ${items
        .map((item) => {
          const variant = [item.spec, item.color].filter(Boolean).join(' · ');
          return `
            <div class="pick-item">
              <img src="${escapeHtml(safeImage(item.imageUrl || task.imageUrl))}" alt="${escapeHtml(
                item.name
              )}" loading="lazy">
              <div>
                <div class="pick-item__name">${escapeHtml(item.name)}</div>
                <div class="pick-item__variant">${escapeHtml(variant || '默认规格')}</div>
              </div>
              <div class="pick-item__qty">${item.quantity ? `×${item.quantity}` : '—'}</div>
            </div>`;
        })
        .join('')}
    </div>
  `;
}

function personKey(task) {
  return `${text(task.customerName, '')}|${text(task.className, '')}|${text(task.seatNo, '')}`;
}

function personGroups(tasks) {
  const groups = new Map();
  tasks.forEach((task) => {
    const key = personKey(task);
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        customerName: task.customerName,
        className: task.className,
        seatNo: task.seatNo,
        contactType: task.contactType,
        contactValue: task.contactValue,
        tasks: []
      });
    }
    groups.get(key).tasks.push(task);
  });
  // 分类规律：年段（高一→高二→高三）→ 班级号 → 用户姓名 → 座号
  return Array.from(groups.values()).sort((a, b) => {
    const classCompare = classSortValue(a.className) - classSortValue(b.className);
    if (classCompare !== 0) return classCompare;
    const nameCompare = text(a.customerName, '').localeCompare(text(b.customerName, ''), 'zh-CN');
    if (nameCompare !== 0) return nameCompare;
    return text(a.seatNo, '').localeCompare(text(b.seatNo, ''), 'zh-CN', { numeric: true });
  });
}

function orderCardHtml(task) {
  const open = state.open.has(task.id);
  const events = Array.isArray(task.events) ? task.events : [];
  const delivery = DELIVERY_LABELS[task.deliveryMethod] || text(task.deliveryMethod, '配送');
  const detail = text(task.deliveryDetail, '');

  return `
    <article class="person-order" data-task-id="${task.id}">
      <div class="person-order__head">
        <span class="order-no"><b>${escapeHtml(text(task.orderNo))}</b></span>
        <span class="person-order__delivery">${escapeHtml(delivery)}${detail ? ` · ${escapeHtml(detail)}` : ''}</span>
        <span class="pick-slot"><small>建议时段</small>${escapeHtml(timeSlotLabel(task.timeSlot))}</span>
        ${taskStatusBadge(task.status, INTERNAL_STATUS_LABELS)}
      </div>

      ${itemsHtml(task)}

      ${task.note ? `<div class="pick-note">任务备注 <b>${escapeHtml(text(task.note))}</b></div>` : ''}

      <div class="pick-foot">
        ${actionsHtml(task)}
        <span class="task-actions__spacer"></span>
        <button class="toggle-events${open ? ' is-open' : ''}" type="button" data-toggle-events="${task.id}" aria-expanded="${open}">
          <span>时间线 ${events.length}</span>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
        </button>
      </div>

      <div class="task-events" data-task-events="${task.id}" ${open ? '' : 'hidden'}>
        ${timelineHtml(events, INTERNAL_STATUS_LABELS)}
      </div>
    </article>
  `;
}

function personGroupHtml(group) {
  const totalQuantity = group.tasks.reduce((sum, task) => sum + (Number(task.quantity) || 0), 0);
  const name = text(group.customerName, '未填写姓名');
  const className = text(group.className, '未填写班级');
  const seat = group.seatNo ? `${group.seatNo} 座` : '座号未填';
  return `
    <section class="person-group" data-person-key="${escapeHtml(group.key)}">
      <header class="person-head">
        <div class="person-identity">
          <span class="person-avatar" aria-hidden="true">${escapeHtml(name.slice(0, 1))}</span>
          <div class="person-identity__text">
            <strong>${escapeHtml(name)}</strong>
            <small>${escapeHtml(className)} · ${escapeHtml(seat)} · ${group.tasks.length} 单 / ${totalQuantity} 件</small>
          </div>
        </div>
        <div class="person-head__right">
          ${contactHtml(group.tasks[0])}
        </div>
      </header>
      <div class="person-orders">
        ${group.tasks.map(orderCardHtml).join('')}
      </div>
    </section>
  `;
}

function filteredTasks() {
  return state.tasks.filter((task) => {
    if (state.status !== 'all' && task.status !== state.status) return false;
    if (state.className !== 'all' && text(task.className, '') !== state.className) return false;
    if (state.slot !== 'all' && task.timeSlot !== state.slot) return false;
    return true;
  });
}

function listHtml() {
  if (state.loading) {
    return '<div class="portal-loading"><span class="spinner"></span><p>正在读取打包任务…</p></div>';
  }
  if (state.error) {
    return `
      <div class="portal-list-error">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5v.5"/></svg>
        <span>${escapeHtml(state.error)}</span>
        <button class="btn btn--sm btn--line" type="button" data-refresh>重试</button>
      </div>`;
  }

  const list = filteredTasks();
  if (list.length === 0) {
    if (state.tasks.length === 0) {
      return emptyState({
        title: '暂无打包配送任务',
        text: '订单支付核验通过后会自动生成内部打包任务，在这里完成打包与送达。'
      });
    }
    return `<div class="portal-empty"><strong>没有符合条件的任务</strong>调整班级、时间段或状态筛选后再试试。</div>`;
  }

  return `<div class="person-list">${personGroups(list).map(personGroupHtml).join('')}</div>`;
}

function paint() {
  const root = currentRoot;
  if (!root) return;
  const statEl = root.querySelector('[data-stats]');
  const chipsEl = root.querySelector('[data-chips]');
  const listEl = root.querySelector('[data-list]');
  const classSelect = root.querySelector('[data-filter-class]');

  if (statEl) statEl.innerHTML = statsHtml();
  if (chipsEl) chipsEl.innerHTML = chipsHtml();
  if (listEl) listEl.innerHTML = listHtml();

  if (classSelect) {
    const classes = uniqueClasses();
    if (state.className !== 'all' && !classes.includes(state.className)) {
      state.className = 'all';
    }
    classSelect.innerHTML = classOptionsHtml();
    classSelect.value = state.className;
  }
}

async function load(ctx, seq) {
  if (seq !== state.seq) return;
  state.loading = true;
  state.error = '';
  paint();

  try {
    const data = await api.getTasks({ type: 'internal' });
    if (seq !== state.seq) return;
    state.tasks = Array.isArray(data && data.tasks) ? data.tasks : [];
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
  return load(currentCtx, state.seq);
}

async function onClick(event) {
  const root = currentRoot;
  if (!root) return;

  const chip = event.target.closest('[data-status-filter]');
  if (chip) {
    state.status = chip.dataset.statusFilter;
    paint();
    return;
  }

  const copyBtn = event.target.closest('[data-copy-contact]');
  if (copyBtn) {
    const ok = await copyText(copyBtn.dataset.copyContact);
    toast(ok ? '联系方式已复制' : '复制失败，请手动选择文本', ok ? 'success' : 'info');
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
      labels: INTERNAL_STATUS_LABELS,
      next: actionBtn.dataset.next,
      onDone: reload
    });
    return;
  }

  if (event.target.closest('[data-refresh]')) {
    reload();
  }
}

function onChange(event) {
  const target = event.target;
  if (target.matches('[data-filter-class]')) {
    state.className = target.value;
    paint();
  } else if (target.matches('[data-filter-slot]')) {
    state.slot = target.value;
    paint();
  }
}

export function render(root, ctx) {
  currentRoot = root;
  currentCtx = ctx;
  state.status = 'all';
  state.className = 'all';
  state.slot = 'all';
  state.open = new Set();
  state.loading = true;
  state.error = '';
  const seq = ++state.seq;

  root.innerHTML = pageHtml(ctx.staff.role);

  if (!bound.has(root)) {
    root.addEventListener('click', onClick);
    root.addEventListener('change', onChange);
    bound.add(root);
  }

  load(ctx, seq);
}
