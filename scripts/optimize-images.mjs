#!/usr/bin/env node
/**
 * 把站内商品图/上传图批量转成 800px WebP。
 * 用法：npm run optimize-images
 * 已有的 .webp 比源图新时自动跳过（可反复执行）。
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { optimizeDirectory } from '../server/lib/images.js';
import { UPLOADS_DIR } from '../server/lib/uploads.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dirs = [path.join(ROOT, 'public', 'img'), UPLOADS_DIR];

let total = 0;
for (const dir of dirs) {
  const stats = await optimizeDirectory(dir);
  total += stats.created;
  console.log(
    `${stats.dir}: 扫描 ${stats.total} 张，新生成 ${stats.created}，跳过 ${stats.skipped}，失败 ${stats.failed}`
  );
}
console.log(`完成，共生成 ${total} 个 WebP。`);
