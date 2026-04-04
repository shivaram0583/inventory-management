const request = require('supertest');
const { createTestDb, initializeTestSchema, seedTestUsers } = require('./setup/testDb');
const { createTestApp, loginUser } = require('./setup/testHelpers');

let testDb, app, adminAuth, operatorAuth;

// Need to mock the notifications service since it's in-memory and shared across imports
const reviewNotifications = require('../services/reviewNotifications');

beforeAll(async () => {
  testDb = createTestDb();
  await initializeTestSchema(testDb);
  await seedTestUsers(testDb);
  app = createTestApp(testDb);
  adminAuth = await loginUser(testDb, 'admin', 'admin123');
  operatorAuth = await loginUser(testDb, 'operator', 'operator123');
});

afterAll(async () => {
  await testDb.close();
});

beforeEach(() => {
  reviewNotifications.clearReviewNotifications();
});

describe('Notifications', () => {
  describe('GET /api/notifications', () => {
    test('admin should get empty notifications initially', async () => {
      const res = await request(app)
        .get('/api/notifications')
        .set('Authorization', `Bearer ${adminAuth.token}`);

      expect(res.status).toBe(200);
      expect(res.body.count).toBe(0);
      expect(res.body.notifications).toHaveLength(0);
    });

    test('operator cannot access notifications', async () => {
      const res = await request(app)
        .get('/api/notifications')
        .set('Authorization', `Bearer ${operatorAuth.token}`);

      expect(res.status).toBe(403);
    });

    test('admin should see operator-generated notifications', async () => {
      // Manually add a notification (simulating operator action)
      reviewNotifications.addReviewNotification({
        actorId: operatorAuth.user.id,
        actorName: 'operator',
        actorRole: 'operator',
        type: 'sale',
        title: 'Completed a sale',
        description: 'Test sale notification',
        createdAt: new Date().toISOString()
      });

      const res = await request(app)
        .get('/api/notifications')
        .set('Authorization', `Bearer ${adminAuth.token}`);

      expect(res.status).toBe(200);
      expect(res.body.count).toBe(1);
      expect(res.body.notifications[0].type).toBe('sale');
    });

    test('admin actions should NOT generate notifications', async () => {
      reviewNotifications.addReviewNotification({
        actorId: adminAuth.user.id,
        actorName: 'admin',
        actorRole: 'admin',
        type: 'inventory',
        title: 'Admin action',
        description: 'This should not be added'
      });

      const res = await request(app)
        .get('/api/notifications')
        .set('Authorization', `Bearer ${adminAuth.token}`);

      // Admin notifications should not be added
      const adminNotifs = res.body.notifications.filter(n => n.actorRole === 'admin');
      expect(adminNotifs).toHaveLength(0);
    });
  });

  describe('DELETE /api/notifications/:id', () => {
    test('admin should delete a single notification', async () => {
      reviewNotifications.addReviewNotification({
        actorId: operatorAuth.user.id,
        actorName: 'operator',
        actorRole: 'operator',
        type: 'purchase',
        title: 'Test purchase',
        description: 'To be deleted'
      });

      const listRes = await request(app)
        .get('/api/notifications')
        .set('Authorization', `Bearer ${adminAuth.token}`);

      const notifId = listRes.body.notifications[0].id;

      const res = await request(app)
        .delete(`/api/notifications/${notifId}`)
        .set('Authorization', `Bearer ${adminAuth.token}`);

      expect(res.status).toBe(200);
    });

    test('should return 404 for non-existent notification', async () => {
      const res = await request(app)
        .delete('/api/notifications/99999')
        .set('Authorization', `Bearer ${adminAuth.token}`);

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/notifications', () => {
    test('admin should clear all notifications', async () => {
      // Add some notifications
      reviewNotifications.addReviewNotification({
        actorId: operatorAuth.user.id,
        actorName: 'operator',
        actorRole: 'operator',
        type: 'sale',
        title: 'Sale 1',
        description: 'desc'
      });
      reviewNotifications.addReviewNotification({
        actorId: operatorAuth.user.id,
        actorName: 'operator',
        actorRole: 'operator',
        type: 'sale',
        title: 'Sale 2',
        description: 'desc'
      });

      const res = await request(app)
        .delete('/api/notifications')
        .set('Authorization', `Bearer ${adminAuth.token}`);

      expect(res.status).toBe(200);

      const checkRes = await request(app)
        .get('/api/notifications')
        .set('Authorization', `Bearer ${adminAuth.token}`);

      expect(checkRes.body.count).toBe(0);
    });
  });
});
