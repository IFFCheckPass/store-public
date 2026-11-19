import crypto from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';

const DEV_SECRET = 'campus-sales-dev-secret-please-change-in-production';
const secret = new TextEncoder().encode(process.env.JWT_SECRET || DEV_SECRET);
const TOKEN_TTL = '12h';
const COOKIE_MAX_AGE = 12 * 60 * 60 * 1000;

export const STAFF_COOKIE = 'staff_session';
export const USER_COOKIE = 'user_session';

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(String(password), salt, 64);
  return `${salt}:${derived.toString('hex')}`;
}

export function verifyPassword(password, stored) {
  if (typeof stored !== 'string' || !stored.includes(':')) return false;
  const [salt, hex] = stored.split(':');
  if (!salt || !hex) return false;
  const expected = Buffer.from(hex, 'hex');
  if (expected.length === 0) return false;
  const derived = crypto.scryptSync(String(password), salt, expected.length);
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

export async function signToken(payload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(TOKEN_TTL)
    .sign(secret);
}

export async function verifyToken(token) {
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload;
  } catch {
    return null;
  }
}

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: COOKIE_MAX_AGE,
    secure: false,
  };
}

export function setSessionCookie(res, name, token) {
  res.cookie(name, token, cookieOptions());
}

export function clearSessionCookie(res, name) {
  res.clearCookie(name, { httpOnly: true, sameSite: 'lax', path: '/', secure: false });
}

export function requireStaff(roles = []) {
  return async (req, res, next) => {
    try {
      const token = req.cookies?.[STAFF_COOKIE];
      const payload = token ? await verifyToken(token) : null;
      if (!payload || payload.type !== 'staff') {
        return res.status(401).json({ error: '请先登录' });
      }
      const { db } = await import('./db.js');
      const staff = db.prepare('SELECT * FROM staff WHERE id = ?').get(Number(payload.sub));
      if (!staff || staff.status !== 'active') {
        clearSessionCookie(res, STAFF_COOKIE);
        return res.status(401).json({ error: '账号不存在或已停用，请重新登录' });
      }
      if (Array.isArray(roles) && roles.length > 0 && !roles.includes(staff.role)) {
        return res.status(403).json({ error: '无权限执行该操作' });
      }
      req.staff = {
        sub: staff.id,
        type: 'staff',
        role: staff.role,
        name: staff.display_name,
      };
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

export async function requireUser(req, res, next) {
  try {
    const token = req.cookies?.[USER_COOKIE];
    const payload = token ? await verifyToken(token) : null;
    if (!payload || payload.type !== 'user') {
      return res.status(401).json({ error: '请先登录' });
    }
    const { db } = await import('./db.js');
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(payload.sub));
    if (!user) {
      clearSessionCookie(res, USER_COOKIE);
      return res.status(401).json({ error: '请先登录' });
    }
    req.user = { sub: user.id, type: 'user', role: 'user', name: user.name };
    return next();
  } catch (err) {
    return next(err);
  }
}

export async function optionalUser(req, res, next) {
  try {
    const token = req.cookies?.[USER_COOKIE];
    const payload = token ? await verifyToken(token) : null;
    if (!payload || payload.type !== 'user') {
      req.user = null;
      return next();
    }
    const { db } = await import('./db.js');
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(payload.sub));
    req.user = user ? { sub: user.id, type: 'user', role: 'user', name: user.name } : null;
    return next();
  } catch {
    req.user = null;
    return next();
  }
}

export function staffView(row) {
  return {
    id: row.id,
    username: row.username,
    studentId: row.student_id,
    displayName: row.display_name,
    role: row.role,
  };
}

export function userView(row) {
  return {
    id: row.id,
    name: row.name,
    className: row.class_name,
    seatNo: row.seat_no,
    studentId: row.student_id,
  };
}
