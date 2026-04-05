const request = require('supertest');
const { createTestDb, initializeTestSchema, seedTestUsers } = require('./setup/testDb');
const { createTestApp, loginUser, createTestBankAccount } = require('./setup/testHelpers');

let testDb, app;

beforeAll(async () => {
  testDb = createTestDb();
  await initializeTestSchema(testDb);
  await seedTestUsers(testDb);
  app = createTestApp(testDb);
});

afterAll(async () => {
  await testDb.close();
});

describe('E2E: Complete Sales Workflow', () => {
  let adminToken, operatorToken, bankAccountId, productId;

  test('Step 1: Admin logs in', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'admin123' });

    expect(res.status).toBe(200);
    adminToken = res.body.token;
    expect(adminToken).toBeDefined();
  });

  test('Step 2: Admin creates bank account', async () => {
    const res = await request(app)
      .post('/api/transactions/bank-accounts')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        account_name: 'Main Account',
        bank_name: 'SBI',
        account_number: '1234567890',
        balance: 100000
      });

    expect(res.status).toBe(201);
    bankAccountId = res.body.id;
  });

  test('Step 3: Admin selects bank for today', async () => {
    const res = await request(app)
      .post('/api/transactions/daily-setup/select-bank')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ bank_account_id: bankAccountId });

    expect(res.status).toBe(200);
    expect(res.body.dailySetupStatus.bankSelectionCompleted).toBe(true);
  });

  test('Step 4: Admin reviews daily balance', async () => {
    const res = await request(app)
      .post('/api/transactions/daily-setup/review-balance')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
  });

  test('Step 5: Admin creates inventory product', async () => {
    const res = await request(app)
      .post('/api/inventory')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        product_name: 'Premium Groundnut Seeds',
        category: 'seeds',
        unit: 'kg',
        quantity_available: 500,
        purchase_price: 80,
        selling_price: 120,
        supplier: 'Groundnut Farm Co',
        creation_mode: 'inventory'
      });

    expect(res.status).toBe(201);
    productId = res.body.id;
    expect(res.body.quantity_available).toBe(500);
  });

  test('Step 6: Operator logs in', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'operator', password: 'operator123' });

    expect(res.status).toBe(200);
    operatorToken = res.body.token;
  });

  test('Step 7: Operator creates cash sale', async () => {
    const res = await request(app)
      .post('/api/sales')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        items: [{ product_id: productId, quantity: 10 }],
        customer_name: 'Farmer Raju',
        customer_mobile: '9876543210',
        customer_address: 'Village Road, Tamil Nadu',
        payment_mode: 'cash'
      });

    expect(res.status).toBe(201);
    expect(res.body.totalAmount).toBe(1200); // 10 * 120
    expect(res.body.receiptNumber).toMatch(/^R-/);
  });

  test('Step 8: Stock decreased correctly', async () => {
    const res = await request(app)
      .get(`/api/inventory/${productId}`)
      .set('Authorization', `Bearer ${operatorToken}`);

    expect(res.status).toBe(200);
    expect(res.body.quantity_available).toBe(490); // 500 - 10
  });

  test('Step 9: Operator creates UPI sale (auto-deposits to bank)', async () => {
    const initialBalance = (await testDb.getRow('SELECT balance FROM bank_accounts WHERE id = ?', [bankAccountId])).balance;

    const res = await request(app)
      .post('/api/sales')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        items: [{ product_id: productId, quantity: 5 }],
        customer_name: 'Farmer Kumar',
        payment_mode: 'upi'
      });

    expect(res.status).toBe(201);
    expect(res.body.totalAmount).toBe(600); // 5 * 120

    // Verify bank balance increased
    const newBalance = (await testDb.getRow('SELECT balance FROM bank_accounts WHERE id = ?', [bankAccountId])).balance;
    expect(newBalance).toBe(initialBalance + 600);
  });

  test('Step 10: Admin views sale details', async () => {
    const sales = await testDb.getAll('SELECT DISTINCT sale_id FROM sales');
    const firstSaleId = sales[0].sale_id;

    const res = await request(app)
      .get(`/api/sales/${firstSaleId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toBeDefined();
    expect(res.body.receipt).toBeDefined();
  });

  test('Step 11: Admin views dashboard with today\'s data', async () => {
    const res = await request(app)
      .get('/api/dashboard/admin')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.summary.today_sales.transactions).toBeGreaterThan(0);
    expect(res.body.summary.today_sales.revenue).toBeGreaterThan(0);
  });

  test('Step 12: Admin views daily summary', async () => {
    const moment = require('moment');
    const today = moment().utcOffset('+05:30').format('YYYY-MM-DD');

    const res = await request(app)
      .get(`/api/transactions/daily-summary?start_date=${today}&end_date=${today}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
  });
});

