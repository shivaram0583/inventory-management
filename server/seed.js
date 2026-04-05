const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const bcrypt = require('bcryptjs');
const { db, runQuery, getRow, getAll } = require('./database/db');

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function formatIST(date) {
  return date.toLocaleString('sv-SE', { timeZone: 'Asia/Kolkata' }).replace('T', ' ');
}

function dateOnlyIST(date) {
  return formatIST(date).slice(0, 10);
}

function shiftDays(baseDate, days) {
  return new Date(baseDate.getTime() + (days * 24 * 60 * 60 * 1000));
}

async function waitForSchema() {
  const requiredTables = [
    'users', 'products', 'product_categories', 'sales', 'receipts', 'customer_sales',
    'purchases', 'bank_accounts', 'daily_operation_setup', 'expenditures',
    'bank_transfers', 'supplier_payments', 'customers', 'customer_payments',
    'sales_returns', 'quotations', 'quotation_items', 'stock_adjustments',
    'audit_log', 'notifications', 'suppliers', 'warehouses', 'warehouse_stock',
    'warehouse_transfers', 'price_tiers', 'product_promotions', 'customer_pricing'
  ];

  const startedAt = Date.now();
  while (Date.now() - startedAt < 15000) {
    const tables = await getAll(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table'
    `);
    const tableNames = new Set(tables.map((row) => row.name));
    const receiptsColumns = await getAll('PRAGMA table_info(receipts)');
    const saleIdColumn = receiptsColumns.find((column) => column.name === 'sale_id');

    if (
      requiredTables.every((tableName) => tableNames.has(tableName)) &&
      saleIdColumn &&
      String(saleIdColumn.type || '').toUpperCase() === 'TEXT'
    ) {
      return;
    }

    await wait(250);
  }

  throw new Error('Database schema was not ready in time. Start the server once and retry seeding.');
}

async function getColumns(tableName) {
  const rows = await getAll(`PRAGMA table_info(${tableName})`);
  return rows.map((row) => row.name);
}

async function insertRow(tableName, record) {
  const columns = await getColumns(tableName);
  const entries = Object.entries(record).filter(([key, value]) => columns.includes(key) && value !== undefined);
  if (entries.length === 0) {
    throw new Error(`No insertable columns found for ${tableName}`);
  }

  const names = entries.map(([key]) => key);
  const placeholders = names.map(() => '?').join(', ');
  const values = entries.map(([, value]) => value);
  const result = await runQuery(`INSERT INTO ${tableName} (${names.join(', ')}) VALUES (${placeholders})`, values);
  return result.id;
}

async function updateRow(tableName, record, whereClause, whereParams = []) {
  const columns = await getColumns(tableName);
  const entries = Object.entries(record).filter(([key, value]) => columns.includes(key) && value !== undefined);
  if (entries.length === 0) return;

  const assignments = entries.map(([key]) => `${key} = ?`).join(', ');
  const values = entries.map(([, value]) => value);
  await runQuery(`UPDATE ${tableName} SET ${assignments} WHERE ${whereClause}`, [...values, ...whereParams]);
}

async function clearScenarioData() {
  const existingTables = new Set(
    (await getAll(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table'
    `)).map((row) => row.name)
  );

  const deleteOrder = [
    'price_tiers', 'product_promotions', 'customer_pricing',
    'warehouse_transfers', 'warehouse_stock', 'warehouses', 'quotation_items', 'quotations',
    'sales_returns', 'customer_payments', 'notifications', 'audit_log', 'customer_sales',
    'receipts', 'sales', 'supplier_payments', 'bank_transfers', 'expenditures',
    'daily_operation_setup', 'bank_accounts', 'purchases', 'customers', 'suppliers',
    'login_logs', 'sessions', 'sales_v2', 'products_v4', 'products_v3', 'products_v2',
    'products', 'product_categories'
  ];

  await runQuery('PRAGMA foreign_keys = OFF');
  try {
    for (const tableName of deleteOrder) {
      if (existingTables.has(tableName)) {
        await runQuery(`DELETE FROM ${tableName}`);
      }
    }

    if (existingTables.has('users')) {
      await runQuery(`DELETE FROM users WHERE username NOT IN ('admin', 'operator')`);
    }

    const resettableTables = deleteOrder.filter((tableName) => existingTables.has(tableName));
    if (existingTables.has('sqlite_sequence') && resettableTables.length > 0) {
      const placeholders = resettableTables.map(() => '?').join(', ');
      await runQuery(`DELETE FROM sqlite_sequence WHERE name IN (${placeholders})`, resettableTables);
    }
  } finally {
    await runQuery('PRAGMA foreign_keys = ON');
  }
}

async function ensureBaseUsers() {
  const adminPassword = await bcrypt.hash('admin123', 10);
  const operatorPassword = await bcrypt.hash('operator123', 10);

  const admin = await getRow('SELECT id FROM users WHERE username = ?', ['admin']);
  if (admin) {
    await updateRow('users', { password: adminPassword, role: 'admin', is_active: 1, force_password_change: 1, password_changed_at: null }, 'id = ?', [admin.id]);
  } else {
    await insertRow('users', { username: 'admin', password: adminPassword, role: 'admin', is_active: 1, force_password_change: 1, password_changed_at: null });
  }

  const operator = await getRow('SELECT id FROM users WHERE username = ?', ['operator']);
  if (operator) {
    await updateRow('users', { password: operatorPassword, role: 'operator', is_active: 1, force_password_change: 1, password_changed_at: null }, 'id = ?', [operator.id]);
  } else {
    await insertRow('users', { username: 'operator', password: operatorPassword, role: 'operator', is_active: 1, force_password_change: 1, password_changed_at: null });
  }

  return {
    admin: await getRow('SELECT * FROM users WHERE username = ?', ['admin']),
    operator: await getRow('SELECT * FROM users WHERE username = ?', ['operator'])
  };
}

