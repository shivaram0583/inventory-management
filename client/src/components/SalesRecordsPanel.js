import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import CustomSelect from './shared/CustomSelect';
import { downloadCSV } from '../utils/csvExport';
import {
  CalendarDays,
  Download,
  Eye,
  FileText,
  IndianRupee,
  RefreshCw,
  RotateCcw,
  Search,
  Undo2,
  Wallet
} from 'lucide-react';

const getISTDateString = (date = new Date()) => date.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

const getPastISTDateString = (daysBack) => {
  const date = new Date();
  date.setDate(date.getDate() - daysBack);
  return getISTDateString(date);
};

const fmtMoney = (value) => Number(value || 0).toLocaleString('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

const fmtDate = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value).slice(0, 10) : date.toLocaleString('en-IN');
};

const PAYMENT_FILTERS = [
  { value: 'all', label: 'All Payments' },
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'upi', label: 'UPI' },
  { value: 'credit', label: 'Credit' }
];

const SalesRecordsPanel = ({ mode, onOpenSaleDetail, onOpenReceipt }) => {
  const isHistory = mode === 'history';
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [startDate, setStartDate] = useState(getPastISTDateString(30));
  const [endDate, setEndDate] = useState(getISTDateString());
  const [paymentMode, setPaymentMode] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const response = await axios.get(isHistory ? '/api/sales/summary' : '/api/sales/archive', {
        params: {
          start_date: startDate,
          end_date: endDate,
          payment_mode: paymentMode !== 'all' ? paymentMode : undefined
        }
      });
      setRows(response.data || []);
    } catch (error) {
      console.error('Load sales records error:', error);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [endDate, isHistory, paymentMode, startDate]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const visibleRows = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return rows;

    return rows.filter((row) => [
      row.sale_id,
      row.receipt_number,
      row.customer_name,
      row.customer_mobile,
      row.payment_mode,
      row.payment_status,
      row.operator_name
    ].some((value) => String(value || '').toLowerCase().includes(query)));
  }, [rows, searchTerm]);

  const metrics = useMemo(() => visibleRows.reduce((acc, row) => ({
    sales: acc.sales + 1,
    gross: acc.gross + Number(row.total_amount || 0),
    refunded: acc.refunded + Number(row.refunded_amount || 0),
    returnedQuantity: acc.returnedQuantity + Number(row.returned_quantity || 0),
    net: acc.net + Number((row.net_amount ?? row.total_amount) || 0)
  }), {
    sales: 0,
    gross: 0,
    refunded: 0,
    returnedQuantity: 0,
    net: 0
  }), [visibleRows]);

  const exportRows = () => {
    downloadCSV(
      visibleRows.map((row) => ({
        sale_id: row.sale_id,
        receipt_number: row.receipt_number || '',
        customer_name: row.customer_name || 'Walk-in Customer',
        customer_mobile: row.customer_mobile || '',
        payment_mode: row.payment_mode || '',
        payment_status: row.payment_status || '',
        total_quantity: row.total_quantity || 0,
        total_amount: Number(row.total_amount || 0).toFixed(2),
        refunded_amount: Number(row.refunded_amount || 0).toFixed(2),
        net_amount: Number((row.net_amount ?? row.total_amount) || 0).toFixed(2),
        return_entries: row.return_entries || 0,
        returned_quantity: row.returned_quantity || 0,
        sale_date: row.sale_date || ''
      })),
      [
        { key: 'sale_id', label: 'Sale ID' },
        { key: 'receipt_number', label: 'Receipt Number' },
        { key: 'customer_name', label: 'Customer' },
        { key: 'customer_mobile', label: 'Mobile' },
        { key: 'payment_mode', label: 'Payment Mode' },
        { key: 'payment_status', label: 'Payment Status' },
        { key: 'total_quantity', label: 'Quantity' },
        { key: 'total_amount', label: 'Gross Amount' },
        { key: 'refunded_amount', label: 'Refunded Amount' },
        { key: 'net_amount', label: 'Net Amount' },
        { key: 'return_entries', label: 'Return Entries' },
        { key: 'returned_quantity', label: 'Returned Quantity' },
        { key: 'sale_date', label: 'Sale Date' }
      ],
      `${isHistory ? 'sales-done' : 'sales-archive'}-${startDate}-to-${endDate}.csv`
    );
  };

  const quickSetRange = (daysBack) => {
    setStartDate(getPastISTDateString(daysBack));
    setEndDate(getISTDateString());
  };

  return (
    <div className="space-y-4">
      <div className="card space-y-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900">{isHistory ? 'Sales Done' : 'Sales Archive'}</h2>
            <p className="text-sm text-gray-500">
              {isHistory ? 'Completed receipts with live refund tracking and operator context' : 'Archived sale snapshots for long-term reference'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={fetchRows} className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
              <RefreshCw className="h-4 w-4" /> Refresh
            </button>
            <button onClick={exportRows} disabled={!visibleRows.length} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">
              <Download className="h-4 w-4" /> Export CSV
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
          <MetricCard icon={Wallet} label="Sales Count" value={metrics.sales} accent="emerald" />
          <MetricCard icon={IndianRupee} label="Gross Amount" value={`₹${fmtMoney(metrics.gross)}`} accent="blue" />
          <MetricCard icon={Undo2} label="Refunded" value={`₹${fmtMoney(metrics.refunded)}`} accent="amber" />
          <MetricCard icon={RotateCcw} label="Returned Qty" value={metrics.returnedQuantity} accent="rose" />
          <MetricCard icon={IndianRupee} label="Net Amount" value={`₹${fmtMoney(metrics.net)}`} accent="slate" />
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.4fr)_180px_180px_180px]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search by sale, receipt, customer, mobile..."
              className="input-field pl-10"
            />
          </div>
          <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="input-field" />
          <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} className="input-field" />
          <CustomSelect options={PAYMENT_FILTERS} value={paymentMode} onChange={setPaymentMode} />
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <button onClick={() => quickSetRange(7)} className="rounded-full bg-emerald-50 px-3 py-1.5 font-semibold text-emerald-700 hover:bg-emerald-100">Last 7 Days</button>
          <button onClick={() => quickSetRange(30)} className="rounded-full bg-emerald-50 px-3 py-1.5 font-semibold text-emerald-700 hover:bg-emerald-100">Last 30 Days</button>
          <button onClick={() => quickSetRange(90)} className="rounded-full bg-emerald-50 px-3 py-1.5 font-semibold text-emerald-700 hover:bg-emerald-100">Last 90 Days</button>
          <button onClick={() => { setSearchTerm(''); setPaymentMode('all'); quickSetRange(30); }} className="rounded-full bg-gray-100 px-3 py-1.5 font-semibold text-gray-700 hover:bg-gray-200">Reset Filters</button>
        </div>
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="py-14 text-center text-sm text-gray-400">Loading sales records...</div>
        ) : visibleRows.length === 0 ? (
          <div className="py-14 text-center text-sm text-gray-400">No sales records found for the selected filters.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100">
              <thead className="bg-gray-50/80">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-600">Sale</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-600">Customer</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase text-gray-600">Quantity</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-gray-600">Gross</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-gray-600">Refund</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-gray-600">Net</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase text-gray-600">Payment</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-600">Date</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {visibleRows.map((row) => (
                  <tr key={`${mode}-${row.sale_id}`} className="hover:bg-emerald-50/40 transition-colors">
                    <td className="px-4 py-3 text-sm">
                      <p className="font-mono font-semibold text-gray-900">{row.sale_id}</p>
                      <p className="text-xs text-gray-500">Receipt #{row.receipt_number || '-'}</p>
                      {Number(row.return_entries || 0) > 0 && (
                        <span className="mt-1 inline-flex rounded-full bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700">
                          {row.return_entries} return{Number(row.return_entries) === 1 ? '' : 's'}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <p className="font-medium text-gray-900">{row.customer_name || 'Walk-in Customer'}</p>
                      <p className="text-xs text-gray-500">{row.customer_mobile || '-'}</p>
                      {isHistory && row.operator_name && <p className="text-xs text-gray-400">By {row.operator_name}</p>}
                    </td>
                    <td className="px-4 py-3 text-center text-sm">
                      <p className="font-semibold text-gray-900">{row.total_quantity}</p>
                      <p className="text-xs text-gray-500">{row.line_items} lines</p>
                      {Number(row.returned_quantity || 0) > 0 && <p className="text-xs text-rose-600">Returned {row.returned_quantity}</p>}
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900">₹{fmtMoney(row.total_amount)}</td>
                    <td className="px-4 py-3 text-right text-sm font-semibold text-amber-700">₹{fmtMoney(row.refunded_amount)}</td>
                    <td className="px-4 py-3 text-right text-sm font-semibold text-emerald-700">₹{fmtMoney(row.net_amount ?? row.total_amount)}</td>
                    <td className="px-4 py-3 text-center text-sm">
                      <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold capitalize text-emerald-700">{row.payment_mode || '-'}</span>
                      {row.payment_status && <p className="mt-1 text-[11px] uppercase tracking-wide text-gray-400">{row.payment_status}</p>}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      <div className="flex items-center gap-1">
                        <CalendarDays className="h-3.5 w-3.5 text-gray-400" />
                        {fmtDate(row.sale_date)}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center text-sm">
                      <div className="flex items-center justify-center gap-2">
                        <button onClick={() => onOpenSaleDetail(row.sale_id)} className="text-emerald-600 hover:text-emerald-800" title="View sale details">
                          <Eye className="h-4 w-4" />
                        </button>
                        {isHistory && (
                          <button onClick={() => onOpenReceipt(row.sale_id)} className="text-indigo-600 hover:text-indigo-800" title="Open receipt">
                            <FileText className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

const MetricCard = ({ icon: Icon, label, value, accent }) => {
  const accentMap = {
    emerald: 'from-emerald-50 to-emerald-100 text-emerald-700',
    blue: 'from-sky-50 to-blue-100 text-sky-700',
    amber: 'from-amber-50 to-amber-100 text-amber-700',
    rose: 'from-rose-50 to-rose-100 text-rose-700',
    slate: 'from-slate-50 to-slate-100 text-slate-700'
  };

  return (
    <div className={`rounded-2xl border border-gray-100 bg-gradient-to-br p-4 ${accentMap[accent] || accentMap.slate}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
          <p className="mt-2 text-xl font-extrabold text-gray-900">{value}</p>
        </div>
        <span className="rounded-xl bg-white/80 p-2 shadow-sm">
          <Icon className="h-4 w-4" />
        </span>
      </div>
    </div>
  );
};

export default SalesRecordsPanel;