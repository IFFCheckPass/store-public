import express from 'express';
import { db } from '../db.js';
import { requireStaff } from '../auth.js';
import { addOrderEvent, addTaskEvent } from '../lib/events.js';
import { badRequest, str } from '../lib/validate.js';
import { EXTERNAL_TASK_LABELS, INTERNAL_TASK_LABELS, orderStatusLabel } from './orders.js';

const router = express.Router();

const ACTIVE_ORDER_STATUSES = ['paid', 'producing', 'packing', 'delivering', 'completed'];

const TRANSITIONS = {
  external: {
    pending: ['accepted', 'issue', 'cancelled'],
    accepted: ['producing', 'issue', 'cancelled'],
    producing: ['done', 'issue', 'cancelled'],
    issue: ['accepted', 'producing', 'cancelled'],
    done: [],
    cancelled: [],
  },
  internal: {
    pending_pack: ['packing', 'issue', 'cancelled'],
    packing: ['packed', 'issue', 'cancelled'],
    packed: ['delivering', 'issue', 'cancelled'],
    delivering: ['delivered', 'issue', 'cancelled'],
    issue: ['pending_pack', 'packing', 'cancelled'],
    delivered: [],
    cancelled: [],
  },
};

function taskLabels(type) {
  return type === 'external' ? EXTERNAL_TASK_LABELS : INTERNAL_TASK_LABELS;
}

function isProductionRole(role) {
  return role === 'prod_external' || role === 'prod_internal';
}

function roleType(role) {
  if (role === 'prod_external') return 'external';
  if (role === 'prod_internal') return 'internal';
  return null;
}

function taskEvents(taskId) {
  return db
    .prepare('SELECT * FROM task_events WHERE task_id = ? ORDER BY created_at ASC, id ASC')
    .all(taskId)
    .map((ev) => ({
      status: ev.status,
      note: ev.note,
      actorName: ev.actor_name,
      createdAt: ev.created_at,
    }));
}

function orderItemViews(orderId) {
  return db
    .prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY id ASC')
    .all(orderId)
    .map((item) => ({
      productName: item.product_name,
      specName: item.spec_name,
      colorName: item.color_name,
      colorHex: item.color_hex,
      patternName: item.pattern_name || '',
      patternImage: item.pattern_image || '',
      isCustom: item.is_custom === 1,
      imageUrl: item.image_url,
      unitPrice: item.unit_price,
      quantity: item.quantity,
      subtotal: item.subtotal,
    }));
}

/**
 * 生产任务对外视图。
 *
 * @param {object} row        production_tasks JOIN orders 的行
 * @param {string} viewerRole 当前请求者的 staff 角色（req.staff.role）
 *
 * 隐私边界：prod_external 是校外的生产合作方，只需要「做什么、做多少」，
 * 不返回下单人 PII（姓名/座号/班级）与联系方式、收货方式。
 * prod_internal（校内打包/配送）与 staff 角色保持原有字段不变。
 */
function taskView(row, viewerRole) {
  const labels = taskLabels(row.type);
  const hideCustomerInfo = viewerRole === 'prod_external';
  return {
    id: row.id,
    type: row.type,
    items: row.type === 'internal' ? orderItemViews(row.order_id) : undefined,
    orderNo: row.order_no,
    timeSlot: row.time_slot,
    productName: row.product_name,
    specName: row.spec_name,
    colorName: row.color_name,
    patternName: row.pattern_name || '',
    isCustom: row.is_custom === 1,
    imageUrl: row.image_url,
    quantity: row.quantity,
    status: row.status,
    statusLabel: labels[row.status] || row.status,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    events: taskEvents(row.id),
    // 仅内部角色下发：外部生产账号拿到的是空对象，字段名不会出现在响应里
    ...(hideCustomerInfo
      ? {}
      : {
          className: row.class_name,
          contactType: row.contact_type,
          contactValue: row.contact_value,
          deliveryMethod: row.delivery_method,
          deliveryDetail: row.delivery_detail,
          customerName: row.customer_name || null,
          seatNo: row.seat_no || null,
        }),
  };
}

function syncOrderStatus(orderId, taskId, noteSuffix) {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!order) return null;
  if (order.status === 'deleted' || order.status === 'cancelled' || order.status === 'completed') {
    return order.status;
  }

  const internal = db
    .prepare("SELECT * FROM production_tasks WHERE order_id = ? AND type = 'internal' ORDER BY id DESC LIMIT 1")
    .get(orderId);
  const externals = db
    .prepare(
      "SELECT * FROM production_tasks WHERE order_id = ? AND type = 'external' AND status <> 'cancelled'"
    )
    .all(orderId);

  let next = order.status;
  if (internal && internal.status === 'delivered') {
    next = 'completed';
  } else if (internal && internal.status === 'delivering') {
    next = 'delivering';
  } else if (internal && (internal.status === 'packing' || internal.status === 'packed')) {
    next = 'packing';
  } else if (externals.length > 0 && externals.every((t) => t.status === 'done')) {
    next = 'packing';
  } else if (order.status === 'paid' && externals.some((t) => ['accepted', 'producing', 'done'].includes(t.status))) {
    next = 'producing';
  }

  if (next === 'completed') {
    db.prepare(
      "UPDATE orders SET status = 'completed', completed_at = COALESCE(completed_at, datetime('now','localtime')), updated_at = datetime('now','localtime') WHERE id = ?"
    ).run(orderId);
    addOrderEvent(orderId, 'completed', noteSuffix || `任务 #${taskId} 已送达，订单完成`);
    return 'completed';
  }

  if (next !== order.status) {
    db.prepare(
      "UPDATE orders SET status = ?, updated_at = datetime('now','localtime') WHERE id = ?"
    ).run(next, orderId);
    addOrderEvent(orderId, next, noteSuffix || `任务 #${taskId} 更新后订单转为${orderStatusLabel(next)}`);
    return next;
  }

  return order.status;
}

