const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');

/**
 * Creates a fresh in-memory SQLite database with the full schema.
 * Returns { db, getRow, runQuery, getAll, nowIST, close }
 */
function createTestDb() {
  const db = new sqlite3.Database(':memory:');

  // Promisified helpers
  const runQuery = (sql, params = []) =>
    new Promise((resolve, reject) => {
      db.run(sql, params, function (err) {
        if (err) return reject(err);
        resolve({ id: this.lastID, changes: this.changes });
      });
    });

  const getRow = (sql, params = []) =>
    new Promise((resolve, reject) => {
      db.get(sql, params, (err, row) => {
        if (err) return reject(err);
        resolve(row || null);
      });
    });

  const getAll = (sql, params = []) =>
    new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => {
        if (err) return reject(err);
        resolve(rows || []);
      });
    });

  const nowIST = () => {
    const d = new Date();
    return d.toLocaleString('sv-SE', { timeZone: 'Asia/Kolkata' }).replace(' ', 'T').slice(0, 19).replace('T', ' ');
  };

  const combineISTDateWithCurrentTime = (dateStr, fallbackTimestamp) => {
    if (!dateStr || dateStr.length !== 10) return fallbackTimestamp || nowIST();
    const timePart = (fallbackTimestamp || nowIST()).split(' ')[1] || '12:00:00';
    return `${dateStr} ${timePart}`;
  };

  const close = () =>
    new Promise((resolve, reject) => {
      db.close((err) => (err ? reject(err) : resolve()));
    });

  return { db, runQuery, getRow, getAll, nowIST, combineISTDateWithCurrentTime, close };
}

/**
 * Initializes all tables in the test database (synchronous, since in-memory).
 */
