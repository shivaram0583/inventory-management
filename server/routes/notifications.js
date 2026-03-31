const express = require('express');
const { authenticateToken, authorizeRole } = require('../middleware/auth');
const {
  listReviewNotifications,
  removeReviewNotification,
  clearReviewNotifications
} = require('../services/reviewNotifications');

const router = express.Router();

router.get('/', [authenticateToken, authorizeRole(['admin'])], async (req, res) => {
  const notifications = listReviewNotifications();
  res.json({
    count: notifications.length,
    notifications
  });
});

router.delete('/', [authenticateToken, authorizeRole(['admin'])], async (req, res) => {
  clearReviewNotifications();
  res.json({ message: 'Notifications cleared' });
});

router.delete('/:id', [authenticateToken, authorizeRole(['admin'])], async (req, res) => {
  const removed = removeReviewNotification(req.params.id);

  if (!removed) {
    return res.status(404).json({ message: 'Notification not found' });
  }

  res.json({ message: 'Notification removed' });
});

module.exports = router;
