import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDatabase } from './lib/sqlite.js';
import { hashPassword } from './auth.js';
import { DEFAULT_SETTINGS, SETTINGS_KEY } from './lib/settings-defaults.js';

const DATA_DIR = process.env.DATA_DIR || path.join(os.tmpdir(), 'campus-sales-platform-v2');
fs.mkdirSync(DATA_DIR, { recursive: true });

export const DB_PATH = path.join(DATA_DIR, 'app.db');
export const db = await openDatabase(DB_PATH);

db.exec('PRAGMA foreign_keys = ON');
db.exec('PRAGMA journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS staff (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  student_id TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('super_admin','admin','prod_external','prod_internal')),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','disabled')),
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  class_name TEXT NOT NULL,
  seat_no TEXT NOT NULL,
  student_id TEXT,
  created_at TEXT,
  UNIQUE(name, class_name, seat_no)
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category TEXT,
  description TEXT,
  base_price INTEGER NOT NULL,
  cover_url TEXT,
  stock INTEGER NOT NULL DEFAULT 0,
  need_production INTEGER NOT NULL DEFAULT 0,
  is_presale INTEGER NOT NULL DEFAULT 0,
  presale_eta TEXT,
  specs_json TEXT,
  colors_json TEXT,
  status TEXT NOT NULL DEFAULT 'on',
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_no TEXT UNIQUE NOT NULL,
  user_id INTEGER,
  customer_name TEXT,
  class_name TEXT,
  seat_no TEXT,
  student_id TEXT,
  delivery_method TEXT CHECK(delivery_method IN ('class','pickup')),
  delivery_detail TEXT,
  time_slot TEXT CHECK(time_slot IN ('day_break','noon','evening','evening_study')),
  contact_type TEXT CHECK(contact_type IN ('qq','wechat','phone')),
  contact_value TEXT,
  remark TEXT,
  payment_method TEXT CHECK(payment_method IN ('wechat','alipay','gift')),
  status TEXT NOT NULL,
  total_amount INTEGER NOT NULL DEFAULT 0,
  original_amount INTEGER,
  discount_amount INTEGER NOT NULL DEFAULT 0,
  gift_code TEXT,
  reject_reason TEXT,
  created_at TEXT,
  updated_at TEXT,
  paid_at TEXT,
  completed_at TEXT,
  deleted_at TEXT,
  deleted_by INTEGER
);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  product_id INTEGER,
  product_name TEXT,
  spec_name TEXT,
  color_name TEXT,
  color_hex TEXT,
  image_url TEXT,
  unit_price INTEGER NOT NULL,
  quantity INTEGER NOT NULL,
  subtotal INTEGER NOT NULL,
  need_production INTEGER NOT NULL DEFAULT 0,
  discount_amount INTEGER NOT NULL DEFAULT 0,
  gift_free INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  method TEXT,
  screenshot_path TEXT,
  ocr_number TEXT,
  ocr_raw TEXT,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK(status IN ('submitted','verified','rejected')),
  review_note TEXT,
  reviewed_by INTEGER,
  reviewed_at TEXT,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS gift_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  note TEXT,
  max_uses INTEGER NOT NULL DEFAULT 1,
  used_count INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  scope_type TEXT NOT NULL DEFAULT 'all',
  scope_json TEXT,
  created_by INTEGER,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS gift_code_usages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  gift_code_id INTEGER NOT NULL,
  order_id INTEGER,
  used_at TEXT
);

CREATE TABLE IF NOT EXISTS production_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK(type IN ('external','internal')),
  order_id INTEGER NOT NULL,
  order_item_id INTEGER,
  order_no TEXT,
  product_name TEXT,
  spec_name TEXT,
  color_name TEXT,
  image_url TEXT,
  quantity INTEGER NOT NULL DEFAULT 1,
  class_name TEXT,
  time_slot TEXT,
  contact_type TEXT,
  contact_value TEXT,
  delivery_method TEXT,
  delivery_detail TEXT,
  status TEXT NOT NULL,
  assignee_id INTEGER,
  note TEXT,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS task_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL,
  status TEXT,
  note TEXT,
  actor_id INTEGER,
  actor_name TEXT,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS order_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  status TEXT,
  note TEXT,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS order_deletion_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  order_no TEXT,
  requested_by INTEGER,
  requested_by_name TEXT,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
  required_count INTEGER NOT NULL DEFAULT 2,
  created_at TEXT,
  resolved_at TEXT
);

