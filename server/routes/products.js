import express from 'express';
import { db } from '../db.js';
import { STAFF_COOKIE, verifyToken } from '../auth.js';

const router = express.Router();

function parseJson(text, fallback) {
  if (!text) return fallback;
  try {
    const value = JSON.parse(text);
    return Array.isArray(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

function productView(row) {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    description: row.description,
    basePrice: row.base_price,
    coverUrl: row.cover_url,
    stock: row.stock,
    needProduction: row.need_production === 1,
    isPresale: row.is_presale === 1,
    presaleEta: row.presale_eta || '',
    specs: parseJson(row.specs_json, []),
    colors: parseJson(row.colors_json, []),
    isCustom: row.is_custom === 1,
    patterns: parseJson(row.patterns_json, []),
  };
}

/**
 * 可选 staff 会话：只读判定，不拦截请求。
 * 复用 auth.js 已有的签名校验（verifyToken）与 staff 表状态检查，
 * 不新增鉴权机制；会话无效/过期时按匿名处理。
 *
 * @returns {Promise<{sub:number, role:string}|null>}
 */
async function staffSession(req) {
  const token = req.cookies?.[STAFF_COOKIE];
  if (!token) return null;
  const payload = await verifyToken(token);
  if (!payload || payload.type !== 'staff') return null;
  const staff = db.prepare('SELECT id, role, status FROM staff WHERE id = ?').get(Number(payload.sub));
  if (!staff || staff.status !== 'active') return null;
  return { sub: staff.id, role: staff.role };
}

router.get('/', (req, res) => {
  const rows = db
    .prepare("SELECT * FROM products WHERE status = 'on' ORDER BY id ASC")
    .all();
  return res.json({ products: rows.map(productView) });
});

router.get('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(404).json({ error: '商品不存在' });
    const row = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
    // 下架商品只对有效 staff 会话可见；匿名访客与普通用户一律 404，
    // 避免通过商品 id 枚举未上架/已下架商品（包括价格与图片）。
    if (!row || (row.status !== 'on' && !(await staffSession(req)))) {
      return res.status(404).json({ error: '商品不存在' });
    }
    return res.json({ product: productView(row) });
  } catch (err) {
    return next(err);
  }
});

export default router;
