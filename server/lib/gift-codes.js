import { db } from '../db.js';
import { ApiError } from './validate.js';

/**
 * 全场赠货码（scope='all'）单笔订单的默认免单件数上限。
 *
 * db.js 已由另一位工程师加了 gift_codes.max_free_items（INTEGER，没有 DEFAULT），
 * 历史行与新行都是 NULL。若把 NULL 直接当成「不限」，默认 10 件限制会完全失效，
 * 所以这里把 NULL/缺失都视作「未配置 → 默认 10」；确实需要不限时由调用方显式传
 * computeGiftDiscount(row, items, { maxFreeItems: null })。
 * 若后续把该列改成 INTEGER DEFAULT 10 并在管理端写值，这里会自动按行值生效。
 */
export const DEFAULT_MAX_FREE_ITEMS = 10;

/** 全场赠货码超出免单件数上限时抛出，status=400，可被全局错误处理器直接返回。 */
export class GiftCodeLimitError extends ApiError {
  /**
   * @param {number} maxFreeItems 上限件数
   * @param {number} totalItems    本次实际件数
   */
  constructor(maxFreeItems, totalItems) {
    super(400, `全场赠货码单笔最多免单 ${maxFreeItems} 件，本次共 ${totalItems} 件`);
    this.name = 'GiftCodeLimitError';
    this.code = 'GIFT_MAX_FREE_ITEMS';
    this.maxFreeItems = maxFreeItems;
    this.totalItems = totalItems;
  }
}

/**
 * 统计这一单的件数：优先读 item.quantity（正整数），缺失时按 1 件计。
 * 下单流程（orders.js）当前还没把 quantity 传进来，务必补上，否则多件商品会被低估。
 */
export function countGiftItems(items) {
  if (!Array.isArray(items)) return 0;
  return items.reduce((sum, item) => {
    const quantity = Number(item?.quantity);
    return sum + (Number.isInteger(quantity) && quantity > 0 ? quantity : 1);
  }, 0);
}

function normalizeLimit(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) return DEFAULT_MAX_FREE_ITEMS;
  return n;
}

function resolveMaxFreeItems(row, options) {
  // 调用方显式传 maxFreeItems: null = 不限；传正整数 = 覆盖为指定件数
  if (options && Object.prototype.hasOwnProperty.call(options, 'maxFreeItems')) {
    if (options.maxFreeItems === null) return null;
    return normalizeLimit(options.maxFreeItems);
  }
  // 行上有值才采用；NULL 视作未配置，回落到默认 10（见文件头说明）
  if (row && row.max_free_items !== undefined && row.max_free_items !== null) {
    return normalizeLimit(row.max_free_items);
  }
  return DEFAULT_MAX_FREE_ITEMS;
}

export function parseScope(row) {
  const type = row.scope_type || 'all';
  if (type === 'products' || type === 'skus') {
    try {
      const parsed = JSON.parse(row.scope_json || '{}');
      if (type === 'products') {
        const productIds = Array.isArray(parsed.productIds)
          ? parsed.productIds.map((id) => Number(id)).filter(Number.isInteger)
          : [];
        if (productIds.length) return { type, productIds };
      } else if (Array.isArray(parsed.skus)) {
        const skus = parsed.skus
          .filter((item) => item && Number.isInteger(Number(item.productId)))
          .map((item) => ({
            productId: Number(item.productId),
            specName: typeof item.specName === 'string' ? item.specName : '',
            colorName: typeof item.colorName === 'string' ? item.colorName : '',
          }));
        if (skus.length) return { type, skus };
      }
    } catch {
      // fall through to all
    }
  }
  return { type: 'all' };
}

export function scopeLabel(row) {
  const scope = parseScope(row);
  if (scope.type === 'products') return '指定商品免费';
  if (scope.type === 'skus') return '指定规格免费';
  return '全场免单';
}