router.get('/tasks', requireStaff(['prod_external', 'prod_internal', 'super_admin', 'admin']), (req, res) => {
  const role = req.staff.role;
  const conditions = [
    `o.status IN (${ACTIVE_ORDER_STATUSES.map(() => '?').join(',')})`,
    'o.deleted_at IS NULL',
    "t.status <> 'cancelled'",
  ];
  const params = [...ACTIVE_ORDER_STATUSES];

  const forcedType = roleType(role);
  if (forcedType) {
    conditions.push('t.type = ?');
    params.push(forcedType);
  } else if (req.query.type === 'external' || req.query.type === 'internal') {
    conditions.push('t.type = ?');
    params.push(req.query.type);
  }

  if (req.query.status) {
    conditions.push('t.status = ?');
    params.push(String(req.query.status));
  }

  const rows = db
    .prepare(
      `SELECT t.*, o.customer_name, o.seat_no, o.created_at AS order_created_at
       FROM production_tasks t JOIN orders o ON o.id = t.order_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY o.class_name ASC, o.customer_name ASC, o.seat_no ASC, t.created_at DESC, t.id DESC`
    )
    .all(...params);

  return res.json({ tasks: rows.map((row) => taskView(row, role)) });
});

router.get('/stats', requireStaff(['prod_external', 'prod_internal', 'super_admin', 'admin']), (req, res) => {
  const role = req.staff.role;
  const conditions = [
    `o.status IN (${ACTIVE_ORDER_STATUSES.map(() => '?').join(',')})`,
    'o.deleted_at IS NULL',
    "t.status <> 'cancelled'",
  ];
  const params = [...ACTIVE_ORDER_STATUSES];
  const forcedType = roleType(role);
  if (forcedType) {
    conditions.push('t.type = ?');
    params.push(forcedType);
  }

  const rows = db
    .prepare(
      `SELECT t.status AS status, COUNT(*) AS c FROM production_tasks t JOIN orders o ON o.id = t.order_id
       WHERE ${conditions.join(' AND ')} GROUP BY t.status`
    )
    .all(...params);

  const counts = { pending: 0, processing: 0, done: 0, issue: 0 };
  for (const row of rows) {
    const status = row.status;
    const c = Number(row.c);
    if (status === 'pending' || status === 'pending_pack') counts.pending += c;
    else if (status === 'issue') counts.issue += c;
    else if (status === 'done' || status === 'delivered') counts.done += c;
    else counts.processing += c;
  }
  return res.json(counts);
});

router.post('/tasks/:id/status', requireStaff(['prod_external', 'prod_internal', 'super_admin', 'admin']), (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const task = Number.isInteger(id)
      ? db.prepare('SELECT * FROM production_tasks WHERE id = ?').get(id)
      : undefined;
    if (!task) return res.status(404).json({ error: '任务不存在' });

    const role = req.staff.role;
    if (isProductionRole(role) && roleType(role) !== task.type) {
      return res.status(403).json({ error: '无权限执行该操作' });
    }

    const actorId = Number(req.staff.sub);
    const actorName = req.staff.name || '';

    // 认领后锁定：已有 assignee 的任务只允许本人或 super_admin 处理。
    // 尚未认领（assignee_id 为空）的任务仍可由任意有权限账号接手。
    if (
      role !== 'super_admin' &&
      task.assignee_id !== null &&
      task.assignee_id !== undefined &&
      Number(task.assignee_id) !== actorId
    ) {
      return res.status(403).json({ error: '该任务已被其他账号认领，无权修改' });
    }

    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(task.order_id);
    if (!order) return res.status(404).json({ error: '订单不存在' });
    if (order.deleted_at || order.status === 'deleted' || order.status === 'cancelled') {
      return res.status(400).json({ error: '订单已终止，无法更新任务' });
    }

    const nextStatus = str(req.body?.status);
    const labels = taskLabels(task.type);
    if (!nextStatus || !(nextStatus in labels)) {
      return res.status(400).json({ error: '任务状态不正确' });
    }
    if (nextStatus === task.status) {
      return res.status(400).json({ error: '非法状态流转' });
    }
    const allowed = TRANSITIONS[task.type][task.status] || [];
    if (!allowed.includes(nextStatus)) {
      return res.status(400).json({ error: '非法状态流转' });
    }

    const note = str(req.body?.note).slice(0, 500);

    db.exec('BEGIN');
    try {
      const assignee = task.assignee_id ?? (task.type === 'external' && nextStatus === 'accepted' ? actorId : null);
      db.prepare(
        "UPDATE production_tasks SET status = ?, note = ?, assignee_id = ?, updated_at = datetime('now','localtime') WHERE id = ?"
      ).run(nextStatus, note || task.note || '', assignee, id);
      addTaskEvent(id, nextStatus, note, actorId, actorName);

      syncOrderStatus(
        task.order_id,
        id,
        `任务 #${id}（${task.product_name || task.type}）更新为${labels[nextStatus]}${note ? `：${note}` : ''}`
      );
      db.exec('COMMIT');
    } catch (err) {
      try {
        db.exec('ROLLBACK');
      } catch {
        // ignore
      }
      throw err;
    }

    const updated = db.prepare('SELECT * FROM production_tasks WHERE id = ?').get(id);
    return res.json({ task: taskView(updated, role) });
  } catch (err) {
    return next(err);
  }
});

export default router;