async function initializeTestSchema(testDb) {
  const { runQuery } = testDb;

  await runQuery(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'operator')),
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  await runQuery(`CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id TEXT UNIQUE NOT NULL,
    category TEXT NOT NULL,
    product_name TEXT NOT NULL,
    variety TEXT,
    quantity_available REAL NOT NULL DEFAULT 0,
    unit TEXT NOT NULL CHECK (unit IN ('kg', 'grams', 'packet', 'bag', 'liters', 'ml', 'pieces', 'bottles', 'tonnes')),
    purchase_price REAL NOT NULL DEFAULT 0,
    selling_price REAL NOT NULL DEFAULT 0,
    supplier TEXT,
    is_deleted INTEGER NOT NULL DEFAULT 0,
    date_added DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  await runQuery(`CREATE TABLE IF NOT EXISTS sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sale_id TEXT NOT NULL,
    product_id INTEGER NOT NULL,
    quantity_sold REAL NOT NULL,
    price_per_unit REAL NOT NULL,
    total_amount REAL NOT NULL,
    sale_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    operator_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products (id),
    FOREIGN KEY (operator_id) REFERENCES users (id)
  )`);

  await runQuery(`CREATE TABLE IF NOT EXISTS receipts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    receipt_number TEXT UNIQUE NOT NULL,
    sale_id TEXT NOT NULL,
    customer_name TEXT,
    customer_mobile TEXT,
    customer_address TEXT,
    payment_mode TEXT DEFAULT 'cash',
    total_amount REAL NOT NULL,
    receipt_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    printed BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  await runQuery(`CREATE TABLE IF NOT EXISTS customer_sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sale_id TEXT NOT NULL,
    receipt_id INTEGER,
    customer_name TEXT,
    customer_mobile TEXT,
    customer_address TEXT,
    product_name TEXT NOT NULL,
    quantity REAL NOT NULL,
    amount REAL NOT NULL DEFAULT 0,
    payment_mode TEXT DEFAULT 'cash',
    sale_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  await runQuery(`CREATE TABLE IF NOT EXISTS product_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  await runQuery(`INSERT OR IGNORE INTO product_categories (name) VALUES ('seeds')`);
  await runQuery(`INSERT OR IGNORE INTO product_categories (name) VALUES ('fertilizers')`);
  await runQuery(`INSERT OR IGNORE INTO product_categories (name) VALUES ('pesticides')`);
  await runQuery(`INSERT OR IGNORE INTO product_categories (name) VALUES ('tools')`);

  await runQuery(`CREATE TABLE IF NOT EXISTS purchases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    purchase_id TEXT UNIQUE NOT NULL,
    product_id INTEGER NOT NULL,
    quantity REAL NOT NULL,
    price_per_unit REAL NOT NULL,
    total_amount REAL NOT NULL,
    supplier TEXT,
    purchase_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    delivery_date DATETIME,
    purchase_status TEXT NOT NULL DEFAULT 'delivered',
    advance_amount REAL NOT NULL DEFAULT 0,
    advance_payment_id INTEGER,
    added_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products (id),
    FOREIGN KEY (added_by) REFERENCES users (id)
  )`);

  await runQuery(`CREATE TABLE IF NOT EXISTS bank_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_name TEXT NOT NULL,
    bank_name TEXT NOT NULL,
    account_number TEXT,
    balance REAL NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  await runQuery(`CREATE TABLE IF NOT EXISTS daily_operation_setup (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    business_date DATE NOT NULL UNIQUE,
    selected_bank_account_id INTEGER,
    bank_selected_by INTEGER,
    bank_selected_at DATETIME,
    opening_balance_snapshot REAL,
    closing_balance_snapshot REAL,
    balance_reviewed_by INTEGER,
    balance_reviewed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (selected_bank_account_id) REFERENCES bank_accounts (id),
    FOREIGN KEY (bank_selected_by) REFERENCES users (id),
    FOREIGN KEY (balance_reviewed_by) REFERENCES users (id)
  )`);

  await runQuery(`CREATE TABLE IF NOT EXISTS expenditures (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    amount REAL NOT NULL,
    description TEXT NOT NULL,
    category TEXT DEFAULT 'general',
    expense_date DATE NOT NULL,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users (id)
  )`);

  await runQuery(`CREATE TABLE IF NOT EXISTS bank_transfers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bank_account_id INTEGER NOT NULL,
    amount REAL NOT NULL,
    transfer_type TEXT NOT NULL CHECK (transfer_type IN ('deposit', 'withdrawal')),
    source_type TEXT,
    source_reference TEXT,
    payment_mode TEXT,
    description TEXT,
    transfer_date DATE NOT NULL,
    withdrawal_purpose TEXT,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (bank_account_id) REFERENCES bank_accounts (id),
    FOREIGN KEY (created_by) REFERENCES users (id)
  )`);

  await runQuery(`CREATE TABLE IF NOT EXISTS supplier_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier_name TEXT NOT NULL,
    amount REAL NOT NULL,
    payment_mode TEXT NOT NULL DEFAULT 'bank' CHECK (payment_mode IN ('cash', 'bank', 'upi')),
    bank_account_id INTEGER,
    description TEXT,
    payment_date DATE NOT NULL,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (bank_account_id) REFERENCES bank_accounts (id),
    FOREIGN KEY (created_by) REFERENCES users (id)
  )`);

  await runQuery(`CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_activity DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id)
  )`);

  await runQuery(`CREATE TABLE IF NOT EXISTS login_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    username TEXT NOT NULL,
    role TEXT NOT NULL,
    ip TEXT,
    user_agent TEXT,
    logged_in_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id)
  )`);
}

/**
 * Seeds initial test data: admin and operator users.
 */
async function seedTestUsers(testDb) {
  const { runQuery } = testDb;

  const adminPassword = bcrypt.hashSync('admin123', 10);
  await runQuery(
    `INSERT OR IGNORE INTO users (username, password, role, is_active) VALUES (?, ?, 'admin', 1)`,
    ['admin', adminPassword]
  );

  const operatorPassword = bcrypt.hashSync('operator123', 10);
  await runQuery(
    `INSERT OR IGNORE INTO users (username, password, role, is_active) VALUES (?, ?, 'operator', 1)`,
    ['operator', operatorPassword]
  );
}

module.exports = {
  createTestDb,
  initializeTestSchema,
  seedTestUsers
};
