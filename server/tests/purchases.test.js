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
  bankAccount = await createTestBankAccount(testDb, { balance: 100000 });
  await completeDailySetup(testDb, bankAccount.id, adminAuth.user.id);

  testProduct = await createTestProduct(testDb, {
    product_id: 'PUR_SEED001',
    product_name: 'Purchase Test Seeds',
    quantity_available: 50,
    purchase_price: 80,
    selling_price: 120
  });
});

afterAll(async () => {
  await testDb.close();
});

describe('Purchase Management', () => {
  describe('POST /api/purchases', () => {
    test('should record a delivered purchase', async () => {
      const initialQty = (await testDb.getRow('SELECT quantity_available FROM products WHERE id = ?', [testProduct.id])).quantity_available;

      const res = await request(app)
        .post('/api/purchases')
        .set('Authorization', `Bearer ${adminAuth.token}`)
        .send({
          product_id: testProduct.id,
          quantity: 20,
          price_per_unit: 80,
          supplier: 'Test Supplier',
          purchase_date: '2026-04-04',
          purchase_status: 'delivered'
        });

      expect(res.status).toBe(201);
      expect(res.body.purchase_status).toBe('delivered');

      const newQty = (await testDb.getRow('SELECT quantity_available FROM products WHERE id = ?', [testProduct.id])).quantity_available;
      expect(newQty).toBe(initialQty + 20);
    });

    test('should record an ordered purchase without stock update', async () => {
      const initialQty = (await testDb.getRow('SELECT quantity_available FROM products WHERE id = ?', [testProduct.id])).quantity_available;

      const res = await request(app)
        .post('/api/purchases')
        .set('Authorization', `Bearer ${adminAuth.token}`)
        .send({
          product_id: testProduct.id,
          quantity: 30,
          price_per_unit: 80,
          supplier: 'Order Supplier',
          purchase_date: '2026-04-04',
          purchase_status: 'ordered'
        });

      expect(res.status).toBe(201);
      expect(res.body.purchase_status).toBe('ordered');

      const newQty = (await testDb.getRow('SELECT quantity_available FROM products WHERE id = ?', [testProduct.id])).quantity_available;
      expect(newQty).toBe(initialQty); // Stock unchanged

      const syncedProduct = await testDb.getRow('SELECT supplier FROM products WHERE id = ?', [testProduct.id]);
      expect(syncedProduct.supplier).toBe('Order Supplier');

      const supplierRecord = await testDb.getRow('SELECT name FROM suppliers WHERE LOWER(name) = LOWER(?)', ['Order Supplier']);
      expect(supplierRecord?.name).toBe('Order Supplier');
    });

    test('should record purchase with advance payment', async () => {
      const initialBalance = (await testDb.getRow('SELECT balance FROM bank_accounts WHERE id = ?', [bankAccount.id])).balance;

      const res = await request(app)
        .post('/api/purchases')
        .set('Authorization', `Bearer ${adminAuth.token}`)
        .send({
          product_id: testProduct.id,
          quantity: 10,
          price_per_unit: 100,
          supplier: 'Advance Supplier',
          purchase_date: '2026-04-04',
          purchase_status: 'ordered',
          advance_amount: 500,
          bank_account_id: bankAccount.id
        });

      expect(res.status).toBe(201);

      const newBalance = (await testDb.getRow('SELECT balance FROM bank_accounts WHERE id = ?', [bankAccount.id])).balance;
      expect(newBalance).toBe(initialBalance - 500);
    });

    test('should reject advance exceeding total', async () => {
      const res = await request(app)
        .post('/api/purchases')
        .set('Authorization', `Bearer ${adminAuth.token}`)
        .send({
          product_id: testProduct.id,
          quantity: 5,
          price_per_unit: 10,
          supplier: 'Over Advance',
          purchase_status: 'ordered',
          advance_amount: 999,
          bank_account_id: bankAccount.id
        });

      expect(res.status).toBe(400);
    });

    test('should reject advance without supplier', async () => {
      const res = await request(app)
        .post('/api/purchases')
        .set('Authorization', `Bearer ${adminAuth.token}`)
        .send({
          product_id: testProduct.id,
          quantity: 5,
          price_per_unit: 100,
          purchase_status: 'ordered',
          advance_amount: 200,
          bank_account_id: bankAccount.id
        });

      expect(res.status).toBe(400);
    });

    test('should reject advance without bank account', async () => {
      const res = await request(app)
        .post('/api/purchases')
        .set('Authorization', `Bearer ${adminAuth.token}`)
        .send({
          product_id: testProduct.id,
          quantity: 5,
          price_per_unit: 100,
          supplier: 'Some Supplier',
          purchase_status: 'ordered',
          advance_amount: 200
        });

      expect(res.status).toBe(400);
    });

    test('should reject non-existent product', async () => {
      const res = await request(app)
        .post('/api/purchases')
        .set('Authorization', `Bearer ${adminAuth.token}`)
        .send({
          product_id: 99999,
          quantity: 5,
          price_per_unit: 100,
          purchase_status: 'delivered'
        });

      expect(res.status).toBe(404);
    });

    test('should reject zero quantity', async () => {
      const res = await request(app)
        .post('/api/purchases')
        .set('Authorization', `Bearer ${adminAuth.token}`)
        .send({
          product_id: testProduct.id,
          quantity: 0,
          price_per_unit: 100,
          purchase_status: 'delivered'
        });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/purchases', () => {
    test('should get all purchases', async () => {
      const res = await request(app)
        .get('/api/purchases')
        .set('Authorization', `Bearer ${adminAuth.token}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
    });

    test('should filter by status', async () => {
      const res = await request(app)
        .get('/api/purchases?status=ordered')
        .set('Authorization', `Bearer ${adminAuth.token}`);

      expect(res.status).toBe(200);
      res.body.forEach(p => {
        expect(p.purchase_status).toBe('ordered');
      });
    });

    test('should filter by date range', async () => {
      const res = await request(app)
        .get('/api/purchases?start_date=2026-04-01&end_date=2026-04-30')
        .set('Authorization', `Bearer ${adminAuth.token}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('POST /api/purchases/:id/mark-delivered', () => {
    test('should mark ordered purchase as delivered and update stock', async () => {
      // Create an ordered purchase
      const orderedPurchase = await testDb.runQuery(
        `INSERT INTO purchases (purchase_id, product_id, quantity, price_per_unit, total_amount, supplier, purchase_status)
         VALUES ('PURMARK001', ?, 25, 80, 2000, 'Mark Supplier', 'ordered')`,
        [testProduct.id]
      );

      const initialQty = (await testDb.getRow('SELECT quantity_available FROM products WHERE id = ?', [testProduct.id])).quantity_available;

      const res = await request(app)
        .post(`/api/purchases/${orderedPurchase.id}/mark-delivered`)
        .set('Authorization', `Bearer ${adminAuth.token}`)
        .send({ delivery_date: '2026-04-04' });

      expect(res.status).toBe(200);
      expect(res.body.purchase_status).toBe('delivered');

      const newQty = (await testDb.getRow('SELECT quantity_available FROM products WHERE id = ?', [testProduct.id])).quantity_available;
      expect(newQty).toBe(initialQty + 25);
    });

    test('should reject already delivered purchase', async () => {
      const deliveredPurchase = await testDb.getRow(
        "SELECT id FROM purchases WHERE purchase_status = 'delivered' LIMIT 1"
      );

      const res = await request(app)
        .post(`/api/purchases/${deliveredPurchase.id}/mark-delivered`)
        .set('Authorization', `Bearer ${adminAuth.token}`);

      expect(res.status).toBe(400);
    });

    test('should return 404 for non-existent purchase', async () => {
      const res = await request(app)
        .post('/api/purchases/99999/mark-delivered')
        .set('Authorization', `Bearer ${adminAuth.token}`);

      expect(res.status).toBe(404);
    });

    test('should only add the remaining stock when an order was partially delivered earlier', async () => {
      const orderedPurchase = await testDb.runQuery(
        `INSERT INTO purchases (
           purchase_id, product_id, quantity, price_per_unit, total_amount, supplier, purchase_status, quantity_delivered
         ) VALUES ('PURMARKPART001', ?, 25, 80, 2000, 'Mark Supplier', 'ordered', 10)`,
        [testProduct.id]
      );

      await testDb.runQuery(
        'UPDATE products SET quantity_available = quantity_available + 10 WHERE id = ?',
        [testProduct.id]
      );

      const initialQty = (await testDb.getRow('SELECT quantity_available FROM products WHERE id = ?', [testProduct.id])).quantity_available;

      const res = await request(app)
        .post(`/api/purchases/${orderedPurchase.id}/mark-delivered`)
        .set('Authorization', `Bearer ${adminAuth.token}`)
        .send({ delivery_date: '2026-04-04' });

      expect(res.status).toBe(200);
      expect(res.body.purchase_status).toBe('delivered');
      expect(Number(res.body.quantity_delivered)).toBe(25);

      const newQty = (await testDb.getRow('SELECT quantity_available FROM products WHERE id = ?', [testProduct.id])).quantity_available;
      expect(newQty).toBe(initialQty + 15);
    });
  });

  describe('POST /api/purchases/:id/partial-delivery', () => {
    test('should allow closing an order with a short final delivery', async () => {
      const orderedPurchase = await testDb.runQuery(
        `INSERT INTO purchases (purchase_id, product_id, quantity, price_per_unit, total_amount, supplier, purchase_status)
         VALUES ('PURPARTCLOSE001', ?, 100, 80, 8000, 'Partial Supplier', 'ordered')`,
        [testProduct.id]
      );

      const initialQty = (await testDb.getRow('SELECT quantity_available FROM products WHERE id = ?', [testProduct.id])).quantity_available;

      const res = await request(app)
        .post(`/api/purchases/${orderedPurchase.id}/partial-delivery`)
        .set('Authorization', `Bearer ${adminAuth.token}`)
        .send({
          quantity_delivered: 40,
          delivery_date: '2026-04-04',
          mark_as_completed: true
        });

      expect(res.status).toBe(200);
      expect(res.body.purchase_status).toBe('delivered');
      expect(Number(res.body.quantity)).toBe(40);
      expect(Number(res.body.quantity_delivered)).toBe(40);
      expect(Number(res.body.total_amount)).toBe(3200);

      const newQty = (await testDb.getRow('SELECT quantity_available FROM products WHERE id = ?', [testProduct.id])).quantity_available;
      expect(newQty).toBe(initialQty + 40);
    });
  });

  describe('PUT /api/purchases/:id', () => {
    test('should update purchase quantity for delivered purchase', async () => {
      const purchase = await testDb.getRow(
        "SELECT * FROM purchases WHERE purchase_status = 'delivered' LIMIT 1"
      );

      const res = await request(app)
        .put(`/api/purchases/${purchase.id}`)
        .set('Authorization', `Bearer ${adminAuth.token}`)
        .send({
          quantity: 30,
          price_per_unit: 90,
          supplier: 'Updated Supplier'
        });

      expect(res.status).toBe(200);
    });

    test('should sync supplier on the linked product when updating an ordered purchase', async () => {
      const product = await createTestProduct(testDb, {
        product_id: 'PUR_SYNC002',
        product_name: 'Ordered Sync Product',
        supplier: 'Original Supplier'
      });

      const purchaseResult = await testDb.runQuery(
        `INSERT INTO purchases (purchase_id, product_id, quantity, price_per_unit, total_amount, supplier, purchase_status)
         VALUES ('PURSYNCORDER001', ?, 12, 80, 960, 'Original Supplier', 'ordered')`,
        [product.id]
      );

      const res = await request(app)
        .put(`/api/purchases/${purchaseResult.id}`)
        .set('Authorization', `Bearer ${adminAuth.token}`)
        .send({
          quantity: 14,
          price_per_unit: 82,
          supplier: 'Renamed Supplier',
          purchase_date: '2026-04-04'
        });

      expect(res.status).toBe(200);

      const updatedProduct = await testDb.getRow('SELECT supplier FROM products WHERE id = ?', [product.id]);
      expect(updatedProduct.supplier).toBe('Renamed Supplier');

      const supplierRecord = await testDb.getRow('SELECT name FROM suppliers WHERE LOWER(name) = LOWER(?)', ['Renamed Supplier']);
      expect(supplierRecord?.name).toBe('Renamed Supplier');
    });

    test('should return 404 for non-existent purchase', async () => {
      const res = await request(app)
        .put('/api/purchases/99999')
        .set('Authorization', `Bearer ${adminAuth.token}`)
        .send({ quantity: 10, price_per_unit: 50 });

      expect(res.status).toBe(404);
    });
  });

  describe('Category Management', () => {
    describe('GET /api/purchases/categories', () => {
      test('should get all categories', async () => {
        const res = await request(app)
          .get('/api/purchases/categories')
          .set('Authorization', `Bearer ${adminAuth.token}`);

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body.length).toBeGreaterThanOrEqual(4); // seeds, fertilizers, pesticides, tools
      });
    });

    describe('POST /api/purchases/categories', () => {
      test('should create a new category', async () => {
        const res = await request(app)
          .post('/api/purchases/categories')
          .set('Authorization', `Bearer ${adminAuth.token}`)
          .send({ name: 'organic' });

        expect(res.status).toBe(201);
        expect(res.body.name).toBe('organic');
      });

      test('should reject duplicate category', async () => {
        const res = await request(app)
          .post('/api/purchases/categories')
          .set('Authorization', `Bearer ${adminAuth.token}`)
          .send({ name: 'seeds' });

        expect(res.status).toBe(400);
      });

      test('should reject empty category name', async () => {
        const res = await request(app)
          .post('/api/purchases/categories')
          .set('Authorization', `Bearer ${adminAuth.token}`)
          .send({ name: '' });

        expect(res.status).toBe(400);
      });
    });

    describe('DELETE /api/purchases/categories/:id', () => {
      test('should delete unused category', async () => {
        const cat = await testDb.getRow("SELECT id FROM product_categories WHERE name = 'organic'");

        const res = await request(app)
          .delete(`/api/purchases/categories/${cat.id}`)
          .set('Authorization', `Bearer ${adminAuth.token}`);

        expect(res.status).toBe(200);
      });

      test('should reject deleting category in use', async () => {
        const cat = await testDb.getRow("SELECT id FROM product_categories WHERE name = 'seeds'");

        const res = await request(app)
          .delete(`/api/purchases/categories/${cat.id}`)
          .set('Authorization', `Bearer ${adminAuth.token}`);

        expect(res.status).toBe(400);
      });

      test('should return 404 for non-existent category', async () => {
        const res = await request(app)
          .delete('/api/purchases/categories/99999')
          .set('Authorization', `Bearer ${adminAuth.token}`);

        expect(res.status).toBe(404);
      });
    });
  });
});