async function seedScenarioData() {
  await waitForSchema();
  await clearScenarioData();

  const { admin, operator } = await ensureBaseUsers();
  const now = new Date('2026-04-05T10:30:00+05:30');

  const categories = ['seeds', 'fertilizers', 'pesticides', 'tools'];
  for (const category of categories) {
    await insertRow('product_categories', { name: category, created_at: formatIST(shiftDays(now, -25)) });
  }

  const suppliers = [
    { name: 'Rasi Seeds Pvt Ltd', contact_person: 'Suresh Rao', mobile: '9011001100', email: 'rasi@example.com', address: 'Hyderabad', gstin: '36ABCDE1234F1Z1' },
    { name: 'Mahyco Seeds', contact_person: 'Naveen Kumar', mobile: '9011002200', email: 'mahyco@example.com', address: 'Guntur', gstin: '37ABCDE1234F1Z2' },
    { name: 'IFFCO Agri Inputs', contact_person: 'Harish Patel', mobile: '9011003300', email: 'iffco@example.com', address: 'Vijayawada', gstin: '37ABCDE1234F1Z3' },
    { name: 'Tata Chemicals', contact_person: 'Pradeep Singh', mobile: '9011004400', email: 'tatachem@example.com', address: 'Kakinada', gstin: '37ABCDE1234F1Z4' },
    { name: 'BioCrop Crop Science', contact_person: 'Anita Reddy', mobile: '9011005500', email: 'biocrop@example.com', address: 'Warangal', gstin: '36ABCDE1234F1Z5' },
    { name: 'Kisan Tools Depot', contact_person: 'Manoj Sharma', mobile: '9011006600', email: 'kisantools@example.com', address: 'Nalgonda', gstin: '36ABCDE1234F1Z6' }
  ];
  for (const supplier of suppliers) {
    await insertRow('suppliers', {
      ...supplier,
      is_active: 1,
      created_at: formatIST(shiftDays(now, -40)),
      updated_at: formatIST(shiftDays(now, -4))
    });
  }

  const bankAccountIds = {};
  bankAccountIds.main = await insertRow('bank_accounts', {
    account_name: 'Main Current Account',
    bank_name: 'State Bank of India',
    account_number: '000111222333',
    balance: 85000,
    is_active: 1,
    created_at: formatIST(shiftDays(now, -60)),
    updated_at: formatIST(shiftDays(now, -1))
  });
  bankAccountIds.upi = await insertRow('bank_accounts', {
    account_name: 'UPI Settlement Account',
    bank_name: 'HDFC Bank',
    account_number: '444555666777',
    balance: 42000,
    is_active: 1,
    created_at: formatIST(shiftDays(now, -60)),
    updated_at: formatIST(shiftDays(now, -2))
  });
  bankAccountIds.ops = await insertRow('bank_accounts', {
    account_name: 'Operations Account',
    bank_name: 'ICICI Bank',
    account_number: '888999000111',
    balance: 30000,
    is_active: 1,
    created_at: formatIST(shiftDays(now, -60)),
    updated_at: formatIST(shiftDays(now, -3))
  });

  await insertRow('daily_operation_setup', {
    business_date: '2026-04-05',
    selected_bank_account_id: bankAccountIds.main,
    bank_selected_by: admin.id,
    bank_selected_at: formatIST(shiftDays(now, 0)),
    opening_balance_snapshot: 83500,
    closing_balance_snapshot: 85000,
    balance_reviewed_by: admin.id,
    balance_reviewed_at: formatIST(shiftDays(now, 0)),
    created_at: formatIST(shiftDays(now, 0)),
    updated_at: formatIST(shiftDays(now, 0))
  });

  const productCatalog = [
    { code: 'SEED001', category: 'seeds', name: 'Tomato Seeds', variety: 'Hybrid F1', unit: 'packet', purchase_price: 80, selling_price: 120, supplier: 'Rasi Seeds Pvt Ltd', gst_percent: 5, hsn_code: '120991', reorder_point: 25, reorder_quantity: 80, barcode: '890100000001', expiry_date: '2026-08-31', batch_number: 'TOM-APR-01', manufacturing_date: '2026-03-01' },
    { code: 'SEED002', category: 'seeds', name: 'Paddy Seeds', variety: 'BPT 5204', unit: 'kg', purchase_price: 45, selling_price: 70, supplier: 'Mahyco Seeds', gst_percent: 5, hsn_code: '100610', reorder_point: 40, reorder_quantity: 120, barcode: '890100000002', expiry_date: '2026-12-31', batch_number: 'PAD-APR-01', manufacturing_date: '2026-02-10' },
    { code: 'SEED003', category: 'seeds', name: 'Chilli Seeds', variety: 'Teja', unit: 'packet', purchase_price: 110, selling_price: 160, supplier: 'Rasi Seeds Pvt Ltd', gst_percent: 5, hsn_code: '120991', reorder_point: 35, reorder_quantity: 70, barcode: '890100000003', expiry_date: '2026-07-15', batch_number: 'CHI-MAR-04', manufacturing_date: '2026-02-28' },
    { code: 'FERT001', category: 'fertilizers', name: 'Urea', variety: 'Neem Coated', unit: 'bag', purchase_price: 300, selling_price: 380, supplier: 'IFFCO Agri Inputs', gst_percent: 5, hsn_code: '310210', reorder_point: 35, reorder_quantity: 100, barcode: '890100000004', expiry_date: '2026-04-22', batch_number: 'URE-FEB-02', manufacturing_date: '2026-01-12' },
    { code: 'FERT002', category: 'fertilizers', name: 'DAP', variety: '18-46-0', unit: 'bag', purchase_price: 1250, selling_price: 1450, supplier: 'Tata Chemicals', gst_percent: 5, hsn_code: '310530', reorder_point: 20, reorder_quantity: 60, barcode: '890100000005', expiry_date: '2026-05-15', batch_number: 'DAP-JAN-03', manufacturing_date: '2026-01-05' },
    { code: 'FERT003', category: 'fertilizers', name: 'Potash', variety: 'MOP 60%', unit: 'kg', purchase_price: 38, selling_price: 52, supplier: 'IFFCO Agri Inputs', gst_percent: 5, hsn_code: '310420', reorder_point: 30, reorder_quantity: 90, barcode: '890100000006', expiry_date: '2026-10-10', batch_number: 'POT-MAR-02', manufacturing_date: '2026-02-15' },
    { code: 'PEST001', category: 'pesticides', name: 'Confidor Insecticide', variety: '100 ml', unit: 'bottles', purchase_price: 540, selling_price: 690, supplier: 'BioCrop Crop Science', gst_percent: 18, hsn_code: '380891', reorder_point: 12, reorder_quantity: 36, barcode: '890100000007', expiry_date: '2027-01-31', batch_number: 'PST-MAR-01', manufacturing_date: '2026-03-05' },
    { code: 'PEST002', category: 'pesticides', name: 'Carbendazim Fungicide', variety: '500 g', unit: 'pieces', purchase_price: 260, selling_price: 340, supplier: 'BioCrop Crop Science', gst_percent: 18, hsn_code: '380892', reorder_point: 20, reorder_quantity: 60, barcode: '890100000008', expiry_date: '2027-02-28', batch_number: 'FUN-MAR-02', manufacturing_date: '2026-03-12' },
    { code: 'TOOL001', category: 'tools', name: 'Battery Sprayer', variety: '16 L', unit: 'pieces', purchase_price: 1650, selling_price: 2100, supplier: 'Kisan Tools Depot', gst_percent: 18, hsn_code: '842441', reorder_point: 5, reorder_quantity: 12, barcode: '890100000009', expiry_date: null, batch_number: 'SPR-JAN-01', manufacturing_date: '2026-01-15' },
    { code: 'TOOL002', category: 'tools', name: 'Pruning Shear', variety: 'Heavy Duty', unit: 'pieces', purchase_price: 180, selling_price: 260, supplier: 'Kisan Tools Depot', gst_percent: 18, hsn_code: '820150', reorder_point: 10, reorder_quantity: 24, barcode: '890100000010', expiry_date: null, batch_number: 'TOOL-FEB-03', manufacturing_date: '2026-02-01' }
  ];

  const productIds = {};
  const stockLevels = {};
  for (const product of productCatalog) {
    productIds[product.code] = await insertRow('products', {
      product_id: product.code,
      category: product.category,
      product_name: product.name,
      variety: product.variety,
      quantity_available: 0,
      unit: product.unit,
      purchase_price: product.purchase_price,
      selling_price: product.selling_price,
      supplier: product.supplier,
      gst_percent: product.gst_percent,
      hsn_code: product.hsn_code,
      reorder_point: product.reorder_point,
      reorder_quantity: product.reorder_quantity,
      barcode: product.barcode,
      expiry_date: product.expiry_date,
      batch_number: product.batch_number,
      manufacturing_date: product.manufacturing_date,
      is_deleted: 0,
      created_at: formatIST(shiftDays(now, -30)),
      updated_at: formatIST(shiftDays(now, -2))
    });
    stockLevels[product.code] = 0;
  }

  const customers = {};
  customers.walkIn = await insertRow('customers', { name: 'Walk-in Farmer', mobile: '9000000001', email: 'walkin@example.com', address: 'Mandal Main Road', gstin: '', credit_limit: 0, outstanding_balance: 0, is_active: 1, created_at: formatIST(shiftDays(now, -50)), updated_at: formatIST(shiftDays(now, -1)) });
  customers.lakshmi = await insertRow('customers', { name: 'Lakshmi Agro Services', mobile: '9000000002', email: 'lakshmi.agro@example.com', address: 'Market Yard, Khammam', gstin: '36ABCDE9999F1Z9', credit_limit: 50000, outstanding_balance: 0, is_active: 1, created_at: formatIST(shiftDays(now, -80)), updated_at: formatIST(shiftDays(now, -1)) });
  customers.ramesh = await insertRow('customers', { name: 'Ramesh Farms', mobile: '9000000003', email: 'ramesh@example.com', address: 'Village Tank Bund', gstin: '', credit_limit: 15000, outstanding_balance: 0, is_active: 1, created_at: formatIST(shiftDays(now, -65)), updated_at: formatIST(shiftDays(now, -2)) });
  customers.greenValley = await insertRow('customers', { name: 'Green Valley Traders', mobile: '9000000004', email: 'greenvalley@example.com', address: 'RTC Cross Road', gstin: '37ABCDE9999F1Z7', credit_limit: 75000, outstanding_balance: 0, is_active: 1, created_at: formatIST(shiftDays(now, -40)), updated_at: formatIST(shiftDays(now, -1)) });
  customers.sriDurga = await insertRow('customers', { name: 'Sri Durga Farms', mobile: '9000000005', email: 'durga@example.com', address: 'Narasaraopet Rural', gstin: '', credit_limit: 25000, outstanding_balance: 0, is_active: 1, created_at: formatIST(shiftDays(now, -35)), updated_at: formatIST(shiftDays(now, -1)) });
  customers.venkata = await insertRow('customers', { name: 'Venkata Rythu Seva', mobile: '9000000006', email: 'venkata@example.com', address: 'Sattenapalli Main Road', gstin: '37ABCDE9999F1Z6', credit_limit: 40000, outstanding_balance: 0, is_active: 1, created_at: formatIST(shiftDays(now, -28)), updated_at: formatIST(shiftDays(now, -1)) });

  for (const tier of [
    { code: 'SEED001', min_quantity: 10, price_per_unit: 112, label: 'Bulk farmer price (10+)' },
    { code: 'SEED001', min_quantity: 25, price_per_unit: 105, label: 'Seasonal bulk lot (25+)' },
    { code: 'FERT001', min_quantity: 10, price_per_unit: 360, label: 'Bag stack discount' },
    { code: 'PEST001', min_quantity: 6, price_per_unit: 640, label: 'Pest control campaign pack' },
    { code: 'TOOL002', min_quantity: 12, price_per_unit: 235, label: 'Retail shelf restock' }
  ]) {
    await insertRow('price_tiers', {
      product_id: productIds[tier.code],
      min_quantity: tier.min_quantity,
      price_per_unit: tier.price_per_unit,
      label: tier.label,
      created_at: formatIST(shiftDays(now, -15)),
      updated_at: formatIST(shiftDays(now, -2))
    });
  }

  for (const promotion of [
    { code: 'SEED003', promotional_price: 149, start_date: '2026-04-01', end_date: '2026-04-15', label: 'Chilli season promo', is_active: 1 },
    { code: 'FERT002', promotional_price: 1395, start_date: '2026-04-03', end_date: '2026-04-10', label: 'April DAP promo', is_active: 1 },
    { code: 'TOOL001', promotional_price: 1990, start_date: '2026-04-01', end_date: '2026-04-07', label: 'Sprayer launch offer', is_active: 1 },
    { code: 'PEST002', promotional_price: 315, start_date: '2026-03-01', end_date: '2026-03-20', label: 'Pre-season fungicide promo', is_active: 1 }
  ]) {
    await insertRow('product_promotions', {
      product_id: productIds[promotion.code],
      promotional_price: promotion.promotional_price,
      start_date: promotion.start_date,
      end_date: promotion.end_date,
      label: promotion.label,
      is_active: promotion.is_active,
      created_at: formatIST(shiftDays(now, -12)),
      updated_at: formatIST(shiftDays(now, -1))
    });
  }

  for (const specialPrice of [
    { customerId: customers.lakshmi, code: 'FERT002', price_per_unit: 1375, start_date: '2026-04-01', end_date: '2026-04-30', notes: 'Contract farming price' },
    { customerId: customers.greenValley, code: 'PEST001', price_per_unit: 625, start_date: '2026-04-01', end_date: '2026-04-20', notes: 'Dealer resale rate' },
    { customerId: customers.sriDurga, code: 'SEED002', price_per_unit: 66, start_date: '2026-04-01', end_date: '2026-04-30', notes: 'Paddy season rate' },
    { customerId: customers.venkata, code: 'TOOL002', price_per_unit: 225, start_date: '2026-04-01', end_date: null, notes: 'Loyalty hardware rate' }
  ]) {
    await insertRow('customer_pricing', {
      customer_id: specialPrice.customerId,
      product_id: productIds[specialPrice.code],
      price_per_unit: specialPrice.price_per_unit,
      start_date: specialPrice.start_date,
      end_date: specialPrice.end_date,
      notes: specialPrice.notes,
      created_at: formatIST(shiftDays(now, -10)),
      updated_at: formatIST(shiftDays(now, -1))
    });
  }

  const purchaseRows = [
    { id: 'PUR-DEL-001', code: 'SEED001', quantity: 150, delivered: 150, price: 80, supplier: 'Rasi Seeds Pvt Ltd', status: 'delivered', date: formatIST(shiftDays(now, -25)), actor: admin.id },
    { id: 'PUR-DEL-002', code: 'SEED002', quantity: 320, delivered: 320, price: 45, supplier: 'Mahyco Seeds', status: 'delivered', date: formatIST(shiftDays(now, -24)), actor: admin.id },
    { id: 'PUR-DEL-003', code: 'SEED003', quantity: 35, delivered: 35, price: 110, supplier: 'Rasi Seeds Pvt Ltd', status: 'delivered', date: formatIST(shiftDays(now, -20)), actor: operator.id },
    { id: 'PUR-DEL-004', code: 'FERT001', quantity: 180, delivered: 180, price: 300, supplier: 'IFFCO Agri Inputs', status: 'delivered', date: formatIST(shiftDays(now, -18)), actor: admin.id },
    { id: 'PUR-DEL-005', code: 'FERT002', quantity: 20, delivered: 20, price: 1250, supplier: 'Tata Chemicals', status: 'delivered', date: formatIST(shiftDays(now, -16)), actor: admin.id },
    { id: 'PUR-DEL-006', code: 'FERT003', quantity: 90, delivered: 90, price: 38, supplier: 'IFFCO Agri Inputs', status: 'delivered', date: formatIST(shiftDays(now, -15)), actor: operator.id },
    { id: 'PUR-DEL-007', code: 'PEST001', quantity: 48, delivered: 48, price: 540, supplier: 'BioCrop Crop Science', status: 'delivered', date: formatIST(shiftDays(now, -14)), actor: admin.id },
    { id: 'PUR-DEL-008', code: 'PEST002', quantity: 70, delivered: 70, price: 260, supplier: 'BioCrop Crop Science', status: 'delivered', date: formatIST(shiftDays(now, -13)), actor: operator.id },
    { id: 'PUR-DEL-009', code: 'TOOL001', quantity: 18, delivered: 18, price: 1650, supplier: 'Kisan Tools Depot', status: 'delivered', date: formatIST(shiftDays(now, -12)), actor: admin.id },
    { id: 'PUR-DEL-010', code: 'TOOL002', quantity: 60, delivered: 60, price: 180, supplier: 'Kisan Tools Depot', status: 'delivered', date: formatIST(shiftDays(now, -11)), actor: operator.id },
    { id: 'PUR-PART-001', code: 'FERT001', quantity: 100, delivered: 40, price: 310, supplier: 'IFFCO Agri Inputs', status: 'ordered', date: formatIST(shiftDays(now, -8)), delivery_date: formatIST(shiftDays(now, -2)), advance_amount: 4000, actor: admin.id },
    { id: 'PUR-ORD-001', code: 'FERT002', quantity: 40, delivered: 0, price: 1300, supplier: 'Tata Chemicals', status: 'ordered', date: formatIST(shiftDays(now, -5)), advance_amount: 5000, actor: operator.id },
    { id: 'PUR-ORD-002', code: 'PEST001', quantity: 24, delivered: 0, price: 530, supplier: 'BioCrop Crop Science', status: 'ordered', date: formatIST(shiftDays(now, -4)), advance_amount: 2500, actor: operator.id },
    { id: 'PUR-CAN-001', code: 'SEED001', quantity: 60, delivered: 0, price: 82, supplier: 'Rasi Seeds Pvt Ltd', status: 'cancelled', date: formatIST(shiftDays(now, -12)), advance_amount: 1200, actor: admin.id }
  ];

  const supplierPaymentIds = {};
  supplierPaymentIds.partial = await insertRow('supplier_payments', { supplier_name: 'IFFCO Agri Inputs', amount: 4000, payment_mode: 'bank', bank_account_id: bankAccountIds.ops, description: 'Advance payment for purchase PUR-PART-001', payment_date: dateOnlyIST(shiftDays(now, -8)), created_by: admin.id, created_at: formatIST(shiftDays(now, -8)) });
  supplierPaymentIds.pending = await insertRow('supplier_payments', { supplier_name: 'Tata Chemicals', amount: 5000, payment_mode: 'bank', bank_account_id: bankAccountIds.main, description: 'Advance payment for purchase PUR-ORD-001', payment_date: dateOnlyIST(shiftDays(now, -5)), created_by: operator.id, created_at: formatIST(shiftDays(now, -5)) });
  supplierPaymentIds.biocrop = await insertRow('supplier_payments', { supplier_name: 'BioCrop Crop Science', amount: 2500, payment_mode: 'bank', bank_account_id: bankAccountIds.main, description: 'Advance payment for purchase PUR-ORD-002', payment_date: dateOnlyIST(shiftDays(now, -4)), created_by: operator.id, created_at: formatIST(shiftDays(now, -4)) });

  for (const paymentId of Object.values(supplierPaymentIds)) {
    const payment = await getRow('SELECT * FROM supplier_payments WHERE id = ?', [paymentId]);
    await insertRow('bank_transfers', {
      bank_account_id: payment.bank_account_id,
      amount: payment.amount,
      transfer_type: 'withdrawal',
      source_type: 'supplier_payment',
      source_reference: `supplier-payment:${payment.id}`,
      payment_mode: payment.payment_mode,
      description: payment.description,
      transfer_date: payment.payment_date,
      created_by: payment.created_by,
      created_at: payment.created_at,
      withdrawal_purpose: 'purchase_advance'
    });
  }

  for (const purchase of purchaseRows) {
    await insertRow('purchases', {
      purchase_id: purchase.id,
      product_id: productIds[purchase.code],
      quantity: purchase.quantity,
      price_per_unit: purchase.price,
      total_amount: purchase.quantity * purchase.price,
      supplier: purchase.supplier,
      purchase_date: purchase.date,
      delivery_date: purchase.delivery_date || (purchase.status === 'delivered' ? purchase.date : null),
      purchase_status: purchase.status,
      advance_amount: purchase.advance_amount || 0,
      quantity_delivered: purchase.delivered,
      advance_payment_id: purchase.id === 'PUR-PART-001'
        ? supplierPaymentIds.partial
        : purchase.id === 'PUR-ORD-001'
          ? supplierPaymentIds.pending
          : purchase.id === 'PUR-ORD-002'
            ? supplierPaymentIds.biocrop
            : null,
      added_by: purchase.actor,
      created_at: purchase.date,
      updated_at: purchase.delivery_date || purchase.date
    });

    stockLevels[purchase.code] += purchase.delivered;
  }

  const saleRows = [
    {
      saleId: 'SALE-20260404-001',
      date: formatIST(shiftDays(now, -1)),
      receiptNumber: 'R-20260404-WALKIN-01',
      customerName: 'Walk-in Farmer',
      customerMobile: '9000000001',
      customerAddress: 'Mandal Main Road',
      customerId: customers.walkIn,
      paymentMode: 'cash',
      paymentStatus: 'paid',
      bankAccountId: null,
      operatorId: operator.id,
      items: [
        { code: 'SEED001', quantity: 4, price: 120, gst: 5, tax: 24, total: 504 },
        { code: 'FERT003', quantity: 5, price: 52, gst: 5, tax: 13, total: 273 }
      ]
    },
    {
      saleId: 'SALE-20260403-002',
      date: formatIST(shiftDays(now, -2)),
      receiptNumber: 'R-20260403-RAMESH-02',
      customerName: 'Ramesh Farms',
      customerMobile: '9000000003',
      customerAddress: 'Village Tank Bund',
      customerId: customers.ramesh,
      paymentMode: 'upi',
      paymentStatus: 'paid',
      bankAccountId: bankAccountIds.upi,
      operatorId: operator.id,
      items: [
        { code: 'SEED002', quantity: 10, price: 70, gst: 5, tax: 35, total: 735 }
      ]
    },
    {
      saleId: 'SALE-20260220-003',
      date: formatIST(shiftDays(now, -45)),
      receiptNumber: 'R-20260220-LAKSHMI-03',
      customerName: 'Lakshmi Agro Services',
      customerMobile: '9000000002',
      customerAddress: 'Market Yard, Khammam',
      customerId: customers.lakshmi,
      paymentMode: 'credit',
      paymentStatus: 'credit',
      bankAccountId: null,
      operatorId: admin.id,
      items: [
        { code: 'FERT001', quantity: 6, price: 380, gst: 5, tax: 114, total: 2394 },
        { code: 'FERT002', quantity: 4, price: 1450, gst: 5, tax: 290, total: 6090 }
      ]
    },
    {
      saleId: 'SALE-20260405-004',
      date: formatIST(shiftDays(now, 0)),
      receiptNumber: 'R-20260405-GREEN-04',
      customerName: 'Green Valley Traders',
      customerMobile: '9000000004',
      customerAddress: 'RTC Cross Road',
      customerId: customers.greenValley,
      paymentMode: 'bank',
      paymentStatus: 'paid',
      bankAccountId: bankAccountIds.main,
      operatorId: admin.id,
      items: [
        { code: 'PEST001', quantity: 6, price: 625, gst: 18, tax: 675, total: 4425, pricingRuleType: 'customer', pricingRuleLabel: 'Dealer resale rate' },
        { code: 'TOOL001', quantity: 1, price: 1990, gst: 18, tax: 358.2, total: 2348.2, pricingRuleType: 'promotion', pricingRuleLabel: 'Sprayer launch offer' }
      ]
    },
    {
      saleId: 'SALE-20260401-005',
      date: formatIST(shiftDays(now, -4)),
      receiptNumber: 'R-20260401-DURGA-05',
      customerName: 'Sri Durga Farms',
      customerMobile: '9000000005',
      customerAddress: 'Narasaraopet Rural',
      customerId: customers.sriDurga,
      paymentMode: 'cash',
      paymentStatus: 'paid',
      bankAccountId: null,
      operatorId: operator.id,
      items: [
        { code: 'SEED002', quantity: 30, price: 66, gst: 5, tax: 99, total: 2079, pricingRuleType: 'customer', pricingRuleLabel: 'Paddy season rate' },
        { code: 'SEED001', quantity: 12, price: 112, gst: 5, tax: 67.2, total: 1411.2, pricingRuleType: 'tier', pricingRuleLabel: 'Bulk farmer price (10+)' }
      ]
    }
  ];

  const saleMeta = {};
  for (const sale of saleRows) {
    for (const item of sale.items) {
      await insertRow('sales', {
        sale_id: sale.saleId,
        product_id: productIds[item.code],
        quantity_sold: item.quantity,
        price_per_unit: item.price,
        total_amount: item.total,
        discount_amount: 0,
        tax_amount: item.tax,
        gst_percent: item.gst,
        pricing_rule_type: item.pricingRuleType || null,
        pricing_rule_label: item.pricingRuleLabel || null,
        sale_date: sale.date,
        operator_id: sale.operatorId,
        customer_id: sale.customerId,
        created_at: sale.date
      });
      stockLevels[item.code] -= item.quantity;
    }

    const receiptTotal = sale.items.reduce((sum, item) => sum + item.total, 0);
    const receiptId = await insertRow('receipts', {
      receipt_number: sale.receiptNumber,
      sale_id: sale.saleId,
      customer_name: sale.customerName,
      customer_mobile: sale.customerMobile,
      customer_address: sale.customerAddress,
      payment_mode: sale.paymentMode,
      total_amount: receiptTotal,
      discount_amount: 0,
      tax_amount: sale.items.reduce((sum, item) => sum + item.tax, 0),
      payment_status: sale.paymentStatus,
      customer_id: sale.customerId,
      receipt_date: sale.date,
      printed: sale.saleId === 'SALE-20260404-001' ? 1 : 0,
      created_at: sale.date
    });

    for (const item of sale.items) {
      await insertRow('customer_sales', {
        sale_id: sale.saleId,
        receipt_id: receiptId,
        customer_name: sale.customerName,
        customer_mobile: sale.customerMobile,
        customer_address: sale.customerAddress,
        product_name: productCatalog.find((product) => product.code === item.code).name,
        quantity: item.quantity,
        amount: item.total,
        payment_mode: sale.paymentMode,
        sale_date: sale.date,
        created_at: sale.date
      });
    }

    if (sale.bankAccountId) {
      await insertRow('bank_transfers', {
        bank_account_id: sale.bankAccountId,
        amount: receiptTotal,
        transfer_type: 'deposit',
        source_type: 'sale',
        source_reference: sale.saleId,
        payment_mode: sale.paymentMode,
        description: `Auto-deposit: ${sale.paymentMode.toUpperCase()} sale ${sale.saleId}`,
        transfer_date: sale.date.slice(0, 10),
        created_by: sale.operatorId,
        created_at: sale.date
      });
    }

    saleMeta[sale.saleId] = { receiptId, total: receiptTotal };
  }

  await insertRow('customer_payments', {
    customer_id: customers.lakshmi,
    amount: 2500,
    payment_mode: 'bank',
    bank_account_id: bankAccountIds.main,
    reference_note: 'Part payment against February credit sale',
    payment_date: formatIST(shiftDays(now, -10)),
    collected_by: admin.id,
    created_at: formatIST(shiftDays(now, -10))
  });
  await insertRow('bank_transfers', {
    bank_account_id: bankAccountIds.main,
    amount: 2500,
    transfer_type: 'deposit',
    source_type: 'customer_payment',
    source_reference: `customer-payment:${customers.lakshmi}`,
    payment_mode: 'bank',
    description: 'Payment from Lakshmi Agro Services',
    transfer_date: dateOnlyIST(shiftDays(now, -10)),
    created_by: admin.id,
    created_at: formatIST(shiftDays(now, -10))
  });

  const returnRows = [
    { returnId: 'RET-20260404-001', saleId: 'SALE-20260403-002', code: 'SEED002', quantity: 2, price: 70, refund: 147, mode: 'bank', bankAccountId: bankAccountIds.upi, reason: 'Damaged packets returned by customer', returnedBy: operator.id, date: formatIST(shiftDays(now, -1)) },
    { returnId: 'RET-20260330-002', saleId: 'SALE-20260220-003', code: 'FERT002', quantity: 1, price: 1450, refund: 1522.5, mode: 'credit', bankAccountId: null, reason: 'Customer returned one damaged bag', returnedBy: admin.id, date: formatIST(shiftDays(now, -6)) }
  ];

  let lakshmiOutstanding = saleMeta['SALE-20260220-003'].total - 2500;
  for (const salesReturn of returnRows) {
    await insertRow('sales_returns', {
      return_id: salesReturn.returnId,
      sale_id: salesReturn.saleId,
      product_id: productIds[salesReturn.code],
      quantity_returned: salesReturn.quantity,
      price_per_unit: salesReturn.price,
      refund_amount: salesReturn.refund,
      refund_mode: salesReturn.mode,
      bank_account_id: salesReturn.bankAccountId,
      reason: salesReturn.reason,
      returned_by: salesReturn.returnedBy,
      return_date: salesReturn.date,
      created_at: salesReturn.date
    });
    stockLevels[salesReturn.code] += salesReturn.quantity;

    if (salesReturn.mode === 'bank') {
      await insertRow('bank_transfers', {
        bank_account_id: salesReturn.bankAccountId,
        amount: salesReturn.refund,
        transfer_type: 'withdrawal',
        source_type: 'sales_return',
        source_reference: `return:${salesReturn.returnId}`,
        payment_mode: 'bank',
        description: `Refund for return ${salesReturn.returnId}`,
        transfer_date: salesReturn.date.slice(0, 10),
        created_by: salesReturn.returnedBy,
        created_at: salesReturn.date,
        withdrawal_purpose: 'sales_return'
      });
    }

    if (salesReturn.saleId === 'SALE-20260220-003' && salesReturn.mode === 'credit') {
      lakshmiOutstanding -= salesReturn.refund;
    }
  }

  const adjustmentRows = [
    { code: 'SEED003', type: 'damage', quantity: -2, reason: 'Packets damaged during storage', adjustedBy: operator.id, date: formatIST(shiftDays(now, -3)) },
    { code: 'FERT003', type: 'counting_error', quantity: 3, reason: 'Physical count found extra stock', adjustedBy: admin.id, date: formatIST(shiftDays(now, -2)) }
  ];
  for (const adjustment of adjustmentRows) {
    const beforeQty = stockLevels[adjustment.code];
    const afterQty = beforeQty + adjustment.quantity;
    await insertRow('stock_adjustments', {
      product_id: productIds[adjustment.code],
      adjustment_type: adjustment.type,
      quantity_adjusted: adjustment.quantity,
      quantity_before: beforeQty,
      quantity_after: afterQty,
      reason: adjustment.reason,
      adjusted_by: adjustment.adjustedBy,
      adjustment_date: adjustment.date,
      created_at: adjustment.date
    });
    stockLevels[adjustment.code] = afterQty;
  }

  await updateRow('customers', { outstanding_balance: Number(lakshmiOutstanding.toFixed(2)) }, 'id = ?', [customers.lakshmi]);

  const quotationIds = {};
  quotationIds.draft = await insertRow('quotations', { quotation_number: 'Q-20260402-A1', customer_id: customers.greenValley, customer_name: 'Green Valley Traders', customer_mobile: '9000000004', customer_address: 'RTC Cross Road', total_amount: 3020, discount_amount: 0, tax_amount: 151, net_amount: 3171, status: 'draft', valid_until: '2026-04-16', notes: 'Initial quotation for vegetable seed and fertilizer combo', created_by: admin.id, created_at: formatIST(shiftDays(now, -3)), updated_at: formatIST(shiftDays(now, -3)) });
  quotationIds.sent = await insertRow('quotations', { quotation_number: 'Q-20260329-B2', customer_id: customers.lakshmi, customer_name: 'Lakshmi Agro Services', customer_mobile: '9000000002', customer_address: 'Market Yard, Khammam', total_amount: 6875, discount_amount: 0, tax_amount: 343.75, net_amount: 7218.75, status: 'sent', valid_until: '2026-04-12', notes: 'Sent and awaiting response', created_by: operator.id, created_at: formatIST(shiftDays(now, -7)), updated_at: formatIST(shiftDays(now, -6)) });
  quotationIds.converted = await insertRow('quotations', { quotation_number: 'Q-20260218-C3', customer_id: customers.lakshmi, customer_name: 'Lakshmi Agro Services', customer_mobile: '9000000002', customer_address: 'Market Yard, Khammam', total_amount: 8080, discount_amount: 0, tax_amount: 404, net_amount: saleMeta['SALE-20260220-003'].total, status: 'converted', valid_until: '2026-03-05', notes: 'Converted to sale', converted_sale_id: 'SALE-20260220-003', created_by: admin.id, created_at: formatIST(shiftDays(now, -47)), updated_at: formatIST(shiftDays(now, -45)) });
  quotationIds.accepted = await insertRow('quotations', { quotation_number: 'Q-20260401-D4', customer_id: customers.greenValley, customer_name: 'Green Valley Traders', customer_mobile: '9000000004', customer_address: 'RTC Cross Road', total_amount: 5740, discount_amount: 0, tax_amount: 1033.2, net_amount: 6773.2, status: 'accepted', valid_until: '2026-04-18', notes: 'Accepted and scheduled for pickup', created_by: admin.id, created_at: formatIST(shiftDays(now, -4)), updated_at: formatIST(shiftDays(now, -2)) });
  quotationIds.expired = await insertRow('quotations', { quotation_number: 'Q-20260320-E5', customer_id: customers.venkata, customer_name: 'Venkata Rythu Seva', customer_mobile: '9000000006', customer_address: 'Sattenapalli Main Road', total_amount: 2820, discount_amount: 0, tax_amount: 507.6, net_amount: 3327.6, status: 'expired', valid_until: '2026-03-27', notes: 'Expired seasonal tools offer', created_by: operator.id, created_at: formatIST(shiftDays(now, -16)), updated_at: formatIST(shiftDays(now, -8)) });

  const quotationItems = [
    { quotationId: quotationIds.draft, code: 'SEED001', quantity: 10, price: 112, discount: 0, tax: 5, total: 1176, pricingRuleType: 'tier', pricingRuleLabel: 'Bulk farmer price (10+)' },
    { quotationId: quotationIds.draft, code: 'FERT001', quantity: 5, price: 380, discount: 0, tax: 5, total: 1995 },
    { quotationId: quotationIds.sent, code: 'FERT002', quantity: 5, price: 1375, discount: 0, tax: 5, total: 7218.75, pricingRuleType: 'customer', pricingRuleLabel: 'Contract farming price' },
    { quotationId: quotationIds.converted, code: 'FERT001', quantity: 6, price: 380, discount: 0, tax: 5, total: 2394 },
    { quotationId: quotationIds.converted, code: 'FERT002', quantity: 4, price: 1450, discount: 0, tax: 5, total: 6090 },
    { quotationId: quotationIds.accepted, code: 'PEST001', quantity: 6, price: 625, discount: 0, tax: 18, total: 4425, pricingRuleType: 'customer', pricingRuleLabel: 'Dealer resale rate' },
    { quotationId: quotationIds.accepted, code: 'TOOL001', quantity: 1, price: 1990, discount: 0, tax: 18, total: 2348.2, pricingRuleType: 'promotion', pricingRuleLabel: 'Sprayer launch offer' },
    { quotationId: quotationIds.expired, code: 'TOOL002', quantity: 12, price: 235, discount: 0, tax: 18, total: 3327.6, pricingRuleType: 'tier', pricingRuleLabel: 'Retail shelf restock' }
  ];
  for (const item of quotationItems) {
    await insertRow('quotation_items', {
      quotation_id: item.quotationId,
      product_id: productIds[item.code],
      quantity: item.quantity,
      price_per_unit: item.price,
      discount_percent: item.discount,
      tax_percent: item.tax,
      pricing_rule_type: item.pricingRuleType || null,
      pricing_rule_label: item.pricingRuleLabel || null,
      total_amount: item.total
    });
  }

  for (const expense of [
    { amount: 1800, description: 'Freight charges for incoming fertilizer stock', category: 'logistics', expense_date: dateOnlyIST(shiftDays(now, -6)), created_by: admin.id, created_at: formatIST(shiftDays(now, -6)) },
    { amount: 950, description: 'Warehouse maintenance and cleaning', category: 'maintenance', expense_date: dateOnlyIST(shiftDays(now, -3)), created_by: admin.id, created_at: formatIST(shiftDays(now, -3)) }
  ]) {
    await insertRow('expenditures', expense);
  }

  await insertRow('bank_transfers', {
    bank_account_id: bankAccountIds.ops,
    amount: 1800,
    transfer_type: 'withdrawal',
    source_type: 'expense',
    source_reference: 'EXP-LOG-001',
    payment_mode: 'bank',
    description: 'Freight charges for incoming fertilizer stock',
    transfer_date: dateOnlyIST(shiftDays(now, -6)),
    created_by: admin.id,
    created_at: formatIST(shiftDays(now, -6)),
    withdrawal_purpose: 'business_expense'
  });

  const warehouseIds = {};
  warehouseIds.main = await insertRow('warehouses', { name: 'Main Warehouse', address: 'Market Yard Back Side', is_active: 1, created_at: formatIST(shiftDays(now, -30)), updated_at: formatIST(shiftDays(now, -1)) });
  warehouseIds.town = await insertRow('warehouses', { name: 'Town Counter', address: 'Main Bazaar Front', is_active: 1, created_at: formatIST(shiftDays(now, -28)), updated_at: formatIST(shiftDays(now, -2)) });
  warehouseIds.rural = await insertRow('warehouses', { name: 'Rural Godown', address: 'Highway Service Road', is_active: 1, created_at: formatIST(shiftDays(now, -25)), updated_at: formatIST(shiftDays(now, -4)) });

  const warehouseDistribution = {
    SEED001: [74, 38, 22],
    SEED002: [180, 70, 32],
    SEED003: [20, 5, 8],
    FERT001: [140, 40, 34],
    FERT002: [10, 5, 2],
    FERT003: [60, 20, 8],
    PEST001: [22, 12, 8],
    PEST002: [30, 20, 20],
    TOOL001: [8, 5, 4],
    TOOL002: [25, 20, 15]
  };
  const warehouseOrder = [warehouseIds.main, warehouseIds.town, warehouseIds.rural];
  for (const [code, quantities] of Object.entries(warehouseDistribution)) {
    for (let index = 0; index < warehouseOrder.length; index += 1) {
      await insertRow('warehouse_stock', {
        warehouse_id: warehouseOrder[index],
        product_id: productIds[code],
        quantity: quantities[index],
        updated_at: formatIST(shiftDays(now, -1))
      });
    }
  }

  await insertRow('warehouse_transfers', {
    from_warehouse_id: warehouseIds.main,
    to_warehouse_id: warehouseIds.town,
    product_id: productIds.FERT002,
    quantity: 3,
    notes: 'Moved stock closer to sales counter',
    transferred_by: admin.id,
    transferred_at: formatIST(shiftDays(now, -7))
  });

  await insertRow('notifications', { actor_id: operator.id, actor_name: 'operator', actor_role: 'operator', type: 'purchase', title: 'Pending purchase order requires review', description: 'DAP pending order with advance payment is awaiting delivery.', is_read: 0, created_at: formatIST(shiftDays(now, -5)) });
  await insertRow('notifications', { actor_id: admin.id, actor_name: 'admin', actor_role: 'admin', type: 'inventory', title: 'Low stock alert for DAP', description: 'DAP stock is below the configured reorder point.', is_read: 0, created_at: formatIST(shiftDays(now, -1)) });
  await insertRow('notifications', { actor_id: operator.id, actor_name: 'operator', actor_role: 'operator', type: 'sale', title: 'Sales return processed', description: 'Customer returned part of a UPI sale and a refund was posted to the bank.', is_read: 1, created_at: formatIST(shiftDays(now, -1)) });
  await insertRow('notifications', { actor_id: admin.id, actor_name: 'admin', actor_role: 'admin', type: 'pricing', title: 'Customer pricing active for Green Valley', description: 'Dealer pricing is active for Confidor insecticide through 20 April.', is_read: 0, created_at: formatIST(shiftDays(now, 0)) });

  await insertRow('audit_log', { user_id: admin.id, username: 'admin', action: 'create', entity_type: 'sale', entity_id: 'SALE-20260220-003', details: JSON.stringify({ total: saleMeta['SALE-20260220-003'].total, payment_mode: 'credit' }), ip: '127.0.0.1', created_at: formatIST(shiftDays(now, -45)) });
  await insertRow('audit_log', { user_id: operator.id, username: 'operator', action: 'partial_delivery', entity_type: 'purchase', entity_id: 'PUR-PART-001', details: JSON.stringify({ quantity_delivered: 40, remaining: 60 }), ip: '127.0.0.1', created_at: formatIST(shiftDays(now, -2)) });
  await insertRow('audit_log', { user_id: admin.id, username: 'admin', action: 'stock_adjustment', entity_type: 'product', entity_id: 'FERT003', details: JSON.stringify({ before: 85, after: 88, reason: 'Physical count found extra stock' }), ip: '127.0.0.1', created_at: formatIST(shiftDays(now, -2)) });
  await insertRow('audit_log', { user_id: admin.id, username: 'admin', action: 'pricing_update', entity_type: 'product', entity_id: 'PEST001', details: JSON.stringify({ customer: 'Green Valley Traders', price_per_unit: 625 }), ip: '127.0.0.1', created_at: formatIST(shiftDays(now, -4)) });

  await insertRow('login_logs', { user_id: admin.id, username: 'admin', role: 'admin', ip: '127.0.0.1', user_agent: 'Seed Script Browser', logged_in_at: formatIST(shiftDays(now, -1)) });
  await insertRow('login_logs', { user_id: operator.id, username: 'operator', role: 'operator', ip: '127.0.0.1', user_agent: 'Seed Script Browser', logged_in_at: formatIST(shiftDays(now, -1)) });

  for (const product of productCatalog) {
    await updateRow('products', { quantity_available: stockLevels[product.code], updated_at: formatIST(shiftDays(now, -1)) }, 'id = ?', [productIds[product.code]]);
  }

  const summary = {
    users: await getRow('SELECT COUNT(*) AS count FROM users'),
    suppliers: await getRow('SELECT COUNT(*) AS count FROM suppliers'),
    products: await getRow('SELECT COUNT(*) AS count FROM products'),
    customers: await getRow('SELECT COUNT(*) AS count FROM customers'),
    purchases: await getRow('SELECT COUNT(*) AS count FROM purchases'),
    sales: await getRow('SELECT COUNT(DISTINCT sale_id) AS count FROM sales'),
    returns: await getRow('SELECT COUNT(*) AS count FROM sales_returns'),
    quotations: await getRow('SELECT COUNT(*) AS count FROM quotations'),
    warehouses: await getRow('SELECT COUNT(*) AS count FROM warehouses'),
    priceTiers: await getRow('SELECT COUNT(*) AS count FROM price_tiers'),
    promotions: await getRow('SELECT COUNT(*) AS count FROM product_promotions'),
    customerPricing: await getRow('SELECT COUNT(*) AS count FROM customer_pricing')
  };

  console.log('Scenario data seeded successfully.');
  console.log(`Users: ${summary.users.count}`);
  console.log(`Suppliers: ${summary.suppliers.count}`);
  console.log(`Products: ${summary.products.count}`);
  console.log(`Customers: ${summary.customers.count}`);
  console.log(`Purchases: ${summary.purchases.count}`);
  console.log(`Sales: ${summary.sales.count}`);
  console.log(`Returns: ${summary.returns.count}`);
  console.log(`Quotations: ${summary.quotations.count}`);
  console.log(`Warehouses: ${summary.warehouses.count}`);
  console.log(`Price tiers: ${summary.priceTiers.count}`);
  console.log(`Promotions: ${summary.promotions.count}`);
  console.log(`Customer pricing rules: ${summary.customerPricing.count}`);
  console.log('Default login: admin / admin123 and operator / operator123');
}

async function main() {
  try {
    await seedScenarioData();
  } catch (error) {
    console.error('Seed error:', error);
    process.exitCode = 1;
  } finally {
    await new Promise((resolve) => db.close(resolve));
  }
}

main();
