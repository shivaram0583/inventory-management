const request = require('supertest');
const { createTestDb, initializeTestSchema, seedTestUsers } = require('./setup/testDb');
const { createTestApp, loginUser, createTestBankAccount, completeDailySetup, createTestProduct } = require('./setup/testHelpers');

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
  bankAccount = await createTestBankAccount(testDb, { balance: 75000 });
  await completeDailySetup(testDb, bankAccount.id, adminAuth.user.id);
});

afterAll(async () => {
  await testDb.close();
});

describe('Supplier Directory Sync', () => {
  test('should backfill missing suppliers from existing references', async () => {
    await createTestProduct(testDb, {
      product_id: 'SUP_BACK001',
      product_name: 'Backfill Product',
      supplier: 'Backfill Supplier'
    });

    const res = await request(app)
      .get('/api/suppliers')
      .set('Authorization', `Bearer ${adminAuth.token}`);

    expect(res.status).toBe(200);
    expect(res.body.some((supplier) => supplier.name === 'Backfill Supplier')).toBe(true);

    const supplierRecord = await testDb.getRow('SELECT name FROM suppliers WHERE LOWER(name) = LOWER(?)', ['Backfill Supplier']);
    expect(supplierRecord?.name).toBe('Backfill Supplier');
  });

  test('should create supplier directory entries from manual supplier payments', async () => {
    const res = await request(app)
      .post('/api/transactions/supplier-payments')
      .set('Authorization', `Bearer ${adminAuth.token}`)
      .send({
        supplier_name: 'Ledger Sync Supplier',
        amount: 1500,
        payment_mode: 'bank',
        bank_account_id: bankAccount.id,
        payment_date: '2026-04-04'
      });

    expect(res.status).toBe(201);

    const supplierRecord = await testDb.getRow('SELECT name FROM suppliers WHERE LOWER(name) = LOWER(?)', ['Ledger Sync Supplier']);
    expect(supplierRecord?.name).toBe('Ledger Sync Supplier');
  });

  test('should cascade supplier renames to purchases, products, supplier payments, and transaction descriptions', async () => {
    const eventTimestamp = testDb.nowIST();
    const supplierInsert = await testDb.runQuery(
      `INSERT INTO suppliers (name, created_at, updated_at)
       VALUES ('Old Supplier', ?, ?)`,
      [eventTimestamp, eventTimestamp]
    );

    const product = await createTestProduct(testDb, {
      product_id: 'SUP_RENAME001',
      product_name: 'Rename Product',
      supplier: 'Old Supplier'
    });

    await testDb.runQuery(
      `INSERT INTO purchases (purchase_id, product_id, quantity, price_per_unit, total_amount, supplier, purchase_status, created_at, updated_at)
       VALUES ('SUPPUR001', ?, 10, 50, 500, 'Old Supplier', 'delivered', ?, ?)`,
      [product.id, eventTimestamp, eventTimestamp]
    );

    const supplierPayment = await testDb.runQuery(
      `INSERT INTO supplier_payments (supplier_name, amount, payment_mode, bank_account_id, description, payment_date, created_by, created_at)
       VALUES ('Old Supplier', 500, 'bank', ?, 'Supplier payment to Old Supplier', '2026-04-04', ?, ?)`,
      [bankAccount.id, adminAuth.user.id, eventTimestamp]
    );

    await testDb.runQuery(
      `INSERT INTO bank_transfers (bank_account_id, amount, transfer_type, source_type, source_reference, payment_mode, description, transfer_date, created_by, created_at, withdrawal_purpose)
       VALUES (?, 500, 'withdrawal', 'supplier_payment', ?, 'bank', 'Supplier payment to Old Supplier', '2026-04-04', ?, ?, 'supplier_payment')`,
      [bankAccount.id, `supplier-payment:${supplierPayment.id}`, adminAuth.user.id, eventTimestamp]
    );

    const res = await request(app)
      .put(`/api/suppliers/${supplierInsert.id}`)
      .set('Authorization', `Bearer ${adminAuth.token}`)
      .send({
        name: 'New Supplier',
        contact_person: 'Updated Contact'
      });

    expect(res.status).toBe(200);

    const updatedPurchase = await testDb.getRow('SELECT supplier FROM purchases WHERE purchase_id = ?', ['SUPPUR001']);
    expect(updatedPurchase.supplier).toBe('New Supplier');

    const updatedProduct = await testDb.getRow('SELECT supplier FROM products WHERE id = ?', [product.id]);
    expect(updatedProduct.supplier).toBe('New Supplier');

    const updatedPayment = await testDb.getRow('SELECT supplier_name FROM supplier_payments WHERE id = ?', [supplierPayment.id]);
    expect(updatedPayment.supplier_name).toBe('New Supplier');

    const updatedTransfer = await testDb.getRow(
      `SELECT description FROM bank_transfers WHERE source_reference = ?`,
      [`supplier-payment:${supplierPayment.id}`]
    );
    expect(updatedTransfer.description).toBe('Supplier payment to New Supplier');
  });
});