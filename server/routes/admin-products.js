import express from 'express';
import { db } from '../db.js';
import { requireStaff } from '../auth.js';
import { audit } from '../lib/audit.js';
import { badRequest, str } from '../lib/validate.js';

const router = express.Router();
const adminOnly = requireStaff(['super_admin', 'admin']);

const COLOR_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function parseJsonArray(text) {
  try {
    const value = JSON.parse(text || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function imageUrl(value, label) {
  const text = str(value);
  if (!text) return '';
  if (text.length > 2000) throw badRequest(`${label}不能超过 2000 个字符`);
  if (text.startsWith('/') || /^https?:\/\//i.test(text)) return text;
  throw badRequest(`${label}需要是站内路径或 http(s) 图片地址`);
}

function readSpecs(value) {
  if (!Array.isArray(value)) throw badRequest('规格格式不正确');
  if (value.length < 1) throw badRequest('请至少添加一个规格');
  if (value.length > 10) throw badRequest('规格最多 10 项');
  return value.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw badRequest(`第 ${index + 1} 个规格格式不正确`);
    }
    const name = str(item.name);
    if (!name) throw badRequest(`第 ${index + 1} 个规格名称不能为空`);
    if (name.length > 30) throw badRequest('规格名称不能超过 30 个字符');
    const delta = Number(item.delta ?? 0);
    if (!Number.isInteger(delta) || delta < -100000 || delta > 100000) {
      throw badRequest('规格加价需为 -1000.00 到 1000.00 元之间的金额');
    }
    return { name, delta };
  });
}

function readColors(value) {
  if (!Array.isArray(value)) throw badRequest('颜色格式不正确');
  if (value.length < 1) throw badRequest('请至少添加一个颜色');
  if (value.length > 12) throw badRequest('颜色最多 12 项');
  return value.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw badRequest(`第 ${index + 1} 个颜色格式不正确`);
    }
    const name = str(item.name);
    if (!name) throw badRequest(`第 ${index + 1} 个颜色名称不能为空`);
    if (name.length > 30) throw badRequest('颜色名称不能超过 30 个字符');
    const hex = str(item.hex) || '#D8E6E0';
    if (!COLOR_RE.test(hex)) throw badRequest('颜色值需要是 #RRGGBB');
    return {
      name,
      hex,
      image: imageUrl(item.image, `第 ${index + 1} 个颜色图片`),
      custom: item.custom === true || item.custom === 1,
    };
  });
}

/** 定制图案：名称 + 叠加图 + 加价 + 是否「定制」选项 */
function readPatterns(value) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw badRequest('图案格式不正确');
  if (value.length > 20) throw badRequest('图案最多 20 项');
  return value.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw badRequest(`第 ${index + 1} 个图案格式不正确`);
    }
    const name = str(item.name);
    if (!name) throw badRequest(`第 ${index + 1} 个图案名称不能为空`);
    if (name.length > 30) throw badRequest('图案名称不能超过 30 个字符');
    const image = imageUrl(item.image, `第 ${index + 1} 个图案叠加图`);
    if (!image) throw badRequest(`第 ${index + 1} 个图案需要上传叠加图`);
    const delta = Number(item.delta ?? 0);
    if (!Number.isInteger(delta) || delta < 0 || delta > 10000000) {
      throw badRequest(`第 ${index + 1} 个图案加价需为 0 到 100000 元之间的金额`);
    }
    return { name, image, delta, custom: item.custom === true || item.custom === 1 };
  });
}

function normalizeInteger(value, label, min, max) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) {
    throw badRequest(`${label}需为 ${min} 到 ${max} 之间的整数`);
  }
  return number;
}

