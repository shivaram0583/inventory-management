const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticateToken, authorizeRole } = require('../middleware/auth');
const { requireDailySetupForOperatorWrites } = require('../middleware/dailySetup');
const {
  getRow,
  runQuery,
  getAll,
  nowIST,
  combineISTDateWithCurrentTime
} = require('../database/db');
const crypto = require('crypto');
const moment = require('moment');
const { addReviewNotification } = require('../services/reviewNotifications');
const {
  isBankTrackedSupplierPaymentMode,
  getSupplierPaymentTransferReference,
  createSupplierPaymentRecord
} = require('../services/bankLedger');

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
    MAX(COALESCE(pur.total_amount, 0) - COALESCE(pur.advance_amount, 0), 0) AS balance_due,
    COALESCE(p.product_name, '[Deleted Product]') AS product_name,
    p.variety,
    p.unit,
    p.category,
    COALESCE(p.is_deleted, 0) AS product_deleted,
    u.username AS added_by_name
  FROM purchases pur
  LEFT JOIN products p ON pur.product_id = p.id
  LEFT JOIN users u ON pur.added_by = u.id
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
  supplierName,
  amount,
  bankAccountId,
  purchaseId,
  paymentDate,
  userId,
  eventTimestamp
}) {
  const result = await createSupplierPaymentRecord({
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
    const { start_date, end_date, product_id, status } = req.query;
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
    if (status && ['ordered', 'delivered'].includes(String(status).toLowerCase())) {
      query += ' AND COALESCE(pur.purchase_status, ?) = ?';
      params.push(PURCHASE_STATUS.DELIVERED, normalizePurchaseStatus(status));
    }

    query += ' ORDER BY pur.purchase_date DESC';
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
           purchase_date,
           delivery_date,
           purchase_status,
           advance_amount,
           added_by
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          purchaseId,
          product_id,
          quantityValue,
          pricePerUnitValue,
          totalAmount,
          supplierName || null,
          storedDate,
          deliveryDate,
          purchaseStatus,
          advanceAmount,
          req.user.id
        ]
      );
      purchaseRowId = purchaseResult.id;

      if (advanceAmount > 0) {
        const advancePaymentId = await createAdvancePayment({
          supplierName,
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
             updated_at = ?
           WHERE id = ?`,
          [quantityValue, pricePerUnitValue, supplierName || null, eventTimestamp, product_id]
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

    const { quantity, price_per_unit, supplier, purchase_date } = req.body;
    const quantityValue = toNumber(quantity);
    const pricePerUnitValue = toNumber(price_per_unit);
    const totalAmount = quantityValue * pricePerUnitValue;
    const supplierName = supplier ? String(supplier).trim() : '';
    const purchaseStatus = normalizePurchaseStatus(purchase.purchase_status);
    const existingAdvance = toNumber(purchase.advance_amount);

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
             updated_at = ?
           WHERE id = ?`,
          [qtyDiff, pricePerUnitValue, supplierName || null, eventTimestamp, purchase.product_id]
        );
      }

      if (purchase.advance_payment_id && supplierName) {
        await runQuery(
          `UPDATE supplier_payments
           SET supplier_name = ?, description = ?
           WHERE id = ?`,
          [supplierName, `Advance payment for purchase ${purchase.purchase_id}`, purchase.advance_payment_id]
        );
      }

      await runQuery(
        `UPDATE purchases SET
           quantity = ?,
           price_per_unit = ?,
           total_amount = ?,
           supplier = ?,
           purchase_date = ?,
           delivery_date = ?
         WHERE id = ?`,
        [
          quantityValue,
          pricePerUnitValue,
          totalAmount,
          supplierName || null,
          storedDate,
          nextDeliveryDate || null,
          req.params.id
        ]
      );

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
    const suppliedDeliveryDate = req.body.delivery_date;
    const deliveryDate = suppliedDeliveryDate && String(suppliedDeliveryDate).length === 10
      ? combineISTDateWithCurrentTime(suppliedDeliveryDate, eventTimestamp)
      : eventTimestamp;

    await runQuery('BEGIN TRANSACTION');
    try {
      await runQuery(
        `UPDATE products SET
           quantity_available = quantity_available + ?,
           purchase_price = ?,
           supplier = COALESCE(?, supplier),
           updated_at = ?
         WHERE id = ?`,
        [
          toNumber(purchase.quantity),
          toNumber(purchase.price_per_unit),
          purchase.supplier || null,
          eventTimestamp,
          purchase.product_id
        ]
      );

      await runQuery(
        `UPDATE purchases
         SET purchase_status = ?, delivery_date = ?
         WHERE id = ?`,
        [PURCHASE_STATUS.DELIVERED, deliveryDate, req.params.id]
      );

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
      description: `${updated.quantity} ${updated.unit} of ${updated.product_name} was received into inventory.`,
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
    const suppliers = await getAll(`
      SELECT
        pu.supplier,
        COUNT(pu.id) AS total_purchases,
        SUM(pu.quantity) AS total_quantity,
        SUM(pu.total_amount) AS total_spent,
        COUNT(DISTINCT pu.product_id) AS products_supplied,
        MAX(pu.purchase_date) AS last_purchase_date
      FROM purchases pu
      WHERE pu.supplier IS NOT NULL AND pu.supplier != ''
      GROUP BY pu.supplier
      ORDER BY total_spent DESC
    `);
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

    let dateFilter = '';
    const params = [supplierName];

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
        SUM(pu.quantity) AS total_quantity,
        SUM(pu.total_amount) AS total_spent,
        COUNT(pu.id) AS purchase_count,
        MAX(pu.purchase_date) AS last_purchase_date
      FROM purchases pu
      JOIN products p ON pu.product_id = p.id
      WHERE pu.supplier = ? ${dateFilter}
      GROUP BY p.id, p.product_id, p.product_name, p.variety, p.category, p.unit
      ORDER BY total_spent DESC
    `, params);

    const historyParams = [supplierName];
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
        u.username AS added_by
      FROM purchases pu
      JOIN products p ON pu.product_id = p.id
      LEFT JOIN users u ON pu.added_by = u.id
      WHERE pu.supplier = ? ${historyDateFilter}
      ORDER BY pu.purchase_date DESC
    `, historyParams);

    const summaryParams = [supplierName];
    let summaryDateFilter = '';
    if (start_date && end_date) {
      summaryDateFilter = 'AND DATE(purchase_date) BETWEEN ? AND ?';
      summaryParams.push(start_date, end_date);
    }

    const summary = await getRow(`
      SELECT
        COUNT(*) AS total_purchases,
        SUM(quantity) AS total_items,
        SUM(total_amount) AS total_cost
      FROM purchases
      WHERE supplier = ? ${summaryDateFilter}
    `, summaryParams);

    res.json({
      supplier: supplierName,
      summary: {
        total_purchases: summary?.total_purchases || 0,
        total_items: summary?.total_items || 0,
        total_cost: summary?.total_cost || 0
      },
      products,
      history
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

    const [purchaseSummary, paymentSummary, productSummary] = await Promise.all([
      getRow(
        `SELECT COUNT(*) AS total_purchases, COALESCE(SUM(total_amount), 0) AS total_amount
         FROM purchases
         WHERE supplier = ?`,
        [supplierName]
      ),
      getRow(
        `SELECT COUNT(*) AS total_payments, COALESCE(SUM(amount), 0) AS total_amount
         FROM supplier_payments
         WHERE supplier_name = ?`,
        [supplierName]
      ),
      getRow(
        `SELECT COUNT(*) AS total_products
         FROM products
         WHERE supplier = ?`,
        [supplierName]
      )
    ]);

    const totalPurchases = Number(purchaseSummary?.total_purchases || 0);
    const totalPayments = Number(paymentSummary?.total_payments || 0);
    const totalProducts = Number(productSummary?.total_products || 0);

    if (!totalPurchases && !totalPayments && !totalProducts) {
      return res.status(404).json({ message: 'Supplier not found' });
    }

    const eventTimestamp = nowIST();

    await runQuery('BEGIN TRANSACTION');
    try {
      const bankRestorations = await getAll(
        `SELECT bank_account_id, COALESCE(SUM(amount), 0) AS total_amount
         FROM supplier_payments
         WHERE supplier_name = ?
           AND payment_mode IN ('bank', 'upi')
           AND bank_account_id IS NOT NULL
         GROUP BY bank_account_id`,
        [supplierName]
      );

      const bankTrackedPayments = await getAll(
        `SELECT id, bank_account_id, payment_mode
         FROM supplier_payments
         WHERE supplier_name = ?
           AND payment_mode IN ('bank', 'upi')
           AND bank_account_id IS NOT NULL`,
        [supplierName]
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
        'UPDATE purchases SET supplier = NULL WHERE supplier = ?',
        [supplierName]
      );

      const clearedProducts = await runQuery(
        'UPDATE products SET supplier = NULL, updated_at = ? WHERE supplier = ?',
        [eventTimestamp, supplierName]
      );

      const deletedPayments = await runQuery(
        'DELETE FROM supplier_payments WHERE supplier_name = ?',
        [supplierName]
      );

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

module.exports = router;
