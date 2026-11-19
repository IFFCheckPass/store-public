/**
 * 管理端 · 赠货码 #/gift-codes
 */
import { api } from '../api.js';
import { escapeHtml, toast, openModal, closeModal, setBusy } from '/js/ui.js';
import {
  copyText,
  emptyBlock,
  errorBlock,
  loadingBlock,
  num,
  openConfirmModal,
  text
} from '../shared.js';

const bound = new WeakSet();
let currentRoot = null;
let currentCtx = null;
let currentCodes = [];
let creatorMap = new Map();
let currentProducts = [];
let highlightCode = '';

function isSuper(staff) {
  return staff && staff.role === 'super_admin';
}

function scopeText(gift) {
  const scope = gift.scope;
  if (!scope || scope.type === 'all') return '全场';
  if (scope.type === 'products') {
    const names = (scope.productIds || []).map((id) => {
      const product = currentProducts.find((item) => item.id === id);
      return product ? product.name : `商品#${id}`;
    });
    return `指定商品：${names.join('、') || '—'}`;
  }
  return `指定规格：${(scope.skus || []).length} 个 SKU`;
}

function productCombos(product) {
  const specs = Array.isArray(product.specs) ? product.specs : [];
  const colors = Array.isArray(product.colors) ? product.colors : [];
  const combos = [];
  specs.forEach((spec) => {
    colors.forEach((color) => {
      combos.push({
        productId: product.id,
        productName: product.name,
        specName: spec.name,
        colorName: color.name,
      });
    });
  });
  return combos;
}

function scopeEditorHtml() {
  const productRows = currentProducts
    .map(
      (product) => `
        <label class="check-line">
          <input type="checkbox" data-scope-product value="${product.id}">
          <span>${escapeHtml(product.name)}</span>
        </label>`
    )
    .join('');

  const skuRows = currentProducts
    .flatMap((product) => productCombos(product))
    .map(
      (combo) => `
        <label class="check-line">
          <input type="checkbox" data-scope-sku
            data-product-id="${combo.productId}"
            data-spec="${escapeHtml(combo.specName)}"
            data-color="${escapeHtml(combo.colorName)}">
          <span>${escapeHtml(combo.productName)} · ${escapeHtml(combo.specName)} · ${escapeHtml(combo.colorName)}</span>
        </label>`
    )
    .join('');

  return `
    <div class="field field--full">
      <span class="field-label">适用范围<span class="req">*</span></span>
      <div class="segmented" data-scope-seg>
        <label class="is-active"><input type="radio" name="giftScope" value="all" checked>全场</label>
        <label><input type="radio" name="giftScope" value="products">指定商品</label>
        <label><input type="radio" name="giftScope" value="skus">指定规格</label>
      </div>
      <p class="field-hint">全场：整单免支付；指定商品/规格：仅这些商品免费，其余仍需支付。</p>
    </div>
    <div class="field field--full" data-scope-products hidden>
      <span class="field-label">选择商品</span>
      <div class="scope-check-list">${productRows || '<span class="field-hint">暂无商品，请先在商品管理中创建。</span>'}</div>
    </div>
    <div class="field field--full" data-scope-skus hidden>
      <span class="field-label">选择规格与颜色</span>
      <div class="scope-check-list">${skuRows || '<span class="field-hint">暂无可选规格。</span>'}</div>
    </div>
  `;
}

