import express from 'express';
import { db } from '../db.js';
import { requireUser } from '../auth.js';
import { str } from '../lib/validate.js';
import { computeItemPricing } from '../lib/pricing.js';
import {
  GiftCodeLimitError,
  computeGiftDiscount,
  loadUsableGiftCode,
  parseScope,
  scopeLabel,
} from '../lib/gift-codes.js';

const router = express.Router();

/**
 * 赠货码验证限流：同一 IP 每分钟最多 10 次。
 * 说明：计数只存在当前进程内存里，重启即清零；多实例部署时需要换共享存储（如 Redis）。
 */
const VALIDATE_WINDOW_MS = 60 * 1000;
const VALIDATE_MAX_PER_WINDOW = 10;
const validateHits = new Map(); // ip -> { windowStart: number, count: number }

function pruneValidateHits(now) {
  if (validateHits.size < 1000) return;
  for (const [ip, entry] of validateHits) {
    if (now - entry.windowStart >= VALIDATE_WINDOW_MS) validateHits.delete(ip);
  }
}

const LOOPBACK_ADDRESSES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

/**
 * 取限流用的客户端 IP。
 * 线上 store 由 Cloudflare Tunnel 转发到 127.0.0.1，若只用 req.ip，所有公网用户
 * 会共用 127.0.0.1 这一份额度。这里只在「连接确实来自本机」时才信任转发头
 * （cloudflared / 本机反代会写入 CF-Connecting-IP 或 X-Forwarded-For），
 * 内网直连源站时仍用 socket 地址，避免伪造头绕过限流。
 */
function clientIp(req) {
  const remote = req.socket?.remoteAddress || '';
  if (LOOPBACK_ADDRESSES.has(remote)) {
    const cfIp = req.headers['cf-connecting-ip'];
    if (typeof cfIp === 'string' && cfIp.trim()) return cfIp.trim();
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.trim()) {
      return forwarded.split(',')[0].trim();
    }
  }
  return req.ip || remote || 'unknown';
}

function validateRateLimit(req, res, next) {
  const ip = clientIp(req);
  const now = Date.now();
  const entry = validateHits.get(ip);
  if (!entry || now - entry.windowStart >= VALIDATE_WINDOW_MS) {
    pruneValidateHits(now);
    validateHits.set(ip, { windowStart: now, count: 1 });
    return next();
  }
  entry.count += 1;
  if (entry.count > VALIDATE_MAX_PER_WINDOW) {
    const retryAfter = Math.max(
      1,
      Math.ceil((entry.windowStart + VALIDATE_WINDOW_MS - now) / 1000)
    );
    res.set('Retry-After', String(retryAfter));
    return res.status(429).json({ error: '验证太频繁，请稍后再试', retryAfter });
  }
  return next();
}

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
    const patternName = str(raw.patternName);
    // 与下单共用同一份计价（含颜色/图案加价），避免预览金额与实际下单不一致
    const pricing = computeItemPricing(product, { specName, colorName, patternName });
    resolved.push({
      productId,
      specName: pricing.spec ? pricing.spec.name : '',
      colorName: pricing.color ? pricing.color.name : '',
      patternName: pricing.pattern ? pricing.pattern.name : '',
      quantity,
      subtotal: pricing.unitPrice * quantity,
    });
  }
  return resolved;
}

// 需要登录用户才能调用（前端同源请求会自动带 user_session cookie）。
// 限流放在鉴权之后：匿名请求不会占用登录用户的额度，也不会把限流当探测手段。
router.post('/validate', requireUser, validateRateLimit, (req, res) => {
  const code = str(req.body?.code).toUpperCase();
  let row;
  try {
    row = loadUsableGiftCode(code);
  } catch (err) {
    return res.status(400).json({ valid: false, error: err.message || '赠货码无效' });
  }

  const scope = parseScope(row);
  // 注意：不返回 note（内部备注可能包含运营信息，不宜下发给普通用户）
  const result = {
    valid: true,
    code: row.code,
    remaining: row.max_uses - row.used_count,
    scopeType: scope.type,
    scopeLabel: scopeLabel(row),
  };

  const items = previewItems(req.body?.items);
  if (items && items.length) {
    let calc;
    try {
      calc = computeGiftDiscount(row, items);
    } catch (err) {
      if (err instanceof GiftCodeLimitError) {
        return res.status(400).json({
          valid: false,
          code: err.code,
          error: err.message,
          maxFreeItems: err.maxFreeItems,
          totalItems: err.totalItems,
        });
      }
      throw err;
    }
    const { discount, freeIndexes } = calc;
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
