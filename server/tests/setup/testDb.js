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

  const runTransaction = (callback) =>
    new Promise((resolve, reject) => {
      db.run('BEGIN TRANSACTION', async (beginError) => {
        if (beginError) {
          reject(beginError);
          return;
        }

        try {
          const result = await callback({ runQuery, getRow, getAll });
          db.run('COMMIT', (commitError) => {
            if (commitError) {
              reject(commitError);
              return;
            }

            resolve(result);
          });
        } catch (error) {
          db.run('ROLLBACK', () => reject(error));
        }
      });
    });

  const paginate = async (sql, params = [], page = 1, limit = 50) => {
    const safePage = Math.max(Number(page) || 1, 1);
    const safeLimit = Math.max(Number(limit) || 50, 1);
    const offset = (safePage - 1) * safeLimit;

    const totalRow = await getRow(
      `SELECT COUNT(*) AS total FROM (${sql}) AS paginated_rows`,
      params
    );

    const data = await getAll(`${sql} LIMIT ? OFFSET ?`, [...params, safeLimit, offset]);
    const total = Number(totalRow?.total || 0);

    return {
      data,
      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages: Math.max(Math.ceil(total / safeLimit), 1)
      }
    };
  };

  return { db, runQuery, getRow, getAll, nowIST, combineISTDateWithCurrentTime, runTransaction, paginate, close };
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
    force_password_change INTEGER NOT NULL DEFAULT 0 CHECK (force_password_change IN (0, 1)),
    password_changed_at DATETIME,
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
    gst_percent REAL NOT NULL DEFAULT 0,
    hsn_code TEXT,
    reorder_point REAL NOT NULL DEFAULT 10,
    reorder_quantity REAL NOT NULL DEFAULT 0,
    barcode TEXT,
    expiry_date DATE,
    batch_number TEXT,
    manufacturing_date DATE,
    supplier_id INTEGER,
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
    discount_amount REAL NOT NULL DEFAULT 0,
    tax_amount REAL NOT NULL DEFAULT 0,
    gst_percent REAL NOT NULL DEFAULT 0,
    pricing_rule_type TEXT,
    pricing_rule_label TEXT,
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
    payment_gateway TEXT,
    payment_reference TEXT,
    gateway_order_id TEXT,
    total_amount REAL NOT NULL,
    discount_amount REAL NOT NULL DEFAULT 0,
    tax_amount REAL NOT NULL DEFAULT 0,
    payment_status TEXT DEFAULT 'paid',
    customer_id INTEGER,
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
    quantity_delivered REAL NOT NULL DEFAULT 0,
    added_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME,
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

  await runQuery(`CREATE TABLE IF NOT EXISTS suppliers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    contact_person TEXT,
    mobile TEXT,
    email TEXT,
    address TEXT,
    gstin TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  await runQuery(`CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    mobile TEXT,
    email TEXT,
    address TEXT,
    gstin TEXT,
    credit_limit REAL NOT NULL DEFAULT 0,
    outstanding_balance REAL NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  await runQuery(`CREATE TABLE IF NOT EXISTS customer_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL,
    amount REAL NOT NULL,
    payment_mode TEXT NOT NULL DEFAULT 'cash' CHECK (payment_mode IN ('cash', 'bank', 'upi')),
    bank_account_id INTEGER,
    reference_note TEXT,
    payment_date DATETIME NOT NULL,
    collected_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers (id),
    FOREIGN KEY (bank_account_id) REFERENCES bank_accounts (id),
    FOREIGN KEY (collected_by) REFERENCES users (id)
  )`);

  await runQuery(`CREATE TABLE IF NOT EXISTS sales_returns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    return_id TEXT UNIQUE NOT NULL,
    sale_id TEXT NOT NULL,
    product_id INTEGER NOT NULL,
    quantity_returned REAL NOT NULL,
    price_per_unit REAL NOT NULL,
    refund_amount REAL NOT NULL,
    refund_mode TEXT NOT NULL DEFAULT 'cash' CHECK (refund_mode IN ('cash', 'credit', 'bank')),
    bank_account_id INTEGER,
    reason TEXT,
    returned_by INTEGER,
    return_date DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products (id),
    FOREIGN KEY (bank_account_id) REFERENCES bank_accounts (id),
    FOREIGN KEY (returned_by) REFERENCES users (id)
  )`);

  await runQuery(`CREATE TABLE IF NOT EXISTS quotations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    quotation_number TEXT UNIQUE NOT NULL,
    customer_id INTEGER,
    customer_name TEXT,
    customer_mobile TEXT,
    customer_address TEXT,
    total_amount REAL NOT NULL DEFAULT 0,
    discount_amount REAL NOT NULL DEFAULT 0,
    tax_amount REAL NOT NULL DEFAULT 0,
    net_amount REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'accepted', 'rejected', 'converted', 'expired')),
    valid_until DATE,
    notes TEXT,
    converted_sale_id TEXT,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers (id),
    FOREIGN KEY (created_by) REFERENCES users (id)
  )`);

  await runQuery(`CREATE TABLE IF NOT EXISTS quotation_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    quotation_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    quantity REAL NOT NULL,
    price_per_unit REAL NOT NULL,
    discount_percent REAL NOT NULL DEFAULT 0,
    tax_percent REAL NOT NULL DEFAULT 0,
    pricing_rule_type TEXT,
    pricing_rule_label TEXT,
    total_amount REAL NOT NULL,
    FOREIGN KEY (quotation_id) REFERENCES quotations (id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products (id)
  )`);

  await runQuery(`CREATE TABLE IF NOT EXISTS price_tiers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    min_quantity REAL NOT NULL,
    price_per_unit REAL NOT NULL,
    label TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE
  )`);

  await runQuery(`CREATE TABLE IF NOT EXISTS product_promotions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    promotional_price REAL NOT NULL,
    start_date DATE,
    end_date DATE,
    label TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE
  )`);

  await runQuery(`CREATE TABLE IF NOT EXISTS customer_pricing (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    price_per_unit REAL NOT NULL,
    start_date DATE,
    end_date DATE,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers (id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE
  )`);

  await runQuery(`CREATE TABLE IF NOT EXISTS stock_adjustments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    adjustment_type TEXT NOT NULL CHECK (adjustment_type IN ('damage', 'theft', 'spoilage', 'counting_error', 'other')),
    quantity_adjusted REAL NOT NULL,
    quantity_before REAL NOT NULL,
    quantity_after REAL NOT NULL,
    reason TEXT NOT NULL,
    adjusted_by INTEGER NOT NULL,
    adjustment_date DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products (id),
    FOREIGN KEY (adjusted_by) REFERENCES users (id)
  )`);

  await runQuery(`CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    username TEXT,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    details TEXT,
    ip TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id)
  )`);

  await runQuery(`CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_id INTEGER,
    actor_name TEXT,
    actor_role TEXT,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    is_read INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (actor_id) REFERENCES users (id)
  )`);

  await runQuery(`CREATE TABLE IF NOT EXISTS warehouses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    address TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  await runQuery(`CREATE TABLE IF NOT EXISTS warehouse_stock (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    warehouse_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (warehouse_id) REFERENCES warehouses (id),
    FOREIGN KEY (product_id) REFERENCES products (id),
    UNIQUE(warehouse_id, product_id)
  )`);

  await runQuery(`CREATE TABLE IF NOT EXISTS warehouse_transfers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_warehouse_id INTEGER NOT NULL,
    to_warehouse_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    notes TEXT,
    transferred_by INTEGER,
    transferred_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (from_warehouse_id) REFERENCES warehouses (id),
    FOREIGN KEY (to_warehouse_id) REFERENCES warehouses (id),
    FOREIGN KEY (product_id) REFERENCES products (id),
    FOREIGN KEY (transferred_by) REFERENCES users (id)
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
    `INSERT OR IGNORE INTO users (username, password, role, is_active, force_password_change) VALUES (?, ?, 'admin', 1, 1)`,
    ['admin', adminPassword]
  );

  const operatorPassword = bcrypt.hashSync('operator123', 10);
  await runQuery(
    `INSERT OR IGNORE INTO users (username, password, role, is_active, force_password_change) VALUES (?, ?, 'operator', 1, 1)`,
    ['operator', operatorPassword]
  );
}

module.exports = {
  createTestDb,
  initializeTestSchema,
  seedTestUsers
};
