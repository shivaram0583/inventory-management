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
    date_added DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
    sale_id INTEGER NOT NULL,
    customer_name TEXT,
    customer_mobile TEXT,
    customer_address TEXT,
    payment_mode TEXT DEFAULT 'cash',
    total_amount REAL NOT NULL,
    receipt_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    printed BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sale_id) REFERENCES sales (id)
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
          date_added DATETIME DEFAULT CURRENT_TIMESTAMP,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
          date_added DATETIME DEFAULT CURRENT_TIMESTAMP,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
          date_added DATETIME DEFAULT CURRENT_TIMESTAMP,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
    purchase_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    added_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products (id),
    FOREIGN KEY (added_by) REFERENCES users (id)
  )`, (err) => {
    if (err) {
      console.error('Error creating purchases table:', err.message);
    } else {
      console.log('Purchases table created successfully');
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
  });

  // Create supplier_payments table
  db.run(`CREATE TABLE IF NOT EXISTS supplier_payments (
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

  // Create default admin user after tables are created
  setTimeout(() => {
    createDefaultUsers();
    runTimestampMigrations().catch((error) => {
      console.error('Error running timestamp migrations:', error.message);
    });
  }, 1000);
}

function createDefaultUsers() {
  const adminPassword = bcrypt.hashSync('admin123', 10);
  db.run(`INSERT OR IGNORE INTO users (username, password, role) 
    VALUES (?, ?, 'admin')`, ['admin', adminPassword], (err) => {
    if (err) {
      console.error('Error creating admin user:', err.message);
    } else {
      console.log('Admin user created successfully');
    }
  });

  // Create default operator user
  const operatorPassword = bcrypt.hashSync('operator123', 10);
  db.run(`INSERT OR IGNORE INTO users (username, password, role) 
    VALUES (?, ?, 'operator')`, ['operator', operatorPassword], (err) => {
    if (err) {
      console.error('Error creating operator user:', err.message);
    } else {
      console.log('Operator user created successfully');
    }
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

module.exports = {
  db,
  runQuery,
  getRow,
  getAll,
  nowIST,
  combineISTDateWithCurrentTime
};
