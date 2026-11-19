/**
 * 管理端 · 站点设置 #/settings
 * 控制品牌、Logo、主题色、首页文案、页脚与支付收款码/教程
 */
import { api } from '../api.js';
import { escapeHtml, toast, setBusy, safeImage } from '/js/ui.js';
import { errorBlock, loadingBlock } from '../shared.js';
import { applyTheme, loadSiteSettings } from '/js/site-settings.js';

const bound = new WeakSet();
let currentRoot = null;
let currentCtx = null;
let saved = null;

const IMAGE_FIELDS = [
  { key: 'logoUrl', label: '站点 Logo', hint: '建议正方形，显示在用户端、生产端与管理端顶部' },
  { key: 'qrWechatUrl', label: '微信收款码', hint: '上传实际收款二维码图片，用户支付时展示' },
  { key: 'qrAlipayUrl', label: '支付宝收款码', hint: '上传实际收款二维码图片，用户支付时展示' },
];

function field(label, key, value, options = {}) {
  const { type = 'text', maxlength = 200, hint = '', placeholder = '' } = options;
  return `
    <div class="field${options.full ? ' field--full' : ''}">
      <label class="field-label" for="s-${key}">${escapeHtml(label)}</label>
      <input class="input" id="s-${key}" data-key="${key}" type="${type}" maxlength="${maxlength}"
        value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}">
      ${hint ? `<p class="field-hint">${escapeHtml(hint)}</p>` : ''}
    </div>
  `;
}

function textarea(label, key, value, options = {}) {
  const { maxlength = 300, hint = '', rows = 2 } = options;
  return `
    <div class="field${options.full ? ' field--full' : ''}">
      <label class="field-label" for="s-${key}">${escapeHtml(label)}</label>
      <textarea class="input" id="s-${key}" data-key="${key}" rows="${rows}" maxlength="${maxlength}">${escapeHtml(
        value
      )}</textarea>
      ${hint ? `<p class="field-hint">${escapeHtml(hint)}</p>` : ''}
    </div>
  `;
}

function colorField(label, key, value) {
  return `
    <div class="field">
      <label class="field-label" for="s-${key}">${escapeHtml(label)}</label>
      <div class="color-input-row">
        <input class="color-input" id="s-${key}" data-key="${key}" data-color-key="${key}" type="color" value="${escapeHtml(
          value
        )}">
        <span class="color-value" data-color-value="${key}">${escapeHtml(value)}</span>
      </div>
    </div>
  `;
}

function imageField(config, value) {
  return `
    <div class="field field--full">
      <label class="field-label" for="s-${config.key}">${escapeHtml(config.label)}</label>
      <div class="media-editor">
        <img class="media-preview" data-preview-for="${config.key}" src="${escapeHtml(
          safeImage(value)
        )}" alt="">
        <div class="media-editor__body">
          <input class="input" id="s-${config.key}" data-key="${config.key}" type="text" maxlength="2000"
            value="${escapeHtml(value)}" placeholder="图片地址，或点击上传">
          <div class="media-editor__actions">
            <button class="btn btn--sm btn--soft" type="button" data-upload-key="${config.key}">上传图片</button>
            <input type="file" accept="image/*" hidden data-file-for="${config.key}">
          </div>
          <p class="field-hint">${escapeHtml(config.hint)}</p>
        </div>
      </div>
    </div>
  `;
}

function tutorialRowHtml(step, index, total) {
  return `
    <div class="tutorial-row" data-tutorial-row>
      <span class="tutorial-row__index">${index + 1}</span>
      <input class="input" data-field="tutorial-title" type="text" maxlength="40" placeholder="步骤标题" value="${escapeHtml(
        step.title || ''
      )}">
      <input class="input" data-field="tutorial-desc" type="text" maxlength="100" placeholder="步骤说明（选填）" value="${escapeHtml(
        step.desc || ''
      )}">
      <div class="tutorial-row__actions">
        <button class="btn btn--sm btn--line" type="button" data-move-tutorial="up" data-index="${index}" ${
          index === 0 ? 'disabled' : ''
        }>上移</button>
        <button class="btn btn--sm btn--line" type="button" data-move-tutorial="down" data-index="${index}" ${
          index === total - 1 ? 'disabled' : ''
        }>下移</button>
        <button class="btn btn--sm btn--danger" type="button" data-remove-tutorial="${index}">删除</button>
      </div>
    </div>
  `;
}

