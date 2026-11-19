import { db } from '../db.js';

export function audit(actorType, actorId, actorName, action, detail = '') {
  db.prepare(
    "INSERT INTO audit_logs (actor_type, actor_id, actor_name, action, detail, created_at) VALUES (?, ?, ?, ?, ?, datetime('now','localtime'))"
  ).run(actorType, actorId ?? null, actorName || '', action, typeof detail === 'string' ? detail : JSON.stringify(detail));
}
