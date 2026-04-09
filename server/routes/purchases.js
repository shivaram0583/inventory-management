const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticateToken, authorizeRole } = require('../middleware/auth');
const { requireDailySetupForOperatorWrites } = require('../middleware/dailySetup');
const {
  getRow,
  runQuery,
  getAll,
  nowIST,
  combineISTDateWithCurrentTime,
  paginate
} = require('../database/db');
const crypto = require('crypto');
const moment = require('moment');
const { addReviewNotification } = require('../services/reviewNotifications');
const {
  isBankTrackedSupplierPaymentMode,
  getSupplierPaymentTransferReference,
  createSupplierPaymentRecord,
  reverseSupplierPaymentBankEffects
} = require('../services/bankLedger');
const { resolveSupplier } = require('../services/supplierDirectory');
const { syncPurchaseLotForPurchase } = require('../services/purchaseLotLedger');
const { logAudit } = require('../middleware/auditLog');
const { calculateOutstandingSupplierBalance } = require('../services/supplierFinancials');

const router = express.Router();

const PURCHASE_STATUS = {
  ORDERED: 'ordered',
  DELIVERED: 'delivered'
};

const purchaseSelect = `
  SELECT
    pur.*,
    COALESCE(pur.purchase_status, 'delivered') AS purchase_status,
    COALESCE(pur.advance_amount, 0) AS advance_amount,
    MAX(
      COALESCE(pur.total_amount, 0)
      - COALESCE(pur.advance_amount, 0)
      - (COALESCE(pl.quantity_returned, 0) * COALESCE(pur.price_per_unit, 0)),
      0
    ) AS balance_due,
    COALESCE(pl.quantity_received, COALESCE(NULLIF(pur.quantity_delivered, 0), pur.quantity, 0)) AS quantity_received,
    COALESCE(pl.quantity_sold, 0) AS quantity_sold,
    COALESCE(pl.quantity_returned, 0) AS quantity_returned,
    COALESCE(pl.quantity_adjusted, 0) AS quantity_adjusted,
    COALESCE(pl.quantity_remaining, CASE WHEN COALESCE(pur.purchase_status, 'delivered') = 'delivered' THEN COALESCE(NULLIF(pur.quantity_delivered, 0), pur.quantity, 0) ELSE 0 END) AS quantity_remaining,
    COALESCE(pl.quantity_sold, 0) * COALESCE(pur.price_per_unit, 0) AS sold_amount,
    COALESCE(pl.quantity_returned, 0) * COALESCE(pur.price_per_unit, 0) AS returned_amount,
    p.product_id AS product_code,
    COALESCE(p.product_name, '[Deleted Product]') AS product_name,
    p.variety,
    p.unit,
    p.category,
    COALESCE(p.is_deleted, 0) AS product_deleted,
    u.username AS added_by_name
  FROM purchases pur
  LEFT JOIN products p ON pur.product_id = p.id
  LEFT JOIN users u ON pur.added_by = u.id
  LEFT JOIN purchase_lots pl ON pl.purchase_id = pur.id
`;

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizePurchaseStatus = (value) => (
  String(value).toLowerCase() === PURCHASE_STATUS.ORDERED
    ? PURCHASE_STATUS.ORDERED
    : PURCHASE_STATUS.DELIVERED
);

const createHttpError = (status, message) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

async function fetchPurchaseById(id) {
  return getRow(`${purchaseSelect} WHERE pur.id = ?`, [id]);
}

async function createAdvancePayment({
  supplierId,
  supplierName,
  amount,
  bankAccountId,
  purchaseId,
  paymentDate,
  userId,
  eventTimestamp
}) {
  const result = await createSupplierPaymentRecord({
    supplierId,
    supplierName,
    amount,
    paymentMode: 'bank',
    bankAccountId,
    description: `Advance payment for purchase ${purchaseId}`,
    paymentDate,
    userId,
    eventTimestamp
  });

  return result.id;
}

async function resolveCanonicalSupplier({
  supplierId,
  supplierName,
  eventTimestamp,
  createIfMissing = false
}) {
  const normalizedSupplierName = supplierName ? String(supplierName).trim() : '';
  const supplierRecord = await resolveSupplier({
    supplierId,
    supplierName: normalizedSupplierName,
    createIfMissing,
    eventTimestamp
  });

  return {
    supplierRecord,
    supplierId: supplierRecord?.id || null,
    supplierName: supplierRecord?.name || normalizedSupplierName || null
  };
}

function buildSupplierFilter({ alias, nameColumn, idColumn, supplierRecord, supplierName }) {
  const normalizedSupplierName = supplierName ? String(supplierName).trim() : '';
  const qualifiedIdColumn = `${alias}.${idColumn}`;
  const qualifiedNameColumn = `${alias}.${nameColumn}`;

  if (supplierRecord?.id) {
    return {
      clause: `(${qualifiedIdColumn} = ? OR (${qualifiedIdColumn} IS NULL AND LOWER(TRIM(${qualifiedNameColumn})) = LOWER(?)))`,
      params: [supplierRecord.id, normalizedSupplierName]
    };
  }

  return {
    clause: `LOWER(TRIM(${qualifiedNameColumn})) = LOWER(?)`,
    params: [normalizedSupplierName]
  };
}

