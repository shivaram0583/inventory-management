const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticateToken, authorizeRole } = require('../middleware/auth');
const { getRow, runQuery, getAll, nowIST } = require('../database/db');
const moment = require('moment');
const { addReviewNotification } = require('../services/reviewNotifications');

const router = express.Router();
const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

// ─── BANK ACCOUNTS ──────────────────────────────────────────────────────────

// GET all bank accounts
router.get('/bank-accounts', authenticateToken, async (req, res) => {
  try {
    const accounts = await getAll('SELECT * FROM bank_accounts ORDER BY created_at DESC');
    res.json(accounts);
  } catch (error) {
    console.error('Get bank accounts error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST create bank account
router.post('/bank-accounts', [
  authenticateToken,
  authorizeRole(['admin']),
  body('account_name').notEmpty().trim().withMessage('Account name is required'),
  body('bank_name').notEmpty().trim().withMessage('Bank name is required'),
  body('account_number').optional().trim(),
  body('balance').optional().isFloat({ min: 0 }).withMessage('Balance must be non-negative')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { account_name, bank_name, account_number, balance = 0 } = req.body;
    const result = await runQuery(
      'INSERT INTO bank_accounts (account_name, bank_name, account_number, balance) VALUES (?, ?, ?, ?)',
      [account_name, bank_name, account_number || null, toNumber(balance)]
    );
    const account = await getRow('SELECT * FROM bank_accounts WHERE id = ?', [result.id]);
    res.status(201).json(account);
  } catch (error) {
    console.error('Create bank account error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT update bank account
router.put('/bank-accounts/:id', [
  authenticateToken,
  authorizeRole(['admin']),
  body('account_name').optional().notEmpty().trim(),
  body('bank_name').optional().notEmpty().trim(),
  body('account_number').optional().trim()
], async (req, res) => {
  try {
    const account = await getRow('SELECT * FROM bank_accounts WHERE id = ?', [req.params.id]);
    if (!account) return res.status(404).json({ message: 'Account not found' });

    const { account_name, bank_name, account_number } = req.body;
    await runQuery(
      'UPDATE bank_accounts SET account_name = COALESCE(?, account_name), bank_name = COALESCE(?, bank_name), account_number = COALESCE(?, account_number), updated_at = ? WHERE id = ?',
      [account_name || null, bank_name || null, account_number !== undefined ? account_number : null, nowIST(), req.params.id]
    );
    const updated = await getRow('SELECT * FROM bank_accounts WHERE id = ?', [req.params.id]);
    res.json(updated);
  } catch (error) {
    console.error('Update bank account error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── EXPENDITURES ───────────────────────────────────────────────────────────

// GET expenditures
router.get('/expenditures', authenticateToken, async (req, res) => {
  try {
    const { date, start_date, end_date } = req.query;
    let query = `SELECT e.*, u.username as created_by_name FROM expenditures e LEFT JOIN users u ON e.created_by = u.id WHERE 1=1`;
    const params = [];

    if (date) {
      query += ' AND e.expense_date = ?';
      params.push(date);
    }
    if (start_date) {
      query += ' AND e.expense_date >= ?';
      params.push(start_date);
    }
    if (end_date) {
      query += ' AND e.expense_date <= ?';
      params.push(end_date);
    }

    query += ' ORDER BY e.expense_date DESC, e.created_at DESC';
    const expenditures = await getAll(query, params);
    res.json(expenditures);
  } catch (error) {
    console.error('Get expenditures error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST create expenditure
router.post('/expenditures', [
  authenticateToken,
  authorizeRole(['admin', 'operator']),
  body('amount').isFloat({ min: 0.01 }).withMessage('Amount must be positive'),
  body('description').notEmpty().trim().withMessage('Description is required'),
  body('expense_date').notEmpty().withMessage('Date is required'),
  body('category').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { amount, description, expense_date, category = 'general' } = req.body;
    const result = await runQuery(
      'INSERT INTO expenditures (amount, description, category, expense_date, created_by) VALUES (?, ?, ?, ?, ?)',
      [amount, description, category, expense_date, req.user.id]
    );
    const expenditure = await getRow(
      'SELECT e.*, u.username as created_by_name FROM expenditures e LEFT JOIN users u ON e.created_by = u.id WHERE e.id = ?',
      [result.id]
    );

    addReviewNotification({
      actorId: req.user.id,
      actorName: req.user.username,
      actorRole: req.user.role,
      type: 'transaction',
      title: 'Added an expenditure',
      description: `Expenditure of ₹${Number(amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} was added for ${description}.`,
      createdAt: expense_date
    });

    res.status(201).json(expenditure);
  } catch (error) {
    console.error('Create expenditure error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE expenditure
router.delete('/expenditures/:id', [authenticateToken, authorizeRole(['admin'])], async (req, res) => {
  try {
    const row = await getRow('SELECT * FROM expenditures WHERE id = ?', [req.params.id]);
    if (!row) return res.status(404).json({ message: 'Not found' });
    await runQuery('DELETE FROM expenditures WHERE id = ?', [req.params.id]);
    res.json({ message: 'Expenditure deleted' });
  } catch (error) {
    console.error('Delete expenditure error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── BANK TRANSFERS ─────────────────────────────────────────────────────────

// GET bank transfers
router.get('/bank-transfers', authenticateToken, async (req, res) => {
  try {
    const { date, start_date, end_date } = req.query;
    let query = `SELECT bt.*, ba.account_name, ba.bank_name, u.username as created_by_name
      FROM bank_transfers bt
      JOIN bank_accounts ba ON bt.bank_account_id = ba.id
      LEFT JOIN users u ON bt.created_by = u.id
      WHERE 1=1`;
    const params = [];

    if (date) {
      query += ' AND bt.transfer_date = ?';
      params.push(date);
    }
    if (start_date) {
      query += ' AND bt.transfer_date >= ?';
      params.push(start_date);
    }
    if (end_date) {
      query += ' AND bt.transfer_date <= ?';
      params.push(end_date);
    }

    query += ' ORDER BY bt.transfer_date DESC, bt.created_at DESC';
    const transfers = await getAll(query, params);
    res.json(transfers);
  } catch (error) {
    console.error('Get bank transfers error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST create bank transfer (deposit or withdrawal)
router.post('/bank-transfers', [
  authenticateToken,
  authorizeRole(['admin']),
  body('bank_account_id').isInt({ min: 1 }).withMessage('Bank account is required'),
  body('amount').isFloat({ min: 0.01 }).withMessage('Amount must be positive'),
  body('transfer_type').isIn(['deposit', 'withdrawal']).withMessage('Type must be deposit or withdrawal'),
  body('transfer_date').notEmpty().withMessage('Date is required'),
  body('description').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { bank_account_id, amount, transfer_type, transfer_date, description } = req.body;
    const accountId = Number(bank_account_id);
    const transferAmount = toNumber(amount);

    const account = await getRow('SELECT * FROM bank_accounts WHERE id = ?', [accountId]);
    if (!account) return res.status(404).json({ message: 'Bank account not found' });

    // Update bank balance
    const newBalance = transfer_type === 'deposit'
      ? toNumber(account.balance) + transferAmount
      : toNumber(account.balance) - transferAmount;

    if (newBalance < 0) {
      return res.status(400).json({ message: 'Insufficient bank balance for withdrawal' });
    }

    await runQuery('UPDATE bank_accounts SET balance = ?, updated_at = ? WHERE id = ?',
      [newBalance, nowIST(), accountId]);

    const result = await runQuery(
      'INSERT INTO bank_transfers (bank_account_id, amount, transfer_type, description, transfer_date, created_by) VALUES (?, ?, ?, ?, ?, ?)',
      [accountId, transferAmount, transfer_type, description || null, transfer_date, req.user.id]
    );

    const transfer = await getRow(
      `SELECT bt.*, ba.account_name, ba.bank_name, u.username as created_by_name
       FROM bank_transfers bt JOIN bank_accounts ba ON bt.bank_account_id = ba.id
       LEFT JOIN users u ON bt.created_by = u.id WHERE bt.id = ?`,
      [result.id]
    );
    res.status(201).json({ ...transfer, new_balance: newBalance });
  } catch (error) {
    console.error('Create bank transfer error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE bank transfer (reverses balance)
router.delete('/bank-transfers/:id', [authenticateToken, authorizeRole(['admin'])], async (req, res) => {
  try {
    const transfer = await getRow('SELECT * FROM bank_transfers WHERE id = ?', [req.params.id]);
    if (!transfer) return res.status(404).json({ message: 'Not found' });

    // Reverse the balance change
    const sign = transfer.transfer_type === 'deposit' ? -1 : 1;
    await runQuery('UPDATE bank_accounts SET balance = balance + ?, updated_at = ? WHERE id = ?',
      [sign * transfer.amount, nowIST(), transfer.bank_account_id]);
    await runQuery('DELETE FROM bank_transfers WHERE id = ?', [req.params.id]);
    res.json({ message: 'Transfer deleted and balance reversed' });
  } catch (error) {
    console.error('Delete bank transfer error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── SUPPLIER PAYMENTS ──────────────────────────────────────────────────────

// GET supplier payments
router.get('/supplier-payments', authenticateToken, async (req, res) => {
  try {
    const { date, start_date, end_date, supplier_name } = req.query;
    let query = `SELECT sp.*, ba.account_name, ba.bank_name, u.username as created_by_name
      FROM supplier_payments sp
      LEFT JOIN bank_accounts ba ON sp.bank_account_id = ba.id
      LEFT JOIN users u ON sp.created_by = u.id
      WHERE 1=1`;
    const params = [];

    if (date) {
      query += ' AND sp.payment_date = ?';
      params.push(date);
    }
    if (start_date) {
      query += ' AND sp.payment_date >= ?';
      params.push(start_date);
    }
    if (end_date) {
      query += ' AND sp.payment_date <= ?';
      params.push(end_date);
    }
    if (supplier_name) {
      query += ' AND sp.supplier_name = ?';
      params.push(supplier_name);
    }

    query += ' ORDER BY sp.payment_date DESC, sp.created_at DESC';
    const payments = await getAll(query, params);
    res.json(payments);
  } catch (error) {
    console.error('Get supplier payments error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST create supplier payment
router.post('/supplier-payments', [
  authenticateToken,
  authorizeRole(['admin']),
  body('supplier_name').notEmpty().trim().withMessage('Supplier name is required'),
  body('amount').isFloat({ min: 0.01 }).withMessage('Amount must be positive'),
  body('payment_mode').isIn(['cash', 'bank', 'upi']).withMessage('Invalid payment mode'),
  body('payment_date').notEmpty().withMessage('Date is required'),
  body('bank_account_id').optional({ nullable: true }).isInt({ min: 1 }),
  body('description').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { supplier_name, amount, payment_mode, bank_account_id, description, payment_date } = req.body;
    const paymentAmount = toNumber(amount);
    const accountId = bank_account_id ? Number(bank_account_id) : null;

    // If paying from bank, deduct from bank balance
    if (payment_mode === 'bank' && accountId) {
      const account = await getRow('SELECT * FROM bank_accounts WHERE id = ?', [accountId]);
      if (!account) return res.status(404).json({ message: 'Bank account not found' });
      if (toNumber(account.balance) < paymentAmount) {
        return res.status(400).json({ message: 'Insufficient bank balance' });
      }
      await runQuery('UPDATE bank_accounts SET balance = balance - ?, updated_at = ? WHERE id = ?',
        [paymentAmount, nowIST(), accountId]);
    }

    const result = await runQuery(
      'INSERT INTO supplier_payments (supplier_name, amount, payment_mode, bank_account_id, description, payment_date, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [supplier_name, paymentAmount, payment_mode, accountId || null, description || null, payment_date, req.user.id]
    );

    const payment = await getRow(
      `SELECT sp.*, ba.account_name, ba.bank_name, u.username as created_by_name
       FROM supplier_payments sp
       LEFT JOIN bank_accounts ba ON sp.bank_account_id = ba.id
       LEFT JOIN users u ON sp.created_by = u.id WHERE sp.id = ?`,
      [result.id]
    );

    addReviewNotification({
      actorId: req.user.id,
      actorName: req.user.username,
      actorRole: req.user.role,
      type: 'supplier-payment',
      title: 'Recorded a supplier payment',
      description: `₹${paymentAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} was paid to ${supplier_name}.`,
      createdAt: payment_date
    });

    res.status(201).json(payment);
  } catch (error) {
    console.error('Create supplier payment error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE supplier payment (reverses bank balance if paid from bank)
router.delete('/supplier-payments/:id', [authenticateToken, authorizeRole(['admin'])], async (req, res) => {
  try {
    const payment = await getRow('SELECT * FROM supplier_payments WHERE id = ?', [req.params.id]);
    if (!payment) return res.status(404).json({ message: 'Not found' });

    if (payment.payment_mode === 'bank' && payment.bank_account_id) {
      await runQuery('UPDATE bank_accounts SET balance = balance + ?, updated_at = ? WHERE id = ?',
        [payment.amount, nowIST(), payment.bank_account_id]);
    }
    await runQuery('DELETE FROM supplier_payments WHERE id = ?', [req.params.id]);
    res.json({ message: 'Supplier payment deleted' });
  } catch (error) {
    console.error('Delete supplier payment error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── SUPPLIER BALANCES ──────────────────────────────────────────────────────

// GET supplier ledger: total purchased vs total paid, remaining balance
router.get('/supplier-balances', authenticateToken, async (req, res) => {
  try {
    // Total purchase amounts per supplier from purchases table
    const purchased = await getAll(`
      SELECT supplier AS supplier_name, SUM(total_amount) AS total_purchased
      FROM purchases
      WHERE supplier IS NOT NULL AND supplier != ''
      GROUP BY supplier
    `);

    // Total payments per supplier
    const paid = await getAll(`
      SELECT supplier_name, SUM(amount) AS total_paid
      FROM supplier_payments
      GROUP BY supplier_name
    `);

    const purchaseMap = {};
    for (const p of purchased) {
      purchaseMap[p.supplier_name] = toNumber(p.total_purchased);
    }
    const paidMap = {};
    for (const p of paid) {
      paidMap[p.supplier_name] = toNumber(p.total_paid);
    }

    // Merge all supplier names
    const allSuppliers = new Set([...Object.keys(purchaseMap), ...Object.keys(paidMap)]);
    const balances = Array.from(allSuppliers).map(name => ({
      supplier_name: name,
      total_purchased: purchaseMap[name] || 0,
      total_paid: paidMap[name] || 0,
      remaining_balance: (purchaseMap[name] || 0) - (paidMap[name] || 0)
    })).sort((a, b) => b.remaining_balance - a.remaining_balance);

    res.json(balances);
  } catch (error) {
    console.error('Get supplier balances error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── DAILY SUMMARY ──────────────────────────────────────────────────────────

// GET daily cash-book summary for a date range
router.get('/daily-summary', authenticateToken, async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    if (!start_date || !end_date) {
      return res.status(400).json({ message: 'start_date and end_date are required' });
    }

    // Daily sales totals (using IST conversion for sale_date)
    const salesByDay = await getAll(`
      SELECT DATE(datetime(sale_date, '+5 hours', '+30 minutes')) as day, SUM(total_amount) as total_sales
      FROM sales
      WHERE DATE(datetime(sale_date, '+5 hours', '+30 minutes')) BETWEEN ? AND ?
      GROUP BY day ORDER BY day
    `, [start_date, end_date]);

    // Daily expenditures
    const expendituresByDay = await getAll(`
      SELECT expense_date as day, SUM(amount) as total_expenditure
      FROM expenditures
      WHERE expense_date BETWEEN ? AND ?
      GROUP BY expense_date ORDER BY expense_date
    `, [start_date, end_date]);

    // Daily bank deposits
    const depositsByDay = await getAll(`
      SELECT transfer_date as day, SUM(amount) as total_deposits
      FROM bank_transfers
      WHERE transfer_type = 'deposit' AND transfer_date BETWEEN ? AND ?
      GROUP BY transfer_date ORDER BY transfer_date
    `, [start_date, end_date]);

    // Daily bank withdrawals
    const withdrawalsByDay = await getAll(`
      SELECT transfer_date as day, SUM(amount) as total_withdrawals
      FROM bank_transfers
      WHERE transfer_type = 'withdrawal' AND transfer_date BETWEEN ? AND ?
      GROUP BY transfer_date ORDER BY transfer_date
    `, [start_date, end_date]);

    // Daily supplier payments
    const supplierPaymentsByDay = await getAll(`
      SELECT
        payment_date as day,
        SUM(amount) as total_supplier_payments,
        SUM(CASE WHEN payment_mode = 'cash' THEN amount ELSE 0 END) as total_supplier_cash_payments,
        SUM(CASE WHEN payment_mode = 'bank' THEN amount ELSE 0 END) as total_supplier_bank_payments,
        SUM(CASE WHEN payment_mode = 'upi' THEN amount ELSE 0 END) as total_supplier_upi_payments
      FROM supplier_payments
      WHERE payment_date BETWEEN ? AND ?
      GROUP BY payment_date ORDER BY payment_date
    `, [start_date, end_date]);

    // Daily purchase amounts (stock bought)
    const purchasesByDay = await getAll(`
      SELECT DATE(datetime(purchase_date, '+5 hours', '+30 minutes')) as day, SUM(total_amount) as total_purchases
      FROM purchases
      WHERE DATE(datetime(purchase_date, '+5 hours', '+30 minutes')) BETWEEN ? AND ?
      GROUP BY day ORDER BY day
    `, [start_date, end_date]);

    // Collect all unique days
    const daySet = new Set();
    [salesByDay, expendituresByDay, depositsByDay, withdrawalsByDay, supplierPaymentsByDay, purchasesByDay]
      .forEach(arr => arr.forEach(r => daySet.add(r.day)));

    const toMap = (arr, key) => {
      const m = {};
      for (const r of arr) m[r.day] = r[key];
      return m;
    };

    const salesMap = toMap(salesByDay, 'total_sales');
    const expMap = toMap(expendituresByDay, 'total_expenditure');
    const depMap = toMap(depositsByDay, 'total_deposits');
    const withMap = toMap(withdrawalsByDay, 'total_withdrawals');
    const supMap = toMap(supplierPaymentsByDay, 'total_supplier_payments');
    const supCashMap = toMap(supplierPaymentsByDay, 'total_supplier_cash_payments');
    const supBankMap = toMap(supplierPaymentsByDay, 'total_supplier_bank_payments');
    const supUpiMap = toMap(supplierPaymentsByDay, 'total_supplier_upi_payments');
    const purMap = toMap(purchasesByDay, 'total_purchases');

    const days = Array.from(daySet).sort();

    // Calculate running opening/closing balance
    // Opening balance for first day = 0 (user can adjust)
    // We compute: closing = opening + sales - expenditure - bank_deposits + bank_withdrawals
    // Next day opening = previous closing
    let openingBalance = 0;

    // Try to get the total cash before start_date
    const priorSales = await getRow(`
      SELECT COALESCE(SUM(total_amount), 0) as total FROM sales
      WHERE DATE(datetime(sale_date, '+5 hours', '+30 minutes')) < ?
    `, [start_date]);
    const priorExp = await getRow(`
      SELECT COALESCE(SUM(amount), 0) as total FROM expenditures WHERE expense_date < ?
    `, [start_date]);
    const priorDeposits = await getRow(`
      SELECT COALESCE(SUM(amount), 0) as total FROM bank_transfers
      WHERE transfer_type = 'deposit' AND transfer_date < ?
    `, [start_date]);
    const priorWithdrawals = await getRow(`
      SELECT COALESCE(SUM(amount), 0) as total FROM bank_transfers
      WHERE transfer_type = 'withdrawal' AND transfer_date < ?
    `, [start_date]);
    const priorSupplierCash = await getRow(`
      SELECT COALESCE(SUM(amount), 0) as total FROM supplier_payments
      WHERE payment_mode = 'cash' AND payment_date < ?
    `, [start_date]);

    openingBalance = toNumber(priorSales?.total)
      - toNumber(priorExp?.total)
      - toNumber(priorDeposits?.total)
      + toNumber(priorWithdrawals?.total)
      - toNumber(priorSupplierCash?.total);

    const summary = days.map(day => {
      const sales = toNumber(salesMap[day]);
      const expenditure = toNumber(expMap[day]);
      const bankDeposits = toNumber(depMap[day]);
      const bankWithdrawals = toNumber(withMap[day]);
      const totalSupplierPayments = toNumber(supMap[day]);
      const cashSupplierPayments = toNumber(supCashMap[day]);
      const bankSupplierPayments = toNumber(supBankMap[day]);
      const upiSupplierPayments = toNumber(supUpiMap[day]);
      const purchases = toNumber(purMap[day]);

      const closingBalance =
        openingBalance + sales - expenditure - bankDeposits + bankWithdrawals - cashSupplierPayments;

      const row = {
        date: day,
        opening_balance: openingBalance,
        sales,
        expenditure,
        bank_deposits: bankDeposits,
        bank_withdrawals: bankWithdrawals,
        supplier_payments: cashSupplierPayments,
        supplier_payments_cash: cashSupplierPayments,
        supplier_payments_bank: bankSupplierPayments,
        supplier_payments_upi: upiSupplierPayments,
        supplier_payments_total: totalSupplierPayments,
        purchases,
        closing_balance: closingBalance
      };

      openingBalance = closingBalance;
      return row;
    });

    res.json(summary);
  } catch (error) {
    console.error('Get daily summary error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
