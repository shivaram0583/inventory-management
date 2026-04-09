const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

function resolveDbPath() {
  const configuredPath = process.env.SQLITE_DB_PATH;
  if (!configuredPath) {
    return path.join(__dirname, '..', 'database', 'inventory.db');
  }

  return path.isAbsolute(configuredPath)
    ? configuredPath
    : path.resolve(process.cwd(), configuredPath);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function openDatabase(dbPath) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath, (error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(db);
    });
  });
}

function run(db, query, params = []) {
  return new Promise((resolve, reject) => {
    db.run(query, params, function onRun(error) {
      if (error) {
        reject(error);
        return;
      }

      resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

function getRow(db, query, params = []) {
  return new Promise((resolve, reject) => {
    db.get(query, params, (error, row) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(row);
    });
  });
}

function getAll(db, query, params = []) {
  return new Promise((resolve, reject) => {
    db.all(query, params, (error, rows) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(rows);
    });
  });
}

function nowIST() {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Kolkata' }).replace('T', ' ');
}

async function closeDb(db) {
  await new Promise((resolve, reject) => {
    db.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

async function ensureSchemaExists(dbPath) {
  const dbExists = require('fs').existsSync(dbPath);
  if (dbExists) {
    return;
  }

  const runtimeDb = require('../database/db');

  try {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      try {
        const users = await runtimeDb.getRow('SELECT COUNT(*) AS count FROM users');
        const categories = await runtimeDb.getRow('SELECT COUNT(*) AS count FROM product_categories');

        if (Number(users?.count || 0) >= 2 && Number(categories?.count || 0) >= 4) {
          return;
        }
      } catch (error) {
        // Keep waiting until bootstrap completes.
      }

      await wait(250);
    }

    throw new Error('Timed out while waiting for database bootstrap');
  } finally {
    await closeDb(runtimeDb.db);
  }
}

async function restoreDefaults(db) {
  const timestamp = nowIST();
  const adminPassword = bcrypt.hashSync('admin123', 10);
  const operatorPassword = bcrypt.hashSync('operator123', 10);

  await run(
    db,
    `INSERT INTO users (
      username,
      password,
      role,
      is_active,
      force_password_change,
      password_changed_at,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ['admin', adminPassword, 'admin', 1, 0, timestamp, timestamp]
  );

  await run(
    db,
    `INSERT INTO users (
      username,
      password,
      role,
      is_active,
      force_password_change,
      password_changed_at,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ['operator', operatorPassword, 'operator', 1, 0, timestamp, timestamp]
  );

  for (const category of ['seeds', 'fertilizers', 'pesticides', 'tools']) {
    await run(db, 'INSERT INTO product_categories (name, created_at) VALUES (?, ?)', [category, timestamp]);
  }
}

async function clearDataInPlace(db) {
  const preservedTables = new Set(['one_time_migrations']);
  const tables = await getAll(
    db,
    `SELECT name
     FROM sqlite_master
     WHERE type = 'table'
       AND name NOT LIKE 'sqlite_%'`
  );

  await run(db, 'PRAGMA busy_timeout = 5000');
  await run(db, 'PRAGMA foreign_keys = OFF');
  await run(db, 'BEGIN EXCLUSIVE TRANSACTION');

  try {
    for (const table of tables) {
      if (!preservedTables.has(table.name)) {
        await run(db, `DELETE FROM "${table.name}"`);
      }
    }

    await run(db, 'DELETE FROM sqlite_sequence');
    await restoreDefaults(db);
    await run(db, 'COMMIT');
  } catch (error) {
    await run(db, 'ROLLBACK');
    throw error;
  } finally {
    await run(db, 'PRAGMA foreign_keys = ON');
  }
}

async function main() {
  const dbPath = resolveDbPath();
  await ensureSchemaExists(dbPath);
  const db = await openDatabase(dbPath);

  try {
    await clearDataInPlace(db);
    const users = await getRow(db, 'SELECT COUNT(*) AS count FROM users');
    const categories = await getRow(db, 'SELECT COUNT(*) AS count FROM product_categories');
    console.log(`Database reset complete. Default users: ${Number(users?.count || 0)}, default categories: ${Number(categories?.count || 0)}`);
  } finally {
    await closeDb(db);
  }
}

main().catch((error) => {
  console.error('Database cleanup failed:', error.message);
  process.exit(1);
});