function formHtml(settings) {
  const tutorial = Array.isArray(settings.paymentTutorial) ? settings.paymentTutorial : [];
  return `
    <div data-settings-form>
    <div class="admin-page-head">
      <div class="admin-page-head__text">
        <span class="admin-eyebrow">Brand & Content</span>
        <h1>站点设置</h1>
        <p>统一控制三端的品牌名称、Logo、主题色、首页文案、页脚与支付收款码。</p>
      </div>
      <div class="admin-page-head__actions">
        <button class="btn btn--line" type="button" data-reload-settings>恢复已保存</button>
        <button class="btn btn--primary" type="button" data-save-settings>保存设置</button>
      </div>
    </div>

    <div class="settings-layout">
      <section class="settings-card">
        <div class="settings-card__head">
          <h2>品牌与 Logo</h2>
          <p>品牌名称会出现在导航、页脚、页面标题与工作台。</p>
        </div>
        <div class="form-grid">
          ${field('品牌名称', 'brandName', settings.brandName, { maxlength: 40, placeholder: '例如：校园小铺' })}
          ${field('英文副标题', 'brandSubtitle', settings.brandSubtitle, { maxlength: 80 })}
          ${field('品牌标语', 'brandTagline', settings.brandTagline, { maxlength: 80, full: true })}
          ${imageField(IMAGE_FIELDS[0], settings.logoUrl)}
          ${field('站点图标地址', 'faviconUrl', settings.faviconUrl, {
            maxlength: 2000,
            hint: '留空则使用 /img/favicon.svg',
            full: true
          })}
        </div>
      </section>

      <section class="settings-card">
        <div class="settings-card__head">
          <h2>主题色</h2>
          <p>修改后三端的主色、强调色、背景与阴影会同步变化。</p>
        </div>
        <div class="form-grid">
          ${colorField('主色', 'primaryColor', settings.primaryColor)}
          ${colorField('强调色', 'accentColor', settings.accentColor)}
          ${colorField('页面背景色', 'backgroundColor', settings.backgroundColor)}
        </div>
      </section>

      <section class="settings-card">
        <div class="settings-card__head">
          <h2>首页内容</h2>
          <p>控制顶部公告与商品区标题，用户进入首页即可直接选购。</p>
        </div>
        <div class="form-grid">
          ${field('顶部公告', 'noticeText', settings.noticeText, {
            maxlength: 200,
            full: true,
            hint: '留空则不显示公告条'
          })}
          ${field('商品区标题', 'shopTitle', settings.shopTitle, { maxlength: 40 })}
          ${field('商品区副标题', 'shopSubtitle', settings.shopSubtitle, { maxlength: 200, full: true })}
        </div>
      </section>

      <section class="settings-card">
        <div class="settings-card__head">
          <h2>页脚与说明</h2>
          <p>页脚品牌介绍、活动时间、购物说明与版权文案。</p>
        </div>
        <div class="form-grid">
          ${textarea('页脚介绍', 'footerDescription', settings.footerDescription, {
            full: true,
            rows: 2,
            maxlength: 300
          })}
          ${textarea('购物说明', 'footerShoppingTips', (settings.footerShoppingTips || []).join('\n'), {
            full: true,
            rows: 3,
            maxlength: 300,
            hint: '每行一条'
          })}
          ${field('活动时间', 'footerHours', settings.footerHours, { maxlength: 100 })}
          ${field('页脚提示', 'footerNotice', settings.footerNotice, { maxlength: 200 })}
          ${field('版权文案', 'footerCopyright', settings.footerCopyright, { maxlength: 160, full: true })}
          ${field('支付演示说明', 'footerPaymentNote', settings.footerPaymentNote, {
            maxlength: 200,
            full: true
          })}
        </div>
      </section>

      <section class="settings-card">
        <div class="settings-card__head">
          <h2>支付与收款码</h2>
          <p>自定义微信 / 支付宝收款码图片、支付弹窗文案与操作教程。</p>
        </div>
        <div class="form-grid">
          ${field('支付弹窗标题', 'paymentTitle', settings.paymentTitle, { maxlength: 60 })}
          ${field('支付弹窗副标题', 'paymentSubtitle', settings.paymentSubtitle, { maxlength: 200 })}
          ${imageField(IMAGE_FIELDS[1], settings.qrWechatUrl)}
          ${imageField(IMAGE_FIELDS[2], settings.qrAlipayUrl)}
          ${field('收款码标注', 'paymentNote', settings.paymentNote, { maxlength: 120 })}
          ${textarea('收款码说明', 'paymentTip', settings.paymentTip, {
            full: true,
            rows: 2,
            maxlength: 300
          })}
          <div class="field field--full">
            <div class="field-label-row">
              <span class="field-label">支付操作教程</span>
              <button class="btn btn--sm btn--line" type="button" data-add-tutorial>添加步骤</button>
            </div>
            <div data-tutorials>${tutorial.map((step, index) => tutorialRowHtml(step, index, tutorial.length)).join('')}</div>
            <p class="field-hint">最多 8 步，用户端支付弹窗按顺序展示。</p>
          </div>
        </div>
      </section>

      <div class="settings-actions">
        <button class="btn btn--line" type="button" data-reload-settings>恢复已保存</button>
        <button class="btn btn--primary" type="button" data-save-settings>保存设置</button>
      </div>
      <div data-settings-error></div>
    </div>
    </div>
  `;
}

