const request = require('supertest');
const { createTestDb, initializeTestSchema, seedTestUsers } = require('./setup/testDb');
const { createTestApp, loginUser, createTestProduct, createTestBankAccount, completeDailySetup } = require('./setup/testHelpers');

let testDb, app, adminAuth, operatorAuth;

beforeAll(async () => {
  testDb = createTestDb();
  await initializeTestSchema(testDb);
  await seedTestUsers(testDb);
  app = createTestApp(testDb);
  adminAuth = await loginUser(testDb, 'admin', 'admin123');
  operatorAuth = await loginUser(testDb, 'operator', 'operator123');

  // Setup test data
  const bankAccount = await createTestBankAccount(testDb, { balance: 50000 });
  await completeDailySetup(testDb, bankAccount.id, adminAuth.user.id);

  // Create products and sales for dashboard data
  const product = await createTestProduct(testDb, {
    product_id: 'DASH_SEED001',
    product_name: 'Dashboard Product',
    quantity_available: 5,  // low stock
    selling_price: 100
  });

  // Create a sale
  const moment = require('moment');
  const today = moment().utcOffset('+05:30').format('YYYY-MM-DD HH:mm:ss');

  await testDb.runQuery(
    `INSERT INTO sales (sale_id, product_id, quantity_sold, price_per_unit, total_amount, sale_date, operator_id)
     VALUES ('DASHSALE001', ?, 2, 100, 200, ?, ?)`,
    [product.id, today, operatorAuth.user.id]
  );

  // Create an ordered purchase
  await testDb.runQuery(
    `INSERT INTO purchases (purchase_id, product_id, quantity, price_per_unit, total_amount, supplier, purchase_status, purchase_date)
     VALUES ('DASHPUR001', ?, 50, 80, 4000, 'Dashboard Supplier', 'ordered', ?)`,
    [product.id, today]
  );
});

afterAll(async () => {
  await testDb.close();
});

describe('Dashboard', () => {
  describe('GET /api/dashboard/admin', () => {
    test('admin should get admin dashboard', async () => {
      const res = await request(app)
        .get('/api/dashboard/admin')
        .set('Authorization', `Bearer ${adminAuth.token}`);

      expect(res.status).toBe(200);
      expect(res.body.summary).toBeDefined();
      expect(res.body.summary.total_stock).toBeDefined();
      expect(res.body.summary.today_sales).toBeDefined();
      expect(res.body.alerts).toBeDefined();
      expect(res.body.alerts.low_stock_items).toBeDefined();
      expect(res.body.recent_activity).toBeDefined();
      expect(res.body.ordered_items).toBeDefined();
      expect(res.body.analytics).toBeDefined();
    });

    test('admin should see low stock alerts', async () => {
      const res = await request(app)
        .get('/api/dashboard/admin')
        .set('Authorization', `Bearer ${adminAuth.token}`);

      expect(res.body.alerts.low_stock_items.length).toBeGreaterThan(0);
      expect(res.body.alerts.low_stock_items[0].quantity_available).toBeLessThanOrEqual(10);
    });

    test('admin should see pending orders', async () => {
      const res = await request(app)
        .get('/api/dashboard/admin')
        .set('Authorization', `Bearer ${adminAuth.token}`);

      expect(res.body.ordered_items.length).toBeGreaterThan(0);
    });

    test('operator cannot access admin dashboard', async () => {
      const res = await request(app)
        .get('/api/dashboard/admin')
        .set('Authorization', `Bearer ${operatorAuth.token}`);

      expect(res.status).toBe(403);
    });
  });

  describe('GET /api/dashboard/operator', () => {
    test('operator should get operator dashboard', async () => {
      const res = await request(app)
        .get('/api/dashboard/operator')
        .set('Authorization', `Bearer ${operatorAuth.token}`);

      expect(res.status).toBe(200);
      expect(res.body.inventory).toBeDefined();
      expect(res.body.today_summary).toBeDefined();
      expect(res.body.recent_sales).toBeDefined();
      expect(res.body.ordered_items).toBeDefined();
      expect(res.body.popular_items).toBeDefined();
    });

    test('admin should also access operator dashboard', async () => {
      const res = await request(app)
        .get('/api/dashboard/operator')
        .set('Authorization', `Bearer ${adminAuth.token}`);

      expect(res.status).toBe(200);
    });
  });

  describe('GET /api/dashboard/quick-stats', () => {
    test('should return quick stats', async () => {
      const res = await request(app)
        .get('/api/dashboard/quick-stats')
        .set('Authorization', `Bearer ${adminAuth.token}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('total_products');
      expect(res.body).toHaveProperty('total_stock');
      expect(res.body).toHaveProperty('today_transactions');
      expect(res.body).toHaveProperty('today_revenue');
      expect(res.body).toHaveProperty('month_transactions');
      expect(res.body).toHaveProperty('month_revenue');
    });

    test('should require authentication', async () => {
      const res = await request(app).get('/api/dashboard/quick-stats');
      expect(res.status).toBe(401);
    });
  });
});
