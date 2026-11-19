import { db } from '../db.js';
import { DEFAULT_SETTINGS, SETTINGS_KEY } from './settings-defaults.js';

export { DEFAULT_SETTINGS };

export function getSettings() {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(SETTINGS_KEY);
  if (!row || !row.value) return { ...DEFAULT_SETTINGS };
  try {
    const stored = JSON.parse(row.value);
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) {
      return { ...DEFAULT_SETTINGS };
    }
    return { ...DEFAULT_SETTINGS, ...stored };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(patch) {
  const merged = { ...getSettings(), ...patch };
  db.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now','localtime'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).run(SETTINGS_KEY, JSON.stringify(merged));
  return merged;
}
