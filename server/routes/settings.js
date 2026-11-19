import express from 'express';
import { getSettings } from '../lib/settings.js';

const router = express.Router();

router.get('/', (req, res) => {
  res.json({ settings: getSettings() });
});

export default router;
