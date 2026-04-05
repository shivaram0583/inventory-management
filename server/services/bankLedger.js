const { getRow, runQuery } = require('../database/db');

const SUPPLIER_PAYMENT_BANK_MODES = new Set(['bank', 'upi']);

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const createHttpError = (status, message) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

function isBankTrackedSupplierPaymentMode(paymentMode) {
  return SUPPLIER_PAYMENT_BANK_MODES.has(String(paymentMode || '').toLowerCase());
}

function getSupplierPaymentTransferReference(paymentId) {
  return `supplier-payment:${paymentId}`;
}

async function createSupplierPaymentRecord({
  supplierName,
  amount,
  paymentMode,
  bankAccountId,
  description,
  paymentDate,
  userId,
  eventTimestamp
}) {
  const normalizedSupplierName = String(supplierName || '').trim();
  const normalizedPaymentMode = String(paymentMode || 'bank').toLowerCase();
  const paymentAmount = toNumber(amount);

  if (!normalizedSupplierName) {
    throw createHttpError(400, 'Supplier name is required');
  }

  if (paymentAmount <= 0) {
    throw createHttpError(400, 'Amount must be positive');
  }

  let accountId = bankAccountId ? Number(bankAccountId) : null;
  if (isBankTrackedSupplierPaymentMode(normalizedPaymentMode)) {
    if (!accountId) {
      throw createHttpError(400, 'Select a bank account for this payment');
    }

    const account = await getRow('SELECT * FROM bank_accounts WHERE id = ? AND is_active = 1', [accountId]);
    if (!account) {
      throw createHttpError(404, 'Bank account not found');
    }

    if (toNumber(account.balance) < paymentAmount) {
      throw createHttpError(400, 'Insufficient bank balance');
    }

    await runQuery(
      'UPDATE bank_accounts SET balance = balance - ?, updated_at = ? WHERE id = ?',
      [paymentAmount, eventTimestamp, accountId]
    );
  } else {
    accountId = null;
  }

  const result = await runQuery(
    `INSERT INTO supplier_payments (
       supplier_name,
       amount,
       payment_mode,
       bank_account_id,
       description,
       payment_date,
       created_by,
       created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      normalizedSupplierName,
      paymentAmount,
      normalizedPaymentMode,
      accountId,
      description || null,
      paymentDate,
      userId,
      eventTimestamp
    ]
  );

  if (accountId) {
    await runQuery(
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
       ) VALUES (?, ?, 'withdrawal', ?, ?, ?, ?, ?, ?, ?, 'supplier_payment')`,
      [
        accountId,
        paymentAmount,
        'supplier_payment',
        getSupplierPaymentTransferReference(result.id),
        normalizedPaymentMode,
        description || `Supplier payment to ${normalizedSupplierName}`,
        paymentDate,
        userId,
        eventTimestamp
      ]
    );
  }

  return {
    id: result.id,
    bankAccountId: accountId
  };
}

async function reverseSupplierPaymentBankEffects(payment, eventTimestamp) {
  if (!payment || !isBankTrackedSupplierPaymentMode(payment.payment_mode) || !payment.bank_account_id) {
    return;
  }

  await runQuery(
    'UPDATE bank_accounts SET balance = balance + ?, updated_at = ? WHERE id = ?',
    [toNumber(payment.amount), eventTimestamp, payment.bank_account_id]
  );

  await runQuery(
    `DELETE FROM bank_transfers
     WHERE source_type = 'supplier_payment'
       AND source_reference = ?
       AND bank_account_id = ?`,
    [getSupplierPaymentTransferReference(payment.id), payment.bank_account_id]
  );
}

module.exports = {
  isBankTrackedSupplierPaymentMode,
  getSupplierPaymentTransferReference,
  createSupplierPaymentRecord,
  reverseSupplierPaymentBankEffects
};
