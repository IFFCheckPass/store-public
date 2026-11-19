import { badRequest } from './validate.js';

const TEXT_LIMITS = {
  brandName: 40,
  brandSubtitle: 80,
  brandTagline: 80,
  noticeText: 200,
  heroEyebrow: 80,
  heroTitle: 120,
  heroHighlight: 30,
  heroSubtitle: 300,
  heroButtonText: 20,
  shopTitle: 40,
  shopSubtitle: 200,
  footerDescription: 300,
  footerHours: 100,
  footerNotice: 200,
  footerCopyright: 160,
  footerPaymentNote: 200,
  paymentTitle: 60,
  paymentSubtitle: 200,
  paymentNote: 120,
  paymentTip: 300,
};

const URL_FIELDS = ['logoUrl', 'faviconUrl', 'qrWechatUrl', 'qrAlipayUrl'];
const COLOR_FIELDS = ['primaryColor', 'accentColor', 'backgroundColor'];
const COLOR_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function readString(value, label, limit) {
  if (typeof value !== 'string') throw badRequest(`${label}格式不正确`);
  const text = value.trim();
  if (text.length > limit) throw badRequest(`${label}不能超过 ${limit} 个字符`);
  return text;
}

function readImageUrl(value, label) {
  const text = readString(value, label, 2000);
  if (!text) return '';
  if (text.startsWith('/') || /^https?:\/\//i.test(text)) return text;
  throw badRequest(`${label}需要是站内路径或 http(s) 图片地址`);
}

function readStringList(value, label, maxItems, maxLength) {
  if (!Array.isArray(value)) throw badRequest(`${label}格式不正确`);
  if (value.length > maxItems) throw badRequest(`${label}最多 ${maxItems} 项`);
  return value.map((item) => readString(item, label, maxLength)).filter(Boolean);
}

export function normalizeSettingsPatch(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw badRequest('设置内容格式不正确');
  }

  const patch = {};

  for (const [key, limit] of Object.entries(TEXT_LIMITS)) {
    if (input[key] === undefined) continue;
    patch[key] = readString(input[key], key, limit);
  }

  for (const key of URL_FIELDS) {
    if (input[key] === undefined) continue;
    patch[key] = readImageUrl(input[key], key);
  }

  for (const key of COLOR_FIELDS) {
    if (input[key] === undefined) continue;
    const value = readString(input[key], key, 7);
    if (!COLOR_RE.test(value)) throw badRequest(`${key}需要是 #RRGGBB 颜色值`);
    patch[key] = value;
  }

  if (input.heroTrust !== undefined) {
    patch.heroTrust = readStringList(input.heroTrust, '首页卖点', 8, 30);
  }

  if (input.footerShoppingTips !== undefined) {
    patch.footerShoppingTips = readStringList(input.footerShoppingTips, '购物说明', 8, 60);
  }

  if (input.paymentTutorial !== undefined) {
    if (!Array.isArray(input.paymentTutorial)) throw badRequest('支付教程格式不正确');
    if (input.paymentTutorial.length > 8) throw badRequest('支付教程最多 8 步');
    patch.paymentTutorial = input.paymentTutorial.map((step, index) => {
      if (!step || typeof step !== 'object' || Array.isArray(step)) {
        throw badRequest(`第 ${index + 1} 个支付教程步骤格式不正确`);
      }
      const title = readString(step.title, `第 ${index + 1} 个教程标题`, 40);
      if (!title) throw badRequest(`第 ${index + 1} 个教程标题不能为空`);
      const desc = step.desc === undefined ? '' : readString(step.desc, `第 ${index + 1} 个教程说明`, 100);
      return { title, desc };
    });
  }

  return patch;
}
