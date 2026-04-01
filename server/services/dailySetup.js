const { getAll, getRow, runQuery, nowIST } = require('../database/db');

const BUSINESS_TIMEZONE = 'Asia/Kolkata';

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const getISTDateString = (date = new Date()) =>
  date.toLocaleDateString('en-CA', { timeZone: BUSINESS_TIMEZONE });

async function getDailyBalanceSnapshot(date = getISTDateString()) {
  const priorSales = await getRow(`
    SELECT COALESCE(SUM(total_amount), 0) as total
    FROM sales
    WHERE DATE(datetime(sale_date, '+5 hours', '+30 minutes')) < ?
  `, [date]);

  const priorExp = await getRow(`
    SELECT COALESCE(SUM(amount), 0) as total
    FROM expenditures
    WHERE expense_date < ?
  `, [date]);

  const priorDeposits = await getRow(`
    SELECT COALESCE(SUM(amount), 0) as total
    FROM bank_transfers
    WHERE transfer_type = 'deposit' AND transfer_date < ?
  `, [date]);

  const priorWithdrawals = await getRow(`
    SELECT COALESCE(SUM(amount), 0) as total
    FROM bank_transfers
    WHERE transfer_type = 'withdrawal' AND transfer_date < ?
  `, [date]);

  const priorSupplierCash = await getRow(`
    SELECT COALESCE(SUM(amount), 0) as total
    FROM supplier_payments
    WHERE payment_mode = 'cash' AND payment_date < ?
  `, [date]);

  const todaySales = await getRow(`
    SELECT COALESCE(SUM(total_amount), 0) as total
    FROM sales
    WHERE DATE(datetime(sale_date, '+5 hours', '+30 minutes')) = ?
  `, [date]);

  const todayExp = await getRow(`
    SELECT COALESCE(SUM(amount), 0) as total
    FROM expenditures
    WHERE expense_date = ?
  `, [date]);

  const todayDeposits = await getRow(`
    SELECT COALESCE(SUM(amount), 0) as total
    FROM bank_transfers
    WHERE transfer_type = 'deposit' AND transfer_date = ?
  `, [date]);

  const todayWithdrawals = await getRow(`
    SELECT COALESCE(SUM(amount), 0) as total
    FROM bank_transfers
    WHERE transfer_type = 'withdrawal' AND transfer_date = ?
  `, [date]);

  const todaySupplierCash = await getRow(`
    SELECT COALESCE(SUM(amount), 0) as total
    FROM supplier_payments
    WHERE payment_mode = 'cash' AND payment_date = ?
  `, [date]);

  const openingBalance =
    toNumber(priorSales?.total) -
    toNumber(priorExp?.total) -
    toNumber(priorDeposits?.total) +
    toNumber(priorWithdrawals?.total) -
    toNumber(priorSupplierCash?.total);

  const sales = toNumber(todaySales?.total);
  const expenditure = toNumber(todayExp?.total);
  const bankDeposits = toNumber(todayDeposits?.total);
  const bankWithdrawals = toNumber(todayWithdrawals?.total);
  const supplierPaymentsCash = toNumber(todaySupplierCash?.total);

  const closingBalance =
    openingBalance + sales - expenditure - bankDeposits + bankWithdrawals - supplierPaymentsCash;

  return {
    date,
    openingBalance,
    closingBalance,
    sales,
    expenditure,
    bankDeposits,
    bankWithdrawals,
    supplierPaymentsCash
  };
}

async function getDailySetupRecord(date = getISTDateString()) {
  return getRow(`
    SELECT
      dos.*,
      ba.account_name AS selected_bank_account_name,
      ba.bank_name AS selected_bank_name,
      ba.account_number AS selected_bank_account_number,
      ba.balance AS selected_bank_balance,
      u.username AS balance_reviewed_by_name
    FROM daily_operation_setup dos
    LEFT JOIN bank_accounts ba ON ba.id = dos.selected_bank_account_id
    LEFT JOIN users u ON u.id = dos.balance_reviewed_by
    WHERE dos.business_date = ?
  `, [date]);
}

