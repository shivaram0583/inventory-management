const request = require('supertest');
const { createTestDb, initializeTestSchema, seedTestUsers } = require('./setup/testDb');
const { createTestApp, loginUser, createTestProduct, createTestBankAccount, completeDailySetup } = require('./setup/testHelpers');

let testDb, app, adminAuth, operatorAuth, bankAccount, testProduct;

beforeAll(async () => {
  testDb = createTestDb();
  await initializeTestSchema(testDb);
  await seedTestUsers(testDb);
  app = createTestApp(testDb);
  adminAuth = await loginUser(testDb, 'admin', 'admin123');
  operatorAuth = await loginUser(testDb, 'operator', 'operator123');
  bankAccount = await createTestBankAccount(testDb, { balance: 50000 });
  await completeDailySetup(testDb, bankAccount.id, adminAuth.user.id);

  // Create test products
  testProduct = await createTestProduct(testDb, {
    product_id: 'SALE_SEED001',
    product_name: 'Sale Test Seeds',
    quantity_available: 200,
    selling_price: 100
  });
});

afterAll(async () => {
  await testDb.close();
});

describe('Sales Flow', () => {
  describe('POST /api/sales', () => {
    test('should create single-item cash sale', async () => {
      const res = await request(app)
        .post('/api/sales')
        .set('Authorization', `Bearer ${adminAuth.token}`)
        .send({
          items: [{ product_id: testProduct.id, quantity: 5 }],
          customer_name: 'Test Customer',
          customer_mobile: '9876543210',
          customer_address: '123 Test Street',
          payment_mode: 'cash'
        });

      expect(res.status).toBe(201);
      expect(res.body.saleId).toBeDefined();
      expect(res.body.receiptNumber).toMatch(/^R-\d{8}-.+-[A-Z0-9]{2}$/);
      expect(res.body.totalAmount).toBe(500); // 5 * 100
      expect(res.body.items).toHaveLength(1);
      expect(res.body.receipt).toBeDefined();
      expect(res.body.receipt.payment_mode).toBe('cash');
    });

    test('should deduct stock after sale', async () => {
      const product = await testDb.getRow('SELECT quantity_available FROM products WHERE id = ?', [testProduct.id]);
      expect(product.quantity_available).toBe(195); // 200 - 5
    });

    test('should create multi-item sale', async () => {
      const product2 = await createTestProduct(testDb, {
        product_id: 'SALE_SEED002',
        product_name: 'Multi Item Seeds',
        quantity_available: 50,
        selling_price: 200
      });

      const res = await request(app)
        .post('/api/sales')
        .set('Authorization', `Bearer ${adminAuth.token}`)
        .send({
          items: [
            { product_id: testProduct.id, quantity: 3 },
            { product_id: product2.id, quantity: 2 }
          ],
          customer_name: 'Multi Buyer',
          payment_mode: 'cash'
        });

      expect(res.status).toBe(201);
      expect(res.body.items).toHaveLength(2);
      expect(res.body.totalAmount).toBe(700); // 3*100 + 2*200
    });

    test('should create customer_sales archive entries', async () => {
      const archives = await testDb.getAll(
        "SELECT * FROM customer_sales WHERE customer_name = 'Test Customer'"
      );
      expect(archives.length).toBeGreaterThan(0);
    });

    test('should handle card payment with auto bank deposit', async () => {
      const initialBalance = (await testDb.getRow('SELECT balance FROM bank_accounts WHERE id = ?', [bankAccount.id])).balance;

      const res = await request(app)
        .post('/api/sales')
        .set('Authorization', `Bearer ${adminAuth.token}`)
        .send({
          items: [{ product_id: testProduct.id, quantity: 2 }],
          customer_name: 'Card Customer',
          payment_mode: 'card'
        });

      expect(res.status).toBe(201);

      const newBalance = (await testDb.getRow('SELECT balance FROM bank_accounts WHERE id = ?', [bankAccount.id])).balance;
      expect(newBalance).toBe(initialBalance + 200); // 2 * 100

      // Check bank transfer was created
      const transfer = await testDb.getRow(
        "SELECT * FROM bank_transfers WHERE source_type = 'sale' AND source_reference = ?",
        [res.body.saleId]
      );
      expect(transfer).toBeDefined();
      expect(transfer.transfer_type).toBe('deposit');
    });

    test('should handle UPI payment with auto bank deposit', async () => {
      const res = await request(app)
        .post('/api/sales')
        .set('Authorization', `Bearer ${adminAuth.token}`)
        .send({
          items: [{ product_id: testProduct.id, quantity: 1 }],
          customer_name: 'UPI Customer',
          payment_mode: 'upi'
        });

      expect(res.status).toBe(201);
      expect(res.body.receipt.payment_mode).toBe('upi');
    });

    test('should reject sale with insufficient stock', async () => {
      const res = await request(app)
        .post('/api/sales')
        .set('Authorization', `Bearer ${adminAuth.token}`)
        .send({
          items: [{ product_id: testProduct.id, quantity: 99999 }],
          customer_name: 'Greedy Customer',
          payment_mode: 'cash'
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/Insufficient stock/);
    });

    test('should reject sale with non-existent product', async () => {
      const res = await request(app)
        .post('/api/sales')
        .set('Authorization', `Bearer ${adminAuth.token}`)
        .send({
          items: [{ product_id: 99999, quantity: 1 }],
          customer_name: 'Ghost Customer',
          payment_mode: 'cash'
        });

      expect(res.status).toBe(404);
    });

    test('should reject sale with empty items', async () => {
      const res = await request(app)
        .post('/api/sales')
        .set('Authorization', `Bearer ${adminAuth.token}`)
        .send({
          items: [],
          customer_name: 'No Items Customer',
          payment_mode: 'cash'
        });

      expect(res.status).toBe(400);
    });

    test('should reject sale with zero quantity', async () => {
      const res = await request(app)
        .post('/api/sales')
        .set('Authorization', `Bearer ${adminAuth.token}`)
        .send({
          items: [{ product_id: testProduct.id, quantity: 0 }],
          customer_name: 'Zero Qty',
          payment_mode: 'cash'
        });

      expect(res.status).toBe(400);
    });

    test('should reject invalid payment mode', async () => {
      const res = await request(app)
        .post('/api/sales')
        .set('Authorization', `Bearer ${adminAuth.token}`)
        .send({
          items: [{ product_id: testProduct.id, quantity: 1 }],
          customer_name: 'Bad Payment',
          payment_mode: 'bitcoin'
        });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/sales', () => {
    test('should get all sales', async () => {
      const res = await request(app)
        .get('/api/sales')
        .set('Authorization', `Bearer ${adminAuth.token}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
    });

    test('should filter by date range', async () => {
      const today = new Date().toISOString().split('T')[0];

      const res = await request(app)
        .get(`/api/sales?start_date=${today}&end_date=${today}`)
        .set('Authorization', `Bearer ${adminAuth.token}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('GET /api/sales/:saleId', () => {
    test('should get sale details', async () => {
      const sale = await testDb.getRow('SELECT sale_id FROM sales LIMIT 1');

      const res = await request(app)
        .get(`/api/sales/${sale.sale_id}`)
        .set('Authorization', `Bearer ${adminAuth.token}`);

      expect(res.status).toBe(200);
      expect(res.body.saleId).toBe(sale.sale_id);
      expect(res.body.items).toBeDefined();
      expect(res.body.receipt).toBeDefined();
    });

    test('should return 404 for non-existent sale', async () => {
      const res = await request(app)
        .get('/api/sales/NONEXISTENT_SALE')
        .set('Authorization', `Bearer ${adminAuth.token}`);

      expect(res.status).toBe(404);
    });
  });

  describe('PUT /api/sales/receipts/:id/print', () => {
    test('should mark receipt as printed', async () => {
      const receipt = await testDb.getRow('SELECT id FROM receipts LIMIT 1');

      const res = await request(app)
        .put(`/api/sales/receipts/${receipt.id}/print`)
        .set('Authorization', `Bearer ${adminAuth.token}`);

      expect(res.status).toBe(200);

      const updated = await testDb.getRow('SELECT printed FROM receipts WHERE id = ?', [receipt.id]);
      expect(updated.printed).toBeTruthy();
    });
  });

  describe('Stock Integrity', () => {
    test('stock should be correctly tracked after multiple sales', async () => {
      const product = await createTestProduct(testDb, {
        product_id: 'STOCKTRACK001',
        quantity_available: 100,
        selling_price: 50
      });

      // Sale 1: 10 units
      await request(app)
        .post('/api/sales')
        .set('Authorization', `Bearer ${adminAuth.token}`)
        .send({
          items: [{ product_id: product.id, quantity: 10 }],
          customer_name: 'Stock Test 1',
          payment_mode: 'cash'
        });

      // Sale 2: 15 units
      await request(app)
        .post('/api/sales')
        .set('Authorization', `Bearer ${adminAuth.token}`)
        .send({
          items: [{ product_id: product.id, quantity: 15 }],
          customer_name: 'Stock Test 2',
          payment_mode: 'cash'
        });

      const updated = await testDb.getRow('SELECT quantity_available FROM products WHERE id = ?', [product.id]);
      expect(updated.quantity_available).toBe(75); // 100 - 10 - 15
    });
  });
});
