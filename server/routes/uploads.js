import express from 'express';
import { requireStaff } from '../auth.js';
import { audit } from '../lib/audit.js';
import { saveImageDataUrl } from '../lib/uploads.js';

const router = express.Router();
const adminOnly = requireStaff(['super_admin', 'admin']);

router.post('/image', adminOnly, (req, res, next) => {
  try {
    const saved = saveImageDataUrl(req.body?.imageDataUrl, req.body?.kind || 'asset');
    audit(
      'staff',
      Number(req.staff.sub),
      req.staff.name || '',
      'upload.create',
      `上传图片 ${saved.filename}`
    );
    return res.json({ url: saved.url });
  } catch (err) {
    return next(err);
  }
});

export default router;
