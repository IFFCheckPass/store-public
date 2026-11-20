import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { db } from '../db.js';
import { hashPassword, requireStaff } from '../auth.js';
import { audit } from '../lib/audit.js';
import { addOrderEvent } from '../lib/events.js';
import { generateGiftCode } from '../lib/ids.js';
import { UPLOADS_DIR } from '../lib/uploads.js';
import {
  assertDateTime,
  assertPassword,
  assertStudentId,
  badRequest,
  PLACEHOLDER_STUDENT_ID,
  boolParam,
  isPositiveInt,
  isPlaceholderStudentId,
  paginationLimit,
  str,
  toInt,
} from '../lib/validate.js';
import {
  EXTERNAL_TASK_LABELS,
  INTERNAL_TASK_LABELS,
  buildOrderDetail,
  createExternalTasks,
  summarizeOrders,
} from './orders.js';
import { parseScope, scopeLabel } from '../lib/gift-codes.js';
import { getSettings, saveSettings } from '../lib/settings.js';

const router = express.Router();

const ADMIN_ROLES = ['super_admin', 'admin'];
const SUPER_ROLES = ['super_admin'];

const adminOnly = requireStaff(ADMIN_ROLES);
const superOnly = requireStaff(SUPER_ROLES);

const STAFF_ROLES = ['super_admin', 'admin', 'prod_external', 'prod_internal'];