// GET all categories
router.get('/categories', authenticateToken, async (req, res) => {
  try {
    const categories = await getAll('SELECT * FROM product_categories ORDER BY name ASC');
    res.json(categories);
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST create a new category
router.post('/categories', [
  authenticateToken,
  authorizeRole(['admin', 'operator']),
  requireDailySetupForOperatorWrites,
  body('name').notEmpty().trim().withMessage('Category name is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    const { name } = req.body;
    const normalized = name.trim().toLowerCase();
    const existing = await getRow('SELECT id FROM product_categories WHERE name = ?', [normalized]);
    if (existing) {
      return res.status(400).json({ message: 'Category already exists' });
    }
    const result = await runQuery('INSERT INTO product_categories (name) VALUES (?)', [normalized]);
    const category = await getRow('SELECT * FROM product_categories WHERE id = ?', [result.id]);
    res.status(201).json(category);
  } catch (error) {
    console.error('Create category error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE a category (admin only)
router.delete('/categories/:id', [
  authenticateToken,
  authorizeRole(['admin'])
], async (req, res) => {
  try {
    const cat = await getRow('SELECT * FROM product_categories WHERE id = ?', [req.params.id]);
    if (!cat) return res.status(404).json({ message: 'Category not found' });
    const inUse = await getRow('SELECT id FROM products WHERE category = ? LIMIT 1', [cat.name]);
    if (inUse) return res.status(400).json({ message: 'Category is in use by existing products' });
    await runQuery('DELETE FROM product_categories WHERE id = ?', [req.params.id]);
    res.json({ message: 'Category deleted' });
  } catch (error) {
    console.error('Delete category error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET all purchases with product info
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { start_date, end_date, product_id, status, page, limit } = req.query;
    let query = `${purchaseSelect} WHERE 1=1`;
    const params = [];

    if (start_date) {
      query += ' AND DATE(pur.purchase_date) >= ?';
      params.push(start_date);
    }
    if (end_date) {
      query += ' AND DATE(pur.purchase_date) <= ?';
      params.push(end_date);
    }
    if (product_id) {
      query += ' AND pur.product_id = ?';
      params.push(product_id);
    }
    if (status && ['ordered', 'delivered', 'cancelled'].includes(String(status).toLowerCase())) {
      query += ' AND COALESCE(pur.purchase_status, ?) = ?';
      params.push(PURCHASE_STATUS.DELIVERED, String(status).toLowerCase());
    }

    query += ' ORDER BY pur.purchase_date DESC';

    if (page) {
      const result = await paginate(query, params, page, limit || 50);
      return res.json(result);
    }

    const purchases = await getAll(query, params);
    res.json(purchases);
  } catch (error) {
    console.error('Get purchases error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST record a new purchase or pending order
router.post('/', [
  authenticateToken,
  authorizeRole(['admin', 'operator']),
  requireDailySetupForOperatorWrites,
  body('product_id').isInt({ min: 1 }).withMessage('Valid product ID is required'),
  body('quantity').isInt({ min: 1 }).withMessage('Quantity must be a positive whole number'),
  body('price_per_unit').isFloat({ min: 0 }).withMessage('Price must be non-negative'),
  body('purchase_status').optional().isIn(['ordered', 'delivered']).withMessage('Invalid purchase status'),
  body('advance_amount').optional().isFloat({ min: 0 }).withMessage('Advance amount must be non-negative'),
  body('bank_account_id').optional({ nullable: true }).isInt({ min: 1 }).withMessage('Invalid bank account')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      product_id,
      quantity,
      price_per_unit,
      supplier,
      purchase_date,
      purchase_status,
      advance_amount,
      bank_account_id
    } = req.body;

    const product = await getRow('SELECT * FROM products WHERE id = ?', [product_id]);
    if (!product) return res.status(404).json({ message: 'Product not found' });

    const quantityValue = toNumber(quantity);
    const pricePerUnitValue = toNumber(price_per_unit);
    const totalAmount = quantityValue * pricePerUnitValue;
    const purchaseStatus = normalizePurchaseStatus(purchase_status);
    const advanceAmount = toNumber(advance_amount);
    const supplierName = supplier ? String(supplier).trim() : '';
    const bankAccountId = bank_account_id ? Number(bank_account_id) : null;

    if (advanceAmount > totalAmount) {
      return res.status(400).json({ message: 'Advance amount cannot exceed the total purchase amount' });
    }

    if (advanceAmount > 0 && !supplierName) {
      return res.status(400).json({ message: 'Supplier is required when paying an advance amount' });
    }

    if (advanceAmount > 0 && !bankAccountId) {
      return res.status(400).json({ message: 'Select a bank account for the advance payment' });
    }

    const purchaseId = 'PUR' + moment().utcOffset('+05:30').format('YYYYMMDDHHmmss') +
      crypto.randomBytes(2).toString('hex').toUpperCase();

    const eventTimestamp = nowIST();
    const storedDate = purchase_date && String(purchase_date).length === 10
      ? combineISTDateWithCurrentTime(purchase_date, eventTimestamp)
      : eventTimestamp;
    const deliveryDate = purchaseStatus === PURCHASE_STATUS.DELIVERED ? storedDate : null;
    const supplierReference = await resolveCanonicalSupplier({
      supplierName,
      eventTimestamp,
      createIfMissing: Boolean(supplierName)
    });
    const canonicalSupplierName = supplierReference.supplierName;
    const supplierId = supplierReference.supplierId;

    await runQuery('BEGIN TRANSACTION');

    let purchaseRowId;
    try {
      const purchaseResult = await runQuery(
        `INSERT INTO purchases (
           purchase_id,
           product_id,
           quantity,
           price_per_unit,
           total_amount,
           supplier,
           supplier_id,
           purchase_date,
           delivery_date,
           purchase_status,
           advance_amount,
           quantity_delivered,
           updated_at,
           added_by
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          purchaseId,
          product_id,
          quantityValue,
          pricePerUnitValue,
          totalAmount,
          canonicalSupplierName,
          supplierId,
          storedDate,
          deliveryDate,
          purchaseStatus,
          advanceAmount,
          purchaseStatus === PURCHASE_STATUS.DELIVERED ? quantityValue : 0,
          eventTimestamp,
          req.user.id
        ]
      );
      purchaseRowId = purchaseResult.id;

      if (advanceAmount > 0) {
        const advancePaymentId = await createAdvancePayment({
          supplierId,
          supplierName: canonicalSupplierName,
          amount: advanceAmount,
          bankAccountId,
          purchaseId,
          paymentDate: String(storedDate).slice(0, 10),
          userId: req.user.id,
          eventTimestamp
        });

        await runQuery(
          'UPDATE purchases SET advance_payment_id = ? WHERE id = ?',
          [advancePaymentId, purchaseRowId]
        );
      }

      if (purchaseStatus === PURCHASE_STATUS.DELIVERED) {
        await runQuery(
          `UPDATE products SET
             quantity_available = quantity_available + ?,
             purchase_price = ?,
             supplier = COALESCE(?, supplier),
             supplier_id = COALESCE(?, supplier_id),
             updated_at = ?
           WHERE id = ?`,
          [quantityValue, pricePerUnitValue, canonicalSupplierName, supplierId, eventTimestamp, product_id]
        );

        await syncPurchaseLotForPurchase({
          purchaseId: purchaseRowId,
          productId: product_id,
          supplierId,
          supplierName: canonicalSupplierName,
          deliveredQuantity: quantityValue,
          pricePerUnit: pricePerUnitValue,
          gstPercent: product.gst_percent,
          purchaseDate: storedDate,
          deliveryDate,
          eventTimestamp
        }, { getRow, getAll, runQuery });
        } else if (canonicalSupplierName) {
          await runQuery(
            'UPDATE products SET supplier = ?, supplier_id = ?, updated_at = ? WHERE id = ?',
            [canonicalSupplierName, supplierId, eventTimestamp, product_id]
          );
      }

      await runQuery('COMMIT');
    } catch (transactionError) {
      try {
        await runQuery('ROLLBACK');
      } catch (rollbackError) {
        console.error('Rollback record purchase error:', rollbackError);
      }
      throw transactionError;
    }

    const purchase = await fetchPurchaseById(purchaseRowId);

    addReviewNotification({
      actorId: req.user.id,
      actorName: req.user.username,
      actorRole: req.user.role,
      type: 'purchase',
      title: purchaseStatus === PURCHASE_STATUS.ORDERED ? 'Created a purchase order' : 'Recorded a purchase',
      description: purchaseStatus === PURCHASE_STATUS.ORDERED
        ? `${quantityValue} ${purchase.unit} of ${purchase.product_name} was ordered${supplierName ? ` from ${supplierName}` : ''}.`
        : `${quantityValue} ${purchase.unit} of ${purchase.product_name} was received${supplierName ? ` from ${supplierName}` : ''}.`,
      createdAt: eventTimestamp
    });

    res.status(201).json({
      ...purchase,
      message: purchaseStatus === PURCHASE_STATUS.ORDERED
        ? 'Purchase order recorded. Inventory will update after delivery.'
        : 'Purchase recorded successfully'
    });
  } catch (error) {
    console.error('Record purchase error:', error);
    res.status(error.status || 500).json({ message: error.message || 'Server error' });
  }
});

// PUT edit an existing purchase
router.put('/:id', [
  authenticateToken,
  authorizeRole(['admin', 'operator']),
  requireDailySetupForOperatorWrites,
  body('quantity').isInt({ min: 1 }).withMessage('Quantity must be a positive whole number'),
  body('price_per_unit').isFloat({ min: 0 }).withMessage('Price must be non-negative')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const purchase = await getRow('SELECT * FROM purchases WHERE id = ?', [req.params.id]);
    if (!purchase) return res.status(404).json({ message: 'Purchase not found' });

  const product = await getRow('SELECT * FROM products WHERE id = ?', [purchase.product_id]);
  if (!product) return res.status(404).json({ message: 'Product not found' });

    const { quantity, price_per_unit, supplier, purchase_date } = req.body;
    const quantityValue = toNumber(quantity);
    const pricePerUnitValue = toNumber(price_per_unit);
    const totalAmount = quantityValue * pricePerUnitValue;
    const supplierName = supplier ? String(supplier).trim() : '';
    const purchaseStatus = normalizePurchaseStatus(purchase.purchase_status);
    const existingAdvance = toNumber(purchase.advance_amount);
    const nextQuantityDelivered = purchaseStatus === PURCHASE_STATUS.DELIVERED
      ? quantityValue
      : toNumber(purchase.quantity_delivered);

    if (existingAdvance > totalAmount) {
      return res.status(400).json({ message: 'Total amount cannot be less than the recorded advance payment' });
    }

    if (existingAdvance > 0 && !supplierName) {
      return res.status(400).json({ message: 'Supplier is required because this purchase has an advance payment' });
    }

    const eventTimestamp = nowIST();
    const storedDate = purchase_date && String(purchase_date).length === 10
      ? combineISTDateWithCurrentTime(purchase_date, eventTimestamp)
      : purchase.purchase_date;
    const qtyDiff = quantityValue - toNumber(purchase.quantity);
    const supplierReference = await resolveCanonicalSupplier({
      supplierName,
      eventTimestamp,
      createIfMissing: Boolean(supplierName)
    });
    const canonicalSupplierName = supplierReference.supplierName;
    const supplierId = supplierReference.supplierId;

    let nextDeliveryDate = purchase.delivery_date;
    if (
      purchaseStatus === PURCHASE_STATUS.DELIVERED &&
      (!purchase.delivery_date || purchase.delivery_date === purchase.purchase_date)
    ) {
      nextDeliveryDate = storedDate;
    }

    await runQuery('BEGIN TRANSACTION');
    try {
      if (purchaseStatus === PURCHASE_STATUS.DELIVERED) {
        await runQuery(
          `UPDATE products SET
             quantity_available = quantity_available + ?,
             purchase_price = ?,
             supplier = COALESCE(?, supplier),
             supplier_id = COALESCE(?, supplier_id),
             updated_at = ?
           WHERE id = ?`,
          [qtyDiff, pricePerUnitValue, canonicalSupplierName, supplierId, eventTimestamp, purchase.product_id]
        );
        } else if (canonicalSupplierName) {
          await runQuery(
            'UPDATE products SET supplier = ?, supplier_id = ?, updated_at = ? WHERE id = ?',
            [canonicalSupplierName, supplierId, eventTimestamp, purchase.product_id]
          );
      }

      if (purchase.advance_payment_id && canonicalSupplierName) {
        await runQuery(
          `UPDATE supplier_payments
           SET supplier_name = ?, supplier_id = ?, description = ?
           WHERE id = ?`,
          [canonicalSupplierName, supplierId, `Advance payment for purchase ${purchase.purchase_id}`, purchase.advance_payment_id]
        );
      }

      await runQuery(
        `UPDATE purchases SET
           quantity = ?,
           price_per_unit = ?,
           total_amount = ?,
           supplier = ?,
           supplier_id = ?,
           purchase_date = ?,
           delivery_date = ?,
           quantity_delivered = ?,
           updated_at = ?
         WHERE id = ?`,
        [
          quantityValue,
          pricePerUnitValue,
          totalAmount,
          canonicalSupplierName,
          supplierId,
          storedDate,
          nextDeliveryDate || null,
          nextQuantityDelivered,
          eventTimestamp,
          req.params.id
        ]
      );

      if (purchaseStatus === PURCHASE_STATUS.DELIVERED) {
        await syncPurchaseLotForPurchase({
          purchaseId: purchase.id,
          productId: purchase.product_id,
          supplierId,
          supplierName: canonicalSupplierName,
          deliveredQuantity: nextQuantityDelivered,
          pricePerUnit: pricePerUnitValue,
          gstPercent: product.gst_percent,
          purchaseDate: storedDate,
          deliveryDate: nextDeliveryDate || storedDate,
          eventTimestamp
        }, { getRow, getAll, runQuery });
      }

      await runQuery('COMMIT');
    } catch (transactionError) {
      try {
        await runQuery('ROLLBACK');
      } catch (rollbackError) {
        console.error('Rollback edit purchase error:', rollbackError);
      }
      throw transactionError;
    }

    const updated = await fetchPurchaseById(req.params.id);

    await logAudit(req, 'update', 'purchase', purchase.purchase_id, {
      product_id: purchase.product_id,
      product_code: updated.product_code,
      product_name: updated.product_name,
      unit: updated.unit,
      purchase_status: updated.purchase_status,
      quantity_before: toNumber(purchase.quantity),
      quantity_after: quantityValue,
      price_before: toNumber(purchase.price_per_unit),
      price_after: pricePerUnitValue,
      supplier_before: purchase.supplier || null,
      supplier_after: updated.supplier || null
    });

    addReviewNotification({
      actorId: req.user.id,
      actorName: req.user.username,
      actorRole: req.user.role,
      type: 'purchase',
      title: 'Updated a purchase',
      description: `Purchase for ${updated.product_name} was updated to ${quantityValue} ${updated.unit}.`,
      createdAt: eventTimestamp
    });

    res.json({ ...updated, message: 'Purchase updated successfully' });
  } catch (error) {
    console.error('Edit purchase error:', error);
    res.status(error.status || 500).json({ message: error.message || 'Server error' });
  }
});

// POST mark a pending purchase as delivered
router.post('/:id/mark-delivered', [
  authenticateToken,
  authorizeRole(['admin', 'operator']),
  requireDailySetupForOperatorWrites,
  body('delivery_date').optional().trim()
], async (req, res) => {
  try {
    const purchase = await getRow('SELECT * FROM purchases WHERE id = ?', [req.params.id]);
    if (!purchase) {
      return res.status(404).json({ message: 'Purchase not found' });
    }

    if (normalizePurchaseStatus(purchase.purchase_status) === PURCHASE_STATUS.DELIVERED) {
      return res.status(400).json({ message: 'This purchase is already marked as delivered' });
    }

    const eventTimestamp = nowIST();
    const product = await getRow('SELECT id, gst_percent FROM products WHERE id = ?', [purchase.product_id]);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }
    const suppliedDeliveryDate = req.body.delivery_date;
    const deliveryDate = suppliedDeliveryDate && String(suppliedDeliveryDate).length === 10
      ? combineISTDateWithCurrentTime(suppliedDeliveryDate, eventTimestamp)
      : eventTimestamp;
    const totalQuantity = toNumber(purchase.quantity);
    const alreadyDelivered = toNumber(purchase.quantity_delivered || 0);
    const remainingQuantity = Math.max(totalQuantity - alreadyDelivered, 0);
    const supplierReference = await resolveCanonicalSupplier({
      supplierId: purchase.supplier_id,
      supplierName: purchase.supplier,
      eventTimestamp,
      createIfMissing: Boolean(purchase.supplier)
    });

    if (remainingQuantity <= 0) {
      return res.status(400).json({ message: 'No remaining quantity is pending for delivery' });
    }

    await runQuery('BEGIN TRANSACTION');
    try {
      await runQuery(
        `UPDATE products SET
           quantity_available = quantity_available + ?,
           purchase_price = ?,
           supplier = COALESCE(?, supplier),
           supplier_id = COALESCE(?, supplier_id),
           updated_at = ?
         WHERE id = ?`,
        [
          remainingQuantity,
          toNumber(purchase.price_per_unit),
          supplierReference.supplierName,
          supplierReference.supplierId,
          eventTimestamp,
          purchase.product_id
        ]
      );

      await runQuery(
        `UPDATE purchases
         SET supplier = ?, supplier_id = ?, purchase_status = ?, quantity_delivered = ?, delivery_date = ?, updated_at = ?
         WHERE id = ?`,
        [
          supplierReference.supplierName,
          supplierReference.supplierId,
          PURCHASE_STATUS.DELIVERED,
          totalQuantity,
          deliveryDate,
          eventTimestamp,
          req.params.id
        ]
      );

      await syncPurchaseLotForPurchase({
        purchaseId: purchase.id,
        productId: purchase.product_id,
        supplierId: supplierReference.supplierId,
        supplierName: supplierReference.supplierName,
        deliveredQuantity: totalQuantity,
        pricePerUnit: toNumber(purchase.price_per_unit),
        gstPercent: product.gst_percent,
        purchaseDate: purchase.purchase_date || eventTimestamp,
        deliveryDate,
        eventTimestamp
      }, { getRow, getAll, runQuery });

      await runQuery('COMMIT');
    } catch (transactionError) {
      try {
        await runQuery('ROLLBACK');
      } catch (rollbackError) {
        console.error('Rollback mark delivered error:', rollbackError);
      }
      throw transactionError;
    }

    const updated = await fetchPurchaseById(req.params.id);

    addReviewNotification({
      actorId: req.user.id,
      actorName: req.user.username,
      actorRole: req.user.role,
      type: 'purchase',
      title: 'Marked a purchase as delivered',
      description: `${remainingQuantity} ${updated.unit} of ${updated.product_name} was received and the order was closed.`,
      createdAt: eventTimestamp
    });

    res.json({
      ...updated,
      message: 'Purchase marked as delivered and inventory updated successfully'
    });
  } catch (error) {
    console.error('Mark purchase delivered error:', error);
    res.status(error.status || 500).json({ message: error.message || 'Server error' });
  }
});

// GET list of all unique suppliers with summary stats
router.get('/suppliers', authenticateToken, async (req, res) => {
  try {
    const supplierRows = await getAll(`
      SELECT
        s.id AS supplier_id,
        s.name AS supplier,
        COALESCE(order_summary.total_purchases, 0) AS total_purchases,
        COALESCE(order_summary.total_quantity, 0) AS total_quantity,
        COALESCE(lot_summary.total_spent, 0) AS total_spent,
        COALESCE(order_summary.products_supplied, 0) AS products_supplied,
        COALESCE(order_summary.last_purchase_date, NULL) AS last_purchase_date,
        COALESCE(lot_summary.total_sold_qty, 0) AS total_sold_qty,
        COALESCE(lot_summary.total_remaining_qty, 0) AS total_remaining_qty,
        COALESCE(lot_summary.total_returned_qty, 0) AS total_returned_qty,
        COALESCE(lot_summary.sold_value, 0) AS sold_value,
        COALESCE(return_summary.total_returned_value, 0) AS total_returned_value,
        COALESCE(payment_summary.total_paid, 0) AS total_paid,
        0 AS balance_due
      FROM suppliers s
      LEFT JOIN (
        SELECT
          supplier_id,
          COUNT(*) AS total_purchases,
          COALESCE(SUM(quantity), 0) AS total_quantity,
          COUNT(DISTINCT product_id) AS products_supplied,
          MAX(COALESCE(delivery_date, purchase_date, created_at)) AS last_purchase_date
        FROM purchases
        WHERE supplier_id IS NOT NULL
        GROUP BY supplier_id
      ) order_summary ON order_summary.supplier_id = s.id
      LEFT JOIN (
        SELECT
          supplier_id,
          COALESCE(SUM(quantity_received * price_per_unit), 0) AS total_spent,
          COALESCE(SUM(quantity_sold), 0) AS total_sold_qty,
          COALESCE(SUM(quantity_remaining), 0) AS total_remaining_qty,
          COALESCE(SUM(quantity_returned), 0) AS total_returned_qty,
          COALESCE(SUM(quantity_sold * price_per_unit), 0) AS sold_value
        FROM purchase_lots
        WHERE supplier_id IS NOT NULL
        GROUP BY supplier_id
      ) lot_summary ON lot_summary.supplier_id = s.id
      LEFT JOIN (
        SELECT
          supplier_id,
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
      ORDER BY sold_value DESC, total_spent DESC, s.name ASC
    `);

    const suppliers = supplierRows.map((supplier) => ({
      ...supplier,
      balance_due: calculateOutstandingSupplierBalance({
        totalReceivedValue: supplier.total_spent,
        totalReturnedValue: supplier.total_returned_value,
        totalPaid: supplier.total_paid
      })
    }));

    res.json(suppliers);
  } catch (error) {
    console.error('Get suppliers error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET supplier detail - products supplied + purchase history
router.get('/suppliers/:name', authenticateToken, async (req, res) => {
  try {
    const supplierName = decodeURIComponent(req.params.name);
    const { start_date, end_date } = req.query;
    const supplierRecord = await resolveSupplier({ supplierName });

    const productFilter = buildSupplierFilter({
      alias: 'pu',
      nameColumn: 'supplier',
      idColumn: 'supplier_id',
      supplierRecord,
      supplierName
    });

    let dateFilter = '';
    const params = [...productFilter.params];

    if (start_date && end_date) {
      dateFilter = 'AND DATE(pu.purchase_date) BETWEEN ? AND ?';
      params.push(start_date, end_date);
    }

    const products = await getAll(`
      SELECT
        p.product_id AS product_code,
        p.product_name,
        p.variety,
        p.category,
        p.unit,
        COALESCE(SUM(pl.quantity_received), 0) AS total_quantity,
        COALESCE(SUM(pl.quantity_sold), 0) AS total_sold_qty,
        COALESCE(SUM(pl.quantity_remaining), 0) AS total_remaining_qty,
        COALESCE(SUM(pl.quantity_returned), 0) AS total_returned_qty,
        COALESCE(SUM(pl.quantity_received * pl.price_per_unit), 0) AS total_spent,
        COALESCE(SUM(pl.quantity_sold * pl.price_per_unit), 0) AS sold_value,
        COUNT(DISTINCT pu.id) AS purchase_count,
        MAX(COALESCE(pl.delivery_date, pl.purchase_date, pl.created_at)) AS last_purchase_date
      FROM purchase_lots pl
      JOIN products p ON pl.product_id = p.id
      LEFT JOIN purchases pu ON pu.id = pl.purchase_id
      WHERE ${buildSupplierFilter({
        alias: 'pl',
        nameColumn: 'supplier_name',
        idColumn: 'supplier_id',
        supplierRecord,
        supplierName
      }).clause} ${dateFilter.replace(/pu\.purchase_date/g, 'COALESCE(pl.delivery_date, pl.purchase_date, pl.created_at)')}
      GROUP BY p.id, p.product_id, p.product_name, p.variety, p.category, p.unit
      ORDER BY total_spent DESC
    `, params);

    const historyFilter = buildSupplierFilter({
      alias: 'pu',
      nameColumn: 'supplier',
      idColumn: 'supplier_id',
      supplierRecord,
      supplierName
    });
    const historyParams = [...historyFilter.params];
    let historyDateFilter = '';
    if (start_date && end_date) {
      historyDateFilter = 'AND DATE(pu.purchase_date) BETWEEN ? AND ?';
      historyParams.push(start_date, end_date);
    }

    const history = await getAll(`
      SELECT
        pu.id,
        pu.purchase_id,
        p.product_id AS product_code,
        p.product_name,
        p.variety,
        p.category,
        p.unit,
        pu.quantity,
        pu.price_per_unit,
        pu.total_amount,
        pu.purchase_date,
        pu.delivery_date,
        COALESCE(pu.purchase_status, 'delivered') AS purchase_status,
        COALESCE(pu.advance_amount, 0) AS advance_amount,
        COALESCE(pl.quantity_received, COALESCE(NULLIF(pu.quantity_delivered, 0), pu.quantity, 0)) AS quantity_received,
        COALESCE(pl.quantity_sold, 0) AS quantity_sold,
        COALESCE(pl.quantity_returned, 0) AS quantity_returned,
        COALESCE(pl.quantity_remaining, 0) AS quantity_remaining,
        COALESCE(pl.quantity_sold * pu.price_per_unit, 0) AS sold_amount,
        u.username AS added_by
      FROM purchases pu
      JOIN products p ON pu.product_id = p.id
      LEFT JOIN purchase_lots pl ON pl.purchase_id = pu.id
      LEFT JOIN users u ON pu.added_by = u.id
      WHERE ${historyFilter.clause} ${historyDateFilter}
      ORDER BY pu.purchase_date DESC
    `, historyParams);

    const summaryFilter = buildSupplierFilter({
      alias: 'purchases',
      nameColumn: 'supplier',
      idColumn: 'supplier_id',
      supplierRecord,
      supplierName
    });
    const summaryParams = [...summaryFilter.params];
    let summaryDateFilter = '';
    if (start_date && end_date) {
      summaryDateFilter = 'AND DATE(purchase_date) BETWEEN ? AND ?';
      summaryParams.push(start_date, end_date);
    }

    const summary = await getRow(`
      SELECT
        COUNT(DISTINCT pu.id) AS total_purchases,
        COUNT(DISTINCT pl.product_id) AS products_supplied,
        COALESCE(SUM(pl.quantity_received), 0) AS total_items,
        COALESCE(SUM(pl.quantity_sold), 0) AS total_sold_qty,
        COALESCE(SUM(pl.quantity_remaining), 0) AS total_remaining_qty,
        COALESCE(SUM(pl.quantity_returned), 0) AS total_returned_qty,
        COALESCE(SUM(pl.quantity_received * pl.price_per_unit), 0) AS total_cost,
        COALESCE(SUM(pl.quantity_sold * pl.price_per_unit), 0) AS sold_value
      FROM purchase_lots pl
      LEFT JOIN purchases pu ON pu.id = pl.purchase_id
      WHERE ${buildSupplierFilter({
        alias: 'pl',
        nameColumn: 'supplier_name',
        idColumn: 'supplier_id',
        supplierRecord,
        supplierName
      }).clause} ${summaryDateFilter.replace(/purchase_date/g, 'COALESCE(pl.delivery_date, pl.purchase_date, pl.created_at)')}
    `, summaryParams);

    const paymentFilter = buildSupplierFilter({
      alias: 'sp',
      nameColumn: 'supplier_name',
      idColumn: 'supplier_id',
      supplierRecord,
      supplierName
    });
    const paymentSummary = await getRow(
      `SELECT COALESCE(SUM(sp.amount), 0) AS total_paid
       FROM supplier_payments sp
       WHERE ${paymentFilter.clause}`,
      paymentFilter.params
    );

    const lotFilter = buildSupplierFilter({
      alias: 'pl',
      nameColumn: 'supplier_name',
      idColumn: 'supplier_id',
      supplierRecord,
      supplierName
    });
    const openLots = await getAll(`
      SELECT
        pl.id,
        pl.purchase_id,
        pu.purchase_id AS purchase_reference,
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
        p.product_id AS product_code,
        p.product_name,
        p.variety,
        p.category,
        p.unit
      FROM purchase_lots pl
      JOIN products p ON p.id = pl.product_id
      LEFT JOIN purchases pu ON pu.id = pl.purchase_id
      WHERE ${lotFilter.clause}
        AND pl.quantity_remaining > 0
      ORDER BY COALESCE(pl.delivery_date, pl.purchase_date, pl.created_at) ASC, pl.id ASC
    `, lotFilter.params);

    const supplierReturnFilter = buildSupplierFilter({
      alias: 'sr',
      nameColumn: 'supplier_name',
      idColumn: 'supplier_id',
      supplierRecord,
      supplierName
    });
    const supplierReturnParams = [...supplierReturnFilter.params];
    let supplierReturnDateFilter = '';
    if (start_date && end_date) {
      supplierReturnDateFilter = ' AND DATE(sr.return_date) BETWEEN ? AND ?';
      supplierReturnParams.push(start_date, end_date);
    }

    const supplierReturnSummary = await getRow(`
      SELECT
        COALESCE(SUM(sr.total_quantity), 0) AS total_returned_qty,
        COALESCE(SUM(sr.total_amount), 0) AS total_returned_value
      FROM supplier_returns sr
      WHERE ${supplierReturnFilter.clause}${supplierReturnDateFilter}
    `, supplierReturnParams);

    const supplierReturns = await getAll(`
      SELECT
        sri.id AS return_item_id,
        sr.return_id,
        sr.return_date,
        sr.notes,
        u.username AS created_by_name,
        p.product_name,
        p.product_id AS product_code,
        p.unit,
        COALESCE(pl.quantity_received, 0) AS original_quantity,
        sri.quantity_returned,
        sr.total_amount,
        sri.total_amount AS item_total_amount
      FROM supplier_returns sr
      JOIN supplier_return_items sri ON sri.supplier_return_id = sr.id
      LEFT JOIN purchase_lots pl ON pl.id = sri.purchase_lot_id
      LEFT JOIN products p ON p.id = sri.product_id
      LEFT JOIN users u ON u.id = sr.created_by
      WHERE ${supplierReturnFilter.clause}${supplierReturnDateFilter}
      ORDER BY sr.return_date DESC, sr.id DESC, sri.id ASC
    `, supplierReturnParams);

    res.json({
      supplier: supplierRecord?.name || supplierName,
      supplier_id: supplierRecord?.id || null,
      summary: {
        total_purchases: summary?.total_purchases || 0,
        total_items: summary?.total_items || 0,
        products_supplied: summary?.products_supplied || 0,
        total_sold_qty: summary?.total_sold_qty || 0,
        total_remaining_qty: summary?.total_remaining_qty || 0,
        total_returned_qty: supplierReturnSummary?.total_returned_qty || 0,
        total_cost: summary?.total_cost || 0,
        sold_value: summary?.sold_value || 0,
        total_returned_value: supplierReturnSummary?.total_returned_value || 0,
        total_paid: paymentSummary?.total_paid || 0,
        balance_due: calculateOutstandingSupplierBalance({
          totalReceivedValue: summary?.total_cost,
          totalReturnedValue: supplierReturnSummary?.total_returned_value,
          totalPaid: paymentSummary?.total_paid
        })
      },
      products,
      history,
      open_lots: openLots,
      returns: supplierReturns
    });
  } catch (error) {
    console.error('Get supplier detail error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE supplier details (admin only)
router.delete('/suppliers/:name', [
  authenticateToken,
  authorizeRole(['admin'])
], async (req, res) => {
  try {
    const supplierName = decodeURIComponent(req.params.name || '').trim();
    if (!supplierName) {
      return res.status(400).json({ message: 'Supplier name is required' });
    }

    const supplierRecord = await resolveSupplier({ supplierName });
    const purchaseFilter = buildSupplierFilter({
      alias: 'purchases',
      nameColumn: 'supplier',
      idColumn: 'supplier_id',
      supplierRecord,
      supplierName
    });
    const paymentFilter = buildSupplierFilter({
      alias: 'supplier_payments',
      nameColumn: 'supplier_name',
      idColumn: 'supplier_id',
      supplierRecord,
      supplierName
    });
    const productFilter = buildSupplierFilter({
      alias: 'products',
      nameColumn: 'supplier',
      idColumn: 'supplier_id',
      supplierRecord,
      supplierName
    });

    const [purchaseSummary, paymentSummary, productSummary] = await Promise.all([
      getRow(
        `SELECT COUNT(*) AS total_purchases, COALESCE(SUM(total_amount), 0) AS total_amount
         FROM purchases
         WHERE ${purchaseFilter.clause}`,
        purchaseFilter.params
      ),
      getRow(
        `SELECT COUNT(*) AS total_payments, COALESCE(SUM(amount), 0) AS total_amount
         FROM supplier_payments
         WHERE ${paymentFilter.clause}`,
        paymentFilter.params
      ),
      getRow(
        `SELECT COUNT(*) AS total_products
         FROM products
         WHERE ${productFilter.clause}`,
        productFilter.params
      )
    ]);

    const totalPurchases = Number(purchaseSummary?.total_purchases || 0);
    const totalPayments = Number(paymentSummary?.total_payments || 0);
    const totalProducts = Number(productSummary?.total_products || 0);

    if (!totalPurchases && !totalPayments && !totalProducts) {
      return res.status(404).json({ message: 'Supplier not found' });
    }

    const eventTimestamp = nowIST();
    const bankPaymentFilter = buildSupplierFilter({
      alias: 'sp',
      nameColumn: 'supplier_name',
      idColumn: 'supplier_id',
      supplierRecord,
      supplierName
    });

    await runQuery('BEGIN TRANSACTION');
    try {
      const bankRestorations = await getAll(
        `SELECT bank_account_id, COALESCE(SUM(amount), 0) AS total_amount
         FROM supplier_payments sp
         WHERE ${bankPaymentFilter.clause}
           AND payment_mode IN ('bank', 'upi')
           AND bank_account_id IS NOT NULL
         GROUP BY bank_account_id`,
        bankPaymentFilter.params
      );

      const bankTrackedPayments = await getAll(
        `SELECT id, bank_account_id, payment_mode
         FROM supplier_payments sp
         WHERE ${bankPaymentFilter.clause}
           AND payment_mode IN ('bank', 'upi')
           AND bank_account_id IS NOT NULL`,
        bankPaymentFilter.params
      );

      let restoredBankAmount = 0;
      for (const bankRow of bankRestorations) {
        const bankAmount = Number(bankRow.total_amount || 0);
        restoredBankAmount += bankAmount;

        await runQuery(
          'UPDATE bank_accounts SET balance = balance + ?, updated_at = ? WHERE id = ?',
          [bankAmount, eventTimestamp, bankRow.bank_account_id]
        );
      }

      for (const payment of bankTrackedPayments) {
        if (!isBankTrackedSupplierPaymentMode(payment.payment_mode) || !payment.bank_account_id) {
          continue;
        }

        await runQuery(
          `DELETE FROM bank_transfers
           WHERE source_type = 'supplier_payment'
             AND source_reference = ?
             AND bank_account_id = ?`,
          [getSupplierPaymentTransferReference(payment.id), payment.bank_account_id]
        );
      }

      const clearedPurchases = await runQuery(
        `UPDATE purchases
         SET supplier = NULL, supplier_id = NULL
         WHERE ${purchaseFilter.clause}`,
        purchaseFilter.params
      );

      const clearedProducts = await runQuery(
        `UPDATE products
         SET supplier = NULL, supplier_id = NULL, updated_at = ?
         WHERE ${productFilter.clause}`,
        [eventTimestamp, ...productFilter.params]
      );

      const deletedPayments = await runQuery(
        `DELETE FROM supplier_payments
         WHERE ${paymentFilter.clause}`,
        paymentFilter.params
      );

      if (supplierRecord?.id) {
        await runQuery('DELETE FROM suppliers WHERE id = ?', [supplierRecord.id]);
      }

      await runQuery('COMMIT');

      res.json({
        message: 'Supplier deleted successfully',
        removed: {
          purchases: clearedPurchases.changes || 0,
          products: clearedProducts.changes || 0,
          supplier_payments: deletedPayments.changes || 0,
          restored_bank_amount: restoredBankAmount
        }
      });
    } catch (transactionError) {
      try {
        await runQuery('ROLLBACK');
      } catch (rollbackError) {
        console.error('Rollback delete supplier error:', rollbackError);
      }
      throw transactionError;
    }
  } catch (error) {
    console.error('Delete supplier error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST cancel a pending purchase order
router.post('/:id/cancel', [
  authenticateToken,
  authorizeRole(['admin']),
], async (req, res) => {
  try {
    const purchase = await getRow('SELECT * FROM purchases WHERE id = ?', [req.params.id]);
    if (!purchase) return res.status(404).json({ message: 'Purchase not found' });

    if (normalizePurchaseStatus(purchase.purchase_status) === PURCHASE_STATUS.DELIVERED) {
      return res.status(400).json({ message: 'Cannot cancel a delivered purchase' });
    }

    const eventTimestamp = nowIST();

    await runQuery('BEGIN TRANSACTION');
    try {
      // Reverse advance payment if any
      if (purchase.advance_payment_id) {
        const advancePayment = await getRow('SELECT * FROM supplier_payments WHERE id = ?', [purchase.advance_payment_id]);
        if (advancePayment && advancePayment.bank_account_id) {
          await runQuery(
            'UPDATE bank_accounts SET balance = balance + ?, updated_at = ? WHERE id = ?',
            [toNumber(advancePayment.amount), eventTimestamp, advancePayment.bank_account_id]
          );
          await runQuery(
            `DELETE FROM bank_transfers WHERE source_type = 'supplier_payment' AND source_reference = ?`,
            [getSupplierPaymentTransferReference(advancePayment.id)]
          );
        }
        await runQuery('DELETE FROM supplier_payments WHERE id = ?', [purchase.advance_payment_id]);
      }

      await runQuery(
        'UPDATE purchases SET purchase_status = ?, updated_at = ? WHERE id = ?',
        ['cancelled', eventTimestamp, req.params.id]
      );

      await runQuery('COMMIT');
    } catch (txErr) {
      try { await runQuery('ROLLBACK'); } catch (e) { /* ignore */ }
      throw txErr;
    }

    const updated = await fetchPurchaseById(req.params.id);
    await logAudit(req, 'cancel', 'purchase', purchase.purchase_id, {
      advance_reversed: toNumber(purchase.advance_amount)
    });

    addReviewNotification({
      actorId: req.user.id,
      actorName: req.user.username,
      actorRole: req.user.role,
      type: 'purchase',
      title: 'Cancelled a purchase order',
      description: `Purchase order ${purchase.purchase_id} for ${updated.product_name} was cancelled.`,
      createdAt: eventTimestamp
    });

    res.json({ ...updated, message: 'Purchase order cancelled successfully' });
  } catch (error) {
    console.error('Cancel purchase error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST partial delivery of a pending purchase order
router.post('/:id/partial-delivery', [
  authenticateToken,
  authorizeRole(['admin', 'operator']),
  requireDailySetupForOperatorWrites,
  body('quantity_delivered').isInt({ min: 1 }).withMessage('Quantity delivered must be a positive whole number'),
  body('mark_as_completed').optional().isBoolean().withMessage('mark_as_completed must be true or false'),
  body('delivery_date').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const purchase = await getRow('SELECT * FROM purchases WHERE id = ?', [req.params.id]);
    if (!purchase) return res.status(404).json({ message: 'Purchase not found' });

    if (normalizePurchaseStatus(purchase.purchase_status) !== PURCHASE_STATUS.ORDERED) {
      return res.status(400).json({ message: 'Partial delivery is only available for pending orders' });
    }

    const quantityDelivered = toNumber(req.body.quantity_delivered);
    const totalQuantity = toNumber(purchase.quantity);
    const alreadyDelivered = toNumber(purchase.quantity_delivered || 0);
    const remaining = totalQuantity - alreadyDelivered;
    const markAsCompleted = Boolean(req.body.mark_as_completed);

    if (quantityDelivered > remaining) {
      return res.status(400).json({
        message: `Cannot deliver ${quantityDelivered}. Only ${remaining} units remaining.`
      });
    }

    const eventTimestamp = nowIST();
    const product = await getRow('SELECT id, gst_percent FROM products WHERE id = ?', [purchase.product_id]);
    if (!product) return res.status(404).json({ message: 'Product not found' });
    const suppliedDate = req.body.delivery_date;
    const deliveryDate = suppliedDate && String(suppliedDate).length === 10
      ? combineISTDateWithCurrentTime(suppliedDate, eventTimestamp)
      : eventTimestamp;

    const newDelivered = alreadyDelivered + quantityDelivered;
    const isFullyDelivered = newDelivered >= totalQuantity;
    const closeOrder = markAsCompleted || isFullyDelivered;
    const finalizedQuantity = closeOrder ? newDelivered : totalQuantity;
    const finalizedTotalAmount = finalizedQuantity * toNumber(purchase.price_per_unit);
    const supplierReference = await resolveCanonicalSupplier({
      supplierId: purchase.supplier_id,
      supplierName: purchase.supplier,
      eventTimestamp,
      createIfMissing: Boolean(purchase.supplier)
    });

    if (closeOrder && finalizedQuantity <= 0) {
      return res.status(400).json({ message: 'Delivered quantity must be greater than zero to close the order' });
    }

    await runQuery('BEGIN TRANSACTION');
    try {
      // Update inventory
      await runQuery(
        `UPDATE products SET
           quantity_available = quantity_available + ?,
           purchase_price = ?,
           supplier = COALESCE(?, supplier),
           supplier_id = COALESCE(?, supplier_id),
           updated_at = ?
         WHERE id = ?`,
        [quantityDelivered, toNumber(purchase.price_per_unit), supplierReference.supplierName, supplierReference.supplierId, eventTimestamp, purchase.product_id]
      );

      await runQuery(
        `UPDATE purchases SET
           supplier = ?,
           supplier_id = ?,
           quantity = ?,
           total_amount = ?,
           quantity_delivered = ?,
           purchase_status = ?,
           delivery_date = ?,
           updated_at = ?
         WHERE id = ?`,
        [
          supplierReference.supplierName,
          supplierReference.supplierId,
          finalizedQuantity,
          finalizedTotalAmount,
          newDelivered,
          closeOrder ? PURCHASE_STATUS.DELIVERED : PURCHASE_STATUS.ORDERED,
          deliveryDate,
          eventTimestamp,
          req.params.id
        ]
      );

      await syncPurchaseLotForPurchase({
        purchaseId: purchase.id,
        productId: purchase.product_id,
        supplierId: supplierReference.supplierId,
        supplierName: supplierReference.supplierName,
        deliveredQuantity: newDelivered,
        pricePerUnit: toNumber(purchase.price_per_unit),
        gstPercent: product.gst_percent,
        purchaseDate: purchase.purchase_date || eventTimestamp,
        deliveryDate,
        eventTimestamp
      }, { getRow, getAll, runQuery });

      await runQuery('COMMIT');
    } catch (txErr) {
      try { await runQuery('ROLLBACK'); } catch (e) { /* ignore */ }
      throw txErr;
    }

    const updated = await fetchPurchaseById(req.params.id);
    await logAudit(req, 'partial_delivery', 'purchase', purchase.purchase_id, {
      product_id: purchase.product_id,
      product_code: updated.product_code,
      product_name: updated.product_name,
      unit: updated.unit,
      quantity_delivered: quantityDelivered,
      total_delivered: newDelivered,
      fully_delivered: isFullyDelivered,
      closed_with_short_delivery: closeOrder && !isFullyDelivered,
      original_quantity: totalQuantity,
      finalized_quantity: finalizedQuantity
    });

    addReviewNotification({
      actorId: req.user.id,
      actorName: req.user.username,
      actorRole: req.user.role,
      type: 'purchase',
      title: closeOrder ? 'Closed a purchase order after delivery' : 'Recorded partial delivery',
      description: closeOrder
        ? `${newDelivered} ${updated.unit} of ${updated.product_name} was received in total and the remaining balance was closed.`
        : `${quantityDelivered} ${updated.unit} of ${updated.product_name} received (${newDelivered}/${totalQuantity} total).`,
      createdAt: eventTimestamp
    });

    res.json({
      ...updated,
      message: closeOrder
        ? (isFullyDelivered
          ? 'Final delivery recorded. Order fully received.'
          : 'Delivery recorded and the remaining quantity was closed.')
        : `Partial delivery recorded. ${totalQuantity - newDelivered} units remaining.`
    });
  } catch (error) {
    console.error('Partial delivery error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
