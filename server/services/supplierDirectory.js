const { getRow, getAll, runQuery, nowIST } = require('../database/db');

const normalizeSupplierName = (value) => String(value || '').trim();
const normalizeSupplierKey = (value) => normalizeSupplierName(value).toLowerCase();

async function getSupplierById(supplierId) {
  const normalizedId = Number(supplierId);
  if (!Number.isInteger(normalizedId) || normalizedId <= 0) {
    return null;
  }

  return getRow('SELECT * FROM suppliers WHERE id = ?', [normalizedId]);
}

async function getSupplierByName(name) {
  const normalizedName = normalizeSupplierName(name);
  if (!normalizedName) {
    return null;
  }

  return getRow(
    'SELECT * FROM suppliers WHERE LOWER(TRIM(name)) = LOWER(?) ORDER BY is_active DESC, id ASC LIMIT 1',
    [normalizedName]
  );
}

async function resolveSupplier({ supplierId, supplierName, createIfMissing = false, eventTimestamp = nowIST() }) {
  const byId = await getSupplierById(supplierId);
  if (byId) {
    return byId;
  }

  const normalizedName = normalizeSupplierName(supplierName);
  if (!normalizedName) {
    return null;
  }

  const byName = await getSupplierByName(normalizedName);
  if (byName) {
    return byName;
  }

  if (!createIfMissing) {
    return null;
  }

  const result = await runQuery(
    `INSERT INTO suppliers (name, created_at, updated_at)
     VALUES (?, ?, ?)`,
    [normalizedName, eventTimestamp, eventTimestamp]
  );

  return getRow('SELECT * FROM suppliers WHERE id = ?', [result.id]);
}

async function ensureSupplierDirectoryEntry(name, eventTimestamp = nowIST()) {
  return resolveSupplier({
    supplierName: name,
    createIfMissing: true,
    eventTimestamp
  });
}

async function syncSupplierForeignKeys(eventTimestamp = nowIST()) {
  const updates = [
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
     ),
         updated_at = '${eventTimestamp}'
     WHERE supplier_id IS NOT NULL`,
    `UPDATE purchases
     SET supplier = (
       SELECT s.name
       FROM suppliers s
       WHERE s.id = purchases.supplier_id
     ),
         updated_at = '${eventTimestamp}'
     WHERE supplier_id IS NOT NULL`,
    `UPDATE supplier_payments
     SET supplier_name = (
       SELECT s.name
       FROM suppliers s
       WHERE s.id = supplier_payments.supplier_id
     )
     WHERE supplier_id IS NOT NULL`
  ];

  for (const statement of updates) {
    await runQuery(statement);
  }
}

async function backfillSupplierDirectory(eventTimestamp = nowIST()) {
  const supplierRows = await getAll(`
    SELECT DISTINCT TRIM(name) AS supplier_name
    FROM (
      SELECT supplier AS name FROM purchases WHERE supplier IS NOT NULL
      UNION ALL
      SELECT supplier AS name FROM products WHERE supplier IS NOT NULL
      UNION ALL
      SELECT supplier_name AS name FROM supplier_payments WHERE supplier_name IS NOT NULL
    ) refs
    WHERE TRIM(name) != ''
    ORDER BY supplier_name COLLATE NOCASE ASC
  `);

  let createdCount = 0;

  for (const row of supplierRows) {
    const normalizedName = normalizeSupplierName(row.supplier_name);
    if (!normalizedName) {
      continue;
    }

    const existing = await getRow(
      'SELECT id FROM suppliers WHERE LOWER(TRIM(name)) = LOWER(?) LIMIT 1',
      [normalizedName]
    );

    if (existing) {
      continue;
    }

    await runQuery(
      `INSERT INTO suppliers (name, created_at, updated_at)
       VALUES (?, ?, ?)`,
      [normalizedName, eventTimestamp, eventTimestamp]
    );
    createdCount += 1;
  }

  await syncSupplierForeignKeys(eventTimestamp);

  return {
    scannedCount: supplierRows.length,
    createdCount
  };
}

async function renameSupplierReferences({ supplierId, oldName, newName, eventTimestamp = nowIST() }) {
  const normalizedSupplierId = Number(supplierId) || null;
  const normalizedOldName = normalizeSupplierName(oldName);
  const normalizedNewName = normalizeSupplierName(newName);

  if (!normalizedOldName || !normalizedNewName) {
    return {
      purchasesUpdated: 0,
      productsUpdated: 0,
      paymentsUpdated: 0,
      transfersUpdated: 0
    };
  }

  const updatedPurchases = await runQuery(
    `UPDATE purchases
     SET supplier = ?, supplier_id = COALESCE(supplier_id, ?), updated_at = ?
     WHERE (supplier_id = ?)
        OR (supplier IS NOT NULL AND LOWER(TRIM(supplier)) = LOWER(?))`,
    [normalizedNewName, normalizedSupplierId, eventTimestamp, normalizedSupplierId, normalizedOldName]
  );

  const updatedProducts = await runQuery(
    `UPDATE products
     SET supplier = ?, supplier_id = COALESCE(supplier_id, ?), updated_at = ?
     WHERE (supplier_id = ?)
        OR (supplier IS NOT NULL AND LOWER(TRIM(supplier)) = LOWER(?))`,
    [normalizedNewName, normalizedSupplierId, eventTimestamp, normalizedSupplierId, normalizedOldName]
  );

  const updatedPayments = await runQuery(
    `UPDATE supplier_payments
     SET supplier_name = ?, supplier_id = COALESCE(supplier_id, ?)
     WHERE (supplier_id = ?)
        OR (supplier_name IS NOT NULL AND LOWER(TRIM(supplier_name)) = LOWER(?))`,
    [normalizedNewName, normalizedSupplierId, normalizedSupplierId, normalizedOldName]
  );

  const updatedTransfers = await runQuery(
    `UPDATE bank_transfers
     SET description = REPLACE(description, ?, ?)
     WHERE source_type = 'supplier_payment'
       AND source_reference IN (
         SELECT 'supplier-payment:' || id
         FROM supplier_payments
         WHERE supplier_id = ?
            OR LOWER(TRIM(supplier_name)) = LOWER(?)
       )
       AND description LIKE ?`,
    [
      normalizedOldName,
      normalizedNewName,
      normalizedSupplierId,
      normalizedOldName,
      `%${normalizedOldName}%`
    ]
  );

  return {
    purchasesUpdated: updatedPurchases.changes || 0,
    productsUpdated: updatedProducts.changes || 0,
    paymentsUpdated: updatedPayments.changes || 0,
    transfersUpdated: updatedTransfers.changes || 0
  };
}

module.exports = {
  normalizeSupplierName,
  normalizeSupplierKey,
  getSupplierById,
  getSupplierByName,
  resolveSupplier,
  ensureSupplierDirectoryEntry,
  syncSupplierForeignKeys,
  backfillSupplierDirectory,
  renameSupplierReferences
};