function staffRowView(row) {
  return {
    id: row.id,
    username: row.username,
    studentId: row.student_id,
    displayName: row.display_name,
    role: row.role,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function uploadUrl(screenshotPath) {
  if (!screenshotPath) return null;
  return `/${String(screenshotPath).replace(/\\/g, '/').replace(/^\/+/, '')}`;
}

function parseJsonArray(text) {
  try {
    const value = JSON.parse(text || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function normalizeGiftScope(input) {
  const scopeType = str(input?.scopeType) || 'all';
  if (scopeType === 'all') return { type: 'all', json: null };

  if (scopeType === 'products') {
    const rawIds = Array.isArray(input?.productIds) ? input.productIds : [];
    const ids = [...new Set(rawIds.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))];
    if (!ids.length) throw badRequest('请选择至少一个适用商品');
    for (const id of ids) {
      if (!db.prepare('SELECT id FROM products WHERE id = ?').get(id)) {
        throw badRequest('适用商品不存在');
      }
    }
    return { type: 'products', json: JSON.stringify({ productIds: ids }) };
  }

  if (scopeType === 'skus') {
    const rawSkus = Array.isArray(input?.skus) ? input.skus : [];
    const seen = new Set();
    const skus = [];
    for (const raw of rawSkus) {
      if (!raw || typeof raw !== 'object') continue;
      const productId = Number(raw.productId);
      const specName = str(raw.specName);
      const colorName = str(raw.colorName);
      if (!Number.isInteger(productId) || !specName || !colorName) continue;
      const key = `${productId}|${specName}|${colorName}`;
      if (seen.has(key)) continue;
      const product = db.prepare('SELECT * FROM products WHERE id = ?').get(productId);
      if (!product) throw badRequest('适用商品不存在');
      const specs = parseJsonArray(product.specs_json);
      const colors = parseJsonArray(product.colors_json);
      if (!specs.some((item) => item.name === specName)) throw badRequest('适用规格不存在');
      if (!colors.some((item) => item.name === colorName)) throw badRequest('适用颜色不存在');
      seen.add(key);
      skus.push({ productId, specName, colorName });
    }
    if (!skus.length) throw badRequest('请选择至少一个适用规格');
    return { type: 'skus', json: JSON.stringify({ skus }) };
  }

  throw badRequest('适用范围不正确');
}

function giftCodeView(row) {
  const scope = parseScope(row);
  return {
    id: row.id,
    code: row.code,
    note: row.note,
    maxUses: row.max_uses,
    usedCount: row.used_count,
    remaining: Math.max(0, row.max_uses - row.used_count),
    expiresAt: row.expires_at,
    active: row.active,
    scopeType: scope.type,
    scopeLabel: scopeLabel(row),
    scope,
    createdAt: row.created_at,
  };
}

function deletionRequestView(request) {
  const order = db
    .prepare('SELECT customer_name, class_name, total_amount, status FROM orders WHERE id = ?')
    .get(request.order_id);
  const approvals = db
    .prepare('SELECT staff_name, created_at FROM order_deletion_approvals WHERE request_id = ? ORDER BY id ASC')
    .all(request.id);
  return {
    id: request.id,
    orderNo: request.order_no,
    customerName: order ? order.customer_name : null,
    className: order ? order.class_name : null,
    amount: order ? order.total_amount : 0,
    orderStatus: order ? order.status : null,
    reason: request.reason,
    status: request.status,
    requiredCount: request.required_count,
    approvals: approvals.map((a) => ({ staffName: a.staff_name, createdAt: a.created_at })),
    requestedByName: request.requested_by_name,
    createdAt: request.created_at,
    resolvedAt: request.resolved_at,
  };
}

router.get('/overview', adminOnly, (req, res) => {
  const scalar = (sql, ...params) => Number(db.prepare(sql).get(...params).value || 0);
  const ordersTotal = scalar('SELECT COUNT(*) AS value FROM orders WHERE deleted_at IS NULL');
  const todayOrders = scalar(
    "SELECT COUNT(*) AS value FROM orders WHERE deleted_at IS NULL AND date(created_at) = date('now','localtime')"
  );
  const revenue = scalar(
    `SELECT COALESCE(SUM(total_amount), 0) AS value FROM orders
     WHERE deleted_at IS NULL AND status IN ('paid','producing','packing','delivering','completed')`
  );
  const pendingReview = scalar("SELECT COUNT(*) AS value FROM orders WHERE deleted_at IS NULL AND status = 'pending_review'");
  const producing = scalar("SELECT COUNT(*) AS value FROM orders WHERE deleted_at IS NULL AND status = 'producing'");
  const delivering = scalar("SELECT COUNT(*) AS value FROM orders WHERE deleted_at IS NULL AND status = 'delivering'");
  const completed = scalar("SELECT COUNT(*) AS value FROM orders WHERE deleted_at IS NULL AND status = 'completed'");
  const accounts = scalar('SELECT COUNT(*) AS value FROM staff');
  const pendingDeletions = scalar(
    "SELECT COUNT(*) AS value FROM order_deletion_requests WHERE status = 'pending'"
  );

  return res.json({
    ordersTotal,
    todayOrders,
    revenue,
    pendingReview,
    producing,
    delivering,
    completed,
    accounts,
    pendingDeletions,
  });
});

router.get('/staff', adminOnly, (req, res) => {
  const rows = db.prepare('SELECT * FROM staff ORDER BY id ASC').all();
  return res.json({ staff: rows.map(staffRowView) });
});

const BACKUP_TABLES = [
  {
    key: 'users',
    table: 'users',
    columns: ['id', 'name', 'class_name', 'seat_no', 'student_id', 'created_at'],
  },
  {
    key: 'products',
    table: 'products',
    columns: ['id', 'name', 'category', 'description', 'base_price', 'cover_url', 'stock', 'need_production', 'is_presale', 'presale_eta', 'specs_json', 'colors_json', 'status', 'created_at'],
    fill: { is_presale: 0 },
  },
  {
    key: 'orders',
    table: 'orders',
    columns: ['id', 'order_no', 'user_id', 'customer_name', 'class_name', 'seat_no', 'student_id', 'delivery_method', 'delivery_detail', 'time_slot', 'contact_type', 'contact_value', 'remark', 'payment_method', 'status', 'total_amount', 'original_amount', 'discount_amount', 'gift_code', 'reject_reason', 'created_at', 'updated_at', 'paid_at', 'completed_at', 'deleted_at', 'deleted_by'],
  },
  {
    key: 'orderItems',
    table: 'order_items',
    columns: ['id', 'order_id', 'product_id', 'product_name', 'spec_name', 'color_name', 'color_hex', 'image_url', 'unit_price', 'quantity', 'subtotal', 'need_production', 'discount_amount', 'gift_free'],
  },
  {
    key: 'payments',
    table: 'payments',
    columns: ['id', 'order_id', 'method', 'screenshot_path', 'ocr_number', 'ocr_raw', 'status', 'review_note', 'reviewed_by', 'reviewed_at', 'created_at'],
  },
  {
    key: 'giftCodes',
    table: 'gift_codes',
    columns: ['id', 'code', 'note', 'max_uses', 'used_count', 'expires_at', 'active', 'scope_type', 'scope_json', 'created_by', 'created_at'],
  },
  {
    key: 'giftCodeUsages',
    table: 'gift_code_usages',
    columns: ['id', 'gift_code_id', 'order_id', 'used_at'],
  },
  {
    key: 'productionTasks',
    table: 'production_tasks',
    columns: ['id', 'type', 'order_id', 'order_item_id', 'order_no', 'product_name', 'spec_name', 'color_name', 'image_url', 'quantity', 'class_name', 'time_slot', 'contact_type', 'contact_value', 'delivery_method', 'delivery_detail', 'status', 'assignee_id', 'note', 'created_at', 'updated_at'],
  },
  {
    key: 'taskEvents',
    table: 'task_events',
    columns: ['id', 'task_id', 'status', 'note', 'actor_id', 'actor_name', 'created_at'],
  },
  {
    key: 'orderEvents',
    table: 'order_events',
    columns: ['id', 'order_id', 'status', 'note', 'created_at'],
  },
  {
    key: 'deletionRequests',
    table: 'order_deletion_requests',
    columns: ['id', 'order_id', 'order_no', 'requested_by', 'requested_by_name', 'reason', 'status', 'required_count', 'created_at', 'resolved_at'],
  },
  {
    key: 'deletionApprovals',
    table: 'order_deletion_approvals',
    columns: ['id', 'request_id', 'staff_id', 'staff_name', 'created_at'],
  },
  {
    key: 'auditLogs',
    table: 'audit_logs',
    columns: ['id', 'actor_type', 'actor_id', 'actor_name', 'action', 'detail', 'created_at'],
  },
];

const BACKUP_DELETE_ORDER = [
  'order_deletion_approvals',
  'order_deletion_requests',
  'task_events',
  'production_tasks',
  'gift_code_usages',
  'payments',
  'order_events',
  'order_items',
  'orders',
  'gift_codes',
  'products',
  'users',
  'audit_logs',
];

function accountEntry(raw, index) {
  const label = `第 ${index + 1} 个账号`;
  if (!raw || typeof raw !== 'object') throw badRequest(`${label}格式不正确`);
  const username = str(raw.username);
  if (!/^[A-Za-z0-9_.-]{2,30}$/.test(username)) {
    throw badRequest(`${label}用户名需为 2-30 位字母、数字、下划线、点或短横线`);
  }
  const studentId = assertStudentId(raw.studentId, { required: false }) || PLACEHOLDER_STUDENT_ID;
  const displayName = str(raw.displayName);
  if (!displayName || displayName.length > 40) {
    throw badRequest(`${label}姓名需为 1-40 个字符`);
  }
  const role = str(raw.role);
  if (!['super_admin', 'admin', 'prod_external', 'prod_internal'].includes(role)) {
    throw badRequest(`${label}角色不正确`);
  }
  const status = raw.status === undefined ? 'active' : str(raw.status);
  if (!['active', 'disabled'].includes(status)) throw badRequest(`${label}状态不正确`);
  const passwordHash = typeof raw.passwordHash === 'string' ? raw.passwordHash.trim() : '';
  if (passwordHash && !/^[a-f0-9]{32}:[a-f0-9]{128}$/i.test(passwordHash)) {
    throw badRequest(`${label}密码哈希格式不正确`);
  }
  const existing = db.prepare('SELECT * FROM staff WHERE username = ?').get(username);
  if (!existing && !passwordHash) {
    throw badRequest(`${label}缺少密码哈希，无法创建新账号`);
  }
  return { username, studentId, displayName, role, status, passwordHash, existing };
}

const IMAGE_MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};
const MAX_UPLOAD_BYTES = 6 * 1024 * 1024;
const UPLOAD_NAME_RE = /^[A-Za-z0-9._-]{1,120}$/;

function collectUploadFiles() {
  const files = [];
  let names = [];
  try {
    names = fs.readdirSync(UPLOADS_DIR);
  } catch {
    return files;
  }
  for (const name of names) {
    if (!UPLOAD_NAME_RE.test(name)) continue;
    const mime = IMAGE_MIME[path.extname(name).toLowerCase()];
    if (!mime) continue;
    const filePath = path.join(UPLOADS_DIR, name);
    try {
      const stat = fs.statSync(filePath);
      if (!stat.isFile() || stat.size === 0 || stat.size > MAX_UPLOAD_BYTES) continue;
      files.push({ name, mime, data: fs.readFileSync(filePath).toString('base64') });
    } catch {
      // 单个文件读取失败时跳过，不影响整体导出
    }
  }
  return files;
}

function restoreUploadFiles(files) {
  if (files === undefined) return 0;
  if (!Array.isArray(files)) throw badRequest('备份中的图片数据格式不正确');
  if (files.length > 3000) throw badRequest('单次最多恢复 3000 张图片');
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  let restored = 0;
  for (const file of files) {
    if (!file || typeof file !== 'object') throw badRequest('备份中的图片条目格式不正确');
    const name = String(file.name || '');
    if (!UPLOAD_NAME_RE.test(name)) throw badRequest('备份中的图片文件名不正确');
    const mime = String(file.mime || '');
    if (!Object.values(IMAGE_MIME).includes(mime)) throw badRequest('备份中的图片类型不正确');
    if (typeof file.data !== 'string' || !file.data) continue;
    const buffer = Buffer.from(file.data, 'base64');
    if (buffer.length === 0) continue;
    if (buffer.length > MAX_UPLOAD_BYTES) throw badRequest(`图片 ${name} 超过 6MB`);
    fs.writeFileSync(path.join(UPLOADS_DIR, name), buffer);
    restored += 1;
  }
  return restored;
}

router.get('/backup/export', superOnly, (req, res) => {
  const accounts = db
    .prepare('SELECT * FROM staff ORDER BY id ASC')
    .all()
    .map((row) => ({
      username: row.username,
      studentId: row.student_id,
      displayName: row.display_name,
      role: row.role,
      status: row.status,
      passwordHash: row.password_hash,
      createdAt: row.created_at,
    }));

  const data = {};
  for (const spec of BACKUP_TABLES) {
    let rows = db
      .prepare(
        `SELECT * FROM ${spec.table} ${
          spec.key === 'auditLogs' ? 'ORDER BY id DESC LIMIT 5000' : 'ORDER BY id ASC'
        }`
      )
      .all();
    if (spec.key === 'auditLogs') rows = rows.reverse();
    data[spec.key] = rows.map((row) =>
      Object.fromEntries(spec.columns.map((column) => [column, row[column] ?? null]))
    );
  }

  const files = collectUploadFiles();

  const payload = {
    type: 'store-backup',
    version: 2,
    exportedAt: new Date().toISOString(),
    accounts,
    settings: getSettings(),
    data,
    files,
  };
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="store-backup-${stamp}.json"`);
  audit(
    'staff',
    Number(req.staff.sub),
    req.staff.name || '',
    'backup.export',
    `导出完整备份：账号 ${accounts.length} 个，订单 ${data.orders.length} 个，商品 ${data.products.length} 个，图片 ${files.length} 张`
  );
  return res.send(JSON.stringify(payload, null, 2));
});

router.post('/backup/import', superOnly, (req, res, next) => {
  try {
    const body = req.body || {};
    if (body.type && body.type !== 'store-backup') {
      return res.status(400).json({ error: '不是有效的店铺备份文件' });
    }
    const accounts = Array.isArray(body.accounts) ? body.accounts : null;
    const data = body.data && typeof body.data === 'object' ? body.data : null;
    if (!accounts && !data) return res.status(400).json({ error: '备份文件为空' });
    if (accounts && accounts.length > 500) {
      return res.status(400).json({ error: '单次最多导入 500 个账号' });
    }

    const preparedAccounts = [];
    if (accounts) {
      const seen = new Set();
      accounts.forEach((raw, index) => {
        const entry = accountEntry(raw, index);
        if (seen.has(entry.username.toLowerCase())) {
          throw badRequest(`用户名 ${entry.username} 重复`);
        }
        seen.add(entry.username.toLowerCase());
        preparedAccounts.push(entry);
      });
    }

    let created = 0;
    let updated = 0;
    const restored = {};

    db.exec('BEGIN');
    try {
      for (const item of preparedAccounts) {
        if (item.existing) {
          db.prepare(`
            UPDATE staff SET student_id = ?, display_name = ?, role = ?, status = ?,
              password_hash = ?, updated_at = datetime('now','localtime') WHERE id = ?
          `).run(
            item.studentId,
            item.displayName,
            item.role,
            item.status,
            item.passwordHash || item.existing.password_hash,
            item.existing.id
          );
          updated += 1;
        } else {
          db.prepare(`
            INSERT INTO staff (username, student_id, password_hash, display_name, role, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, datetime('now','localtime'), datetime('now','localtime'))
          `).run(
            item.username,
            item.studentId,
            item.passwordHash,
            item.displayName,
            item.role,
            item.status
          );
          created += 1;
        }
      }

      if (data) {
        for (const table of BACKUP_DELETE_ORDER) {
          db.prepare(`DELETE FROM ${table}`).run();
        }

        for (const spec of BACKUP_TABLES) {
          const rows = data[spec.key] === undefined ? [] : data[spec.key];
          if (!Array.isArray(rows)) throw badRequest(`备份中的 ${spec.key} 数据格式不正确`);
          restored[spec.key] = rows.length;
          if (!rows.length) continue;
          const sql = `INSERT INTO ${spec.table} (${spec.columns.join(', ')}) VALUES (${spec.columns
            .map(() => '?')
            .join(', ')})`;
          const insert = db.prepare(sql);
          for (const row of rows) {
            if (!row || typeof row !== 'object') throw badRequest('备份数据行格式不正确');
            insert.run(
              ...spec.columns.map((column) => {
                const value = row[column];
                if (value === undefined || value === null) {
                  return spec.fill && column in spec.fill ? spec.fill[column] : null;
                }
                return value;
              })
            );
          }
        }

        if (body.settings && typeof body.settings === 'object') {
          saveSettings(body.settings);
        }
      }

      const activeSupers = Number(
        db
          .prepare("SELECT COUNT(*) AS c FROM staff WHERE role = 'super_admin' AND status = 'active'")
          .get().c
      );
      if (activeSupers < 1) {
        throw badRequest('导入后必须保留至少一个启用的超级管理员');
      }

      db.exec('COMMIT');
    } catch (err) {
      try {
        db.exec('ROLLBACK');
      } catch {
        // ignore
      }
      throw err;
    }

    const restoredFiles = restoreUploadFiles(body.files);

    audit(
      'staff',
      Number(req.staff.sub),
      req.staff.name || '',
      'backup.import',
      `导入完整备份：新增账号 ${created} 个，更新 ${updated} 个，恢复订单 ${restored.orders || 0} 个，图片 ${restoredFiles} 张`
    );
    return res.json({ created, updated, restored, files: restoredFiles });
  } catch (err) {
    return next(err);
  }
});

router.post('/staff', superOnly, (req, res, next) => {
  try {
    const username = str(req.body?.username);
    const displayName = str(req.body?.displayName);
    const role = str(req.body?.role);
    const status = req.body?.status === undefined ? 'active' : str(req.body?.status);

    if (!/^[A-Za-z0-9_]{2,30}$/.test(username)) {
      return res.status(400).json({ error: '用户名需为 2-30 位字母、数字或下划线' });
    }
    if (!displayName || displayName.length > 30) {
      return res.status(400).json({ error: '请填写 1-30 字的显示名称' });
    }
    if (!STAFF_ROLES.includes(role)) {
      return res.status(400).json({ error: '角色不正确' });
    }
    if (!['active', 'disabled'].includes(status)) {
      return res.status(400).json({ error: '账号状态不正确' });
    }
    const studentId = assertStudentId(req.body?.studentId, { required: false }) || PLACEHOLDER_STUDENT_ID;
    const password = assertPassword(req.body?.password);

    const exists = db.prepare('SELECT id FROM staff WHERE username = ?').get(username);
    if (exists) return res.status(400).json({ error: '用户名已存在' });

    const info = db
      .prepare(`
        INSERT INTO staff (username, student_id, password_hash, display_name, role, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now','localtime'), datetime('now','localtime'))
      `)
      .run(username, studentId, hashPassword(password), displayName, role, status);

    const created = db.prepare('SELECT * FROM staff WHERE id = ?').get(Number(info.lastInsertRowid));
    audit('staff', req.staff.sub, req.staff.name, 'staff.create', `新建账号 ${username}（${role}）`);
    return res.status(201).json({ staff: staffRowView(created) });
  } catch (err) {
    return next(err);
  }
});

router.patch('/staff/:id', superOnly, (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const staff = Number.isInteger(id) ? db.prepare('SELECT * FROM staff WHERE id = ?').get(id) : undefined;
    if (!staff) return res.status(404).json({ error: '账号不存在' });

    const updates = [];
    const params = [];

    if (req.body?.username !== undefined) {
      const username = str(req.body.username);
      if (!/^[A-Za-z0-9_]{2,30}$/.test(username)) {
        return res.status(400).json({ error: '用户名需为 2-30 位字母、数字或下划线' });
      }
      if (username !== staff.username) {
        const dup = db.prepare('SELECT id FROM staff WHERE username = ? AND id <> ?').get(username, id);
        if (dup) return res.status(400).json({ error: '用户名已存在' });
        updates.push('username = ?');
        params.push(username);
      }
    }

    if (req.body?.displayName !== undefined) {
      const displayName = str(req.body.displayName);
      if (!displayName || displayName.length > 30) {
        return res.status(400).json({ error: '请填写 1-30 字的显示名称' });
      }
      updates.push('display_name = ?');
      params.push(displayName);
    }
    if (req.body?.role !== undefined) {
      const role = str(req.body.role);
      if (!STAFF_ROLES.includes(role)) return res.status(400).json({ error: '角色不正确' });
      updates.push('role = ?');
      params.push(role);
    }
    if (req.body?.status !== undefined) {
      const status = str(req.body.status);
      if (!['active', 'disabled'].includes(status)) {
        return res.status(400).json({ error: '账号状态不正确' });
      }
      if (status === 'disabled' && Number(req.staff.sub) === id) {
        return res.status(400).json({ error: '不能停用自己的账号' });
      }
      updates.push('status = ?');
      params.push(status);
    }

    if (updates.length === 0) return res.status(400).json({ error: '没有需要更新的字段' });

    updates.push("updated_at = datetime('now','localtime')");
    params.push(id);
    db.prepare(`UPDATE staff SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    const updated = db.prepare('SELECT * FROM staff WHERE id = ?').get(id);
    const nameNote =
      updated.username !== staff.username ? `（用户名 ${staff.username} → ${updated.username}）` : '';
    audit('staff', req.staff.sub, req.staff.name, 'staff.update', `更新账号 ${staff.username}${nameNote}`);
    return res.json({ staff: staffRowView(updated) });
  } catch (err) {
    return next(err);
  }
});

router.post('/staff/:id/reset-password', superOnly, (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const staff = Number.isInteger(id) ? db.prepare('SELECT * FROM staff WHERE id = ?').get(id) : undefined;
    if (!staff) return res.status(404).json({ error: '账号不存在' });

    const password = assertPassword(req.body?.password);
    db.prepare(
      "UPDATE staff SET password_hash = ?, updated_at = datetime('now','localtime') WHERE id = ?"
    ).run(hashPassword(password), id);

    audit('staff', req.staff.sub, req.staff.name, 'staff.reset_password', `重置账号 ${staff.username} 的密码`);
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
});

router.get('/orders', adminOnly, (req, res) => {
  const conditions = [];
  const params = [];

  if (!boolParam(req.query.includeDeleted)) {
    conditions.push('deleted_at IS NULL');
  }
  if (req.query.status) {
    conditions.push('status = ?');
    params.push(String(req.query.status));
  }
  if (req.query.className) {
    conditions.push('class_name LIKE ?');
    params.push(`%${String(req.query.className).trim()}%`);
  }
  if (req.query.keyword) {
    const kw = `%${String(req.query.keyword).trim()}%`;
    conditions.push('(order_no LIKE ? OR customer_name LIKE ? OR class_name LIKE ? OR contact_value LIKE ?)');
    params.push(kw, kw, kw, kw);
  }
  if (req.query.from) {
    conditions.push('date(created_at) >= date(?)');
    params.push(String(req.query.from));
  }
  if (req.query.to) {
    conditions.push('date(created_at) <= date(?)');
    params.push(String(req.query.to));
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = db
    .prepare(`SELECT * FROM orders ${where} ORDER BY created_at DESC, id DESC LIMIT 500`)
    .all(...params);

  return res.json({ orders: summarizeOrders(rows) });
});

router.get('/orders/:orderNo', adminOnly, (req, res) => {
  const orderRow = db.prepare('SELECT * FROM orders WHERE order_no = ?').get(req.params.orderNo);
  if (!orderRow) return res.status(404).json({ error: '订单不存在' });

  const order = buildOrderDetail(orderRow.order_no);
  const tasks = db
    .prepare('SELECT * FROM production_tasks WHERE order_id = ? ORDER BY id ASC')
    .all(orderRow.id)
    .map((t) => {
      const labels = t.type === 'external' ? EXTERNAL_TASK_LABELS : INTERNAL_TASK_LABELS;
      return {
        id: t.id,
        type: t.type,
        orderNo: t.order_no,
        productName: t.product_name,
        specName: t.spec_name,
        colorName: t.color_name,
        quantity: t.quantity,
        status: t.status,
        statusLabel: labels[t.status] || t.status,
        note: t.note,
        createdAt: t.created_at,
        updatedAt: t.updated_at,
        events: db
          .prepare('SELECT status, note, actor_name, created_at FROM task_events WHERE task_id = ? ORDER BY created_at ASC, id ASC')
          .all(t.id)
          .map((ev) => ({ status: ev.status, note: ev.note, actorName: ev.actor_name, createdAt: ev.created_at })),
      };
    });

  const requestRow = db
    .prepare('SELECT * FROM order_deletion_requests WHERE order_id = ? ORDER BY id DESC LIMIT 1')
    .get(orderRow.id);

  return res.json({
    order: {
      ...order,
      tasks,
      deletionRequest: requestRow ? deletionRequestView(requestRow) : null,
    },
  });
});

router.get('/payments', adminOnly, (req, res) => {
  const status = req.query.status === 'all' ? null : str(req.query.status) || 'submitted';
  const conditions = [];
  const params = [];
  if (status) {
    conditions.push('p.status = ?');
    params.push(status);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = db
    .prepare(`
      SELECT p.*, o.order_no, o.customer_name, o.class_name, o.total_amount
      FROM payments p JOIN orders o ON o.id = p.order_id
      ${where}
      ORDER BY p.created_at DESC, p.id DESC
    `)
    .all(...params);

  return res.json({
    payments: rows.map((p) => ({
      id: p.id,
      orderNo: p.order_no,
      customerName: p.customer_name,
      className: p.class_name,
      method: p.method,
      amount: p.total_amount,
      ocrNumber: p.ocr_number,
      screenshotUrl: uploadUrl(p.screenshot_path),
      status: p.status,
      createdAt: p.created_at,
    })),
  });
});

router.post('/payments/:id/review', adminOnly, (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const payment = Number.isInteger(id) ? db.prepare('SELECT * FROM payments WHERE id = ?').get(id) : undefined;
    if (!payment) return res.status(404).json({ error: '支付记录不存在' });
    if (payment.status !== 'submitted') {
      return res.status(400).json({ error: '该支付记录已处理' });
    }

    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(payment.order_id);
    if (!order) return res.status(404).json({ error: '订单不存在' });
    if (order.deleted_at || order.status === 'deleted') {
      return res.status(400).json({ error: '订单已删除' });
    }

    const action = str(req.body?.action);
    const note = str(req.body?.note).slice(0, 300);
    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ error: '请选择核验操作' });
    }

    const reviewerId = Number(req.staff.sub);
    const reviewerName = req.staff.name || '';

    db.exec('BEGIN');
    try {
      if (action === 'approve') {
        db.prepare(`
          UPDATE payments SET status = 'verified', review_note = ?, reviewed_by = ?, reviewed_at = datetime('now','localtime')
          WHERE id = ?
        `).run(note || '核验通过', reviewerId, id);

        const items = db
          .prepare('SELECT * FROM order_items WHERE order_id = ? AND need_production = 1 ORDER BY id ASC')
          .all(order.id)
          .map((it) => ({
            order_item_id: it.id,
            product_name: it.product_name,
            spec_name: it.spec_name,
            color_name: it.color_name,
            pattern_name: it.pattern_name || '',
            is_custom: it.is_custom === 1,
            image_url: it.image_url,
            quantity: it.quantity,
            need_production: 1,
          }));

        const externalCount = createExternalTasks(order, items);
        const finalStatus = externalCount > 0 ? 'producing' : 'packing';

        db.prepare(`
          UPDATE orders SET status = ?, paid_at = datetime('now','localtime'), reject_reason = NULL,
            updated_at = datetime('now','localtime')
          WHERE id = ?
        `).run(finalStatus, order.id);

        addOrderEvent(order.id, 'paid', '支付核验通过');
        if (externalCount > 0) {
          addOrderEvent(order.id, 'producing', `已生成 ${externalCount} 个外部生产任务`);
        }
        audit('staff', reviewerId, reviewerName, 'payment.approve', `订单 ${order.order_no} 支付核验通过`);
      } else {
        const reason = note || '支付信息不匹配，请重新上传';
        db.prepare(`
          UPDATE payments SET status = 'rejected', review_note = ?, reviewed_by = ?, reviewed_at = datetime('now','localtime')
          WHERE id = ?
        `).run(reason, reviewerId, id);
        db.prepare(`
          UPDATE orders SET status = 'pending_payment', reject_reason = ?, updated_at = datetime('now','localtime')
          WHERE id = ?
        `).run(reason, order.id);
        addOrderEvent(order.id, 'pending_payment', `支付核验驳回：${reason}`);
        audit('staff', reviewerId, reviewerName, 'payment.reject', `订单 ${order.order_no} 支付核验驳回：${reason}`);
      }
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

router.get('/gift-codes', adminOnly, (req, res) => {
  const rows = db.prepare('SELECT * FROM gift_codes ORDER BY id ASC').all();
  return res.json({
    giftCodes: rows.map(giftCodeView),
  });
});

router.post('/gift-codes', superOnly, (req, res, next) => {
  try {
    const note = str(req.body?.note).slice(0, 100);
    const maxUses = toInt(req.body?.maxUses, 1);
    if (!isPositiveInt(maxUses, 1, 10000)) {
      return res.status(400).json({ error: '使用次数需为 1-10000 的整数' });
    }
    const expiresAt = assertDateTime(req.body?.expiresAt, '有效期');
    const scope = normalizeGiftScope(req.body || {});

    let code = str(req.body?.code).toUpperCase();
    if (code) {
      if (!/^[A-Z0-9-]{4,40}$/.test(code)) {
        return res.status(400).json({ error: '赠货码需为 4-40 位字母、数字或短横线' });
      }
      const exists = db.prepare('SELECT id FROM gift_codes WHERE code = ?').get(code);
      if (exists) return res.status(400).json({ error: '赠货码已存在' });
    } else {
      for (let attempt = 0; attempt < 20; attempt += 1) {
        const candidate = generateGiftCode();
        if (!db.prepare('SELECT id FROM gift_codes WHERE code = ?').get(candidate)) {
          code = candidate;
          break;
        }
      }
      if (!code) return res.status(500).json({ error: '赠货码生成失败，请重试' });
    }

    const info = db
      .prepare(`
        INSERT INTO gift_codes (code, note, max_uses, used_count, expires_at, active, scope_type, scope_json, created_by, created_at)
        VALUES (?, ?, ?, 0, ?, 1, ?, ?, ?, datetime('now','localtime'))
      `)
      .run(code, note || null, maxUses, expiresAt, scope.type, scope.json, Number(req.staff.sub));

    const row = db.prepare('SELECT * FROM gift_codes WHERE id = ?').get(Number(info.lastInsertRowid));
    audit(
      'staff',
      req.staff.sub,
      req.staff.name,
      'gift_code.create',
      `生成赠货码 ${code}（${scopeLabel(row)}，${maxUses} 次）`
    );
    return res.status(201).json({ giftCode: giftCodeView(row) });
  } catch (err) {
    return next(err);
  }
});

router.patch('/gift-codes/:id', superOnly, (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const gift = Number.isInteger(id) ? db.prepare('SELECT * FROM gift_codes WHERE id = ?').get(id) : undefined;
    if (!gift) return res.status(404).json({ error: '赠货码不存在' });
    if (req.body?.active === undefined) return res.status(400).json({ error: '请指定启停状态' });

    const active = req.body.active === true || req.body.active === 1 || req.body.active === '1' ? 1 : 0;
    db.prepare('UPDATE gift_codes SET active = ? WHERE id = ?').run(active, id);
    audit('staff', req.staff.sub, req.staff.name, 'gift_code.update', `赠货码 ${gift.code} 设为${active ? '启用' : '停用'}`);

    const row = db.prepare('SELECT * FROM gift_codes WHERE id = ?').get(id);
    return res.json({ giftCode: giftCodeView(row) });
  } catch (err) {
    return next(err);
  }
});

router.get('/deletion-requests', adminOnly, (req, res) => {
  const rows = db
    .prepare('SELECT * FROM order_deletion_requests ORDER BY created_at DESC, id DESC')
    .all();
  return res.json({ requests: rows.map(deletionRequestView) });
});

router.post('/orders/:orderNo/deletion-request', adminOnly, (req, res, next) => {
  try {
    const order = db.prepare('SELECT * FROM orders WHERE order_no = ?').get(req.params.orderNo);
    if (!order) return res.status(404).json({ error: '订单不存在' });
    if (order.deleted_at || order.status === 'deleted') {
      return res.status(400).json({ error: '订单已删除' });
    }
    const existing = db
      .prepare("SELECT id FROM order_deletion_requests WHERE order_id = ? AND status = 'pending'")
      .get(order.id);
    if (existing) return res.status(400).json({ error: '该订单已有待审批的删除申请' });

    const reason = str(req.body?.reason);
    if (!reason) return res.status(400).json({ error: '请填写删除原因' });
    if (reason.length > 300) return res.status(400).json({ error: '删除原因不能超过 300 字' });

    const staffId = Number(req.staff.sub);
    const staffName = req.staff.name || '';
    const role = req.staff.role;

    const info = db
      .prepare(`
        INSERT INTO order_deletion_requests (order_id, order_no, requested_by, requested_by_name, reason, status, required_count, created_at)
        VALUES (?, ?, ?, ?, ?, 'pending', 2, datetime('now','localtime'))
      `)
      .run(order.id, order.order_no, staffId, staffName, reason);
    const requestId = Number(info.lastInsertRowid);

    if (role === 'super_admin') {
      db.prepare(
        "INSERT OR IGNORE INTO order_deletion_approvals (request_id, staff_id, staff_name, created_at) VALUES (?, ?, ?, datetime('now','localtime'))"
      ).run(requestId, staffId, staffName);
    }

    audit('staff', staffId, staffName, 'order.deletion_request', `对订单 ${order.order_no} 发起删除申请：${reason}`);
    const request = db.prepare('SELECT * FROM order_deletion_requests WHERE id = ?').get(requestId);
    return res.status(201).json({ request: deletionRequestView(request) });
  } catch (err) {
    return next(err);
  }
});

router.post('/deletion-requests/:id/approve', superOnly, (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const request = Number.isInteger(id)
      ? db.prepare('SELECT * FROM order_deletion_requests WHERE id = ?').get(id)
      : undefined;
    if (!request) return res.status(404).json({ error: '删除申请不存在' });
    if (request.status !== 'pending') return res.status(400).json({ error: '该申请已处理' });

    const staffId = Number(req.staff.sub);
    const staffName = req.staff.name || '';
    const already = db
      .prepare('SELECT id FROM order_deletion_approvals WHERE request_id = ? AND staff_id = ?')
      .get(id, staffId);
    if (already) return res.status(400).json({ error: '您已确认过该申请' });

    db.exec('BEGIN');
    try {
      db.prepare(
        "INSERT INTO order_deletion_approvals (request_id, staff_id, staff_name, created_at) VALUES (?, ?, ?, datetime('now','localtime'))"
      ).run(id, staffId, staffName);

      const count = Number(
        db.prepare('SELECT COUNT(*) AS c FROM order_deletion_approvals WHERE request_id = ?').get(id).c
      );

      if (count >= request.required_count) {
        db.prepare(`
          UPDATE orders SET status = 'deleted', deleted_at = datetime('now','localtime'), deleted_by = ?,
            updated_at = datetime('now','localtime')
          WHERE id = ?
        `).run(staffId, request.order_id);
        db.prepare(`
          UPDATE production_tasks SET status = 'cancelled', updated_at = datetime('now','localtime')
          WHERE order_id = ?
        `).run(request.order_id);
        db.prepare(`
          UPDATE order_deletion_requests SET status = 'approved', resolved_at = datetime('now','localtime')
          WHERE id = ?
        `).run(id);
        addOrderEvent(request.order_id, 'deleted', `删除申请已通过（${count}/${request.required_count}），订单已归档`);
        audit('staff', staffId, staffName, 'order.delete', `订单 ${request.order_no} 删除申请通过并归档`);
      } else {
        audit('staff', staffId, staffName, 'order.deletion_approve', `订单 ${request.order_no} 删除申请确认（${count}/${request.required_count}）`);
      }
      db.exec('COMMIT');
    } catch (err) {
      try {
        db.exec('ROLLBACK');
      } catch {
        // ignore
      }
      throw err;
    }

    const updated = db.prepare('SELECT * FROM order_deletion_requests WHERE id = ?').get(id);
    return res.json({ request: deletionRequestView(updated) });
  } catch (err) {
    return next(err);
  }
});

router.post('/deletion-requests/:id/reject', superOnly, (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const request = Number.isInteger(id)
      ? db.prepare('SELECT * FROM order_deletion_requests WHERE id = ?').get(id)
      : undefined;
    if (!request) return res.status(404).json({ error: '删除申请不存在' });
    if (request.status !== 'pending') return res.status(400).json({ error: '该申请已处理' });

    db.prepare(`
      UPDATE order_deletion_requests SET status = 'rejected', resolved_at = datetime('now','localtime')
      WHERE id = ?
    `).run(id);

    audit('staff', req.staff.sub, req.staff.name, 'order.deletion_reject', `订单 ${request.order_no} 删除申请被驳回`);
    const updated = db.prepare('SELECT * FROM order_deletion_requests WHERE id = ?').get(id);
    return res.json({ request: deletionRequestView(updated) });
  } catch (err) {
    return next(err);
  }
});

router.get('/audit-logs', adminOnly, (req, res) => {
  const limit = paginationLimit(req.query.limit, 100, 500);
  const rows = db
    .prepare('SELECT * FROM audit_logs ORDER BY created_at DESC, id DESC LIMIT ?')
    .all(limit);
  return res.json({
    logs: rows.map((row) => ({
      id: row.id,
      actorType: row.actor_type,
      actorName: row.actor_name,
      action: row.action,
      detail: row.detail,
      createdAt: row.created_at,
    })),
  });
});

export default router;