async function upsertSelectedBank({
  businessDate = getISTDateString(),
  bankAccountId,
  userId
}) {
  const timestamp = nowIST();
  await runQuery(`
    INSERT INTO daily_operation_setup (
      business_date,
      selected_bank_account_id,
      bank_selected_by,
      bank_selected_at,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(business_date) DO UPDATE SET
      selected_bank_account_id = excluded.selected_bank_account_id,
      bank_selected_by = excluded.bank_selected_by,
      bank_selected_at = excluded.bank_selected_at,
      updated_at = excluded.updated_at
  `, [businessDate, bankAccountId, userId, timestamp, timestamp, timestamp]);

  return getDailySetupRecord(businessDate);
}

async function markBalanceReviewed({
  businessDate = getISTDateString(),
  userId,
  openingBalance,
  closingBalance
}) {
  const timestamp = nowIST();
  await runQuery(`
    INSERT INTO daily_operation_setup (
      business_date,
      opening_balance_snapshot,
      closing_balance_snapshot,
      balance_reviewed_by,
      balance_reviewed_at,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(business_date) DO UPDATE SET
      opening_balance_snapshot = excluded.opening_balance_snapshot,
      closing_balance_snapshot = excluded.closing_balance_snapshot,
      balance_reviewed_by = excluded.balance_reviewed_by,
      balance_reviewed_at = excluded.balance_reviewed_at,
      updated_at = excluded.updated_at
  `, [businessDate, openingBalance, closingBalance, userId, timestamp, timestamp, timestamp]);

  return getDailySetupRecord(businessDate);
}

async function getDailySetupStatus(date = getISTDateString()) {
  const [bankAccounts, setup, balance] = await Promise.all([
    getAll('SELECT * FROM bank_accounts WHERE is_active = 1 ORDER BY created_at DESC'),
    getDailySetupRecord(date),
    getDailyBalanceSnapshot(date)
  ]);

  const hasBankAccounts = bankAccounts.length > 0;
  const bankSelectionCompleted = Boolean(setup?.selected_bank_account_id);
  const balanceReviewCompleted = Boolean(setup?.balance_reviewed_at);
  const isReady = hasBankAccounts && bankSelectionCompleted;

  let blockingReason = null;
  let blockingMessage = null;

  if (!hasBankAccounts) {
    blockingReason = 'bank_missing';
    blockingMessage = 'No bank has been added by admin yet. Add a bank to enable UPI and card transactions.';
  } else if (!bankSelectionCompleted) {
    blockingReason = 'bank_not_selected';
    blockingMessage = 'Admin must select today\'s bank for UPI and card transactions before operators can continue.';
  }

  return {
    businessDate: date,
    bankAccounts,
    hasBankAccounts,
    selectedBankAccountId: setup?.selected_bank_account_id || null,
    selectedBank: setup?.selected_bank_account_id ? {
      id: setup.selected_bank_account_id,
      account_name: setup.selected_bank_account_name,
      bank_name: setup.selected_bank_name,
      account_number: setup.selected_bank_account_number,
      balance: toNumber(setup.selected_bank_balance)
    } : null,
    bankSelectionCompleted,
    balanceReviewCompleted,
    needsAdminBalanceReview: !balanceReviewCompleted,
    balanceReviewedAt: setup?.balance_reviewed_at || null,
    balanceReviewedBy: setup?.balance_reviewed_by || null,
    balanceReviewedByName: setup?.balance_reviewed_by_name || null,
    openingBalance: balance.openingBalance,
    closingBalance: balance.closingBalance,
    summary: balance,
    isReady,
    blockingReason,
    blockingMessage
  };
}

module.exports = {
  getDailyBalanceSnapshot,
  getDailySetupRecord,
  getDailySetupStatus,
  getISTDateString,
  markBalanceReviewed,
  upsertSelectedBank
};
