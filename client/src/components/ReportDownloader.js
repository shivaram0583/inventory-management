import React, { useState } from 'react';
import axios from 'axios';
import { Download, X, FileText, Loader } from 'lucide-react';
import { downloadCSV } from '../utils/csvExport';
import { getISTDateString, fmtDateTime } from '../utils/dateUtils';

const REPORT_TYPES = [
  { id: 'inventory', label: 'Inventory Stock', needsRange: false },
  { id: 'today-sales', label: "Today's Sales", needsRange: false },
  { id: 'sales-range', label: 'Sales by Date Range', needsRange: true },
  { id: 'purchases', label: 'Purchases by Date Range', needsRange: true },
  { id: 'customer-sales', label: 'Customer Sales by Date Range', needsRange: true },
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

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-green-600" />
                <h2 className="text-lg font-semibold text-gray-900">Download CSV Report</h2>
              </div>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Report Type</label>
                <select
                  value={reportType}
                  onChange={e => setReportType(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  {REPORT_TYPES.map(t => (
                    <option key={t.id} value={t.id}>{t.label}</option>
                  ))}
                </select>
              </div>

              {selectedType?.needsRange && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">From</label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={e => setStartDate(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">To</label>
                    <input
                      type="date"
                      value={endDate}
                      onChange={e => setEndDate(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
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

            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setOpen(false)}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDownload}
                disabled={loading}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-60"
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
      )}
    </>
  );
};

export default ReportDownloader;
