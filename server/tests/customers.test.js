const request = require('supertest');
const { createTestDb, initializeTestSchema, seedTestUsers } = require('./setup/testDb');
const { createTestApp, loginUser } = require('./setup/testHelpers');

let testDb;
let app;
let adminAuth;

beforeAll(async () => {
  testDb = createTestDb();
  await initializeTestSchema(testDb);
  await seedTestUsers(testDb);
  app = createTestApp(testDb);
  adminAuth = await loginUser(testDb, 'admin', 'admin123');
});

afterAll(async () => {
  await testDb.close();
});

describe('Customer Management Routes', () => {
  test('should look up a customer by mobile number', async () => {
    const customer = await testDb.runQuery(
      `INSERT INTO customers (name, mobile, address, credit_limit, outstanding_balance, is_active)
       VALUES ('Lookup Customer', '9876543210', 'Village Road', 5000, 1200, 1)`
    );

    const res = await request(app)
      .get('/api/customers/lookup/by-mobile?mobile=9876543210')
      .set('Authorization', `Bearer ${adminAuth.token}`);

    expect(res.status).toBe(200);
    expect(res.body).toBeTruthy();
    expect(res.body.id).toBe(customer.id);
    expect(res.body.name).toBe('Lookup Customer');
  });

  test('should return aging report without being shadowed by /:id', async () => {
    const customer = await testDb.runQuery(
      `INSERT INTO customers (name, mobile, address, credit_limit, outstanding_balance, is_active)
       VALUES ('Aging Customer', '9000000000', 'Farm Gate', 10000, 2500, 1)`
    );

    await testDb.runQuery(
      `INSERT INTO receipts (
         receipt_number, sale_id, customer_name, customer_mobile, customer_address,
         payment_mode, total_amount, payment_status, customer_id, receipt_date
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ['R-AGING-001', 'SALEAGING001', 'Aging Customer', '9000000000', 'Farm Gate', 'credit', 2500, 'credit', customer.id, '2026-01-01 10:00:00']
    );

    const res = await request(app)
      .get('/api/customers/reports/aging')
      .set('Authorization', `Bearer ${adminAuth.token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.some((entry) => entry.id === customer.id)).toBe(true);
  });
});