import { db } from '../db.js';

export function addOrderEvent(orderId, status, note = '') {
  db.prepare(
    "INSERT INTO order_events (order_id, status, note, created_at) VALUES (?, ?, ?, datetime('now','localtime'))"
  ).run(orderId, status, note || '');
}

export function addTaskEvent(taskId, status, note = '', actorId = null, actorName = '') {
  db.prepare(
    "INSERT INTO task_events (task_id, status, note, actor_id, actor_name, created_at) VALUES (?, ?, ?, ?, ?, datetime('now','localtime'))"
  ).run(taskId, status, note || '', actorId ?? null, actorName || '');
}
