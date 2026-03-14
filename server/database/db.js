const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = path.join(__dirname, 'inventory.db');

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
    unit TEXT NOT NULL CHECK (unit IN ('kg', 'packet', 'bag')),
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
    sale_id TEXT UNIQUE NOT NULL,
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

  // Create default admin user after tables are created
  setTimeout(() => {
    createDefaultUsers();
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

module.exports = {
  db,
  runQuery,
  getRow,
  getAll
};
