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

/** 图片地址最长 500 字符（前端 <img src> 用不到更长，缩短可减少存储型注入面） */
const IMAGE_URL_MAX_LENGTH = 500;
/** 会破坏 HTML 属性或开标签的字符：引号、尖括号、反引号 */
const URL_FORBIDDEN_RE = /["'<>`]/;
/** 空白与控制字符（\s 含常规空白，另外补上 C0 控制符与 DEL） */
const URL_SPACE_CONTROL_RE = /[\s\u0000-\u001f\u007f]/;
/** 站内路径只允许 URL 路径里常见的可见字符，且必须以单个 / 开头（排除 //host 协议相对地址） */
const SITE_PATH_RE = /^\/[A-Za-z0-9\-._~!$&()*+,;=:@%?#/]*$/;

function readString(value, label, limit) {
  if (typeof value !== 'string') throw badRequest(`${label}格式不正确`);
  const text = value.trim();
  if (text.length > limit) throw badRequest(`${label}不能超过 ${limit} 个字符`);
  return text;
}

function isHttpUrl(text) {
  let parsed;
  try {
    parsed = new URL(text);
  } catch {
    return false;
  }
  return parsed.protocol === 'http:' || parsed.protocol === 'https:';
}

/**
 * 校验站内路径 / http(s) 图片地址。
 * 除协议与长度外，必须拒绝能跳出 HTML 属性或注入标签的字符，
 * 否则 logoUrl 之类会被拼进 <img src="..."> 造成存储型 XSS。
 */
function readImageUrl(value, label) {
  const text = readString(value, label, IMAGE_URL_MAX_LENGTH);
  if (!text) return '';
  if (URL_FORBIDDEN_RE.test(text) || URL_SPACE_CONTROL_RE.test(text)) {
    throw badRequest(`${label}不能包含引号、尖括号、反引号或空白字符`);
  }
  if (/^https?:\/\//i.test(text)) {
    if (!isHttpUrl(text)) throw badRequest(`${label}不是合法的 http(s) 地址`);
    return text;
  }
  if (text.startsWith('/')) {
    // //evil.com/x 是协议相对地址，会被浏览器当成外站请求，不接受
    if (text.startsWith('//')) throw badRequest(`${label}需要是站内路径或 http(s) 图片地址`);
    if (!SITE_PATH_RE.test(text)) throw badRequest(`${label}站内路径包含不支持的字符`);
    return text;
  }
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