export function loadUsableGiftCode(codeValue) {
  const code = String(codeValue || '').trim().toUpperCase();
  if (!code) throw new ApiError(400, '请填写赠货码');

  const row = db.prepare('SELECT * FROM gift_codes WHERE code = ?').get(code);
  if (!row) throw new ApiError(400, '赠货码不存在');
  if (row.active !== 1) throw new ApiError(400, '赠货码已停用');
  if (row.expires_at) {
    const expired = db
      .prepare("SELECT datetime('now','localtime') > ? AS expired")
      .get(row.expires_at);
    if (Number(expired.expired) === 1) throw new ApiError(400, '赠货码已过期');
  }
  if (row.used_count >= row.max_uses) throw new ApiError(400, '赠货码已用尽');
  return row;
}

function matches(scope, item) {
  if (scope.type === 'all') return true;
  if (scope.type === 'products') return scope.productIds.includes(Number(item.productId));
  return scope.skus.some(
    (sku) =>
      sku.productId === Number(item.productId) &&
      (!sku.specName || sku.specName === (item.specName || '')) &&
      (!sku.colorName || sku.colorName === (item.colorName || ''))
  );
}

/**
 * 计算赠货码可抵扣金额。
 *
 * 调用方式（对旧调用保持兼容）：
 *   const { discount, freeIndexes } = computeGiftDiscount(giftRow, giftItems);
 *   // 默认：scope='all' 的码超过 10 件时抛 GiftCodeLimitError（status=400），
 *   //       交给全局错误处理器即可返回 400 + 明确错误文案。
 *
 *   const calc = computeGiftDiscount(giftRow, giftItems, { throwOnLimit: false });
 *   // 不抛异常：返回 { limitExceeded: true, discount: 0, freeIndexes: [], maxFreeItems, totalItems }，
 *   // 调用方自己决定提示方式（注意 discount 为 0，避免超限订单被误免单）。
 *
 *   computeGiftDiscount(row, items, { maxFreeItems: 20 });   // 临时放宽到 20 件
 *   computeGiftDiscount(row, items, { maxFreeItems: null }); // 不限件数
 *
 * 上限来源优先级：options.maxFreeItems > gift_code 行上的 max_free_items 列（有值才用）
 * > DEFAULT_MAX_FREE_ITEMS（10）；行上为 NULL 视作未配置，按 10 件处理（见文件头说明）。
 * 只限制 scope='all'；指定商品/规格的码本身有白名单，不做件数限制。
 *
 * @param {object} row     gift_codes 行
 * @param {Array<{productId:number, specName?:string, colorName?:string, subtotal:number, quantity?:number}>} items
 * @param {{ maxFreeItems?: number|null, throwOnLimit?: boolean }} [options]
 * @returns {{ discount: number, freeIndexes: number[], scope: object, limitExceeded: boolean,
 *             maxFreeItems: number|null, totalItems: number }}
 */
export function computeGiftDiscount(row, items, options = {}) {
  const list = Array.isArray(items) ? items : [];
  const scope = parseScope(row);
  const totalItems = countGiftItems(list);

  let maxFreeItems = null;
  if (scope.type === 'all') {
    maxFreeItems = resolveMaxFreeItems(row, options);
    if (maxFreeItems !== null && totalItems > maxFreeItems) {
      if (options.throwOnLimit === false) {
        return {
          discount: 0,
          freeIndexes: [],
          scope,
          limitExceeded: true,
          maxFreeItems,
          totalItems,
        };
      }
      throw new GiftCodeLimitError(maxFreeItems, totalItems);
    }
  }

  let discount = 0;
  const freeIndexes = [];
  list.forEach((item, index) => {
    if (!matches(scope, item)) return;
    const subtotal = Number(item.subtotal) || 0;
    if (subtotal <= 0) return;
    discount += subtotal;
    freeIndexes.push(index);
  });
  return { discount, freeIndexes, scope, limitExceeded: false, maxFreeItems, totalItems };
}