async function loadView() {
  const root = currentRoot;
  const ctx = currentCtx;
  if (!root || !ctx) return;
  root.innerHTML = pageHtmlShell();
  const container = root.querySelector('[data-settings-container]');
  if (!container) return;
  container.innerHTML = loadingBlock('正在读取站点设置…');
  try {
    const data = await api.settings();
    if (!ctx.isCurrent()) return;
    saved = data && data.settings ? data.settings : {};
    container.innerHTML = formHtml(saved);
    bindForm();
  } catch (err) {
    if (!ctx.isCurrent()) return;
    if (err && err.status === 401) return;
    container.innerHTML = errorBlock((err && err.message) || '设置加载失败');
  }
}

function pageHtmlShell() {
  return `<div data-settings-container>${loadingBlock('正在读取站点设置…')}</div>`;
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('图片读取失败'));
    reader.readAsDataURL(file);
  });
}

function splitLines(value, max) {
  return String(value || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, max);
}

function bindForm() {
  const root = currentRoot;
  if (!root) return;
  const form = root.querySelector('[data-settings-form]');
  if (!form) return;
  const errorBox = form.querySelector('[data-settings-error]');
  const tutorialsBox = form.querySelector('[data-tutorials]');
  const saveBtn = form.querySelector('.settings-actions [data-save-settings]');

  const collectTutorial = () =>
    Array.from(tutorialsBox.querySelectorAll('[data-tutorial-row]')).map((row) => ({
      title: row.querySelector('[data-field="tutorial-title"]').value.trim(),
      desc: row.querySelector('[data-field="tutorial-desc"]').value.trim()
    }));

  const collect = () => {
    const values = {};
    form.querySelectorAll('[data-key]').forEach((input) => {
      values[input.dataset.key] = input.value.trim();
    });
    const heroTrustInput = form.querySelector('[data-key="heroTrust"]');
    values.heroTrust = heroTrustInput
      ? splitLines(heroTrustInput.value, 8)
      : Array.isArray(saved && saved.heroTrust)
        ? saved.heroTrust
        : [];
    const tipsInput = form.querySelector('[data-key="footerShoppingTips"]');
    values.footerShoppingTips = tipsInput
      ? splitLines(tipsInput.value, 8)
      : Array.isArray(saved && saved.footerShoppingTips)
        ? saved.footerShoppingTips
        : [];
    values.paymentTutorial = collectTutorial();
    return values;
  };

  const paintTutorials = () => {
    const rows = collectTutorial();
    // collectTutorial reads DOM; pass through state to avoid losing edits
    tutorialsBox.dataset.pending = JSON.stringify(rows);
  };

  const renderTutorials = (rows) => {
    tutorialsBox.innerHTML = rows
      .map((step, index) => tutorialRowHtml(step, index, rows.length))
      .join('');
  };

  const showError = (message) => {
    errorBox.innerHTML = `<div class="admin-alert admin-alert--error"><span>${escapeHtml(
      message
    )}</span></div>`;
  };

  form.addEventListener('input', (event) => {
    const colorKey = event.target.dataset ? event.target.dataset.colorKey : '';
    if (colorKey) {
      const label = form.querySelector(`[data-color-value="${colorKey}"]`);
      if (label) label.textContent = event.target.value;
      applyTheme({ ...collect(), [colorKey]: event.target.value });
    }
  });

  form.addEventListener('click', async (event) => {
    if (event.target.closest('[data-add-tutorial]')) {
      const rows = collectTutorial();
      if (rows.length >= 8) {
        showError('支付教程最多 8 步');
        return;
      }
      rows.push({ title: '', desc: '' });
      renderTutorials(rows);
      return;
    }

    const removeBtn = event.target.closest('[data-remove-tutorial]');
    if (removeBtn) {
      const rows = collectTutorial();
      rows.splice(Number(removeBtn.dataset.removeTutorial), 1);
      renderTutorials(rows);
      return;
    }

    const moveBtn = event.target.closest('[data-move-tutorial]');
    if (moveBtn) {
      const rows = collectTutorial();
      const index = Number(moveBtn.dataset.index);
      const target = moveBtn.dataset.moveTutorial === 'up' ? index - 1 : index + 1;
      if (target < 0 || target >= rows.length) return;
      [rows[index], rows[target]] = [rows[target], rows[index]];
      renderTutorials(rows);
      return;
    }

    const uploadBtn = event.target.closest('[data-upload-key]');
    if (uploadBtn) {
      const key = uploadBtn.dataset.uploadKey;
      const input = form.querySelector(`[data-file-for="${key}"]`);
      if (input) input.click();
      return;
    }

    if (event.target.closest('[data-reload-settings]')) {
      await loadView();
      toast('已恢复为服务器保存的设置', 'info');
      return;
    }

    if (event.target.closest('[data-save-settings]') && saveBtn) {
      const values = collect();
      if (!values.brandName) {
        showError('品牌名称不能为空');
        return;
      }
      if (!values.paymentTutorial.every((step) => step.title)) {
        showError('支付教程每个步骤都需要填写标题');
        return;
      }
      const button = event.target.closest('[data-save-settings]');
      setBusy(button, true, '保存中…');
      try {
        const data = await api.saveSettings(values);
        saved = data && data.settings ? data.settings : values;
        applyTheme(saved);
        await loadSiteSettings(true);
        toast('设置已保存，刷新三端页面后生效', 'success');
        errorBox.innerHTML = '';
      } catch (err) {
        if (err && err.status === 401) return;
        showError((err && err.message) || '保存失败，请稍后重试');
      } finally {
        setBusy(button, false);
      }
    }
  });

  form.addEventListener('change', async (event) => {
    const input = event.target.closest('[data-file-for]');
    if (!input) return;
    const key = input.dataset.fileFor;
    const file = input.files && input.files[0];
    if (!file) return;
    try {
      const dataUrl = await readAsDataUrl(file);
      const data = await api.uploadImage(dataUrl, key);
      const textInput = form.querySelector(`[data-key="${key}"]`);
      if (textInput) textInput.value = data.url;
      const preview = form.querySelector(`[data-preview-for="${key}"]`);
      if (preview) preview.src = data.url;
      toast('图片已上传，保存后生效', 'success');
    } catch (err) {
      toast((err && err.message) || '上传失败', 'error');
    } finally {
      input.value = '';
    }
  });

  paintTutorials();
}

export function render(root, ctx) {
  currentRoot = root;
  currentCtx = ctx;
  saved = null;
  root.innerHTML = pageHtmlShell();
  if (!bound.has(root)) {
    bound.add(root);
  }
  loadView();
}