function buildProduct(body, existing) {
  const base = existing
    ? {
        name: existing.name,
        category: existing.category || '',
        description: existing.description || '',
        basePrice: existing.base_price,
        coverUrl: existing.cover_url || '',
        stock: existing.stock,
        needProduction: existing.need_production === 1,
        isPresale: existing.is_presale === 1,
        presaleEta: existing.presale_eta || '',
        status: existing.status || 'on',
        specs: parseJsonArray(existing.specs_json),
        colors: parseJsonArray(existing.colors_json),
        isCustom: existing.is_custom === 1,
        patterns: parseJsonArray(existing.patterns_json),
      }
    : {
        name: '',
        category: '',
        description: '',
        basePrice: null,
        coverUrl: '',
        stock: 0,
        needProduction: false,
        isPresale: false,
        presaleEta: '',
        status: 'on',
        specs: [],
        colors: [],
        isCustom: false,
        patterns: [],
      };

  const name = body.name === undefined ? base.name : str(body.name);
  if (!name) throw badRequest('请填写商品名称');
  if (name.length > 60) throw badRequest('商品名称不能超过 60 个字符');

  const category = body.category === undefined ? base.category : str(body.category);
  if (category.length > 20) throw badRequest('商品分类不能超过 20 个字符');

  const description = body.description === undefined ? base.description : str(body.description);
  if (description.length > 1000) throw badRequest('商品描述不能超过 1000 个字符');

  const basePrice =
    body.basePrice === undefined
      ? base.basePrice
      : normalizeInteger(body.basePrice, '商品价格（分）', 0, 100000000);
  if (basePrice === null) throw badRequest('请填写商品价格');

  const stock =
    body.stock === undefined ? base.stock : normalizeInteger(body.stock, '库存', 0, 10000000);

  const needProduction =
    body.needProduction === undefined
      ? base.needProduction
      : body.needProduction === true || body.needProduction === 1;

  const isPresale =
    body.isPresale === undefined
      ? base.isPresale
      : body.isPresale === true || body.isPresale === 1;

  const presaleEta = body.presaleEta === undefined ? base.presaleEta : str(body.presaleEta);
  if (presaleEta.length > 60) throw badRequest('预计配货时间不能超过 60 个字符');

  const status = body.status === undefined ? base.status : str(body.status);
  if (!['on', 'off'].includes(status)) throw badRequest('商品状态不正确');

  const coverUrl = body.coverUrl === undefined ? base.coverUrl : imageUrl(body.coverUrl, '商品封面图');
  const specs = body.specs === undefined ? base.specs : readSpecs(body.specs);
  const colors = body.colors === undefined ? base.colors : readColors(body.colors);
  const isCustom =
    body.isCustom === undefined ? base.isCustom : body.isCustom === true || body.isCustom === 1;
  const patterns = body.patterns === undefined ? base.patterns : readPatterns(body.patterns);

  if (!specs.length) throw badRequest('请至少添加一个规格');
  if (!colors.length) throw badRequest('请至少添加一个颜色');
  if (isCustom && !patterns.length) throw badRequest('定制商品请至少添加一个图案选项');

  return {
    name,
    category,
    description,
    basePrice,
    stock,
    needProduction: needProduction ? 1 : 0,
    isPresale: isPresale ? 1 : 0,
    presaleEta,
    status,
    coverUrl,
    specs,
    colors,
    isCustom: isCustom ? 1 : 0,
    patterns,
  };
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
    status: row.status,
    specs: parseJsonArray(row.specs_json),
    colors: parseJsonArray(row.colors_json),
    isCustom: row.is_custom === 1,
    patterns: parseJsonArray(row.patterns_json),
    createdAt: row.created_at,
  };
}

router.get('/', adminOnly, (req, res) => {
  const rows = db.prepare('SELECT * FROM products ORDER BY id DESC').all();
  return res.json({ products: rows.map(productView) });
});

router.post('/', adminOnly, (req, res, next) => {
  try {
    const product = buildProduct(req.body || {}, null);
    const info = db
      .prepare(`
        INSERT INTO products (name, category, description, base_price, cover_url, stock,
          need_production, is_presale, presale_eta, specs_json, colors_json, is_custom, patterns_json, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now','localtime'))
      `)
      .run(
        product.name,
        product.category,
        product.description,
        product.basePrice,
        product.coverUrl,
        product.stock,
        product.needProduction,
        product.isPresale,
        product.presaleEta || null,
        JSON.stringify(product.specs),
        JSON.stringify(product.colors),
        product.isCustom,
        JSON.stringify(product.patterns),
        product.status
      );
    const row = db.prepare('SELECT * FROM products WHERE id = ?').get(Number(info.lastInsertRowid));
    audit(
      'staff',
      Number(req.staff.sub),
      req.staff.name || '',
      'product.create',
      `新建商品 #${row.id} ${row.name}`
    );
    return res.status(201).json({ product: productView(row) });
  } catch (err) {
    return next(err);
  }
});

router.patch('/:id', adminOnly, (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const existing = Number.isInteger(id)
      ? db.prepare('SELECT * FROM products WHERE id = ?').get(id)
      : undefined;
    if (!existing) return res.status(404).json({ error: '商品不存在' });

    const product = buildProduct(req.body || {}, existing);
    db.prepare(`
      UPDATE products SET name = ?, category = ?, description = ?, base_price = ?, cover_url = ?,
        stock = ?, need_production = ?, is_presale = ?, presale_eta = ?, specs_json = ?, colors_json = ?,
        is_custom = ?, patterns_json = ?, status = ?
      WHERE id = ?
    `).run(
      product.name,
      product.category,
      product.description,
      product.basePrice,
      product.coverUrl,
      product.stock,
      product.needProduction,
      product.isPresale,
      product.presaleEta || null,
      JSON.stringify(product.specs),
      JSON.stringify(product.colors),
      product.isCustom,
      JSON.stringify(product.patterns),
      product.status,
      id
    );

    const row = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
    audit(
      'staff',
      Number(req.staff.sub),
      req.staff.name || '',
      'product.update',
      `编辑商品 #${id} ${row.name}`
    );
    return res.json({ product: productView(row) });
  } catch (err) {
    return next(err);
  }
});

export default router;
