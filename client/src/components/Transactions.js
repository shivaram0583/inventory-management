import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import { useReactToPrint } from 'react-to-print';
import { useAuth } from '../contexts/AuthContext';
import SharedModal from './shared/Modal';
import CustomSelect from './shared/CustomSelect';
import { getISTDateString, fmtDateTime } from '../utils/dateUtils';
import {
  ArrowLeftRight,
  Plus,
  Trash2,
  X,
  Landmark,
  TrendingDown,
  ArrowUpToLine,
  Truck,
  CalendarDays,
  Wallet,
  Building2,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  FileText,
  Printer,
  Download
} from 'lucide-react';

const num = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const fmt = (n) => num(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const Transactions = () => {
  const { user, dailySetupStatus, refreshDailySetupStatus } = useAuth();
  const isAdmin = user?.role === 'admin';
  const today = getISTDateString();

  const [activeTab, setActiveTab] = useState('daily');
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [loading, setLoading] = useState(false);

  // Data
  const [dailySummary, setDailySummary] = useState([]);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [expenditures, setExpenditures] = useState([]);
  const [bankTransfers, setBankTransfers] = useState([]);
  const [supplierPayments, setSupplierPayments] = useState([]);
  const [supplierBalances, setSupplierBalances] = useState([]);

  // Modals
  const [showExpModal, setShowExpModal] = useState(false);
  const [showBankTransferModal, setShowBankTransferModal] = useState(false);
  const [showSupplierPayModal, setShowSupplierPayModal] = useState(false);
  const [showBankAccModal, setShowBankAccModal] = useState(false);
  const [statementModal, setStatementModal] = useState({ open: false, account: null, data: null, loading: false });
  const [actionModal, setActionModal] = useState({ open: false, title: '', message: '', type: 'success' });
  const [deleteModal, setDeleteModal] = useState({ open: false, type: '', id: null, label: '' });

  // Forms
  const [expForm, setExpForm] = useState({ amount: '', description: '', category: 'general', expense_date: today });
  const [bankTransferForm, setBankTransferForm] = useState({ bank_account_id: '', amount: '', transfer_type: 'deposit', description: '', transfer_date: today, withdrawal_purpose: 'cash_registry' });
  const [supplierPayForm, setSupplierPayForm] = useState({ supplier_name: '', amount: '', payment_mode: 'bank', bank_account_id: '', description: '', payment_date: today });
  const [bankAccForm, setBankAccForm] = useState({ account_name: '', bank_name: '', account_number: '', balance: '' });

  // Expanded day rows
  const [expandedDay, setExpandedDay] = useState(null);
  const statementRef = React.useRef(null);

  const showMsg = (title, message, type = 'success') => setActionModal({ open: true, title, message, type });
  const isSupplierPaymentBankBacked = supplierPayForm.payment_mode === 'bank' || supplierPayForm.payment_mode === 'upi';

  // Fetch functions
  const fetchBankAccounts = useCallback(async () => {
    try {
      const res = await axios.get('/api/transactions/bank-accounts');
      setBankAccounts(res.data);
    } catch (e) { console.error(e); }
  }, []);

  const fetchDailySummary = useCallback(async () => {
    try {
      setLoading(true);
      const res = await axios.get(`/api/transactions/daily-summary?start_date=${startDate}&end_date=${endDate}`);
      setDailySummary(res.data);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }, [startDate, endDate]);

  const fetchExpenditures = useCallback(async () => {
    try {
      const res = await axios.get(`/api/transactions/expenditures?start_date=${startDate}&end_date=${endDate}`);
      setExpenditures(res.data);
    } catch (e) { console.error(e); }
  }, [startDate, endDate]);

  const fetchBankTransfers = useCallback(async () => {
    try {
      const res = await axios.get(`/api/transactions/bank-transfers?start_date=${startDate}&end_date=${endDate}`);
      setBankTransfers(res.data);
    } catch (e) { console.error(e); }
  }, [startDate, endDate]);

  const fetchSupplierPayments = useCallback(async () => {
    try {
      const res = await axios.get(`/api/transactions/supplier-payments?start_date=${startDate}&end_date=${endDate}`);
      setSupplierPayments(res.data);
    } catch (e) { console.error(e); }
  }, [startDate, endDate]);

  const fetchSupplierBalances = useCallback(async () => {
    try {
      const res = await axios.get('/api/transactions/supplier-balances');
      setSupplierBalances(res.data);
    } catch (e) { console.error(e); }
  }, []);

  const refreshAll = useCallback(async () => {
    await Promise.all([
      fetchBankAccounts(),
      fetchDailySummary(),
      fetchExpenditures(),
      fetchBankTransfers(),
      fetchSupplierPayments(),
      fetchSupplierBalances(),
      refreshDailySetupStatus?.()
    ]);
  }, [fetchBankAccounts, fetchDailySummary, fetchExpenditures, fetchBankTransfers, fetchSupplierPayments, fetchSupplierBalances, refreshDailySetupStatus]);

  useEffect(() => { refreshAll(); }, [refreshAll]);

  const handlePrintStatement = useReactToPrint({
    content: () => statementRef.current,
    documentTitle: statementModal.account
      ? `${statementModal.account.account_name}_${startDate}_to_${endDate}_statement`
      : `bank_statement_${startDate}_to_${endDate}`
  });

  const openStatement = async (account) => {
    setStatementModal({ open: true, account, data: null, loading: true });
    try {
      const res = await axios.get(`/api/transactions/bank-accounts/${account.id}/statement`, {
        params: { start_date: startDate, end_date: endDate }
      });
      setStatementModal({ open: true, account, data: res.data, loading: false });
    } catch (err) {
      setStatementModal({ open: false, account: null, data: null, loading: false });
      showMsg('Error', err.response?.data?.message || 'Failed to load bank statement', 'error');
    }
  };

  // Handlers
  const handleAddExpenditure = async (e) => {
    e.preventDefault();
    try {
      await axios.post('/api/transactions/expenditures', expForm);
      setShowExpModal(false);
      setExpForm({ amount: '', description: '', category: 'general', expense_date: today });
      refreshAll();
      showMsg('Expenditure Added', `Added expenditure of ₹${fmt(expForm.amount)}`);
    } catch (err) {
      showMsg('Error', err.response?.data?.message || 'Failed to add expenditure', 'error');
    }
  };

  const handleAddBankTransfer = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...bankTransferForm,
        bank_account_id: Number(bankTransferForm.bank_account_id),
        amount: num(bankTransferForm.amount),
        withdrawal_purpose: bankTransferForm.transfer_type === 'withdrawal' ? bankTransferForm.withdrawal_purpose : undefined
      };
      await axios.post('/api/transactions/bank-transfers', payload);
      setShowBankTransferModal(false);
      setBankTransferForm({ bank_account_id: bankAccounts[0]?.id || '', amount: '', transfer_type: 'deposit', description: '', transfer_date: today, withdrawal_purpose: 'cash_registry' });
      refreshAll();
      showMsg('Transfer Recorded', `₹${fmt(payload.amount)} ${payload.transfer_type} recorded`);
    } catch (err) {
      showMsg('Error', err.response?.data?.message || 'Failed to record transfer', 'error');
    }
  };

  const handleAddSupplierPayment = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...supplierPayForm,
        amount: num(supplierPayForm.amount),
        bank_account_id: isSupplierPaymentBankBacked && supplierPayForm.bank_account_id
          ? Number(supplierPayForm.bank_account_id)
          : null
      };
      await axios.post('/api/transactions/supplier-payments', payload);
      setShowSupplierPayModal(false);
      setSupplierPayForm({ supplier_name: '', amount: '', payment_mode: 'bank', bank_account_id: '', description: '', payment_date: today });
      refreshAll();
      showMsg('Payment Recorded', `Paid ₹${fmt(payload.amount)} to ${payload.supplier_name}`);
    } catch (err) {
      showMsg('Error', err.response?.data?.message || 'Failed to record payment', 'error');
    }
  };

  const handleAddBankAccount = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...bankAccForm,
        balance: num(bankAccForm.balance)
      };
      await axios.post('/api/transactions/bank-accounts', payload);
      setShowBankAccModal(false);
      setBankAccForm({ account_name: '', bank_name: '', account_number: '', balance: '' });
      refreshAll();
      showMsg('Account Added', `Bank account "${payload.account_name}" added`);
    } catch (err) {
      showMsg('Error', err.response?.data?.message || 'Failed to add account', 'error');
    }
  };

  const handleSetDefaultBank = async (bankAccountId) => {
    try {
      await axios.post('/api/transactions/daily-setup/select-bank', {
        bank_account_id: bankAccountId
      });
      await refreshAll();
      showMsg('Default Bank Updated', 'Today\'s default bank has been updated successfully.');
    } catch (err) {
      showMsg('Error', err.response?.data?.message || 'Failed to update the default bank', 'error');
    }
  };

  const confirmDelete = async () => {
    const { type, id } = deleteModal;
    setDeleteModal({ open: false, type: '', id: null, label: '' });
    try {
      await axios.delete(`/api/transactions/${type}/${id}`);
      refreshAll();
      showMsg('Deleted', 'Record deleted successfully', 'warning');
    } catch (err) {
      showMsg('Error', err.response?.data?.message || 'Failed to delete', 'error');
    }
  };

  const tabs = [
    { id: 'daily', label: 'Daily Summary', icon: CalendarDays },
    { id: 'expenditures', label: 'Expenditures', icon: TrendingDown },
    { id: 'bank', label: 'Bank', icon: Landmark },
    { id: 'suppliers', label: 'Supplier Payments', icon: Truck }
  ];

  // Summary totals for header
  const totals = dailySummary.reduce((acc, d) => ({
    sales: acc.sales + num(d.sales),
    expenditure: acc.expenditure + num(d.expenditure),
    bankDeposits: acc.bankDeposits + num(d.bank_deposits),
    supplierPayments: acc.supplierPayments + num(d.supplier_payments_total ?? d.supplier_payments)
  }), { sales: 0, expenditure: 0, bankDeposits: 0, supplierPayments: 0 });

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* Header */}
      <div className="rounded-2xl px-7 py-5 flex items-center justify-between shadow-lg overflow-hidden relative"
           style={{background:'linear-gradient(135deg,#4c1d95 0%,#7c3aed 45%,#a78bfa 100%)'}}>
        <div className="absolute inset-0 opacity-10 pointer-events-none"
             style={{backgroundImage:'radial-gradient(circle at 80% 50%,#c4b5fd,transparent 60%)'}} />
        <div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight">✦ Transactions</h1>
          <p className="mt-0.5 text-sm text-violet-200">Daily cash flow, bank & supplier management</p>
        </div>
        <button onClick={refreshAll} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white border border-white/20 hover:bg-white/10 transition-all"
                style={{backdropFilter:'blur(8px)'}}>
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </div>

      {/* Date range & quick stats */}
      <div className="card !py-4">
        <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
          <div className="flex gap-3 items-center flex-wrap">
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-gray-500">From</label>
              <input type="date" className="input-field !w-40 !text-sm" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-gray-500">To</label>
              <input type="date" className="input-field !w-40 !text-sm" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
            <button onClick={() => { setStartDate(today); setEndDate(today); }}
                    className="text-xs px-3 py-1.5 rounded-lg bg-violet-100 text-violet-700 font-semibold hover:bg-violet-200 transition-colors">Today</button>
            <button onClick={() => {
              const d = new Date(); d.setDate(d.getDate() - 7);
              setStartDate(d.toLocaleDateString('en-CA', {timeZone:'Asia/Kolkata'})); setEndDate(today);
            }} className="text-xs px-3 py-1.5 rounded-lg bg-violet-100 text-violet-700 font-semibold hover:bg-violet-200 transition-colors">Last 7 Days</button>
            <button onClick={() => {
              const d = new Date(); d.setDate(d.getDate() - 30);
              setStartDate(d.toLocaleDateString('en-CA', {timeZone:'Asia/Kolkata'})); setEndDate(today);
            }} className="text-xs px-3 py-1.5 rounded-lg bg-violet-100 text-violet-700 font-semibold hover:bg-violet-200 transition-colors">Last 30 Days</button>
          </div>
          <div className="flex gap-4 text-xs">
            <StatBadge label="Sales" value={totals.sales} color="emerald" />
            <StatBadge label="Expenditure" value={totals.expenditure} color="red" />
            <StatBadge label="To Bank" value={totals.bankDeposits} color="blue" />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${
              activeTab === t.id ? 'bg-white text-violet-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            <t.icon className="h-4 w-4" /> {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'daily' && (
        <DailySummaryTab
          summary={dailySummary}
          loading={loading}
          expandedDay={expandedDay}
          setExpandedDay={setExpandedDay}
        />
      )}

      {activeTab === 'expenditures' && (
        <ExpendituresTab
          expenditures={expenditures}
          isAdmin={isAdmin}
          onAdd={() => { setExpForm({ amount: '', description: '', category: 'general', expense_date: today }); setShowExpModal(true); }}
          onDelete={(id) => setDeleteModal({ open: true, type: 'expenditures', id, label: 'this expenditure' })}
        />
      )}

      {activeTab === 'bank' && (
      <BankTab
          bankAccounts={bankAccounts}
          bankTransfers={bankTransfers}
          isAdmin={isAdmin}
          selectedBankAccountId={dailySetupStatus?.selectedBankAccountId || null}
          onAddAccount={() => { setBankAccForm({ account_name: '', bank_name: '', account_number: '', balance: '' }); setShowBankAccModal(true); }}
          onAddTransfer={() => { setBankTransferForm({ bank_account_id: bankAccounts[0]?.id || '', amount: '', transfer_type: 'deposit', description: '', transfer_date: today, withdrawal_purpose: 'cash_registry' }); setShowBankTransferModal(true); }}
          onDeleteAccount={(id, label) => setDeleteModal({ open: true, type: 'bank-accounts', id, label })}
          onDeleteTransfer={(id) => setDeleteModal({ open: true, type: 'bank-transfers', id, label: 'this transfer' })}
          onSetDefaultBank={handleSetDefaultBank}
          onViewStatement={openStatement}
        />
      )}

      {activeTab === 'suppliers' && (
        <SupplierTab
          supplierBalances={supplierBalances}
          supplierPayments={supplierPayments}
          bankAccounts={bankAccounts}
          isAdmin={isAdmin}
          onAdd={(supplierName) => {
            setSupplierPayForm({ supplier_name: supplierName || '', amount: '', payment_mode: 'bank', bank_account_id: bankAccounts[0]?.id || '', description: '', payment_date: today });
            setShowSupplierPayModal(true);
          }}
          onDelete={(id) => setDeleteModal({ open: true, type: 'supplier-payments', id, label: 'this payment' })}
        />
      )}

      {/* ─── MODALS ─── */}

      {/* Add Expenditure */}
      {showExpModal && (
        <FormModal title="Add Expenditure" onClose={() => setShowExpModal(false)}>
          <form onSubmit={handleAddExpenditure} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label-sm">Amount (₹)</label>
                <input type="number" step="0.01" min="0.01" required className="input-field" value={expForm.amount}
                  onChange={(e) => setExpForm({...expForm, amount: e.target.value})} />
              </div>
              <div>
                <label className="label-sm">Date</label>
                <input type="date" required className="input-field" value={expForm.expense_date}
                  onChange={(e) => setExpForm({...expForm, expense_date: e.target.value})} />
              </div>
            </div>
            <div>
              <label className="label-sm">Description</label>
              <input type="text" required className="input-field" placeholder="e.g. Shop renovation, Electricity bill"
                value={expForm.description} onChange={(e) => setExpForm({...expForm, description: e.target.value})} />
            </div>
            <div>
              <label className="label-sm">Category</label>
              <CustomSelect
                options={[
                  { value: 'general', label: 'General' },
                  { value: 'renovation', label: 'Renovation' },
                  { value: 'utilities', label: 'Utilities' },
                  { value: 'transport', label: 'Transport' },
                  { value: 'salary', label: 'Salary' },
                  { value: 'maintenance', label: 'Maintenance' },
                  { value: 'other', label: 'Other' },
                ]}
                value={expForm.category}
                onChange={(val) => setExpForm({...expForm, category: val})}
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setShowExpModal(false)} className="btn-secondary">Cancel</button>
              <button type="submit" className="btn-primary">Add Expenditure</button>
            </div>
          </form>
        </FormModal>
      )}

      {/* Bank Transfer */}
      {showBankTransferModal && (
        <FormModal title="Record Bank Transfer" onClose={() => setShowBankTransferModal(false)}>
          <form onSubmit={handleAddBankTransfer} className="space-y-4">
            <div>
              <label className="label-sm">Bank Account</label>
              <CustomSelect
                required
                options={bankAccounts.map(a => ({ value: String(a.id), label: `${a.account_name} - ${a.bank_name} (₹${fmt(a.balance)})` }))}
                value={String(bankTransferForm.bank_account_id)}
                onChange={(val) => setBankTransferForm({...bankTransferForm, bank_account_id: val})}
                placeholder="Select account..."
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label-sm">Type</label>
                <CustomSelect
                  required
                  options={[
                    { value: 'deposit', label: 'Deposit (Cash → Bank)' },
                    { value: 'withdrawal', label: 'Withdrawal (Bank →)' },
                  ]}
                  value={bankTransferForm.transfer_type}
                  onChange={(val) => setBankTransferForm({...bankTransferForm, transfer_type: val, withdrawal_purpose: val === 'withdrawal' ? 'cash_registry' : undefined})}
                />
              </div>
              <div>
                <label className="label-sm">Amount (₹)</label>
                <input type="number" step="0.01" min="0.01" required className="input-field" value={bankTransferForm.amount}
                  onChange={(e) => setBankTransferForm({...bankTransferForm, amount: e.target.value})} />
              </div>
            </div>
            {bankTransferForm.transfer_type === 'withdrawal' && (
              <div>
                <label className="label-sm">Purpose of Withdrawal</label>
                <CustomSelect
                  required
                  options={[
                    { value: 'cash_registry', label: 'To Cash Registry' },
                    { value: 'business_expense', label: 'Business Expense (adds to expenditure)' },
                    { value: 'personal', label: 'Personal Use' },
                  ]}
                  value={bankTransferForm.withdrawal_purpose}
                  onChange={(val) => setBankTransferForm({...bankTransferForm, withdrawal_purpose: val})}
                />
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label-sm">Date</label>
                <input type="date" required className="input-field" value={bankTransferForm.transfer_date}
                  onChange={(e) => setBankTransferForm({...bankTransferForm, transfer_date: e.target.value})} />
              </div>
              <div>
                <label className="label-sm">Description</label>
                <input type="text" className="input-field" placeholder="Optional note" value={bankTransferForm.description}
                  onChange={(e) => setBankTransferForm({...bankTransferForm, description: e.target.value})} />
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setShowBankTransferModal(false)} className="btn-secondary">Cancel</button>
              <button type="submit" className="btn-primary">Record Transfer</button>
            </div>
          </form>
        </FormModal>
      )}

      {/* Supplier Payment */}
      {showSupplierPayModal && (
        <FormModal title="Record Supplier Payment" onClose={() => setShowSupplierPayModal(false)}>
          <form onSubmit={handleAddSupplierPayment} className="space-y-4">
            <div>
              <label className="label-sm">Supplier Name</label>
              <input type="text" required className="input-field" value={supplierPayForm.supplier_name} list="supplier-names"
                onChange={(e) => setSupplierPayForm({...supplierPayForm, supplier_name: e.target.value})} />
              <datalist id="supplier-names">
                {supplierBalances.map(s => <option key={s.supplier_name} value={s.supplier_name} />)}
              </datalist>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label-sm">Amount (₹)</label>
                <input type="number" step="0.01" min="0.01" required className="input-field" value={supplierPayForm.amount}
                  onChange={(e) => setSupplierPayForm({...supplierPayForm, amount: e.target.value})} />
              </div>
              <div>
                <label className="label-sm">Payment Mode</label>
                <CustomSelect
                  required
                  options={[
                    { value: 'bank', label: 'Bank Transfer' },
                    { value: 'cash', label: 'Cash' },
                    { value: 'upi', label: 'UPI' },
                  ]}
                  value={supplierPayForm.payment_mode}
                  onChange={(val) => setSupplierPayForm({...supplierPayForm, payment_mode: val})}
                />
              </div>
            </div>
            {isSupplierPaymentBankBacked && (
              <div>
                <label className="label-sm">{supplierPayForm.payment_mode === 'upi' ? 'UPI Linked Bank Account' : 'Bank Account'}</label>
                <CustomSelect
                  required
                  options={bankAccounts.map(a => ({ value: String(a.id), label: `${a.account_name} - ${a.bank_name} (₹${fmt(a.balance)})` }))}
                  value={String(supplierPayForm.bank_account_id)}
                  onChange={(val) => setSupplierPayForm({...supplierPayForm, bank_account_id: val})}
                  placeholder="Select account..."
                />
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label-sm">Date</label>
                <input type="date" required className="input-field" value={supplierPayForm.payment_date}
                  onChange={(e) => setSupplierPayForm({...supplierPayForm, payment_date: e.target.value})} />
              </div>
              <div>
                <label className="label-sm">Description</label>
                <input type="text" className="input-field" placeholder="Optional note" value={supplierPayForm.description}
                  onChange={(e) => setSupplierPayForm({...supplierPayForm, description: e.target.value})} />
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setShowSupplierPayModal(false)} className="btn-secondary">Cancel</button>
              <button type="submit" className="btn-primary">Record Payment</button>
            </div>
          </form>
        </FormModal>
      )}

      {/* Add Bank Account */}
      {showBankAccModal && (
        <FormModal title="Add Bank Account" onClose={() => setShowBankAccModal(false)}>
          <form onSubmit={handleAddBankAccount} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label-sm">Account Name</label>
                <input type="text" required className="input-field" placeholder="e.g. Main Business Account"
                  value={bankAccForm.account_name} onChange={(e) => setBankAccForm({...bankAccForm, account_name: e.target.value})} />
              </div>
              <div>
                <label className="label-sm">Bank Name</label>
                <input type="text" required className="input-field" placeholder="e.g. SBI, HDFC"
                  value={bankAccForm.bank_name} onChange={(e) => setBankAccForm({...bankAccForm, bank_name: e.target.value})} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label-sm">Account Number</label>
                <input type="text" className="input-field" placeholder="Optional"
                  value={bankAccForm.account_number} onChange={(e) => setBankAccForm({...bankAccForm, account_number: e.target.value})} />
              </div>
              <div>
                <label className="label-sm">Opening Balance (₹)</label>
                <input type="number" step="0.01" min="0" className="input-field" placeholder="0.00"
                  value={bankAccForm.balance} onChange={(e) => setBankAccForm({...bankAccForm, balance: e.target.value})} />
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setShowBankAccModal(false)} className="btn-secondary">Cancel</button>
              <button type="submit" className="btn-primary">Add Account</button>
            </div>
          </form>
        </FormModal>
      )}

      {statementModal.open && (
        <StatementModal
          statementRef={statementRef}
          account={statementModal.account}
          statement={statementModal.data}
          loading={statementModal.loading}
          startDate={startDate}
          endDate={endDate}
          onClose={() => setStatementModal({ open: false, account: null, data: null, loading: false })}
          onDownload={handlePrintStatement}
        />
      )}

      {/* Delete Confirmation */}
      <SharedModal isOpen={deleteModal.open} onClose={() => setDeleteModal({ open: false, type: '', id: null, label: '' })}
        title="Confirm Delete" type="warning" confirmText="Delete" onConfirm={confirmDelete}>
        <p>Are you sure you want to delete <strong>{deleteModal.label}</strong>?</p>
        <p className="mt-1 text-sm text-gray-500">This will reverse any balance changes.</p>
      </SharedModal>

      {/* Action Feedback */}
      <SharedModal isOpen={actionModal.open} onClose={() => setActionModal(p => ({...p, open: false}))}
        title={actionModal.title} type={actionModal.type} confirmText="OK">
        <p>{actionModal.message}</p>
      </SharedModal>
    </div>
  );
};

