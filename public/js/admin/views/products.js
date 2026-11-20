/**
 * 管理端 · 商品管理 #/products
 */
import { api } from '../api.js';
import { escapeHtml, toast, openModal, closeModal, setBusy, safeImage } from '/js/ui.js';
import { emptyBlock, errorBlock, loadingBlock, money, text } from '../shared.js';

const bound = new WeakSet();
let currentRoot = null;
let currentCtx = null;
let currentProducts = [];

function statusBadge(status) {
  return Number(status) === 0 || status === 'off'
    ? '<span class="status-badge status-badge--sm" data-status="cancelled">已下架</span>'
    : '<span class="status-badge status-badge--sm" data-status="completed">上架中</span>';
}

function variantSummary(product) {
  const specs = Array.isArray(product.specs) ? product.specs.length : 0;
  const colors = Array.isArray(product.colors) ? product.colors.length : 0;
  return `${specs} 个规格 · ${colors} 个颜色`;
}

function saleModeHtml(product) {
  const tags = [];
  if (product.isPresale) tags.push('<span class="badge badge--presale">预售</span>');
  if (product.needProduction) tags.push('<span class="badge badge--make">定制</span>');
  return tags.length ? tags.join(' ') : '<span class="cell-muted">现货</span>';
}

function pageHtml() {
  return `
    <div class="admin-page-head">
      <div class="admin-page-head__text">
        <span class="admin-eyebrow">Catalog</span>
        <h1>商品管理</h1>
        <p>新建与编辑商品，维护规格、颜色浏览图、价格、库存与上下架状态。</p>
      </div>
      <div class="admin-page-head__actions">
        <button class="btn btn--line" type="button" data-refresh>刷新</button>
        <button class="btn btn--primary" type="button" data-new-product>新建商品</button>
      </div>
    </div>
    <div data-list>${loadingBlock('正在读取商品…')}</div>
  `;
}

