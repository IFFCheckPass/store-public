/**
 * 购物车（localStorage 持久化）
 * 条目唯一键：productId|specName|colorName
 */

const STORAGE_KEY = 'campus_cart_v1';
const MAX_QUANTITY = 99;

function makeKey(productId, specName, colorName, patternName) {
  return `${productId}|${specName || ''}|${colorName || ''}|${patternName || ''}`;
}

function toInt(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? Math.trunc(num) : fallback;
}

function normalize(item) {
  if (!item || item.productId === undefined || item.productId === null) return null;
  const quantity = Math.max(1, toInt(item.quantity, 1));
  const stock = Math.max(0, toInt(item.stock, 0));
  return {
    key:
      item.key ||
      makeKey(item.productId, item.specName, item.colorName, item.patternName),
    productId: item.productId,
    name: String(item.name || '未命名商品'),
    imageUrl: item.imageUrl || '',
    specName: item.specName || '',
    colorName: item.colorName || '',
    colorHex: item.colorHex || '',
    patternName: item.patternName || '',
    patternImage: item.patternImage || '',
    isCustom: Boolean(item.isCustom),
    unitPrice: Math.max(0, toInt(item.unitPrice, 0)),
    quantity: stock > 0 ? Math.min(quantity, stock, MAX_QUANTITY) : Math.min(quantity, MAX_QUANTITY),
    stock
  };
}

function load() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalize).filter(Boolean);
  } catch (err) {
    return [];
  }
}

let items = load();
const listeners = new Set();

function persist() {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch (err) {
    /* localStorage 不可用时静默降级为内存购物车 */
  }
}

function emit() {
  persist();
  const snapshot = getItems();
  listeners.forEach((fn) => {
    try {
      fn(snapshot);
    } catch (err) {
      /* 忽略单个订阅者异常，避免影响其他视图 */
    }
  });
  window.dispatchEvent(new CustomEvent('cart:change'));
}

export function getItems() {
  return items.map((item) => ({ ...item }));
}

export function getItemByKey(key) {
  const found = items.find((item) => item.key === key);
  return found ? { ...found } : null;
}

export function addItem(input) {
  const normalized = normalize(input);
  if (!normalized) return { ok: false, message: '商品信息不完整' };

  const existing = items.find((item) => item.key === normalized.key);
  if (existing) {
    const limit = Math.min(existing.stock > 0 ? existing.stock : Infinity, MAX_QUANTITY);
    const next = existing.quantity + normalized.quantity;
    if (next > limit) {
      existing.quantity = limit;
      emit();
      return { ok: true, merged: true, limited: true, quantity: existing.quantity };
    }
    existing.quantity = next;
    existing.unitPrice = normalized.unitPrice;
    existing.stock = normalized.stock;
    emit();
    return { ok: true, merged: true, limited: false, quantity: existing.quantity };
  }

  const limit = Math.min(normalized.stock > 0 ? normalized.stock : Infinity, MAX_QUANTITY);
  normalized.quantity = Math.min(normalized.quantity, limit);
  items.push(normalized);
  emit();
  return { ok: true, merged: false, limited: false, quantity: normalized.quantity };
}

export function updateQuantity(key, quantity) {
  const target = items.find((item) => item.key === key);
  if (!target) return;
  const qty = Math.max(1, toInt(quantity, 1));
  target.quantity = Math.min(qty, target.stock > 0 ? target.stock : MAX_QUANTITY, MAX_QUANTITY);
  emit();
}

export function removeItem(key) {
  const before = items.length;
  items = items.filter((item) => item.key !== key);
  if (items.length !== before) emit();
}

export function clearCart() {
  if (items.length === 0) return;
  items = [];
  emit();
}

export function getCount() {
  return items.reduce((sum, item) => sum + item.quantity, 0);
}

export function getTotals() {
  return items.reduce(
    (acc, item) => {
      acc.quantity += item.quantity;
      acc.amount += item.unitPrice * item.quantity;
      return acc;
    },
    { quantity: 0, amount: 0 }
  );
}

export function subscribe(fn) {
  if (typeof fn !== 'function') return () => {};
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function cartKey(productId, specName, colorName) {
  return makeKey(productId, specName, colorName);
}
