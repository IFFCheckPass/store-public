import { db } from '../db.js';
import { ApiError } from './validate.js';

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

export function computeGiftDiscount(row, items) {
  const scope = parseScope(row);
  let discount = 0;
  const freeIndexes = [];
  items.forEach((item, index) => {
    if (!matches(scope, item)) return;
    const subtotal = Number(item.subtotal) || 0;
    if (subtotal <= 0) return;
    discount += subtotal;
    freeIndexes.push(index);
  });
  return { discount, freeIndexes, scope };
}
