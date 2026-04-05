const request = require('supertest');
const { createTestDb, initializeTestSchema, seedTestUsers } = require('./setup/testDb');
const { createTestApp, loginUser, createTestProduct } = require('./setup/testHelpers');

let testDb;
let app;
let adminAuth;
let product;
let customer;

beforeAll(async () => {
  testDb = createTestDb();
  await initializeTestSchema(testDb);
  await seedTestUsers(testDb);
  app = createTestApp(testDb);
  adminAuth = await loginUser(testDb, 'admin', 'admin123');

  product = await createTestProduct(testDb, {
    product_id: 'PRICE001',
    product_name: 'Advanced Price Seeds',
    quantity_available: 300,
    selling_price: 100,
    gst_percent: 0
  });

  const customerResult = await testDb.runQuery(
    `INSERT INTO customers (name, mobile, address, email, credit_limit, outstanding_balance, is_active)
     VALUES (?, ?, ?, ?, ?, ?, 1)`,
    ['Priority Farmer', '9999999999', 'Field Block 7', 'priority@example.com', 10000, 0]
  );
  customer = await testDb.getRow('SELECT * FROM customers WHERE id = ?', [customerResult.id]);

  await testDb.runQuery(
    `INSERT INTO price_tiers (product_id, min_quantity, price_per_unit, label)
     VALUES (?, ?, ?, ?)`,
    [product.id, 10, 92, 'Bulk 10+']
  );
  await testDb.runQuery(
    `INSERT INTO product_promotions (product_id, promotional_price, start_date, end_date, label, is_active)
     VALUES (?, ?, ?, ?, ?, 1)`,
    [product.id, 85, '2026-01-01', '2026-12-31', 'Season opener']
  );
  await testDb.runQuery(
    `INSERT INTO customer_pricing (customer_id, product_id, price_per_unit, start_date, end_date, notes)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [customer.id, product.id, 78, '2026-01-01', '2026-12-31', 'Preferred grower rate']
  );
});

afterAll(async () => {
  await testDb.close();
});

describe('Advanced Pricing', () => {
  test('should resolve the lowest active customer-specific price', async () => {
    const res = await request(app)
      .post('/api/pricing/resolve')
      .set('Authorization', `Bearer ${adminAuth.token}`)
      .send({
        customer_id: customer.id,
        pricing_date: '2026-04-05',
        items: [{ product_id: product.id, quantity: 12 }]
      });

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].effective_price).toBe(78);
    expect(res.body.items[0].applied_rule).toMatchObject({
      type: 'customer',
      label: 'Preferred grower rate'
    });
  });

  test('should apply advanced pricing during sale creation', async () => {
    const res = await request(app)
      .post('/api/sales')
      .set('Authorization', `Bearer ${adminAuth.token}`)
      .send({
        items: [{ product_id: product.id, quantity: 12 }],
        customer_id: customer.id,
        customer_name: customer.name,
        customer_mobile: customer.mobile,
        customer_address: customer.address,
        payment_mode: 'cash'
      });

    expect(res.status).toBe(201);
    expect(res.body.totalAmount).toBe(936);
    expect(res.body.items[0].pricing_rule_type).toBe('customer');
    expect(res.body.items[0].pricing_rule_label).toBe('Preferred grower rate');
  });
});

describe('Public Pricing Pages', () => {
  test('should render a rich public quotation page', async () => {
    const quotationRes = await request(app)
      .post('/api/quotations')
      .set('Authorization', `Bearer ${adminAuth.token}`)
      .send({
        customer_id: customer.id,
        customer_name: customer.name,
        customer_mobile: customer.mobile,
        customer_address: customer.address,
        valid_until: '2026-04-20',
        items: [{ product_id: product.id, quantity: 12 }]
      });

    expect(quotationRes.status).toBe(201);

    const res = await request(app)
      .get(`/quotes/${quotationRes.body.quotation_number}`)
      .set('Accept', 'text/html');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.text).toContain(quotationRes.body.quotation_number);
    expect(res.text).toContain('Advanced Price Seeds');
    expect(res.text).toContain('Preferred grower rate');
  });

  test('should render a rich public receipt page', async () => {
    const receipt = await testDb.getRow('SELECT receipt_number FROM receipts ORDER BY id DESC LIMIT 1');

    const res = await request(app)
      .get(`/receipts/${receipt.receipt_number}`)
      .set('Accept', 'text/html');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.text).toContain(receipt.receipt_number);
    expect(res.text).toContain('Receipt Verification');
  });
});