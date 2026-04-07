const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticateToken, authorizeRole } = require('../middleware/auth');
const { requireDailySetupForOperatorWrites } = require('../middleware/dailySetup');
const { getRow, runQuery, getAll, nowIST } = require('../database/db');
const moment = require('moment');
const { addReviewNotification } = require('../services/reviewNotifications');
const {
  isBankTrackedSupplierPaymentMode,
  createSupplierPaymentRecord,
  reverseSupplierPaymentBankEffects
} = require('../services/bankLedger');
const {
  getDailyBalanceSnapshot,
  getDailySetupStatus,
  upsertSelectedBank,
  markBalanceReviewed
} = require('../services/dailySetup');
const { resolveSupplier } = require('../services/supplierDirectory');

const router = express.Router();
const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

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

// ─── BANK ACCOUNTS ──────────────────────────────────────────────────────────

// GET all bank accounts
router.get('/bank-accounts', authenticateToken, async (req, res) => {
  try {
    const accounts = await getAll('SELECT * FROM bank_accounts WHERE is_active = 1 ORDER BY created_at DESC');
    res.json(accounts);
  } catch (error) {
    console.error('Get bank accounts error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/bank-accounts/:id/statement', authenticateToken, async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    const startDate = moment(start_date, 'YYYY-MM-DD', true);
    const endDate = moment(end_date, 'YYYY-MM-DD', true);

    if (!startDate.isValid() || !endDate.isValid() || endDate.isBefore(startDate)) {
      return res.status(400).json({ message: 'A valid start_date and end_date are required' });
    }

    const account = await getRow('SELECT * FROM bank_accounts WHERE id = ?', [req.params.id]);
    if (!account) {
      return res.status(404).json({ message: 'Bank account not found' });
    }

    const createdDate = String(account.created_at || '').slice(0, 10);
    if (createdDate && end_date < createdDate) {
      return res.json({
        account,
        range: { start_date, end_date },
        opening_balance: 0,
        closing_balance: 0,
        total_credits: 0,
        total_debits: 0,
        transaction_count: 0,
        transactions: []
      });
    }

    const [allTotals, beforeTotals, rangeTotals, transferRows] = await Promise.all([
      getRow(`
        SELECT
          COALESCE(SUM(CASE WHEN transfer_type = 'deposit' THEN amount ELSE 0 END), 0) AS total_credits,
          COALESCE(SUM(CASE WHEN transfer_type = 'withdrawal' THEN amount ELSE 0 END), 0) AS total_debits
        FROM bank_transfers
        WHERE bank_account_id = ?
      `, [req.params.id]),
      getRow(`
        SELECT
          COALESCE(SUM(CASE WHEN transfer_type = 'deposit' THEN amount ELSE 0 END), 0) AS total_credits,
          COALESCE(SUM(CASE WHEN transfer_type = 'withdrawal' THEN amount ELSE 0 END), 0) AS total_debits
        FROM bank_transfers
        WHERE bank_account_id = ?
          AND transfer_date < ?
      `, [req.params.id, start_date]),
      getRow(`
        SELECT
          COALESCE(SUM(CASE WHEN transfer_type = 'deposit' THEN amount ELSE 0 END), 0) AS total_credits,
          COALESCE(SUM(CASE WHEN transfer_type = 'withdrawal' THEN amount ELSE 0 END), 0) AS total_debits
        FROM bank_transfers
        WHERE bank_account_id = ?
          AND transfer_date BETWEEN ? AND ?
      `, [req.params.id, start_date, end_date]),
      getAll(`
        SELECT bt.*, u.username AS created_by_name
        FROM bank_transfers bt
        LEFT JOIN users u ON u.id = bt.created_by
        WHERE bt.bank_account_id = ?
          AND bt.transfer_date BETWEEN ? AND ?
        ORDER BY bt.transfer_date ASC, bt.created_at ASC, bt.id ASC
      `, [req.params.id, start_date, end_date])
    ]);

    const totalCreditsAll = toNumber(allTotals?.total_credits);
    const totalDebitsAll = toNumber(allTotals?.total_debits);
    const initialBalance = toNumber(account.balance) - (totalCreditsAll - totalDebitsAll);
    const accountCreatedInRange = Boolean(createdDate && createdDate >= start_date && createdDate <= end_date);

    let openingBalance = 0;
    if (createdDate && createdDate < start_date) {
      openingBalance = initialBalance
        + toNumber(beforeTotals?.total_credits)
        - toNumber(beforeTotals?.total_debits);
    }

    let runningBalance = openingBalance;
    const transactions = [];

    if (accountCreatedInRange && Math.abs(initialBalance) > 0.0001) {
      runningBalance += initialBalance;
      transactions.push({
        id: `opening-${account.id}`,
        transfer_type: 'deposit',
        source_type: 'opening_balance',
        source_reference: `opening-balance:${account.id}`,
        payment_mode: null,
        description: 'Opening balance',
        transfer_date: createdDate,
        created_at: account.created_at,
        created_by_name: null,
        amount: initialBalance,
        balance_after: runningBalance
      });
    }

    for (const row of transferRows) {
      const delta = row.transfer_type === 'deposit' ? toNumber(row.amount) : -toNumber(row.amount);
      runningBalance += delta;
      transactions.push({
        ...row,
        balance_after: runningBalance
      });
    }

    const closingBalance = openingBalance
      + (accountCreatedInRange ? initialBalance : 0)
      + toNumber(rangeTotals?.total_credits)
      - toNumber(rangeTotals?.total_debits);

    res.json({
      account,
      range: { start_date, end_date },
      opening_balance: openingBalance,
      closing_balance: closingBalance,
      total_credits: toNumber(rangeTotals?.total_credits),
      total_debits: toNumber(rangeTotals?.total_debits),
      transaction_count: transferRows.length,
      transactions
    });
  } catch (error) {
    console.error('Get bank statement error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/daily-setup/status', authenticateToken, async (req, res) => {
  try {
    const status = await getDailySetupStatus();
    res.json(status);
  } catch (error) {
    console.error('Get daily setup status error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/daily-setup/select-bank', [
  authenticateToken,
  authorizeRole(['admin']),
  body('bank_account_id').isInt({ min: 1 }).withMessage('Bank account is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const bankAccountId = Number(req.body.bank_account_id);
    const account = await getRow('SELECT * FROM bank_accounts WHERE id = ? AND is_active = 1', [bankAccountId]);
    if (!account) {
      return res.status(404).json({ message: 'Bank account not found' });
    }

    await upsertSelectedBank({
      bankAccountId,
      userId: req.user.id
    });

    const status = await getDailySetupStatus();
    res.json({
      message: 'Bank selected for today successfully',
      dailySetupStatus: status
    });
  } catch (error) {
    console.error('Select daily bank error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/daily-setup/review-balance', [
  authenticateToken,
  authorizeRole(['admin'])
], async (req, res) => {
  try {
    const status = await getDailySetupStatus();
    if (!status.hasBankAccounts) {
      return res.status(400).json({ message: 'Add a bank account before reviewing daily balances.' });
    }
    if (!status.bankSelectionCompleted) {
      return res.status(400).json({ message: 'Select today\'s bank before reviewing daily balances.' });
    }

    const balance = await getDailyBalanceSnapshot(status.businessDate);
    await markBalanceReviewed({
      userId: req.user.id,
      openingBalance: balance.openingBalance,
      closingBalance: balance.closingBalance
    });

    const refreshedStatus = await getDailySetupStatus();
    res.json({
      message: 'Today\'s balances reviewed successfully',
      dailySetupStatus: refreshedStatus
    });
  } catch (error) {
    console.error('Review daily balance error:', error);
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

router.delete('/bank-accounts/:id', [
  authenticateToken,
  authorizeRole(['admin'])
], async (req, res) => {
  try {
    const account = await getRow('SELECT * FROM bank_accounts WHERE id = ? AND is_active = 1', [req.params.id]);
    if (!account) return res.status(404).json({ message: 'Active bank account not found' });

    const timestamp = nowIST();
    const todayBusinessDate = moment().utcOffset('+05:30').format('YYYY-MM-DD');

    await runQuery(
      'UPDATE bank_accounts SET is_active = 0, updated_at = ? WHERE id = ?',
      [timestamp, req.params.id]
    );

    await runQuery(
      `UPDATE daily_operation_setup
       SET selected_bank_account_id = NULL,
           bank_selected_by = NULL,
           bank_selected_at = NULL,
           updated_at = ?
       WHERE business_date = ?
         AND selected_bank_account_id = ?`,
      [timestamp, todayBusinessDate, req.params.id]
    );

    res.json({ message: 'Bank account removed successfully' });
  } catch (error) {
    console.error('Delete bank account error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

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
  requireDailySetupForOperatorWrites,
  body('amount').isFloat({ min: 0.01 }).withMessage('Amount must be positive'),
  body('description').notEmpty().trim().withMessage('Description is required'),
  body('expense_date').notEmpty().withMessage('Date is required'),
  body('category').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { amount, description, expense_date, category = 'general' } = req.body;
    const eventTimestamp = nowIST();
    const result = await runQuery(
      'INSERT INTO expenditures (amount, description, category, expense_date, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [amount, description, category, expense_date, req.user.id, eventTimestamp]
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
      createdAt: eventTimestamp
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
  body('description').optional().trim(),
  body('withdrawal_purpose').optional().isIn(['cash_registry', 'business_expense', 'personal']).withMessage('Invalid withdrawal purpose')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { bank_account_id, amount, transfer_type, transfer_date, description, withdrawal_purpose } = req.body;
    const accountId = Number(bank_account_id);
    const transferAmount = toNumber(amount);
    const eventTimestamp = nowIST();

    // Resolve withdrawal_purpose: only relevant for withdrawals
    const resolvedPurpose = transfer_type === 'withdrawal'
      ? (withdrawal_purpose || 'cash_registry')
      : null;

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
      [newBalance, eventTimestamp, accountId]);

    const result = await runQuery(
      `INSERT INTO bank_transfers (
         bank_account_id,
         amount,
         transfer_type,
         source_type,
         source_reference,
         payment_mode,
         description,
         transfer_date,
         created_by,
         created_at,
         withdrawal_purpose
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [accountId, transferAmount, transfer_type, 'manual', null, null, description || null, transfer_date, req.user.id, eventTimestamp, resolvedPurpose]
    );

    // If withdrawal for business expense, also create an expenditure record
    if (resolvedPurpose === 'business_expense') {
      await runQuery(
        `INSERT INTO expenditures (amount, description, category, expense_date, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          transferAmount,
          description || 'Bank withdrawal for business expense',
          'bank_withdrawal',
          transfer_date,
          req.user.id,
          eventTimestamp
        ]
      );
    }

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

    if (transfer.source_type && transfer.source_type !== 'manual') {
      return res.status(400).json({
        message: 'This bank entry is linked to another transaction. Delete it from the original sales or supplier payment record.'
      });
    }

    // Reverse the balance change
    const sign = transfer.transfer_type === 'deposit' ? -1 : 1;
    await runQuery('UPDATE bank_accounts SET balance = balance + ?, updated_at = ? WHERE id = ?',
      [sign * transfer.amount, nowIST(), transfer.bank_account_id]);

    // If this withdrawal had created a linked expenditure, remove it too
    if (transfer.withdrawal_purpose === 'business_expense') {
      await runQuery(
        `DELETE FROM expenditures
         WHERE category = 'bank_withdrawal'
           AND amount = ?
           AND expense_date = ?
           AND created_by = ?`,
        [transfer.amount, transfer.transfer_date, transfer.created_by]
      );
    }

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
      const supplierRecord = await resolveSupplier({ supplierName: supplier_name });
      const supplierFilter = buildSupplierFilter({
        alias: 'sp',
        nameColumn: 'supplier_name',
        idColumn: 'supplier_id',
        supplierRecord,
        supplierName: supplier_name
      });
      query += ` AND ${supplierFilter.clause}`;
      params.push(...supplierFilter.params);
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
    const eventTimestamp = nowIST();
    const tracksBank = isBankTrackedSupplierPaymentMode(payment_mode);

    if (tracksBank && !accountId) {
      return res.status(400).json({ message: 'Select a bank account for this payment' });
    }

    const result = await createSupplierPaymentRecord({
      supplierName: supplier_name,
      amount: paymentAmount,
      paymentMode: payment_mode,
      bankAccountId: accountId,
      description,
      paymentDate: payment_date,
      userId: req.user.id,
      eventTimestamp
    });

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
      createdAt: eventTimestamp
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

    await reverseSupplierPaymentBankEffects(payment, nowIST());
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
    const sold = await getAll(`
      SELECT
        COALESCE(s.id, pl.supplier_id) AS supplier_id,
        COALESCE(s.name, pl.supplier_name) AS supplier_name,
        COALESCE(SUM(pl.quantity_received * pl.price_per_unit), 0) AS total_received_value,
        COALESCE(SUM(pl.quantity_sold * pl.price_per_unit), 0) AS sold_value,
        COALESCE(SUM(pl.quantity_sold), 0) AS total_sold_qty,
        COALESCE(SUM(pl.quantity_remaining), 0) AS total_remaining_qty,
        COALESCE(SUM(pl.quantity_returned), 0) AS total_returned_qty
      FROM purchase_lots pl
      LEFT JOIN suppliers s ON pl.supplier_id = s.id
      WHERE COALESCE(TRIM(COALESCE(s.name, pl.supplier_name)), '') != ''
      GROUP BY COALESCE(CAST(pl.supplier_id AS TEXT), LOWER(TRIM(pl.supplier_name))), COALESCE(s.id, pl.supplier_id), COALESCE(s.name, pl.supplier_name)
    `);

    const paid = await getAll(`
      SELECT
        COALESCE(s.id, sp.supplier_id) AS supplier_id,
        COALESCE(s.name, sp.supplier_name) AS supplier_name,
        SUM(sp.amount) AS total_paid
      FROM supplier_payments sp
      LEFT JOIN suppliers s ON sp.supplier_id = s.id
      WHERE COALESCE(TRIM(COALESCE(s.name, sp.supplier_name)), '') != ''
      GROUP BY COALESCE(CAST(sp.supplier_id AS TEXT), LOWER(TRIM(sp.supplier_name))), COALESCE(s.id, sp.supplier_id), COALESCE(s.name, sp.supplier_name)
    `);

    const balancesMap = new Map();

    const getSupplierKey = (row) => {
      if (row.supplier_id) {
        return `id:${row.supplier_id}`;
      }

      return `name:${String(row.supplier_name || '').trim().toLowerCase()}`;
    };

    const ensureBalanceEntry = (row) => {
      const key = getSupplierKey(row);
      if (!balancesMap.has(key)) {
        balancesMap.set(key, {
          supplier_id: row.supplier_id || null,
          supplier_name: row.supplier_name,
          total_received_value: 0,
          sold_value: 0,
          total_sold_qty: 0,
          total_remaining_qty: 0,
          total_returned_qty: 0,
          total_paid: 0,
          remaining_balance: 0
        });
      }

      return balancesMap.get(key);
    };

    for (const row of sold) {
      const entry = ensureBalanceEntry(row);
      entry.total_received_value = toNumber(row.total_received_value);
      entry.sold_value = toNumber(row.sold_value);
      entry.total_sold_qty = toNumber(row.total_sold_qty);
      entry.total_remaining_qty = toNumber(row.total_remaining_qty);
      entry.total_returned_qty = toNumber(row.total_returned_qty);
    }

    for (const row of paid) {
      const entry = ensureBalanceEntry(row);
      entry.total_paid = toNumber(row.total_paid);
    }

    const balances = Array.from(balancesMap.values())
      .map((entry) => ({
        ...entry,
        remaining_balance: entry.sold_value - entry.total_paid
      }))
      .sort((a, b) => b.remaining_balance - a.remaining_balance);

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
      SELECT DATE(sale_date) as day, SUM(total_amount) as total_sales
      FROM sales
      WHERE DATE(sale_date) BETWEEN ? AND ?
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

    // Daily bank withdrawals (only cash_registry – money returned to cash register)
    const withdrawalsByDay = await getAll(`
      SELECT transfer_date as day, SUM(amount) as total_withdrawals
      FROM bank_transfers
      WHERE transfer_type = 'withdrawal'
        AND source_type != 'supplier_payment'
        AND source_type != 'sales_return'
        AND COALESCE(withdrawal_purpose, 'cash_registry') = 'cash_registry'
        AND transfer_date BETWEEN ? AND ?
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
      SELECT
        DATE(COALESCE(delivery_date, purchase_date)) as day,
        SUM(total_amount) as total_purchases
      FROM purchases
      WHERE COALESCE(purchase_status, 'delivered') = 'delivered'
        AND DATE(COALESCE(delivery_date, purchase_date)) BETWEEN ? AND ?
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

    const setupRows = await getAll(`
      SELECT
        dos.business_date,
        dos.selected_bank_account_id,
        dos.bank_selected_at,
        dos.balance_reviewed_at,
        dos.opening_balance_snapshot,
        dos.closing_balance_snapshot,
        ba.account_name AS selected_bank_account_name,
        ba.bank_name AS selected_bank_name,
        reviewer.username AS balance_reviewed_by_name
      FROM daily_operation_setup dos
      LEFT JOIN bank_accounts ba ON ba.id = dos.selected_bank_account_id
      LEFT JOIN users reviewer ON reviewer.id = dos.balance_reviewed_by
      WHERE dos.business_date BETWEEN ? AND ?
    `, [start_date, end_date]);

    const setupMap = setupRows.reduce((acc, row) => {
      acc[row.business_date] = row;
      return acc;
    }, {});

    // Calculate running opening/closing balance
    // Opening balance for first day = 0 (user can adjust)
    // We compute: closing = opening + sales - expenditure - bank_deposits + bank_withdrawals
    // Next day opening = previous closing
    let openingBalance = 0;

    // Try to get the total cash before start_date
    const priorSales = await getRow(`
      SELECT COALESCE(SUM(total_amount), 0) as total FROM sales
      WHERE DATE(sale_date) < ?
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
      WHERE transfer_type = 'withdrawal'
        AND source_type != 'supplier_payment'
        AND source_type != 'sales_return'
        AND COALESCE(withdrawal_purpose, 'cash_registry') = 'cash_registry'
        AND transfer_date < ?
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
      const setup = setupMap[day];

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
        closing_balance: closingBalance,
        selected_bank_account_id: setup?.selected_bank_account_id || null,
        selected_bank_account_name: setup?.selected_bank_account_name || null,
        selected_bank_name: setup?.selected_bank_name || null,
        bank_selected_at: setup?.bank_selected_at || null,
        balance_reviewed_at: setup?.balance_reviewed_at || null,
        balance_reviewed_by_name: setup?.balance_reviewed_by_name || null,
        opening_balance_snapshot: setup?.opening_balance_snapshot ?? null,
        closing_balance_snapshot: setup?.closing_balance_snapshot ?? null
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
