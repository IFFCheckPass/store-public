import { api } from '../api.js';
import { escapeHtml, formatMoney, toast, openModal, closeModal, setBusy } from '../ui.js';
import { recognizePaymentNumber } from '../ocr.js';
import { currentSettings } from '../site-settings.js';

export const PAY_META = {
  wechat: {
    label: '微信支付',
    qr: '/img/qr-wechat.svg',
    iconClass: 'pay-box__icon--wechat',
    icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.4 3C5.6 3 2.5 5.6 2.5 8.8c0 1.8 1 3.4 2.6 4.5l-.7 2.1 2.4-1.2c.8.2 1.7.4 2.6.4h.5a5 5 0 0 1-.2-1.4c0-3 2.9-5.4 6.6-5.4h.5C16 5.1 13 3 9.4 3Zm-2.3 3.1a.9.9 0 1 1 0 1.8.9.9 0 0 1 0-1.8Zm4.6 0a.9.9 0 1 1 0 1.8.9.9 0 0 1 0-1.8Z"/><path d="M21.5 13.3c0-2.7-2.6-4.9-5.8-4.9s-5.8 2.2-5.8 4.9 2.6 4.9 5.8 4.9c.7 0 1.4-.1 2-.3l1.9 1-.5-1.7c1.5-.9 2.4-2.3 2.4-3.9Zm-7.7-1.1a.75.75 0 1 1 0 1.5.75.75 0 0 1 0-1.5Zm3.8 0a.75.75 0 1 1 0 1.5.75.75 0 0 1 0-1.5Z"/></svg>'
  },
  alipay: {
    label: '支付宝',
    qr: '/img/qr-alipay.svg',
    iconClass: 'pay-box__icon--alipay',
    icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h14a2 2 0 0 1 2 2v9.2c-4-1.2-8.4-2.4-11.7-2.4-2.1 0-3.8.5-5.1 1.3V6a2 2 0 0 1 2-2Zm6 4H9v1.5h2v1.4H8.3v1.5H11c-.3.9-1.1 1.8-2.2 2.5-.8-.4-1.4-.9-1.8-1.6H5.4c.6 1.1 1.4 2 2.5 2.7-1 .6-2.2 1-3.6 1.3l.5 1.6c2-.4 3.8-1.2 5.2-2.1 1.6 1 3.7 1.7 6 1.7 2.7 0 4.6-1.5 4.6-3.5 0-1.6-1.2-2.8-3.2-3.4-1.1-.3-2.4-.5-3.8-.6V12h4.3v-1.5h-4.3v-1H16V8h-2.2V6.4h-1.6V8H11V4.9Z"/></svg>'
  }
};

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('图片读取失败'));
    reader.readAsDataURL(file);
  });
}

const FALLBACK_STEPS = [
  ['打开微信/支付宝', '在手机上打开付款码'],
  ['扫描收款码', '长按识别或扫一扫'],
  ['支付成功截图', '截下支付结果页面'],
  ['上传截图', '自动识别支付单号']
];

function stepsHtml() {
  const settings = currentSettings();
  const configured = Array.isArray(settings.paymentTutorial) ? settings.paymentTutorial : [];
  const steps =
    configured.length > 0
      ? configured.map((step) => [step.title || '', step.desc || ''])
      : FALLBACK_STEPS;
  return `<div class="pay-steps">
    ${steps
      .map(
        ([title, sub], index) => `
          <div class="pay-step">
            <span class="pay-step__num">${index + 1}</span>
            <p><b>${escapeHtml(title)}</b>${escapeHtml(sub)}</p>
          </div>`
      )
      .join('')}
  </div>`;
}

