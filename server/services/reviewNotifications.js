const { runQuery, getAll, getRow, nowIST } = require('../database/db');

let notifications = [];
let nextNotificationId = 1;

const MAX_NOTIFICATIONS = 200;

function addReviewNotification({
  actorId,
  actorName,
  actorRole,
  type,
  title,
  description,
  createdAt
}) {
  if (actorRole !== 'operator') return null;

  const notification = {
    id: String(nextNotificationId++),
    actorId,
    actorName,
    actorRole,
    type,
    title,
    description,
    createdAt: createdAt || new Date().toISOString()
  };

  notifications = [notification, ...notifications].slice(0, MAX_NOTIFICATIONS);

  // Persist to DB (fire-and-forget)
  runQuery(
    `INSERT INTO notifications (actor_id, actor_name, actor_role, type, title, description, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [actorId, actorName, actorRole, type, title, description, notification.createdAt]
  ).catch(err => console.error('Error persisting notification:', err.message));

  return notification;
}

function listReviewNotifications() {
  return [...notifications];
}

function removeReviewNotification(id) {
  const before = notifications.length;
  notifications = notifications.filter((item) => item.id !== String(id));
  return before !== notifications.length;
}

function clearReviewNotifications() {
  notifications = [];
}

async function getNotificationsFromDB({ page = 1, limit = 50, is_read } = {}) {
  let query = 'SELECT * FROM notifications WHERE 1=1';
  const params = [];
  if (is_read !== undefined) {
    query += ' AND is_read = ?';
    params.push(is_read ? 1 : 0);
  }
  query += ' ORDER BY created_at DESC';

  const offset = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);
  const countResult = await getRow(`SELECT COUNT(*) as total FROM (${query})`, params);
  const rows = await getAll(`${query} LIMIT ? OFFSET ?`, [...params, parseInt(limit), offset]);

  return {
    data: rows,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total: countResult?.total || 0,
      totalPages: Math.ceil((countResult?.total || 0) / parseInt(limit))
    }
  };
}

async function markNotificationRead(id) {
  return runQuery('UPDATE notifications SET is_read = 1 WHERE id = ?', [id]);
}

async function markAllNotificationsRead() {
  return runQuery('UPDATE notifications SET is_read = 1 WHERE is_read = 0');
}

module.exports = {
  addReviewNotification,
  listReviewNotifications,
  removeReviewNotification,
  clearReviewNotifications,
  getNotificationsFromDB,
  markNotificationRead,
  markAllNotificationsRead
};
