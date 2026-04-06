const request = require('supertest');
const { createTestDb, initializeTestSchema, seedTestUsers } = require('./setup/testDb');
const { createTestApp, loginUser, createTestProduct, createTestBankAccount, completeDailySetup } = require('./setup/testHelpers');

let testDb;
let app;
let adminAuth;
let bankAccount;

beforeAll(async () => {
  testDb = createTestDb();
  await initializeTestSchema(testDb);
  await seedTestUsers(testDb);
  app = createTestApp(testDb);
  adminAuth = await loginUser(testDb, 'admin', 'admin123');
  bankAccount = await createTestBankAccount(testDb);
  await completeDailySetup(testDb, bankAccount.id, adminAuth.user.id);
});

afterAll(async () => {
  await testDb.close();
});

describe('Stock Adjustments', () => {
  test('damage adjustment should reduce inventory and store a negative quantity', async () => {
    const product = await createTestProduct(testDb, {
      product_id: 'ADJDMG001',
      quantity_available: 50
    });

    const res = await request(app)
      .post('/api/stock-adjustments')
      .set('Authorization', `Bearer ${adminAuth.token}`)
      .send({
        product_id: product.id,
        adjustment_type: 'damage',
        quantity_adjusted: 5,
        reason: 'Packets damaged during handling'
      });

    expect(res.status).toBe(201);
    expect(res.body.quantity_adjusted).toBe(-5);

    const updatedProduct = await testDb.getRow('SELECT quantity_available FROM products WHERE id = ?', [product.id]);
    expect(updatedProduct.quantity_available).toBe(45);
  });

  test('counting error should allow negative corrections when stock is lower than expected', async () => {
    const product = await createTestProduct(testDb, {
      product_id: 'ADJCOUNT001',
      quantity_available: 50
    });

    const res = await request(app)
      .post('/api/stock-adjustments')
      .set('Authorization', `Bearer ${adminAuth.token}`)
      .send({
        product_id: product.id,
        adjustment_type: 'counting_error',
        quantity_adjusted: -3,
        reason: 'Physical count found fewer units'
      });

    expect(res.status).toBe(201);
    expect(res.body.quantity_adjusted).toBe(-3);

    const updatedProduct = await testDb.getRow('SELECT quantity_available FROM products WHERE id = ?', [product.id]);
    expect(updatedProduct.quantity_available).toBe(47);
  });
});