// ─── SUB-COMPONENTS ─────────────────────────────────────────────────────────

const StatBadge = ({ label, value, color }) => {
  const colors = {
    emerald: 'bg-emerald-50 text-emerald-700',
    red: 'bg-red-50 text-red-700',
    blue: 'bg-blue-50 text-blue-700',
    violet: 'bg-violet-50 text-violet-700'
  };
  return (
    <div className={`px-3 py-1.5 rounded-lg ${colors[color] || colors.blue}`}>
      <span className="font-medium">{label}:</span> <span className="font-bold">₹{fmt(value)}</span>
    </div>
  );
};

// ─── DAILY SUMMARY TAB ─────────────────────────────────────────────────────

const DailySummaryTab = ({ summary, loading, expandedDay, setExpandedDay }) => {
  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-violet-600" /></div>;

  if (summary.length === 0) return (
    <div className="card text-center py-12 text-gray-500">
      <CalendarDays className="h-10 w-10 mx-auto mb-3 text-gray-300" />
      <p>No transactions for the selected period</p>
    </div>
  );

  return (
    <div className="card">
      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th className="text-right">Opening Bal.</th>
              <th className="text-right">Sales</th>
              <th className="text-right">Expenditure</th>
              <th className="text-right">To Bank</th>
              <th className="text-right">From Bank</th>
              <th className="text-right">Supplier Cash</th>
              <th className="text-right">Closing Bal.</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {summary.map((day) => (
              <React.Fragment key={day.date}>
                <tr className="hover:bg-violet-50/50 cursor-pointer" onClick={() => setExpandedDay(expandedDay === day.date ? null : day.date)}>
                  <td className="font-semibold text-gray-800">{formatDisplayDate(day.date)}</td>
                  <td className="text-right font-medium text-gray-600">₹{fmt(day.opening_balance)}</td>
                  <td className="text-right font-medium text-emerald-600">+₹{fmt(day.sales)}</td>
                  <td className="text-right font-medium text-red-600">{day.expenditure > 0 ? `-₹${fmt(day.expenditure)}` : '-'}</td>
                  <td className="text-right font-medium text-blue-600">{day.bank_deposits > 0 ? `-₹${fmt(day.bank_deposits)}` : '-'}</td>
                  <td className="text-right font-medium text-cyan-600">{day.bank_withdrawals > 0 ? `+₹${fmt(day.bank_withdrawals)}` : '-'}</td>
                  <td className="text-right font-medium text-orange-600">{num(day.supplier_payments_cash ?? day.supplier_payments) > 0 ? `-₹${fmt(day.supplier_payments_cash ?? day.supplier_payments)}` : '-'}</td>
                  <td className={`text-right font-bold ${day.closing_balance >= 0 ? 'text-gray-800' : 'text-red-700'}`}>₹{fmt(day.closing_balance)}</td>
                  <td className="text-center">
                    {expandedDay === day.date ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                  </td>
                </tr>
                {expandedDay === day.date && (
                  <tr>
                    <td colSpan={9} className="!p-0">
                      <div className="bg-violet-50/60 px-6 py-4 border-y border-violet-100">
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
                          <SummaryCard label="Total Sales" value={day.sales} icon={Wallet} color="emerald" />
                          <SummaryCard label="Total Expenditure" value={day.expenditure} icon={TrendingDown} color="red" />
                          <SummaryCard label="Bank Deposits" value={day.bank_deposits} icon={ArrowUpToLine} color="blue" />
                          <SummaryCard label="Supplier Bank" value={day.supplier_payments_bank} icon={Landmark} color="violet" />
                          <SummaryCard label="Purchases (Stock)" value={day.purchases} icon={Truck} color="amber" />
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const SummaryCard = ({ label, value, icon: Icon, color }) => {
  const bg = { emerald: 'bg-emerald-100', red: 'bg-red-100', blue: 'bg-blue-100', amber: 'bg-amber-100', violet: 'bg-violet-100' };
  const txt = { emerald: 'text-emerald-700', red: 'text-red-700', blue: 'text-blue-700', amber: 'text-amber-700', violet: 'text-violet-700' };
  return (
    <div className={`rounded-xl px-4 py-3 ${bg[color] || 'bg-gray-100'}`}>
      <div className="flex items-center gap-2 mb-1">
        <Icon className={`h-4 w-4 ${txt[color] || 'text-gray-600'}`} />
        <span className="text-xs font-semibold text-gray-500">{label}</span>
      </div>
      <p className={`text-lg font-bold ${txt[color] || 'text-gray-800'}`}>₹{fmt(value)}</p>
    </div>
  );
};

// ─── EXPENDITURES TAB ───────────────────────────────────────────────────────

const ExpendituresTab = ({ expenditures, isAdmin, onAdd, onDelete }) => (
  <div className="space-y-4">
    <div className="flex justify-between items-center">
      <h3 className="text-lg font-bold text-gray-800">Expenditures</h3>
      <button onClick={onAdd} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white bg-red-500 hover:bg-red-600 shadow transition-all">
        <Plus className="h-4 w-4" /> Add Expenditure
      </button>
    </div>
    <div className="card">
      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Description</th>
              <th>Category</th>
              <th className="text-right">Amount</th>
              <th>Added By</th>
              {isAdmin && <th></th>}
            </tr>
          </thead>
          <tbody>
            {expenditures.length === 0 ? (
              <tr><td colSpan={isAdmin ? 6 : 5} className="text-center text-gray-400 py-8">No expenditures found</td></tr>
            ) : expenditures.map(exp => (
              <tr key={exp.id}>
                <td className="font-medium">{formatAuditTimestamp(exp.created_at, exp.expense_date)}</td>
                <td>{exp.description}</td>
                <td className="capitalize"><span className="px-2 py-0.5 rounded-full bg-gray-100 text-xs font-semibold text-gray-600">{exp.category}</span></td>
                <td className="text-right font-bold text-red-600">₹{fmt(exp.amount)}</td>
                <td className="text-sm text-gray-500">{exp.created_by_name || '-'}</td>
                {isAdmin && (
                  <td>
                    <button onClick={() => onDelete(exp.id)} className="text-red-500 hover:text-red-700"><Trash2 className="h-4 w-4" /></button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
    {expenditures.length > 0 && (
      <div className="text-right text-sm font-bold text-red-700">
        Total: ₹{fmt(expenditures.reduce((s, e) => s + e.amount, 0))}
      </div>
    )}
  </div>
);

// ─── BANK TAB ───────────────────────────────────────────────────────────────

const BankTab = ({
  bankAccounts,
  bankTransfers,
  isAdmin,
  selectedBankAccountId,
  onAddAccount,
  onAddTransfer,
  onDeleteAccount,
  onDeleteTransfer,
  onSetDefaultBank,
  onViewStatement
}) => (
  <div className="space-y-6">
    <div>
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-lg font-bold text-gray-800">Bank Accounts</h3>
        {isAdmin && (
          <button onClick={onAddAccount} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white bg-blue-500 hover:bg-blue-600 shadow transition-all">
            <Plus className="h-4 w-4" /> Add Account
          </button>
        )}
      </div>
      {bankAccounts.length === 0 ? (
        <div className="card text-center py-8 text-gray-400">
          <Building2 className="h-8 w-8 mx-auto mb-2 text-gray-300" />
          <p>No bank accounts configured. Add one to get started.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {bankAccounts.map((acc) => {
            const isDefault = Number(selectedBankAccountId) === Number(acc.id);

            return (
              <div
                key={acc.id}
                className={`rounded-xl p-5 shadow-sm ${isDefault ? 'border-2 border-violet-300' : 'border border-blue-100'}`}
                style={{ background: isDefault ? 'linear-gradient(135deg,#f5f3ff,#eef2ff)' : 'linear-gradient(135deg,#eff6ff,#f0f9ff)' }}
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="h-10 w-10 rounded-xl bg-blue-500 flex items-center justify-center">
                    <Landmark className="h-5 w-5 text-white" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-gray-800">{acc.account_name}</p>
                    <p className="text-xs text-gray-500">{acc.bank_name}{acc.account_number ? ` · ${acc.account_number}` : ''}</p>
                  </div>
                </div>
                <p className="text-2xl font-extrabold text-blue-700">₹{fmt(acc.balance)}</p>
                <p className={`mt-2 text-xs font-medium ${isDefault ? 'text-violet-700' : 'text-gray-500'}`}>
                  {isDefault ? 'This is the default bank selected for today.' : 'Available to set as the default bank for today.'}
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onViewStatement?.(acc)}
                    className="inline-flex items-center gap-2 rounded-lg bg-violet-100 px-3 py-1.5 text-xs font-bold text-violet-700 hover:bg-violet-200 transition-colors"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    Statement
                  </button>
                  {isAdmin && (
                    <>
                      {isDefault ? (
                        <span className="inline-flex items-center rounded-lg bg-violet-100 px-3 py-1.5 text-xs font-bold text-violet-700">
                          Default Bank Selected
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onSetDefaultBank?.(acc.id)}
                          className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-violet-700 transition-colors"
                        >
                          Set As Default
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onDeleteAccount?.(acc.id, `${acc.account_name} (${acc.bank_name})`)}
                        className="inline-flex items-center gap-1 rounded-lg bg-red-50 px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-100 transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Remove
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>

    <div>
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-lg font-bold text-gray-800">Bank Ledger</h3>
        {isAdmin && bankAccounts.length > 0 && (
          <button onClick={onAddTransfer} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white bg-indigo-500 hover:bg-indigo-600 shadow transition-all">
            <ArrowLeftRight className="h-4 w-4" /> New Transfer
          </button>
        )}
      </div>
      <div className="card">
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Entry</th>
                <th>Purpose</th>
                <th>Bank Account</th>
                <th>Source</th>
                <th>Description</th>
                <th className="text-right">Amount</th>
                {isAdmin && <th></th>}
              </tr>
            </thead>
            <tbody>
              {bankTransfers.length === 0 ? (
                <tr><td colSpan={isAdmin ? 8 : 7} className="text-center text-gray-400 py-8">No bank transactions found</td></tr>
              ) : bankTransfers.map(bt => (
                <tr key={bt.id}>
                  <td className="font-medium">{formatAuditTimestamp(bt.created_at, bt.transfer_date)}</td>
                  <td>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${getBankEntryBadgeClass(bt)}`}>
                      {getBankEntryLabel(bt)}
                    </span>
                  </td>
                  <td className="text-sm text-gray-500">{formatEntryPurpose(bt)}</td>
                  <td className="text-sm text-gray-700">{formatBankAccountLabel(bt.account_name, bt.bank_name)}</td>
                  <td className="text-sm text-gray-500">{formatTransferSource(bt)}</td>
                  <td className="text-sm text-gray-500">{bt.description || '-'}</td>
                  <td className={`text-right font-bold ${bt.transfer_type === 'deposit' ? 'text-blue-600' : 'text-cyan-600'}`}>₹{fmt(bt.amount)}</td>
                  {isAdmin && (
                    <td>
                      {canDeleteBankEntry(bt) ? (
                        <button onClick={() => onDeleteTransfer(bt.id)} className="text-red-500 hover:text-red-700"><Trash2 className="h-4 w-4" /></button>
                      ) : (
                        <span className="text-xs font-medium text-gray-400">Locked</span>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
);

// ─── SUPPLIER TAB ───────────────────────────────────────────────────────────

const StatementModal = ({ statementRef, account, statement, loading, startDate, endDate, onClose, onDownload }) => (
  <FormModal title={`Bank Statement${account ? ` - ${account.account_name}` : ''}`} onClose={onClose}>
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 px-4 py-3">
        <div>
          <p className="text-sm font-bold text-slate-800">{account?.account_name || 'Bank Statement'}</p>
          <p className="text-xs text-slate-500">
            {account?.bank_name || '-'}
            {account?.account_number ? ` · ${account.account_number}` : ''}
          </p>
          <p className="mt-1 text-xs text-slate-500">Range: {formatDisplayDate(startDate)} to {formatDisplayDate(endDate)}</p>
        </div>
        <button
          type="button"
          onClick={onDownload}
          disabled={loading || !statement}
          className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Download className="h-3.5 w-3.5" />
          Download PDF
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-slate-700" />
        </div>
      ) : (
        <div className="space-y-4">
          <div ref={statementRef} className="space-y-4 bg-white text-slate-900">
            <div className="rounded-xl border border-slate-200 p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xl font-bold">{statement?.account?.account_name}</p>
                  <p className="text-sm text-slate-500">{statement?.account?.bank_name}</p>
                  <p className="text-sm text-slate-500">{statement?.account?.account_number || 'Account number not added'}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Statement Period</p>
                  <p className="text-sm font-semibold">{formatDisplayDate(startDate)} to {formatDisplayDate(endDate)}</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <SummaryCard label="Opening Balance" value={statement?.opening_balance} icon={Wallet} color="blue" />
              <SummaryCard label="Money In" value={statement?.total_credits} icon={ArrowUpToLine} color="emerald" />
              <SummaryCard label="Money Out" value={statement?.total_debits} icon={TrendingDown} color="red" />
              <SummaryCard label="Closing Balance" value={statement?.closing_balance} icon={Landmark} color="violet" />
            </div>

            <div className="rounded-xl border border-slate-200 overflow-hidden">
              <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-sm font-bold text-slate-800">Transactions</p>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-100 text-slate-600">
                    <tr>
                      <th className="px-4 py-3 text-left">Timestamp</th>
                      <th className="px-4 py-3 text-left">Entry</th>
                      <th className="px-4 py-3 text-left">Source</th>
                      <th className="px-4 py-3 text-left">Description</th>
                      <th className="px-4 py-3 text-right">Amount</th>
                      <th className="px-4 py-3 text-right">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(statement?.transactions || []).length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-slate-400">No transactions found in this range.</td>
                      </tr>
                    ) : (statement?.transactions || []).map((entry) => (
                      <tr key={entry.id} className="border-t border-slate-100">
                        <td className="px-4 py-3">{formatAuditTimestamp(entry.created_at, entry.transfer_date)}</td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${getBankEntryBadgeClass(entry)}`}>
                            {getBankEntryLabel(entry)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-600">{formatTransferSource(entry)}</td>
                        <td className="px-4 py-3 text-slate-600">{entry.description || '-'}</td>
                        <td className={`px-4 py-3 text-right font-bold ${entry.transfer_type === 'deposit' ? 'text-emerald-600' : 'text-orange-600'}`}>
                          {entry.source_type === 'opening_balance' ? '' : entry.transfer_type === 'deposit' ? '+' : '-'}₹{fmt(entry.amount)}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-slate-700">₹{fmt(entry.balance_after)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={onDownload}
              disabled={!statement}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Printer className="h-4 w-4" />
              Print / Save as PDF
            </button>
          </div>
        </div>
      )}
    </div>
  </FormModal>
);

const SupplierTab = ({ supplierBalances, supplierPayments, bankAccounts, isAdmin, onAdd, onDelete }) => (
  <div className="space-y-6">
    {/* Supplier Balances */}
    <div>
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-lg font-bold text-gray-800">Supplier Balances</h3>
        {isAdmin && (
          <button onClick={() => onAdd('')} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white bg-orange-500 hover:bg-orange-600 shadow transition-all">
            <Plus className="h-4 w-4" /> Record Payment
          </button>
        )}
      </div>
      {supplierBalances.length === 0 ? (
        <div className="card text-center py-8 text-gray-400">
          <Truck className="h-8 w-8 mx-auto mb-2 text-gray-300" />
          <p>No supplier data found</p>
        </div>
      ) : (
        <div className="card">
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Supplier</th>
                  <th className="text-right">Total Purchased</th>
                  <th className="text-right">Total Paid</th>
                  <th className="text-right">Balance Due</th>
                  {isAdmin && <th></th>}
                </tr>
              </thead>
              <tbody>
                {supplierBalances.map(s => (
                  <tr key={s.supplier_name} className={s.remaining_balance > 0 ? 'bg-orange-50/50' : ''}>
                    <td className="font-semibold">{s.supplier_name}</td>
                    <td className="text-right">₹{fmt(s.total_purchased)}</td>
                    <td className="text-right text-emerald-600 font-medium">₹{fmt(s.total_paid)}</td>
                    <td className={`text-right font-bold ${s.remaining_balance > 0 ? 'text-orange-600' : 'text-emerald-600'}`}>
                      {s.remaining_balance > 0 ? `₹${fmt(s.remaining_balance)}` : 'Paid ✓'}
                    </td>
                    {isAdmin && (
                      <td>
                        {s.remaining_balance > 0 && (
                          <button onClick={() => onAdd(s.supplier_name)}
                            className="text-xs px-3 py-1 rounded-lg bg-orange-100 text-orange-700 font-semibold hover:bg-orange-200 transition-colors">
                            Pay
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>

    {/* Payment History */}
    <div>
      <h3 className="text-lg font-bold text-gray-800 mb-3">Payment History</h3>
      <div className="card">
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Supplier</th>
                <th>Mode</th>
                <th>Account</th>
                <th>Description</th>
                <th className="text-right">Amount</th>
                {isAdmin && <th></th>}
              </tr>
            </thead>
            <tbody>
              {supplierPayments.length === 0 ? (
                <tr><td colSpan={isAdmin ? 7 : 6} className="text-center text-gray-400 py-8">No payments found</td></tr>
              ) : supplierPayments.map(sp => (
                <tr key={sp.id}>
                  <td className="font-medium">{formatAuditTimestamp(sp.created_at, sp.payment_date)}</td>
                  <td className="font-semibold">{sp.supplier_name}</td>
                  <td>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                      sp.payment_mode === 'bank' ? 'bg-blue-100 text-blue-700' :
                      sp.payment_mode === 'upi' ? 'bg-purple-100 text-purple-700' :
                      'bg-green-100 text-green-700'
                    }`}>{sp.payment_mode.toUpperCase()}</span>
                  </td>
                  <td className="text-sm text-gray-500">{sp.account_name ? `${sp.account_name} (${sp.bank_name})` : '-'}</td>
                  <td className="text-sm text-gray-500">{sp.description || '-'}</td>
                  <td className="text-right font-bold text-orange-600">₹{fmt(sp.amount)}</td>
                  {isAdmin && (
                    <td>
                      <button onClick={() => onDelete(sp.id)} className="text-red-500 hover:text-red-700"><Trash2 className="h-4 w-4" /></button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
);

// ─── HELPERS ────────────────────────────────────────────────────────────────

const FormModal = ({ title, children, onClose }) => (
  typeof document === 'undefined'
    ? (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
           style={{background:'rgba(15,23,42,0.55)',backdropFilter:'blur(4px)'}}>
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg animate-scale-in flex flex-col"
             style={{maxHeight:'85vh'}}>
          <div className="flex justify-between items-center px-6 pt-5 pb-3 border-b border-gray-100 flex-shrink-0">
            <h3 className="text-lg font-bold text-gray-900">{title}</h3>
            <button onClick={onClose}
              className="h-8 w-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="px-6 py-5 overflow-y-auto flex-1" style={{scrollbarWidth:'thin'}}>
            {children}
          </div>
        </div>
      </div>
    )
    : createPortal(
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
           style={{background:'rgba(15,23,42,0.55)',backdropFilter:'blur(4px)'}}>
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg animate-scale-in flex flex-col"
             style={{maxHeight:'85vh'}}>
          <div className="flex justify-between items-center px-6 pt-5 pb-3 border-b border-gray-100 flex-shrink-0">
            <h3 className="text-lg font-bold text-gray-900">{title}</h3>
            <button onClick={onClose}
              className="h-8 w-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="px-6 py-5 overflow-y-auto flex-1" style={{scrollbarWidth:'thin'}}>
            {children}
          </div>
        </div>
      </div>,
      document.body
    )
);

function formatTransferSource(transfer) {
  if (transfer?.source_type === 'opening_balance') {
    return 'Opening balance';
  }

  if (transfer?.source_type === 'sale') {
    const mode = transfer.payment_mode ? transfer.payment_mode.toUpperCase() : 'SALE';
    return `${mode} sale${transfer.source_reference ? ` · ${transfer.source_reference}` : ''}`;
  }

  if (transfer?.source_type === 'supplier_payment') {
    const mode = transfer.payment_mode ? transfer.payment_mode.toUpperCase() : 'BANK';
    return `${mode} supplier payment`;
  }

  if (transfer?.source_type === 'manual') {
    return 'Manual transfer';
  }

  return transfer?.source_reference || '-';
}

function formatWithdrawalPurpose(transfer) {
  if (transfer?.transfer_type !== 'withdrawal') return '-';
  if (transfer?.source_type === 'supplier_payment') return 'Supplier Payment';
  switch (transfer.withdrawal_purpose) {
    case 'cash_registry': return 'To Cash Registry';
    case 'business_expense': return 'Business Expense';
    case 'personal': return 'Personal Use';
    default: return 'To Cash Registry';
  }
}

function formatEntryPurpose(transfer) {
  if (transfer?.source_type === 'sale') return 'Sale Credited';
  if (transfer?.source_type === 'opening_balance') return 'Opening Balance';
  if (transfer?.source_type === 'supplier_payment') return 'Supplier Payment';
  if (transfer?.transfer_type === 'withdrawal') {
    return formatWithdrawalPurpose(transfer);
  }
  if (transfer?.transfer_type === 'deposit') return 'Cash Deposit';
  return '-';
}

function formatBankAccountLabel(accountName, bankName) {
  if (accountName && bankName) {
    return `${accountName} (${bankName})`;
  }

  return accountName || bankName || '-';
}

function getBankEntryLabel(entry) {
  if (entry?.source_type === 'opening_balance') {
    return '↑ Opening Balance';
  }

  if (entry?.source_type === 'sale') {
    const mode = String(entry.payment_mode || '').toLowerCase();
    if (mode === 'upi') return '↑ UPI Received';
    if (mode === 'card') return '↑ Card Payment';
    if (mode === 'bank') return '↑ Bank Received';
    return '↑ Sale Credited';
  }

  if (entry?.source_type === 'supplier_payment') {
    const mode = String(entry.payment_mode || '').toLowerCase();
    if (mode === 'upi') return '↓ UPI Sent';
    if (mode === 'bank') return '↓ Bank Transfer';
    return '↓ Supplier Payment';
  }

  if (entry?.transfer_type === 'deposit') return '↑ Deposit';
  return '↓ Withdrawal';
}

function getBankEntryBadgeClass(entry) {
  if (entry?.source_type === 'opening_balance') {
    return 'bg-slate-100 text-slate-700';
  }

  if (entry?.source_type === 'sale') {
    const mode = String(entry.payment_mode || '').toLowerCase();
    if (mode === 'upi') return 'bg-purple-100 text-purple-700';
    if (mode === 'card') return 'bg-indigo-100 text-indigo-700';
    return 'bg-emerald-100 text-emerald-700';
  }

  if (entry?.source_type === 'supplier_payment') {
    return 'bg-amber-100 text-amber-700';
  }

  return entry?.transfer_type === 'deposit' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700';
}

function canDeleteBankEntry(entry) {
  return !entry?.source_type || entry.source_type === 'manual';
}

function formatDisplayDate(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatAuditTimestamp(timestamp, fallbackDate) {
  if (timestamp) return fmtDateTime(timestamp);
  return formatDisplayDate(fallbackDate);
}

export default Transactions;
