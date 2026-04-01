const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticateToken, authorizeRole } = require('../middleware/auth');
const { requireDailySetupForOperatorWrites } = require('../middleware/dailySetup');
const { getRow, runQuery, getAll, nowIST, combineISTDateWithCurrentTime } = require('../database/db');
const crypto = require('crypto');
const moment = require('moment');
const { addReviewNotification } = require('../services/reviewNotifications');

const router = express.Router();

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
    const { start_date, end_date, product_id } = req.query;
    let query = `
      SELECT pur.*, p.product_name, p.variety, p.unit, p.category, u.username as added_by_name
      FROM purchases pur
      JOIN products p ON pur.product_id = p.id
      LEFT JOIN users u ON pur.added_by = u.id
      WHERE 1=1
    `;
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
    query += ' ORDER BY pur.purchase_date DESC';
    const purchases = await getAll(query, params);
    res.json(purchases);
  } catch (error) {
    console.error('Get purchases error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST record a new purchase
router.post('/', [
  authenticateToken,
  authorizeRole(['admin', 'operator']),
  requireDailySetupForOperatorWrites,
  body('product_id').isInt({ min: 1 }).withMessage('Valid product ID is required'),
  body('quantity').isFloat({ min: 0.01 }).withMessage('Quantity must be positive'),
  body('price_per_unit').isFloat({ min: 0 }).withMessage('Price must be non-negative')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { product_id, quantity, price_per_unit, supplier, purchase_date } = req.body;

    const product = await getRow('SELECT * FROM products WHERE id = ?', [product_id]);
    if (!product) return res.status(404).json({ message: 'Product not found' });

    const totalAmount = quantity * price_per_unit;
    const purchaseId = 'PUR' + moment().utcOffset('+05:30').format('YYYYMMDDHHmmss') +
      crypto.randomBytes(2).toString('hex').toUpperCase();

    const eventTimestamp = nowIST();
    const storedDate = purchase_date && String(purchase_date).length === 10
      ? combineISTDateWithCurrentTime(purchase_date, eventTimestamp)
      : eventTimestamp;

    // Insert purchase record
    const result = await runQuery(
      `INSERT INTO purchases (purchase_id, product_id, quantity, price_per_unit, total_amount, supplier, purchase_date, added_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [purchaseId, product_id, quantity, price_per_unit, totalAmount,
        supplier || null,
        storedDate,
        req.user.id]
    );

    // Update product stock and purchase price
    await runQuery(
      `UPDATE products SET
         quantity_available = quantity_available + ?,
         purchase_price = ?,
         supplier = COALESCE(?, supplier),
         updated_at = ?
       WHERE id = ?`,
      [quantity, price_per_unit, supplier || null, eventTimestamp, product_id]
    );

    const purchase = await getRow(
      `SELECT pur.*, p.product_name, p.variety, p.unit, p.category, u.username as added_by_name
       FROM purchases pur
       JOIN products p ON pur.product_id = p.id
       LEFT JOIN users u ON pur.added_by = u.id
       WHERE pur.id = ?`,
      [result.id]
    );

    addReviewNotification({
      actorId: req.user.id,
      actorName: req.user.username,
      actorRole: req.user.role,
      type: 'purchase',
      title: 'Recorded a purchase',
      description: `${quantity} ${purchase.unit} of ${purchase.product_name} was purchased${supplier ? ` from ${supplier}` : ''}.`,
      createdAt: eventTimestamp
    });

    res.status(201).json({ ...purchase, message: 'Purchase recorded successfully' });
  } catch (error) {
    console.error('Record purchase error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT edit an existing purchase
router.put('/:id', [
  authenticateToken,
  authorizeRole(['admin', 'operator']),
  requireDailySetupForOperatorWrites,
  body('quantity').isFloat({ min: 0.01 }).withMessage('Quantity must be positive'),
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
    const totalAmount = quantity * price_per_unit;
    const qtyDiff = quantity - purchase.quantity;

    const eventTimestamp = nowIST();
    const storedDate = purchase_date && String(purchase_date).length === 10
      ? combineISTDateWithCurrentTime(purchase_date, eventTimestamp)
      : purchase.purchase_date;

    // Adjust product stock by the quantity difference
    await runQuery(
      `UPDATE products SET
         quantity_available = quantity_available + ?,
         purchase_price = ?,
         updated_at = ?
       WHERE id = ?`,
      [qtyDiff, price_per_unit, eventTimestamp, purchase.product_id]
    );

    await runQuery(
      `UPDATE purchases SET
         quantity = ?, price_per_unit = ?, total_amount = ?,
         supplier = ?, purchase_date = ?
       WHERE id = ?`,
      [quantity, price_per_unit, totalAmount,
        supplier || null,
        storedDate,
        req.params.id]
    );

    const updated = await getRow(
      `SELECT pur.*, p.product_name, p.variety, p.unit, p.category, u.username as added_by_name
       FROM purchases pur
       JOIN products p ON pur.product_id = p.id
       LEFT JOIN users u ON pur.added_by = u.id
       WHERE pur.id = ?`,
      [req.params.id]
    );

    addReviewNotification({
      actorId: req.user.id,
      actorName: req.user.username,
      actorRole: req.user.role,
      type: 'purchase',
      title: 'Updated a purchase',
      description: `Purchase for ${updated.product_name} was updated to ${quantity} ${updated.unit}.`,
      createdAt: eventTimestamp
    });

    res.json({ ...updated, message: 'Purchase updated successfully' });
  } catch (error) {
    console.error('Edit purchase error:', error);
    res.status(500).json({ message: 'Server error' });
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

// GET supplier detail — products supplied + purchase history
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

    // Products supplied by this supplier
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

    // Full purchase history for this supplier
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
        u.username AS added_by
      FROM purchases pu
      JOIN products p ON pu.product_id = p.id
      LEFT JOIN users u ON pu.added_by = u.id
      WHERE pu.supplier = ? ${historyDateFilter}
      ORDER BY pu.purchase_date DESC
    `, historyParams);

    // Summary
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
           AND payment_mode = 'bank'
           AND bank_account_id IS NOT NULL
         GROUP BY bank_account_id`,
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
