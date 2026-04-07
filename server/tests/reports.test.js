const request = require('supertest');
const moment = require('moment');
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

  const today = moment().utcOffset('+05:30').format('YYYY-MM-DD HH:mm:ss');

  const saleResult = await testDb.runQuery(
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

  await testDb.runQuery(
    `INSERT INTO customer_sales (sale_id, customer_name, product_name, quantity, amount, payment_mode, sale_date)
     VALUES ('RPTSALE001', 'Report Customer', 'Report Seeds', 10, 1500, 'cash', ?)`,
    [today]
  );

  const purchaseResult = await testDb.runQuery(
    `INSERT INTO purchases (purchase_id, product_id, quantity, price_per_unit, total_amount, supplier, purchase_status, purchase_date)
     VALUES ('PURRPT001', ?, 20, 80, 1600, 'Report Supplier', 'delivered', ?)`,
    [product1.id, today]
  );

  const purchaseLotResult = await testDb.runQuery(
    `INSERT INTO purchase_lots (
       purchase_id,
       product_id,
       supplier_name,
       source_type,
       quantity_received,
       quantity_sold,
       quantity_returned,
       quantity_adjusted,
       quantity_remaining,
       price_per_unit,
       gst_percent,
       purchase_date,
       delivery_date,
       created_at,
       updated_at
     ) VALUES (?, ?, 'Report Supplier', 'purchase', 20, 10, 0, 0, 10, 80, 0, ?, ?, ?, ?)`,
    [purchaseResult.id, product1.id, today, today, today, today]
  );

  await testDb.runQuery(
    `INSERT INTO sale_allocations (
       sale_line_id,
       sale_id,
       product_id,
       purchase_lot_id,
       quantity_allocated,
       quantity_returned,
       unit_cost,
       created_at,
       updated_at
     ) VALUES (?, 'RPTSALE001', ?, ?, 10, 0, 80, ?, ?)`,
    [saleResult.id, product1.id, purchaseLotResult.id, today, today]
  );

  await testDb.runQuery(
    `INSERT INTO sales_returns (return_id, sale_id, product_id, quantity_returned, price_per_unit, refund_amount, refund_mode, reason, returned_by, return_date)
     VALUES ('RET-RPT-001', 'RPTSALE001', ?, 2, 150, 300, 'cash', 'Damaged bag', ?, ?)`,
    [product1.id, adminAuth.user.id, today]
  );

  await testDb.runQuery(
    `INSERT INTO supplier_payments (supplier_name, amount, payment_mode, payment_date, created_by, description)
     VALUES ('Report Supplier', 500, 'cash', ?, ?, 'Settlement advance')`,
    [today, adminAuth.user.id]
  );

  const supplierReturnResult = await testDb.runQuery(
    `INSERT INTO supplier_returns (return_id, supplier_name, total_quantity, total_amount, notes, return_date, created_by, created_at)
     VALUES ('SRET-RPT-001', 'Report Supplier', 4, 320, 'Year-end return', ?, ?, ?)`,
    [today, adminAuth.user.id, today]
  );

  await testDb.runQuery(
    `INSERT INTO supplier_return_items (supplier_return_id, purchase_lot_id, purchase_id, product_id, quantity_returned, price_per_unit, total_amount, created_at)
     VALUES (?, ?, ?, ?, 4, 80, 320, ?)`,
    [supplierReturnResult.id, purchaseLotResult.id, purchaseResult.id, product1.id, today]
  );

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

  describe('GET /api/reports/supplier-settlement', () => {
    test('should get supplier settlement report with sold-only liability for the selected financial year', async () => {
      const today = moment().utcOffset('+05:30').format('YYYY-MM-DD');
      const todayMoment = moment(today, 'YYYY-MM-DD', true);
      const startYear = todayMoment.month() >= 3 ? todayMoment.year() : todayMoment.year() - 1;
      const financialYear = `${startYear}-${startYear + 1}`;

      const res = await request(app)
        .get(`/api/reports/supplier-settlement?financial_year=${financialYear}`)
        .set('Authorization', `Bearer ${adminAuth.token}`);

      expect(res.status).toBe(200);
      expect(res.body.range.financial_year).toBe(financialYear);

      const supplierRow = res.body.rows.find((row) => row.supplier === 'Report Supplier');
      expect(supplierRow).toBeTruthy();
      expect(supplierRow.received_value).toBeCloseTo(1600, 2);
      expect(supplierRow.returned_value).toBeCloseTo(320, 2);
      expect(supplierRow.sold_liability).toBeCloseTo(640, 2);
      expect(supplierRow.payments_made).toBeCloseTo(500, 2);
      expect(supplierRow.closing_due).toBeCloseTo(140, 2);
      expect(res.body.summary.total_closing_due).toBeCloseTo(140, 2);
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
