const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const dbPath = process.env.SQLITE_DB_PATH || path.join(__dirname, 'inventory.db');

try {
  const dir = path.dirname(dbPath);
  if (dir && dir !== '.' && !fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
} catch (e) {
  console.error('Error ensuring database directory exists:', e.message);
}

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to SQLite database');
    db.run('PRAGMA foreign_keys = ON');
    initializeDatabase();
  }
});

function initializeDatabase() {
  // Create users table
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'operator')),
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    force_password_change INTEGER NOT NULL DEFAULT 0 CHECK (force_password_change IN (0, 1)),
    password_changed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`, (err) => {
    if (err) {
      console.error('Error creating users table:', err.message);
    } else {
      console.log('Users table created successfully');
    }
  });

  db.all(`PRAGMA table_info(users)`, (err, columns) => {
    if (err) {
      console.error('Error checking users table schema:', err.message);
      return;
    }

    const hasIsActive = columns.some((c) => c.name === 'is_active');
    if (!hasIsActive) {
      db.run(
        `ALTER TABLE users ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1))`,
        (alterErr) => {
          if (alterErr) {
            console.error('Error adding is_active column:', alterErr.message);
          } else {
            console.log('Added is_active column to users table');
            db.run('UPDATE users SET is_active = 1 WHERE is_active IS NULL');
          }
        }
      );
    }

    const hasForcePasswordChange = columns.some((c) => c.name === 'force_password_change');
    if (!hasForcePasswordChange) {
      db.run(
        `ALTER TABLE users ADD COLUMN force_password_change INTEGER NOT NULL DEFAULT 0 CHECK (force_password_change IN (0, 1))`,
        (alterErr) => {
          if (alterErr) {
            console.error('Error adding force_password_change column:', alterErr.message);
          } else {
            console.log('Added force_password_change column to users table');
          }
        }
      );
    }

    const hasPasswordChangedAt = columns.some((c) => c.name === 'password_changed_at');
    if (!hasPasswordChangedAt) {
      db.run(`ALTER TABLE users ADD COLUMN password_changed_at DATETIME`, (alterErr) => {
        if (alterErr) {
          console.error('Error adding password_changed_at column:', alterErr.message);
        } else {
          console.log('Added password_changed_at column to users table');
        }
      });
    }
  });

  // Create products table
  db.run(`CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id TEXT UNIQUE NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('seeds', 'fertilizers')),
    product_name TEXT NOT NULL,
    variety TEXT,
    quantity_available REAL NOT NULL DEFAULT 0,
    unit TEXT NOT NULL CHECK (unit IN ('kg', 'packet', 'bag', 'liters')),
    purchase_price REAL NOT NULL DEFAULT 0,
    selling_price REAL NOT NULL DEFAULT 0,
    supplier TEXT,
    supplier_id INTEGER,
    date_added DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (supplier_id) REFERENCES suppliers (id)
  )`, (err) => {
    if (err) {
      console.error('Error creating products table:', err.message);
    } else {
      console.log('Products table created successfully');
    }
  });

  // Create sales table
  db.run(`CREATE TABLE IF NOT EXISTS sales (
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
  )`, (err) => {
    if (err) {
      console.error('Error creating sales table:', err.message);
    } else {
      console.log('Sales table created successfully');
    }
  });

  // Create receipts table
  db.run(`CREATE TABLE IF NOT EXISTS receipts (
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
    receipt_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    printed BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`, (err) => {
    if (err) {
      console.error('Error creating receipts table:', err.message);
    } else {
      console.log('Receipts table created successfully');
    }
  });

  // Migrate receipts table: add customer_mobile and customer_address if missing
  db.all(`PRAGMA table_info(receipts)`, (err, columns) => {
    if (err) return;
    const hasMobile = columns.some((c) => c.name === 'customer_mobile');
    const hasAddress = columns.some((c) => c.name === 'customer_address');
    if (!hasMobile) {
      db.run(`ALTER TABLE receipts ADD COLUMN customer_mobile TEXT`, (e) => {
        if (!e) console.log('Added customer_mobile column to receipts table');
      });
    }
    if (!hasAddress) {
      db.run(`ALTER TABLE receipts ADD COLUMN customer_address TEXT`, (e) => {
        if (!e) console.log('Added customer_address column to receipts table');
      });
    }

    const hasPaymentGateway = columns.some((c) => c.name === 'payment_gateway');
    if (!hasPaymentGateway) {
      db.run(`ALTER TABLE receipts ADD COLUMN payment_gateway TEXT`, (e) => {
        if (!e) console.log('Added payment_gateway column to receipts table');
      });
    }

    const hasPaymentReference = columns.some((c) => c.name === 'payment_reference');
    if (!hasPaymentReference) {
      db.run(`ALTER TABLE receipts ADD COLUMN payment_reference TEXT`, (e) => {
        if (!e) console.log('Added payment_reference column to receipts table');
      });
    }

    const hasGatewayOrderId = columns.some((c) => c.name === 'gateway_order_id');
    if (!hasGatewayOrderId) {
      db.run(`ALTER TABLE receipts ADD COLUMN gateway_order_id TEXT`, (e) => {
        if (!e) console.log('Added gateway_order_id column to receipts table');
      });
    }
  });

  // Create customer_sales table for archival customer-level sales data
  db.run(`CREATE TABLE IF NOT EXISTS customer_sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sale_id TEXT NOT NULL,
    receipt_id INTEGER,
    customer_name TEXT,
    customer_mobile TEXT,
    customer_address TEXT,
    product_name TEXT NOT NULL,
    quantity REAL NOT NULL,
    amount REAL NOT NULL DEFAULT 0,
    sale_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`, (err) => {
    if (err) {
      console.error('Error creating customer_sales table:', err.message);
    } else {
      console.log('Customer sales table created successfully');
    }
  });

  // Migrate customer_sales table: add payment_mode column if missing
  db.all(`PRAGMA table_info(customer_sales)`, (err, columns) => {
    if (err) return;
    const hasPaymentMode = columns.some((c) => c.name === 'payment_mode');
    if (!hasPaymentMode) {
      db.run(`ALTER TABLE customer_sales ADD COLUMN payment_mode TEXT DEFAULT 'cash'`, (e) => {
        if (!e) console.log('Added payment_mode column to customer_sales table');
      });
    }

    const hasAmount = columns.some((c) => c.name === 'amount');
    if (!hasAmount) {
      db.run(`ALTER TABLE customer_sales ADD COLUMN amount REAL NOT NULL DEFAULT 0`, (e) => {
        if (!e) console.log('Added amount column to customer_sales table');
      });
    }
  });

  // Create product_categories table for dynamic categories
  db.run(`CREATE TABLE IF NOT EXISTS product_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`, (err) => {
    if (!err) {
      db.run(`INSERT OR IGNORE INTO product_categories (name) VALUES ('seeds')`);
      db.run(`INSERT OR IGNORE INTO product_categories (name) VALUES ('fertilizers')`);
      db.run(`INSERT OR IGNORE INTO product_categories (name) VALUES ('pesticides')`);
      db.run(`INSERT OR IGNORE INTO product_categories (name) VALUES ('tools')`);
    }
  });

  // Migrate products table: remove hardcoded category CHECK constraint if present
  db.get("SELECT sql FROM sqlite_master WHERE type='table' AND name='products'", (err, row) => {
    if (err || !row) return;
    if (row.sql && row.sql.includes("CHECK (category IN")) {
      db.serialize(() => {
        db.run(`CREATE TABLE IF NOT EXISTS products_v2 (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          product_id TEXT UNIQUE NOT NULL,
          category TEXT NOT NULL,
          product_name TEXT NOT NULL,
          variety TEXT,
          quantity_available REAL NOT NULL DEFAULT 0,
          unit TEXT NOT NULL CHECK (unit IN ('kg', 'packet', 'bag', 'liters')),
          purchase_price REAL NOT NULL DEFAULT 0,
          selling_price REAL NOT NULL DEFAULT 0,
          supplier TEXT,
          supplier_id INTEGER,
          date_added DATETIME DEFAULT CURRENT_TIMESTAMP,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (supplier_id) REFERENCES suppliers (id)
        `);
        db.run(`INSERT OR IGNORE INTO products_v2 SELECT * FROM products`);
        db.run(`DROP TABLE products`);
        db.run(`ALTER TABLE products_v2 RENAME TO products`, (e) => {
          if (!e) console.log('Migrated products table: removed hardcoded category constraint');
        });
      });
    }
  });

  // Migrate products table: add 'liters' to unit CHECK constraint if missing
  db.get("SELECT sql FROM sqlite_master WHERE type='table' AND name='products'", (err, row) => {
    if (err || !row) return;
    if (row.sql && !row.sql.includes('liters')) {
      db.serialize(() => {
        db.run(`CREATE TABLE IF NOT EXISTS products_v3 (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          product_id TEXT UNIQUE NOT NULL,
          category TEXT NOT NULL,
          product_name TEXT NOT NULL,
          variety TEXT,
          quantity_available REAL NOT NULL DEFAULT 0,
          unit TEXT NOT NULL CHECK (unit IN ('kg', 'packet', 'bag', 'liters')),
          purchase_price REAL NOT NULL DEFAULT 0,
          selling_price REAL NOT NULL DEFAULT 0,
          supplier TEXT,
          supplier_id INTEGER,
          date_added DATETIME DEFAULT CURRENT_TIMESTAMP,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (supplier_id) REFERENCES suppliers (id)
        )`);
        db.run(`INSERT OR IGNORE INTO products_v3 SELECT * FROM products`);
        db.run(`DROP TABLE products`);
        db.run(`ALTER TABLE products_v3 RENAME TO products`, (e) => {
          if (!e) console.log('Migrated products table: added liters to unit options');
        });
      });
    }
  });

  // Migrate products table: expand unit CHECK to include pieces, bottles, tonnes, grams, ml
  db.get("SELECT sql FROM sqlite_master WHERE type='table' AND name='products'", (err, row) => {
    if (err || !row) return;
    if (row.sql && !row.sql.includes('pieces')) {
      db.serialize(() => {
        db.run(`CREATE TABLE IF NOT EXISTS products_v4 (
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
          supplier_id INTEGER,
          date_added DATETIME DEFAULT CURRENT_TIMESTAMP,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (supplier_id) REFERENCES suppliers (id)
        )`);
        db.run(`INSERT OR IGNORE INTO products_v4 SELECT * FROM products`);
        db.run(`DROP TABLE products`);
        db.run(`ALTER TABLE products_v4 RENAME TO products`, (e) => {
          if (!e) console.log('Migrated products table: added pieces, bottles, tonnes, grams, ml units');
        });
      });
    }
  });

  // Migrate sales table: remove UNIQUE constraint on sale_id for multi-item sales
  db.get("SELECT sql FROM sqlite_master WHERE type='table' AND name='sales'", (err, row) => {
    if (err || !row) return;
    if (row.sql && row.sql.includes('sale_id TEXT UNIQUE')) {
      db.serialize(() => {
        db.run(`CREATE TABLE IF NOT EXISTS sales_v2 (
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
        db.run(`INSERT INTO sales_v2 SELECT * FROM sales`);
        db.run(`DROP TABLE sales`);
        db.run(`ALTER TABLE sales_v2 RENAME TO sales`, (e) => {
          if (!e) console.log('Migrated sales table: removed UNIQUE constraint on sale_id');
        });
      });
    }
  });

  // Create purchases table
  db.run(`CREATE TABLE IF NOT EXISTS purchases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    purchase_id TEXT UNIQUE NOT NULL,
    product_id INTEGER NOT NULL,
    quantity REAL NOT NULL,
    price_per_unit REAL NOT NULL,
    total_amount REAL NOT NULL,
    supplier TEXT,
    supplier_id INTEGER,
    purchase_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    added_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products (id),
    FOREIGN KEY (supplier_id) REFERENCES suppliers (id),
    FOREIGN KEY (added_by) REFERENCES users (id)
  )`, (err) => {
    if (err) {
      console.error('Error creating purchases table:', err.message);
    } else {
      console.log('Purchases table created successfully');
    }
  });

  db.all(`PRAGMA table_info(purchases)`, (err, columns) => {
    if (err) return;

    const hasPurchaseStatus = columns.some((c) => c.name === 'purchase_status');
    const hasDeliveryDate = columns.some((c) => c.name === 'delivery_date');
    const hasAdvanceAmount = columns.some((c) => c.name === 'advance_amount');
    const hasAdvancePaymentId = columns.some((c) => c.name === 'advance_payment_id');
    const hasSupplierId = columns.some((c) => c.name === 'supplier_id');

    if (!hasPurchaseStatus) {
      db.run(`ALTER TABLE purchases ADD COLUMN purchase_status TEXT NOT NULL DEFAULT 'delivered'`, (e) => {
        if (!e) console.log('Added purchase_status column to purchases table');
      });
    }

    if (!hasDeliveryDate) {
      db.run(`ALTER TABLE purchases ADD COLUMN delivery_date DATETIME`, (e) => {
        if (!e) console.log('Added delivery_date column to purchases table');
      });
    }

    if (!hasAdvanceAmount) {
      db.run(`ALTER TABLE purchases ADD COLUMN advance_amount REAL NOT NULL DEFAULT 0`, (e) => {
        if (!e) console.log('Added advance_amount column to purchases table');
      });
    }

    if (!hasAdvancePaymentId) {
      db.run(`ALTER TABLE purchases ADD COLUMN advance_payment_id INTEGER`, (e) => {
        if (!e) console.log('Added advance_payment_id column to purchases table');
      });
    }

    if (!hasSupplierId) {
      db.run(`ALTER TABLE purchases ADD COLUMN supplier_id INTEGER`, (e) => {
        if (!e) console.log('Added supplier_id column to purchases table');
      });
    }

    const hasQuantityDelivered = columns.some((c) => c.name === 'quantity_delivered');
    if (!hasQuantityDelivered) {
      db.run(`ALTER TABLE purchases ADD COLUMN quantity_delivered REAL NOT NULL DEFAULT 0`, (e) => {
        if (!e) console.log('Added quantity_delivered column to purchases table');
      });
    }

    const hasUpdatedAt = columns.some((c) => c.name === 'updated_at');
    if (!hasUpdatedAt) {
      db.run(`ALTER TABLE purchases ADD COLUMN updated_at DATETIME`, (e) => {
        if (!e) console.log('Added updated_at column to purchases table');
      });
    }
  });

  // Create bank_accounts table
  db.run(`CREATE TABLE IF NOT EXISTS bank_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_name TEXT NOT NULL,
    bank_name TEXT NOT NULL,
    account_number TEXT,
    balance REAL NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`, (err) => {
    if (err) {
      console.error('Error creating bank_accounts table:', err.message);
    } else {
      console.log('Bank accounts table created successfully');
    }
  });

  db.run(`CREATE TABLE IF NOT EXISTS daily_operation_setup (
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
  )`, (err) => {
    if (err) {
      console.error('Error creating daily_operation_setup table:', err.message);
    } else {
      console.log('Daily operation setup table created successfully');
    }
  });

  // Create expenditures table
  db.run(`CREATE TABLE IF NOT EXISTS expenditures (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    amount REAL NOT NULL,
    description TEXT NOT NULL,
    category TEXT DEFAULT 'general',
    expense_date DATE NOT NULL,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users (id)
  )`, (err) => {
    if (err) {
      console.error('Error creating expenditures table:', err.message);
    } else {
      console.log('Expenditures table created successfully');
    }
  });

  // Create bank_transfers table
  db.run(`CREATE TABLE IF NOT EXISTS bank_transfers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bank_account_id INTEGER NOT NULL,
    amount REAL NOT NULL,
    transfer_type TEXT NOT NULL CHECK (transfer_type IN ('deposit', 'withdrawal')),
    source_type TEXT,
    source_reference TEXT,
    payment_mode TEXT,
    description TEXT,
    transfer_date DATE NOT NULL,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (bank_account_id) REFERENCES bank_accounts (id),
    FOREIGN KEY (created_by) REFERENCES users (id)
  )`, (err) => {
    if (err) {
      console.error('Error creating bank_transfers table:', err.message);
    } else {
      console.log('Bank transfers table created successfully');
    }
  });

  db.all(`PRAGMA table_info(bank_transfers)`, (err, columns) => {
    if (err) return;

    const hasSourceType = columns.some((c) => c.name === 'source_type');
    const hasSourceReference = columns.some((c) => c.name === 'source_reference');
    const hasPaymentMode = columns.some((c) => c.name === 'payment_mode');

    if (!hasSourceType) {
      db.run(`ALTER TABLE bank_transfers ADD COLUMN source_type TEXT`, (e) => {
        if (!e) console.log('Added source_type column to bank_transfers table');
      });
    }

    if (!hasSourceReference) {
      db.run(`ALTER TABLE bank_transfers ADD COLUMN source_reference TEXT`, (e) => {
        if (!e) console.log('Added source_reference column to bank_transfers table');
      });
    }

    if (!hasPaymentMode) {
      db.run(`ALTER TABLE bank_transfers ADD COLUMN payment_mode TEXT`, (e) => {
        if (!e) console.log('Added payment_mode column to bank_transfers table');
      });
    }

    const hasWithdrawalPurpose = columns.some((c) => c.name === 'withdrawal_purpose');
    if (!hasWithdrawalPurpose) {
      db.run(`ALTER TABLE bank_transfers ADD COLUMN withdrawal_purpose TEXT`, (e) => {
        if (!e) console.log('Added withdrawal_purpose column to bank_transfers table');
      });
    }
  });

  // Create suppliers table
  db.run(`CREATE TABLE IF NOT EXISTS suppliers (
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
  )`, (err) => {
    if (err) {
      console.error('Error creating suppliers table:', err.message);
    } else {
      console.log('Suppliers table created successfully');
    }
  });

  // Create supplier_payments table
  db.run(`CREATE TABLE IF NOT EXISTS supplier_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier_name TEXT NOT NULL,
    supplier_id INTEGER,
    amount REAL NOT NULL,
    payment_mode TEXT NOT NULL DEFAULT 'bank' CHECK (payment_mode IN ('cash', 'bank', 'upi')),
    bank_account_id INTEGER,
    description TEXT,
    payment_date DATE NOT NULL,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (supplier_id) REFERENCES suppliers (id),
    FOREIGN KEY (bank_account_id) REFERENCES bank_accounts (id),
    FOREIGN KEY (created_by) REFERENCES users (id)
  )`, (err) => {
    if (err) {
      console.error('Error creating supplier_payments table:', err.message);
    } else {
      console.log('Supplier payments table created successfully');
    }
  });

  db.run(`CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_activity DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id)
  )`, (err) => {
    if (err) {
      console.error('Error creating sessions table:', err.message);
    }
  });

  db.run(`CREATE TABLE IF NOT EXISTS login_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    username TEXT NOT NULL,
    role TEXT NOT NULL,
    ip TEXT,
    user_agent TEXT,
    logged_in_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id)
  )`, (err) => {
    if (err) {
      console.error('Error creating login_logs table:', err.message);
    }
  });

  // Create customers table
  db.run(`CREATE TABLE IF NOT EXISTS customers (
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

  // Create customer_payments table (for credit collection)
  db.run(`CREATE TABLE IF NOT EXISTS customer_payments (
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

  // Create sales_returns table
  db.run(`CREATE TABLE IF NOT EXISTS sales_returns (
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

  // Create quotations table
  db.run(`CREATE TABLE IF NOT EXISTS quotations (
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

  // Create quotation_items table
  db.run(`CREATE TABLE IF NOT EXISTS quotation_items (
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

  db.run(`CREATE TABLE IF NOT EXISTS price_tiers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    min_quantity REAL NOT NULL,
    price_per_unit REAL NOT NULL,
    label TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE,
    UNIQUE(product_id, min_quantity)
  )`, (err) => {
    if (err) {
      console.error('Error creating price_tiers table:', err.message);
    }
  });

  db.run(`CREATE TABLE IF NOT EXISTS product_promotions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    promotional_price REAL NOT NULL,
    start_date DATE,
    end_date DATE,
    label TEXT,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE
  )`, (err) => {
    if (err) {
      console.error('Error creating product_promotions table:', err.message);
    }
  });

  db.run(`CREATE TABLE IF NOT EXISTS customer_pricing (
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
  )`, (err) => {
    if (err) {
      console.error('Error creating customer_pricing table:', err.message);
    }
  });

  db.all(`PRAGMA table_info(sales)`, (err, columns) => {
    if (err || !columns) return;
    const cols = columns.map((c) => c.name);
    if (!cols.includes('pricing_rule_type')) {
      db.run(`ALTER TABLE sales ADD COLUMN pricing_rule_type TEXT`);
    }
    if (!cols.includes('pricing_rule_label')) {
      db.run(`ALTER TABLE sales ADD COLUMN pricing_rule_label TEXT`);
    }
  });

  db.all(`PRAGMA table_info(quotation_items)`, (err, columns) => {
    if (err || !columns) return;
    const cols = columns.map((c) => c.name);
    if (!cols.includes('pricing_rule_type')) {
      db.run(`ALTER TABLE quotation_items ADD COLUMN pricing_rule_type TEXT`);
    }
    if (!cols.includes('pricing_rule_label')) {
      db.run(`ALTER TABLE quotation_items ADD COLUMN pricing_rule_label TEXT`);
    }
  });

  // Create stock_adjustments table
  db.run(`CREATE TABLE IF NOT EXISTS stock_adjustments (
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

  // Create audit_log table
  db.run(`CREATE TABLE IF NOT EXISTS audit_log (
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

  // Create notifications table (persistent)
  db.run(`CREATE TABLE IF NOT EXISTS notifications (
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

  // Add new columns to products for GST, reorder, barcode
  db.all(`PRAGMA table_info(products)`, (err, columns) => {
    if (err || !columns) return;
    const cols = columns.map(c => c.name);
    if (!cols.includes('gst_percent')) {
      db.run(`ALTER TABLE products ADD COLUMN gst_percent REAL NOT NULL DEFAULT 0`);
    }
    if (!cols.includes('hsn_code')) {
      db.run(`ALTER TABLE products ADD COLUMN hsn_code TEXT`);
    }
    if (!cols.includes('reorder_point')) {
      db.run(`ALTER TABLE products ADD COLUMN reorder_point REAL NOT NULL DEFAULT 10`);
    }
    if (!cols.includes('reorder_quantity')) {
      db.run(`ALTER TABLE products ADD COLUMN reorder_quantity REAL NOT NULL DEFAULT 0`);
    }
    if (!cols.includes('barcode')) {
      db.run(`ALTER TABLE products ADD COLUMN barcode TEXT`);
    }
    if (!cols.includes('expiry_date')) {
      db.run(`ALTER TABLE products ADD COLUMN expiry_date DATE`);
    }
    if (!cols.includes('batch_number')) {
      db.run(`ALTER TABLE products ADD COLUMN batch_number TEXT`);
    }
    if (!cols.includes('manufacturing_date')) {
      db.run(`ALTER TABLE products ADD COLUMN manufacturing_date DATE`);
    }
    if (!cols.includes('supplier_id')) {
      db.run(`ALTER TABLE products ADD COLUMN supplier_id INTEGER`);
    }
  });

  db.all(`PRAGMA table_info(supplier_payments)`, (err, columns) => {
    if (err || !columns) return;
    const cols = columns.map(c => c.name);
    if (!cols.includes('supplier_id')) {
      db.run(`ALTER TABLE supplier_payments ADD COLUMN supplier_id INTEGER`);
    }
  });

  // Add new columns to sales for discount, GST, credit
  db.all(`PRAGMA table_info(sales)`, (err, columns) => {
    if (err || !columns) return;
    const cols = columns.map(c => c.name);
    if (!cols.includes('discount_amount')) {
      db.run(`ALTER TABLE sales ADD COLUMN discount_amount REAL NOT NULL DEFAULT 0`);
    }
    if (!cols.includes('tax_amount')) {
      db.run(`ALTER TABLE sales ADD COLUMN tax_amount REAL NOT NULL DEFAULT 0`);
    }
    if (!cols.includes('gst_percent')) {
      db.run(`ALTER TABLE sales ADD COLUMN gst_percent REAL NOT NULL DEFAULT 0`);
    }
  });

  // Add new columns to receipts for discount, GST, credit
  db.all(`PRAGMA table_info(receipts)`, (err, columns) => {
    if (err || !columns) return;
    const cols = columns.map(c => c.name);
    if (!cols.includes('discount_amount')) {
      db.run(`ALTER TABLE receipts ADD COLUMN discount_amount REAL NOT NULL DEFAULT 0`);
    }
    if (!cols.includes('tax_amount')) {
      db.run(`ALTER TABLE receipts ADD COLUMN tax_amount REAL NOT NULL DEFAULT 0`);
    }
    if (!cols.includes('payment_status')) {
      db.run(`ALTER TABLE receipts ADD COLUMN payment_status TEXT NOT NULL DEFAULT 'paid'`);
    }
    if (!cols.includes('customer_id')) {
      db.run(`ALTER TABLE receipts ADD COLUMN customer_id INTEGER`);
    }
    if (!cols.includes('payment_gateway')) {
      db.run(`ALTER TABLE receipts ADD COLUMN payment_gateway TEXT`);
    }
    if (!cols.includes('payment_reference')) {
      db.run(`ALTER TABLE receipts ADD COLUMN payment_reference TEXT`);
    }
    if (!cols.includes('gateway_order_id')) {
      db.run(`ALTER TABLE receipts ADD COLUMN gateway_order_id TEXT`);
    }
  });

  createDefaultUsers();
  runTimestampMigrations().catch((error) => {
    console.error('Error running timestamp migrations:', error.message);
  });
}

function createDefaultUsers() {
  const adminPassword = bcrypt.hashSync('admin123', 10);
  db.run(`INSERT OR IGNORE INTO users (username, password, role, force_password_change) 
    VALUES (?, ?, 'admin', 1)`, ['admin', adminPassword], (err) => {
    if (err) {
      console.error('Error creating admin user:', err.message);
    } else {
      console.log('Admin user created successfully');
    }
  });

  db.run(
    `UPDATE users
     SET force_password_change = 1
     WHERE username = 'admin' AND COALESCE(password_changed_at, '') = ''`,
    (err) => {
      if (err) {
        console.error('Error flagging admin for password change:', err.message);
      }
    }
  );

  // Create default operator user
  const operatorPassword = bcrypt.hashSync('operator123', 10);
  db.run(`INSERT OR IGNORE INTO users (username, password, role, force_password_change) 
    VALUES (?, ?, 'operator', 1)`, ['operator', operatorPassword], (err) => {
    if (err) {
      console.error('Error creating operator user:', err.message);
    } else {
      console.log('Operator user created successfully');
    }
  });

  db.run(
    `UPDATE users
     SET force_password_change = 1
     WHERE username = 'operator' AND COALESCE(password_changed_at, '') = ''`,
    (err) => {
      if (err) {
        console.error('Error flagging operator for password change:', err.message);
      }
    }
  );

  // Add is_deleted column to products (soft delete for purchase history)
  db.all(`PRAGMA table_info(products)`, (err, columns) => {
    if (err || !columns) return;
    const hasIsDeleted = columns.some((c) => c.name === 'is_deleted');
    if (!hasIsDeleted) {
      db.run(`ALTER TABLE products ADD COLUMN is_deleted INTEGER NOT NULL DEFAULT 0`, (e) => {
        if (!e) console.log('Added is_deleted column to products table');
      });
    }
  });

  // Create warehouses table
  db.run(`CREATE TABLE IF NOT EXISTS warehouses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    address TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`, (err) => {
    if (err) console.error('Error creating warehouses table:', err.message);
  });

  // Create warehouse_stock table for per-warehouse inventory
  db.run(`CREATE TABLE IF NOT EXISTS warehouse_stock (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    warehouse_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (warehouse_id) REFERENCES warehouses (id),
    FOREIGN KEY (product_id) REFERENCES products (id),
    UNIQUE(warehouse_id, product_id)
  )`, (err) => {
    if (err) console.error('Error creating warehouse_stock table:', err.message);
  });

  // Create warehouse_transfers table
  db.run(`CREATE TABLE IF NOT EXISTS warehouse_transfers (
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
  )`, (err) => {
    if (err) console.error('Error creating warehouse_transfers table:', err.message);
  });

  console.log('Database initialized successfully');
}

function runOneTimeMigration(name, statements) {
  return new Promise((resolve) => {
    db.serialize(() => {
      db.run(`
        CREATE TABLE IF NOT EXISTS app_migrations (
          name TEXT PRIMARY KEY,
          executed_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `, (tableErr) => {
        if (tableErr) {
          console.error(`Error creating app_migrations for ${name}:`, tableErr.message);
          resolve(false);
          return;
        }

        db.get('SELECT name FROM app_migrations WHERE name = ?', [name], (checkErr, row) => {
          if (checkErr) {
            console.error(`Error checking migration ${name}:`, checkErr.message);
            resolve(false);
            return;
          }

          if (row) {
            resolve(false);
            return;
          }

          const runStatement = (index) => {
            if (index >= statements.length) {
              db.run('INSERT INTO app_migrations (name) VALUES (?)', [name], (insertErr) => {
                if (insertErr) {
                  console.error(`Error recording migration ${name}:`, insertErr.message);
                  resolve(false);
                } else {
                  console.log(`Applied migration: ${name}`);
                  resolve(true);
                }
              });
              return;
            }

            db.run(statements[index], (statementErr) => {
              if (statementErr) {
                console.error(`Error applying migration ${name}:`, statementErr.message);
                resolve(false);
                return;
              }

              runStatement(index + 1);
            });
          };

          runStatement(0);
        });
      });
    });
  });
}

async function runTimestampMigrations() {
  await runOneTimeMigration('receipts-sale-id-text-v1', [
    'PRAGMA foreign_keys = OFF',
    `CREATE TABLE receipts_v2 (
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
       payment_status TEXT NOT NULL DEFAULT 'paid',
       customer_id INTEGER,
       receipt_date DATETIME DEFAULT CURRENT_TIMESTAMP,
       printed BOOLEAN DEFAULT FALSE,
       created_at DATETIME DEFAULT CURRENT_TIMESTAMP
     )`,
    `INSERT INTO receipts_v2 (
       id,
       receipt_number,
       sale_id,
       customer_name,
       customer_mobile,
       customer_address,
       payment_mode,
       payment_gateway,
       payment_reference,
       gateway_order_id,
       total_amount,
       discount_amount,
       tax_amount,
       payment_status,
       customer_id,
       receipt_date,
       printed,
       created_at
     )
     SELECT
       id,
       receipt_number,
       CAST(sale_id AS TEXT),
       customer_name,
       customer_mobile,
       customer_address,
       payment_mode,
       payment_gateway,
       payment_reference,
       gateway_order_id,
       total_amount,
       COALESCE(discount_amount, 0),
       COALESCE(tax_amount, 0),
       COALESCE(payment_status, 'paid'),
       customer_id,
       receipt_date,
       printed,
       created_at
     FROM receipts`,
    'DROP TABLE receipts',
    'ALTER TABLE receipts_v2 RENAME TO receipts',
    'PRAGMA foreign_keys = ON'
  ]);

  await runOneTimeMigration('purchase-order-status-backfill-v1', [
    `UPDATE purchases SET purchase_status = 'delivered' WHERE purchase_status IS NULL OR trim(purchase_status) = ''`,
    `UPDATE purchases SET advance_amount = 0 WHERE advance_amount IS NULL`,
    `UPDATE purchases
     SET delivery_date = purchase_date
     WHERE COALESCE(purchase_status, 'delivered') = 'delivered'
       AND delivery_date IS NULL`
  ]);

  await runOneTimeMigration('purchase-date-time-backfill-v1', [
    `
      UPDATE purchases
      SET purchase_date = purchase_date || ' ' || time(datetime(created_at, '+5 hours', '+30 minutes'))
      WHERE purchase_date IS NOT NULL
        AND length(trim(purchase_date)) = 10
        AND created_at IS NOT NULL
    `
  ]);

  await runOneTimeMigration('receipt-date-sync-from-sales-v1', [
    `
      UPDATE receipts
      SET receipt_date = (
        SELECT MIN(s.sale_date)
        FROM sales s
        WHERE s.sale_id = receipts.sale_id
      )
      WHERE EXISTS (
        SELECT 1
        FROM sales s
        WHERE s.sale_id = receipts.sale_id
      )
    `
  ]);

  await runOneTimeMigration('expenditures-created-at-ist-v1', [
    `UPDATE expenditures SET created_at = datetime(created_at, '+5 hours', '+30 minutes') WHERE created_at IS NOT NULL`
  ]);

  await runOneTimeMigration('bank-transfers-created-at-ist-v1', [
    `UPDATE bank_transfers SET created_at = datetime(created_at, '+5 hours', '+30 minutes') WHERE created_at IS NOT NULL`
  ]);

  await runOneTimeMigration('supplier-payments-created-at-ist-v1', [
    `UPDATE supplier_payments SET created_at = datetime(created_at, '+5 hours', '+30 minutes') WHERE created_at IS NOT NULL`
  ]);

  await runOneTimeMigration('supplier-payments-bank-ledger-backfill-v1', [
    `INSERT INTO bank_transfers (
       bank_account_id,
       amount,
       transfer_type,
       source_type,
       source_reference,
       payment_mode,
       description,
       transfer_date,
       created_by,
       created_at
     )
     SELECT
       sp.bank_account_id,
       sp.amount,
       'withdrawal',
       'supplier_payment',
       'supplier-payment:' || sp.id,
       sp.payment_mode,
       COALESCE(sp.description, 'Supplier payment to ' || sp.supplier_name),
       sp.payment_date,
       sp.created_by,
       COALESCE(sp.created_at, CURRENT_TIMESTAMP)
     FROM supplier_payments sp
     WHERE sp.bank_account_id IS NOT NULL
       AND sp.payment_mode IN ('bank', 'upi')
       AND NOT EXISTS (
         SELECT 1
         FROM bank_transfers bt
         WHERE bt.source_type = 'supplier_payment'
           AND bt.source_reference = 'supplier-payment:' || sp.id
       )`
  ]);

  await runOneTimeMigration('supplier-foreign-key-backfill-v1', [
    `UPDATE products
     SET supplier_id = (
       SELECT s.id
       FROM suppliers s
       WHERE LOWER(TRIM(s.name)) = LOWER(TRIM(products.supplier))
       LIMIT 1
     )
     WHERE supplier_id IS NULL
       AND supplier IS NOT NULL
       AND TRIM(supplier) != ''`,
    `UPDATE purchases
     SET supplier_id = (
       SELECT s.id
       FROM suppliers s
       WHERE LOWER(TRIM(s.name)) = LOWER(TRIM(purchases.supplier))
       LIMIT 1
     )
     WHERE supplier_id IS NULL
       AND supplier IS NOT NULL
       AND TRIM(supplier) != ''`,
    `UPDATE supplier_payments
     SET supplier_id = (
       SELECT s.id
       FROM suppliers s
       WHERE LOWER(TRIM(s.name)) = LOWER(TRIM(supplier_payments.supplier_name))
       LIMIT 1
     )
     WHERE supplier_id IS NULL
       AND supplier_name IS NOT NULL
       AND TRIM(supplier_name) != ''`,
    `UPDATE products
     SET supplier = (
       SELECT s.name
       FROM suppliers s
       WHERE s.id = products.supplier_id
     )
     WHERE supplier_id IS NOT NULL`,
    `UPDATE purchases
     SET supplier = (
       SELECT s.name
       FROM suppliers s
       WHERE s.id = purchases.supplier_id
     )
     WHERE supplier_id IS NOT NULL`,
    `UPDATE supplier_payments
     SET supplier_name = (
       SELECT s.name
       FROM suppliers s
       WHERE s.id = supplier_payments.supplier_id
     )
     WHERE supplier_id IS NOT NULL`
  ]);
}

// Helper function to run queries with promises
function runQuery(query, params = []) {
  return new Promise((resolve, reject) => {
    db.run(query, params, function(err) {
      if (err) {
        reject(err);
      } else {
        resolve({ id: this.lastID, changes: this.changes });
      }
    });
  });
}

// Helper function to get single row
function getRow(query, params = []) {
  return new Promise((resolve, reject) => {
    db.get(query, params, (err, row) => {
      if (err) {
        reject(err);
      } else {
        resolve(row);
      }
    });
  });
}

// Helper function to get all rows
function getAll(query, params = []) {
  return new Promise((resolve, reject) => {
    db.all(query, params, (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
}

// Returns current IST datetime as 'YYYY-MM-DD HH:mm:ss' string
function nowIST() {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Kolkata' }).replace('T', ' ');
}

function combineISTDateWithCurrentTime(dateString, referenceTimestamp = nowIST()) {
  if (!dateString) return referenceTimestamp;

  const normalizedDate = String(dateString).trim().slice(0, 10);
  const timePart = String(referenceTimestamp).trim().split(' ')[1] || '00:00:00';
  return `${normalizedDate} ${timePart}`;
}

// Run multiple queries inside a BEGIN/COMMIT transaction
function runTransaction(callback) {
  return new Promise((resolve, reject) => {
    db.run('BEGIN TRANSACTION', async (err) => {
      if (err) return reject(err);
      try {
        const result = await callback({ runQuery, getRow, getAll });
        db.run('COMMIT', (commitErr) => {
          if (commitErr) return reject(commitErr);
          resolve(result);
        });
      } catch (error) {
        db.run('ROLLBACK', () => reject(error));
      }
    });
  });
}

// Helper for paginated queries
function paginate(query, params, page = 1, limit = 50) {
  const offset = (Math.max(1, parseInt(page) || 1) - 1) * (parseInt(limit) || 50);
  const safeLimit = Math.min(Math.max(1, parseInt(limit) || 50), 500);
  return new Promise(async (resolve, reject) => {
    try {
      const countQuery = `SELECT COUNT(*) as total FROM (${query})`;
      const countResult = await getRow(countQuery, params);
      const total = countResult ? countResult.total : 0;
      const rows = await getAll(`${query} LIMIT ? OFFSET ?`, [...params, safeLimit, offset]);
      resolve({
        data: rows,
        pagination: {
          page: Math.max(1, parseInt(page) || 1),
          limit: safeLimit,
          total,
          totalPages: Math.ceil(total / safeLimit)
        }
      });
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = {
  db,
  runQuery,
  getRow,
  getAll,
  nowIST,
  combineISTDateWithCurrentTime,
  runTransaction,
  paginate
};
