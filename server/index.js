import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cookieParser from 'cookie-parser';
import './db.js';
import authRouter from './routes/auth.js';
import productsRouter from './routes/products.js';
import ordersRouter from './routes/orders.js';
import productionRouter from './routes/production.js';
import adminRouter from './routes/admin.js';
import giftCodesRouter from './routes/giftcodes.js';
import settingsRouter from './routes/settings.js';
import adminSettingsRouter from './routes/admin-settings.js';
import adminProductsRouter from './routes/admin-products.js';
import uploadsRouter from './routes/uploads.js';

const ROOT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const UPLOADS_DIR =
  process.env.UPLOAD_DIR || path.join(os.tmpdir(), 'campus-sales-platform-v2', 'uploads');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const app = express();
// 备份文件包含图片的 base64 内容，单独放宽该接口的请求体限制
app.use('/api/admin/backup/import', express.json({ limit: '200mb' }));
app.use(express.json({ limit: '10mb' }));
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

app.use('/uploads', express.static(UPLOADS_DIR));
app.use(express.static(PUBLIC_DIR));

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
        : err?.message || '服务器内部错误';
  res.status(status).json({ error: message });
});

const PORT = Number(process.env.PORT) || 3000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[campus-sales] server running at http://0.0.0.0:${PORT}`);
});