function isExpired(value) {
  if (!value) return false;
  const date = new Date(String(value).replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return false;
  return date.getTime() < Date.now();
}

function giftState(gift) {
  const active = Number(gift.active) === 1;
  const used = num(gift.usedCount);
  const max = num(gift.maxUses);
  if (!active) return { label: '已停用', dataStatus: 'cancelled' };
  if (isExpired(gift.expiresAt)) return { label: '已过期', dataStatus: 'cancelled' };
  if (used >= max) return { label: '已用尽', dataStatus: 'pending_review' };
  return { label: '启用中', dataStatus: 'completed' };
}

function giftBadge(gift) {
  const state = giftState(gift);
  return `<span class="status-badge status-badge--sm" data-status="${state.dataStatus}">${state.label}</span>`;
}

function pageHtml(staff) {
  const superAdmin = isSuper(staff);
  return `
    <div class="admin-page-head">
      <div class="admin-page-head__text">
        <span class="admin-eyebrow">Gift Codes</span>
        <h1>赠货码</h1>
        <p>生成免支付赠货码，控制使用次数、有效期与启停状态。</p>
      </div>
      <div class="admin-page-head__actions">
        <button class="btn btn--line" type="button" data-refresh>刷新</button>
        ${
          superAdmin
            ? '<button class="btn btn--primary" type="button" data-new-gift>生成赠货码</button>'
            : ''
        }
      </div>
    </div>
    ${
      superAdmin
        ? ''
        : `<div class="readonly-note">
             <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5v.5"/></svg>
             <span><b>只读模式：</b>普通管理员可查看与复制赠货码，生成与启停操作仅限超级管理员。</span>
           </div>`
    }
    <div data-highlight></div>
    <div data-gifts>${loadingBlock('正在读取赠货码…')}</div>
  `;
}

function highlightHtml() {
  if (!highlightCode) return '';
  return `
    <div class="gift-highlight">
      <span class="gift-highlight__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24"><path d="M4 10h16v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-9Z"/><path d="M3 6h18v4H3zM12 6v14"/><path d="M12 6c-2.4 0-4-.9-4-2.1S9.2 2.1 10.2 3c.9.7 1.8 2 1.8 3Zm0 0c2.4 0 4-.9 4-2.1S14.8 2.1 13.8 3c-.9.7-1.8 2-1.8 3Z"/></svg>
      </span>
      <div class="gift-highlight__body">
        <small>新生成的赠货码</small>
        <strong>${escapeHtml(highlightCode)}</strong>
      </div>
      <button class="btn btn--primary" type="button" data-copy-code="${escapeHtml(highlightCode)}">复制赠货码</button>
    </div>
  `;
}

function resultHtml(codes, viewer, creators) {
  if (!codes.length) {
    return emptyBlock(
      '暂无赠货码',
      '生成赠货码后，用户在结算时输入即可跳过支付流程。',
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10h16v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-9Z"/><path d="M3 6h18v4H3zM12 6v14"/></svg>'
    );
  }
  const superAdmin = isSuper(viewer);

  return `
    <div class="table-card">
      <div class="table-toolbar">
        <span class="table-toolbar__count">共 <b>${codes.length}</b> 个赠货码</span>
        <span class="table-toolbar__count">${superAdmin ? '超级管理员可生成与启停' : '只读视图'}</span>
      </div>
      <div class="table-wrap">
        <table class="admin-table" style="min-width:${superAdmin ? '1040px' : '920px'}">
          <thead>
            <tr>
              <th>赠货码</th>
              <th>适用范围</th>
              <th>备注</th>
              <th>使用情况</th>
              <th>有效期</th>
              <th>状态</th>
              <th>创建人 / 时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            ${codes
              .map((gift) => {
                const used = num(gift.usedCount);
                const max = num(gift.maxUses) || 1;
                const percent = Math.min(100, Math.round((used / max) * 100));
                return `
                  <tr data-gift-id="${gift.id}">
                    <td>
                      <span class="code-chip">
                        <b>${escapeHtml(text(gift.code))}</b>
                        <button type="button" data-copy-code="${escapeHtml(text(gift.code, ''))}">
                          <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M15 5H6a1 1 0 0 0-1 1v9"/></svg>
                          复制
                        </button>
                      </span>
                    </td>
                    <td class="cell-muted">${escapeHtml(scopeText(gift))}</td>
                    <td class="cell-muted">${escapeHtml(text(gift.note, '—'))}</td>
                    <td>
                      <div class="usage-line">
                        <span class="usage-line__text"><b>${used}</b> / ${max}</span>
                        <div class="progress ${used >= max ? 'progress--warn' : ''}"><span style="width:${percent}%"></span></div>
                      </div>
                    </td>
                    <td class="cell-muted cell-nowrap">${escapeHtml(text(gift.expiresAt, '长期有效'))}</td>
                    <td>${giftBadge(gift)}</td>
                    <td>
                      <span class="cell-strong">${escapeHtml(text(creators.get(gift.code), '—'))}</span>
                      <span class="cell-sub">${escapeHtml(text(gift.createdAt))}</span>
                    </td>
                    <td class="cell-actions">
                      ${
                        superAdmin
                          ? `<button class="btn btn--sm ${
                              Number(gift.active) === 1 ? 'btn--danger' : 'btn--soft'
                            }" type="button" data-gift-toggle="${gift.id}">${
                              Number(gift.active) === 1 ? '停用' : '启用'
                            }</button>`
                          : '<span class="cell-muted">—</span>'
                      }
                    </td>
                  </tr>
                `;
              })
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
  const container = root.querySelector('[data-gifts]');
  const highlightEl = root.querySelector('[data-highlight]');
  if (!container) return;

  if (highlightEl) highlightEl.innerHTML = highlightHtml();
  container.innerHTML = loadingBlock('正在读取赠货码…');
  try {
    const [data, auditData, productData] = await Promise.all([
      api.giftCodes(),
      api.auditLogs(200).catch(() => null),
      api.products().catch(() => null)
    ]);
    if (!ctx.isCurrent()) return;
    currentCodes = Array.isArray(data && data.giftCodes) ? data.giftCodes : [];
    currentProducts = Array.isArray(productData && productData.products) ? productData.products : [];

    creatorMap = new Map();
    const logs = auditData && Array.isArray(auditData.logs) ? auditData.logs : [];
    logs.forEach((log) => {
      if (!log || log.action !== 'gift_code.create') return;
      const match = String(log.detail || '').match(/赠货码\s+([A-Za-z0-9-]+)/);
      if (match) creatorMap.set(match[1].toUpperCase(), log.actorName);
    });

    container.innerHTML = resultHtml(currentCodes, ctx.staff, creatorMap);
  } catch (err) {
    if (!ctx.isCurrent()) return;
    if (err && err.status === 401) return;
    container.innerHTML = errorBlock((err && err.message) || '赠货码加载失败');
  }
}

function openCreateGift() {
  const handle = openModal({
    title: '生成赠货码',
    eyebrow: 'Gift Code',
    sub: '赠货码会自动生成，可直接复制发给用户。',
    body: `
      <div class="form-modal">
        <div class="form-grid">
          ${scopeEditorHtml()}
          <div class="field field--full">
            <label class="field-label" for="gift-note">备注</label>
            <input class="input" id="gift-note" type="text" maxlength="100" placeholder="例如：开学季活动赠货码">
            <p class="field-hint">备注仅管理端可见，便于区分活动来源。</p>
          </div>
          <div class="field">
            <label class="field-label" for="gift-max-uses">使用次数<span class="req">*</span></label>
            <input class="input" id="gift-max-uses" type="number" min="1" max="10000" step="1" value="1">
            <p class="field-hint">1-10000 次。</p>
          </div>
          <div class="field">
            <label class="field-label" for="gift-expires">有效期<span class="opt">选填</span></label>
            <input class="input" id="gift-expires" type="datetime-local">
            <p class="field-hint">留空表示长期有效。</p>
          </div>
        </div>
        <div data-modal-error class="form-modal__error"></div>
      </div>
    `,
    footer: `
      <button class="btn btn--ghost" type="button" data-cancel>取消</button>
      <button class="btn btn--primary" type="button" data-confirm>生成赠货码</button>
    `
  });
  if (!handle) return;

  const errorBox = handle.body.querySelector('[data-modal-error]');
  const noteInput = handle.body.querySelector('#gift-note');
  const maxInput = handle.body.querySelector('#gift-max-uses');
  const expiresInput = handle.body.querySelector('#gift-expires');
  const cancelBtn = handle.foot.querySelector('[data-cancel]');
  const confirmBtn = handle.foot.querySelector('[data-confirm]');
  const scopeSeg = handle.body.querySelector('[data-scope-seg]');
  const scopeProducts = handle.body.querySelector('[data-scope-products]');
  const scopeSkus = handle.body.querySelector('[data-scope-skus]');

  const syncScope = () => {
    const type = handle.body.querySelector('[name="giftScope"]:checked').value;
    if (scopeProducts) scopeProducts.hidden = type !== 'products';
    if (scopeSkus) scopeSkus.hidden = type !== 'skus';
    if (scopeSeg) {
      scopeSeg.querySelectorAll('label').forEach((label) => {
        const input = label.querySelector('input');
        label.classList.toggle('is-active', !!(input && input.checked));
      });
    }
  };
  handle.body.querySelectorAll('[name="giftScope"]').forEach((radio) => {
    radio.addEventListener('change', syncScope);
  });
  syncScope();

  const showError = (message) => {
    errorBox.innerHTML = `<div class="admin-alert admin-alert--error"><span>${escapeHtml(
      message
    )}</span></div>`;
  };

  if (cancelBtn) cancelBtn.addEventListener('click', () => closeModal());
  window.setTimeout(() => noteInput && noteInput.focus(), 70);

  if (confirmBtn) {
    confirmBtn.addEventListener('click', async () => {
      const maxUses = Number(maxInput.value);
      if (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > 10000) {
        showError('使用次数需为 1-10000 的整数');
        return;
      }
      const expiresAt = expiresInput.value ? expiresInput.value : '';
      if (expiresAt && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(expiresAt)) {
        showError('有效期格式不正确');
        return;
      }

      const scopeType = handle.body.querySelector('[name="giftScope"]:checked').value;
      const productIds = Array.from(
        handle.body.querySelectorAll('[data-scope-product]:checked')
      ).map((input) => Number(input.value));
      const skus = Array.from(handle.body.querySelectorAll('[data-scope-sku]:checked')).map(
        (input) => ({
          productId: Number(input.dataset.productId),
          specName: input.dataset.spec,
          colorName: input.dataset.color
        })
      );
      if (scopeType === 'products' && !productIds.length) {
        showError('请选择至少一个适用商品');
        return;
      }
      if (scopeType === 'skus' && !skus.length) {
        showError('请选择至少一个适用规格');
        return;
      }

      setBusy(confirmBtn, true, '生成中…');
      try {
        const payload = {
          note: noteInput.value.trim(),
          maxUses,
          scopeType
        };
        if (scopeType === 'products') payload.productIds = productIds;
        if (scopeType === 'skus') payload.skus = skus;
        if (expiresAt) payload.expiresAt = expiresAt;
        const data = await api.createGiftCode(payload);
        const gift = data && data.giftCode ? data.giftCode : null;
        highlightCode = gift && gift.code ? gift.code : '';
        toast('赠货码已生成', 'success');
        closeModal();
        await load();
      } catch (err) {
        setBusy(confirmBtn, false);
        if (err && err.status === 401) {
          closeModal();
          return;
        }
        showError((err && err.message) || '生成失败，请稍后重试');
      }
    });
  }
}

function openToggle(gift) {
  const active = Number(gift.active) === 1;
  openConfirmModal({
    title: active ? '停用该赠货码？' : '启用该赠货码？',
    eyebrow: `赠货码 ${gift.code}`,
    message: active
      ? '停用后用户将无法使用该赠货码下单，已核销的订单不受影响。'
      : '启用后用户可继续使用该赠货码，仍需满足次数与有效期限制。',
    confirmText: active ? '确认停用' : '确认启用',
    danger: active,
    onConfirm: async () => {
      await api.updateGiftCode(gift.id, active ? 0 : 1);
      toast(active ? '赠货码已停用' : '赠货码已启用', 'success');
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

  const copyBtn = event.target.closest('[data-copy-code]');
  if (copyBtn) {
    const ok = await copyText(copyBtn.dataset.copyCode);
    toast(ok ? '赠货码已复制' : '复制失败，请手动选择', ok ? 'success' : 'info');
    return;
  }

  if (event.target.closest('[data-new-gift]')) {
    openCreateGift();
    return;
  }

  const toggleBtn = event.target.closest('[data-gift-toggle]');
  if (toggleBtn) {
    const gift = currentCodes.find((item) => item.id === Number(toggleBtn.dataset.giftToggle));
    if (!gift) {
      toast('赠货码信息已更新，请刷新后重试', 'error');
      return;
    }
    openToggle(gift);
  }
}

export function render(root, ctx) {
  currentRoot = root;
  currentCtx = ctx;
  currentCodes = [];
  creatorMap = new Map();
  highlightCode = '';
  root.innerHTML = pageHtml(ctx.staff);

  if (!bound.has(root)) {
    root.addEventListener('click', onClick);
    bound.add(root);
  }

  load();
}
