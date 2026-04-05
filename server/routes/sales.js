const express = require('express');
const { body, validationResult } = require('express-validator');
const QRCode = require('qrcode');
const { authenticateToken } = require('../middleware/auth');
const { requireDailySetupForOperatorWrites } = require('../middleware/dailySetup');
const { getRow, runQuery, getAll, nowIST, runTransaction, paginate } = require('../database/db');
const moment = require('moment');
const { addReviewNotification } = require('../services/reviewNotifications');
const { getDailySetupStatus, getISTDateString } = require('../services/dailySetup');
const { logAudit } = require('../middleware/auditLog');
const { buildReceiptVerificationLink } = require('../services/communications');
const { isGatewayEnabled, verifyGatewayPayment } = require('../services/paymentGateway');
const { resolveEffectivePrice } = require('../services/pricing');

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
  body('items.*.quantity').isInt({ min: 1 }).withMessage('Quantity must be a positive whole number'),
  body('customer_name').optional().isString().withMessage('Customer name must be a string'),
  body('payment_mode').optional().isIn(['cash', 'card', 'upi', 'credit', 'online']).withMessage('Invalid payment mode'),
  body('payment_gateway').optional().isString(),
  body('gateway_order_id').optional().isString(),
  body('gateway_payment_id').optional().isString(),
  body('gateway_signature').optional().isString()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      items, customer_name, customer_mobile, customer_address,
      payment_mode = 'cash', customer_id, discount_amount = 0,
      quotation_id, payment_gateway, gateway_order_id,
      gateway_payment_id, gateway_signature
    } = req.body;
    const saleId = generateSaleId();
    const saleTimestamp = nowIST();

    // Credit sale validation
    if (payment_mode === 'credit') {
      if (!customer_id && !customer_name) {
        return res.status(400).json({ message: 'Customer is required for credit sales' });
      }
      if (customer_id) {
        const customer = await getRow('SELECT * FROM customers WHERE id = ? AND is_active = 1', [customer_id]);
        if (!customer) return res.status(404).json({ message: 'Customer not found' });
      }
    }

    if (payment_mode === 'online') {
      if (!isGatewayEnabled()) {
        return res.status(400).json({ message: 'Payment gateway is not configured' });
      }

      if (!payment_gateway || !gateway_order_id || !gateway_payment_id || !gateway_signature) {
        return res.status(400).json({ message: 'Online payment details are required' });
      }

      const paymentVerified = verifyGatewayPayment({
        payment_gateway,
        gateway_order_id,
        gateway_payment_id,
        gateway_signature
      });

      if (!paymentVerified) {
        return res.status(400).json({ message: 'Payment verification failed' });
      }
    }

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
    
    let totalAmount = 0;
    let totalTax = 0;
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

      const manualPriceOverride = Boolean(item.manual_price_override || quotation_id);
      const resolvedPricing = manualPriceOverride && Number.isFinite(Number(item.price_per_unit))
        ? null
        : await resolveEffectivePrice({
            productId: item.product_id,
            customerId: customer_id,
            quantity: item.quantity,
            pricingDate: saleTimestamp
          });
      const pricePerUnit = manualPriceOverride && Number.isFinite(Number(item.price_per_unit))
        ? Number(item.price_per_unit)
        : (resolvedPricing?.effective_price || product.selling_price);
      const itemSubtotal = item.quantity * pricePerUnit;
      const itemDiscount = item.discount_amount || (item.discount_percent ? itemSubtotal * item.discount_percent / 100 : 0);
      const afterDiscount = itemSubtotal - itemDiscount;
      const gstPercent = item.tax_percent !== undefined ? item.tax_percent : (product.gst_percent || 0);
      const itemTax = afterDiscount * (gstPercent / 100);
      const itemTotal = afterDiscount + itemTax;

      totalAmount += itemTotal;
      totalTax += itemTax;
      
      saleItems.push({
        product,
        quantity: item.quantity,
        pricePerUnit,
        itemDiscount,
        gstPercent,
        itemTax,
        itemTotal,
        pricingRuleType: manualPriceOverride ? (quotation_id ? 'quotation' : 'manual') : (resolvedPricing?.applied_rule?.type || null),
        pricingRuleLabel: manualPriceOverride
          ? (quotation_id ? 'Quoted rate' : 'Manual price override')
          : (resolvedPricing?.applied_rule?.label || null)
      });
    }

    // Apply bill-level discount
    const billDiscount = Math.min(Number(discount_amount) || 0, totalAmount);
    const netAmount = totalAmount - billDiscount;

    // Use transaction for data integrity
    await runTransaction(async () => {
      // Create sale records and update stock
      for (const saleItem of saleItems) {
        await runQuery(
          `INSERT INTO sales (
             sale_id, product_id, quantity_sold, price_per_unit, total_amount, discount_amount,
             tax_amount, gst_percent, pricing_rule_type, pricing_rule_label, sale_date, operator_id
           )
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            saleId,
            saleItem.product.id,
            saleItem.quantity,
            saleItem.pricePerUnit,
            saleItem.itemTotal,
            saleItem.itemDiscount,
            saleItem.itemTax,
            saleItem.gstPercent,
            saleItem.pricingRuleType,
            saleItem.pricingRuleLabel,
            saleTimestamp,
            req.user.id
          ]
        );

        const newQuantity = saleItem.product.quantity_available - saleItem.quantity;
        await runQuery(
          'UPDATE products SET quantity_available = ?, updated_at = ? WHERE id = ?',
          [newQuantity, saleTimestamp, saleItem.product.id]
        );
      }

      // Create receipt
      const receiptNumber = generateReceiptNumber(customer_name);
      const paymentStatus = payment_mode === 'credit' ? 'credit' : 'paid';

      const receiptResult = await runQuery(
        `INSERT INTO receipts (
           receipt_number, sale_id, customer_name, customer_mobile, customer_address,
           payment_mode, payment_gateway, payment_reference, gateway_order_id,
           total_amount, discount_amount, tax_amount, payment_status,
           customer_id, receipt_date, created_at
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)` ,
        [receiptNumber, saleId, customer_name, customer_mobile || null, customer_address || null,
         payment_mode, payment_gateway || null, gateway_payment_id || null, gateway_order_id || null,
         netAmount, billDiscount, totalTax, paymentStatus,
         customer_id || null, saleTimestamp, saleTimestamp]
      );

      // Customer sales archival
      await Promise.all(
        saleItems.map((saleItem) =>
          runQuery(
            `INSERT INTO customer_sales (sale_id, receipt_id, customer_name, customer_mobile, customer_address, product_name, quantity, amount, payment_mode, sale_date)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [saleId, receiptResult.id, customer_name || null, customer_mobile || null, customer_address || null,
             saleItem.product.product_name, saleItem.quantity, saleItem.itemTotal, payment_mode, saleTimestamp]
          )
        )
      );

      // Auto-deposit UPI/Card payments
      if (selectedBank) {
        await runQuery(
          'UPDATE bank_accounts SET balance = balance + ?, updated_at = ? WHERE id = ?',
          [netAmount, saleTimestamp, selectedBank.id]
        );
        await runQuery(
          `INSERT INTO bank_transfers (bank_account_id, transfer_type, amount, source_type, source_reference, payment_mode, description, transfer_date, created_by, created_at)
           VALUES (?, 'deposit', ?, 'sale', ?, ?, ?, ?, ?, ?)`,
          [selectedBank.id, netAmount, saleId, payment_mode,
           `Auto-deposit: ${payment_mode.toUpperCase()} sale ${saleId}`, getISTDateString(), req.user.id, saleTimestamp]
        );
      }

      // Credit sale: update customer outstanding balance
      if (payment_mode === 'credit' && customer_id) {
        await runQuery(
          'UPDATE customers SET outstanding_balance = outstanding_balance + ?, updated_at = ? WHERE id = ?',
          [netAmount, saleTimestamp, customer_id]
        );
      }

      // Mark quotation as converted
      if (quotation_id) {
        await runQuery(
          'UPDATE quotations SET status = ?, converted_sale_id = ?, updated_at = ? WHERE id = ?',
          ['converted', saleId, saleTimestamp, quotation_id]
        );
      }
    });

    const saleDetails = await getAll(
      `SELECT s.*, p.product_name, p.variety, p.unit FROM sales s JOIN products p ON s.product_id = p.id WHERE s.sale_id = ?`,
      [saleId]
    );
    const receipt = await getRow('SELECT * FROM receipts WHERE sale_id = ?', [saleId]);

    addReviewNotification({
      actorId: req.user.id, actorName: req.user.username, actorRole: req.user.role,
      type: 'sale', title: 'Completed a sale',
      description: `${saleItems.length} item(s) sold under ${saleId} for ₹${Number(netAmount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${payment_mode === 'credit' ? ' (CREDIT)' : ''}.`,
      createdAt: saleTimestamp
    });

    await logAudit(req, 'create', 'sale', saleId, { totalAmount: netAmount, payment_mode, items: saleItems.length });

    res.status(201).json({
      saleId,
      receiptNumber: receipt.receipt_number,
      totalAmount: netAmount,
      discount: billDiscount,
      tax: totalTax,
      payment_mode,
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
    const { start_date, end_date, product_id, page, limit } = req.query;
    let query = `
      SELECT s.*, p.product_name, p.variety, p.unit, u.username as operator_name
      FROM sales s
      JOIN products p ON s.product_id = p.id
      LEFT JOIN users u ON s.operator_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (start_date) {
      query += ' AND DATE(s.sale_date) >= ?';
      params.push(start_date);
    }

    if (end_date) {
      query += ' AND DATE(s.sale_date) <= ?';
      params.push(end_date);
    }

    if (product_id) {
      query += ' AND s.product_id = ?';
      params.push(product_id);
    }

    query += ' ORDER BY s.sale_date DESC';

    if (page) {
      const result = await paginate(query, params, page, limit || 50);
      return res.json(result);
    }

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

    let receiptQr = null;
    if (receipt?.receipt_number) {
      const verificationLink = buildReceiptVerificationLink(receipt.receipt_number);
      receiptQr = {
        verification_link: verificationLink,
        data_url: await QRCode.toDataURL(verificationLink, {
          margin: 1,
          width: 192,
          color: {
            dark: '#0f172a',
            light: '#ffffff'
          }
        })
      };
    }

    res.json({
      saleId,
      items: saleItems,
      receipt,
      receipt_qr: receiptQr,
      totalAmount: saleItems.reduce((sum, item) => sum + item.total_amount, 0)
    });
  } catch (error) {
    console.error('Get sale error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/receipts/verify/:receiptNumber', async (req, res) => {
  try {
    const receipt = await getRow('SELECT * FROM receipts WHERE receipt_number = ?', [req.params.receiptNumber]);
    if (!receipt) {
      return res.status(404).json({ verified: false, message: 'Receipt not found' });
    }

    const items = await getAll(
      `SELECT s.quantity_sold, s.price_per_unit, s.total_amount, s.pricing_rule_label, p.product_name, p.unit
       FROM sales s
       JOIN products p ON p.id = s.product_id
       WHERE s.sale_id = ?`,
      [receipt.sale_id]
    );

    const verificationPageUrl = buildReceiptVerificationLink(receipt.receipt_number);

    if (req.accepts('html') && !String(req.query.format || '').toLowerCase().includes('json')) {
      return res.redirect(302, verificationPageUrl);
    }

    res.json({
      verified: true,
      receipt_number: receipt.receipt_number,
      sale_id: receipt.sale_id,
      customer_name: receipt.customer_name,
      payment_mode: receipt.payment_mode,
      total_amount: receipt.total_amount,
      receipt_date: receipt.receipt_date,
      item_count: items.length,
      verification_page_url: verificationPageUrl,
      items
    });
  } catch (error) {
    console.error('Verify receipt error:', error);
    res.status(500).json({ verified: false, message: 'Server error' });
  }
});

// Get receipts
router.get('/receipts/all', authenticateToken, async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    let query = `
      SELECT r.*, s.sale_id, COUNT(s.id) as item_count
      FROM receipts r
      JOIN sales s ON r.sale_id = s.sale_id
      WHERE 1=1
    `;
    const params = [];

    if (start_date) {
      query += ' AND DATE(r.receipt_date) >= ?';
      params.push(start_date);
    }

    if (end_date) {
      query += ' AND DATE(r.receipt_date) <= ?';
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
