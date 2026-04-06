const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const TEST_JWT_SECRET = 'test-jwt-secret-for-testing-only';

/**
 * Creates a fully configured Express app wired to the test database.
 * Overrides the database module so all routes use the in-memory DB.
 */
function createTestApp(testDb) {
  // Override the database module before requiring routes
  const dbModule = require('../../database/db');
  Object.assign(dbModule, {
    getRow: testDb.getRow,
    runQuery: testDb.runQuery,
    getAll: testDb.getAll,
    nowIST: testDb.nowIST,
    combineISTDateWithCurrentTime: testDb.combineISTDateWithCurrentTime,
    runTransaction: testDb.runTransaction,
    paginate: testDb.paginate
  });

  // Set JWT secret for test environment
  process.env.JWT_SECRET = TEST_JWT_SECRET;

  const app = express();
  app.use(express.json());

  // Mount routes
  const authRoutes = require('../../routes/auth');
  const inventoryRoutes = require('../../routes/inventory');
  const salesRoutes = require('../../routes/sales');
  const purchasesRoutes = require('../../routes/purchases');
  const transactionsRoutes = require('../../routes/transactions');
  const dashboardRoutes = require('../../routes/dashboard');
  const reportsRoutes = require('../../routes/reports');
  const notificationsRoutes = require('../../routes/notifications');
  const customersRoutes = require('../../routes/customers');
  const returnsRoutes = require('../../routes/returns');
  const quotationsRoutes = require('../../routes/quotations');
  const pricingRoutes = require('../../routes/pricing');
  const publicPagesRoutes = require('../../routes/publicPages');

  app.use('/api/auth', authRoutes);
  app.use('/api/inventory', inventoryRoutes);
  app.use('/api/sales', salesRoutes);
  app.use('/api/purchases', purchasesRoutes);
  app.use('/api/transactions', transactionsRoutes);
  app.use('/api/dashboard', dashboardRoutes);
  app.use('/api/reports', reportsRoutes);
  app.use('/api/notifications', notificationsRoutes);
  app.use('/api/customers', customersRoutes);
  app.use('/api/returns', returnsRoutes);
  app.use('/api/quotations', quotationsRoutes);
  app.use('/api/pricing', pricingRoutes);
  app.use('/', publicPagesRoutes);

  return app;
}

/**
 * Generates a valid JWT token and session for the given user.
 */
async function loginUser(testDb, username, password) {
  const bcrypt = require('bcryptjs');

  const user = await testDb.getRow('SELECT * FROM users WHERE username = ?', [username]);
  if (!user) throw new Error(`User '${username}' not found in test DB`);

  const sessionId = crypto.randomUUID();
  await testDb.runQuery(
    'INSERT INTO sessions (id, user_id, last_activity) VALUES (?, ?, CURRENT_TIMESTAMP)',
    [sessionId, user.id]
  );

  const token = jwt.sign(
    { userId: user.id, username: user.username, role: user.role, sessionId },
    TEST_JWT_SECRET,
    { expiresIn: '24h' }
  );

  return { token, user: { id: user.id, username: user.username, role: user.role }, sessionId };
}

/**
 * Creates a product directly in the test database.
 */
async function createTestProduct(testDb, overrides = {}) {
  const defaults = {
    product_id: 'SEED' + String(Math.floor(Math.random() * 9000) + 1000),
    category: 'seeds',
    product_name: 'Test Seeds',
    variety: 'Hybrid',
    quantity_available: 100,
    unit: 'kg',
    purchase_price: 50,
    selling_price: 80,
    supplier: 'Test Supplier'
  };

  const product = { ...defaults, ...overrides };

  const result = await testDb.runQuery(
    `INSERT INTO products (product_id, category, product_name, variety, quantity_available, unit, purchase_price, selling_price, supplier)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [product.product_id, product.category, product.product_name, product.variety,
      product.quantity_available, product.unit, product.purchase_price,
      product.selling_price, product.supplier]
  );

  return testDb.getRow('SELECT * FROM products WHERE id = ?', [result.id]);
}

/**
 * Creates a bank account directly in the test database.
 */
async function createTestBankAccount(testDb, overrides = {}) {
  const defaults = {
    account_name: 'Test Account',
    bank_name: 'Test Bank',
    account_number: '1234567890',
    balance: 10000
  };

  const account = { ...defaults, ...overrides };

  const result = await testDb.runQuery(
    `INSERT INTO bank_accounts (account_name, bank_name, account_number, balance)
     VALUES (?, ?, ?, ?)`,
    [account.account_name, account.bank_name, account.account_number, account.balance]
  );

  return testDb.getRow('SELECT * FROM bank_accounts WHERE id = ?', [result.id]);
}

/**
 * Completes the daily setup so operators can perform operations.
 */
async function completeDailySetup(testDb, bankAccountId, adminUserId) {
  const moment = require('moment');
  const todayBusinessDate = moment().utcOffset('+05:30').format('YYYY-MM-DD');
  const now = testDb.nowIST();

  await testDb.runQuery(
    `INSERT OR REPLACE INTO daily_operation_setup
     (business_date, selected_bank_account_id, bank_selected_by, bank_selected_at,
      balance_reviewed_by, balance_reviewed_at, opening_balance_snapshot, closing_balance_snapshot)
     VALUES (?, ?, ?, ?, ?, ?, 0, 0)`,
    [todayBusinessDate, bankAccountId, adminUserId, now, adminUserId, now]
  );
}

module.exports = {
  createTestApp,
  loginUser,
  createTestProduct,
  createTestBankAccount,
  completeDailySetup,
  TEST_JWT_SECRET
};
