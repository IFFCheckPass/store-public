import express from 'express';
import { db } from '../db.js';
import { str } from '../lib/validate.js';
import {
  computeGiftDiscount,
  loadUsableGiftCode,
  parseScope,
  scopeLabel,
} from '../lib/gift-codes.js';

const router = express.Router();

function parseJsonArray(text) {
  try {
    const value = JSON.parse(text || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function previewItems(itemsInput) {
  if (!Array.isArray(itemsInput) || itemsInput.length === 0) return null;
  const resolved = [];
  for (const raw of itemsInput.slice(0, 50)) {
    if (!raw || typeof raw !== 'object') continue;
    const productId = Number(raw.productId);
    const quantity = Number(raw.quantity);
    if (!Number.isInteger(productId) || !Number.isInteger(quantity) || quantity < 1) continue;
    const product = db.prepare("SELECT * FROM products WHERE id = ? AND status = 'on'").get(productId);
    if (!product) continue;
    const specName = str(raw.specName);
    const colorName = str(raw.colorName);
    const spec = parseJsonArray(product.specs_json).find((item) => item.name === specName);
    const color = parseJsonArray(product.colors_json).find((item) => item.name === colorName);
    const unitPrice = product.base_price + (spec ? Number(spec.delta) || 0 : 0);
    resolved.push({
      productId,
      specName: spec ? spec.name : '',
      colorName: color ? color.name : '',
      quantity,
      subtotal: unitPrice * quantity,
    });
  }
  return resolved;
}

router.post('/validate', (req, res) => {
  const code = str(req.body?.code).toUpperCase();
  let row;
  try {
    row = loadUsableGiftCode(code);
  } catch (err) {
    return res.status(400).json({ valid: false, error: err.message || '赠货码无效' });
  }

  const scope = parseScope(row);
  const result = {
    valid: true,
    code: row.code,
    note: row.note,
    remaining: row.max_uses - row.used_count,
    scopeType: scope.type,
    scopeLabel: scopeLabel(row),
  };

  const items = previewItems(req.body?.items);
  if (items && items.length) {
    const { discount, freeIndexes } = computeGiftDiscount(row, items);
    const total = items.reduce((sum, item) => sum + item.subtotal, 0);
    // 整单金额为 0（如免费商品）时，赠货码依然有效且无需支付
    if (total <= 0) {
      return res.json({
        ...result,
        discount: 0,
        originalTotal: 0,
        payable: 0,
        coveredAll: true,
        freeItemCount: items.length,
      });
    }
    if (discount <= 0) {
      return res.status(400).json({
        valid: false,
        error:
          scope.type === 'all'
            ? '赠货码暂不可用于当前商品'
            : '该赠货码仅适用于指定商品/规格，当前购物车中没有可用商品',
      });
    }
    const payable = Math.max(0, total - discount);
    return res.json({
      ...result,
      discount,
      originalTotal: total,
      payable,
      coveredAll: payable === 0,
      freeItemCount: freeIndexes.length,
    });
  }

  return res.json(result);
});

export default router;
