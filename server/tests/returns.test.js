const request = require('supertest');
const { createTestDb, initializeTestSchema, seedTestUsers } = require('./setup/testDb');
const { createTestApp, loginUser, createTestProduct, completeDailySetup, createTestBankAccount } = require('./setup/testHelpers');

let testDb;
let app;
let adminAuth;
let testProduct;

beforeAll(async () => {
  testDb = createTestDb();
  await initializeTestSchema(testDb);
  await seedTestUsers(testDb);
  app = createTestApp(testDb);
  adminAuth = await loginUser(testDb, 'admin', 'admin123');

  const bankAccount = await createTestBankAccount(testDb, { balance: 25000 });
  await completeDailySetup(testDb, bankAccount.id, adminAuth.user.id);

  testProduct = await createTestProduct(testDb, {
    product_id: 'RET_TEST_001',
    product_name: 'Return Test Product',
    quantity_available: 100,
    selling_price: 100
  });

  await testDb.runQuery(
    `INSERT INTO sales (sale_id, product_id, quantity_sold, price_per_unit, total_amount, sale_date, operator_id)
     VALUES ('SALE_RET_001', ?, 5, 100, 500, CURRENT_TIMESTAMP, ?)` ,
    [testProduct.id, adminAuth.user.id]
  );

  await testDb.runQuery(
    `INSERT INTO receipts (receipt_number, sale_id, customer_name, customer_mobile, customer_address, payment_mode, total_amount, receipt_date)
     VALUES ('R-RET-001', 'SALE_RET_001', 'Return Customer', '9000000009', 'Return Street', 'cash', 500, CURRENT_TIMESTAMP)`
  );

  await testDb.runQuery(
    `INSERT INTO sales_returns (return_id, sale_id, product_id, quantity_returned, price_per_unit, refund_amount, refund_mode, reason, returned_by, return_date, created_at)
     VALUES ('RET-CASE-001', 'SALE_RET_001', ?, 2, 100, 200, 'cash', 'Damaged pack', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)` ,
    [testProduct.id, adminAuth.user.id]
  );
});

afterAll(async () => {
  await testDb.close();
});

describe('Returns Flow', () => {
  test('should list returns with linked customer and receipt info', async () => {
    const res = await request(app)
      .get('/api/returns')
      .set('Authorization', `Bearer ${adminAuth.token}`);

    expect(res.status).toBe(200);
    const trackedReturn = res.body.data.find((entry) => entry.return_id === 'RET-CASE-001');
    expect(trackedReturn).toBeDefined();
    expect(trackedReturn.customer_name).toBe('Return Customer');
    expect(trackedReturn.receipt_number).toBe('R-RET-001');
  });

  test('should return enriched detail payload for a return id', async () => {
    const res = await request(app)
      .get('/api/returns/RET-CASE-001')
      .set('Authorization', `Bearer ${adminAuth.token}`);

    expect(res.status).toBe(200);
    expect(res.body.return_id).toBe('RET-CASE-001');
    expect(res.body.sale_id).toBe('SALE_RET_001');
    expect(res.body.customer_name).toBe('Return Customer');
    expect(res.body.total_refund).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.items[0].product_name).toBe('Return Test Product');
  });

  test('should record bank refunds as customer_refund withdrawals only', async () => {
    const bankAccount = await createTestBankAccount(testDb, {
      account_name: 'Refund Bank',
      bank_name: 'Refund Ledger Bank',
      balance: 12000
    });

    const res = await request(app)
      .post('/api/returns')
      .set('Authorization', `Bearer ${adminAuth.token}`)
      .send({
        sale_id: 'SALE_RET_001',
        refund_mode: 'bank',
        bank_account_id: bankAccount.id,
        reason: 'Customer requested bank reversal',
        items: [
          {
            product_id: testProduct.id,
            quantity: 1
          }
        ]
      });

    expect(res.status).toBe(201);

    const transfer = await testDb.getRow(
      "SELECT * FROM bank_transfers WHERE source_type = 'sales_return' AND source_reference = ?",
      [`return:${res.body.return_id}`]
    );

    expect(transfer).toBeDefined();
    expect(transfer.transfer_type).toBe('withdrawal');
    expect(transfer.withdrawal_purpose).toBe('customer_refund');
  });
});