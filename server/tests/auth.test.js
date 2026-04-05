const request = require('supertest');
const { createTestDb, initializeTestSchema, seedTestUsers } = require('./setup/testDb');
const { createTestApp, loginUser, TEST_JWT_SECRET } = require('./setup/testHelpers');

let testDb, app, adminAuth, operatorAuth;

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

describe('Authentication', () => {
  describe('POST /api/auth/login', () => {
    test('should login with valid admin credentials', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'admin123' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('token');
      expect(res.body.user).toMatchObject({
        username: 'admin',
        role: 'admin'
      });
    });

    test('should login with valid operator credentials', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'operator', password: 'operator123' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('token');
      expect(res.body.user.role).toBe('operator');
    });

    test('should reject invalid username', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'nonexistent', password: 'password' });

      expect(res.status).toBe(401);
      expect(res.body.message).toBe('Invalid credentials');
    });

    test('should reject wrong password', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'wrongpassword' });

      expect(res.status).toBe(401);
      expect(res.body.message).toBe('Invalid credentials');
    });

    test('should reject empty username', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: '', password: 'admin123' });

      expect(res.status).toBe(400);
      expect(res.body.errors).toBeDefined();
    });

    test('should reject empty password', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin', password: '' });

      expect(res.status).toBe(400);
      expect(res.body.errors).toBeDefined();
    });

    test('should reject disabled account', async () => {
      // Create and disable a user
      const bcrypt = require('bcryptjs');
      const password = bcrypt.hashSync('disabled123', 10);
      await testDb.runQuery(
        `INSERT INTO users (username, password, role, is_active) VALUES (?, ?, 'operator', 0)`,
        ['disableduser', password]
      );

      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'disableduser', password: 'disabled123' });

      expect(res.status).toBe(403);
      expect(res.body.message).toBe('Account disabled');
    });

    test('should create login log entry', async () => {
      await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'admin123' });

      const logs = await testDb.getAll(
        'SELECT * FROM login_logs WHERE username = ? ORDER BY id DESC LIMIT 1',
        ['admin']
      );
      expect(logs.length).toBeGreaterThan(0);
      expect(logs[0].role).toBe('admin');
    });
  });

  describe('POST /api/auth/logout', () => {
    test('should logout successfully', async () => {
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'admin123' });

      const res = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${loginRes.body.token}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Logged out');
    });
  });

  describe('GET /api/auth/me', () => {
    test('should return current user info', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${adminAuth.token}`);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        username: 'admin',
        role: 'admin'
      });
    });

    test('should reject without token', async () => {
      const res = await request(app).get('/api/auth/me');
      expect(res.status).toBe(401);
    });

    test('should reject with invalid token', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalid-token');

      expect(res.status).toBe(403);
    });
  });
});

describe('User Management', () => {
  describe('POST /api/auth/users', () => {
    test('admin should create a new user', async () => {
      const res = await request(app)
        .post('/api/auth/users')
        .set('Authorization', `Bearer ${adminAuth.token}`)
        .send({ username: 'newoperator', password: 'pass123', role: 'operator' });

      expect(res.status).toBe(201);
      expect(res.body.username).toBe('newoperator');
      expect(res.body.role).toBe('operator');
    });

    test('admin should create an admin user', async () => {
      const res = await request(app)
        .post('/api/auth/users')
        .set('Authorization', `Bearer ${adminAuth.token}`)
        .send({ username: 'admin2', password: 'pass123', role: 'admin' });

      expect(res.status).toBe(201);
      expect(res.body.role).toBe('admin');
    });

    test('should reject duplicate username', async () => {
      const res = await request(app)
        .post('/api/auth/users')
        .set('Authorization', `Bearer ${adminAuth.token}`)
        .send({ username: 'admin', password: 'pass123', role: 'operator' });

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Username already exists');
    });

    test('should reject short username', async () => {
      const res = await request(app)
        .post('/api/auth/users')
        .set('Authorization', `Bearer ${adminAuth.token}`)
        .send({ username: 'ab', password: 'pass123', role: 'operator' });

      expect(res.status).toBe(400);
    });

    test('should reject short password', async () => {
      const res = await request(app)
        .post('/api/auth/users')
        .set('Authorization', `Bearer ${adminAuth.token}`)
        .send({ username: 'testuser', password: '123', role: 'operator' });

      expect(res.status).toBe(400);
    });

    test('should reject invalid role', async () => {
      const res = await request(app)
        .post('/api/auth/users')
        .set('Authorization', `Bearer ${adminAuth.token}`)
        .send({ username: 'testuser2', password: 'pass123', role: 'manager' });

      expect(res.status).toBe(400);
    });

    test('operator cannot create users', async () => {
      const res = await request(app)
        .post('/api/auth/users')
        .set('Authorization', `Bearer ${operatorAuth.token}`)
        .send({ username: 'tryuser', password: 'pass123', role: 'operator' });

      expect(res.status).toBe(403);
    });
  });

  describe('GET /api/auth/users', () => {
    test('admin should get all users', async () => {
      const res = await request(app)
        .get('/api/auth/users')
        .set('Authorization', `Bearer ${adminAuth.token}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(2);
    });

    test('operator cannot get users', async () => {
      const res = await request(app)
        .get('/api/auth/users')
        .set('Authorization', `Bearer ${operatorAuth.token}`);

      expect(res.status).toBe(403);
    });
  });

  describe('PUT /api/auth/users/:id/status', () => {
    test('admin should toggle user status', async () => {
      const user = await testDb.getRow("SELECT id FROM users WHERE username = 'newoperator'");

      const res = await request(app)
        .put(`/api/auth/users/${user.id}/status`)
        .set('Authorization', `Bearer ${adminAuth.token}`)
        .send({ is_active: 0 });

      expect(res.status).toBe(200);
      expect(res.body.is_active).toBe(0);
    });

    test('admin cannot change own status', async () => {
      const res = await request(app)
        .put(`/api/auth/users/${adminAuth.user.id}/status`)
        .set('Authorization', `Bearer ${adminAuth.token}`)
        .send({ is_active: 0 });

      expect(res.status).toBe(400);
    });

    test('should return 404 for non-existent user', async () => {
      const res = await request(app)
        .put('/api/auth/users/99999/status')
        .set('Authorization', `Bearer ${adminAuth.token}`)
        .send({ is_active: 0 });

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/auth/users/:id', () => {
    test('admin should delete a user', async () => {
      const bcrypt = require('bcryptjs');
      const pw = bcrypt.hashSync('deleteme', 10);
      const result = await testDb.runQuery(
        `INSERT INTO users (username, password, role) VALUES (?, ?, 'operator')`,
        ['todelete', pw]
      );

      const res = await request(app)
        .delete(`/api/auth/users/${result.id}`)
        .set('Authorization', `Bearer ${adminAuth.token}`);

      expect(res.status).toBe(200);
    });

    test('admin cannot delete self', async () => {
      const res = await request(app)
        .delete(`/api/auth/users/${adminAuth.user.id}`)
        .set('Authorization', `Bearer ${adminAuth.token}`);

      expect(res.status).toBe(400);
    });

    test('should return 404 for non-existent user', async () => {
      const res = await request(app)
        .delete('/api/auth/users/99999')
        .set('Authorization', `Bearer ${adminAuth.token}`);

      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/auth/login-logs', () => {
    test('admin should get login logs', async () => {
      const res = await request(app)
        .get('/api/auth/login-logs')
        .set('Authorization', `Bearer ${adminAuth.token}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    test('operator cannot get login logs', async () => {
      const res = await request(app)
        .get('/api/auth/login-logs')
        .set('Authorization', `Bearer ${operatorAuth.token}`);

      expect(res.status).toBe(403);
    });
  });
});