describe('E2E: Complete Purchase Lifecycle', () => {
  let adminToken, bankAccountId, productId, purchaseId;

  test('Step 1: Admin logs in and sets up', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'admin123' });
    adminToken = loginRes.body.token;

    // Create bank account
    const bankRes = await request(app)
      .post('/api/transactions/bank-accounts')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        account_name: 'Purchase Workflow Account',
        bank_name: 'ICICI',
        balance: 200000
      });
    bankAccountId = bankRes.body.id;
  });

  test('Step 2: Admin creates product with order + advance', async () => {
    const res = await request(app)
      .post('/api/inventory')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        product_name: 'Urea Fertilizer',
        category: 'fertilizers',
        unit: 'bag',
        quantity_available: 0,
        purchase_price: 500,
        selling_price: 700,
        supplier: 'ChemFert Ltd',
        creation_mode: 'order',
        order_quantity: 100,
        advance_amount: 10000,
        bank_account_id: bankAccountId
      });

    expect(res.status).toBe(201);
    productId = res.body.id;
    expect(res.body.quantity_available).toBe(0); // No stock yet
    expect(res.body.created_purchase.purchase_status).toBe('ordered');

    // Get the purchase ID
    const purchase = await testDb.getRow(
      'SELECT id FROM purchases WHERE product_id = ? AND purchase_status = ?',
      [productId, 'ordered']
    );
    purchaseId = purchase.id;
  });

  test('Step 3: Bank balance reduced by advance', async () => {
    const account = await testDb.getRow('SELECT balance FROM bank_accounts WHERE id = ?', [bankAccountId]);
    expect(account.balance).toBe(190000); // 200000 - 10000
  });

  test('Step 4: Product shows zero stock', async () => {
    const res = await request(app)
      .get(`/api/inventory/${productId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.body.quantity_available).toBe(0);
  });

  test('Step 5: Admin marks purchase as delivered', async () => {
    const res = await request(app)
      .post(`/api/purchases/${purchaseId}/mark-delivered`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ delivery_date: '2026-04-04' });

    expect(res.status).toBe(200);
    expect(res.body.purchase_status).toBe('delivered');
  });

  test('Step 6: Stock updated after delivery', async () => {
    const res = await request(app)
      .get(`/api/inventory/${productId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.body.quantity_available).toBe(100);
  });

  test('Step 7: Record additional purchase (direct delivery)', async () => {
    const res = await request(app)
      .post('/api/purchases')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        product_id: productId,
        quantity: 50,
        price_per_unit: 480,
        supplier: 'ChemFert Ltd',
        purchase_date: '2026-04-04',
        purchase_status: 'delivered'
      });

    expect(res.status).toBe(201);

    const product = await testDb.getRow('SELECT quantity_available FROM products WHERE id = ?', [productId]);
    expect(product.quantity_available).toBe(150); // 100 + 50
  });

  test('Step 8: View purchase history', async () => {
    const res = await request(app)
      .get(`/api/purchases?product_id=${productId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(2);
  });
});

describe('E2E: Financial Workflow', () => {
  let adminToken, bankAccountId;

  test('Step 1: Setup', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'admin123' });
    adminToken = loginRes.body.token;

    const bankRes = await request(app)
      .post('/api/transactions/bank-accounts')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        account_name: 'Financial Flow Account',
        bank_name: 'HDFC',
        balance: 50000
      });
    bankAccountId = bankRes.body.id;
  });

  test('Step 2: Record expenditure', async () => {
    const res = await request(app)
      .post('/api/transactions/expenditures')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        amount: 5000,
        description: 'Store rent payment',
        expense_date: '2026-04-04',
        category: 'rent'
      });

    expect(res.status).toBe(201);
  });

  test('Step 3: Make supplier payment via bank', async () => {
    const res = await request(app)
      .post('/api/transactions/supplier-payments')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        supplier_name: 'Seed Supplier Co',
        amount: 15000,
        payment_mode: 'bank',
        bank_account_id: bankAccountId,
        payment_date: '2026-04-04',
        description: 'Monthly payment'
      });

    expect(res.status).toBe(201);

    // Verify bank balance
    const account = await testDb.getRow('SELECT balance FROM bank_accounts WHERE id = ?', [bankAccountId]);
    expect(account.balance).toBe(35000); // 50000 - 15000
  });

  test('Step 4: Deposit cash to bank', async () => {
    const res = await request(app)
      .post('/api/transactions/bank-transfers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        bank_account_id: bankAccountId,
        amount: 20000,
        transfer_type: 'deposit',
        transfer_date: '2026-04-04',
        description: 'Cash deposit from sales'
      });

    expect(res.status).toBe(201);

    const account = await testDb.getRow('SELECT balance FROM bank_accounts WHERE id = ?', [bankAccountId]);
    expect(account.balance).toBe(55000); // 35000 + 20000
  });

  test('Step 5: View bank statement', async () => {
    const res = await request(app)
      .get(`/api/transactions/bank-accounts/${bankAccountId}/statement?start_date=2026-04-01&end_date=2026-04-30`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.transactions.length).toBeGreaterThanOrEqual(2);
    expect(res.body.closing_balance).toBeDefined();
  });

  test('Step 6: Check supplier balances', async () => {
    const res = await request(app)
      .get('/api/transactions/supplier-balances')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const seedSupplier = res.body.find(s => s.supplier_name === 'Seed Supplier Co');
    if (seedSupplier) {
      expect(seedSupplier.total_paid).toBe(15000);
    }
  });
});

describe('E2E: User Management & Access Control', () => {
  let adminToken, newOperatorToken;

  test('Step 1: Admin creates operator', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'admin123' });
    adminToken = loginRes.body.token;

    const res = await request(app)
      .post('/api/auth/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ username: 'newop', password: 'newop123', role: 'operator' });

    expect(res.status).toBe(201);
  });

  test('Step 2: New operator logs in', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'newop', password: 'newop123' });

    expect(res.status).toBe(200);
    newOperatorToken = res.body.token;
  });

  test('Step 3: Operator cannot access admin-only routes', async () => {
    const adminOnlyEndpoints = [
      { method: 'get', path: '/api/auth/users' },
      { method: 'get', path: '/api/dashboard/admin' },
      { method: 'get', path: '/api/notifications' },
      { method: 'get', path: '/api/auth/login-logs' }
    ];

    for (const ep of adminOnlyEndpoints) {
      const res = await request(app)[ep.method](ep.path)
        .set('Authorization', `Bearer ${newOperatorToken}`);

      expect(res.status).toBe(403);
    }
  });

  test('Step 4: Admin deactivates operator', async () => {
    const user = await testDb.getRow("SELECT id FROM users WHERE username = 'newop'");

    const res = await request(app)
      .put(`/api/auth/users/${user.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ is_active: 0 });

    expect(res.status).toBe(200);
  });

  test('Step 5: Deactivated operator cannot login', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'newop', password: 'newop123' });

    expect(res.status).toBe(403);
  });
});
