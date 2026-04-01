const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticateToken } = require('../middleware/auth');
const { requireDailySetupForOperatorWrites } = require('../middleware/dailySetup');
const { getRow, runQuery, getAll, nowIST } = require('../database/db');
const moment = require('moment');
const { addReviewNotification } = require('../services/reviewNotifications');
const { getDailySetupStatus, getISTDateString } = require('../services/dailySetup');

const router = express.Router();

// Generate unique sale ID
function generateSaleId() {
  return 'SALE' + moment().utcOffset('+05:30').format('YYYYMMDDHHmmss') + Math.random().toString(36).substr(2, 4).toUpperCase();
}

// Generate unique receipt number: R-YYYYMMDD-customername-XX
function generateReceiptNumber(customerName) {
  const date = moment().utcOffset('+05:30').format('YYYYMMDD');
  const sanitized = (customerName || 'customer')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .substring(0, 15) || 'customer';
  const rand = Math.random().toString(36).substr(2, 2).toUpperCase();
  return `R-${date}-${sanitized}-${rand}`;
}

// Create sale
router.post('/', [
  authenticateToken,
  requireDailySetupForOperatorWrites,
  body('items').isArray({ min: 1 }).withMessage('At least one item is required'),
  body('items.*.product_id').isInt({ min: 1 }).withMessage('Valid product ID is required'),
  body('items.*.quantity').isFloat({ min: 0.01 }).withMessage('Quantity must be positive'),
  body('customer_name').optional().isString().withMessage('Customer name must be a string'),
  body('payment_mode').optional().isIn(['cash', 'card', 'upi']).withMessage('Invalid payment mode')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { items, customer_name, customer_mobile, customer_address, payment_mode = 'cash' } = req.body;
    const saleId = generateSaleId();

    let selectedBank = null;
    if (payment_mode === 'upi' || payment_mode === 'card') {
      const dailySetupStatus = await getDailySetupStatus();
      if (!dailySetupStatus.hasBankAccounts) {
        return res.status(400).json({
          message: 'Add a bank account before accepting UPI or card payments.',
          code: 'BANK_REQUIRED'
        });
      }

      if (!dailySetupStatus.selectedBankAccountId) {
        return res.status(400).json({
          message: 'Select today\'s bank before accepting UPI or card payments.',
          code: 'BANK_SELECTION_REQUIRED'
        });
      }

      selectedBank = await getRow('SELECT * FROM bank_accounts WHERE id = ?', [dailySetupStatus.selectedBankAccountId]);
      if (!selectedBank) {
        return res.status(404).json({ message: 'Selected bank account not found' });
      }
    }
    
    // Start transaction-like operation
    let totalAmount = 0;
    const saleItems = [];

    // Validate each item and check stock
    for (const item of items) {
      const product = await getRow('SELECT * FROM products WHERE id = ?', [item.product_id]);
      
      if (!product) {
        return res.status(404).json({ message: `Product with ID ${item.product_id} not found` });
      }

      if (product.quantity_available < item.quantity) {
        return res.status(400).json({ 
          message: `Insufficient stock for ${product.product_name}. Available: ${product.quantity_available} ${product.unit}` 
        });
      }

      const itemTotal = item.quantity * product.selling_price;
      totalAmount += itemTotal;
      
      saleItems.push({
        product,
        quantity: item.quantity,
        pricePerUnit: product.selling_price,
        itemTotal
      });
    }

    // Create sale records and update stock
    for (const saleItem of saleItems) {
      // Create sale record
      await runQuery(
        `INSERT INTO sales (sale_id, product_id, quantity_sold, price_per_unit, total_amount, sale_date, operator_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [saleId, saleItem.product.id, saleItem.quantity, saleItem.pricePerUnit, saleItem.itemTotal, nowIST(), req.user.id]
      );

      // Update product stock
      const newQuantity = saleItem.product.quantity_available - saleItem.quantity;
      await runQuery(
        'UPDATE products SET quantity_available = ?, updated_at = ? WHERE id = ?',
        [newQuantity, nowIST(), saleItem.product.id]
      );
    }

    // Create receipt
    const receiptNumber = generateReceiptNumber(customer_name);
    const receiptResult = await runQuery(
      `INSERT INTO receipts (receipt_number, sale_id, customer_name, customer_mobile, customer_address, payment_mode, total_amount)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [receiptNumber, saleId, customer_name, customer_mobile || null, customer_address || null, payment_mode, totalAmount]
    );

    // Get the complete sale details
    const saleDetails = await getAll(
      `SELECT s.*, p.product_name, p.variety, p.unit 
       FROM sales s 
       JOIN products p ON s.product_id = p.id 
       WHERE s.sale_id = ?`,
      [saleId]
    );

    const receipt = await getRow('SELECT * FROM receipts WHERE id = ?', [receiptResult.id]);

    await Promise.all(
      saleItems.map((saleItem) =>
        runQuery(
          `INSERT INTO customer_sales (sale_id, receipt_id, customer_name, customer_mobile, customer_address, product_name, quantity, payment_mode, sale_date)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,

          [
            saleId,
            receipt?.id || null,
            customer_name || null,
            customer_mobile || null,
            customer_address || null,
            saleItem.product.product_name,
            saleItem.quantity,
            payment_mode || 'cash',
            nowIST()
          ]
        )
      )
    );

    // Auto-deposit UPI/Card payments into the bank selected for the current business day
    if (selectedBank) {
      try {
        await runQuery(
          'UPDATE bank_accounts SET balance = balance + ?, updated_at = ? WHERE id = ?',
          [totalAmount, nowIST(), selectedBank.id]
        );

        await runQuery(
          `INSERT INTO bank_transfers (
             bank_account_id,
             transfer_type,
             amount,
             source_type,
             source_reference,
             payment_mode,
             description,
             transfer_date,
             created_by
           )
           VALUES (?, 'deposit', ?, ?, ?, ?, ?, ?, ?)`,
          [
            selectedBank.id,
            totalAmount,
            'sale',
            saleId,
            payment_mode,
            `Auto-deposit: ${payment_mode.toUpperCase()} sale ${saleId}`,
            getISTDateString(),
            req.user.id
          ]
        );
      } catch (bankErr) {
        console.error('Auto bank deposit error (non-fatal):', bankErr);
      }
    }

    addReviewNotification({
      actorId: req.user.id,
      actorName: req.user.username,
      actorRole: req.user.role,
      type: 'sale',
      title: 'Completed a sale',
      description: `${saleItems.length} item(s) were sold under ${saleId} for ₹${Number(totalAmount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`,
      createdAt: nowIST()
    });

    res.status(201).json({
      saleId,
      receiptNumber,
      totalAmount,
      items: saleDetails,
      receipt,
      message: 'Sale completed successfully'
    });
  } catch (error) {
    console.error('Create sale error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get sales by date range
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { start_date, end_date, product_id } = req.query;
    let query = `
      SELECT s.*, p.product_name, p.variety, p.unit, u.username as operator_name
      FROM sales s
      JOIN products p ON s.product_id = p.id
      LEFT JOIN users u ON s.operator_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (start_date) {
      query += " AND DATE(datetime(s.sale_date, '+5 hours', '+30 minutes')) >= ?";
      params.push(start_date);
    }

    if (end_date) {
      query += " AND DATE(datetime(s.sale_date, '+5 hours', '+30 minutes')) <= ?";
      params.push(end_date);
    }

    if (product_id) {
      query += ' AND s.product_id = ?';
      params.push(product_id);
    }

    query += ' ORDER BY s.sale_date DESC';

    const sales = await getAll(query, params);
    res.json(sales);
  } catch (error) {
    console.error('Get sales error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get single sale details
router.get('/:saleId', authenticateToken, async (req, res) => {
  try {
    const saleId = req.params.saleId;
    
    const saleItems = await getAll(
      `SELECT s.*, p.product_name, p.variety, p.unit, u.username as operator_name
       FROM sales s
       JOIN products p ON s.product_id = p.id
       LEFT JOIN users u ON s.operator_id = u.id
       WHERE s.sale_id = ?`,
      [saleId]
    );

    if (saleItems.length === 0) {
      return res.status(404).json({ message: 'Sale not found' });
    }

    const receipt = await getRow(
      'SELECT * FROM receipts WHERE sale_id = ?',
      [saleId]
    );

    res.json({
      saleId,
      items: saleItems,
      receipt,
      totalAmount: saleItems.reduce((sum, item) => sum + item.total_amount, 0)
    });
  } catch (error) {
    console.error('Get sale error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get receipts
router.get('/receipts/all', authenticateToken, async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    let query = `
      SELECT r.*, s.sale_id, COUNT(s.id) as item_count
      FROM receipts r
      JOIN sales s ON r.sale_id = s.id
      WHERE 1=1
    `;
    const params = [];

    if (start_date) {
      query += " AND DATE(datetime(r.receipt_date, '+5 hours', '+30 minutes')) >= ?";
      params.push(start_date);
    }

    if (end_date) {
      query += " AND DATE(datetime(r.receipt_date, '+5 hours', '+30 minutes')) <= ?";
      params.push(end_date);
    }

    query += ' GROUP BY r.id ORDER BY r.receipt_date DESC';

    const receipts = await getAll(query, params);
    res.json(receipts);
  } catch (error) {
    console.error('Get receipts error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update receipt print status
router.put('/receipts/:id/print', authenticateToken, async (req, res) => {
  try {
    await runQuery(
      'UPDATE receipts SET printed = TRUE WHERE id = ?',
      [req.params.id]
    );
    res.json({ message: 'Receipt marked as printed' });
  } catch (error) {
    console.error('Update receipt print status error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
