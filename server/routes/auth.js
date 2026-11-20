import express from 'express';
import { db } from '../db.js';
import {
  STAFF_COOKIE,
  USER_COOKIE,
  clearSessionCookie,
  hashPassword,
  requireStaff,
  requireUser,
  setSessionCookie,
  signToken,
  staffView,
  userView,
  verifyPassword,
} from '../auth.js';
import { audit } from '../lib/audit.js';
import {
  PLACEHOLDER_STUDENT_ID,
  assertPassword,
  assertStudentId,
  isNonEmpty,
  str,
} from '../lib/validate.js';

const router = express.Router();

router.post('/staff/login', async (req, res, next) => {
  try {
    const username = str(req.body?.username);
    const studentId = str(req.body?.studentId);
    const password = typeof req.body?.password === 'string' ? req.body.password : '';

    const staff = username
      ? db.prepare('SELECT * FROM staff WHERE username = ?').get(username)
      : undefined;

    if (!staff || staff.student_id !== studentId || !verifyPassword(password, staff.password_hash)) {
      return res.status(401).json({ error: '用户名、学号或密码不正确' });
    }
    if (staff.status === 'disabled') {
      return res.status(403).json({ error: '账号已停用' });
    }

    const token = await signToken({
      sub: staff.id,
      type: 'staff',
      role: staff.role,
      name: staff.display_name,
    });
    setSessionCookie(res, STAFF_COOKIE, token);
    audit('staff', staff.id, staff.display_name, 'staff.login', `账号 ${staff.username} 登录成功`);
    return res.json({ staff: staffView(staff) });
  } catch (err) {
    return next(err);
  }
});

router.get('/staff/me', requireStaff(), (req, res) => {
  const staff = db.prepare('SELECT * FROM staff WHERE id = ?').get(Number(req.staff.sub));
  if (!staff || staff.status === 'disabled') {
    clearSessionCookie(res, STAFF_COOKIE);
    return res.status(401).json({ error: '请先登录' });
  }
  return res.json({ staff: staffView(staff) });
});

router.post('/staff/logout', (req, res) => {
  clearSessionCookie(res, STAFF_COOKIE);
  return res.json({ ok: true });
});

function currentStaff(req) {
  return db.prepare('SELECT * FROM staff WHERE id = ?').get(Number(req.staff.sub));
}

router.patch('/staff/profile', requireStaff(), (req, res, next) => {
  try {
    const staff = currentStaff(req);
    if (!staff || staff.status === 'disabled') {
      clearSessionCookie(res, STAFF_COOKIE);
      return res.status(401).json({ error: '请先登录' });
    }
    const currentPassword =
      typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : '';
    if (!verifyPassword(currentPassword, staff.password_hash)) {
      return res.status(400).json({ error: '当前密码不正确' });
    }
    const studentId = assertStudentId(req.body?.studentId);
    if (studentId === PLACEHOLDER_STUDENT_ID) {
      return res
        .status(400)
        .json({ error: '请填写真实学号，00000000 是未预置学号的占位值' });
    }
    db.prepare(
      "UPDATE staff SET student_id = ?, updated_at = datetime('now','localtime') WHERE id = ?"
    ).run(studentId, staff.id);
    const updated = currentStaff(req);
    audit('staff', staff.id, staff.display_name, 'staff.self_update', `自行修改学号为 ${studentId}`);
    return res.json({ staff: staffView(updated) });
  } catch (err) {
    return next(err);
  }
});

router.post('/staff/change-password', requireStaff(), (req, res, next) => {
  try {
    const staff = currentStaff(req);
    if (!staff || staff.status === 'disabled') {
      clearSessionCookie(res, STAFF_COOKIE);
      return res.status(401).json({ error: '请先登录' });
    }
    const currentPassword =
      typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : '';
    if (!verifyPassword(currentPassword, staff.password_hash)) {
      return res.status(400).json({ error: '当前密码不正确' });
    }
    const newPassword = assertPassword(req.body?.newPassword);
    if (newPassword === currentPassword) {
      return res.status(400).json({ error: '新密码不能与当前密码相同' });
    }
    db.prepare(
      "UPDATE staff SET password_hash = ?, updated_at = datetime('now','localtime') WHERE id = ?"
    ).run(hashPassword(newPassword), staff.id);
    audit('staff', staff.id, staff.display_name, 'staff.change_password', '自行修改登录密码');
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
});

router.post('/user/login', (req, res, next) => {
  try {
    const name = str(req.body?.name);
    const className = str(req.body?.className);
    const seatNo = str(req.body?.seatNo);
    if (!name) return res.status(400).json({ error: '请填写姓名' });
    if (!className) return res.status(400).json({ error: '请填写班级' });
    if (!seatNo) return res.status(400).json({ error: '请填写座号' });

    const hasStudentId = req.body?.studentId !== undefined && str(req.body?.studentId) !== '';
    const studentId = hasStudentId ? assertStudentId(req.body.studentId) : '';

    let user = db
      .prepare('SELECT * FROM users WHERE name = ? AND class_name = ? AND seat_no = ?')
      .get(name, className, seatNo);

    if (!user) {
      const info = db
        .prepare(
          "INSERT INTO users (name, class_name, seat_no, student_id, created_at) VALUES (?, ?, ?, ?, datetime('now','localtime'))"
        )
        .run(name, className, seatNo, studentId || null);
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(info.lastInsertRowid));
    } else if (hasStudentId && user.student_id !== studentId) {
      db.prepare('UPDATE users SET student_id = ? WHERE id = ?').run(studentId, user.id);
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
    }

    return signToken({ sub: user.id, type: 'user', role: 'user', name: user.name }).then((token) => {
      setSessionCookie(res, USER_COOKIE, token);
      audit('user', user.id, user.name, 'user.login', `${user.class_name} ${user.seat_no} 号登录`);
      return res.json({ user: userView(user) });
    });
  } catch (err) {
    return next(err);
  }
});

router.get('/user/me', requireUser, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(req.user.sub));
  if (!user) {
    clearSessionCookie(res, USER_COOKIE);
    return res.status(401).json({ error: '请先登录' });
  }
  return res.json({ user: userView(user) });
});

router.post('/user/logout', (req, res) => {
  clearSessionCookie(res, USER_COOKIE);
  return res.json({ ok: true });
});

export default router;