function bodyHtml(order, meta, method) {
  const settings = currentSettings();
  const qr =
    method === 'alipay'
      ? settings.qrAlipayUrl || '/img/qr-alipay.svg'
      : settings.qrWechatUrl || '/img/qr-wechat.svg';
  return `
    ${stepsHtml()}
    <div class="pay-method-row">
      <span class="pay-box__icon ${meta.iconClass}">${meta.icon}</span>
      <div>
        <strong>${escapeHtml(meta.label)}</strong>
        <span>订单 ${escapeHtml(order.orderNo || '')}</span>
      </div>
      <span class="amount">${formatMoney(order.totalAmount)}</span>
    </div>

    <div class="pay-layout">
      <div class="qr-box">
        <img src="${escapeHtml(qr)}" alt="${escapeHtml(meta.label)}收款码">
        <div class="qr-note">${escapeHtml(settings.paymentNote)}</div>
        <p class="qr-hint">${escapeHtml(settings.paymentTip)}</p>
      </div>

      <div>
        <div class="upload-zone" data-upload-zone>
          <input type="file" accept="image/*" data-file-input aria-label="上传支付截图">
          <div class="upload-empty" data-upload-empty>
            <span class="upload-zone__icon">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.7l1.2-1.8h5.2L15.8 6h1.7A2.5 2.5 0 0 1 20 8.5v8A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5v-8Z"/><circle cx="12" cy="12.5" r="3.3"/></svg>
            </span>
            <strong>上传支付成功截图</strong>
            <small>支持 JPG / PNG / WEBP，≤ 6MB，自动识别单号</small>
          </div>
          <img data-preview alt="支付截图预览" hidden>
          <span class="upload-replace" data-replace hidden>点击更换截图</span>
        </div>

        <div class="ocr-status" data-ocr-status hidden></div>
        <div class="ocr-progress" data-ocr-progress hidden><div class="ocr-progress__bar" data-ocr-bar></div></div>
        <button class="ocr-text-toggle" type="button" data-skip-ocr hidden>跳过自动识别，手动填写</button>

        <div class="upload-fields">
          <div class="field">
            <label class="field-label" for="pay-ocr-number">支付单号</label>
            <input class="input" id="pay-ocr-number" name="ocrNumber" type="text" inputmode="numeric" placeholder="上传截图后自动识别，也可以手动填写" maxlength="80">
            <span class="field-hint">识别结果仅供参考，请核对后再提交；留空也可提交，由管理员人工核对截图。</span>
          </div>
        </div>

        <button class="ocr-text-toggle" type="button" data-toggle-raw hidden>查看识别原文</button>
        <pre class="ocr-raw" data-raw hidden></pre>
      </div>
    </div>
  `;
}

function refreshRoute() {
  window.dispatchEvent(new Event('hashchange'));
}

