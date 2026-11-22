import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cookieParser from 'cookie-parser';
import './db.js';
import authRouter from './routes/auth.js';
import productsRouter from './routes/products.js';
import ordersRouter, { releaseExpiredOrders } from './routes/orders.js';
import productionRouter from './routes/production.js';
import adminRouter from './routes/admin.js';
import giftCodesRouter from './routes/giftcodes.js';
import settingsRouter from './routes/settings.js';
import adminSettingsRouter from './routes/admin-settings.js';
import adminProductsRouter from './routes/admin-products.js';
import uploadsRouter from './routes/uploads.js';
import { optimizeDirectory, serveWebpWhenSupported } from './lib/images.js';

const ROOT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const UPLOADS_DIR =
  process.env.UPLOAD_DIR || path.join(os.tmpdir(), 'campus-sales-platform-v2', 'uploads');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const app = express();
app.disable('x-powered-by');

// 安全响应头（无内联脚本，CSP 可收紧到同源脚本）
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; img-src 'self' data: blob: https:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; font-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
  );
  next();
});

// 只接受 HTTPS：Cloudflare 会带 x-forwarded-proto，明文 http 访问一律 308 跳到 https
app.use((req, res, next) => {
  const proto = String(req.headers['x-forwarded-proto'] || '')
    .split(',')[0]
    .trim()
    .toLowerCase();
  if (proto === 'http') {
    const host = req.headers.host || '';
    return res.redirect(308, `https://${host}${req.originalUrl}`);
  }
  return next();
});

// 普通接口 body 上限 10MB；备份导入的体积校验放到该路由的鉴权之后（见 admin.js），
// 避免未认证请求先把 200MB 读进内存造成 OOM。
const jsonParser = express.json({ limit: '10mb' });
app.use((req, res, next) => {
  if (req.path === '/api/admin/backup/import') return next();
  return jsonParser(req, res, next);
});
app.use(cookieParser());

app.get('/api/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

app.use('/api/auth', authRouter);
app.use('/api/products', productsRouter);
app.use('/api/gift-codes', giftCodesRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/production', productionRouter);
app.use('/api/admin/settings', adminSettingsRouter);
app.use('/api/admin/products', adminProductsRouter);
app.use('/api/admin/uploads', uploadsRouter);
app.use('/api/admin', adminRouter);

// 浏览器支持 WebP 时自动返回同名 800px WebP（数据里的路径不变，老浏览器仍拿原图）
app.use('/img', serveWebpWhenSupported(path.join(PUBLIC_DIR, 'img')));
// 支付截图含付款人信息：禁止静态直读，只能通过订单归属/staff 鉴权接口获取
app.use('/uploads', (req, res, next) => {
  if (req.path.startsWith('/pay-')) {
    return res.status(404).json({ error: '文件不存在' });
  }
  return next();
});
app.use('/uploads', serveWebpWhenSupported(UPLOADS_DIR));
app.use('/uploads', express.static(UPLOADS_DIR));
// 前端是免构建的原生 ESM，更新后必须立即生效：让浏览器每次回源验证，别吃 4 小时缓存
app.use(
  express.static(PUBLIC_DIR, {
    etag: true,
    lastModified: true,
    setHeaders(res, filePath) {
      if (/\.(?:js|css|html)$/i.test(filePath)) {
        res.setHeader('Cache-Control', 'no-cache');
      }
    },
  })
);

app.get('/portal', (req, res, next) => {
  const file = path.join(PUBLIC_DIR, 'portal.html');
  if (fs.existsSync(file)) return res.sendFile(file);
  return next();
});

app.get('/admin', (req, res, next) => {
  const file = path.join(PUBLIC_DIR, 'admin.html');
  if (fs.existsSync(file)) return res.sendFile(file);
  return next();
});

app.use((req, res, next) => {
  if (req.method !== 'GET') return next();
  if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) return next();
  const indexFile = path.join(PUBLIC_DIR, 'index.html');
  if (fs.existsSync(indexFile)) return res.sendFile(indexFile);
  return next();
});

app.use((req, res) => {
  res.status(404).json({ error: '接口不存在' });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = Number(err?.status) || (err?.type === 'entity.parse.failed' ? 400 : 500);
  if (status >= 500) console.error(err);
  const message =
    err?.type === 'entity.parse.failed'
      ? '请求体不是合法的 JSON'
      : err?.type === 'entity.too.large'
        ? '请求体过大'
        : status >= 500
          ? '服务器内部错误，请稍后重试'
          : err?.message || '请求失败';
  res.status(status).json({ error: message });
});

const PORT = Number(process.env.PORT) || 3000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[campus-sales] server running at http://0.0.0.0:${PORT}`);
});

// 每 60 秒释放超时未支付订单（回补库存/赠货码名额），避免库存被长期锁死
setInterval(() => {
  try {
    const released = releaseExpiredOrders(30);
    if (released > 0) console.log(`[orders] 已自动取消 ${released} 笔超时未支付订单`);
  } catch (err) {
    console.error('[orders] 超时订单清理失败：', err.message);
  }
}, 60 * 1000).unref();

// 启动后异步补齐 WebP：新增/替换的图片自动转换，不阻塞服务启动
setTimeout(() => {
  Promise.all([
    optimizeDirectory(path.join(PUBLIC_DIR, 'img')),
    optimizeDirectory(UPLOADS_DIR),
  ])
    .then(([img, uploads]) => {
      console.log(
        `[images] WebP 就绪：public/img 新生成 ${img.created}/${img.total}，uploads 新生成 ${uploads.created}/${uploads.total}`
      );
    })
    .catch((err) => console.warn('[images] WebP 预热失败:', err?.message || err));
}, 1200);
