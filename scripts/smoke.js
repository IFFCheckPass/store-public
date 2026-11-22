import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const ROOT = path.join(import.meta.dirname, '..');
const PORT = 3100;
const BASE = `http://127.0.0.1:${PORT}`;
const PNG_1X1 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

const results = [];
let currentStep = '启动服务';

function check(name, condition, detail = '') {
  currentStep = name;
  if (!condition) {
    throw new Error(`断言失败：${name}${detail ? `（${detail}）` : ''}`);
  }
}

async function test(name, fn) {
  currentStep = name;
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`PASS  ${name}`);
  } catch (err) {
    results.push({ name, ok: false, error: err.message });
    console.log(`FAIL  ${name}`);
    console.log(`      ${err.message}`);
  }
}

class Session {
  constructor(label) {
    this.label = label;
    this.cookies = new Map();
  }

  header() {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  absorb(res) {
    const list = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
    for (const raw of list) {
      const pair = raw.split(';')[0];
      const eq = pair.indexOf('=');
      if (eq < 0) continue;
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      if (!value) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }
}

async function request(session, method, urlPath, body) {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (session && session.header()) headers.cookie = session.header();
  const res = await fetch(`${BASE}${urlPath}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (session) session.absorb(res);
  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
  }
  return { status: res.status, data, headers: res.headers };
}

function expectStatus(res, expected, label) {
  if (res.status !== expected) {
    throw new Error(`${label} 期望状态码 ${expected}，实际 ${res.status}；响应：${JSON.stringify(res.data)}`);
  }
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

async function waitForHealth(child, timeoutMs = 20000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (child.exitCode !== null) {
      throw new Error(`服务进程提前退出（code=${child.exitCode}）`);
    }
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) return;
    } catch {
      // 服务尚未就绪
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('等待 /api/health 超时');
}

async function main() {
  const tempRoot = mkdtempSync(path.join(tmpdir(), 'campus-sales-smoke-'));
  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      SEED_DEMO: '1',
      DATA_DIR: path.join(tempRoot, 'data'),
      UPLOAD_DIR: path.join(tempRoot, 'uploads'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const logs = [];
  child.stdout.on('data', (chunk) => logs.push(String(chunk)));
  child.stderr.on('data', (chunk) => logs.push(String(chunk)));

  let exitInfo = null;
  child.on('exit', (code, signal) => {
    exitInfo = { code, signal };
  });

  try {
    await waitForHealth(child);
    console.log(`服务已就绪：${BASE}\n`);

    const guest = new Session('guest');
    const super1 = new Session('super1'); // admin01
    const super2 = new Session('super2'); // admin02
    const admin = new Session('admin'); // manager01
    const maker = new Session('maker'); // maker01 外部生产
    const packer = new Session('packer'); // packer01 内部生产
    const user = new Session('user'); // 林小满

    const state = {};

    await test('健康检查', async () => {
      const res = await request(guest, 'GET', '/api/health');
      expectStatus(res, 200, 'GET /api/health');
      expect(res.data.ok === true, 'health 应返回 ok:true');
    });

    await test('错误密码返回 401', async () => {
      const res = await request(guest, 'POST', '/api/auth/staff/login', {
        username: 'admin01',
        studentId: '20230101',
        password: 'wrong-password',
      });
      expectStatus(res, 401, '错误密码登录');
      expect(res.data.error === '用户名、学号或密码不正确', `错误信息不符：${JSON.stringify(res.data)}`);
    });

    await test('三端角色登录', async () => {
      const s1 = await request(super1, 'POST', '/api/auth/staff/login', {
        username: 'admin01',
        studentId: '20230101',
        password: 'Admin@123',
      });
      expectStatus(s1, 200, 'admin01 登录');
      expect(s1.data.staff?.role === 'super_admin', 'admin01 应为 super_admin');

      const s2 = await request(super2, 'POST', '/api/auth/staff/login', {
        username: 'admin02',
        studentId: '20230102',
        password: 'Admin@123',
      });
      expectStatus(s2, 200, 'admin02 登录');

      const a = await request(admin, 'POST', '/api/auth/staff/login', {
        username: 'manager01',
        studentId: '20230201',
        password: 'Manager@123',
      });
      expectStatus(a, 200, 'manager01 登录');
      expect(a.data.staff?.role === 'admin', 'manager01 应为 admin');

      const m = await request(maker, 'POST', '/api/auth/staff/login', {
        username: 'maker01',
        studentId: '20230301',
        password: 'Maker@123',
      });
      expectStatus(m, 200, 'maker01 登录');
      expect(m.data.staff?.role === 'prod_external', 'maker01 应为 prod_external');

      const p = await request(packer, 'POST', '/api/auth/staff/login', {
        username: 'packer01',
        studentId: '20230401',
        password: 'Packer@123',
      });
      expectStatus(p, 200, 'packer01 登录');
      expect(p.data.staff?.role === 'prod_internal', 'packer01 应为 prod_internal');

      const me = await request(admin, 'GET', '/api/auth/staff/me');
      expectStatus(me, 200, 'staff/me');
      expect(me.data.staff?.username === 'manager01', 'staff/me 用户名不一致');
    });

    await test('普通管理员新建账号返回 403', async () => {
      const res = await request(admin, 'POST', '/api/admin/staff', {
        username: 'tmp_staff',
        studentId: '20239999',
        password: 'Tmp@12345',
        displayName: '临时账号',
        role: 'prod_external',
      });
      expectStatus(res, 403, '普通管理员新建账号');
      expect(res.data.error === '无权限执行该操作', '403 错误信息不符');
    });

    await test('商品列表返回 6 条且结构完整', async () => {
      const res = await request(guest, 'GET', '/api/products');
      expectStatus(res, 200, 'GET /api/products');
      expect(Array.isArray(res.data.products), 'products 应为数组');
      expect(res.data.products.length === 6, `商品数量应为 6，实际 ${res.data.products.length}`);
      for (const p of res.data.products) {
        expect(Array.isArray(p.specs) && p.specs.length > 0, `商品 ${p.name} 缺少规格`);
        expect(Array.isArray(p.colors) && p.colors.length > 0, `商品 ${p.name} 缺少颜色`);
        expect(p.colors.every((c) => c.hex && c.image), `商品 ${p.name} 颜色缺少 hex/image`);
      }
      state.products = res.data.products;

      const needProd = res.data.products.find((p) => p.needProduction);
      expect(needProd, '种子商品中应存在需要生产的商品');
      state.prodProduct = needProd;

      const detail = await request(guest, 'GET', `/api/products/${needProd.id}`);
      expectStatus(detail, 200, 'GET /api/products/:id');
      expect(detail.data.product?.id === needProd.id, '商品详情 id 不一致');
    });

    await test('用户登录（姓名+班级+座号）', async () => {
      const res = await request(user, 'POST', '/api/auth/user/login', {
        name: '林小满',
        className: '高二(3)班',
        seatNo: '12',
        studentId: '20230112',
      });
      expectStatus(res, 200, '用户登录');
      expect(res.data.user?.name === '林小满', '返回用户姓名不一致');
      const me = await request(user, 'GET', '/api/auth/user/me');
      expectStatus(me, 200, 'user/me');
      expect(me.data.user?.seatNo === '12', 'user/me 座号不一致');
    });

    await test('微信下单 → 上传截图 → 待核验', async () => {
      const p = state.prodProduct;
      const productsBefore = await request(guest, 'GET', '/api/products');
      state.stockBefore = productsBefore.data.products.find((x) => x.id === p.id).stock;

      const unitPrice = p.basePrice + p.specs[0].delta;
      const created = await request(user, 'POST', '/api/orders', {
        items: [{ productId: p.id, specName: p.specs[0].name, colorName: p.colors[0].name, quantity: 2 }],
        deliveryMethod: 'class',
        deliveryDetail: '高二(3)班 教室',
        timeSlot: 'noon',
        contactType: 'wechat',
        contactValue: 'linxiaoman_smoke',
        remark: '冒烟测试订单',
        paymentMethod: 'wechat',
      });
      expectStatus(created, 201, '创建订单');
      const order = created.data.order;
      expect(order.status === 'pending_payment', `初始状态应为 pending_payment，实际 ${order.status}`);
      expect(order.totalAmount === unitPrice * 2, `订单金额错误：${order.totalAmount}`);
      expect(order.items.length === 1, '订单明细数量错误');
      expect(order.statusLabel === '待付款', `状态标签错误：${order.statusLabel}`);
      state.orderNo = order.orderNo;

      const afterCreate = await request(guest, 'GET', '/api/products');
      const stockAfter = afterCreate.data.products.find((x) => x.id === p.id).stock;
      expect(stockAfter === state.stockBefore - 2, `库存应减少 2，实际 ${state.stockBefore} → ${stockAfter}`);

      const paid = await request(user, 'POST', `/api/orders/${order.orderNo}/payment`, {
        imageDataUrl: PNG_1X1,
        ocrNumber: '123456789012345678',
        ocrRaw: 'mock ocr raw text',
      });
      expectStatus(paid, 200, '上传支付截图');
      expect(paid.data.order.status === 'pending_review', `上传后状态应为 pending_review，实际 ${paid.data.order.status}`);
      expect(
        typeof paid.data.order.payment?.screenshotViewUrl === 'string' &&
          paid.data.order.payment.screenshotViewUrl.startsWith('/api/orders/'),
        '支付截图鉴权 URL 未生成'
      );

      // 支付截图不能被静态直链访问（含付款人信息），只能走鉴权接口
      const fileRes = await fetch(`${BASE}${paid.data.order.payment.screenshotUrl}`);
      expect(!fileRes.ok, '支付截图不应能通过静态地址直接访问');
      const secRes = await fetch(`${BASE}${paid.data.order.payment.screenshotViewUrl}`, {
        headers: { cookie: user.header() },
      });
      expect(secRes.ok, '支付截图鉴权接口不可访问');

      const mine = await request(user, 'GET', '/api/orders/mine');
      expectStatus(mine, 200, 'GET /api/orders/mine');
      const mineOrder = mine.data.orders.find((o) => o.orderNo === order.orderNo);
      expect(mineOrder, '我的订单列表中缺少新订单');
      expect(mineOrder.statusLabel === '待核验', '列表 statusLabel 错误');
      expect(mineOrder.itemCount === 1, '列表 itemCount 错误');
      expect(Boolean(mineOrder.firstImage), '列表缺少商品首图');
    });

    await test('管理端核验通过 → 已付款/生产中', async () => {
      const list = await request(admin, 'GET', '/api/admin/payments?status=submitted');
      expectStatus(list, 200, '支付核验列表');
      const payment = list.data.payments.find((p) => p.orderNo === state.orderNo);
      expect(payment, '核验队列中缺少该订单支付记录');
      state.paymentId = payment.id;

      // 资金核验已收紧为仅超级管理员可操作
      const review = await request(super2, 'POST', `/api/admin/payments/${payment.id}/review`, {
        action: 'approve',
        note: '金额一致，核验通过',
        paidAmount: payment.amount,
      });
      expectStatus(review, 200, '核验通过');
      const order = review.data.order;
      expect(order.status === 'producing', `核验后订单状态应为 producing，实际 ${order.status}`);
      expect(Boolean(order.paidAt), '核验后 paidAt 应为非空');
      expect(order.payment?.status === 'verified', 'payment 状态应为 verified');
      expect(order.externalTasks.length >= 1, '应生成外部生产任务');

      const detail = await request(admin, 'GET', `/api/admin/orders/${state.orderNo}`);
      expectStatus(detail, 200, '管理端订单详情');
      expect(Array.isArray(detail.data.order.tasks) && detail.data.order.tasks.length >= 2, '订单详情应包含生产与打包任务');
      expect(detail.data.order.items.length === 1, '订单详情明细错误');
      expect(Array.isArray(detail.data.order.timeline), '订单详情缺少时间线');
    });

    await test('外部生产任务 accepted → producing → done', async () => {
      const tasksRes = await request(maker, 'GET', '/api/production/tasks');
      expectStatus(tasksRes, 200, '外部任务列表');
      expect(
        tasksRes.data.tasks.every((t) => t.type === 'external'),
        '外部账号不应看到内部任务'
      );
      const task = tasksRes.data.tasks.find((t) => t.orderNo === state.orderNo);
      expect(task, '外部任务列表中缺少该订单任务');
      expect(task.status === 'pending', `外部任务初始状态应为 pending，实际 ${task.status}`);
      state.externalTaskId = task.id;

      for (const [status, note] of [
        ['accepted', '已接单'],
        ['producing', '开始生产'],
        ['done', '生产完成'],
      ]) {
        const res = await request(maker, 'POST', `/api/production/tasks/${task.id}/status`, { status, note });
        expectStatus(res, 200, `外部任务更新为 ${status}`);
        expect(res.data.task.status === status, `任务状态应为 ${status}`);
      }

      const detail = await request(user, 'GET', `/api/orders/${state.orderNo}`);
      expectStatus(detail, 200, '用户查看订单');
      expect(
        detail.data.order.status === 'packing',
        `外部任务全部完成后订单应进入 packing，实际 ${detail.data.order.status}`
      );
    });

    await test('内部打包任务 packing → packed → delivering → delivered', async () => {
      const tasksRes = await request(packer, 'GET', '/api/production/tasks');
      expectStatus(tasksRes, 200, '内部任务列表');
      expect(
        tasksRes.data.tasks.every((t) => t.type === 'internal'),
        '内部账号不应看到外部任务'
      );
      const task = tasksRes.data.tasks.find((t) => t.orderNo === state.orderNo);
      expect(task, '内部任务列表中缺少该订单任务');
      expect(task.status === 'pending_pack', `内部任务初始状态应为 pending_pack，实际 ${task.status}`);
      state.internalTaskId = task.id;

      for (const [status, note] of [
        ['packing', '开始打包'],
        ['packed', '打包完成'],
        ['delivering', '开始配送'],
        ['delivered', '已送达'],
      ]) {
        const res = await request(packer, 'POST', `/api/production/tasks/${task.id}/status`, { status, note });
        expectStatus(res, 200, `内部任务更新为 ${status}`);
        expect(res.data.task.events.length >= 2, '任务时间线未记录');
      }

      const detail = await request(user, 'GET', `/api/orders/${state.orderNo}`);
      expectStatus(detail, 200, '用户查看已完成订单');
      expect(detail.data.order.status === 'completed', `订单应完成，实际 ${detail.data.order.status}`);
      expect(Boolean(detail.data.order.completedAt), 'completedAt 应为非空');
      expect(detail.data.order.statusLabel === '已完成', '完成状态标签错误');
      state.completedOrderNo = state.orderNo;

      const stats = await request(packer, 'GET', '/api/production/stats');
      expectStatus(stats, 200, '生产统计');
      expect(
        ['pending', 'processing', 'done', 'issue'].every((k) => typeof stats.data[k] === 'number'),
        '统计字段不完整'
      );
    });

    await test('赠货码下单免支付并核销次数，无效码被拒', async () => {
      const before = await request(super1, 'GET', '/api/admin/gift-codes');
      expectStatus(before, 200, '赠货码列表');
      const welcome = before.data.giftCodes.find((g) => g.code === 'WELCOME2026');
      expect(welcome, '缺少 WELCOME2026 赠货码');
      state.giftUsedBefore = welcome.usedCount;

      const validate = await request(user, 'POST', '/api/gift-codes/validate', { code: 'WELCOME2026' });
      expectStatus(validate, 200, '赠货码校验');
      expect(validate.data.valid === true, 'WELCOME2026 应可用');

      const noProd = state.products.find((p) => !p.needProduction);
      const created = await request(user, 'POST', '/api/orders', {
        items: [{ productId: noProd.id, specName: noProd.specs[0].name, colorName: noProd.colors[0].name, quantity: 1 }],
        deliveryMethod: 'class',
        deliveryDetail: '高二(3)班',
        timeSlot: 'evening',
        contactType: 'phone',
        contactValue: '13800138000',
        remark: '赠货码冒烟订单',
        paymentMethod: 'gift',
        giftCode: 'WELCOME2026',
      });
      expectStatus(created, 201, '赠货码下单');
      const order = created.data.order;
      expect(order.paymentMethod === 'gift', '支付方式应为 gift');
      expect(order.payment?.status === 'verified', '赠货码支付记录应为 verified');
      expect(Boolean(order.paidAt), '赠货码订单 paidAt 应为非空');
      expect(order.status === 'packing', `无生产明细的赠货码订单应进入 packing，实际 ${order.status}`);
      expect(order.giftCode === 'WELCOME2026', '订单应记录赠货码');

      const after = await request(super1, 'GET', '/api/admin/gift-codes');
      const welcomeAfter = after.data.giftCodes.find((g) => g.code === 'WELCOME2026');
      expect(
        welcomeAfter.usedCount === state.giftUsedBefore + 1,
        `赠货码已用次数应 +1：${state.giftUsedBefore} → ${welcomeAfter.usedCount}`
      );

      const invalid = await request(user, 'POST', '/api/orders', {
        items: [{ productId: noProd.id, specName: noProd.specs[0].name, colorName: noProd.colors[0].name, quantity: 1 }],
        deliveryMethod: 'class',
        deliveryTime: 'evening',
        deliveryDetail: '高二(3)班',
        timeSlot: 'evening',
        contactType: 'phone',
        contactValue: '13800138000',
        paymentMethod: 'gift',
        giftCode: 'NO-SUCH-CODE',
      });
      expectStatus(invalid, 400, '无效赠货码下单');
      expect(String(invalid.data.error).includes('不存在'), `无效码错误信息不符：${JSON.stringify(invalid.data)}`);

      const invalidValidate = await request(user, 'POST', '/api/gift-codes/validate', { code: 'NO-SUCH-CODE' });
      expectStatus(invalidValidate, 400, '无效赠货码校验');
      expect(invalidValidate.data.valid === false, '无效码应返回 valid:false');
    });

    await test('生产端任务详情包含时间线', async () => {
      const res = await request(maker, 'GET', '/api/production/tasks');
      expectStatus(res, 200, '外部任务列表（复核）');
      const task = res.data.tasks.find((t) => t.id === state.externalTaskId);
      expect(task, '应仍可查询到已完成任务');
      expect(task.status === 'done', '外部任务应为 done');
      expect(task.events.length >= 4, `任务事件应包含接单/生产/完成记录，实际 ${task.events.length}`);
      expect(task.events.some((e) => e.actorName === '手作坊-阿梓'), '任务事件缺少操作人');
    });

    await test('删除申请：admin01 发起、admin02 确认后软删除', async () => {
      const created = await request(super1, 'POST', `/api/admin/orders/${state.completedOrderNo}/deletion-request`, {
        reason: '冒烟测试：模拟误单归档',
      });
      expectStatus(created, 201, '发起删除申请');
      const requestId = created.data.request.id;
      expect(created.data.request.status === 'pending', '申请状态应为 pending');
      expect(created.data.request.approvals.length === 1, 'super_admin 发起应自动计入 1 次确认');
      state.deletionRequestId = requestId;

      const duplicate = await request(super1, 'POST', `/api/admin/orders/${state.completedOrderNo}/deletion-request`, {
        reason: '重复发起',
      });
      expectStatus(duplicate, 400, '重复发起删除申请');

      const duplicateApprove = await request(super1, 'POST', `/api/admin/deletion-requests/${requestId}/approve`);
      expectStatus(duplicateApprove, 400, '同一账号重复确认');

      const approved = await request(super2, 'POST', `/api/admin/deletion-requests/${requestId}/approve`);
      expectStatus(approved, 200, '第二位超级管理员确认');
      expect(approved.data.request.status === 'approved', '确认后申请状态应为 approved');
      expect(approved.data.request.approvals.length >= 2, '确认人数应达到 2');

      const defaultList = await request(super1, 'GET', '/api/admin/orders');
      expectStatus(defaultList, 200, '管理端订单列表');
      expect(
        !defaultList.data.orders.some((o) => o.orderNo === state.completedOrderNo),
        '已删除订单不应出现在默认列表'
      );

      const withDeleted = await request(super1, 'GET', '/api/admin/orders?includeDeleted=1');
      const deleted = withDeleted.data.orders.find((o) => o.orderNo === state.completedOrderNo);
      expect(deleted, 'includeDeleted=1 应包含已删除订单');
      expect(deleted.status === 'deleted', '已删除订单状态应为 deleted');

      const userDetail = await request(user, 'GET', `/api/orders/${state.completedOrderNo}`);
      expectStatus(userDetail, 404, '用户访问已删除订单');

      const mine = await request(user, 'GET', '/api/orders/mine');
      expect(
        !mine.data.orders.some((o) => o.orderNo === state.completedOrderNo),
        '用户订单列表不应包含已删除订单'
      );
    });

    await test('越权访问被拒绝', async () => {
      const userToAdmin = await request(user, 'GET', '/api/admin/overview');
      expectStatus(userToAdmin, 401, '用户访问管理端');

      const makerToAdmin = await request(maker, 'GET', '/api/admin/orders');
      expectStatus(makerToAdmin, 403, '外部生产访问管理端');

      const guestToProduction = await request(guest, 'GET', '/api/production/tasks');
      expectStatus(guestToProduction, 401, '游客访问生产端');

      const guestToOrders = await request(guest, 'POST', '/api/orders', { items: [] });
      expectStatus(guestToOrders, 401, '游客下单');

      const makerApprove = await request(maker, 'POST', `/api/admin/deletion-requests/${state.deletionRequestId}/approve`);
      expectStatus(makerApprove, 403, '生产账号审批删除申请');

      const wrongOrder = await request(user, 'GET', '/api/orders/SO000000NOTEXIST');
      expectStatus(wrongOrder, 404, '查询不存在订单');
    });

    await test('审计日志非空且包含关键操作', async () => {
      const res = await request(super1, 'GET', '/api/admin/audit-logs?limit=200');
      expectStatus(res, 200, '审计日志');
      expect(Array.isArray(res.data.logs) && res.data.logs.length > 0, '审计日志不应为空');
      const actions = new Set(res.data.logs.map((l) => l.action));
      expect(actions.has('staff.login'), '审计日志缺少登录记录');
      expect(actions.has('payment.approve'), '审计日志缺少支付核验记录');
      expect(actions.has('order.delete'), '审计日志缺少订单删除记录');
      for (const log of res.data.logs) {
        expect('actorType' in log && 'actorName' in log && 'createdAt' in log, '审计日志字段不完整');
      }
      state.auditCount = res.data.logs.length;
    });
  } finally {
    child.kill('SIGTERM');
    const stopAt = Date.now();
    while (child.exitCode === null && Date.now() - stopAt < 5000) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (child.exitCode === null) child.kill('SIGKILL');

    const failed = results.filter((r) => !r.ok);
    console.log('\n========== 冒烟测试摘要 ==========');
    console.log(`通过：${results.length - failed.length} 项，失败：${failed.length} 项`);
    if (failed.length > 0) {
      console.log('\n失败详情：');
      for (const f of failed) console.log(` - ${f.name}\n   ${f.error}`);
      console.log('\n服务日志（末尾 80 行）：');
      console.log(logs.join('').split('\n').slice(-80).join('\n'));
      console.log(`\nFAIL（最后步骤：${currentStep}）`);
      process.exitCode = 1;
    } else {
      console.log(`PASS  全部 ${results.length} 项检查通过`);
      process.exitCode = 0;
    }
    if (exitInfo) console.log(`服务进程退出：code=${exitInfo.code} signal=${exitInfo.signal}`);
  }
}

main().catch((err) => {
  console.error('冒烟测试异常终止：', err);
  process.exitCode = 1;
});
