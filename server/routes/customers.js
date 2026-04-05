const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticateToken, authorizeRole } = require('../middleware/auth');
const { getRow, runQuery, getAll, nowIST, paginate } = require('../database/db');
const { logAudit } = require('../middleware/auditLog');

const router = express.Router();

// Create customer
router.post('/', [
  authenticateToken,
  body('name').notEmpty().withMessage('Customer name is required'),
  body('credit_limit').optional().isFloat({ min: 0 }).withMessage('Credit limit must be non-negative')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { name, mobile, email, address, gstin, credit_limit = 0 } = req.body;

    if (mobile) {
      const existing = await getRow('SELECT id FROM customers WHERE mobile = ?', [mobile]);
      if (existing) return res.status(400).json({ message: 'Customer with this mobile already exists' });
    }

    const result = await runQuery(
      `INSERT INTO customers (name, mobile, email, address, gstin, credit_limit, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, mobile || null, email || null, address || null, gstin || null, credit_limit, nowIST(), nowIST()]
    );

    const customer = await getRow('SELECT * FROM customers WHERE id = ?', [result.id]);
    await logAudit(req, 'create', 'customer', result.id, { name });
    res.status(201).json(customer);
  } catch (error) {
    console.error('Create customer error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// List customers with pagination
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { search, page = 1, limit = 50 } = req.query;
    let query = 'SELECT * FROM customers WHERE is_active = 1';
    const params = [];

    if (search) {
      query += ' AND (name LIKE ? OR mobile LIKE ? OR email LIKE ? OR gstin LIKE ?)';
      const s = `%${search}%`;
      params.push(s, s, s, s);
    }
    query += ' ORDER BY name ASC';

    const result = await paginate(query, params, page, limit);
    res.json(result);
  } catch (error) {
    console.error('List customers error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Aging report
router.get('/reports/aging', authenticateToken, async (req, res) => {
  try {
    const customers = await getAll(`
      SELECT c.id, c.name, c.mobile, c.outstanding_balance, c.credit_limit,
        (SELECT MIN(r.receipt_date) FROM receipts r WHERE r.customer_id = c.id AND r.payment_status = 'credit') as oldest_credit_date
      FROM customers c
      WHERE c.outstanding_balance > 0 AND c.is_active = 1
      ORDER BY c.outstanding_balance DESC
    `);

    const now = new Date();
    const aging = customers.map(c => {
      const oldest = c.oldest_credit_date ? new Date(c.oldest_credit_date) : now;
      const daysPast = Math.floor((now - oldest) / (1000 * 60 * 60 * 24));
      return {
        ...c,
        days_outstanding: daysPast,
        bucket: daysPast <= 30 ? '0-30' : daysPast <= 60 ? '31-60' : daysPast <= 90 ? '61-90' : '90+'
      };
    });

    res.json(aging);
  } catch (error) {
    console.error('Aging report error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Search/lookup customer by mobile (for quick fill at sale time)
router.get('/lookup/by-mobile', authenticateToken, async (req, res) => {
  try {
    const { mobile } = req.query;
    if (!mobile) return res.status(400).json({ message: 'Mobile number required' });
    const customer = await getRow('SELECT * FROM customers WHERE mobile = ? AND is_active = 1', [mobile]);
    res.json(customer || null);
  } catch (error) {
    console.error('Customer lookup error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get single customer with ledger summary
router.get('/:id(\\d+)', authenticateToken, async (req, res) => {
  try {
    const customer = await getRow('SELECT * FROM customers WHERE id = ?', [req.params.id]);
    if (!customer) return res.status(404).json({ message: 'Customer not found' });

    const sales = await getAll(
      `SELECT r.id, r.receipt_number, r.total_amount, r.discount_amount, r.tax_amount, r.payment_mode, r.payment_status, r.receipt_date
       FROM receipts r WHERE r.customer_id = ? ORDER BY r.receipt_date DESC LIMIT 20`,
      [customer.id]
    );

    const payments = await getAll(
      `SELECT * FROM customer_payments WHERE customer_id = ? ORDER BY payment_date DESC LIMIT 20`,
      [customer.id]
    );

    const totalPurchased = await getRow(
      `SELECT COALESCE(SUM(total_amount), 0) as total FROM receipts WHERE customer_id = ?`, [customer.id]
    );
    const totalPaid = await getRow(
      `SELECT COALESCE(SUM(total_amount), 0) as paid_at_sale FROM receipts WHERE customer_id = ? AND payment_status = 'paid'`, [customer.id]
    );
    const totalCollected = await getRow(
      `SELECT COALESCE(SUM(amount), 0) as total FROM customer_payments WHERE customer_id = ?`, [customer.id]
    );

    res.json({
      ...customer,
      sales,
      payments,
      summary: {
        total_purchased: totalPurchased.total,
        total_paid: totalPaid.paid_at_sale + totalCollected.total,
        outstanding: customer.outstanding_balance
      }
    });
  } catch (error) {
    console.error('Get customer error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update customer
router.put('/:id(\\d+)', [
  authenticateToken,
  body('name').optional().notEmpty(),
  body('credit_limit').optional().isFloat({ min: 0 })
], async (req, res) => {
  try {
    const customer = await getRow('SELECT * FROM customers WHERE id = ?', [req.params.id]);
    if (!customer) return res.status(404).json({ message: 'Customer not found' });

    const { name, mobile, email, address, gstin, credit_limit } = req.body;
    await runQuery(
      `UPDATE customers SET name = ?, mobile = ?, email = ?, address = ?, gstin = ?, credit_limit = ?, updated_at = ? WHERE id = ?`,
      [
        name || customer.name, mobile !== undefined ? mobile : customer.mobile,
        email !== undefined ? email : customer.email, address !== undefined ? address : customer.address,
        gstin !== undefined ? gstin : customer.gstin, credit_limit !== undefined ? credit_limit : customer.credit_limit,
        nowIST(), req.params.id
      ]
    );

    const updated = await getRow('SELECT * FROM customers WHERE id = ?', [req.params.id]);
    await logAudit(req, 'update', 'customer', req.params.id, { name: updated.name });
    res.json(updated);
  } catch (error) {
    console.error('Update customer error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Deactivate customer
router.delete('/:id(\\d+)', [authenticateToken, authorizeRole(['admin'])], async (req, res) => {
  try {
    const customer = await getRow('SELECT * FROM customers WHERE id = ?', [req.params.id]);
    if (!customer) return res.status(404).json({ message: 'Customer not found' });

    if (customer.outstanding_balance > 0) {
      return res.status(400).json({ message: `Cannot deactivate customer with outstanding balance of ₹${customer.outstanding_balance}` });
    }

    await runQuery('UPDATE customers SET is_active = 0, updated_at = ? WHERE id = ?', [nowIST(), req.params.id]);
    await logAudit(req, 'deactivate', 'customer', req.params.id, { name: customer.name });
    res.json({ message: 'Customer deactivated' });
  } catch (error) {
    console.error('Delete customer error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Record payment from customer (credit collection)
router.post('/:id(\\d+)/payments', [
  authenticateToken,
  body('amount').isFloat({ gt: 0 }).withMessage('Amount must be positive'),
  body('payment_mode').isIn(['cash', 'bank', 'upi']).withMessage('Invalid payment mode')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const customer = await getRow('SELECT * FROM customers WHERE id = ?', [req.params.id]);
    if (!customer) return res.status(404).json({ message: 'Customer not found' });

    const { amount, payment_mode, bank_account_id, reference_note } = req.body;

    if (amount > customer.outstanding_balance) {
      return res.status(400).json({ message: 'Payment amount exceeds outstanding balance' });
    }

    // If bank/upi, deposit to bank
    if ((payment_mode === 'bank' || payment_mode === 'upi') && bank_account_id) {
      await runQuery('UPDATE bank_accounts SET balance = balance + ?, updated_at = ? WHERE id = ?',
        [amount, nowIST(), bank_account_id]);
      await runQuery(
        `INSERT INTO bank_transfers (bank_account_id, amount, transfer_type, source_type, source_reference, payment_mode, description, transfer_date, created_by, created_at)
         VALUES (?, ?, 'deposit', 'customer_payment', ?, ?, ?, ?, ?, ?)`,
        [bank_account_id, amount, `customer-payment:${customer.id}`, payment_mode,
         `Payment from ${customer.name}`, nowIST().split(' ')[0], req.user.id, nowIST()]
      );
    }

    const result = await runQuery(
      `INSERT INTO customer_payments (customer_id, amount, payment_mode, bank_account_id, reference_note, payment_date, collected_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [customer.id, amount, payment_mode, bank_account_id || null, reference_note || null, nowIST(), req.user.id, nowIST()]
    );

    await runQuery('UPDATE customers SET outstanding_balance = outstanding_balance - ?, updated_at = ? WHERE id = ?',
      [amount, nowIST(), customer.id]);

    await logAudit(req, 'collect_payment', 'customer', customer.id, { amount, payment_mode });
    const payment = await getRow('SELECT * FROM customer_payments WHERE id = ?', [result.id]);
    res.status(201).json(payment);
  } catch (error) {
    console.error('Customer payment error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Customer ledger statement
router.get('/:id(\\d+)/ledger', authenticateToken, async (req, res) => {
  try {
    const customer = await getRow('SELECT * FROM customers WHERE id = ?', [req.params.id]);
    if (!customer) return res.status(404).json({ message: 'Customer not found' });

    const { start_date, end_date } = req.query;
    let dateFilter = '';
    const params = [customer.id, customer.id];

    if (start_date && end_date) {
      dateFilter = ` AND date >= '${start_date}' AND date <= '${end_date}'`;
    }

    const ledger = await getAll(`
      SELECT date, type, description, debit, credit FROM (
        SELECT DATE(r.receipt_date) as date, 'sale' as type,
               'Sale ' || r.receipt_number as description,
               r.total_amount as debit, 0 as credit, r.receipt_date as sort_date
        FROM receipts r WHERE r.customer_id = ? AND r.payment_status = 'credit'
        UNION ALL
        SELECT DATE(cp.payment_date) as date, 'payment' as type,
               'Payment (' || cp.payment_mode || ')' as description,
               0 as debit, cp.amount as credit, cp.payment_date as sort_date
        FROM customer_payments cp WHERE cp.customer_id = ?
      ) combined
      WHERE 1=1 ${dateFilter}
      ORDER BY sort_date ASC
    `, params);

    let runningBalance = 0;
    const ledgerWithBalance = ledger.map(entry => {
      runningBalance += entry.debit - entry.credit;
      return { ...entry, balance: runningBalance };
    });

    res.json({
      customer: { id: customer.id, name: customer.name, mobile: customer.mobile },
      ledger: ledgerWithBalance,
      closing_balance: runningBalance
    });
  } catch (error) {
    console.error('Customer ledger error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