CREATE TABLE IF NOT EXISTS order_deletion_approvals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id INTEGER NOT NULL,
  staff_id INTEGER NOT NULL,
  staff_name TEXT,
  created_at TEXT,
  UNIQUE(request_id, staff_id)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_type TEXT,
  actor_id INTEGER,
  actor_name TEXT,
  action TEXT,
  detail TEXT,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_tasks_order ON production_tasks(order_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON production_tasks(status);
CREATE INDEX IF NOT EXISTS idx_task_events_task ON task_events(task_id);
CREATE INDEX IF NOT EXISTS idx_order_events_order ON order_events(order_id);
CREATE INDEX IF NOT EXISTS idx_gift_usages_code ON gift_code_usages(gift_code_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
`);

function ensureColumn(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!columns.some((item) => item.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

ensureColumn('orders', 'original_amount', 'INTEGER');
ensureColumn('orders', 'discount_amount', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('order_items', 'discount_amount', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('order_items', 'gift_free', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('gift_codes', 'scope_type', "TEXT NOT NULL DEFAULT 'all'");
ensureColumn('gift_codes', 'scope_json', 'TEXT');
ensureColumn('products', 'is_presale', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('products', 'presale_eta', 'TEXT');

function img(prompt) {
  return `https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=${encodeURIComponent(prompt)}&image_size=square`;
}

function demoMode() {
  return process.env.SEED_DEMO === '1' || process.env.SEED_DEMO === 'true';
}

function seedStaff() {
  const row = db.prepare('SELECT COUNT(*) AS c FROM staff').get();
  if (Number(row.c) > 0) return;

  const insert = db.prepare(`
    INSERT INTO staff (username, student_id, password_hash, display_name, role, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'active', datetime('now','localtime'), datetime('now','localtime'))
  `);

  const staffSeeds = demoMode()
    ? [
        ['admin01', '20230101', 'Admin@123', '陈明远', 'super_admin'],
        ['admin02', '20230102', 'Admin@123', '周雅', 'super_admin'],
        ['admin03', '20230103', 'Admin@123', '李承泽', 'super_admin'],
        ['manager01', '20230201', 'Manager@123', '王悦', 'admin'],
        ['maker01', '20230301', 'Maker@123', '手作坊-阿梓', 'prod_external'],
        ['maker02', '20230302', 'Maker@123', '烘焙社-小柯', 'prod_external'],
        ['packer01', '20230401', 'Packer@123', '配送组-老陈', 'prod_internal'],
      ]
    : [
        ['admin', '20260000', 'Admin123', '管理员', 'super_admin'],
      ];
  for (const [username, studentId, password, displayName, role] of staffSeeds) {
    insert.run(username, studentId, hashPassword(password), displayName, role);
  }
}

function seedUsers() {
  const row = db.prepare('SELECT COUNT(*) AS c FROM users').get();
  if (Number(row.c) > 0) return;
  db.prepare(`
    INSERT INTO users (name, class_name, seat_no, student_id, created_at)
    VALUES ('林小满', '高二(3)班', '12', '20230112', datetime('now','localtime'))
  `).run();
}

function seedProducts() {
  const row = db.prepare('SELECT COUNT(*) AS c FROM products').get();
  if (Number(row.c) > 0) return;

  const products = [
    {
      name: '手工曲奇礼盒',
      category: '烘焙',
      description: '校园手作坊现烤曲奇，黄油香气浓郁，独立小包装，适合与同学分享。',
      basePrice: 1800,
      stock: 120,
      needProduction: 1,
      specs: [
        { name: '经典原味', delta: 0 },
        { name: '海盐可可', delta: 200 },
      ],
      colors: [
        { name: '焦糖棕', hex: '#b07a4a', image: img('handmade butter cookies gift box warm caramel brown') },
        { name: '抹茶绿', hex: '#8bbf8a', image: img('matcha cookies gift box soft green') },
        { name: '奶油白', hex: '#f3e6d8', image: img('butter cookies cream white box') },
      ],
    },
    {
      name: '冷萃咖啡随行瓶',
      category: '饮品',
      description: '低温冷萃 12 小时，顺滑不酸涩，随行瓶装方便带去自习室。',
      basePrice: 1500,
      stock: 90,
      needProduction: 1,
      specs: [
        { name: '标准装', delta: 0 },
        { name: '双倍浓缩', delta: 300 },
      ],
      colors: [
        { name: '深烘黑', hex: '#3b2a20', image: img('cold brew coffee bottle dark roast black') },
        { name: '拿铁棕', hex: '#a9754f', image: img('cold brew latte bottle light brown') },
      ],
    },
    {
      name: '校园帆布袋',
      category: '文创',
      description: '加厚帆布，手绘校园地标图案，可装课本与笔记本电脑。',
      basePrice: 3200,
      stock: 200,
      needProduction: 0,
      specs: [
        { name: '标准款', delta: 0 },
        { name: '加厚款', delta: 500 },
      ],
      colors: [
        { name: '米白', hex: '#efe7d9', image: img('campus canvas tote bag beige minimal') },
        { name: '青绿', hex: '#3aa79a', image: img('campus canvas tote bag teal green') },
      ],
    },
    {
      name: '香薰蜡烛',
      category: '手工',
      description: '大豆蜡搭配木质烛芯，晚自习后的放松小物，燃烧约 20 小时。',
      basePrice: 4500,
      stock: 60,
      needProduction: 1,
      specs: [
        { name: '小号', delta: 0 },
        { name: '大号', delta: 1200 },
      ],
      colors: [
        { name: '晚香玉', hex: '#f0d9c9', image: img('scented candle tuberose soft beige jar') },
        { name: '雪松', hex: '#7c6a58', image: img('cedar scented candle dark brown jar') },
      ],
    },
    {
      name: '校园明信片套装',
      category: '文创',
      description: '六张一套的校园四季手绘明信片，可寄给远方的朋友。',
      basePrice: 900,
      stock: 500,
      needProduction: 0,
      specs: [
        { name: '6 张装', delta: 0 },
        { name: '12 张装', delta: 600 },
      ],
      colors: [
        { name: '校园蓝', hex: '#6fa8dc', image: img('campus postcards blue sky illustration') },
        { name: '秋日橙', hex: '#e8a05a', image: img('campus postcards autumn orange illustration') },
      ],
    },
    {
      name: '果茶包组合',
      category: '饮品',
      description: '真实果干冷泡茶包，无额外添加糖，宿舍随时来一杯。',
      basePrice: 1200,
      stock: 300,
      needProduction: 0,
      specs: [
        { name: '原味', delta: 0 },
        { name: '蜜桃', delta: 200 },
      ],
      colors: [
        { name: '蜜桃粉', hex: '#f2a7a7', image: img('fruit tea bags peach pink packaging') },
        { name: '柠檬黄', hex: '#f3d36b', image: img('fruit tea bags lemon yellow packaging') },
      ],
    },
  ];

  const insert = db.prepare(`
    INSERT INTO products (name, category, description, base_price, cover_url, stock, need_production, specs_json, colors_json, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'on', datetime('now','localtime'))
  `);
  for (const p of products) {
    insert.run(
      p.name,
      p.category,
      p.description,
      p.basePrice,
      p.colors[0].image,
      p.stock,
      p.needProduction,
      JSON.stringify(p.specs),
      JSON.stringify(p.colors)
    );
  }
}

function seedGiftCodes() {
  const row = db.prepare('SELECT COUNT(*) AS c FROM gift_codes').get();
  if (Number(row.c) > 0) return;
  const insert = db.prepare(`
    INSERT INTO gift_codes (code, note, max_uses, used_count, expires_at, active, created_by, created_at)
    VALUES (?, ?, ?, 0, ?, 1, NULL, datetime('now','localtime'))
  `);
  insert.run('WELCOME2026', '开学季欢迎赠货码', 50, null);
  insert.run('GIFT-DEMO1', '演示用赠货码（30 天有效）', 3, db.prepare("SELECT datetime('now','localtime','+30 days') AS t").get().t);
}

function seedDemoOrders() {
  const row = db.prepare('SELECT COUNT(*) AS c FROM orders').get();
  if (Number(row.c) > 0) return;

  const user = db.prepare("SELECT * FROM users WHERE name = '林小满' ORDER BY id LIMIT 1").get();
  if (!user) return;

  const products = db.prepare('SELECT * FROM products ORDER BY id').all();
  const byName = (name) => products.find((p) => p.name === name);

  const orderInsert = db.prepare(`
    INSERT INTO orders (order_no, user_id, customer_name, class_name, seat_no, student_id, delivery_method, delivery_detail,
      time_slot, contact_type, contact_value, remark, payment_method, status, total_amount, gift_code, reject_reason,
      created_at, updated_at, paid_at, completed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const itemInsert = db.prepare(`
    INSERT INTO order_items (order_id, product_id, product_name, spec_name, color_name, color_hex, image_url, unit_price, quantity, subtotal, need_production)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const eventInsert = db.prepare(
    "INSERT INTO order_events (order_id, status, note, created_at) VALUES (?, ?, ?, ?)"
  );
  const taskInsert = db.prepare(`
    INSERT INTO production_tasks (type, order_id, order_item_id, order_no, product_name, spec_name, color_name, image_url,
      quantity, class_name, time_slot, contact_type, contact_value, delivery_method, delivery_detail, status, assignee_id,
      note, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const taskEventInsert = db.prepare(
    'INSERT INTO task_events (task_id, status, note, actor_id, actor_name, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const paymentInsert = db.prepare(`
    INSERT INTO payments (order_id, method, screenshot_path, ocr_number, ocr_raw, status, review_note, reviewed_by, reviewed_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const orderNoBase = (() => {
    const d = new Date();
    const p = (v) => String(v).padStart(2, '0');
    return `SO${String(d.getFullYear() % 100).padStart(2, '0')}${p(d.getMonth() + 1)}${p(d.getDate())}`;
  })();

  function createSeedOrder({ seq, status, paid, completed, hoursAgo, items, payment, tasks, events, giftCode = null }) {
    const orderNo = `${orderNoBase}${seq}`;
    let total = 0;
    const preparedItems = items.map((it) => {
      const product = byName(it.product);
      const spec = JSON.parse(product.specs_json).find((s) => s.name === it.spec);
      const color = JSON.parse(product.colors_json).find((c) => c.name === it.color);
      const unitPrice = product.base_price + (spec ? spec.delta : 0);
      const subtotal = unitPrice * it.quantity;
      total += subtotal;
      return { product, spec, color, quantity: it.quantity, unitPrice, subtotal };
    });

    const createdAt = db
      .prepare(`SELECT datetime('now','localtime','-${hoursAgo} hours') AS t`)
      .get().t;

    const info = orderInsert.run(
      orderNo,
      user.id,
      user.name,
      user.class_name,
      user.seat_no,
      user.student_id,
      'class',
      '高二(3)班 教室',
      'noon',
      'wechat',
      'linxiaoman_2023',
      '',
      giftCode ? 'gift' : 'wechat',
      status,
      total,
      giftCode,
      null,
      createdAt,
      createdAt,
      paid ? createdAt : null,
      completed ? createdAt : null
    );
    const orderId = Number(info.lastInsertRowid);

    const itemIds = [];
    for (const it of preparedItems) {
      const itemInfo = itemInsert.run(
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
        it.product.need_production
      );
      itemIds.push(Number(itemInfo.lastInsertRowid));
    }

    eventInsert.run(orderId, 'pending_payment', '订单已创建', createdAt);
    if (payment) {
      paymentInsert.run(
        orderId,
        payment.method || 'wechat',
        payment.screenshotPath ?? null,
        payment.ocrNumber || null,
        payment.ocrRaw || null,
        payment.status,
        payment.reviewNote || null,
        null,
        null,
        createdAt
      );
      eventInsert.run(orderId, 'pending_review', '用户已提交支付凭证，等待核验', createdAt);
    }
    if (paid) {
      eventInsert.run(orderId, 'paid', '支付核验通过', createdAt);
    }
    if (tasks && tasks.length) {
      for (const t of tasks) {
        const idx = t.itemIndex ?? 0;
        const it = preparedItems[idx];
        const taskInfo = taskInsert.run(
          t.type,
          orderId,
          itemIds[idx],
          orderNo,
          it.product.name,
          it.spec ? it.spec.name : '',
          it.color ? it.color.name : '',
          it.color ? it.color.image : it.product.cover_url,
          t.quantity ?? it.quantity,
          user.class_name,
          'noon',
          'wechat',
          'linxiaoman_2023',
          'class',
          '高二(3)班 教室',
          t.status,
          null,
          t.note || '',
          createdAt,
          createdAt
        );
        const taskId = Number(taskInfo.lastInsertRowid);
        taskEventInsert.run(taskId, t.status, t.note || '', null, '系统', createdAt);
      }
    }
    if (status === 'producing') {
      eventInsert.run(orderId, 'producing', '已生成外部生产任务', createdAt);
    }
    if (completed) {
      eventInsert.run(orderId, 'completed', '配送完成，订单已完成', createdAt);
    }
  }

  // 订单 1：待核验
  createSeedOrder({
    seq: '900001',
    status: 'pending_review',
    paid: false,
    completed: false,
    hoursAgo: 2,
    items: [
      { product: '手工曲奇礼盒', spec: '经典原味', color: '焦糖棕', quantity: 1 },
      { product: '校园明信片套装', spec: '6 张装', color: '校园蓝', quantity: 2 },
    ],
    payment: {
      method: 'wechat',
      screenshotPath: null,
      ocrNumber: '202601121234567890',
      ocrRaw: '微信支付 单号 202601121234567890 金额 36.00',
      status: 'submitted',
    },
  });

  // 订单 2：已付款/生产中（1 个外部任务 + 内部打包任务）
  createSeedOrder({
    seq: '900002',
    status: 'producing',
    paid: true,
    completed: false,
    hoursAgo: 26,
    items: [
      { product: '冷萃咖啡随行瓶', spec: '标准装', color: '深烘黑', quantity: 1 },
      { product: '校园明信片套装', spec: '6 张装', color: '校园蓝', quantity: 1 },
    ],
    payment: {
      method: 'wechat',
      screenshotPath: null,
      ocrNumber: '202601119988776655',
      ocrRaw: '微信支付 单号 202601119988776655 金额 24.00',
      status: 'verified',
    },
    tasks: [
      { type: 'external', index: 0, itemIndex: 0, status: 'accepted', note: '已接单，准备烘焙' },
      { type: 'internal', itemIndex: 0, status: 'pending_pack', note: '等待外部生产完成' },
    ],
  });

  // 订单 3：已完成
  createSeedOrder({
    seq: '900003',
    status: 'completed',
    paid: true,
    completed: true,
    hoursAgo: 96,
    items: [
      { product: '校园帆布袋', spec: '加厚款', color: '青绿', quantity: 1 },
      { product: '果茶包组合', spec: '蜜桃', color: '蜜桃粉', quantity: 2 },
    ],
    payment: {
      method: 'alipay',
      screenshotPath: null,
      ocrNumber: '202601102233445566',
      ocrRaw: '支付宝 交易号 202601102233445566',
      status: 'verified',
    },
    tasks: [{ type: 'internal', itemIndex: 0, status: 'delivered', note: '已送达高二(3)班' }],
  });

}

function seedSettings() {
  const row = db.prepare('SELECT COUNT(*) AS c FROM settings').get();
  if (Number(row.c) > 0) return;
  db.prepare(
    "INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now','localtime'))"
  ).run(SETTINGS_KEY, JSON.stringify(DEFAULT_SETTINGS));
}

export function initDb() {
  seedStaff();
  if (demoMode()) {
    seedUsers();
    seedProducts();
    seedGiftCodes();
  }
  seedSettings();

  if (demoMode()) {
    const staffCount = Number(db.prepare('SELECT COUNT(*) AS c FROM staff').get().c);
    if (staffCount > 0) {
      seedDemoOrders();
    }
  }
}

initDb();
