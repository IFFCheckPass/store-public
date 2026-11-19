/**
 * 站点设置：主题色、品牌、Logo 与页面文案
 * 由管理端 /admin#/settings 维护，用户端 / 生产端 / 管理端共用
 */

const FALLBACK = {
  brandName: '测试',
  brandSubtitle: 'Test',
  brandTagline: '',
  logoUrl: '',
  faviconUrl: '/img/favicon.svg',
  primaryColor: '#2ed5ff',
  accentColor: '#ff8a3d',
  backgroundColor: '#f7faf8',
  noticeText: '',
  heroEyebrow: '',
  heroTitle: '',
  heroHighlight: '',
  heroSubtitle: '',
  heroButtonText: 'Go',
  heroTrust: [],
  shopTitle: '',
  shopSubtitle: '',
  footerDescription: '',
  footerHours: '',
  footerNotice: '如遇问题，请在订单备注中说明，我们会尽快处理。',
  footerCopyright: '',
  footerPaymentNote: '演示收款码不可真实支付，支付截图仅用于本地 OCR 识别演示。',
  footerShoppingTips: ['支持微信、支付宝扫码', '赠货码可直接免支付'],
  paymentTitle: '扫码支付并上传截图',
  paymentSubtitle: '提交后会进入待核验，管理员确认后订单开始备货',
  paymentNote: '演示示例码 · 不可真实支付',
  paymentTip: '这是演示用收款码，请勿真实转账。上传任意支付截图即可体验识别流程。',
  paymentTutorial: [
    { title: '打开微信/支付宝', desc: '在手机上打开付款码' },
    { title: '扫描收款码', desc: '长按识别或扫一扫' },
    { title: '支付成功截图', desc: '截下支付结果页面' },
    { title: '上传截图', desc: '自动识别支付单号' },
  ],
  qrWechatUrl: '/img/qr-wechat.svg',
  qrAlipayUrl: '/img/qr-alipay.svg',
};

let cache = null;
let cachePromise = null;

function normalize(settings) {
  return { ...FALLBACK, ...(settings && typeof settings === 'object' ? settings : {}) };
}

export function loadSiteSettings(force = false) {
  if (cache && !force) return Promise.resolve(cache);
  if (!cachePromise || force) {
    cachePromise = fetch('/api/settings', { credentials: 'same-origin' })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        cache = normalize(data && data.settings);
        return cache;
      })
      .catch(() => {
        cache = { ...FALLBACK };
        return cache;
      });
  }
  return cachePromise;
}

export function currentSettings() {
  return cache || { ...FALLBACK };
}

function parseHex(hex) {
  const value = String(hex || '').trim();
  const match = value.match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
  if (!match) return null;
  let body = match[1];
  if (body.length === 3) body = body.split('').map((ch) => ch + ch).join('');
  return {
    r: parseInt(body.slice(0, 2), 16),
    g: parseInt(body.slice(2, 4), 16),
    b: parseInt(body.slice(4, 6), 16),
  };
}

