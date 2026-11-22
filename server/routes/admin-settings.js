import express from 'express';
import { requireStaff } from '../auth.js';
import { audit } from '../lib/audit.js';
import { getSettings, saveSettings } from '../lib/settings.js';
import { normalizeSettingsPatch } from '../lib/settings-validate.js';

const router = express.Router();
const adminOnly = requireStaff(['super_admin', 'admin']);

router.get('/', adminOnly, (req, res) => {
  res.json({ settings: getSettings() });
});

// 收款码与支付文案属于资金链路配置，只有超级管理员能改（普通管理员可读不可改）
const FUNDS_KEYS = ['qrWechatUrl', 'qrAlipayUrl', 'paymentTitle', 'paymentSubtitle', 'paymentNote', 'paymentTip', 'paymentTutorial'];

router.put('/', adminOnly, (req, res, next) => {
  try {
    if (req.staff.role !== 'super_admin') {
      const raw = req.body?.settings !== undefined ? req.body.settings : req.body;
      const attempted = raw && typeof raw === 'object' ? Object.keys(raw) : [];
      const hit = attempted.filter((key) => FUNDS_KEYS.includes(key));
      if (hit.length) {
        return res.status(403).json({ error: `收款码/支付信息只能由超级管理员修改（${hit.join('、')}）` });
      }
    }
    const source = req.body?.settings !== undefined ? req.body.settings : req.body;
    const patch = normalizeSettingsPatch(source);
    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ error: '没有需要保存的设置项' });
    }
    const settings = saveSettings(patch);
    audit(
      'staff',
      Number(req.staff.sub),
      req.staff.name || '',
      'settings.update',
      `更新站点设置：${Object.keys(patch).join('、')}`
    );
    return res.json({ settings });
  } catch (err) {
    return next(err);
  }
});

export default router;
