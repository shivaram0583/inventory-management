/**
 * Seed script: clears all non-login data and inserts fresh sample products (4 per category).
 * Run from project root:  node server/seed.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');

const dbPath = process.env.SQLITE_DB_PATH
  ? path.resolve(__dirname, process.env.SQLITE_DB_PATH)
  : path.join(__dirname, 'database', 'inventory.db');

console.log('DB path:', dbPath);
const db = new sqlite3.Database(dbPath);

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err); else resolve(this);
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err); else resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err); else resolve(rows);
    });
  });
}

async function seed() {
  console.log('Clearing all non-login data...');

  // Delete in dependency order
  await run('DELETE FROM customer_sales');
  await run('DELETE FROM login_logs');
  await run('DELETE FROM sessions');
  await run('DELETE FROM supplier_payments');
  await run('DELETE FROM bank_transfers');
  await run('DELETE FROM expenditures');
  await run('DELETE FROM bank_accounts');
  await run('DELETE FROM purchases');
  await run('DELETE FROM receipts');
  await run('DELETE FROM sales');
  await run('DELETE FROM products');
  await run('DELETE FROM product_categories');

  // Reset autoincrement
  await run("DELETE FROM sqlite_sequence WHERE name IN ('products','sales','receipts','purchases','customer_sales','login_logs','product_categories','bank_accounts','expenditures','bank_transfers','supplier_payments')");

  console.log('Seeding categories...');
  await run("INSERT INTO product_categories (name) VALUES ('seeds')");
  await run("INSERT INTO product_categories (name) VALUES ('fertilizers')");
  await run("INSERT INTO product_categories (name) VALUES ('pesticides')");
  await run("INSERT INTO product_categories (name) VALUES ('tools')");

  console.log('Ensuring login users exist...');
  const userCount = await get('SELECT COUNT(*) AS count FROM users');
  if (!userCount || userCount.count === 0) {
    const adminHash = await bcrypt.hash('admin123', 10);
    const operatorHash = await bcrypt.hash('operator123', 10);
    await run("INSERT INTO users (username, password, role) VALUES (?, ?, 'admin')", ['admin', adminHash]);
    await run("INSERT INTO users (username, password, role) VALUES (?, ?, 'operator')", ['operator', operatorHash]);
  }

  console.log('Seeding products (4 per category)...');

  const products = [
    // Seeds (SEED001-004)
    { pid: 'SEED001', cat: 'seeds', name: 'Tomato Seeds', variety: 'Hybrid F1', qty: 200, unit: 'packet', bp: 80, sp: 120, sup: 'Rasi Seeds Pvt Ltd' },
    { pid: 'SEED002', cat: 'seeds', name: 'Brinjal Seeds', variety: 'Pusa Purple Long', qty: 150, unit: 'packet', bp: 60, sp: 95, sup: 'Mahyco Seeds' },
    { pid: 'SEED003', cat: 'seeds', name: 'Paddy Seeds', variety: 'BPT 5204', qty: 500, unit: 'kg', bp: 45, sp: 65, sup: 'APSEED Corporation' },
    { pid: 'SEED004', cat: 'seeds', name: 'Chilli Seeds', variety: 'Teja S17', qty: 100, unit: 'packet', bp: 110, sp: 160, sup: 'Nunhems Seeds' },

    // Fertilizers (FERT001-004)
    { pid: 'FERT001', cat: 'fertilizers', name: 'NPK Fertilizer', variety: '19-19-19', qty: 1000, unit: 'kg', bp: 55, sp: 72, sup: 'Coromandel International' },
    { pid: 'FERT002', cat: 'fertilizers', name: 'Urea', variety: 'Neem Coated', qty: 800, unit: 'kg', bp: 30, sp: 42, sup: 'IFFCO' },
    { pid: 'FERT003', cat: 'fertilizers', name: 'DAP Fertilizer', variety: '18-46-0', qty: 600, unit: 'bag', bp: 1350, sp: 1600, sup: 'Tata Chemicals' },
    { pid: 'FERT004', cat: 'fertilizers', name: 'Potash', variety: 'MOP 60%', qty: 400, unit: 'kg', bp: 38, sp: 52, sup: 'IPL Fertilizers' },

    // Pesticides (PEST001-004)
    { pid: 'PEST001', cat: 'pesticides', name: 'Chlorpyrifos', variety: '20% EC', qty: 100, unit: 'liters', bp: 320, sp: 450, sup: 'UPL Limited' },
    { pid: 'PEST002', cat: 'pesticides', name: 'Imidacloprid', variety: '17.8% SL', qty: 80, unit: 'liters', bp: 580, sp: 750, sup: 'Bayer CropScience' },
    { pid: 'PEST003', cat: 'pesticides', name: 'Mancozeb', variety: '75% WP', qty: 200, unit: 'kg', bp: 400, sp: 550, sup: 'Indofil Industries' },
    { pid: 'PEST004', cat: 'pesticides', name: 'Neem Oil', variety: 'Azadirachtin 1%', qty: 150, unit: 'liters', bp: 220, sp: 320, sup: 'Parry Agro' },

    // Tools (TOOL001-004)
    { pid: 'TOOL001', cat: 'tools', name: 'Hand Sprayer', variety: '16 Liter Manual', qty: 24, unit: 'pieces', bp: 850, sp: 1100, sup: 'Kisan Agri Tools' },
    { pid: 'TOOL002', cat: 'tools', name: 'Garden Hoe', variety: 'Forged Steel Blade', qty: 18, unit: 'pieces', bp: 320, sp: 450, sup: 'GreenField Implements' },
    { pid: 'TOOL003', cat: 'tools', name: 'Pruning Shear', variety: 'Heavy Duty', qty: 30, unit: 'pieces', bp: 260, sp: 390, sup: 'Falcon Farm Supplies' },
    { pid: 'TOOL004', cat: 'tools', name: 'PVC Watering Can', variety: '10 Liter', qty: 20, unit: 'pieces', bp: 210, sp: 320, sup: 'AgroServe Traders' },
  ];

  for (const p of products) {
    await run(
      `INSERT INTO products (product_id, category, product_name, variety, quantity_available, unit, purchase_price, selling_price, supplier)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [p.pid, p.cat, p.name, p.variety, p.qty, p.unit, p.bp, p.sp, p.sup]
    );
  }

  // Also record initial purchase entries for each product
  const crypto = require('crypto');
  const allProducts = await all('SELECT * FROM products ORDER BY category, product_name');

  const actingUser = await get(`
    SELECT id
    FROM users
    WHERE is_active = 1
    ORDER BY CASE WHEN username = 'admin' THEN 0 ELSE 1 END, id
    LIMIT 1
  `);

  if (!actingUser) {
    throw new Error('No active users available to attach purchase records.');
  }

  const baseDate = new Date('2026-04-01T09:00:00');

  for (const [index, prod] of allProducts.entries()) {
    const purchaseId = 'PUR' + Date.now() + crypto.randomBytes(2).toString('hex').toUpperCase();
    const purchaseDate = new Date(baseDate.getTime() + index * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    await run(
      `INSERT INTO purchases (purchase_id, product_id, quantity, price_per_unit, total_amount, supplier, purchase_date, added_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [purchaseId, prod.id, prod.quantity_available, prod.purchase_price,
       prod.quantity_available * prod.purchase_price, prod.supplier, purchaseDate, actingUser.id]
    );
    // Small delay to ensure unique purchase IDs
    await new Promise(r => setTimeout(r, 5));
  }

  console.log('Done! Seeded:');
  console.log('  - 4 categories (seeds, fertilizers, pesticides, tools)');
  console.log('  - Existing login users preserved (or defaults created if missing)');
  console.log('  - 16 products (4 per category) with purchase-backed sample records');

  db.close();
}

seed().catch(err => {
  console.error('Seed error:', err);
  db.close();
  process.exit(1);
});