export function openPaymentModal(order, options = {}) {
  if (!order || !order.orderNo) {
    toast('订单信息不完整，无法支付', 'error');
    return null;
  }
  if (order.paymentMethod === 'gift') {
    toast('该订单使用赠货码，无需支付', 'info');
    return null;
  }

  const method = order.paymentMethod === 'alipay' ? 'alipay' : 'wechat';
  const meta = PAY_META[method];
  const settings = currentSettings();

  const modal = openModal({
    eyebrow: '完成支付',
    title: settings.paymentTitle,
    sub: settings.paymentSubtitle,
    wide: true,
    body: bodyHtml(order, meta, method),
    footer: `
      <button class="btn btn--ghost" type="button" data-cancel>稍后支付</button>
      <button class="btn btn--primary" type="button" data-submit>提交核验</button>
    `
  });

  if (!modal) return null;

  const zone = modal.modal.querySelector('[data-upload-zone]');
  const fileInput = modal.modal.querySelector('[data-file-input]');
  const preview = modal.modal.querySelector('[data-preview]');
  const emptyBox = modal.modal.querySelector('[data-upload-empty]');
  const replaceHint = modal.modal.querySelector('[data-replace]');
  const statusEl = modal.modal.querySelector('[data-ocr-status]');
  const progressEl = modal.modal.querySelector('[data-ocr-progress]');
  const barEl = modal.modal.querySelector('[data-ocr-bar]');
  const ocrInput = modal.modal.querySelector('[name="ocrNumber"]');
  const skipBtn = modal.modal.querySelector('[data-skip-ocr]');
  const rawBtn = modal.modal.querySelector('[data-toggle-raw]');
  const rawEl = modal.modal.querySelector('[data-raw]');
  const submitBtn = modal.modal.querySelector('[data-submit]');
  const cancelBtn = modal.modal.querySelector('[data-cancel]');

  let imageDataUrl = '';
  let ocrText = '';
  let running = false;
  let skipped = false;
  let manualEdited = false;
  let ocrFilled = '';
  let token = 0;

  const setStatus = (type, message, spinner = false) => {
    if (!statusEl) return;
    statusEl.hidden = false;
    statusEl.className = 'ocr-status' + (type ? ' is-' + type : '');
    statusEl.innerHTML = `${
      spinner
        ? '<span class="spinner spinner--sm" aria-hidden="true"></span>'
        : '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true" style="flex-shrink:0"><circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16v.5"/></svg>'
    }<span>${escapeHtml(message)}</span>`;
  };

  const hideStatus = () => {
    if (statusEl) statusEl.hidden = true;
    if (progressEl) progressEl.hidden = true;
    if (skipBtn) skipBtn.hidden = true;
  };

  const resetOcr = () => {
    ocrText = '';
    ocrFilled = '';
    manualEdited = false;
    skipped = false;
    if (ocrInput) {
      ocrInput.value = '';
      ocrInput.classList.remove('is-invalid');
    }
    if (skipBtn) skipBtn.disabled = false;
    hideStatus();
    if (rawBtn) rawBtn.hidden = true;
    if (rawEl) {
      rawEl.hidden = true;
      rawEl.textContent = '';
    }
  };

  if (fileInput) {
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;

      if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
        toast('请上传 PNG / JPG / WEBP 格式的支付截图', 'error');
        fileInput.value = '';
        return;
      }
      if (file.size > 6 * 1024 * 1024) {
        toast('图片不能超过 6MB，请压缩后再试', 'error');
        fileInput.value = '';
        return;
      }

      resetOcr();
      token += 1;
      const currentToken = token;

      try {
        imageDataUrl = await readAsDataUrl(file);
      } catch (err) {
        toast('图片读取失败，请重新选择', 'error');
        return;
      }

      if (zone) zone.classList.add('has-image');
      if (emptyBox) emptyBox.hidden = true;
      if (preview) {
        preview.src = imageDataUrl;
        preview.hidden = false;
      }
      if (replaceHint) replaceHint.hidden = false;

      running = true;
      if (skipBtn) skipBtn.hidden = false;
      if (progressEl) {
        progressEl.hidden = false;
        if (barEl) barEl.style.width = '0%';
      }
      setStatus('loading', '正在加载本地识别引擎…', true);

      try {
        const result = await recognizePaymentNumber(file, {
          onStatus(phase, message) {
            if (currentToken !== token) return;
            if (phase === 'recognizing' || phase === 'loading') {
              setStatus('loading', message || '正在识别截图中的文字…', true);
            } else if (phase === 'error') {
              setStatus('error', message, false);
            }
          },
          onProgress(percent) {
            if (currentToken !== token) return;
            if (barEl) barEl.style.width = Math.max(0, Math.min(100, percent)) + '%';
          }
        });

        if (currentToken !== token) return;

        ocrText = (result && result.text) || '';
        const number = (result && result.number) || '';

        if (!skipped && number) {
          if (ocrInput && !manualEdited && (!ocrInput.value.trim() || ocrInput.value.trim() === ocrFilled)) {
            ocrInput.value = number;
            ocrFilled = number;
            ocrInput.classList.remove('is-invalid');
          }
          setStatus('success', '已自动识别，请核对支付单号', false);
        } else if (!skipped) {
          setStatus('error', '自动识别失败，请手动填写支付单号', false);
        }

        if (ocrText && rawBtn && rawEl) {
          rawEl.textContent = ocrText;
          rawBtn.hidden = false;
        }
      } catch (err) {
        if (currentToken !== token) return;
        setStatus('error', '自动识别失败，请手动填写支付单号', false);
        ocrText = '';
      } finally {
        if (currentToken === token) {
          running = false;
          if (skipBtn) skipBtn.hidden = true;
          if (progressEl) {
            window.setTimeout(() => {
              if (!running) progressEl.hidden = true;
            }, 1200);
          }
        }
      }
    });
  }

  if (ocrInput) {
    ocrInput.addEventListener('input', () => {
      manualEdited = true;
    });
  }

  if (skipBtn) {
    skipBtn.addEventListener('click', () => {
      skipped = true;
      skipBtn.hidden = true;
      if (skipBtn) skipBtn.disabled = true;
      setStatus('error', '已跳过自动识别，请手动填写支付单号', false);
      if (progressEl) progressEl.hidden = true;
    });
  }

  if (rawBtn) {
    rawBtn.addEventListener('click', () => {
      if (!rawEl) return;
      rawEl.hidden = !rawEl.hidden;
      rawBtn.textContent = rawEl.hidden ? '查看识别原文' : '收起识别原文';
    });
  }

  if (cancelBtn) cancelBtn.addEventListener('click', () => closeModal());

  if (submitBtn) {
    submitBtn.addEventListener('click', async () => {
      if (!imageDataUrl) {
        setStatus('error', '请先上传支付成功截图', false);
        if (zone) {
          zone.classList.add('is-invalid');
          window.setTimeout(() => zone.classList.remove('is-invalid'), 1500);
        }
        toast('请先上传支付截图', 'error');
        return;
      }

      const number = ocrInput ? ocrInput.value.trim() : '';
      setBusy(submitBtn, true, '正在提交…');
      try {
        const data = await api.submitPayment(order.orderNo, {
          imageDataUrl,
          ocrNumber: number,
          ocrRaw: ocrText || ''
        });

        closeModal();
        toast('已提交，等待管理员核验', 'success');
        if (typeof options.onSuccess === 'function') {
          options.onSuccess(data && data.order);
        } else {
          refreshRoute();
        }
      } catch (err) {
        toast((err && err.message) || '提交失败，请稍后重试', 'error');
        setBusy(submitBtn, false);
      }
    });
  }

  return modal;
}
