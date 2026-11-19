/**
 * 管理端 · 审计日志 #/audit
 */
import { api } from '../api.js';
import { escapeHtml } from '/js/ui.js';
import {
  auditActionKind,
  auditActionLabel,
  emptyBlock,
  errorBlock,
  loadingBlock,
  text
} from '../shared.js';

const ACTOR_TYPE_LABELS = {
  staff: '员工账号',
  user: '用户'
};

const bound = new WeakSet();
let currentRoot = null;
let currentCtx = null;
let currentLogs = [];
const filters = { keyword: '', action: 'all' };

function pageHtml() {
  return `
    <div class="admin-page-head">
      <div class="admin-page-head__text">
        <span class="admin-eyebrow">Audit Logs</span>
        <h1>审计日志</h1>
        <p>记录登录、账号变更、支付核验、赠货码与订单删除等关键操作。</p>
      </div>
      <div class="admin-page-head__actions">
        <button class="btn btn--line" type="button" data-refresh>刷新</button>
      </div>
    </div>
    <div data-audit>${loadingBlock('正在读取审计日志…')}</div>
  `;
}

function actionOptionsHtml() {
  const actions = [...new Set(currentLogs.map((log) => log.action).filter(Boolean))].sort((a, b) =>
    auditActionLabel(a).localeCompare(auditActionLabel(b), 'zh-CN')
  );
  return ['<option value="all">全部动作</option>']
    .concat(
      actions.map(
        (action) =>
          `<option value="${escapeHtml(action)}"${
            filters.action === action ? ' selected' : ''
          }>${escapeHtml(auditActionLabel(action))}</option>`
      )
    )
    .join('');
}

function filteredLogs() {
  const keyword = filters.keyword.trim().toLowerCase();
  return currentLogs.filter((log) => {
    if (filters.action !== 'all' && log.action !== filters.action) return false;
    if (!keyword) return true;
    const haystack = [
      log.actorName,
      log.actorType,
      log.action,
      auditActionLabel(log.action),
      log.detail
    ]
      .map((value) => String(value === undefined || value === null ? '' : value).toLowerCase())
      .join(' ');
    return haystack.includes(keyword);
  });
}

function rowsHtml(logs) {
  if (!logs.length) {
    return '<div class="table-empty"><strong>没有匹配的日志</strong>调整关键词或动作后再试。</div>';
  }
  return `
    <div class="table-wrap">
      <table class="admin-table" style="min-width:880px">
        <thead>
          <tr>
            <th style="width:160px">时间</th>
            <th style="width:150px">操作人</th>
            <th style="width:150px">动作</th>
            <th>详情</th>
          </tr>
        </thead>
        <tbody>
          ${logs
            .map((log) => {
              const kind = auditActionKind(log.action);
              return `
                <tr>
                  <td class="cell-muted cell-nowrap">${escapeHtml(text(log.createdAt))}</td>
                  <td>
                    <span class="audit-actor">${escapeHtml(text(log.actorName))}
                      <small>${escapeHtml(ACTOR_TYPE_LABELS[log.actorType] || text(log.actorType, '系统'))}</small>
                    </span>
                  </td>
                  <td>
                    <span class="audit-action"${kind ? ` data-kind="${kind}"` : ''}>${escapeHtml(
                      auditActionLabel(log.action)
                    )}</span>
                  </td>
                  <td><div class="audit-detail">${escapeHtml(text(log.detail, '—'))}</div></td>
                </tr>
              `;
            })
            .join('')}
        </tbody>
      </table>
    </div>
  `;
}

function paint() {
  const root = currentRoot;
  if (!root) return;
  const container = root.querySelector('[data-audit]');
  if (!container) return;

  if (!currentLogs.length) {
    container.innerHTML = emptyBlock(
      '暂无审计日志',
      '关键操作产生后会自动写入审计日志。',
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5 19 6v5.6c0 4.2-2.9 7.6-7 8.9-4.1-1.3-7-4.7-7-8.9V6l7-2.5Z"/><path d="m9 12 2 2 4-4.2"/></svg>'
    );
    return;
  }

  const logs = filteredLogs();
  container.innerHTML = `
    <div class="table-card">
      <div class="table-toolbar">
        <span class="table-toolbar__count">显示 <b>${logs.length}</b> / ${currentLogs.length} 条日志</span>
        <div class="audit-search">
          <input class="input" type="search" data-audit-keyword placeholder="搜索操作人 / 详情 / 动作" value="${escapeHtml(
            filters.keyword
          )}">
          <select class="select" data-audit-action aria-label="按动作筛选">${actionOptionsHtml()}</select>
          <button class="btn btn--soft" type="button" data-audit-apply>筛选</button>
          <button class="btn btn--ghost" type="button" data-audit-clear>清除</button>
        </div>
      </div>
      <div data-audit-rows>${rowsHtml(logs)}</div>
    </div>
  `;
}

async function load() {
  const root = currentRoot;
  const ctx = currentCtx;
  if (!root || !ctx) return;
  const container = root.querySelector('[data-audit]');
  if (!container) return;

  container.innerHTML = loadingBlock('正在读取审计日志…');
  try {
    const data = await api.auditLogs(200);
    if (!ctx.isCurrent()) return;
    currentLogs = Array.isArray(data && data.logs) ? data.logs : [];
    paint();
  } catch (err) {
    if (!ctx.isCurrent()) return;
    if (err && err.status === 401) return;
    container.innerHTML = errorBlock((err && err.message) || '审计日志加载失败');
  }
}

function applyFilters(root) {
  const keywordInput = root.querySelector('[data-audit-keyword]');
  const actionSelect = root.querySelector('[data-audit-action]');
  filters.keyword = keywordInput ? keywordInput.value : '';
  filters.action = actionSelect ? actionSelect.value : 'all';
  const rows = root.querySelector('[data-audit-rows]');
  const count = root.querySelector('.table-toolbar__count');
  const logs = filteredLogs();
  if (rows) rows.innerHTML = rowsHtml(logs);
  if (count) count.innerHTML = `显示 <b>${logs.length}</b> / ${currentLogs.length} 条日志`;
}

async function onClick(event) {
  const root = currentRoot;
  if (!root) return;

  if (event.target.closest('[data-refresh]') || event.target.closest('[data-retry]')) {
    load();
    return;
  }

  if (event.target.closest('[data-audit-apply]')) {
    applyFilters(root);
    return;
  }

  if (event.target.closest('[data-audit-clear]')) {
    filters.keyword = '';
    filters.action = 'all';
    paint();
  }
}

function onChange(event) {
  const target = event.target;
  if (target.matches('[data-audit-action]')) {
    applyFilters(currentRoot);
  }
}

function onKeydown(event) {
  if (
    event.target.matches('[data-audit-keyword]') &&
    (event.key === 'Enter' || event.key === 'NumpadEnter')
  ) {
    event.preventDefault();
    applyFilters(currentRoot);
  }
}

export function render(root, ctx) {
  currentRoot = root;
  currentCtx = ctx;
  currentLogs = [];
  filters.keyword = '';
  filters.action = 'all';
  root.innerHTML = pageHtml();

  if (!bound.has(root)) {
    root.addEventListener('click', onClick);
    root.addEventListener('change', onChange);
    root.addEventListener('keydown', onKeydown);
    bound.add(root);
  }

  load();
}
