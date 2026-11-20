export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
  }
}

export function badRequest(message) {
  return new ApiError(400, message);
}

export function notFound(message = '资源不存在') {
  return new ApiError(404, message);
}

export function str(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function isNonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

export function isPositiveInt(value, min = 1, max = Number.MAX_SAFE_INTEGER) {
  const n = Number(value);
  return Number.isInteger(n) && n >= min && n <= max;
}

export const TIME_SLOTS = ['day_break', 'noon', 'evening', 'evening_study'];
export const DELIVERY_METHODS = ['class'];
export const CONTACT_TYPES = ['qq', 'wechat', 'phone'];
export const PAYMENT_METHODS = ['wechat', 'alipay', 'gift'];

export function assertTimeSlot(value) {
  if (!TIME_SLOTS.includes(value)) throw badRequest('请选择有效的时间段');
  return value;
}

export function assertDeliveryMethod(value) {
  if (!DELIVERY_METHODS.includes(value)) throw badRequest('请选择有效的配送方式');
  return value;
}

export function assertPaymentMethod(value) {
  if (!PAYMENT_METHODS.includes(value)) throw badRequest('请选择有效的支付方式');
  return value;
}

export function assertContact(contactType, contactValue) {
  if (!CONTACT_TYPES.includes(contactType)) throw badRequest('请选择有效的联系方式类型');
  const value = str(contactValue);
  if (!value) throw badRequest('请填写联系方式');
  if (contactType === 'qq' && !/^\d{5,12}$/.test(value)) {
    throw badRequest('QQ 号格式不正确');
  }
  if (contactType === 'wechat' && !/^[A-Za-z0-9_-]{5,30}$/.test(value)) {
    throw badRequest('微信号格式不正确');
  }
  if (contactType === 'phone' && !/^1[3-9]\d{9}$/.test(value)) {
    throw badRequest('手机号格式不正确');
  }
  return value;
}

/** 未预置学号的占位值：账号首次登录后需引导本人补全真实学号 */
export const PLACEHOLDER_STUDENT_ID = '00000000';

export function isPlaceholderStudentId(value) {
  return str(value) === PLACEHOLDER_STUDENT_ID;
}

export function assertStudentId(value, { required = true } = {}) {
  const v = str(value);
  if (!v) {
    if (required) throw badRequest('请填写学号');
    return '';
  }
  if (!/^[A-Za-z0-9]{6,20}$/.test(v)) throw badRequest('学号需为 6-20 位字母或数字');
  return v;
}

/** 班级统一格式：高二(3)班，年段为 高一/高二/高三，班级号 1-17 */
export function assertClassName(value) {
  const normalized = str(value)
    .replace(/[（]/g, '(')
    .replace(/[）]/g, ')')
    .replace(/\s+/g, '')
    .replace(/班$/, '');
  const match = normalized.match(/^(高一|高二|高三)\(?(\d{1,2})\)?$/);
  if (!match) throw badRequest('请选择年段并填写 1-17 的班级号');
  const classNo = Number(match[2]);
  if (!Number.isInteger(classNo) || classNo < 1 || classNo > 17) {
    throw badRequest('班级号需在 1-17 之间');
  }
  return `${match[1]}(${classNo})班`;
}

export function assertPassword(value) {
  const v = typeof value === 'string' ? value : '';
  if (v.length < 6) throw badRequest('密码长度不能少于 6 位');
  if (v.length > 72) throw badRequest('密码长度不能超过 72 位');
  return v;
}

export function assertAmount(value, label = '金额') {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) throw badRequest(`${label}必须为非负整数（分）`);
  return n;
}

const DATETIME_RE = /^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?)?$/;

export function assertDateTime(value, label = '时间') {
  const v = str(value);
  if (!v) return null;
  if (!DATETIME_RE.test(v)) throw badRequest(`${label}格式应为 YYYY-MM-DD 或 YYYY-MM-DD HH:MM:SS`);
  const normalized = v.replace('T', ' ');
  const time = Date.parse(normalized.replace(' ', 'T'));
  if (Number.isNaN(time)) throw badRequest(`${label}不是有效日期`);
  return normalized.length === 10 ? `${normalized} 23:59:59` : normalized;
}

export function toInt(value, fallback) {
  const n = Number(value);
  return Number.isInteger(n) ? n : fallback;
}

export function boolParam(value) {
  return value === '1' || value === 'true' || value === true || value === 1;
}

export function paginationLimit(value, fallback = 100, max = 500) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) return fallback;
  return Math.min(n, max);
}
