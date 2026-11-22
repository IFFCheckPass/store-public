/**
 * 统一计价：下单、赠货码预览、列表展示都走这一份实现，
 * 避免「预览一个价、下单另一个价」的不一致。
 *
 * 单价 = 商品基础价 + 规格加价 + 颜色加价 + 图案加价（单位：分）
 */
export function parseJsonArray(text) {
  try {
    const value = JSON.parse(text || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

export function computeItemPricing(product, options = {}) {
  const specName = String(options.specName || '');
  const colorName = String(options.colorName || '');
  const patternName = String(options.patternName || '');

  const specs = parseJsonArray(product.specs_json);
  const colors = parseJsonArray(product.colors_json);
  const patterns = parseJsonArray(product.patterns_json);

  const spec = specs.length ? specs.find((item) => item.name === specName) || null : null;
  const color = colors.length ? colors.find((item) => item.name === colorName) || null : null;
  const pattern = patterns.length ? patterns.find((item) => item.name === patternName) || null : null;

  const basePrice = Number(product.base_price) || 0;
  const unitPrice =
    basePrice +
    (spec ? Number(spec.delta) || 0 : 0) +
    (color ? Number(color.delta) || 0 : 0) +
    (pattern ? Number(pattern.delta) || 0 : 0);

  return { spec, color, pattern, unitPrice };
}
