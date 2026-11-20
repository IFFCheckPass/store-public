import express from 'express';
import { db } from '../db.js';

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

router.get('/', (req, res) => {
  const rows = db
    .prepare("SELECT * FROM products WHERE status = 'on' ORDER BY id ASC")
    .all();
  return res.json({ products: rows.map(productView) });
});

router.get('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(404).json({ error: '商品不存在' });
  const row = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: '商品不存在' });
  return res.json({ product: productView(row) });
});

export default router;
