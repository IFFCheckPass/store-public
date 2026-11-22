import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ApiError } from './validate.js';

export const UPLOADS_DIR =
  process.env.UPLOAD_DIR || path.join(os.tmpdir(), 'campus-sales-platform-v2', 'uploads');

const MAX_BYTES = 6 * 1024 * 1024;

/** 按文件头（魔数）校验真实图片类型，防止把 HTML/脚本伪装成 .png 存进可访问目录 */
function detectImageType(buffer) {
  if (!buffer || buffer.length < 12) return null;
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return 'png';
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg';
  if (
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'webp';
  }
  return null;
}

export function saveImageDataUrl(dataUrl, prefix = 'asset') {
  const text = typeof dataUrl === 'string' ? dataUrl : '';
  const match = text.match(/^data:image\/(png|jpe?g|webp);base64,([A-Za-z0-9+/=\s]+)$/i);
  if (!match) throw new ApiError(400, '请上传 png/jpg/webp 格式的图片');

  const extRaw = match[1].toLowerCase();
  const ext = extRaw === 'jpeg' ? 'jpg' : extRaw;
  const buffer = Buffer.from(match[2].replace(/\s+/g, ''), 'base64');
  if (buffer.length === 0) throw new ApiError(400, '图片内容为空');
  if (buffer.length > MAX_BYTES) throw new ApiError(400, '图片不能超过 6MB');
  const detected = detectImageType(buffer);
  if (!detected) throw new ApiError(400, '文件内容不是有效的 PNG/JPG/WebP 图片');
  if (detected !== ext && !(detected === 'jpg' && extRaw === 'jpeg')) {
    throw new ApiError(400, '文件内容与声明的图片格式不一致');
  }

  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  const safePrefix = String(prefix || 'asset').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24) || 'asset';
  const filename = `${safePrefix}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}.${ext}`;
  fs.writeFileSync(path.join(UPLOADS_DIR, filename), buffer);

  return { url: `/uploads/${filename}`, filename, size: buffer.length };
}
