const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticateToken } = require('../middleware/auth');
const { requireDailySetupForOperatorWrites } = require('../middleware/dailySetup');
const { getRow, runQuery, getAll, nowIST, runTransaction, paginate } = require('../database/db');
const { logAudit } = require('../middleware/auditLog');
const { addReviewNotification } = require('../services/reviewNotifications');
const moment = require('moment');

const router = express.Router();

function generateReturnId() {
  return 'RET' + moment().utcOffset('+05:30').format('YYYYMMDDHHmmss') + Math.random().toString(36).substr(2, 4).toUpperCase();
}

// Create a sales return
router.post('/', [
  authenticateToken,
  requireDailySetupForOperatorWrites,
  body('sale_id').notEmpty().withMessage('Sale ID is required'),
  body('items').isArray({ min: 1 }).withMessage('At least one return item is required'),
  body('items.*.product_id').isInt({ min: 1 }),
  body('items.*.quantity').isFloat({ gt: 0 }).withMessage('Return quantity must be positive'),
  body('refund_mode').isIn(['cash', 'credit', 'bank']).withMessage('Invalid refund mode')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { sale_id, items, refund_mode, bank_account_id, reason } = req.body;

    // Verify sale exists
    const saleItems = await getAll(
      'SELECT s.*, p.product_name, p.unit FROM sales s JOIN products p ON s.product_id = p.id WHERE s.sale_id = ?',
      [sale_id]
    );
    if (!saleItems.length) return res.status(404).json({ message: 'Sale not found' });

    const receipt = await getRow('SELECT * FROM receipts WHERE sale_id = ?', [sale_id]);

    const returnId = generateReturnId();
    const returnDate = nowIST();
    let totalRefund = 0;
    const returnedItems = [];

    await runTransaction(async ({ runQuery: txRun, getRow: txGet, getAll: txGetAll }) => {
      for (const item of items) {
        const saleItem = saleItems.find(s => s.product_id === item.product_id);
        if (!saleItem) {
          throw new Error(`Product ${item.product_id} not found in sale ${sale_id}`);
        }

        // Check already returned quantity
        const alreadyReturned = await txGet(
          'SELECT COALESCE(SUM(quantity_returned), 0) as total FROM sales_returns WHERE sale_id = ? AND product_id = ?',
          [sale_id, item.product_id]
        );
        const maxReturnable = saleItem.quantity_sold - (alreadyReturned?.total || 0);
        if (item.quantity > maxReturnable) {
          throw new Error(`Cannot return ${item.quantity} of ${saleItem.product_name}. Max returnable: ${maxReturnable}`);
        }

        const refundAmount = item.quantity * saleItem.price_per_unit;
        totalRefund += refundAmount;

        // Create return record
        await txRun(
          `INSERT INTO sales_returns (return_id, sale_id, product_id, quantity_returned, price_per_unit, refund_amount, refund_mode, bank_account_id, reason, returned_by, return_date, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [returnId, sale_id, item.product_id, item.quantity, saleItem.price_per_unit, refundAmount,
           refund_mode, bank_account_id || null, reason || null, req.user.id, returnDate, returnDate]
        );

        // Restock the product
        await txRun(
          'UPDATE products SET quantity_available = quantity_available + ?, updated_at = ? WHERE id = ?',
          [item.quantity, returnDate, item.product_id]
        );

        returnedItems.push({ product_id: item.product_id, product_name: saleItem.product_name, quantity: item.quantity, refund: refundAmount });
      }

      // Handle bank refund
      if (refund_mode === 'bank' && bank_account_id) {
        await txRun('UPDATE bank_accounts SET balance = balance - ?, updated_at = ? WHERE id = ?',
          [totalRefund, returnDate, bank_account_id]);
        await txRun(
          `INSERT INTO bank_transfers (bank_account_id, amount, transfer_type, source_type, source_reference, description, transfer_date, created_by, created_at)
           VALUES (?, ?, 'withdrawal', 'sales_return', ?, ?, ?, ?, ?)`,
          [bank_account_id, totalRefund, `return:${returnId}`, `Refund for return ${returnId}`, returnDate.split(' ')[0], req.user.id, returnDate]
        );
      }

      // If refund to credit (customer account)
      if (refund_mode === 'credit' && receipt?.customer_id) {
        await txRun('UPDATE customers SET outstanding_balance = outstanding_balance - ?, updated_at = ? WHERE id = ?',
          [totalRefund, returnDate, receipt.customer_id]);
      }
    });

    addReviewNotification({
      actorId: req.user.id, actorName: req.user.username, actorRole: req.user.role,
      type: 'sale', title: 'Processed a sales return',
      description: `Return ${returnId} for ₹${totalRefund.toFixed(2)} (${refund_mode})`,
      createdAt: returnDate
    });

    await logAudit(req, 'create', 'sales_return', returnId, { sale_id, totalRefund, refund_mode, items: returnedItems });

    res.status(201).json({
      return_id: returnId,
      sale_id,
      items: returnedItems,
      total_refund: totalRefund,
      refund_mode,
      message: 'Return processed successfully'
    });
  } catch (error) {
    console.error('Sales return error:', error);
    res.status(error.message.includes('Cannot return') ? 400 : 500).json({ message: error.message || 'Server error' });
  }
});

// List returns
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { start_date, end_date, page = 1, limit = 50 } = req.query;
    let query = `
      SELECT sr.*, p.product_name, p.unit, u.username as returned_by_name
      FROM sales_returns sr
      JOIN products p ON sr.product_id = p.id
      LEFT JOIN users u ON sr.returned_by = u.id
    `;
    const params = [];
    const conditions = [];

    if (start_date) { conditions.push('DATE(sr.return_date) >= ?'); params.push(start_date); }
    if (end_date) { conditions.push('DATE(sr.return_date) <= ?'); params.push(end_date); }
    if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');
    query += ' ORDER BY sr.return_date DESC';

    const result = await paginate(query, params, page, limit);
    res.json(result);
  } catch (error) {
    console.error('List returns error:', error);
    // fallback without pagination
    const returns = await getAll(
      `SELECT sr.*, p.product_name, p.unit, u.username as returned_by_name
       FROM sales_returns sr JOIN products p ON sr.product_id = p.id LEFT JOIN users u ON sr.returned_by = u.id
       ORDER BY sr.return_date DESC LIMIT 100`
    );
    res.json({ data: returns, pagination: { page: 1, limit: 100, total: returns.length, totalPages: 1 } });
  }
});

// Get return details
router.get('/:returnId', authenticateToken, async (req, res) => {
  try {
    const items = await getAll(
      `SELECT sr.*, p.product_name, p.unit, u.username as returned_by_name
       FROM sales_returns sr
       JOIN products p ON sr.product_id = p.id
       LEFT JOIN users u ON sr.returned_by = u.id
       WHERE sr.return_id = ?`,
      [req.params.returnId]
    );
    if (!items.length) return res.status(404).json({ message: 'Return not found' });
    res.json({ return_id: req.params.returnId, items });
  } catch (error) {
    console.error('Get return error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
