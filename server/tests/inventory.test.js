const request = require('supertest');
const { createTestDb, initializeTestSchema, seedTestUsers } = require('./setup/testDb');
const { createTestApp, loginUser, createTestProduct, createTestBankAccount, completeDailySetup } = require('./setup/testHelpers');

let testDb, app, adminAuth, operatorAuth, bankAccount;

beforeAll(async () => {
  testDb = createTestDb();
  await initializeTestSchema(testDb);
  await seedTestUsers(testDb);
  app = createTestApp(testDb);
  adminAuth = await loginUser(testDb, 'admin', 'admin123');
  operatorAuth = await loginUser(testDb, 'operator', 'operator123');
  bankAccount = await createTestBankAccount(testDb);
  await completeDailySetup(testDb, bankAccount.id, adminAuth.user.id);
});

afterAll(async () => {
  await testDb.close();
});

describe('Inventory Management', () => {
  describe('GET /api/inventory', () => {
    test('should return empty product list initially', async () => {
      const res = await request(app)
        .get('/api/inventory')
        .set('Authorization', `Bearer ${adminAuth.token}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    test('should require authentication', async () => {
      const res = await request(app).get('/api/inventory');
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/inventory (Inventory Mode)', () => {
    test('should create product in inventory mode with stock', async () => {
      const res = await request(app)
        .post('/api/inventory')
        .set('Authorization', `Bearer ${adminAuth.token}`)
        .send({
          product_name: 'Sunflower Seeds',
          category: 'seeds',
          unit: 'kg',
          quantity_available: 50,
          purchase_price: 100,
          selling_price: 150,
          supplier: 'Farm Supply Co',
          creation_mode: 'inventory'
        });

      expect(res.status).toBe(201);
      expect(res.body.product_name).toBe('Sunflower Seeds');
      expect(res.body.quantity_available).toBe(50);
      expect(res.body.creation_mode).toBe('inventory');
      expect(res.body.created_purchase).toBeDefined();
      expect(res.body.product_id).toMatch(/^SEED/);
    });

    test('should auto-generate product ID', async () => {
      const res = await request(app)
        .post('/api/inventory')
        .set('Authorization', `Bearer ${adminAuth.token}`)
        .send({
          product_name: 'Rice Seeds',
          category: 'seeds',
          unit: 'kg',
          quantity_available: 30,
          purchase_price: 80,
          selling_price: 120
        });

      expect(res.status).toBe(201);
      expect(res.body.product_id).toMatch(/^SEED\d{3}$/);
    });

    test('should reject duplicate product_id', async () => {
      const existing = await testDb.getRow('SELECT product_id FROM products LIMIT 1');

      const res = await request(app)
        .post('/api/inventory')
        .set('Authorization', `Bearer ${adminAuth.token}`)
        .send({
          product_id: existing.product_id,
          product_name: 'Duplicate Product',
          category: 'seeds',
          unit: 'kg',
          quantity_available: 10,
          purchase_price: 50,
          selling_price: 80
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Product ID already exists');
    });

    test('should reject invalid category', async () => {
      const res = await request(app)
        .post('/api/inventory')
        .set('Authorization', `Bearer ${adminAuth.token}`)
        .send({
          product_name: 'Bad Category Product',
          category: 'nonexistent',
          unit: 'kg',
          quantity_available: 10,
          purchase_price: 50,
          selling_price: 80
        });

      expect(res.status).toBe(400);
    });

    test('should reject invalid unit', async () => {
      const res = await request(app)
        .post('/api/inventory')
        .set('Authorization', `Bearer ${adminAuth.token}`)
        .send({
          product_name: 'Bad Unit Product',
          category: 'seeds',
          unit: 'gallons',
          quantity_available: 10,
          purchase_price: 50,
          selling_price: 80
        });

      expect(res.status).toBe(400);
    });

    test('should reject negative quantity', async () => {
      const res = await request(app)
        .post('/api/inventory')
        .set('Authorization', `Bearer ${adminAuth.token}`)
        .send({
          product_name: 'Negative Qty',
          category: 'seeds',
          unit: 'kg',
          quantity_available: -5,
          purchase_price: 50,
          selling_price: 80
        });

      expect(res.status).toBe(400);
    });

    test('should accept all valid unit types', async () => {
      const units = ['kg', 'grams', 'packet', 'bag', 'liters', 'ml', 'pieces', 'bottles', 'tonnes'];
      for (const unit of units) {
        const res = await request(app)
          .post('/api/inventory')
          .set('Authorization', `Bearer ${adminAuth.token}`)
          .send({
            product_name: `Unit Test ${unit}`,
            category: 'seeds',
            unit,
            quantity_available: 1,
            purchase_price: 10,
            selling_price: 20
          });

        expect(res.status).toBe(201);
      }
    });
  });

  describe('POST /api/inventory (Order Mode)', () => {
    test('should create product in order mode with zero stock', async () => {
      const res = await request(app)
        .post('/api/inventory')
        .set('Authorization', `Bearer ${adminAuth.token}`)
        .send({
          product_name: 'Ordered Fertilizer',
          category: 'fertilizers',
          unit: 'bag',
          quantity_available: 0,
          purchase_price: 200,
          selling_price: 300,
          supplier: 'Fertilizer Corp',
          creation_mode: 'order',
          order_quantity: 100,
          order_date: '2026-04-04'
        });

      expect(res.status).toBe(201);
      expect(res.body.quantity_available).toBe(0);
      expect(res.body.creation_mode).toBe('order');
      expect(res.body.created_purchase).toBeDefined();
      expect(res.body.created_purchase.purchase_status).toBe('ordered');
    });

    test('should reject order mode without order_quantity', async () => {
      const res = await request(app)
        .post('/api/inventory')
        .set('Authorization', `Bearer ${adminAuth.token}`)
        .send({
          product_name: 'No Qty Order',
          category: 'seeds',
          unit: 'kg',
          quantity_available: 0,
          purchase_price: 50,
          selling_price: 80,
          creation_mode: 'order',
          order_quantity: 0
        });

      expect(res.status).toBe(400);
    });

    test('should create order with advance payment', async () => {
      const res = await request(app)
        .post('/api/inventory')
        .set('Authorization', `Bearer ${adminAuth.token}`)
        .send({
          product_name: 'Advance Order Product',
          category: 'seeds',
          unit: 'kg',
          quantity_available: 0,
          purchase_price: 100,
          selling_price: 150,
          supplier: 'Advance Supplier',
          creation_mode: 'order',
          order_quantity: 50,
          advance_amount: 1000,
          bank_account_id: bankAccount.id
        });

      expect(res.status).toBe(201);
      expect(res.body.created_purchase.advance_amount).toBe(1000);
    });

    test('should reject advance exceeding total', async () => {
      const res = await request(app)
        .post('/api/inventory')
        .set('Authorization', `Bearer ${adminAuth.token}`)
        .send({
          product_name: 'Over Advance',
          category: 'seeds',
          unit: 'kg',
          quantity_available: 0,
          purchase_price: 10,
          selling_price: 20,
          supplier: 'Supplier',
          creation_mode: 'order',
          order_quantity: 5,
          advance_amount: 999999,
          bank_account_id: bankAccount.id
        });

      expect(res.status).toBe(400);
    });

    test('should reject advance without supplier', async () => {
      const res = await request(app)
        .post('/api/inventory')
        .set('Authorization', `Bearer ${adminAuth.token}`)
        .send({
          product_name: 'No Supplier Advance',
          category: 'seeds',
          unit: 'kg',
          quantity_available: 0,
          purchase_price: 100,
          selling_price: 150,
          creation_mode: 'order',
          order_quantity: 10,
          advance_amount: 500,
          bank_account_id: bankAccount.id
        });

      expect(res.status).toBe(400);
    });

    test('should reject advance without bank account', async () => {
      const res = await request(app)
        .post('/api/inventory')
        .set('Authorization', `Bearer ${adminAuth.token}`)
        .send({
          product_name: 'No Bank Advance',
          category: 'seeds',
          unit: 'kg',
          quantity_available: 0,
          purchase_price: 100,
          selling_price: 150,
          supplier: 'Some Supplier',
          creation_mode: 'order',
          order_quantity: 10,
          advance_amount: 500
        });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/inventory/:id', () => {
    test('should get single product', async () => {
      const product = await testDb.getRow('SELECT id FROM products LIMIT 1');

      const res = await request(app)
        .get(`/api/inventory/${product.id}`)
        .set('Authorization', `Bearer ${adminAuth.token}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(product.id);
    });

    test('should return 404 for non-existent product', async () => {
      const res = await request(app)
        .get('/api/inventory/99999')
        .set('Authorization', `Bearer ${adminAuth.token}`);

      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/inventory/next-id', () => {
    test('should generate next product ID', async () => {
      const res = await request(app)
        .get('/api/inventory/next-id?category=seeds')
        .set('Authorization', `Bearer ${adminAuth.token}`);

      expect(res.status).toBe(200);
      expect(res.body.nextId).toMatch(/^SEED\d{3}$/);
    });

    test('should return 400 without category', async () => {
      const res = await request(app)
        .get('/api/inventory/next-id')
        .set('Authorization', `Bearer ${adminAuth.token}`);

      expect(res.status).toBe(400);
    });
  });

  describe('PUT /api/inventory/:id', () => {
    test('should update selling price', async () => {
      const product = await testDb.getRow('SELECT id FROM products LIMIT 1');

      const res = await request(app)
        .put(`/api/inventory/${product.id}`)
        .set('Authorization', `Bearer ${adminAuth.token}`)
        .send({ selling_price: 200 });

      expect(res.status).toBe(200);
      expect(res.body.selling_price).toBe(200);
    });

    test('should return 404 for non-existent product', async () => {
      const res = await request(app)
        .put('/api/inventory/99999')
        .set('Authorization', `Bearer ${adminAuth.token}`)
        .send({ selling_price: 200 });

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/inventory/:id', () => {
    test('should hard delete product without sales or purchases', async () => {
      const product = await createTestProduct(testDb, { product_id: 'DEL001' });

      const res = await request(app)
        .delete(`/api/inventory/${product.id}`)
        .set('Authorization', `Bearer ${adminAuth.token}`);

      expect(res.status).toBe(200);

      const deleted = await testDb.getRow('SELECT id FROM products WHERE id = ?', [product.id]);
      expect(deleted).toBeNull();
    });

    test('should soft delete product with purchases', async () => {
      const product = await createTestProduct(testDb, { product_id: 'SOFTDEL001' });

      // Create a purchase record for this product
      await testDb.runQuery(
        `INSERT INTO purchases (purchase_id, product_id, quantity, price_per_unit, total_amount, purchase_status)
         VALUES (?, ?, 10, 50, 500, 'delivered')`,
        ['PURTEST001', product.id]
      );

      const res = await request(app)
        .delete(`/api/inventory/${product.id}`)
        .set('Authorization', `Bearer ${adminAuth.token}`);

      expect(res.status).toBe(200);

      const softDeleted = await testDb.getRow('SELECT is_deleted FROM products WHERE id = ?', [product.id]);
      expect(softDeleted.is_deleted).toBe(1);
    });

    test('should block deletion of product with sales', async () => {
      const product = await createTestProduct(testDb, { product_id: 'SALESBLK001' });

      // Create a sale record
      await testDb.runQuery(
        `INSERT INTO sales (sale_id, product_id, quantity_sold, price_per_unit, total_amount)
         VALUES ('SALE001', ?, 5, 80, 400)`,
        [product.id]
      );

      const res = await request(app)
        .delete(`/api/inventory/${product.id}`)
        .set('Authorization', `Bearer ${adminAuth.token}`);

      expect(res.status).toBe(400);
    });

    test('operator cannot delete products', async () => {
      const product = await createTestProduct(testDb, { product_id: 'OPDEL001' });

      const res = await request(app)
        .delete(`/api/inventory/${product.id}`)
        .set('Authorization', `Bearer ${operatorAuth.token}`);

      expect(res.status).toBe(403);
    });
  });

  describe('POST /api/inventory/:id/add-stock', () => {
    test('should add stock to existing product', async () => {
      const product = await createTestProduct(testDb, {
        product_id: 'ADDSTOCK001',
        quantity_available: 50
      });

      const res = await request(app)
        .post(`/api/inventory/${product.id}/add-stock`)
        .set('Authorization', `Bearer ${adminAuth.token}`)
        .send({ quantity: 25 });

      expect(res.status).toBe(200);
      expect(res.body.product.quantity_available).toBe(75);
    });

    test('should reject zero quantity', async () => {
      const product = await testDb.getRow('SELECT id FROM products LIMIT 1');

      const res = await request(app)
        .post(`/api/inventory/${product.id}/add-stock`)
        .set('Authorization', `Bearer ${adminAuth.token}`)
        .send({ quantity: 0 });

      expect(res.status).toBe(400);
    });

    test('should reject negative quantity', async () => {
      const product = await testDb.getRow('SELECT id FROM products LIMIT 1');

      const res = await request(app)
        .post(`/api/inventory/${product.id}/add-stock`)
        .set('Authorization', `Bearer ${adminAuth.token}`)
        .send({ quantity: -5 });

      expect(res.status).toBe(400);
    });
  });

  describe('Product Filtering', () => {
    test('should filter by category', async () => {
      const res = await request(app)
        .get('/api/inventory?category=seeds')
        .set('Authorization', `Bearer ${adminAuth.token}`);

      expect(res.status).toBe(200);
      res.body.forEach(p => expect(p.category).toBe('seeds'));
    });

    test('should filter by search term', async () => {
      const res = await request(app)
        .get('/api/inventory?search=Sunflower')
        .set('Authorization', `Bearer ${adminAuth.token}`);

      expect(res.status).toBe(200);
      expect(res.body.some(p => p.product_name.includes('Sunflower'))).toBe(true);
    });
  });
});
