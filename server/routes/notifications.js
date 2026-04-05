const express = require('express');
const { authenticateToken, authorizeRole } = require('../middleware/auth');
const { runQuery } = require('../database/db');
const {
  getNotificationsFromDB,
  listReviewNotifications,
  removeReviewNotification,
  clearReviewNotifications,
  markNotificationRead,
  markAllNotificationsRead
} = require('../services/reviewNotifications');

const router = express.Router();

router.get('/', [authenticateToken, authorizeRole(['admin'])], async (req, res) => {
  const { page = 1, limit = 50, is_read } = req.query;
  const persisted = await getNotificationsFromDB({
    page,
    limit,
    is_read: is_read === undefined ? undefined : String(is_read) === 'true'
  });
  const volatileNotifications = listReviewNotifications();

  res.json({
    ...persisted,
    volatileCount: volatileNotifications.length,
    volatileNotifications
  });
});

router.delete('/', [authenticateToken, authorizeRole(['admin'])], async (req, res) => {
  clearReviewNotifications();
  await runQuery('DELETE FROM notifications');
  res.json({ message: 'Notifications cleared' });
});

router.put('/:id/read', [authenticateToken, authorizeRole(['admin'])], async (req, res) => {
  await markNotificationRead(req.params.id);
  res.json({ message: 'Notification marked as read' });
});

router.put('/read-all', [authenticateToken, authorizeRole(['admin'])], async (req, res) => {
  await markAllNotificationsRead();
  res.json({ message: 'All notifications marked as read' });
});

router.delete('/:id', [authenticateToken, authorizeRole(['admin'])], async (req, res) => {
  const removed = removeReviewNotification(req.params.id);

  const deleted = await runQuery('DELETE FROM notifications WHERE id = ?', [req.params.id]);

  if (!removed && !deleted.changes) {
    return res.status(404).json({ message: 'Notification not found' });
  }

  res.json({ message: 'Notification removed' });
});

module.exports = router;
