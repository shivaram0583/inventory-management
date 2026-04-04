const request = require('supertest');
const { createTestDb, initializeTestSchema, seedTestUsers } = require('./setup/testDb');
const { createTestApp, loginUser, createTestBankAccount, completeDailySetup } = require('./setup/testHelpers');

let testDb, app, adminAuth, operatorAuth, bankAccount;

beforeAll(async () => {
  testDb = createTestDb();
  await initializeTestSchema(testDb);
  await seedTestUsers(testDb);
  app = createTestApp(testDb);
  adminAuth = await loginUser(testDb, 'admin', 'admin123');
  operatorAuth = await loginUser(testDb, 'operator', 'operator123');
  bankAccount = await createTestBankAccount(testDb, { balance: 50000 });
});

afterAll(async () => {
  await testDb.close();
});

describe('Daily Setup Workflow', () => {
  describe('GET /api/transactions/daily-setup/status', () => {
    test('should return daily setup status', async () => {
      const res = await request(app)
        .get('/api/transactions/daily-setup/status')
        .set('Authorization', `Bearer ${adminAuth.token}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('hasBankAccounts');
      expect(res.body).toHaveProperty('businessDate');
    });

    test('should indicate bank accounts exist', async () => {
      const res = await request(app)
        .get('/api/transactions/daily-setup/status')
        .set('Authorization', `Bearer ${adminAuth.token}`);

      expect(res.body.hasBankAccounts).toBe(true);
    });
  });

  describe('POST /api/transactions/daily-setup/select-bank', () => {
    test('admin should select bank for today', async () => {
      const res = await request(app)
        .post('/api/transactions/daily-setup/select-bank')
        .set('Authorization', `Bearer ${adminAuth.token}`)
        .send({ bank_account_id: bankAccount.id });

      expect(res.status).toBe(200);
      expect(res.body.dailySetupStatus).toBeDefined();
      expect(res.body.dailySetupStatus.bankSelectionCompleted).toBe(true);
    });

    test('operator cannot select bank', async () => {
      const res = await request(app)
        .post('/api/transactions/daily-setup/select-bank')
        .set('Authorization', `Bearer ${operatorAuth.token}`)
        .send({ bank_account_id: bankAccount.id });

      expect(res.status).toBe(403);
    });

    test('should reject non-existent bank account', async () => {
      const res = await request(app)
        .post('/api/transactions/daily-setup/select-bank')
        .set('Authorization', `Bearer ${adminAuth.token}`)
        .send({ bank_account_id: 99999 });

      expect(res.status).toBe(404);
    });

    test('should reject without bank_account_id', async () => {
      const res = await request(app)
        .post('/api/transactions/daily-setup/select-bank')
        .set('Authorization', `Bearer ${adminAuth.token}`)
        .send({});

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/transactions/daily-setup/review-balance', () => {
    test('admin should review daily balance', async () => {
      const res = await request(app)
        .post('/api/transactions/daily-setup/review-balance')
        .set('Authorization', `Bearer ${adminAuth.token}`);

      expect(res.status).toBe(200);
      expect(res.body.dailySetupStatus).toBeDefined();
    });

    test('operator cannot review balance', async () => {
      const res = await request(app)
        .post('/api/transactions/daily-setup/review-balance')
        .set('Authorization', `Bearer ${operatorAuth.token}`);

      expect(res.status).toBe(403);
    });
  });

  describe('Daily Setup Gate (Operator Blocking)', () => {
    test('setup status should show isReady after complete setup', async () => {
      const res = await request(app)
        .get('/api/transactions/daily-setup/status')
        .set('Authorization', `Bearer ${adminAuth.token}`);

      expect(res.status).toBe(200);
      expect(res.body.isReady).toBe(true);
    });

    test('admin is never blocked by daily setup', async () => {
      // Create a product to test admin can always act
      const product = await testDb.runQuery(
        `INSERT INTO products (product_id, category, product_name, unit, quantity_available, purchase_price, selling_price)
         VALUES ('GATE001', 'seeds', 'Gate Test', 'kg', 100, 50, 80)`
      );

      const res = await request(app)
        .post('/api/sales')
        .set('Authorization', `Bearer ${adminAuth.token}`)
        .send({
          items: [{ product_id: product.id, quantity: 1 }],
          customer_name: 'Admin Gate Test',
          payment_mode: 'cash'
        });

      // Admin should not be blocked regardless of daily setup status
      expect([201, 200]).toContain(res.status);
    });
  });
});
