const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticateToken, authorizeRole } = require('../middleware/auth');
const { requireDailySetupForOperatorWrites } = require('../middleware/dailySetup');
const { getRow, runQuery, getAll, nowIST, combineISTDateWithCurrentTime } = require('../database/db');
const { backfillSupplierDirectory, renameSupplierReferences } = require('../services/supplierDirectory');
const { createSupplierReturn } = require('../services/purchaseLotLedger');
const { addReviewNotification } = require('../services/reviewNotifications');
const { logAudit } = require('../middleware/auditLog');

const requireAdmin = authorizeRole(['admin']);

const router = express.Router();

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

function buildSupplierFilter({ alias, nameColumn, idColumn, supplier }) {
  return {
    clause: `(${alias}.${idColumn} = ? OR (${alias}.${idColumn} IS NULL AND LOWER(TRIM(${alias}.${nameColumn})) = LOWER(?)))`,
    params: [supplier.id, supplier.name]
  };
}

// List all suppliers
router.get('/', authenticateToken, async (req, res) => {
  try {
    await backfillSupplierDirectory();

    const suppliers = await getAll(
      `SELECT
         s.*,
         COALESCE(order_summary.total_orders, 0) AS total_orders,
         COALESCE(order_summary.products_supplied, 0) AS products_supplied,
         COALESCE(order_summary.last_purchase_date, NULL) AS last_purchase_date,
         COALESCE(lot_summary.total_received_qty, 0) AS total_received_qty,
         COALESCE(lot_summary.total_received_value, 0) AS total_received_value,
         COALESCE(lot_summary.total_sold_qty, 0) AS total_sold_qty,
         COALESCE(lot_summary.total_remaining_qty, 0) AS total_remaining_qty,
         COALESCE(lot_summary.sold_value, 0) AS sold_value,
         COALESCE(return_summary.total_returned_qty, 0) AS total_returned_qty,
         COALESCE(return_summary.total_returned_value, 0) AS total_returned_value,
         COALESCE(payment_summary.total_paid, 0) AS total_paid,
         COALESCE(lot_summary.sold_value, 0) - COALESCE(payment_summary.total_paid, 0) AS remaining_balance
       FROM suppliers s
       LEFT JOIN (
         SELECT
           supplier_id,
           COUNT(*) AS total_orders,
           COUNT(DISTINCT product_id) AS products_supplied,
           MAX(COALESCE(delivery_date, purchase_date, created_at)) AS last_purchase_date
         FROM purchases
         WHERE supplier_id IS NOT NULL
         GROUP BY supplier_id
       ) order_summary ON order_summary.supplier_id = s.id
       LEFT JOIN (
         SELECT
           supplier_id,
           COALESCE(SUM(quantity_received), 0) AS total_received_qty,
           COALESCE(SUM(quantity_received * price_per_unit), 0) AS total_received_value,
           COALESCE(SUM(quantity_sold), 0) AS total_sold_qty,
           COALESCE(SUM(quantity_remaining), 0) AS total_remaining_qty,
           COALESCE(SUM(quantity_sold * price_per_unit), 0) AS sold_value
         FROM purchase_lots
         WHERE supplier_id IS NOT NULL
         GROUP BY supplier_id
       ) lot_summary ON lot_summary.supplier_id = s.id
       LEFT JOIN (
         SELECT
           supplier_id,
           COALESCE(SUM(total_quantity), 0) AS total_returned_qty,
           COALESCE(SUM(total_amount), 0) AS total_returned_value
         FROM supplier_returns
         WHERE supplier_id IS NOT NULL
         GROUP BY supplier_id
       ) return_summary ON return_summary.supplier_id = s.id
       LEFT JOIN (
         SELECT
           supplier_id,
           COALESCE(SUM(amount), 0) AS total_paid
         FROM supplier_payments
         WHERE supplier_id IS NOT NULL
         GROUP BY supplier_id
       ) payment_summary ON payment_summary.supplier_id = s.id
       ORDER BY s.name ASC`
    );
    res.json(suppliers);
  } catch (error) {
    console.error('List suppliers error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get supplier by ID
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    await backfillSupplierDirectory();
    const supplier = await getRow('SELECT * FROM suppliers WHERE id = ?', [req.params.id]);
    if (!supplier) return res.status(404).json({ message: 'Supplier not found' });

    const purchaseFilter = buildSupplierFilter({
      alias: 'p',
      nameColumn: 'supplier',
      idColumn: 'supplier_id',
      supplier
    });
    const paymentFilter = buildSupplierFilter({
      alias: 'sp',
      nameColumn: 'supplier_name',
      idColumn: 'supplier_id',
      supplier
    });
    const lotFilter = buildSupplierFilter({
      alias: 'pl',
      nameColumn: 'supplier_name',
      idColumn: 'supplier_id',
      supplier
    });
    const returnFilter = buildSupplierFilter({
      alias: 'sr',
      nameColumn: 'supplier_name',
      idColumn: 'supplier_id',
      supplier
    });

    const summary = await getRow(
      `SELECT
         COALESCE(COUNT(DISTINCT p.id), 0) AS total_orders,
         COALESCE(COUNT(DISTINCT pl.product_id), 0) AS products_supplied,
         COALESCE(SUM(pl.quantity_received), 0) AS total_received_qty,
         COALESCE(SUM(pl.quantity_sold), 0) AS total_sold_qty,
         COALESCE(SUM(pl.quantity_remaining), 0) AS total_remaining_qty,
         COALESCE(SUM(pl.quantity_returned), 0) AS total_returned_qty,
         COALESCE(SUM(pl.quantity_adjusted), 0) AS total_adjusted_qty,
         COALESCE(SUM(pl.quantity_received * pl.price_per_unit), 0) AS total_received_value,
         COALESCE(SUM(pl.quantity_sold * pl.price_per_unit), 0) AS sold_value
       FROM purchase_lots pl
       LEFT JOIN purchases p ON p.id = pl.purchase_id
       WHERE ${lotFilter.clause}`,
      lotFilter.params
    );

    const paymentsSummary = await getRow(
      `SELECT COALESCE(SUM(sp.amount), 0) AS total_paid
       FROM supplier_payments sp
       WHERE ${paymentFilter.clause}`,
      paymentFilter.params
    );

    const supplierReturnsSummary = await getRow(
      `SELECT
         COALESCE(SUM(sr.total_quantity), 0) AS total_returned_qty,
         COALESCE(SUM(sr.total_amount), 0) AS total_returned_value
       FROM supplier_returns sr
       WHERE ${returnFilter.clause}`,
      returnFilter.params
    );

    const purchases = await getAll(
      `SELECT
         p.purchase_id,
         p.purchase_date,
         p.delivery_date,
         p.quantity,
         p.total_amount,
         p.purchase_status,
         p.advance_amount,
         pr.product_name,
         pr.variety,
         pr.unit,
         COALESCE(pl.quantity_received, COALESCE(NULLIF(p.quantity_delivered, 0), p.quantity, 0)) AS quantity_received,
         COALESCE(pl.quantity_sold, 0) AS quantity_sold,
         COALESCE(pl.quantity_returned, 0) AS quantity_returned,
         COALESCE(pl.quantity_remaining, 0) AS quantity_remaining,
         COALESCE(pl.quantity_sold * p.price_per_unit, 0) AS sold_amount
       FROM purchases p
       JOIN products pr ON p.product_id = pr.id
       LEFT JOIN purchase_lots pl ON pl.purchase_id = p.id
       WHERE ${purchaseFilter.clause}
       ORDER BY p.purchase_date DESC
       LIMIT 20`,
      purchaseFilter.params
    );

    const payments = await getAll(
      `SELECT *
       FROM supplier_payments sp
       WHERE ${paymentFilter.clause}
       ORDER BY payment_date DESC
       LIMIT 20`,
      paymentFilter.params
    );

    const openLots = await getAll(
      `SELECT
         pl.id,
         pl.purchase_id,
         pur.purchase_id AS purchase_reference,
         pl.source_type,
         pl.quantity_received,
         pl.quantity_sold,
         pl.quantity_returned,
         pl.quantity_adjusted,
         pl.quantity_remaining,
         pl.price_per_unit,
         pl.gst_percent,
         pl.purchase_date,
         pl.delivery_date,
         pr.product_name,
         pr.variety,
         pr.unit,
         pr.product_id AS product_code
       FROM purchase_lots pl
       JOIN products pr ON pr.id = pl.product_id
       LEFT JOIN purchases pur ON pur.id = pl.purchase_id
       WHERE ${lotFilter.clause}
         AND pl.quantity_remaining > 0
       ORDER BY COALESCE(pl.delivery_date, pl.purchase_date, pl.created_at) ASC, pl.id ASC`,
      lotFilter.params
    );

    const supplierReturns = await getAll(
      `SELECT
         sr.return_id,
         sr.total_quantity,
         sr.total_amount,
         sr.notes,
         sr.return_date,
         u.username AS created_by_name
       FROM supplier_returns sr
       LEFT JOIN users u ON u.id = sr.created_by
       WHERE ${returnFilter.clause}
       ORDER BY sr.return_date DESC
       LIMIT 20`,
      returnFilter.params
    );

    res.json({
      ...supplier,
      summary: {
        total_orders: toNumber(summary?.total_orders),
        products_supplied: toNumber(summary?.products_supplied),
        total_received_qty: toNumber(summary?.total_received_qty),
        total_sold_qty: toNumber(summary?.total_sold_qty),
        total_remaining_qty: toNumber(summary?.total_remaining_qty),
        total_returned_qty: toNumber(supplierReturnsSummary?.total_returned_qty || summary?.total_returned_qty),
        total_adjusted_qty: toNumber(summary?.total_adjusted_qty),
        total_received_value: toNumber(summary?.total_received_value),
        sold_value: toNumber(summary?.sold_value),
        total_paid: toNumber(paymentsSummary?.total_paid),
        total_returned_value: toNumber(supplierReturnsSummary?.total_returned_value),
        balance_due: toNumber(summary?.sold_value) - toNumber(paymentsSummary?.total_paid)
      },
      purchases,
      payments,
      open_lots: openLots,
      returns: supplierReturns
    });
  } catch (error) {
    console.error('Get supplier error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/:id/returns', [
  authenticateToken,
  authorizeRole(['admin', 'operator']),
  requireDailySetupForOperatorWrites,
  body('items').isArray({ min: 1 }).withMessage('At least one return item is required'),
  body('items.*.purchase_lot_id').isInt({ min: 1 }).withMessage('Each item requires a valid purchase lot'),
  body('items.*.quantity_returned').isFloat({ gt: 0 }).withMessage('Each item requires a positive return quantity'),
  body('return_date').optional().trim(),
  body('notes').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const supplier = await getRow('SELECT * FROM suppliers WHERE id = ?', [req.params.id]);
    if (!supplier) {
      return res.status(404).json({ message: 'Supplier not found' });
    }

    const eventTimestamp = nowIST();
    const suppliedDate = req.body.return_date;
    const returnDate = suppliedDate && String(suppliedDate).length === 10
      ? combineISTDateWithCurrentTime(suppliedDate, eventTimestamp)
      : eventTimestamp;

    let supplierReturn;
    await runQuery('BEGIN TRANSACTION');
    try {
      supplierReturn = await createSupplierReturn({
        supplierId: supplier.id,
        supplierName: supplier.name,
        items: req.body.items,
        returnDate,
        notes: req.body.notes,
        userId: req.user.id,
        eventTimestamp
      }, { getRow, getAll, runQuery, nowIST });

      await runQuery('COMMIT');
    } catch (transactionError) {
      try {
        await runQuery('ROLLBACK');
      } catch (rollbackError) {
        console.error('Rollback supplier return error:', rollbackError);
      }
      throw transactionError;
    }

    addReviewNotification({
      actorId: req.user.id,
      actorName: req.user.username,
      actorRole: req.user.role,
      type: 'purchase',
      title: 'Returned stock to a supplier',
      description: `${supplierReturn.total_quantity} item(s) worth ₹${supplierReturn.total_amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} returned to ${supplier.name}.`,
      createdAt: eventTimestamp
    });

    await logAudit(req, 'create', 'supplier_return', supplierReturn.return_id, {
      supplier_id: supplier.id,
      supplier_name: supplier.name,
      total_quantity: supplierReturn.total_quantity,
      total_amount: supplierReturn.total_amount,
      items: supplierReturn.items.length
    });

    res.status(201).json({
      ...supplierReturn,
      message: 'Supplier return recorded successfully'
    });
  } catch (error) {
    console.error('Create supplier return error:', error);
    res.status(error.status || 500).json({ message: error.message || 'Server error' });
  }
});

// Create supplier
router.post('/', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { name, contact_person, mobile, email, address, gstin } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Supplier name is required' });
    }

    const existing = await getRow('SELECT id FROM suppliers WHERE LOWER(name) = LOWER(?)', [name.trim()]);
    if (existing) {
      return res.status(409).json({ message: 'Supplier with this name already exists' });
    }

    const ts = nowIST();
    const result = await runQuery(
      `INSERT INTO suppliers (name, contact_person, mobile, email, address, gstin, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [name.trim(), contact_person || null, mobile || null, email || null, address || null, gstin || null, ts, ts]
    );

    res.status(201).json({ id: result.id, message: 'Supplier created' });
  } catch (error) {
    console.error('Create supplier error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update supplier
router.put('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const supplier = await getRow('SELECT * FROM suppliers WHERE id = ?', [req.params.id]);
    if (!supplier) return res.status(404).json({ message: 'Supplier not found' });

    const { name, contact_person, mobile, email, address, gstin } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Supplier name is required' });
    }

    const duplicate = await getRow('SELECT id FROM suppliers WHERE LOWER(name) = LOWER(?) AND id != ?', [name.trim(), req.params.id]);
    if (duplicate) {
      return res.status(409).json({ message: 'Another supplier with this name already exists' });
    }

    const eventTimestamp = nowIST();

    await runQuery('BEGIN TRANSACTION');
    try {
      await runQuery(
        `UPDATE suppliers SET name = ?, contact_person = ?, mobile = ?, email = ?, address = ?, gstin = ?, updated_at = ? WHERE id = ?`,
        [name.trim(), contact_person || null, mobile || null, email || null, address || null, gstin || null, eventTimestamp, req.params.id]
      );

      if (supplier.name !== name.trim()) {
        await renameSupplierReferences({
          supplierId: supplier.id,
          oldName: supplier.name,
          newName: name.trim(),
          eventTimestamp
        });
      }

      await runQuery('COMMIT');
    } catch (transactionError) {
      try {
        await runQuery('ROLLBACK');
      } catch (rollbackError) {
        console.error('Rollback supplier update error:', rollbackError);
      }
      throw transactionError;
    }

    res.json({ message: 'Supplier updated' });
  } catch (error) {
    console.error('Update supplier error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Toggle supplier active status
router.patch('/:id/toggle', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const supplier = await getRow('SELECT * FROM suppliers WHERE id = ?', [req.params.id]);
    if (!supplier) return res.status(404).json({ message: 'Supplier not found' });

    await runQuery(
      'UPDATE suppliers SET is_active = ?, updated_at = ? WHERE id = ?',
      [supplier.is_active ? 0 : 1, nowIST(), req.params.id]
    );

    res.json({ message: supplier.is_active ? 'Supplier deactivated' : 'Supplier activated' });
  } catch (error) {
    console.error('Toggle supplier error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