function toHex({ r, g, b }) {
  const part = (value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0');
  return `#${part(r)}${part(g)}${part(b)}`;
}

function mix(color, target, weight) {
  const a = parseHex(color);
  const b = parseHex(target);
  if (!a || !b) return color;
  const w = Math.max(0, Math.min(1, weight));
  return toHex({
    r: a.r + (b.r - a.r) * w,
    g: a.g + (b.g - a.g) * w,
    b: a.b + (b.b - a.b) * w,
  });
}

function rgba(color, alpha) {
  const rgb = parseHex(color);
  if (!rgb) return `rgba(18,166,122,${alpha})`;
  return `rgba(${rgb.r},${rgb.g},${rgb.b},${alpha})`;
}

export function applyTheme(settingsInput) {
  const settings = normalize(settingsInput);
  const root = document.documentElement;
  const primary = parseHex(settings.primaryColor) ? settings.primaryColor : FALLBACK.primaryColor;
  const accent = parseHex(settings.accentColor) ? settings.accentColor : FALLBACK.accentColor;
  const background = parseHex(settings.backgroundColor) ? settings.backgroundColor : FALLBACK.backgroundColor;

  const vars = {
    '--brand': primary,
    '--brand-strong': mix(primary, '#000000', 0.2),
    '--brand-bright': mix(primary, '#FFFFFF', 0.12),
    '--brand-soft': mix(primary, '#FFFFFF', 0.88),
    '--brand-soft-2': mix(primary, '#FFFFFF', 0.95),
    '--brand-ink': mix(primary, '#000000', 0.35),
    '--accent': accent,
    '--accent-strong': mix(accent, '#000000', 0.12),
    '--accent-soft': mix(accent, '#FFFFFF', 0.86),
    '--bg': background,
    '--bg-soft': mix(primary, '#FFFFFF', 0.95),
    '--shadow-brand': `0 12px 26px ${rgba(primary, 0.22)}`,
  };
  Object.entries(vars).forEach(([key, value]) => root.style.setProperty(key, value));

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', background);

  if (document.body) {
    document.body.style.background = `radial-gradient(1200px 600px at 85% -10%, ${rgba(
      primary,
      0.1
    )}, transparent 60%), radial-gradient(900px 500px at -10% 10%, ${rgba(
      accent,
      0.07
    )}, transparent 55%), ${background}`;
  }
}

function setTextAll(selector, value) {
  if (value === undefined || value === null) return;
  document.querySelectorAll(selector).forEach((el) => {
    el.textContent = value;
  });
}

function applyLogo(settings) {
  const logo = String(settings.logoUrl || '').trim();
  document.querySelectorAll('.brand-mark').forEach((mark) => {
    if (logo) {
      mark.innerHTML = `<img src="${logo}" alt="" loading="lazy">`;
    }
  });
  if (logo) {
    document.querySelectorAll('.brand-mark img').forEach((img) => {
      img.addEventListener('error', () => {
        img.remove();
      });
    });
  }
  if (settings.faviconUrl) {
    const icon = document.querySelector('link[rel="icon"]');
    if (icon) icon.setAttribute('href', settings.faviconUrl);
  }
}

function applyNotice(settings) {
  let bar = document.querySelector('[data-site-notice]');
  const text = String(settings.noticeText || '').trim();
  if (!text) {
    if (bar) bar.remove();
    return;
  }
  if (!bar) {
    bar = document.createElement('div');
    bar.className = 'site-notice';
    bar.setAttribute('data-site-notice', '');
    const header = document.querySelector('.site-header');
    if (header && header.parentNode) header.parentNode.insertBefore(bar, header);
    else document.body.insertBefore(bar, document.body.firstChild);
  }
  bar.textContent = text;
}

export function applyBranding(settingsInput) {
  const settings = normalize(settingsInput);
  applyLogo(settings);
  applyNotice(settings);

  setTextAll('[data-brand-name]', settings.brandName);
  setTextAll('[data-brand-subtitle]', settings.brandSubtitle);
  setTextAll('[data-brand-tagline]', settings.brandTagline);
  setTextAll('[data-footer-description]', settings.footerDescription);
  setTextAll('[data-footer-hours]', settings.footerHours);
  setTextAll('[data-footer-notice]', settings.footerNotice);
  setTextAll(
    '[data-footer-copyright]',
    settings.footerCopyright || `© ${new Date().getFullYear()} ${settings.brandName}`
  );
  setTextAll('[data-footer-payment-note]', settings.footerPaymentNote);

  const description = document.querySelector('meta[name="description"]');
  if (description) {
    description.setAttribute(
      'content',
      settings.brandTagline
        ? `${settings.brandName}：${settings.brandTagline}`
        : settings.brandName
    );
  }

  document.querySelectorAll('[data-brand-link]').forEach((el) => {
    el.setAttribute('aria-label', `${settings.brandName} 首页`);
  });

  const tipsList = document.querySelector('[data-footer-tips]');
  if (tipsList && Array.isArray(settings.footerShoppingTips)) {
    tipsList.innerHTML = settings.footerShoppingTips
      .filter(Boolean)
      .map((tip) => `<p>· ${escapeText(tip)}</p>`)
      .join('');
  }
}

function escapeText(value) {
  return String(value === undefined || value === null ? '' : value).replace(
    /[&<>"']/g,
    (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]
  );
}

export function brandName() {
  return currentSettings().brandName || FALLBACK.brandName;
}
