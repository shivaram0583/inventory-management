const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticateToken, authorizeRole } = require('../middleware/auth');
const { requireDailySetupForOperatorWrites } = require('../middleware/dailySetup');
const { getRow, runQuery, getAll, nowIST, combineISTDateWithCurrentTime } = require('../database/db');
const { addReviewNotification } = require('../services/reviewNotifications');
const { createSupplierPaymentRecord } = require('../services/bankLedger');
const { logAudit } = require('../middleware/auditLog');
const crypto = require('crypto');
const moment = require('moment');

const router = express.Router();

const PRODUCT_CREATION_MODE = {
  INVENTORY: 'inventory',
  ORDER: 'order'
};

const PURCHASE_STATUS = {
  ORDERED: 'ordered',
  DELIVERED: 'delivered'
};

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const createHttpError = (status, message) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

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

// Get all products
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { category, search } = req.query;
    let query = `
      SELECT p.*
      FROM products p
      WHERE COALESCE(p.is_deleted, 0) = 0
      AND NOT (
        COALESCE(p.quantity_available, 0) <= 0
        AND EXISTS (
          SELECT 1
          FROM purchases pur
          WHERE pur.product_id = p.id
            AND COALESCE(pur.purchase_status, 'delivered') = 'ordered'
        )
      )`;
    const params = [];

    if (category && category !== 'all') {
      query += ' AND p.category = ?';
      params.push(category);
    }

    if (search) {
      query += ' AND (p.product_name LIKE ? OR p.variety LIKE ? OR p.product_id LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    query += ' ORDER BY p.created_at DESC';
    
    const products = await getAll(query, params);
    res.json(products);
  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Generate next product ID based on category
router.get('/next-id', authenticateToken, async (req, res) => {
  try {
    const { category } = req.query;
    if (!category) return res.status(400).json({ message: 'Category is required' });

    const prefix = category.substring(0, 4).toUpperCase();
    const latest = await getRow(
      `SELECT product_id FROM products WHERE product_id LIKE ? ORDER BY product_id DESC LIMIT 1`,
      [`${prefix}%`]
    );

    let nextNum = 1;
    if (latest) {
      const match = latest.product_id.match(/(\d+)$/);
      if (match) nextNum = parseInt(match[1]) + 1;
    }

    const nextId = prefix + String(nextNum).padStart(3, '0');
    res.json({ nextId });
  } catch (error) {
    console.error('Generate next ID error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get single product
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const product = await getRow('SELECT * FROM products WHERE id = ?', [req.params.id]);
    
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    res.json(product);
  } catch (error) {
    console.error('Get product error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Add new product (admin and operator)
router.post('/', [
  authenticateToken,
  authorizeRole(['admin', 'operator']),
  requireDailySetupForOperatorWrites,
  body('product_id').optional(),
  body('product_name').notEmpty().withMessage('Product name is required'),
  body('category').notEmpty().withMessage('Category is required'),
  body('unit').isIn(['kg', 'grams', 'packet', 'bag', 'liters', 'ml', 'pieces', 'bottles', 'tonnes']).withMessage('Invalid unit'),
  body('quantity_available').isInt({ min: 0 }).withMessage('Quantity must be a non-negative whole number'),
  body('purchase_price').isFloat({ min: 0 }).withMessage('Purchase price must be non-negative'),
  body('selling_price').isFloat({ min: 0 }).withMessage('Selling price must be non-negative'),
  body('creation_mode').optional().isIn(['inventory', 'order']).withMessage('Invalid creation mode'),
  body('order_quantity').optional().isInt({ min: 1 }).withMessage('Order quantity must be a positive whole number'),
  body('order_date').optional().trim(),
  body('advance_amount').optional().isFloat({ min: 0 }).withMessage('Advance amount must be non-negative'),
  body('bank_account_id').optional({ nullable: true }).isInt({ min: 1 }).withMessage('Invalid bank account'),
  body('gst_percent').optional().isFloat({ min: 0, max: 28 }).withMessage('GST must be 0-28%'),
  body('hsn_code').optional().isString(),
  body('reorder_point').optional().isFloat({ min: 0 }),
  body('reorder_quantity').optional().isFloat({ min: 0 }),
  body('barcode').optional().isString(),
  body('expiry_date').optional().isString(),
  body('batch_number').optional().isString(),
  body('manufacturing_date').optional().isString()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    let {
      product_id,
      category,
      product_name,
      variety,
      quantity_available,
      unit,
      purchase_price,
      selling_price,
      supplier,
      creation_mode,
      order_quantity,
      order_date,
      advance_amount,
      bank_account_id,
      gst_percent,
      hsn_code,
      reorder_point,
      reorder_quantity,
      barcode,
      expiry_date,
      batch_number,
      manufacturing_date
    } = req.body;

    const creationMode = creation_mode === PRODUCT_CREATION_MODE.ORDER
      ? PRODUCT_CREATION_MODE.ORDER
      : PRODUCT_CREATION_MODE.INVENTORY;
    const inventoryQuantity = creationMode === PRODUCT_CREATION_MODE.ORDER ? 0 : toNumber(quantity_available);
    const orderQuantity = creationMode === PRODUCT_CREATION_MODE.ORDER ? toNumber(order_quantity) : 0;
    const advanceAmount = creationMode === PRODUCT_CREATION_MODE.ORDER ? toNumber(advance_amount) : 0;
    const bankAccountId = bank_account_id ? Number(bank_account_id) : null;
    const supplierName = supplier ? String(supplier).trim() : '';

    if (creationMode === PRODUCT_CREATION_MODE.ORDER && orderQuantity <= 0) {
      return res.status(400).json({ message: 'Enter an order quantity for ordered products' });
    }

    if (creationMode === PRODUCT_CREATION_MODE.ORDER) {
      const orderTotal = orderQuantity * toNumber(purchase_price);
      if (advanceAmount > orderTotal) {
        return res.status(400).json({ message: 'Advance amount cannot exceed the total order amount' });
      }
      if (advanceAmount > 0 && !supplierName) {
        return res.status(400).json({ message: 'Supplier is required when paying an advance amount' });
      }
      if (advanceAmount > 0 && !bankAccountId) {
        return res.status(400).json({ message: 'Select a bank account for the advance payment' });
      }
    }

    // Validate category against product_categories table
    const validCategory = await getRow('SELECT id FROM product_categories WHERE name = ?', [category]);
    if (!validCategory) {
      return res.status(400).json({ message: `Invalid category: ${category}` });
    }

    // Auto-generate product_id if not provided
    if (!product_id || !product_id.trim()) {
      const prefix = category.substring(0, 4).toUpperCase();
      const latest = await getRow(
        `SELECT product_id FROM products WHERE product_id LIKE ? ORDER BY product_id DESC LIMIT 1`,
        [`${prefix}%`]
      );
      let nextNum = 1;
      if (latest) {
        const match = latest.product_id.match(/(\d+)$/);
        if (match) nextNum = parseInt(match[1]) + 1;
      }
      product_id = prefix + String(nextNum).padStart(3, '0');
    }

    // Check if product_id already exists
    const existingProduct = await getRow('SELECT id FROM products WHERE product_id = ?', [product_id]);
    if (existingProduct) {
      return res.status(400).json({ message: 'Product ID already exists' });
    }

    const eventTimestamp = nowIST();
    let newProduct;
    let createdPurchase = null;

    await runQuery('BEGIN TRANSACTION');
    try {
      const result = await runQuery(
        `INSERT INTO products (product_id, category, product_name, variety, quantity_available, unit, purchase_price, selling_price, supplier, gst_percent, hsn_code, reorder_point, reorder_quantity, barcode, expiry_date, batch_number, manufacturing_date)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [product_id, category, product_name, variety, inventoryQuantity, unit, purchase_price, selling_price, supplierName || null,
         toNumber(gst_percent), hsn_code || null, toNumber(reorder_point) || 10, toNumber(reorder_quantity), barcode || null, expiry_date || null, batch_number || null, manufacturing_date || null]
      );

      newProduct = await getRow('SELECT * FROM products WHERE id = ?', [result.id]);

      if (creationMode === PRODUCT_CREATION_MODE.INVENTORY && inventoryQuantity > 0) {
        const purchaseId = 'PUR' + Date.now() + crypto.randomBytes(2).toString('hex').toUpperCase();
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
            newProduct.id,
            inventoryQuantity,
            toNumber(purchase_price),
            inventoryQuantity * toNumber(purchase_price),
            supplierName || null,
            eventTimestamp,
            eventTimestamp,
            PURCHASE_STATUS.DELIVERED,
            0,
            req.user.id
          ]
        );
        createdPurchase = await getRow('SELECT * FROM purchases WHERE id = ?', [purchaseResult.id]);
      }

      if (creationMode === PRODUCT_CREATION_MODE.ORDER) {
        const purchaseId = 'PUR' + moment().utcOffset('+05:30').format('YYYYMMDDHHmmss') +
          crypto.randomBytes(2).toString('hex').toUpperCase();
        const storedOrderDate = order_date && String(order_date).length === 10
          ? combineISTDateWithCurrentTime(order_date, eventTimestamp)
          : eventTimestamp;

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
            newProduct.id,
            orderQuantity,
            toNumber(purchase_price),
            orderQuantity * toNumber(purchase_price),
            supplierName || null,
            storedOrderDate,
            null,
            PURCHASE_STATUS.ORDERED,
            advanceAmount,
            req.user.id
          ]
        );

        if (advanceAmount > 0) {
          const advancePaymentId = await createAdvancePayment({
            supplierName,
            amount: advanceAmount,
            bankAccountId,
            purchaseId,
            paymentDate: String(storedOrderDate).slice(0, 10),
            userId: req.user.id,
            eventTimestamp
          });

          await runQuery(
            'UPDATE purchases SET advance_payment_id = ? WHERE id = ?',
            [advancePaymentId, purchaseResult.id]
          );
        }

        createdPurchase = await getRow('SELECT * FROM purchases WHERE id = ?', [purchaseResult.id]);
      }

      await runQuery('COMMIT');
    } catch (transactionError) {
      try {
        await runQuery('ROLLBACK');
      } catch (rollbackError) {
        console.error('Rollback add product error:', rollbackError);
      }
      throw transactionError;
    }

    addReviewNotification({
      actorId: req.user.id,
      actorName: req.user.username,
      actorRole: req.user.role,
      type: 'inventory',
      title: creationMode === PRODUCT_CREATION_MODE.ORDER ? 'Added a new product and placed an order' : 'Added a new inventory item',
      description: creationMode === PRODUCT_CREATION_MODE.ORDER
        ? `${newProduct.product_name} (${newProduct.product_id}) was created and ordered for ${orderQuantity} ${newProduct.unit}.`
        : `${newProduct.product_name} (${newProduct.product_id}) was added under ${newProduct.category}.`,
      createdAt: eventTimestamp
    });

    res.status(201).json({
      ...newProduct,
      created_purchase: createdPurchase,
      creation_mode: creationMode
    });
  } catch (error) {
    console.error('Add product error:', error);
    res.status(error.status || 500).json({ message: error.message || 'Server error' });
  }
});

// Update product (admin and operator)
router.put('/:id', [
  authenticateToken,
  authorizeRole(['admin', 'operator']),
  requireDailySetupForOperatorWrites,
  body('selling_price').optional().isFloat({ min: 0 }).withMessage('Selling price must be non-negative'),
  body('gst_percent').optional().isFloat({ min: 0, max: 28 }),
  body('hsn_code').optional().isString(),
  body('reorder_point').optional().isFloat({ min: 0 }),
  body('reorder_quantity').optional().isFloat({ min: 0 }),
  body('barcode').optional().isString(),
  body('expiry_date').optional().isString(),
  body('batch_number').optional().isString(),
  body('manufacturing_date').optional().isString()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const productId = req.params.id;
    const product = await getRow('SELECT id FROM products WHERE id = ?', [productId]);
    
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    const updateFields = [];
    const updateValues = [];
    const { selling_price, gst_percent, hsn_code, reorder_point, reorder_quantity, barcode, expiry_date, batch_number, manufacturing_date } = req.body;

    if (selling_price !== undefined) { updateFields.push('selling_price = ?'); updateValues.push(selling_price); }
    if (gst_percent !== undefined) { updateFields.push('gst_percent = ?'); updateValues.push(gst_percent); }
    if (hsn_code !== undefined) { updateFields.push('hsn_code = ?'); updateValues.push(hsn_code); }
    if (reorder_point !== undefined) { updateFields.push('reorder_point = ?'); updateValues.push(reorder_point); }
    if (reorder_quantity !== undefined) { updateFields.push('reorder_quantity = ?'); updateValues.push(reorder_quantity); }
    if (barcode !== undefined) { updateFields.push('barcode = ?'); updateValues.push(barcode); }
    if (expiry_date !== undefined) { updateFields.push('expiry_date = ?'); updateValues.push(expiry_date || null); }
    if (batch_number !== undefined) { updateFields.push('batch_number = ?'); updateValues.push(batch_number || null); }
    if (manufacturing_date !== undefined) { updateFields.push('manufacturing_date = ?'); updateValues.push(manufacturing_date || null); }

    if (updateFields.length === 0) {
      return res.status(400).json({ message: 'No valid fields to update' });
    }

    updateFields.push('updated_at = ?');
    updateValues.push(nowIST());
    updateValues.push(productId);

    await runQuery(
      `UPDATE products SET ${updateFields.join(', ')} WHERE id = ?`,
      updateValues
    );

    const updatedProduct = await getRow('SELECT * FROM products WHERE id = ?', [productId]);

    addReviewNotification({
      actorId: req.user.id,
      actorName: req.user.username,
      actorRole: req.user.role,
      type: 'inventory',
      title: 'Updated an inventory item',
      description: `${updatedProduct.product_name} (${updatedProduct.product_id}) was updated.`,
      createdAt: nowIST()
    });

    res.json(updatedProduct);
  } catch (error) {
    console.error('Update product error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete product (admin only)
router.delete('/:id', [
  authenticateToken,
  authorizeRole(['admin'])
], async (req, res) => {
  try {
    const productId = req.params.id;
    const product = await getRow('SELECT id FROM products WHERE id = ?', [productId]);
    
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // Check if product has sales records
    const salesCount = await getRow('SELECT COUNT(*) as count FROM sales WHERE product_id = ?', [productId]);
    if (salesCount.count > 0) {
      return res.status(400).json({ message: 'Cannot delete product with sales records' });
    }

    // Check if product has purchase history — soft-delete to preserve history
    const purchaseCount = await getRow('SELECT COUNT(*) as count FROM purchases WHERE product_id = ?', [productId]);
    if (purchaseCount.count > 0) {
      await runQuery('UPDATE products SET is_deleted = 1, quantity_available = 0 WHERE id = ?', [productId]);
      return res.json({ message: 'Product removed from inventory. Purchase history preserved.' });
    }

    await runQuery('DELETE FROM products WHERE id = ?', [productId]);
    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    console.error('Delete product error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Add stock (admin and operator)
router.post('/:id/add-stock', [
  authenticateToken,
  authorizeRole(['admin', 'operator']),
  requireDailySetupForOperatorWrites,
  body('quantity').isInt({ min: 1 }).withMessage('Quantity must be a positive whole number')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const productId = req.params.id;
    const { quantity } = req.body;

    const product = await getRow('SELECT id, quantity_available FROM products WHERE id = ?', [productId]);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    const newQuantity = product.quantity_available + quantity;
    await runQuery(
      'UPDATE products SET quantity_available = ?, updated_at = ? WHERE id = ?',
      [newQuantity, nowIST(), productId]
    );

    const updatedProduct = await getRow('SELECT * FROM products WHERE id = ?', [productId]);

    // Record purchase
    const crypto = require('crypto');
    const purchaseId = 'PUR' + Date.now() + crypto.randomBytes(2).toString('hex').toUpperCase();
    await runQuery(
      `INSERT INTO purchases (purchase_id, product_id, quantity, price_per_unit, total_amount, supplier, added_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [purchaseId, updatedProduct.id, quantity, updatedProduct.purchase_price, quantity * updatedProduct.purchase_price, updatedProduct.supplier || null, req.user.id]
    );

    addReviewNotification({
      actorId: req.user.id,
      actorName: req.user.username,
      actorRole: req.user.role,
      type: 'inventory',
      title: 'Added stock to inventory',
      description: `${quantity} ${updatedProduct.unit} was added to ${updatedProduct.product_name} (${updatedProduct.product_id}).`,
      createdAt: nowIST()
    });

    res.json({
      message: `Added ${quantity} ${updatedProduct.unit} to stock`,
      product: updatedProduct
    });
  } catch (error) {
    console.error('Add stock error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get low stock items (using configurable reorder_point per product)
router.get('/alerts/low-stock', authenticateToken, async (req, res) => {
  try {
    const products = await getAll(
      `SELECT p.*
       FROM products p
       WHERE p.quantity_available <= COALESCE(p.reorder_point, 10)
         AND COALESCE(p.is_deleted, 0) = 0
         AND NOT (
           COALESCE(p.quantity_available, 0) <= 0
           AND EXISTS (
             SELECT 1
             FROM purchases pur
             WHERE pur.product_id = p.id
               AND COALESCE(pur.purchase_status, 'delivered') = 'ordered'
           )
         )
       ORDER BY p.quantity_available ASC`
    );
    res.json(products);
  } catch (error) {
    console.error('Get low stock error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get expiring products
router.get('/alerts/expiring', authenticateToken, async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const products = await getAll(
      `SELECT * FROM products
       WHERE expiry_date IS NOT NULL
         AND DATE(expiry_date) <= DATE('now', '+' || ? || ' days')
         AND COALESCE(is_deleted, 0) = 0
       ORDER BY expiry_date ASC`,
      [parseInt(days)]
    );
    res.json(products);
  } catch (error) {
    console.error('Get expiring products error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
