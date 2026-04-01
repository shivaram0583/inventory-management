import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Lock, RefreshCw, Wallet } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { fmtDate } from '../../utils/dateUtils';
import CustomSelect from './CustomSelect';
import Modal from './Modal';

const currencyFormatter = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

const emptyBankForm = {
  account_name: '',
  bank_name: '',
  account_number: '',
  balance: ''
};

const formatCurrency = (value) => `Rs. ${currencyFormatter.format(Number(value || 0))}`;

const DailySetupGate = () => {
  const {
    user,
    dailySetupStatus,
    dailySetupLoading,
    refreshDailySetupStatus
  } = useAuth();
  const [bankForm, setBankForm] = useState(emptyBankForm);
  const [selectedBankId, setSelectedBankId] = useState('');
  const [actionError, setActionError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    if (!dailySetupStatus?.bankAccounts?.length) {
      setSelectedBankId('');
      return;
    }

    const preferredId = dailySetupStatus.selectedBankAccountId || dailySetupStatus.bankAccounts[0]?.id;
    setSelectedBankId((current) => {
      if (current && dailySetupStatus.bankAccounts.some((account) => String(account.id) === current)) {
        return current;
      }
      return preferredId ? String(preferredId) : '';
    });
  }, [dailySetupStatus]);

  useEffect(() => {
    setActionError('');
  }, [user?.id, dailySetupStatus?.blockingReason, dailySetupStatus?.businessDate]);

  const bankOptions = useMemo(
    () => (dailySetupStatus?.bankAccounts || []).map((account) => ({
      value: String(account.id),
      label: `${account.account_name} - ${account.bank_name} (${formatCurrency(account.balance)})`
    })),
    [dailySetupStatus]
  );

  const handleAddBankAndSelect = async () => {
    setSubmitting(true);
    setActionError('');

    try {
      const payload = {
        account_name: bankForm.account_name.trim(),
        bank_name: bankForm.bank_name.trim(),
        account_number: bankForm.account_number.trim(),
        balance: bankForm.balance === '' ? 0 : Number(bankForm.balance)
      };

      const created = await axios.post('/api/transactions/bank-accounts', payload);
      await axios.post('/api/transactions/daily-setup/select-bank', {
        bank_account_id: created.data.id
      });
      setBankForm(emptyBankForm);
      await refreshDailySetupStatus();
    } catch (error) {
      setActionError(error.response?.data?.message || 'Failed to add the bank account.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSelectBank = async () => {
    if (!selectedBankId) return;

    setSubmitting(true);
    setActionError('');

    try {
      await axios.post('/api/transactions/daily-setup/select-bank', {
        bank_account_id: Number(selectedBankId)
      });
      await refreshDailySetupStatus();
    } catch (error) {
      setActionError(error.response?.data?.message || 'Failed to select the bank.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRefresh = async () => {
    setActionError('');
    await refreshDailySetupStatus();
  };

  if (!user) {
    return null;
  }

  if (dailySetupLoading && !dailySetupStatus) {
    return (
      <Modal
        isOpen
        onClose={() => {}}
        title="Checking Daily Setup"
        type="info"
        confirmText="Please wait"
        confirmDisabled
        hideClose
        hideCancel
      >
        <p>Loading today&apos;s bank and balance setup.</p>
      </Modal>
    );
  }

  if (!dailySetupStatus) {
    return (
      <Modal
        isOpen
        onClose={() => {}}
        title="Daily Setup Unavailable"
        type="warning"
        confirmText={dailySetupLoading ? 'Refreshing...' : 'Retry'}
        onConfirm={handleRefresh}
        confirmDisabled={dailySetupLoading}
        hideClose
        hideCancel
      >
        <p>Today&apos;s bank and balance setup could not be loaded.</p>
        <p className="mt-2">Retry once to continue.</p>
      </Modal>
    );
  }

  if (isAdmin && !dailySetupStatus.hasBankAccounts) {
    const balanceValue = bankForm.balance === '' ? 0 : Number(bankForm.balance);
    const invalidBalance = bankForm.balance !== '' && (!Number.isFinite(balanceValue) || balanceValue < 0);

    return (
      <Modal
        isOpen
        onClose={() => {}}
        title="Add Bank For Today"
        type="warning"
        confirmText={submitting ? 'Saving...' : 'Add Bank'}
        onConfirm={handleAddBankAndSelect}
        confirmDisabled={
          submitting ||
          !bankForm.account_name.trim() ||
          !bankForm.bank_name.trim() ||
          invalidBalance
        }
        hideClose
        hideCancel
      >
        <p>
          No bank has been added yet. Add the bank that should receive today&apos;s UPI and card transactions.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-3">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5">Account Name</label>
            <input
              type="text"
              className="input-field"
              placeholder="Example: Main Current Account"
              value={bankForm.account_name}
              onChange={(event) => setBankForm((prev) => ({ ...prev, account_name: event.target.value }))}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5">Bank Name</label>
            <input
              type="text"
              className="input-field"
              placeholder="Example: SBI"
              value={bankForm.bank_name}
              onChange={(event) => setBankForm((prev) => ({ ...prev, bank_name: event.target.value }))}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5">Account Number</label>
            <input
              type="text"
              className="input-field"
              placeholder="Optional"
              value={bankForm.account_number}
              onChange={(event) => setBankForm((prev) => ({ ...prev, account_number: event.target.value }))}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5">Opening Bank Balance</label>
            <input
              type="number"
              min="0"
              step="0.01"
              className="input-field"
              placeholder="0.00"
              value={bankForm.balance}
              onChange={(event) => setBankForm((prev) => ({ ...prev, balance: event.target.value }))}
            />
          </div>
        </div>
        {actionError && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
            {actionError}
          </div>
        )}
      </Modal>
    );
  }

  if (isAdmin && !dailySetupStatus.bankSelectionCompleted) {
    return (
      <Modal
        isOpen
        onClose={() => {}}
        title="Select Bank For Today"
        type="info"
        confirmText={submitting ? 'Saving...' : 'Select Bank'}
        onConfirm={handleSelectBank}
        confirmDisabled={submitting || !selectedBankId}
        hideClose
        hideCancel
      >
        <p>
          Select the bank that should be used for today&apos;s UPI and card transactions.
        </p>
        <div className="mt-4">
          <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5">Today&apos;s Bank</label>
          <CustomSelect
            options={bankOptions}
            value={selectedBankId}
            onChange={setSelectedBankId}
            placeholder="Choose a bank account"
          />
        </div>
        {actionError && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
            {actionError}
          </div>
        )}
      </Modal>
    );
  }

  if (!isAdmin && !dailySetupStatus.isReady) {
    const messageByReason = {
      bank_missing: 'Bank is not added by admin yet. Please request admin to add a bank and complete today\'s setup.',
      bank_not_selected: 'Admin has not selected today\'s bank for UPI and card transactions. Please request admin to select it.'
    };

    return (
      <Modal
        isOpen
        onClose={() => {}}
        title="Admin Setup Pending"
        type="warning"
        confirmText={dailySetupLoading ? 'Refreshing...' : 'Refresh'}
        onConfirm={handleRefresh}
        confirmDisabled={dailySetupLoading}
        hideClose
        hideCancel
      >
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-amber-800">
            <Lock className="h-4 w-4" />
            Operator access is blocked
          </div>
          <p className="mt-2 text-sm text-amber-700">
            {messageByReason[dailySetupStatus.blockingReason] || dailySetupStatus.blockingMessage}
          </p>
        </div>
        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <Wallet className="h-4 w-4" />
            Today&apos;s status
          </div>
          <p className="mt-2 text-sm text-slate-600">Business Date: {fmtDate(dailySetupStatus.businessDate)}</p>
          <p className="mt-1 text-sm text-slate-600">
            Selected Bank: {dailySetupStatus.selectedBank ? `${dailySetupStatus.selectedBank.account_name} - ${dailySetupStatus.selectedBank.bank_name}` : 'Not selected'}
          </p>
        </div>
        {actionError && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
            {actionError}
          </div>
        )}
        <div className="mt-4 inline-flex items-center gap-2 text-xs font-medium text-gray-500">
          <RefreshCw className="h-3.5 w-3.5" />
          Retry after admin completes the setup.
        </div>
      </Modal>
    );
  }

  return null;
};

export default DailySetupGate;
