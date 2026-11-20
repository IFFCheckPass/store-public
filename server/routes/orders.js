import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { db } from '../db.js';
import { requireUser } from '../auth.js';
import { audit } from '../lib/audit.js';
import { addOrderEvent, addTaskEvent } from '../lib/events.js';
import { generateOrderNo } from '../lib/ids.js';
import { computeGiftDiscount, loadUsableGiftCode, scopeLabel } from '../lib/gift-codes.js';
import {
  ApiError,
  assertClassName,
  assertContact,
  assertDeliveryMethod,
  assertPaymentMethod,
  assertTimeSlot,
  badRequest,
  str,
} from '../lib/validate.js';

const router = express.Router();

const UPLOADS_DIR =
  process.env.UPLOAD_DIR || path.join(os.tmpdir(), 'campus-sales-platform-v2', 'uploads');

export const ORDER_STATUS_LABELS = {
  pending_payment: '待付款',
  pending_review: '待核验',
  paid: '已付款',
  producing: '生产中',
  packing: '打包中',
  delivering: '配送中',
  completed: '已完成',
  cancelled: '已取消',
  deleted: '已删除',
};

export const EXTERNAL_TASK_LABELS = {
  pending: '待接单',
  accepted: '已接单',
  producing: '生产中',
  done: '已完成',
  issue: '异常',
  cancelled: '已取消',
};

export const INTERNAL_TASK_LABELS = {
  pending_pack: '待打包',
  packing: '打包中',
  packed: '已打包',
  delivering: '配送中',
  delivered: '已送达',
  issue: '异常',
  cancelled: '已取消',
};

export function orderStatusLabel(status) {
  return ORDER_STATUS_LABELS[status] || status || '';
}

