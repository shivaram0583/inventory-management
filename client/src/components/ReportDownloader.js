import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import { Download, X, FileText, Loader } from 'lucide-react';
import CustomSelect from './shared/CustomSelect';
import { downloadCSV } from '../utils/csvExport';
import { getISTDateString, fmtDateTime } from '../utils/dateUtils';

const REPORT_TYPES = [
  { id: 'inventory', label: 'Inventory Stock', needsRange: false },
  { id: 'today-sales', label: "Today's Sales", needsRange: false },
  { id: 'sales-range', label: 'Sales by Date Range', needsRange: true },
  { id: 'purchases', label: 'Purchases by Date Range', needsRange: true },
  { id: 'customer-sales', label: 'Customer Sales by Date Range', needsRange: true },
  { id: 'transactions', label: 'Transactions Audit Report', needsRange: true },
  { id: 'suppliers', label: 'Supplier Report', needsRange: true },
  { id: 'supplier-details', label: 'Supplier Items Breakdown', needsRange: true },
];

const COLUMNS = {
  inventory: [
    { key: 'product_id', label: 'Product ID' },
    { key: 'product_name', label: 'Product Name' },
    { key: 'variety', label: 'Variety' },
    { key: 'category', label: 'Category' },
    { key: 'quantity_available', label: 'Stock Qty' },
    { key: 'unit', label: 'Unit' },
    { key: 'selling_price', label: 'Selling Price (₹)' },
    { key: 'purchase_price', label: 'Purchase Price (₹)' },
    { key: 'supplier', label: 'Supplier' },
  ],
  'today-sales': [
    { key: 'product_name', label: 'Product' },
    { key: 'variety', label: 'Variety' },
    { key: 'unit', label: 'Unit' },
    { key: 'total_quantity', label: 'Qty Sold' },
    { key: 'total_amount', label: 'Total Revenue (₹)' },
    { key: 'transaction_count', label: 'Transactions' },
  ],
  'sales-range': [
    { key: 'sale_date', label: 'Date' },
    { key: 'product_name', label: 'Product' },
    { key: 'variety', label: 'Variety' },
    { key: 'unit', label: 'Unit' },
    { key: 'total_quantity', label: 'Qty Sold' },
    { key: 'total_amount', label: 'Total Revenue (₹)' },
    { key: 'transaction_count', label: 'Transactions' },
  ],
  purchases: [
    { key: 'purchase_id', label: 'Purchase ID' },
    { key: 'product_name', label: 'Product' },
    { key: 'variety', label: 'Variety' },
    { key: 'category', label: 'Category' },
    { key: 'quantity', label: 'Qty' },
    { key: 'unit', label: 'Unit' },
    { key: 'price_per_unit', label: 'Price/Unit (₹)' },
    { key: 'total_amount', label: 'Total Cost (₹)' },
    { key: 'supplier', label: 'Supplier' },
    { key: 'purchase_date_fmt', label: 'Purchase Date (IST)' },
    { key: 'added_by', label: 'Added By' },
  ],
  'customer-sales': [
    { key: 'sale_id', label: 'Sale ID' },
    { key: 'customer_name', label: 'Customer' },
    { key: 'customer_mobile', label: 'Mobile' },
    { key: 'customer_address', label: 'Address' },
    { key: 'product_name', label: 'Product' },
    { key: 'quantity', label: 'Qty' },
    { key: 'sale_date_fmt', label: 'Sale Date (IST)' },
  ],
  transactions: [
    { key: 'row_type', label: 'Row Type' },
    { key: 'period_start', label: 'Period Start' },
    { key: 'period_end', label: 'Period End' },
    { key: 'business_date', label: 'Business Date' },
    { key: 'audit_timestamp_fmt', label: 'Audit Timestamp (IST)' },
    { key: 'entry_type', label: 'Entry Type' },
    { key: 'selected_bank', label: 'Default Bank Selected' },
    { key: 'bank_selected_at_fmt', label: 'Default Bank Selected At (IST)' },
    { key: 'balance_reviewed_by', label: 'Balance Reviewed By' },
    { key: 'balance_reviewed_at_fmt', label: 'Balance Reviewed At (IST)' },
    { key: 'opening_balance', label: 'Opening Balance (Rs.)' },
    { key: 'sales', label: 'Sales (Rs.)' },
    { key: 'expenditure', label: 'Expenditure (Rs.)' },
    { key: 'bank_deposits', label: 'Bank Deposits (Rs.)' },
    { key: 'bank_withdrawals', label: 'Bank Withdrawals (Rs.)' },
    { key: 'supplier_payments_cash', label: 'Supplier Cash Payments (Rs.)' },
    { key: 'closing_balance', label: 'Closing Balance (Rs.)' },
    { key: 'amount', label: 'Entry Amount (Rs.)' },
    { key: 'payment_mode', label: 'Payment Mode' },
    { key: 'bank_account', label: 'Bank Account' },
    { key: 'credited_to', label: 'Credited To' },
    { key: 'reference', label: 'Reference' },
    { key: 'category', label: 'Category' },
    { key: 'party_name', label: 'Party Name' },
    { key: 'description', label: 'Description' },
    { key: 'created_by', label: 'Created By' },
  ],
  suppliers: [
    { key: 'supplier', label: 'Supplier' },
    { key: 'products_supplied', label: 'Products Supplied' },
    { key: 'total_purchases', label: 'Total Purchases' },
    { key: 'total_quantity', label: 'Total Quantity' },
    { key: 'total_spent', label: 'Total Spent (₹)' },
    { key: 'first_purchase_fmt', label: 'First Purchase (IST)' },
    { key: 'last_purchase_fmt', label: 'Last Purchase (IST)' },
  ],
  'supplier-details': [
    { key: 'supplier', label: 'Supplier' },
    { key: 'product_code', label: 'Product ID' },
    { key: 'product_name', label: 'Product' },
    { key: 'variety', label: 'Variety' },
    { key: 'category', label: 'Category' },
    { key: 'unit', label: 'Unit' },
    { key: 'total_quantity', label: 'Total Qty' },
    { key: 'total_spent', label: 'Total Spent (₹)' },
    { key: 'purchase_count', label: 'Purchases' },
    { key: 'last_purchase_fmt', label: 'Last Purchase (IST)' },
  ],
};

