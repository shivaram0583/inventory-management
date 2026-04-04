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

  const bankAccount = await createTestBankAccount(testDb, { balance: 50000 });
  await completeDailySetup(testDb, bankAccount.id, adminAuth.user.id);

  // Create test data for reports
  const product1 = await createTestProduct(testDb, {
    product_id: 'RPT_SEED001',
    product_name: 'Report Seeds',
    quantity_available: 100,
    selling_price: 150,
    category: 'seeds'
  });
  const product2 = await createTestProduct(testDb, {
    product_id: 'RPT_FERT001',
    product_name: 'Report Fertilizer',
    quantity_available: 50,
    selling_price: 300,
    category: 'fertilizers'
  });

  // Create sales
  const moment = require('moment');
  const today = moment().utcOffset('+05:30').format('YYYY-MM-DD HH:mm:ss');

  await testDb.runQuery(
    `INSERT INTO sales (sale_id, product_id, quantity_sold, price_per_unit, total_amount, sale_date, operator_id)
     VALUES ('RPTSALE001', ?, 10, 150, 1500, ?, ?)`,
    [product1.id, today, operatorAuth.user.id]
  );
  await testDb.runQuery(
    `INSERT INTO sales (sale_id, product_id, quantity_sold, price_per_unit, total_amount, sale_date, operator_id)
     VALUES ('RPTSALE002', ?, 5, 300, 1500, ?, ?)`,
    [product2.id, today, operatorAuth.user.id]
  );
  await testDb.runQuery(
    `INSERT INTO receipts (receipt_number, sale_id, customer_name, payment_mode, total_amount, receipt_date)
     VALUES ('R-RPT-001', 'RPTSALE001', 'Report Customer', 'cash', 1500, ?)`,
    [today]
  );

  // Create customer sales
  await testDb.runQuery(
    `INSERT INTO customer_sales (sale_id, customer_name, product_name, quantity, amount, payment_mode, sale_date)
     VALUES ('RPTSALE001', 'Report Customer', 'Report Seeds', 10, 1500, 'cash', ?)`,
    [today]
  );

  // Create purchases
  await testDb.runQuery(
    `INSERT INTO purchases (purchase_id, product_id, quantity, price_per_unit, total_amount, supplier, purchase_status, purchase_date)
     VALUES ('PURRPT001', ?, 20, 80, 1600, 'Report Supplier', 'delivered', ?)`,
    [product1.id, today]
  );

  // Create expenditure
  await testDb.runQuery(
    `INSERT INTO expenditures (amount, description, category, expense_date, created_by)
     VALUES (200, 'Report Expense', 'general', ?, ?)`,
    [today.split(' ')[0], adminAuth.user.id]
  );
});

afterAll(async () => {
  await testDb.close();
});

describe('Reports', () => {
  describe('GET /api/reports/daily-sales', () => {
    test('should get daily sales report', async () => {
      const today = new Date().toISOString().split('T')[0];

      const res = await request(app)
        .get(`/api/reports/daily-sales?date=${today}`)
        .set('Authorization', `Bearer ${adminAuth.token}`);

      expect(res.status).toBe(200);
    });
  });

  describe('GET /api/reports/sales-range', () => {
    test('should get sales range report', async () => {
      const today = new Date().toISOString().split('T')[0];

      const res = await request(app)
        .get(`/api/reports/sales-range?start_date=${today}&end_date=${today}`)
        .set('Authorization', `Bearer ${adminAuth.token}`);

      expect(res.status).toBe(200);
    });
  });

  describe('GET /api/reports/inventory-status', () => {
    test('should get inventory status report', async () => {
      const res = await request(app)
        .get('/api/reports/inventory-status')
        .set('Authorization', `Bearer ${adminAuth.token}`);

      expect(res.status).toBe(200);
    });
  });

  describe('GET /api/reports/product-performance', () => {
    test('should get product performance report', async () => {
      const today = new Date().toISOString().split('T')[0];

      const res = await request(app)
        .get(`/api/reports/product-performance?start_date=2026-01-01&end_date=${today}`)
        .set('Authorization', `Bearer ${adminAuth.token}`);

      expect(res.status).toBe(200);
    });
  });

  describe('GET /api/reports/purchases', () => {
    test('should get purchase history report', async () => {
      const res = await request(app)
        .get('/api/reports/purchases')
        .set('Authorization', `Bearer ${adminAuth.token}`);

      expect(res.status).toBe(200);
    });
  });

  describe('GET /api/reports/suppliers', () => {
    test('should get supplier summary report', async () => {
      const res = await request(app)
        .get('/api/reports/suppliers')
        .set('Authorization', `Bearer ${adminAuth.token}`);

      expect(res.status).toBe(200);
    });
  });

  describe('GET /api/reports/customer-sales', () => {
    test('should get customer sales report', async () => {
      const res = await request(app)
        .get('/api/reports/customer-sales')
        .set('Authorization', `Bearer ${adminAuth.token}`);

      expect(res.status).toBe(200);
    });

    test('should search customer sales by name', async () => {
      const res = await request(app)
        .get('/api/reports/customer-sales?search=Report')
        .set('Authorization', `Bearer ${adminAuth.token}`);

      expect(res.status).toBe(200);
    });
  });

  describe('GET /api/reports/audit', () => {
    test('should get transaction audit report', async () => {
      const today = new Date().toISOString().split('T')[0];

      const res = await request(app)
        .get(`/api/reports/audit?start_date=${today}&end_date=${today}`)
        .set('Authorization', `Bearer ${adminAuth.token}`);

      expect(res.status).toBe(200);
    });
  });

  describe('GET /api/reports/monthly-trend', () => {
    test('should get monthly trends report', async () => {
      const res = await request(app)
        .get('/api/reports/monthly-trend')
        .set('Authorization', `Bearer ${adminAuth.token}`);

      expect(res.status).toBe(200);
    });
  });

  describe('Report Access Control', () => {
    test('should require authentication for all reports', async () => {
      const endpoints = [
        '/api/reports/daily-sales',
        '/api/reports/inventory-status',
        '/api/reports/purchases',
        '/api/reports/suppliers',
        '/api/reports/customer-sales',
        '/api/reports/monthly-trend'
      ];

      for (const endpoint of endpoints) {
        const res = await request(app).get(endpoint);
        expect(res.status).toBe(401);
      }
    });
  });
});
