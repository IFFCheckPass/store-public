import crypto from 'node:crypto';

function pad(n, width) {
  return String(n).padStart(width, '0');
}

export function generateOrderNo(date = new Date()) {
  const yy = pad(date.getFullYear() % 100, 2);
  const mm = pad(date.getMonth() + 1, 2);
  const dd = pad(date.getDate(), 2);
  const rand = crypto.randomInt(0, 1_000_000);
  return `SO${yy}${mm}${dd}${pad(rand, 6)}`;
}

export function generateGiftCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let out = '';
  for (let i = 0; i < 6; i += 1) {
    out += chars[crypto.randomInt(0, chars.length)];
  }
  return `GIFT-${out}`;
}

export function nowSql() {
  const d = new Date();
  const pad2 = (v) => pad(v, 2);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}