function tableHtml(products) {
  if (!products.length) {
    return emptyBlock('还没有商品', '点击右上角「新建商品」添加第一件商品。');
  }
  return `
    <div class="table-card">
      <div class="table-toolbar">
        <span class="table-toolbar__count">共 <b>${products.length}</b> 件商品</span>
        <span class="table-toolbar__count">下架商品不会出现在用户端</span>
      </div>
      <div class="table-wrap">
        <table class="admin-table" style="min-width:940px">
          <thead>
            <tr>
              <th>商品</th>
              <th>分类</th>
              <th>价格</th>
              <th>库存</th>
              <th>规格 / 颜色</th>
              <th>售卖方式</th>
              <th>状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            ${products
              .map(
                (product) => `
              <tr>
                <td>
                  <div class="cell-product">
                    <img class="cell-thumb" src="${escapeHtml(safeImage(product.coverUrl))}" alt="" loading="lazy">
                    <div>
                      <div class="cell-strong">${escapeHtml(text(product.name))}</div>
                      <div class="cell-sub">#${product.id}</div>
                    </div>
                  </div>
                </td>
                <td class="cell-muted">${escapeHtml(text(product.category, '未分类'))}</td>
                <td class="cell-strong cell-nowrap">${money(product.basePrice)}</td>
                <td class="cell-strong">${Number(product.stock) || 0}</td>
                <td class="cell-muted cell-nowrap">${escapeHtml(variantSummary(product))}</td>
                <td>${saleModeHtml(product)}</td>
                <td>${statusBadge(product.status)}</td>
                <td class="cell-actions">
                  <button class="btn btn--sm btn--soft" type="button" data-edit="${product.id}">编辑</button>
                </td>
              </tr>`
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
  const container = root.querySelector('[data-list]');
  if (!container) return;
  container.innerHTML = loadingBlock('正在读取商品…');
  try {
    const data = await api.products();
    if (!ctx.isCurrent()) return;
    currentProducts = Array.isArray(data && data.products) ? data.products : [];
    container.innerHTML = tableHtml(currentProducts);
  } catch (err) {
    if (!ctx.isCurrent()) return;
    if (err && err.status === 401) return;
    container.innerHTML = errorBlock((err && err.message) || '商品加载失败');
  }
}

function yuan(fen) {
  const value = Number(fen);
  return (Number.isFinite(value) ? value / 100 : 0).toFixed(2);
}

function readFileDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('图片读取失败'));
    reader.readAsDataURL(file);
  });
}

function rowMoveHtml(kind, index, total) {
  const canUp = index > 0;
  const canDown = index < total - 1;
  return `
    <span class="row-move">
      <button class="btn btn--sm btn--ghost" type="button" data-move-${kind}="${index}" data-move-dir="-1"${
        canUp ? '' : ' disabled'
      } aria-label="上移">↑</button>
      <button class="btn btn--sm btn--ghost" type="button" data-move-${kind}="${index}" data-move-dir="1"${
        canDown ? '' : ' disabled'
      } aria-label="下移">↓</button>
    </span>
  `;
}

function specRowHtml(spec, index, total = 0) {
  return `
    <div class="variant-row" data-spec-row data-index="${index}">
      ${rowMoveHtml('spec', index, total)}
      <input class="input" data-field="spec-name" type="text" maxlength="30" placeholder="规格名称，如 标准装" value="${escapeHtml(
        spec.name || ''
      )}">
      <input class="input" data-field="spec-delta" type="number" step="0.01" placeholder="加价（元）" value="${escapeHtml(
        yuan(spec.delta || 0)
      )}">
      <button class="btn btn--sm btn--line" type="button" data-remove-spec="${index}">删除</button>
    </div>
  `;
}

function colorRowHtml(color, index, total = 0) {
  return `
    <div class="variant-row variant-row--color" data-color-row data-index="${index}">
      ${rowMoveHtml('color', index, total)}
      <input class="color-swab" data-field="color-hex" type="color" value="${escapeHtml(
        /^#([0-9a-fA-F]{6})$/.test(color.hex || '') ? color.hex : '#D8E6E0'
      )}" aria-label="颜色">
      <input class="input" data-field="color-name" type="text" maxlength="30" placeholder="颜色名称，如 抹茶绿" value="${escapeHtml(
        color.name || ''
      )}">
      <input class="input" data-field="color-image" type="text" placeholder="浏览图地址（可上传）" value="${escapeHtml(
        color.image || ''
      )}">
      <button class="btn btn--sm btn--soft" type="button" data-upload-color="${index}">上传图</button>
      <input type="file" accept="image/*" hidden data-color-file="${index}">
      <img class="variant-thumb" data-color-preview="${index}" src="${escapeHtml(
        safeImage(color.image)
      )}" alt="">
      <button class="btn btn--sm btn--line" type="button" data-remove-color="${index}">删除</button>
      <label class="check-line"><input type="checkbox" data-field="color-custom" ${color.custom ? 'checked' : ''}><span>定制项</span></label>
    </div>
  `;
}

function patternRowHtml(pattern, index, total = 0) {
  return `
    <div class="variant-row variant-row--pattern" data-pattern-row data-index="${index}">
      ${rowMoveHtml('pattern', index, total)}
      <input class="input" data-field="pattern-name" type="text" maxlength="30" placeholder="图案名称，如 校徽" value="${escapeHtml(
        pattern.name || ''
      )}">
      <input class="input" data-field="pattern-image" type="text" placeholder="叠加图地址（建议透明 PNG，和颜色图同尺寸）" value="${escapeHtml(
        pattern.image || ''
      )}">
      <button class="btn btn--sm btn--soft" type="button" data-upload-pattern="${index}">上传图</button>
      <input type="file" accept="image/*" hidden data-pattern-file="${index}">
      <img class="variant-thumb" data-pattern-preview="${index}" src="${escapeHtml(
        safeImage(pattern.image)
      )}" alt="">
      <input class="input" data-field="pattern-delta" type="number" min="0" step="0.01" placeholder="加价（元）" value="${escapeHtml(
        (Number(pattern.delta || 0) / 100).toFixed(2)
      )}">
      <button class="btn btn--sm btn--line" type="button" data-remove-pattern="${index}">删除</button>
      <label class="check-line"><input type="checkbox" data-field="pattern-custom" ${pattern.custom ? 'checked' : ''}><span>定制项</span></label>
    </div>
  `;
}

function openEditor(product) {
  const editing = !!product;
  const draft = {
    name: product ? product.name || '' : '',
    category: product ? product.category || '' : '',
    description: product ? product.description || '' : '',
    price: product ? yuan(product.basePrice) : '0.00',
    stock: product ? String(product.stock ?? 0) : '0',
    needProduction: product ? !!product.needProduction : false,
    isPresale: product ? !!product.isPresale : false,
    isCustom: product ? !!product.isCustom : false,
    presaleEta: product ? product.presaleEta || '' : '',
    status: product ? product.status || 'on' : 'on',
    coverUrl: product ? product.coverUrl || '' : '',
    specs:
      product && Array.isArray(product.specs) && product.specs.length
        ? product.specs.map((item) => ({ name: item.name, delta: Number(item.delta) || 0 }))
        : [{ name: '标准装', delta: 0 }],
    colors:
      product && Array.isArray(product.colors) && product.colors.length
        ? product.colors.map((item) => ({
            name: item.name,
            hex: item.hex || '#D8E6E0',
            image: item.image || '',
            custom: !!item.custom,
          }))
        : [{ name: '经典色', hex: '#12A67A', image: '', custom: false }],
    patterns:
      product && Array.isArray(product.patterns)
        ? product.patterns.map((item) => ({
            name: item.name || '',
            image: item.image || '',
            delta: Number(item.delta) || 0,
            custom: !!item.custom,
          }))
        : [],
  };

  const handle = openModal({
    title: editing ? '编辑商品' : '新建商品',
    eyebrow: editing ? `商品 #${product.id}` : 'New Product',
    sub: '颜色浏览图可在选择颜色时展示，规格加价会叠加到商品基础价。',
    wide: true,
    body: `
      <div class="form-modal">
        <div class="form-grid">
          <div class="field field--full">
            <label class="field-label" for="p-name">商品名称<span class="req">*</span></label>
            <input class="input" id="p-name" data-field="name" type="text" maxlength="60" value="${escapeHtml(
              draft.name
            )}" placeholder="例如：手工曲奇礼盒">
          </div>
          <div class="field">
            <label class="field-label" for="p-category">分类</label>
            <input class="input" id="p-category" data-field="category" type="text" maxlength="20" value="${escapeHtml(
              draft.category
            )}" placeholder="如 烘焙 / 饮品 / 文创">
          </div>
          <div class="field">
            <label class="field-label" for="p-status">状态</label>
            <select class="select" id="p-status" data-field="status">
              <option value="on"${draft.status === 'on' ? ' selected' : ''}>上架中</option>
              <option value="off"${draft.status === 'off' ? ' selected' : ''}>已下架</option>
            </select>
          </div>
          <div class="field">
            <label class="field-label" for="p-price">基础价格（元）<span class="req">*</span></label>
            <input class="input" id="p-price" data-field="price" type="number" min="0" step="0.01" value="${escapeHtml(
              draft.price
            )}">
          </div>
          <div class="field">
            <label class="field-label" for="p-stock">库存</label>
            <input class="input" id="p-stock" data-field="stock" type="number" min="0" step="1" value="${escapeHtml(
              draft.stock
            )}">
          </div>
          <div class="field">
            <label class="field-label">售卖方式</label>
            <div style="display:flex;gap:18px;flex-wrap:wrap;padding:7px 0">
              <label class="check-line">
                <input type="checkbox" data-field="isPresale" ${draft.isPresale ? 'checked' : ''}>
                <span>预售</span>
              </label>
              <label class="check-line">
                <input type="checkbox" data-field="needProduction" ${draft.needProduction ? 'checked' : ''}>
                <span>定制</span>
              </label>
              <label class="check-line">
                <input type="checkbox" data-field="isCustom" ${draft.isCustom ? 'checked' : ''}>
                <span>定制商品（颜色+图案叠加界面）</span>
              </label>
            </div>
            <p class="field-hint">预售：用户端显示“预售”而不显示库存；定制：用户端显示“定制”。</p>
          </div>
          <div class="field">
            <label class="field-label" for="p-presale-eta">预售预计配货时间</label>
            <input class="input" id="p-presale-eta" data-field="presaleEta" type="text" maxlength="60" value="${escapeHtml(
              draft.presaleEta
            )}" placeholder="如 7 天内 / 11 月 30 日前后">
            <p class="field-hint">无论库存数量如何都可以填写，会展示在用户端商品详情。</p>
          </div>
          <div class="field field--full">
            <label class="field-label" for="p-desc">商品描述</label>
            <textarea class="input" id="p-desc" data-field="description" rows="3" maxlength="1000" placeholder="介绍商品特点、口味或规格">${escapeHtml(
              draft.description
            )}</textarea>
          </div>
          <div class="field field--full">
            <label class="field-label">商品封面图</label>
            <div class="media-editor">
              <img class="media-preview" data-cover-preview src="${escapeHtml(
                safeImage(draft.coverUrl)
              )}" alt="">
              <div class="media-editor__body">
                <input class="input" data-field="coverUrl" type="text" placeholder="图片地址，或点击上传" value="${escapeHtml(
                  draft.coverUrl
                )}">
                <div class="media-editor__actions">
                  <button class="btn btn--sm btn--soft" type="button" data-upload-cover>上传封面图</button>
                  <input type="file" accept="image/*" hidden data-cover-file>
                </div>
              </div>
            </div>
          </div>
          <div class="field field--full">
            <div class="field-label-row">
              <span class="field-label">规格</span>
              <button class="btn btn--sm btn--line" type="button" data-add-spec>添加规格</button>
            </div>
            <div data-specs>${draft.specs
              .map((item, i) => specRowHtml(item, i, draft.specs.length))
              .join('')}</div>
          </div>
          <div class="field field--full">
            <div class="field-label-row">
              <span class="field-label">颜色与浏览图</span>
              <button class="btn btn--sm btn--line" type="button" data-add-color>添加颜色</button>
            </div>
            <div data-colors>${draft.colors
              .map((item, i) => colorRowHtml(item, i, draft.colors.length))
              .join('')}</div>
          </div>
          <div class="field field--full">
            <div class="field-label-row">
              <span class="field-label">定制图案（叠加在颜色底图上，建议透明 PNG、与颜色图同尺寸）</span>
              <button class="btn btn--sm btn--line" type="button" data-add-pattern>添加图案</button>
            </div>
            <div data-patterns>${draft.patterns
              .map((item, i) => patternRowHtml(item, i, draft.patterns.length))
              .join('')}</div>
            <p class="field-hint">勾选「定制商品」后用户端开启定制界面；「定制项」= 选中后订单会特别标记为定制。</p>
          </div>
        </div>
        <div data-modal-error class="form-modal__error"></div>
      </div>
    `,
    footer: `
      <button class="btn btn--ghost" type="button" data-cancel>取消</button>
      <button class="btn btn--primary" type="button" data-save>${editing ? '保存修改' : '创建商品'}</button>
    `
  });
  if (!handle) return;

  const body = handle.body;
  const foot = handle.foot;
  const errorBox = body.querySelector('[data-modal-error]');
  const specsBox = body.querySelector('[data-specs]');
  const colorsBox = body.querySelector('[data-colors]');
  const patternsBox = body.querySelector('[data-patterns]');
  const coverInput = body.querySelector('[data-field="coverUrl"]');
  const coverPreview = body.querySelector('[data-cover-preview]');
  const coverFile = body.querySelector('[data-cover-file]');
  const saveBtn = foot.querySelector('[data-save]');
  const cancelBtn = foot.querySelector('[data-cancel]');

  const showError = (message) => {
    errorBox.innerHTML = `<div class="admin-alert admin-alert--error"><span>${escapeHtml(
      message
    )}</span></div>`;
  };

  const syncFromDom = () => {
    draft.name = body.querySelector('[data-field="name"]').value;
    draft.category = body.querySelector('[data-field="category"]').value;
    draft.description = body.querySelector('[data-field="description"]').value;
    draft.price = body.querySelector('[data-field="price"]').value;
    draft.stock = body.querySelector('[data-field="stock"]').value;
    draft.status = body.querySelector('[data-field="status"]').value;
    draft.needProduction = body.querySelector('[data-field="needProduction"]').checked;
    draft.isPresale = body.querySelector('[data-field="isPresale"]').checked;
    draft.isCustom = body.querySelector('[data-field="isCustom"]').checked;
    draft.presaleEta = body.querySelector('[data-field="presaleEta"]').value.trim();
    draft.coverUrl = coverInput.value.trim();

    draft.specs = Array.from(specsBox.querySelectorAll('[data-spec-row]')).map((row) => ({
      name: row.querySelector('[data-field="spec-name"]').value,
      delta: Math.round((Number(row.querySelector('[data-field="spec-delta"]').value) || 0) * 100),
    }));
    draft.colors = Array.from(colorsBox.querySelectorAll('[data-color-row]')).map((row) => ({
      name: row.querySelector('[data-field="color-name"]').value,
      hex: row.querySelector('[data-field="color-hex"]').value,
      image: row.querySelector('[data-field="color-image"]').value.trim(),
      custom: row.querySelector('[data-field="color-custom"]').checked,
    }));
    draft.patterns = Array.from(patternsBox.querySelectorAll('[data-pattern-row]')).map((row) => ({
      name: row.querySelector('[data-field="pattern-name"]').value,
      image: row.querySelector('[data-field="pattern-image"]').value.trim(),
      delta: Math.round((Number(row.querySelector('[data-field="pattern-delta"]').value) || 0) * 100),
      custom: row.querySelector('[data-field="pattern-custom"]').checked,
    }));
  };

  const repaintRows = () => {
    specsBox.innerHTML = draft.specs
      .map((item, i) => specRowHtml(item, i, draft.specs.length))
      .join('');
    colorsBox.innerHTML = draft.colors
      .map((item, i) => colorRowHtml(item, i, draft.colors.length))
      .join('');
    patternsBox.innerHTML = draft.patterns
      .map((item, i) => patternRowHtml(item, i, draft.patterns.length))
      .join('');
  };

  body.addEventListener('click', async (event) => {
    if (event.target.closest('[data-add-spec]')) {
      syncFromDom();
      if (draft.specs.length >= 20) {
        showError('规格最多 20 项');
        return;
      }
      draft.specs.push({ name: '', delta: 0 });
      repaintRows();
      return;
    }
    const removeSpec = event.target.closest('[data-remove-spec]');
    if (removeSpec) {
      syncFromDom();
      draft.specs.splice(Number(removeSpec.dataset.removeSpec), 1);
      repaintRows();
      return;
    }
    if (event.target.closest('[data-add-color]')) {
      syncFromDom();
      if (draft.colors.length >= 12) {
        showError('颜色最多 12 项');
        return;
      }
      draft.colors.push({ name: '', hex: '#12A67A', image: '' });
      repaintRows();
      return;
    }
    const removeColor = event.target.closest('[data-remove-color]');
    if (removeColor) {
      syncFromDom();
      draft.colors.splice(Number(removeColor.dataset.removeColor), 1);
      repaintRows();
      return;
    }
    const moveBtn = event.target.closest('[data-move-spec], [data-move-color], [data-move-pattern]');
    if (moveBtn) {
      syncFromDom();
      const kind = moveBtn.dataset.moveSpec !== undefined ? 'spec' : moveBtn.dataset.moveColor !== undefined ? 'color' : 'pattern';
      const index = Number(kind === 'spec' ? moveBtn.dataset.moveSpec : kind === 'color' ? moveBtn.dataset.moveColor : moveBtn.dataset.movePattern);
      const dir = Number(moveBtn.dataset.moveDir);
      const list = kind === 'spec' ? draft.specs : kind === 'color' ? draft.colors : draft.patterns;
      const target = index + dir;
      if (Number.isInteger(index) && Number.isInteger(dir) && target >= 0 && target < list.length) {
        [list[index], list[target]] = [list[target], list[index]];
        repaintRows();
      }
      return;
    }
    if (event.target.closest('[data-add-pattern]')) {
      syncFromDom();
      if (draft.patterns.length >= 20) {
        showError('图案最多 20 项');
        return;
      }
      draft.patterns.push({ name: '', image: '', delta: 0, custom: false });
      repaintRows();
      return;
    }
    const removePattern = event.target.closest('[data-remove-pattern]');
    if (removePattern) {
      syncFromDom();
      draft.patterns.splice(Number(removePattern.dataset.removePattern), 1);
      repaintRows();
      return;
    }
    const uploadPattern = event.target.closest('[data-upload-pattern]');
    if (uploadPattern) {
      const input = body.querySelector(`[data-pattern-file="${uploadPattern.dataset.uploadPattern}"]`);
      if (input) input.click();
    }
    if (event.target.closest('[data-upload-cover]')) {
      coverFile.click();
      return;
    }
    const uploadColor = event.target.closest('[data-upload-color]');
    if (uploadColor) {
      const input = body.querySelector(`[data-color-file="${uploadColor.dataset.uploadColor}"]`);
      if (input) input.click();
    }
  });

  coverFile.addEventListener('change', async () => {
    const file = coverFile.files && coverFile.files[0];
    if (!file) return;
    try {
      const dataUrl = await readFileDataUrl(file);
      const data = await api.uploadImage(dataUrl, 'product-cover');
      coverInput.value = data.url;
      coverPreview.src = data.url;
      toast('封面已上传', 'success');
    } catch (err) {
      toast((err && err.message) || '上传失败', 'error');
    } finally {
      coverFile.value = '';
    }
  });

  colorsBox.addEventListener('change', async (event) => {
    const input = event.target.closest('[data-color-file]');
    if (!input) return;
    const index = Number(input.dataset.colorFile);
    const file = input.files && input.files[0];
    if (!file) return;
    try {
      const dataUrl = await readFileDataUrl(file);
      const data = await api.uploadImage(dataUrl, 'product-color');
      syncFromDom();
      draft.colors[index].image = data.url;
      repaintRows();
      toast('颜色浏览图已上传', 'success');
    } catch (err) {
      toast((err && err.message) || '上传失败', 'error');
    } finally {
      input.value = '';
    }
  });

  patternsBox.addEventListener('change', async (event) => {
    const input = event.target.closest('[data-pattern-file]');
    if (!input) return;
    const index = Number(input.dataset.patternFile);
    const file = input.files && input.files[0];
    if (!file) return;
    try {
      const dataUrl = await readFileDataUrl(file);
      const data = await api.uploadImage(dataUrl, 'product-pattern');
      syncFromDom();
      draft.patterns[index].image = data.url;
      repaintRows();
      toast('图案叠加图已上传', 'success');
    } catch (err) {
      toast((err && err.message) || '上传失败', 'error');
    } finally {
      input.value = '';
    }
  });

  cancelBtn.addEventListener('click', () => closeModal());

  saveBtn.addEventListener('click', async () => {
    syncFromDom();
    const name = draft.name.trim();
    if (!name) return showError('请填写商品名称');
    const basePrice = Math.round((Number(draft.price) || 0) * 100);
    if (!Number.isFinite(basePrice) || basePrice < 0) return showError('商品价格不正确');
    const stock = Number(draft.stock);
    if (!Number.isInteger(stock) || stock < 0) return showError('库存需为非负整数');
    if (!draft.specs.length) return showError('请至少添加一个规格');
    if (!draft.colors.length) return showError('请至少添加一个颜色');
    if (draft.specs.some((item) => !item.name.trim())) return showError('规格名称不能为空');
    if (draft.colors.some((item) => !item.name.trim())) return showError('颜色名称不能为空');
    if (draft.isCustom) {
      if (!draft.patterns.length) return showError('定制商品请至少添加一个图案');
      if (draft.patterns.some((item) => !item.name.trim())) return showError('图案名称不能为空');
    }

    const payload = {
      name,
      category: draft.category.trim(),
      description: draft.description.trim(),
      basePrice,
      stock,
      needProduction: draft.needProduction,
      isPresale: draft.isPresale,
      presaleEta: draft.presaleEta,
      status: draft.status,
      coverUrl: draft.coverUrl,
      isCustom: draft.isCustom,
      specs: draft.specs.map((item) => ({ name: item.name.trim(), delta: item.delta })),
      colors: draft.colors.map((item) => ({
        name: item.name.trim(),
        hex: item.hex,
        image: item.image,
        custom: !!item.custom,
      })),
      patterns: draft.patterns.map((item) => ({
        name: item.name.trim(),
        image: item.image.trim(),
        delta: item.delta,
        custom: !!item.custom,
      })),
    };

    setBusy(saveBtn, true, '保存中…');
    try {
      if (editing) await api.updateProduct(product.id, payload);
      else await api.createProduct(payload);
      toast(editing ? '商品已更新' : '商品已创建', 'success');
      closeModal();
      await load();
    } catch (err) {
      setBusy(saveBtn, false);
      if (err && err.status === 401) {
        closeModal();
        return;
      }
      showError((err && err.message) || '保存失败，请稍后重试');
    }
  });
}

function onClick(event) {
  const root = currentRoot;
  if (!root) return;
  if (event.target.closest('[data-refresh]') || event.target.closest('[data-retry]')) {
    load();
    return;
  }
  if (event.target.closest('[data-new-product]')) {
    openEditor(null);
    return;
  }
  const editBtn = event.target.closest('[data-edit]');
  if (editBtn) {
    const product = currentProducts.find((item) => item.id === Number(editBtn.dataset.edit));
    if (!product) {
      toast('商品信息已更新，请刷新后重试', 'error');
      return;
    }
    openEditor(product);
  }
}

export function render(root, ctx) {
  currentRoot = root;
  currentCtx = ctx;
  currentProducts = [];
  root.innerHTML = pageHtml();
  if (!bound.has(root)) {
    root.addEventListener('click', onClick);
    bound.add(root);
  }
  load();
}