const formatBankLabel = (accountName, bankName) => {
  if (accountName && bankName) return `${accountName} (${bankName})`;
  return accountName || bankName || '';
};

const buildTransactionReportRows = (payload, startDate, endDate) => {
  const summaryRow = {
    row_type: 'report_summary',
    period_start: startDate,
    period_end: endDate,
    business_date: '',
    audit_timestamp_fmt: '',
    entry_type: 'summary',
    selected_bank: '',
    bank_selected_at_fmt: '',
    balance_reviewed_by: '',
    balance_reviewed_at_fmt: '',
    opening_balance: '',
    sales: payload.summary?.total_sales ?? 0,
    expenditure: payload.summary?.total_expenditure ?? 0,
    bank_deposits: payload.summary?.total_bank_deposits ?? 0,
    bank_withdrawals: payload.summary?.total_bank_withdrawals ?? 0,
    supplier_payments_cash: payload.summary?.total_supplier_cash ?? 0,
    closing_balance: '',
    amount: '',
    payment_mode: '',
    bank_account: '',
    credited_to: '',
    reference: `Days covered: ${payload.summary?.total_days ?? 0}`,
    category: '',
    party_name: '',
    description: 'Transactions audit summary',
    created_by: ''
  };

  const dailyRows = (payload.dailyRows || []).map((day) => ({
    row_type: 'daily_summary',
    period_start: startDate,
    period_end: endDate,
    business_date: day.business_date,
    audit_timestamp_fmt: '',
    entry_type: 'daily_balance',
    selected_bank: formatBankLabel(day.selected_bank_account_name, day.selected_bank_name),
    bank_selected_at_fmt: fmtDateTime(day.bank_selected_at),
    balance_reviewed_by: day.balance_reviewed_by_name || '',
    balance_reviewed_at_fmt: fmtDateTime(day.balance_reviewed_at),
    opening_balance: day.opening_balance,
    sales: day.sales,
    expenditure: day.expenditure,
    bank_deposits: day.bank_deposits,
    bank_withdrawals: day.bank_withdrawals,
    supplier_payments_cash: day.supplier_payments_cash,
    closing_balance: day.closing_balance,
    amount: '',
    payment_mode: '',
    bank_account: formatBankLabel(day.selected_bank_account_name, day.selected_bank_name),
    credited_to: formatBankLabel(day.selected_bank_account_name, day.selected_bank_name),
    reference: '',
    category: '',
    party_name: '',
    description: 'Daily opening and closing balance snapshot',
    created_by: day.balance_reviewed_by_name || ''
  }));

  const expenditureRows = (payload.expenditures || []).map((item) => ({
    row_type: 'detail',
    period_start: startDate,
    period_end: endDate,
    business_date: item.expense_date,
    audit_timestamp_fmt: fmtDateTime(item.created_at),
    entry_type: 'expenditure',
    selected_bank: '',
    bank_selected_at_fmt: '',
    balance_reviewed_by: '',
    balance_reviewed_at_fmt: '',
    opening_balance: '',
    sales: '',
    expenditure: '',
    bank_deposits: '',
    bank_withdrawals: '',
    supplier_payments_cash: '',
    closing_balance: '',
    amount: item.amount,
    payment_mode: 'cash',
    bank_account: '',
    credited_to: '',
    reference: `EXP-${item.id}`,
    category: item.category || '',
    party_name: '',
    description: item.description || '',
    created_by: item.created_by_name || ''
  }));

  const bankTransferRows = (payload.bankTransfers || []).map((item) => ({
    row_type: 'detail',
    period_start: startDate,
    period_end: endDate,
    business_date: item.transfer_date,
    audit_timestamp_fmt: fmtDateTime(item.created_at),
    entry_type: item.transfer_type === 'deposit' ? 'bank_deposit' : 'bank_withdrawal',
    selected_bank: '',
    bank_selected_at_fmt: '',
    balance_reviewed_by: '',
    balance_reviewed_at_fmt: '',
    opening_balance: '',
    sales: '',
    expenditure: '',
    bank_deposits: '',
    bank_withdrawals: '',
    supplier_payments_cash: '',
    closing_balance: '',
    amount: item.amount,
    payment_mode: item.payment_mode || '',
    bank_account: formatBankLabel(item.account_name, item.bank_name),
    credited_to: item.transfer_type === 'withdrawal' ? 'Cash Drawer' : formatBankLabel(item.account_name, item.bank_name),
    reference: item.source_reference || `BT-${item.id}`,
    category: item.source_type || '',
    party_name: '',
    description: item.description || '',
    created_by: item.created_by_name || ''
  }));

  const supplierPaymentRows = (payload.supplierPayments || []).map((item) => ({
    row_type: 'detail',
    period_start: startDate,
    period_end: endDate,
    business_date: item.payment_date,
    audit_timestamp_fmt: fmtDateTime(item.created_at),
    entry_type: 'supplier_payment',
    selected_bank: '',
    bank_selected_at_fmt: '',
    balance_reviewed_by: '',
    balance_reviewed_at_fmt: '',
    opening_balance: '',
    sales: '',
    expenditure: '',
    bank_deposits: '',
    bank_withdrawals: '',
    supplier_payments_cash: '',
    closing_balance: '',
    amount: item.amount,
    payment_mode: item.payment_mode,
    bank_account: formatBankLabel(item.account_name, item.bank_name),
    credited_to: item.payment_mode === 'bank' ? formatBankLabel(item.account_name, item.bank_name) : '',
    reference: `SP-${item.id}`,
    category: '',
    party_name: item.supplier_name || '',
    description: item.description || '',
    created_by: item.created_by_name || ''
  }));

  return [summaryRow, ...dailyRows, ...expenditureRows, ...bankTransferRows, ...supplierPaymentRows];
};

