import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

/** 统一把站内位图转成 800px 宽的 WebP（原图更宽才缩，不放大） */
export const WEBP_WIDTH = 800;
export const WEBP_QUALITY = 82;
const RASTER_RE = /\.(?:jpe?g|png)$/i;

export function isRasterFile(file) {
  return RASTER_RE.test(String(file || ''));
}

export function webpPathFor(file) {
  return String(file).replace(RASTER_RE, '.webp');
}

/**
 * 确保某个位图有对应的 .webp；源图没变就跳过（幂等，可反复调用）。
 * @returns {{created?:boolean, skipped?:boolean, failed?:boolean, target:string}}
 */
export async function ensureWebp(file, { width = WEBP_WIDTH, quality = WEBP_QUALITY } = {}) {
  const target = webpPathFor(file);
  try {
    const srcStat = fs.statSync(file);
    if (fs.existsSync(target)) {
      const outStat = fs.statSync(target);
      if (outStat.mtimeMs >= srcStat.mtimeMs) return { skipped: true, target };
    }
    await sharp(file).resize({ width, withoutEnlargement: true }).webp({ quality }).toFile(target);
    return { created: true, target };
  } catch (err) {
    console.warn(`[images] WebP 生成失败 ${file}: ${err?.message || err}`);
    return { failed: true, target };
  }
}

/** 递归列出目录下的 jpg/jpeg/png */
export function listRasters(dir, out = []) {
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) listRasters(full, out);
    else if (RASTER_RE.test(entry.name)) out.push(full);
  }
  return out;
}

/** 扫描目录并补齐全量 WebP */
export async function optimizeDirectory(dir) {
  const files = listRasters(dir);
  const stats = { dir, total: files.length, created: 0, skipped: 0, failed: 0 };
  for (const file of files) {
    const result = await ensureWebp(file);
    if (result.created) stats.created += 1;
    else if (result.failed) stats.failed += 1;
    else stats.skipped += 1;
  }
  return stats;
}

/**
 * 内容协商中间件：浏览器支持 WebP 时，请求 .jpg/.png 自动返回同名 .webp。
 * 数据里的图片路径保持原样，老浏览器继续拿原图。
 */
export function serveWebpWhenSupported(rootDir) {
  const root = path.resolve(rootDir);
  return (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    if (!isRasterFile(req.path)) return next();
    const accept = String(req.headers.accept || '');
    if (!accept.includes('image/webp')) return next();
    const target = path.resolve(root, `.${req.path}`);
    const webpFile = webpPathFor(target);
    if (!webpFile.startsWith(root + path.sep) || !fs.existsSync(webpFile)) return next();
    res.setHeader('Content-Type', 'image/webp');
    res.setHeader('Vary', 'Accept');
    // private：让 CF 不缓存这份协商响应（CF 不支持按 Vary 区分缓存），
    // 由浏览器按 Vary: Accept 自己缓存 7 天。
    res.setHeader('Cache-Control', 'private, max-age=604800');
    return res.sendFile(webpFile, (err) => {
      if (err && !res.headersSent) next(err);
    });
  };
}
