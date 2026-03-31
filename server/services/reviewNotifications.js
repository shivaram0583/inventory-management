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

module.exports = {
  addReviewNotification,
  listReviewNotifications,
  removeReviewNotification,
  clearReviewNotifications
};