const ReportDownloader = () => {
  const today = getISTDateString();
  const [open, setOpen] = useState(false);
  const [reportType, setReportType] = useState('inventory');
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const selectedType = REPORT_TYPES.find(t => t.id === reportType);

  const handleDownload = async () => {
    setError('');
    setLoading(true);
    try {
      let rows = [];

      if (reportType === 'inventory') {
        const res = await axios.get('/api/inventory');
        rows = res.data || [];
      } else if (reportType === 'today-sales') {
        const res = await axios.get('/api/reports/daily-sales');
        rows = res.data?.sales || [];
      } else if (reportType === 'sales-range') {
        const res = await axios.get('/api/reports/sales-range', {
          params: { start_date: startDate, end_date: endDate }
        });
        rows = (res.data?.sales || []).flatMap(day =>
          (day.items || []).map(item => ({
            ...item,
            sale_date: day.date
          }))
        );
      } else if (reportType === 'purchases') {
        const res = await axios.get('/api/reports/purchases', {
          params: { start_date: startDate, end_date: endDate }
        });
        rows = (res.data?.purchases || []).map(p => ({
          ...p,
          purchase_date_fmt: fmtDateTime(p.purchase_date),
        }));
      } else if (reportType === 'customer-sales') {
        const res = await axios.get('/api/reports/customer-sales', {
          params: { start_date: startDate, end_date: endDate }
        });
        rows = (res.data?.records || []).map(r => ({
          ...r,
          sale_date_fmt: fmtDateTime(r.sale_date),
        }));
      } else if (reportType === 'transactions') {
        const res = await axios.get('/api/reports/transactions', {
          params: { start_date: startDate, end_date: endDate }
        });
        rows = buildTransactionReportRows(res.data || {}, startDate, endDate);
      } else if (reportType === 'suppliers') {
        const res = await axios.get('/api/reports/suppliers', {
          params: { start_date: startDate, end_date: endDate }
        });
        rows = (res.data?.suppliers || []).map(s => ({
          ...s,
          first_purchase_fmt: fmtDateTime(s.first_purchase),
          last_purchase_fmt: fmtDateTime(s.last_purchase),
        }));
      } else if (reportType === 'supplier-details') {
        const res = await axios.get('/api/reports/suppliers', {
          params: { start_date: startDate, end_date: endDate }
        });
        rows = (res.data?.details || []).map(d => ({
          ...d,
          last_purchase_fmt: fmtDateTime(d.last_purchase),
        }));
      }

      if (rows.length === 0) {
        setError('No data found for the selected range.');
        setLoading(false);
        return;
      }

      const dateTag = selectedType.needsRange
        ? `_${startDate}_to_${endDate}`
        : `_${today}`;
      const filename = `${reportType}${dateTag}.csv`;
      downloadCSV(rows, COLUMNS[reportType], filename);
      setOpen(false);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to generate report');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors shadow-sm"
      >
        <Download className="h-4 w-4" />
        Download Reports
      </button>

      {open && (typeof document === 'undefined' ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
             style={{background:'rgba(15,23,42,0.55)',backdropFilter:'blur(4px)'}}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-scale-in flex flex-col" style={{maxHeight:'85vh'}}>
            <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-gray-100 flex-shrink-0">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-green-600" />
                <h2 className="text-lg font-bold text-gray-900">Download CSV Report</h2>
              </div>
              <button onClick={() => setOpen(false)}
                className="h-8 w-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1" style={{scrollbarWidth:'thin'}}>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Report Type</label>
                <CustomSelect
                  options={REPORT_TYPES.map(t => ({ value: t.id, label: t.label }))}
                  value={reportType}
                  onChange={(val) => setReportType(val)}
                />
              </div>

              {selectedType?.needsRange && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">From</label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={e => setStartDate(e.target.value)}
                      className="input-field"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">To</label>
                    <input
                      type="date"
                      value={endDate}
                      onChange={e => setEndDate(e.target.value)}
                      className="input-field"
                    />
                  </div>
                </div>
              )}

              <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-600">
                <p className="font-medium mb-1">Includes columns:</p>
                <p>{COLUMNS[reportType]?.map(c => c.label).join(', ')}</p>
              </div>

              {error && (
                <p className="text-sm text-red-600 bg-red-50 rounded-lg p-2">{error}</p>
              )}
            </div>

            <div className="px-6 py-4 flex gap-3 border-t border-gray-100 flex-shrink-0"
                 style={{background:'linear-gradient(90deg,#f8faff,#f5f3ff)'}}>
              <button
                onClick={() => setOpen(false)}
                className="flex-1 py-2.5 rounded-xl font-semibold text-sm text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDownload}
                disabled={loading}
                className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-sm text-white shadow-lg hover:shadow-xl active:scale-95 transition-all disabled:opacity-50"
                style={{background:'linear-gradient(135deg,#10b981,#059669)'}}
              >
                {loading ? (
                  <><Loader className="h-4 w-4 animate-spin" /> Generating...</>
                ) : (
                  <><Download className="h-4 w-4" /> Download CSV</>
                )}
              </button>
            </div>
          </div>
        </div>
      ) : createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
             style={{background:'rgba(15,23,42,0.55)',backdropFilter:'blur(4px)'}}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-scale-in flex flex-col" style={{maxHeight:'85vh'}}>
            <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-gray-100 flex-shrink-0">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-green-600" />
                <h2 className="text-lg font-bold text-gray-900">Download CSV Report</h2>
              </div>
              <button onClick={() => setOpen(false)}
                className="h-8 w-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1" style={{scrollbarWidth:'thin'}}>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Report Type</label>
                <CustomSelect
                  options={REPORT_TYPES.map(t => ({ value: t.id, label: t.label }))}
                  value={reportType}
                  onChange={(val) => setReportType(val)}
                />
              </div>

              {selectedType?.needsRange && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">From</label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={e => setStartDate(e.target.value)}
                      className="input-field"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">To</label>
                    <input
                      type="date"
                      value={endDate}
                      onChange={e => setEndDate(e.target.value)}
                      className="input-field"
                    />
                  </div>
                </div>
              )}

              {error && (
                <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {error}
                </div>
              )}
            </div>

            <div className="px-6 py-4 flex justify-end gap-2.5 border-t border-gray-100 flex-shrink-0"
                 style={{background:'linear-gradient(90deg,#f8faff,#f5f3ff)'}}>
              <button
                onClick={() => setOpen(false)}
                className="px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 hover:border-gray-300 active:scale-95 transition-all duration-150"
              >
                Cancel
              </button>
              <button
                onClick={handleDownload}
                disabled={loading}
                className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-sm text-white shadow-lg hover:shadow-xl active:scale-95 transition-all disabled:opacity-50"
                style={{background:'linear-gradient(135deg,#10b981,#059669)'}}
              >
                {loading ? (
                  <><Loader className="h-4 w-4 animate-spin" /> Generating...</>
                ) : (
                  <><Download className="h-4 w-4" /> Download CSV</>
                )}
              </button>
            </div>
          </div>
        </div>,
        document.body
      ))}
    </>
  );
};

export default ReportDownloader;
