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

router.put('/', adminOnly, (req, res, next) => {
  try {
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