function parseJsonArray(text) {
  if (!text) return [];
  try {
    const value = JSON.parse(text);
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function toUploadUrl(screenshotPath) {
  if (!screenshotPath) return null;
  const normalized = String(screenshotPath).replace(/\\/g, '/').replace(/^\/+/, '');
  return `/${normalized}`;
}

function orderItems(orderId) {
  return db
    .prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY id ASC')
    .all(orderId);
}

export function buildOrderDetail(orderNo) {
  const order = db.prepare('SELECT * FROM orders WHERE order_no = ?').get(orderNo);
  if (!order) return null;

  const items = orderItems(order.id).map((it) => ({
    productId: it.product_id,
    productName: it.product_name,
    specName: it.spec_name,
    colorName: it.color_name,
    colorHex: it.color_hex,
    imageUrl: it.image_url,
    unitPrice: it.unit_price,
    quantity: it.quantity,
    subtotal: it.subtotal,
    discountAmount: it.discount_amount || 0,
    giftFree: it.gift_free === 1,
  }));

  const timeline = db
    .prepare('SELECT * FROM order_events WHERE order_id = ? ORDER BY created_at ASC, id ASC')
    .all(order.id)
    .map((ev) => ({
      status: ev.status,
      label: orderStatusLabel(ev.status),
      note: ev.note,
      createdAt: ev.created_at,
    }));

  const paymentRow = db
    .prepare('SELECT * FROM payments WHERE order_id = ? ORDER BY id DESC LIMIT 1')
    .get(order.id);
  const payment = paymentRow
    ? {
        method: paymentRow.method,
        status: paymentRow.status,
        screenshotUrl: toUploadUrl(paymentRow.screenshot_path),
        ocrNumber: paymentRow.ocr_number,
        reviewNote: paymentRow.review_note,
        createdAt: paymentRow.created_at,
      }
    : null;

  const externalTasks = db
    .prepare(
      "SELECT * FROM production_tasks WHERE order_id = ? AND type = 'external' AND status <> 'cancelled' ORDER BY id ASC"
    )
    .all(order.id)
    .map((t) => ({
      id: t.id,
      status: t.status,
      statusLabel: EXTERNAL_TASK_LABELS[t.status] || t.status,
      productName: t.product_name,
      specName: t.spec_name,
      colorName: t.color_name,
      quantity: t.quantity,
    }));

  const internalRow = db
    .prepare("SELECT * FROM production_tasks WHERE order_id = ? AND type = 'internal' ORDER BY id DESC LIMIT 1")
    .get(order.id);
  const internalTask = internalRow
    ? {
        id: internalRow.id,
        status: internalRow.status,
        statusLabel: INTERNAL_TASK_LABELS[internalRow.status] || internalRow.status,
        quantity: internalRow.quantity,
        note: internalRow.note,
      }
    : null;

  return {
    orderNo: order.order_no,
    status: order.status,
    statusLabel: orderStatusLabel(order.status),
    totalAmount: order.total_amount,
    originalAmount: order.original_amount ?? order.total_amount,
    discountAmount: order.discount_amount || 0,
    paymentMethod: order.payment_method,
    rejectReason: order.reject_reason,
    createdAt: order.created_at,
    paidAt: order.paid_at,
    completedAt: order.completed_at,
    className: order.class_name,
    seatNo: order.seat_no,
    customerName: order.customer_name,
    deliveryMethod: order.delivery_method,
    deliveryDetail: order.delivery_detail,
    timeSlot: order.time_slot,
    contactType: order.contact_type,
    contactValue: order.contact_value,
    remark: order.remark,
    giftCode: order.gift_code,
    items,
    timeline,
    payment,
    externalTasks,
    internalTask,
  };
}

export function summarizeOrders(rows) {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const placeholders = ids.map(() => '?').join(',');
  const items = db
    .prepare(
      `SELECT order_id, product_name, image_url FROM order_items WHERE order_id IN (${placeholders}) ORDER BY id ASC`
    )
    .all(...ids);

  const stats = new Map();
  for (const it of items) {
    const entry = stats.get(it.order_id) || { count: 0, firstImage: null, firstProductName: null };
    if (entry.count === 0) {
      entry.firstImage = it.image_url;
      entry.firstProductName = it.product_name;
    }
    entry.count += 1;
    stats.set(it.order_id, entry);
  }

  return rows.map((row) => {
    const stat = stats.get(row.id) || { count: 0, firstImage: null, firstProductName: null };
    return {
      orderNo: row.order_no,
      status: row.status,
      statusLabel: orderStatusLabel(row.status),
      totalAmount: row.total_amount,
      originalAmount: row.original_amount ?? row.total_amount,
      discountAmount: row.discount_amount || 0,
      paymentMethod: row.payment_method,
      rejectReason: row.reject_reason,
      itemCount: stat.count,
      firstImage: stat.firstImage,
      firstProductName: stat.firstProductName,
      customerName: row.customer_name,
      className: row.class_name,
      seatNo: row.seat_no,
      timeSlot: row.time_slot,
      deliveryMethod: row.delivery_method,
      createdAt: row.created_at,
    };
  });
}

export function createExternalTasks(order, items) {
  const insert = db.prepare(`
    INSERT INTO production_tasks (type, order_id, order_item_id, order_no, product_name, spec_name, color_name, image_url,
      quantity, class_name, time_slot, contact_type, contact_value, delivery_method, delivery_detail, status, assignee_id,
      note, created_at, updated_at)
    VALUES ('external', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NULL, '', datetime('now','localtime'), datetime('now','localtime'))
  `);
  let created = 0;
  for (const item of items) {
    if (!item.need_production) continue;
    const info = insert.run(
      order.id,
      item.order_item_id,
      order.order_no,
      item.product_name,
      item.spec_name,
      item.color_name,
      item.image_url,
      item.quantity,
      order.class_name,
      order.time_slot,
      order.contact_type,
      order.contact_value,
      order.delivery_method,
      order.delivery_detail
    );
    addTaskEvent(Number(info.lastInsertRowid), 'pending', '外部生产任务已创建', null, '系统');
    created += 1;
  }
  return created;
}

function applyGiftCode(codeValue) {
  return loadUsableGiftCode(codeValue);
}

function validateItems(itemsInput) {
  if (!Array.isArray(itemsInput) || itemsInput.length === 0) {
    throw badRequest('请至少选择一件商品');
  }
  if (itemsInput.length > 50) throw badRequest('单笔订单商品条目过多');

  return itemsInput.map((raw) => {
    if (!raw || typeof raw !== 'object') throw badRequest('商品条目格式不正确');
    const productId = Number(raw.productId);
    if (!Number.isInteger(productId) || productId <= 0) throw badRequest('商品不存在');
    const quantity = Number(raw.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
      throw badRequest('商品数量需为 1-99 的整数');
    }
    return {
      productId,
      quantity,
      specName: str(raw.specName),
      colorName: str(raw.colorName),
    };
  });
}

router.post('/', requireUser, (req, res, next) => {
  try {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(req.user.sub));
    if (!user) {
      return res.status(401).json({ error: '请先登录' });
    }
    if (user.seat_no === null || user.seat_no === undefined) {
      return res.status(400).json({ error: '用户信息不完整' });
    }

    const body = req.body || {};
    const parsedItems = validateItems(body.items);
    const deliveryMethod = assertDeliveryMethod(body.deliveryMethod);
    const timeSlot = assertTimeSlot(body.timeSlot);
    const contactType = body.contactType;
    const contactValue = assertContact(contactType, body.contactValue);
    const paymentMethod = assertPaymentMethod(body.paymentMethod);
    const remark = str(body.remark);
    if (remark.length > 500) throw badRequest('备注不能超过 500 字');

    const className = assertClassName(body.className || user.class_name);
    const deliveryDetail =
      str(body.deliveryDetail) || (deliveryMethod === 'class' ? `${className} ${user.seat_no} 座` : '');

    const giftCodeInput = str(body.giftCode).toUpperCase();
    if (paymentMethod === 'gift' && !giftCodeInput) throw badRequest('请填写赠货码');

    // 同一商品多条明细合并校验库存
    const requiredQty = new Map();
    for (const item of parsedItems) {
      requiredQty.set(item.productId, (requiredQty.get(item.productId) || 0) + item.quantity);
    }

    let orderNo = '';
    let orderId = 0;

    db.exec('BEGIN');
    try {
      const products = new Map();
      const resolved = [];

      for (const item of parsedItems) {
        let product = products.get(item.productId);
        if (!product) {
          product = db.prepare('SELECT * FROM products WHERE id = ?').get(item.productId);
          if (!product) throw badRequest('商品不存在');
          if (product.status !== 'on') throw badRequest(`商品「${product.name}」已下架`);
          products.set(item.productId, product);
        }

        const specs = parseJsonArray(product.specs_json);
        const colors = parseJsonArray(product.colors_json);

        let spec = null;
        if (specs.length > 0) {
          spec = specs.find((s) => s.name === item.specName);
          if (!spec) throw badRequest(`商品「${product.name}」的规格不存在`);
        }
        let color = null;
        if (colors.length > 0) {
          color = colors.find((c) => c.name === item.colorName);
          if (!color) throw badRequest(`商品「${product.name}」的颜色不存在`);
        }

        const isPresale = product.is_presale === 1;
        const stock = Number(product.stock);
        const needed = requiredQty.get(item.productId);
        if (!isPresale && stock < needed) throw badRequest(`商品「${product.name}」库存不足`);

        const unitPrice = product.base_price + (spec ? Number(spec.delta) || 0 : 0);
        resolved.push({
          product,
          spec,
          color,
          quantity: item.quantity,
          unitPrice,
          subtotal: unitPrice * item.quantity,
          needProduction: product.need_production === 1,
          isPresale,
        });
      }

      const totalAmount = resolved.reduce((sum, it) => sum + it.subtotal, 0);
      let giftRow = null;
      let giftDiscount = 0;
      let freeIndexes = new Set();
      if (giftCodeInput) {
        giftRow = applyGiftCode(giftCodeInput);
        const giftItems = resolved.map((it) => ({
          productId: it.product.id,
          specName: it.spec ? it.spec.name : '',
          colorName: it.color ? it.color.name : '',
          subtotal: it.subtotal,
        }));
        const calc = computeGiftDiscount(giftRow, giftItems);
        giftDiscount = Math.min(calc.discount, totalAmount);
        freeIndexes = new Set(calc.freeIndexes);
        if (giftDiscount <= 0 && totalAmount > 0) throw badRequest('该赠货码不适用于当前商品');
      }

      const payableAmount = Math.max(0, totalAmount - giftDiscount);
      const fullGift = Boolean(giftRow) && payableAmount === 0;
      if (paymentMethod === 'gift' && !fullGift) {
        throw badRequest('赠货码未覆盖全部商品，请选择微信或支付宝支付剩余金额');
      }
      const effectivePaymentMethod = fullGift ? 'gift' : paymentMethod;
      const initialStatus = fullGift ? 'paid' : 'pending_payment';

      const insertOrder = db.prepare(`
        INSERT INTO orders (order_no, user_id, customer_name, class_name, seat_no, student_id, delivery_method, delivery_detail,
          time_slot, contact_type, contact_value, remark, payment_method, status, total_amount, original_amount, discount_amount,
          gift_code, reject_reason, created_at, updated_at, paid_at, completed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, datetime('now','localtime'), datetime('now','localtime'), NULL, NULL)
      `);

      let info = null;
      for (let attempt = 0; attempt < 5 && !info; attempt += 1) {
        const candidate = generateOrderNo();
        try {
          info = insertOrder.run(
            candidate,
            user.id,
            user.name,
            className,
            user.seat_no,
            user.student_id || null,
            deliveryMethod,
            deliveryDetail,
            timeSlot,
            contactType,
            contactValue,
            remark,
            effectivePaymentMethod,
            initialStatus,
            payableAmount,
            totalAmount,
            giftDiscount,
            giftDiscount > 0 ? giftRow.code : null
          );
          orderNo = candidate;
        } catch (err) {
          if (String(err.message || '').includes('UNIQUE') && attempt < 4) continue;
          throw err;
        }
      }
      if (!info) throw new ApiError(500, '订单号生成失败，请重试');
      orderId = Number(info.lastInsertRowid);

      const insertItem = db.prepare(`
        INSERT INTO order_items (order_id, product_id, product_name, spec_name, color_name, color_hex, image_url,
          unit_price, quantity, subtotal, need_production, discount_amount, gift_free)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const itemRows = [];
      for (let index = 0; index < resolved.length; index += 1) {
        const it = resolved[index];
        const free = freeIndexes.has(index);
        const itemDiscount = free ? it.subtotal : 0;
        const itemInfo = insertItem.run(
          orderId,
          it.product.id,
          it.product.name,
          it.spec ? it.spec.name : '',
          it.color ? it.color.name : '',
          it.color ? it.color.hex : null,
          it.color ? it.color.image : it.product.cover_url,
          it.unitPrice,
          it.quantity,
          it.subtotal,
          it.needProduction ? 1 : 0,
          itemDiscount,
          free ? 1 : 0
        );
        itemRows.push({
          order_item_id: Number(itemInfo.lastInsertRowid),
          product_name: it.product.name,
          spec_name: it.spec ? it.spec.name : '',
          color_name: it.color ? it.color.name : '',
          image_url: it.color ? it.color.image : it.product.cover_url,
          quantity: it.quantity,
          need_production: it.needProduction ? 1 : 0,
        });
        if (!it.isPresale) {
          db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?').run(it.quantity, it.product.id);
        }
      }

      const totalPieces = resolved.reduce((sum, it) => sum + it.quantity, 0);
      const taskSummary = itemRows.map((it) => `${it.product_name}×${it.quantity}`).join('、');
      const internalInfo = db.prepare(`
        INSERT INTO production_tasks (type, order_id, order_item_id, order_no, product_name, spec_name, color_name, image_url,
          quantity, class_name, time_slot, contact_type, contact_value, delivery_method, delivery_detail, status, assignee_id,
          note, created_at, updated_at)
        VALUES ('internal', ?, NULL, ?, ?, '', '', ?, ?, ?, ?, ?, ?, ?, ?, 'pending_pack', NULL, '',
          datetime('now','localtime'), datetime('now','localtime'))
      `).run(
        orderId,
        orderNo,
        taskSummary,
        itemRows[0] ? itemRows[0].image_url : null,
        totalPieces,
        className,
        timeSlot,
        contactType,
        contactValue,
        deliveryMethod,
        deliveryDetail
      );
      addTaskEvent(Number(internalInfo.lastInsertRowid), 'pending_pack', '内部打包任务已创建', null, '系统');

      const orderRow = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);

      if (giftRow) {
        db.prepare('UPDATE gift_codes SET used_count = used_count + 1 WHERE id = ?').run(giftRow.id);
        db.prepare(
          "INSERT INTO gift_code_usages (gift_code_id, order_id, used_at) VALUES (?, ?, datetime('now','localtime'))"
        ).run(giftRow.id, orderId);
        audit('user', user.id, user.name, 'gift_code.redeem', `订单 ${orderNo} 使用赠货码 ${giftRow.code}`);
      }

      if (fullGift) {
        db.prepare(`
          INSERT INTO payments (order_id, method, screenshot_path, ocr_number, ocr_raw, status, review_note, reviewed_by, reviewed_at, created_at)
          VALUES (?, 'gift', NULL, NULL, NULL, 'verified', '赠货码支付', NULL, datetime('now','localtime'), datetime('now','localtime'))
        `).run(orderId);

        const externalCreated = createExternalTasks(orderRow, itemRows);
        const finalStatus = externalCreated > 0 ? 'producing' : 'packing';
        db.prepare(
          "UPDATE orders SET status = ?, paid_at = datetime('now','localtime'), updated_at = datetime('now','localtime') WHERE id = ?"
        ).run(finalStatus, orderId);
        addOrderEvent(orderId, 'paid', `使用赠货码 ${giftRow.code} 完成支付（${scopeLabel(giftRow)}）`);
        if (externalCreated > 0) addOrderEvent(orderId, 'producing', '已生成外部生产任务');
      } else {
        addOrderEvent(
          orderId,
          'pending_payment',
          giftDiscount > 0
            ? `赠货码 ${giftRow.code} 抵扣 ${(giftDiscount / 100).toFixed(2)} 元，待支付剩余 ${(payableAmount / 100).toFixed(2)} 元`
            : '订单已创建，等待支付'
        );
      }

      db.exec('COMMIT');
    } catch (err) {
      try {
        db.exec('ROLLBACK');
      } catch {
        // ignore rollback errors
      }
      throw err;
    }

    const order = buildOrderDetail(orderNo);
    return res.status(201).json({ order });
  } catch (err) {
    return next(err);
  }
});

router.post('/:orderNo/cancel', requireUser, (req, res, next) => {
  try {
    const order = db
      .prepare('SELECT * FROM orders WHERE order_no = ? AND user_id = ? AND deleted_at IS NULL')
      .get(req.params.orderNo, Number(req.user.sub));
    if (!order) return res.status(404).json({ error: '订单不存在' });
    if (order.status !== 'pending_payment') {
      return res.status(400).json({ error: '当前订单状态不可取消' });
    }

    db.exec('BEGIN');
    try {
      // 释放现货库存（预售商品下单时未扣减）
      const items = db
        .prepare(`
          SELECT oi.quantity, oi.product_id, p.is_presale
          FROM order_items oi LEFT JOIN products p ON p.id = oi.product_id
          WHERE oi.order_id = ?
        `)
        .all(order.id);
      for (const item of items) {
        if (item.product_id && item.is_presale !== 1) {
          db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?').run(
            item.quantity,
            item.product_id
          );
        }
      }

      db.prepare(`
        UPDATE production_tasks SET status = 'cancelled', updated_at = datetime('now','localtime')
        WHERE order_id = ? AND status NOT IN ('done', 'delivered', 'cancelled')
      `).run(order.id);

      // 退回赠货码使用次数
      if (order.gift_code) {
        const gift = db.prepare('SELECT * FROM gift_codes WHERE code = ?').get(order.gift_code);
        if (gift) {
          db.prepare('UPDATE gift_codes SET used_count = MAX(0, used_count - 1) WHERE id = ?').run(gift.id);
          db.prepare('DELETE FROM gift_code_usages WHERE gift_code_id = ? AND order_id = ?').run(
            gift.id,
            order.id
          );
        }
      }

      db.prepare(
        "UPDATE orders SET status = 'cancelled', updated_at = datetime('now','localtime') WHERE id = ?"
      ).run(order.id);
      addOrderEvent(order.id, 'cancelled', '用户取消未付款订单');
      db.exec('COMMIT');
    } catch (err) {
      try {
        db.exec('ROLLBACK');
      } catch {
        // ignore
      }
      throw err;
    }

    return res.json({ order: buildOrderDetail(order.order_no) });
  } catch (err) {
    return next(err);
  }
});

router.get('/mine', requireUser, (req, res) => {
  const rows = db
    .prepare(
      'SELECT * FROM orders WHERE user_id = ? AND deleted_at IS NULL ORDER BY created_at DESC, id DESC'
    )
    .all(Number(req.user.sub));
  return res.json({ orders: summarizeOrders(rows) });
});

router.get('/:orderNo', requireUser, (req, res) => {
  const order = db
    .prepare('SELECT * FROM orders WHERE order_no = ? AND user_id = ? AND deleted_at IS NULL')
    .get(req.params.orderNo, Number(req.user.sub));
  if (!order) return res.status(404).json({ error: '订单不存在' });
  return res.json({ order: buildOrderDetail(order.order_no) });
});

router.post('/:orderNo/payment', requireUser, (req, res, next) => {
  try {
    const order = db
      .prepare('SELECT * FROM orders WHERE order_no = ? AND user_id = ? AND deleted_at IS NULL')
      .get(req.params.orderNo, Number(req.user.sub));
    if (!order) return res.status(404).json({ error: '订单不存在' });
    if (order.status === 'pending_review') {
      return res.status(400).json({ error: '支付凭证已提交，等待核验' });
    }
    if (order.status !== 'pending_payment') {
      return res.status(400).json({ error: '当前订单状态不可上传支付凭证' });
    }

    const imageDataUrl = typeof req.body?.imageDataUrl === 'string' ? req.body.imageDataUrl : '';
    const match = imageDataUrl.match(/^data:image\/(png|jpe?g|webp);base64,([A-Za-z0-9+/=\s]+)$/i);
    if (!match) {
      return res.status(400).json({ error: '请上传 png/jpg/webp 格式的支付截图' });
    }
    const extRaw = match[1].toLowerCase();
    const ext = extRaw === 'jpeg' ? 'jpg' : extRaw;
    const buffer = Buffer.from(match[2].replace(/\s+/g, ''), 'base64');
    if (buffer.length === 0) {
      return res.status(400).json({ error: '支付截图内容为空' });
    }
    if (buffer.length > 6 * 1024 * 1024) {
      return res.status(400).json({ error: '支付截图不能超过 6MB' });
    }

    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    const filename = `pay-${order.order_no}-${Date.now()}.${ext}`;
    fs.writeFileSync(path.join(UPLOADS_DIR, filename), buffer);

    const ocrNumber = str(req.body?.ocrNumber).slice(0, 200);
    const ocrRaw = typeof req.body?.ocrRaw === 'string' ? req.body.ocrRaw.slice(0, 5000) : '';

    db.exec('BEGIN');
    try {
      db.prepare(`
        INSERT INTO payments (order_id, method, screenshot_path, ocr_number, ocr_raw, status, review_note, reviewed_by, reviewed_at, created_at)
        VALUES (?, ?, ?, ?, ?, 'submitted', NULL, NULL, NULL, datetime('now','localtime'))
      `).run(order.id, order.payment_method, `uploads/${filename}`, ocrNumber || null, ocrRaw || null);

      db.prepare(
        "UPDATE orders SET status = 'pending_review', reject_reason = NULL, updated_at = datetime('now','localtime') WHERE id = ?"
      ).run(order.id);
      addOrderEvent(order.id, 'pending_review', '用户已提交支付凭证，等待核验');
      db.exec('COMMIT');
    } catch (err) {
      try {
        db.exec('ROLLBACK');
      } catch {
        // ignore
      }
      throw err;
    }

    return res.json({ order: buildOrderDetail(order.order_no) });
  } catch (err) {
    return next(err);
  }
});

export default router;
