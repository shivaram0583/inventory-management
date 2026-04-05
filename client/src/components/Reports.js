import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { getISTDateString, fmtDateTime } from '../utils/dateUtils';
import { downloadPDF } from '../utils/pdfExport';
import SharedModal from './shared/Modal';
import useSortableData from '../hooks/useSortableData';
import SortableHeader from './shared/SortableHeader';
import ReportDownloader from './ReportDownloader';
import { 
  Calendar, 
  TrendingUp, 
  Package, 
  IndianRupee,
  ShoppingCart,
  Download,
  Truck,
  Users,
  Trash2,
  Shield,
  Search,
  ClipboardList,
  CheckCircle,
  AlertTriangle,
  XCircle,
  ChevronDown,
  ChevronRight,
  Landmark,
  ArrowUpRight,
  ArrowDownLeft
} from 'lucide-react';

const Reports = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [activeTab, setActiveTab] = useState('daily');
  const [startDate, setStartDate] = useState(getISTDateString());
  const [endDate, setEndDate] = useState(getISTDateString());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleteModal, setDeleteModal] = useState({ open: false, id: null, label: '' });

  const { sortedItems: sortedSales, sortConfig: salesSort, requestSort: sortSales } = useSortableData(data?.sales || [], { key: 'total_amount', direction: 'desc' });
  const { sortedItems: sortedCustSales, sortConfig: custSalesSort, requestSort: sortCustSales } = useSortableData(data?.customerSales || [], { key: 'sale_date', direction: 'desc' });
  const { sortedItems: sortedProducts, sortConfig: productsSort, requestSort: sortProducts } = useSortableData(data?.products || []);
  const activeProducts = useMemo(() => sortedProducts.filter(p => !p.is_deleted), [sortedProducts]);
  const deletedProducts = useMemo(() => sortedProducts.filter(p => p.is_deleted), [sortedProducts]);
  const { sortedItems: sortedPurchases, sortConfig: purchasesSort, requestSort: sortPurchases } = useSortableData(data?.purchases || [], { key: 'purchase_date', direction: 'desc' });
  const { sortedItems: sortedArchive, sortConfig: archiveSort, requestSort: sortArchive } = useSortableData(data?.records || [], { key: 'sale_date', direction: 'desc' });
  const { sortedItems: sortedSuppliers, sortConfig: suppliersSort, requestSort: sortSuppliers } = useSortableData(Array.isArray(data?.suppliers) ? data.suppliers : [], { key: 'total_spent', direction: 'desc' });
  const { sortedItems: sortedSupplierDetails, sortConfig: supplierDetailsSort, requestSort: sortSupplierDetails } = useSortableData(Array.isArray(data?.details) ? data.details : [], { key: 'supplier', direction: 'asc' });

  // Audit sub-table sorts
  const { sortedItems: sortedCfDaily, sortConfig: cfDailySort, requestSort: sortCfDaily } = useSortableData(data?.cashFlow?.daily || [], { key: 'business_date', direction: 'asc' });
  const { sortedItems: sortedExpDetails, sortConfig: expDetailsSort, requestSort: sortExpDetails } = useSortableData(data?.expenditures?.details || [], { key: 'expense_date', direction: 'desc' });
  const { sortedItems: sortedSupBalances, sortConfig: supBalancesSort, requestSort: sortSupBalances } = useSortableData(data?.suppliers?.balances || [], { key: 'remaining_balance', direction: 'desc' });
  const { sortedItems: sortedSupPayModes, sortConfig: supPayModesSort, requestSort: sortSupPayModes } = useSortableData(data?.suppliers?.paymentModes || [], { key: 'total_amount', direction: 'desc' });
  const { sortedItems: sortedSupAdvances, sortConfig: supAdvancesSort, requestSort: sortSupAdvances } = useSortableData(data?.suppliers?.advances || [], { key: 'purchase_date', direction: 'desc' });

  // Transaction sub-table sorts
  const { sortedItems: sortedTxnExpenses, sortConfig: txnExpSort, requestSort: sortTxnExp } = useSortableData(Array.isArray(data?.expenditures) ? data.expenditures : [], { key: 'expense_date', direction: 'desc' });
  const { sortedItems: sortedTxnBank, sortConfig: txnBankSort, requestSort: sortTxnBank } = useSortableData(Array.isArray(data?.bankTransfers) ? data.bankTransfers : [], { key: 'transfer_date', direction: 'desc' });
  const { sortedItems: sortedTxnSupplier, sortConfig: txnSupSort, requestSort: sortTxnSup } = useSortableData(Array.isArray(data?.supplierPayments) ? data.supplierPayments : [], { key: 'payment_date', direction: 'desc' });

  // Status filters
  const [statusFilter, setStatusFilter] = useState('all');
  const [paymentFilter, setPaymentFilter] = useState('all');

  // Search state
  const [archiveSearch, setArchiveSearch] = useState('');
  const [archiveSearchResults, setArchiveSearchResults] = useState(null);
  const [archiveSearching, setArchiveSearching] = useState(false);
  const [purchaseSearch, setPurchaseSearch] = useState('');
  const [purchaseSearchResults, setPurchaseSearchResults] = useState(null);
  const [purchaseSearching, setPurchaseSearching] = useState(false);

  // Audit expanded sections
  const [auditSection, setAuditSection] = useState('cashFlow');
  const [expandedAuditDay, setExpandedAuditDay] = useState(null);

  const formatCurrency = (value) => {
    const amount = Number(value);
    if (Number.isNaN(amount) || amount == null) return '0';
    return amount.toLocaleString('en-IN');
  };

  const quickDownload = (rows, columns, name) => {
    if (!rows || rows.length === 0) return;
    const dateTag = startDate === endDate ? `_${endDate}` : `_${startDate}_to_${endDate}`;
    downloadPDF(rows, columns, `${name}${dateTag}.pdf`);
  };

  const DownloadBtn = ({ onClick, label = 'Download PDF' }) => (
    <button onClick={onClick} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 transition-colors">
      <Download className="h-3.5 w-3.5" />{label}
    </button>
  );

  const FilterSelect = ({ value, onChange, options, label }) => (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-300">
      <option value="all">{label}: All</option>
      {options.map(opt => <option key={opt} value={opt}>{opt.charAt(0).toUpperCase() + opt.slice(1).replace(/_/g, ' ')}</option>)}
    </select>
  );

  const handleDeleteArchive = async () => {
    const { id } = deleteModal;
    setDeleteModal({ open: false, id: null, label: '' });
    if (!id) return;
    try {
      await axios.delete(`/api/reports/customer-sales/${id}`);
      fetchReportData();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete record');
    }
  };

  const handleArchiveSearch = async (query) => {
    setArchiveSearch(query);
    if (!query || query.trim().length < 2) {
      setArchiveSearchResults(null);
      return;
    }
    setArchiveSearching(true);
    try {
      const res = await axios.get('/api/reports/customer-sales/search', { params: { q: query.trim() } });
      setArchiveSearchResults(res.data.records || []);
    } catch { setArchiveSearchResults(null); }
    finally { setArchiveSearching(false); }
  };

  const handlePurchaseSearch = async (query) => {
    setPurchaseSearch(query);
    if (!query || query.trim().length < 2) {
      setPurchaseSearchResults(null);
      return;
    }
    setPurchaseSearching(true);
    try {
      const res = await axios.get('/api/reports/purchases/search', { params: { q: query.trim() } });
      setPurchaseSearchResults(res.data.purchases || []);
    } catch { setPurchaseSearchResults(null); }
    finally { setPurchaseSearching(false); }
  };

  const fetchReportData = useCallback(async () => {
    setLoading(true);
    setError('');
    
    try {
      const tabsUsingDateRange = ['daily', 'performance', 'purchases', 'customerSales', 'suppliers', 'audit', 'transactions'];
      if (tabsUsingDateRange.includes(activeTab)) {
        if (!startDate || !endDate) {
          setError('Start date and end date are required');
          setLoading(false);
          return;
        }

        if (startDate > endDate) {
          setError('Start date cannot be after end date');
          setLoading(false);
          return;
        }
      }

      let url = '';
      let params = {};

      switch (activeTab) {
        case 'daily':
          if (startDate === endDate) {
            url = '/api/reports/daily-sales';
            params = { date: endDate };
          } else {
            url = '/api/reports/sales-range';
            params = { start_date: startDate, end_date: endDate };
          }
          break;
        case 'inventory':
          url = '/api/reports/inventory-status';
          break;
        case 'performance':
          url = '/api/reports/product-performance';
          if (startDate && endDate) {
            params = { start_date: startDate, end_date: endDate };
          }
          break;
        case 'purchases':
          url = '/api/reports/purchases';
          if (startDate && endDate) {
            params = { start_date: startDate, end_date: endDate };
          }
          break;
        case 'customerSales':
          url = '/api/reports/customer-sales';
          if (startDate && endDate) {
            params = { start_date: startDate, end_date: endDate };
          }
          break;
        case 'suppliers':
          url = '/api/reports/suppliers';
          if (startDate && endDate) {
            params = { start_date: startDate, end_date: endDate };
          }
          break;
        case 'audit':
          url = '/api/reports/audit';
          params = { start_date: startDate, end_date: endDate };
          break;
        case 'transactions':
          url = '/api/reports/transactions';
          params = { start_date: startDate, end_date: endDate };
          break;
        case 'gst':
          url = '/api/reports/daily-sales';
          params = startDate === endDate ? { date: endDate } : { start_date: startDate, end_date: endDate };
          break;
        case 'profitLoss':
          url = '/api/reports/profit-loss';
          params = { start_date: startDate, end_date: endDate };
          break;
        default:
          url = '/api/reports/daily-sales';
          params = { date: endDate };
          break;
      }

      const response = await axios.get(url, { params });
      setData(response.data);
    } catch (error) {
      setError('Failed to fetch report data');
      console.error('Report error:', error);
    } finally {
      setLoading(false);
    }
  }, [activeTab, startDate, endDate]);

  useEffect(() => {
    fetchReportData();
  }, [fetchReportData]);

  const renderDailyReport = () => {
    if (!data) return null;
    if (startDate !== endDate) return renderDailyRangeReport();

    return (
      <div className="space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="stat-card border-blue-500 bg-blue-50">
            <div className="flex items-center">
              <ShoppingCart className="h-6 w-6 text-blue-500" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Total Transactions</p>
                <p className="text-2xl font-bold text-gray-900">{data.summary?.total_transactions || 0}</p>
              </div>
            </div>
          </div>
          
          <div className="stat-card border-green-500 bg-green-50">
            <div className="flex items-center">
              <Package className="h-6 w-6 text-green-500" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Items Sold</p>
                <p className="text-2xl font-bold text-gray-900">{data.summary?.total_items_sold || 0}</p>
              </div>
            </div>
          </div>
          
          <div className="stat-card border-purple-500 bg-purple-50">
            <div className="flex items-center">
              <IndianRupee className="h-6 w-6 text-purple-500" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Total Revenue</p>
                <p className="text-2xl font-bold text-gray-900">₹{formatCurrency(data.summary?.total_revenue)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Sales Details */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-gray-900">Sales Details</h3>
            <DownloadBtn onClick={() => quickDownload(sortedSales, [
              { key: 'product_name', label: 'Product' },
              { key: 'variety', label: 'Variety' },
              { key: 'total_quantity', label: 'Quantity Sold' },
              { key: 'unit', label: 'Unit' },
              { key: 'total_amount', label: 'Total Amount' },
              { key: 'transaction_count', label: 'Transactions' }
            ], 'daily-sales')} />
          </div>
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <SortableHeader label="Product" sortKey="product_name" sortConfig={salesSort} onSort={sortSales} />
                  <SortableHeader label="Variety" sortKey="variety" sortConfig={salesSort} onSort={sortSales} />
                  <SortableHeader label="Quantity Sold" sortKey="total_quantity" sortConfig={salesSort} onSort={sortSales} />
                  <SortableHeader label="Total Amount" sortKey="total_amount" sortConfig={salesSort} onSort={sortSales} />
                  <SortableHeader label="Transactions" sortKey="transaction_count" sortConfig={salesSort} onSort={sortSales} />
                </tr>
              </thead>
              <tbody>
                {sortedSales.map((sale, index) => (
                  <tr key={index}>
                    <td className="font-medium">{sale.product_name}</td>
                    <td>{sale.variety || '-'}</td>
                    <td>{sale.total_quantity} {sale.unit}</td>
                    <td>₹{formatCurrency(sale.total_amount)}</td>
                    <td>{sale.transaction_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(data.sales || []).length === 0 && (
              <div className="text-center py-8 text-gray-500">
                No sales data available for this date
              </div>
            )}
          </div>
        </div>

        {/* Customer Sales for the day */}
        <div className="card">
          <h3 className="text-lg font-medium text-gray-900 mb-4">
            <Users className="h-5 w-5 inline mr-2" />
            Customer Sales
          </h3>
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <SortableHeader label="Customer" sortKey="customer_name" sortConfig={custSalesSort} onSort={sortCustSales} />
                  <SortableHeader label="Mobile" sortKey="customer_mobile" sortConfig={custSalesSort} onSort={sortCustSales} />
                  <th>Address</th>
                  <SortableHeader label="Item" sortKey="product_name" sortConfig={custSalesSort} onSort={sortCustSales} />
                  <SortableHeader label="Quantity" sortKey="quantity" sortConfig={custSalesSort} onSort={sortCustSales} />
                  <SortableHeader label="Amount" sortKey="amount" sortConfig={custSalesSort} onSort={sortCustSales} />
                  <SortableHeader label="Payment" sortKey="payment_mode" sortConfig={custSalesSort} onSort={sortCustSales} />
                  <SortableHeader label="Time" sortKey="sale_date" sortConfig={custSalesSort} onSort={sortCustSales} />
                </tr>
              </thead>
              <tbody>
                {sortedCustSales.map((cs, idx) => (
                  <tr key={idx}>
                    <td className="font-medium">{cs.customer_name || '-'}</td>
                    <td>{cs.customer_mobile || '-'}</td>
                    <td>{cs.customer_address || '-'}</td>
                    <td>{cs.product_name}</td>
                    <td>{cs.quantity}</td>
                    <td className="font-medium">₹{formatCurrency(cs.amount)}</td>
                    <td>
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${
                        cs.payment_mode === 'upi' ? 'bg-purple-100 text-purple-700' :
                        cs.payment_mode === 'card' ? 'bg-blue-100 text-blue-700' :
                        'bg-green-100 text-green-700'
                      }`}>{cs.payment_mode || 'cash'}</span>
                    </td>
                    <td className="text-sm">{fmtDateTime(cs.sale_date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(data.customerSales || []).length === 0 && (
              <div className="text-center py-8 text-gray-500">
                No customer sales data for this date
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderDailyRangeReport = () => {
    if (!data) return null;

    return (
      <div className="space-y-6">
        {/* Summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="stat-card border-blue-500 bg-blue-50">
            <div className="flex items-center">
              <ShoppingCart className="h-6 w-6 text-blue-500" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Total Transactions</p>
                <p className="text-2xl font-bold text-gray-900">{data.summary?.total_transactions || 0}</p>
              </div>
            </div>
          </div>
          
          <div className="stat-card border-green-500 bg-green-50">
            <div className="flex items-center">
              <Package className="h-6 w-6 text-green-500" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Items Sold</p>
                <p className="text-2xl font-bold text-gray-900">{data.summary?.total_items_sold || 0}</p>
              </div>
            </div>
          </div>
          
          <div className="stat-card border-purple-500 bg-purple-50">
            <div className="flex items-center">
              <IndianRupee className="h-6 w-6 text-purple-500" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Total Revenue</p>
                <p className="text-2xl font-bold text-gray-900">₹{formatCurrency(data.summary?.total_revenue)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Daily Breakdown */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-gray-900">Daily Breakdown</h3>
            <DownloadBtn onClick={() => {
              const rows = (data.sales || []).flatMap(day =>
                (day.products || []).map(p => ({ date: day.date, daily_total: day.daily_total, product_name: p.product_name, variety: p.variety || '', quantity: p.total_quantity, unit: p.unit, amount: p.total_amount }))
              );
              quickDownload(rows, [
                { key: 'date', label: 'Date' },
                { key: 'product_name', label: 'Product' },
                { key: 'variety', label: 'Variety' },
                { key: 'quantity', label: 'Quantity' },
                { key: 'unit', label: 'Unit' },
                { key: 'amount', label: 'Amount' },
                { key: 'daily_total', label: 'Day Total' }
              ], 'daily-breakdown');
            }} />
          </div>
          <div className="space-y-4">
            {(data.sales || []).map((day, index) => (
              <div key={index} className="border border-gray-200 rounded-lg p-4">
                <div className="flex justify-between items-center mb-3">
                  <h4 className="font-medium text-gray-900">{day.date}</h4>
                  <div className="flex space-x-4 text-sm">
                    <span className="text-gray-600">₹{formatCurrency(day.daily_total)}</span>
                    <span className="text-gray-600">{day.daily_transactions || 0} transactions</span>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                  {(day.items || []).map((item, itemIndex) => (
                    <div key={itemIndex} className="text-sm text-gray-600">
                      {item.product_name}: {item.total_quantity} {item.unit}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const renderInventoryReport = () => {
    if (!data) return null;

    return (
      <div className="space-y-6">
        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="stat-card border-blue-500 bg-blue-50">
            <div className="flex items-center">
              <Package className="h-6 w-6 text-blue-500" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Total Products</p>
                <p className="text-2xl font-bold text-gray-900">{data.stats?.total_products || 0}</p>
              </div>
            </div>
          </div>
          
          <div className="stat-card border-green-500 bg-green-50">
            <div className="flex items-center">
              <Package className="h-6 w-6 text-green-500" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Total Stock</p>
                <p className="text-2xl font-bold text-gray-900">{data.stats?.total_stock || 0}</p>
              </div>
            </div>
          </div>
          
          <div className="stat-card border-purple-500 bg-purple-50">
            <div className="flex items-center">
              <IndianRupee className="h-6 w-6 text-purple-500" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Total Value</p>
                <p className="text-2xl font-bold text-gray-900">₹{formatCurrency(data.stats?.total_value)}</p>
              </div>
            </div>
          </div>
          
          <div className="stat-card border-red-500 bg-red-50">
            <div className="flex items-center">
              <TrendingUp className="h-6 w-6 text-red-500" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Low Stock Items</p>
                <p className="text-2xl font-bold text-gray-900">{data.stats?.low_stock_count || 0}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Category Breakdown */}
        <div className="card">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Category Breakdown</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(data.categoryStats || []).map((category, index) => (
              <div key={index} className="border border-gray-200 rounded-lg p-4">
                <h4 className="font-medium text-gray-900 capitalize mb-2">{category.category}</h4>
                <div className="space-y-1 text-sm">
                  <p className="text-gray-600">Products: {category.product_count}</p>
                  <p className="text-gray-600">Total Quantity: {category.total_quantity}</p>
                  <p className="text-gray-600">Total Value: ₹{formatCurrency(category.total_value)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Product List */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-gray-900">All Products ({activeProducts.length})</h3>
            <DownloadBtn onClick={() => quickDownload(activeProducts, [
              { key: 'product_id', label: 'Product ID' },
              { key: 'product_name', label: 'Name' },
              { key: 'category', label: 'Category' },
              { key: 'variety', label: 'Variety' },
              { key: 'quantity_available', label: 'Qty Available' },
              { key: 'unit', label: 'Unit' },
              { key: 'selling_price', label: 'Selling Price' }
            ], 'inventory')} />
          </div>
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <SortableHeader label="Product ID" sortKey="product_id" sortConfig={productsSort} onSort={sortProducts} />
                  <SortableHeader label="Name" sortKey="product_name" sortConfig={productsSort} onSort={sortProducts} />
                  <SortableHeader label="Variety" sortKey="variety" sortConfig={productsSort} onSort={sortProducts} />
                  <SortableHeader label="Category" sortKey="category" sortConfig={productsSort} onSort={sortProducts} />
                  <SortableHeader label="Stock" sortKey="quantity_available" sortConfig={productsSort} onSort={sortProducts} />
                  <SortableHeader label="Value" sortKey="quantity_available" sortConfig={productsSort} onSort={sortProducts} />
                </tr>
              </thead>
              <tbody>
                {activeProducts.map((product, index) => (
                  <tr key={index} className={product.quantity_available <= 10 ? 'bg-red-50' : ''}>
                    <td className="font-medium">{product.product_id}</td>
                    <td>{product.product_name}</td>
                    <td>{product.variety || '-'}</td>
                    <td className="capitalize">{product.category}</td>
                    <td className={product.quantity_available <= 10 ? 'text-red-600 font-medium' : ''}>
                      {product.quantity_available} {product.unit}
                    </td>
                    <td>₹{formatCurrency(product.quantity_available * product.selling_price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Deleted Items */}
        {deletedProducts.length > 0 && (
          <div className="card">
            <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center gap-2">
              <span className="text-red-600">Deleted Items ({deletedProducts.length})</span>
            </h3>
            <div className="table-container">
              <table className="table text-sm">
                <thead>
                  <tr>
                    <SortableHeader label="Product ID" sortKey="product_id" sortConfig={productsSort} onSort={sortProducts} />
                    <SortableHeader label="Name" sortKey="product_name" sortConfig={productsSort} onSort={sortProducts} />
                    <SortableHeader label="Variety" sortKey="variety" sortConfig={productsSort} onSort={sortProducts} />
                    <SortableHeader label="Category" sortKey="category" sortConfig={productsSort} onSort={sortProducts} />
                    <SortableHeader label="Last Stock" sortKey="quantity_available" sortConfig={productsSort} onSort={sortProducts} />
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {deletedProducts.map((product, index) => (
                    <tr key={index} className="bg-red-50/50">
                      <td className="font-medium text-gray-500">{product.product_id}</td>
                      <td className="text-gray-500">{product.product_name}</td>
                      <td className="text-gray-500">{product.variety || '-'}</td>
                      <td className="capitalize text-gray-500">{product.category}</td>
                      <td className="text-gray-500">{product.quantity_available} {product.unit}</td>
                      <td><span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-semibold">Deleted</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderPerformanceReport = () => {
    if (!data) return null;

    const topChartData = (data.topProducts || []).map(p => ({
      name: p.product_name.length > 12 ? p.product_name.slice(0, 12) + '…' : p.product_name,
      revenue: Number(p.total_revenue),
      sold: Number(p.total_sold)
    }));

    const leastChartData = (data.leastSelling || []).map(p => ({
      name: p.product_name.length > 12 ? p.product_name.slice(0, 12) + '…' : p.product_name,
      revenue: Number(p.total_revenue),
      sold: Number(p.total_sold)
    }));

    const PIE_COLORS = ['#6366f1','#8b5cf6','#3b82f6','#06b6d4','#10b981','#f59e0b','#ef4444','#ec4899'];
    const pieData = (data.topProducts || []).map((p, i) => ({
      name: p.product_name,
      value: Number(p.total_revenue)
    }));

    return (
      <div className="space-y-6">
        {/* Revenue Pie Chart */}
        {pieData.length > 0 && (
          <div className="card">
            <h3 className="text-base font-bold text-gray-800 mb-4 flex items-center gap-2">
              <span className="h-5 w-5 rounded bg-gradient-to-br from-indigo-500 to-violet-600 inline-flex items-center justify-center">
                <TrendingUp className="h-3 w-3 text-white" />
              </span>
              Revenue Share — Top Products
            </h3>
            <div className="flex flex-col md:flex-row items-center gap-6">
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={90}
                    paddingAngle={3} dataKey="value"
                    label={({ name, percent }) => `${name.slice(0,10)} ${(percent*100).toFixed(0)}%`}
                    labelLine={false}>
                    {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v) => [`₹${Number(v).toLocaleString('en-IN')}`, 'Revenue']} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-2 md:max-w-xs">
                {pieData.map((d, i) => (
                  <span key={i} className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full font-medium"
                        style={{background:`${PIE_COLORS[i % PIE_COLORS.length]}22`,color:PIE_COLORS[i % PIE_COLORS.length]}}>
                    <span className="w-2 h-2 rounded-full inline-block" style={{background:PIE_COLORS[i % PIE_COLORS.length]}} />
                    {d.name}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Top Products Chart + List */}
          <div className="card space-y-4">
            <h3 className="text-base font-bold text-gray-800">Top Performing Products</h3>
            {topChartData.length > 0 && (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={topChartData} margin={{top:4,right:8,left:8,bottom:4}}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="name" tick={{fontSize:11}} />
                  <YAxis tick={{fontSize:11}} tickFormatter={v => `₹${(v/1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v) => [`₹${Number(v).toLocaleString('en-IN')}`, 'Revenue']} />
                  <Bar dataKey="revenue" radius={[6,6,0,0]}
                    fill="url(#topGrad)" />
                  <defs>
                    <linearGradient id="topGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#6366f1" />
                      <stop offset="100%" stopColor="#8b5cf6" />
                    </linearGradient>
                  </defs>
                </BarChart>
              </ResponsiveContainer>
            )}
            <div className="space-y-2">
              {(data.topProducts || []).map((product, index) => (
                <div key={index} className="flex items-center justify-between px-3 py-2 rounded-xl"
                     style={{background:'linear-gradient(90deg,#f5f3ff,#eef2ff)'}}>
                  <div>
                    <p className="font-medium text-gray-900 text-sm">{product.product_name}</p>
                    {product.variety && <p className="text-xs text-gray-400">{product.variety}</p>}
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-indigo-700 text-sm">₹{formatCurrency(product.total_revenue)}</p>
                    <p className="text-xs text-gray-400">{product.total_sold} {product.unit}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Least Selling Chart + List */}
          <div className="card space-y-4">
            <h3 className="text-base font-bold text-gray-800">Least Selling Products</h3>
            {leastChartData.length > 0 && (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={leastChartData} margin={{top:4,right:8,left:8,bottom:4}}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="name" tick={{fontSize:11}} />
                  <YAxis tick={{fontSize:11}} tickFormatter={v => `₹${(v/1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v) => [`₹${Number(v).toLocaleString('en-IN')}`, 'Revenue']} />
                  <Bar dataKey="revenue" radius={[6,6,0,0]}
                    fill="url(#leastGrad)" />
                  <defs>
                    <linearGradient id="leastGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f59e0b" />
                      <stop offset="100%" stopColor="#ef4444" />
                    </linearGradient>
                  </defs>
                </BarChart>
              </ResponsiveContainer>
            )}
            <div className="space-y-2">
              {(data.leastSelling || []).map((product, index) => (
                <div key={index} className="flex items-center justify-between px-3 py-2 rounded-xl"
                     style={{background:'linear-gradient(90deg,#fffbeb,#fff7ed)'}}>
                  <div>
                    <p className="font-medium text-gray-900 text-sm">{product.product_name}</p>
                    {product.variety && <p className="text-xs text-gray-400">{product.variety}</p>}
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-amber-600 text-sm">₹{formatCurrency(product.total_revenue)}</p>
                    <p className="text-xs text-gray-400">{product.total_sold} {product.unit}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderPurchasesReport = () => {
    if (!data) return null;
    const displayPurchases = purchaseSearchResults !== null ? purchaseSearchResults : sortedPurchases;

    return (
      <div className="space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="stat-card border-blue-500 bg-blue-50">
            <div className="flex items-center">
              <Truck className="h-6 w-6 text-blue-500" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Total Purchases</p>
                <p className="text-2xl font-bold text-gray-900">{data.summary?.total_purchases || 0}</p>
              </div>
            </div>
          </div>
          
          <div className="stat-card border-green-500 bg-green-50">
            <div className="flex items-center">
              <Package className="h-6 w-6 text-green-500" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Total Items Purchased</p>
                <p className="text-2xl font-bold text-gray-900">{data.summary?.total_items || 0}</p>
              </div>
            </div>
          </div>
          
          <div className="stat-card border-purple-500 bg-purple-50">
            <div className="flex items-center">
              <IndianRupee className="h-6 w-6 text-purple-500" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Total Cost</p>
                <p className="text-2xl font-bold text-gray-900">₹{formatCurrency(data.summary?.total_cost)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Purchase Details */}
        <div className="card">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
            <h3 className="text-lg font-medium text-gray-900">Purchase Details</h3>
            <div className="flex items-center gap-3">
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  className="input-field !pl-9 !py-1.5 text-sm"
                  placeholder="Search purchase ID, product, supplier..."
                  value={purchaseSearch}
                  onChange={(e) => handlePurchaseSearch(e.target.value)}
                />
                {purchaseSearching && <div className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 border-2 border-t-indigo-500 border-indigo-100 rounded-full animate-spin" />}
                {purchaseSearch && (
                  <button onClick={() => { setPurchaseSearch(''); setPurchaseSearchResults(null); }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    <XCircle className="h-4 w-4" />
                  </button>
                )}
              </div>
              <DownloadBtn onClick={() => quickDownload(displayPurchases, [
                { key: 'purchase_id', label: 'Purchase ID' },
                { key: 'product_name', label: 'Product' },
                { key: 'supplier', label: 'Supplier' },
                { key: 'quantity', label: 'Quantity' },
                { key: 'unit', label: 'Unit' },
                { key: 'cost_per_unit', label: 'Cost/Unit' },
                { key: 'total_cost', label: 'Total Cost' },
                { key: 'status', label: 'Status' },
                { key: 'purchase_date', label: 'Date' },
                { key: 'payment_mode', label: 'Payment Mode' }
              ], 'purchases')} />
            </div>
          </div>
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <SortableHeader label="Purchase ID" sortKey="purchase_id" sortConfig={purchasesSort} onSort={sortPurchases} />
                  <SortableHeader label="Product" sortKey="product_name" sortConfig={purchasesSort} onSort={sortPurchases} />
                  <SortableHeader label="Category" sortKey="category" sortConfig={purchasesSort} onSort={sortPurchases} />
                  <SortableHeader label="Quantity" sortKey="quantity" sortConfig={purchasesSort} onSort={sortPurchases} />
                  <SortableHeader label="Price/Unit" sortKey="price_per_unit" sortConfig={purchasesSort} onSort={sortPurchases} />
                  <SortableHeader label="Total" sortKey="total_amount" sortConfig={purchasesSort} onSort={sortPurchases} />
                  <SortableHeader label="Supplier" sortKey="supplier" sortConfig={purchasesSort} onSort={sortPurchases} />
                  <SortableHeader label="Date" sortKey="purchase_date" sortConfig={purchasesSort} onSort={sortPurchases} />
                  <SortableHeader label="Added By" sortKey="added_by" sortConfig={purchasesSort} onSort={sortPurchases} />
                </tr>
              </thead>
              <tbody>
                {displayPurchases.map((purchase) => (
                  <tr key={purchase.id}>
                    <td className="font-medium text-xs">{purchase.purchase_id}</td>
                    <td>
                      <div>
                        <p className="font-medium">{purchase.product_name}</p>
                        {purchase.variety && <p className="text-xs text-gray-500">{purchase.variety}</p>}
                      </div>
                    </td>
                    <td className="capitalize">{purchase.category}</td>
                    <td>{purchase.quantity} {purchase.unit}</td>
                    <td>₹{formatCurrency(purchase.price_per_unit)}</td>
                    <td>₹{formatCurrency(purchase.total_amount)}</td>
                    <td>{purchase.supplier || '-'}</td>
                    <td className="text-sm">{fmtDateTime(purchase.purchase_date)}</td>
                    <td>{purchase.added_by || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(data.purchases || []).length === 0 && (
              <div className="text-center py-8 text-gray-500">
                No purchase data available
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderCustomerSalesArchive = () => {
    if (!data) return null;
    const records = data.records || [];
    const displayRecords = archiveSearchResults !== null ? archiveSearchResults : sortedArchive;

    return (
      <div className="space-y-6">
        <div className="card">
          {/* Search bar */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
            <h3 className="text-lg font-medium text-gray-900">
              <Users className="h-5 w-5 inline mr-2" />
              Sales Archive ({archiveSearchResults !== null ? `${archiveSearchResults.length} found` : `${records.length} records`})
            </h3>
            <div className="flex items-center gap-3">
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  className="input-field !pl-9 !py-1.5 text-sm"
                  placeholder="Search sale ID, customer, product..."
                  value={archiveSearch}
                  onChange={(e) => handleArchiveSearch(e.target.value)}
                />
                {archiveSearching && <div className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 border-2 border-t-indigo-500 border-indigo-100 rounded-full animate-spin" />}
                {archiveSearch && (
                  <button onClick={() => { setArchiveSearch(''); setArchiveSearchResults(null); }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    <XCircle className="h-4 w-4" />
                  </button>
                )}
              </div>
              <DownloadBtn onClick={() => quickDownload(displayRecords, [
                { key: 'sale_id', label: 'Sale ID' },
                { key: 'customer_name', label: 'Customer' },
                { key: 'product_name', label: 'Product' },
                { key: 'variety', label: 'Variety' },
                { key: 'quantity', label: 'Quantity' },
                { key: 'unit', label: 'Unit' },
                { key: 'selling_price', label: 'Price' },
                { key: 'total_amount', label: 'Total' },
                { key: 'payment_mode', label: 'Payment Mode' },
                { key: 'sale_date', label: 'Date' }
              ], 'sales-archive')} />
            </div>
          </div>
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <SortableHeader label="Sale ID" sortKey="sale_id" sortConfig={archiveSort} onSort={sortArchive} />
                  <SortableHeader label="Customer" sortKey="customer_name" sortConfig={archiveSort} onSort={sortArchive} />
                  <SortableHeader label="Mobile" sortKey="customer_mobile" sortConfig={archiveSort} onSort={sortArchive} />
                  <th>Address</th>
                  <SortableHeader label="Item" sortKey="product_name" sortConfig={archiveSort} onSort={sortArchive} />
                  <SortableHeader label="Quantity" sortKey="quantity" sortConfig={archiveSort} onSort={sortArchive} />
                  <SortableHeader label="Amount" sortKey="amount" sortConfig={archiveSort} onSort={sortArchive} />
                  <SortableHeader label="Payment" sortKey="payment_mode" sortConfig={archiveSort} onSort={sortArchive} />
                  <SortableHeader label="Date" sortKey="sale_date" sortConfig={archiveSort} onSort={sortArchive} />
                  {isAdmin && <th>Action</th>}
                </tr>
              </thead>
              <tbody>
                {displayRecords.map((r) => (
                  <tr key={r.id}>
                    <td className="text-xs font-mono">{r.sale_id}</td>
                    <td className="font-medium">{r.customer_name || '-'}</td>
                    <td>{r.customer_mobile || '-'}</td>
                    <td>{r.customer_address || '-'}</td>
                    <td>{r.product_name}</td>
                    <td>{r.quantity}</td>
                    <td className="font-medium">₹{formatCurrency(r.amount)}</td>
                    <td>
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${
                        r.payment_mode === 'upi' ? 'bg-purple-100 text-purple-700' :
                        r.payment_mode === 'card' ? 'bg-blue-100 text-blue-700' :
                        'bg-green-100 text-green-700'
                      }`}>{r.payment_mode || 'cash'}</span>
                    </td>
                    <td className="text-sm">{fmtDateTime(r.sale_date)}</td>
                    {isAdmin && (
                      <td>
                        <button
                          onClick={() => setDeleteModal({ open: true, id: r.id, label: `${r.customer_name} - ${r.product_name}` })}
                          className="text-red-500 hover:text-red-700"
                          title="Delete record"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {records.length === 0 && (
              <div className="text-center py-8 text-gray-500">
                No sales archive data available
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderSuppliersReport = () => {
    if (!data) return null;

    return (
      <div className="space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="stat-card border-teal-500 bg-teal-50">
            <div className="flex items-center">
              <Users className="h-6 w-6 text-teal-500" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Total Suppliers</p>
                <p className="text-2xl font-bold text-gray-900">{data.summary?.total_suppliers || 0}</p>
              </div>
            </div>
          </div>
          <div className="stat-card border-blue-500 bg-blue-50">
            <div className="flex items-center">
              <Truck className="h-6 w-6 text-blue-500" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Total Purchases</p>
                <p className="text-2xl font-bold text-gray-900">{data.summary?.total_purchases || 0}</p>
              </div>
            </div>
          </div>
          <div className="stat-card border-purple-500 bg-purple-50">
            <div className="flex items-center">
              <IndianRupee className="h-6 w-6 text-purple-500" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Total Cost</p>
                <p className="text-2xl font-bold text-gray-900">₹{formatCurrency(data.summary?.total_cost)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Supplier Summary Table */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-gray-900">
              <Truck className="h-5 w-5 inline mr-2" />
              Supplier Summary
            </h3>
            <DownloadBtn onClick={() => quickDownload(data.suppliers || [], [
              { key: 'supplier', label: 'Supplier' },
              { key: 'products_supplied', label: 'Products Supplied' },
              { key: 'total_purchases', label: 'Total Purchases' },
              { key: 'total_quantity', label: 'Total Quantity' },
              { key: 'total_spent', label: 'Total Spent' },
              { key: 'first_purchase', label: 'First Purchase' },
              { key: 'last_purchase', label: 'Last Purchase' }
            ], 'suppliers')} />
          </div>
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <SortableHeader label="Supplier" sortKey="supplier" sortConfig={suppliersSort} onSort={sortSuppliers} />
                  <SortableHeader label="Products Supplied" sortKey="products_supplied" sortConfig={suppliersSort} onSort={sortSuppliers} />
                  <SortableHeader label="Total Purchases" sortKey="total_purchases" sortConfig={suppliersSort} onSort={sortSuppliers} />
                  <SortableHeader label="Total Quantity" sortKey="total_quantity" sortConfig={suppliersSort} onSort={sortSuppliers} />
                  <SortableHeader label="Total Spent" sortKey="total_spent" sortConfig={suppliersSort} onSort={sortSuppliers} />
                  <SortableHeader label="First Purchase" sortKey="first_purchase" sortConfig={suppliersSort} onSort={sortSuppliers} />
                  <SortableHeader label="Last Purchase" sortKey="last_purchase" sortConfig={suppliersSort} onSort={sortSuppliers} />
                </tr>
              </thead>
              <tbody>
                {sortedSuppliers.map((sup, idx) => (
                  <tr key={idx}>
                    <td className="font-medium">{sup.supplier}</td>
                    <td>{sup.products_supplied}</td>
                    <td>{sup.total_purchases}</td>
                    <td>{Number(sup.total_quantity || 0)}</td>
                    <td className="font-medium">₹{formatCurrency(sup.total_spent)}</td>
                    <td className="text-sm">{fmtDateTime(sup.first_purchase)}</td>
                    <td className="text-sm">{fmtDateTime(sup.last_purchase)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {sortedSuppliers.length === 0 && (
              <div className="text-center py-8 text-gray-500">No supplier data available</div>
            )}
          </div>
        </div>

        {/* Detailed Supplier-Product Breakdown */}
        <div className="card">
          <h3 className="text-lg font-medium text-gray-900 mb-4">
            <Package className="h-5 w-5 inline mr-2" />
            Items Supplied — Detailed Breakdown
          </h3>
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <SortableHeader label="Supplier" sortKey="supplier" sortConfig={supplierDetailsSort} onSort={sortSupplierDetails} />
                  <SortableHeader label="Product ID" sortKey="product_code" sortConfig={supplierDetailsSort} onSort={sortSupplierDetails} />
                  <SortableHeader label="Product" sortKey="product_name" sortConfig={supplierDetailsSort} onSort={sortSupplierDetails} />
                  <SortableHeader label="Category" sortKey="category" sortConfig={supplierDetailsSort} onSort={sortSupplierDetails} />
                  <SortableHeader label="Total Qty" sortKey="total_quantity" sortConfig={supplierDetailsSort} onSort={sortSupplierDetails} />
                  <SortableHeader label="Total Spent" sortKey="total_spent" sortConfig={supplierDetailsSort} onSort={sortSupplierDetails} />
                  <SortableHeader label="Purchases" sortKey="purchase_count" sortConfig={supplierDetailsSort} onSort={sortSupplierDetails} />
                  <SortableHeader label="Last Purchase" sortKey="last_purchase" sortConfig={supplierDetailsSort} onSort={sortSupplierDetails} />
                </tr>
              </thead>
              <tbody>
                {sortedSupplierDetails.map((d, idx) => (
                  <tr key={idx}>
                    <td className="font-medium">{d.supplier}</td>
                    <td className="font-mono text-xs">{d.product_code}</td>
                    <td>
                      <p className="font-medium">{d.product_name}</p>
                      {d.variety && <p className="text-xs text-gray-500">{d.variety}</p>}
                    </td>
                    <td className="capitalize">{d.category}</td>
                    <td>{d.total_quantity} {d.unit}</td>
                    <td className="font-medium">₹{formatCurrency(d.total_spent)}</td>
                    <td>{d.purchase_count}</td>
                    <td className="text-sm">{fmtDateTime(d.last_purchase)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {sortedSupplierDetails.length === 0 && (
              <div className="text-center py-8 text-gray-500">No detail data available</div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // ═══════════════ AUDIT TAB ═══════════════
  const renderAuditReport = () => {
    if (!data) return null;
    const cf = data.cashFlow || {};
    const pm = data.paymentModes || {};
    const exp = data.expenditures || {};
    const sup = data.suppliers || {};
    const bankRecon = data.bankReconciliation || [];
    const summary = cf.summary || {};

    const auditSections = [
      { id: 'cashFlow', label: 'Cash Flow Audit', icon: IndianRupee },
      { id: 'paymentModes', label: 'Payment Mode Verification', icon: ShoppingCart },
      { id: 'expenditures', label: 'Expenditure Audit', icon: ClipboardList },
      { id: 'suppliers', label: 'Supplier Advances & Balances', icon: Truck },
      { id: 'bankRecon', label: 'Bank Reconciliation', icon: Landmark }
    ];

    return (
      <div className="space-y-6">
        {/* Audit Health Summary */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="stat-card border-blue-500 bg-blue-50">
            <div className="flex items-center">
              <Calendar className="h-6 w-6 text-blue-500" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Days Audited</p>
                <p className="text-2xl font-bold text-gray-900">{summary.total_days || 0}</p>
              </div>
            </div>
          </div>
          <div className="stat-card border-green-500 bg-green-50">
            <div className="flex items-center">
              <CheckCircle className="h-6 w-6 text-green-500" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Days Reviewed</p>
                <p className="text-2xl font-bold text-gray-900">{summary.days_reviewed || 0} / {summary.total_days || 0}</p>
              </div>
            </div>
          </div>
          <div className="stat-card border-amber-500 bg-amber-50">
            <div className="flex items-center">
              <AlertTriangle className="h-6 w-6 text-amber-500" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Days with Variance</p>
                <p className="text-2xl font-bold text-gray-900">{summary.days_with_variance || 0}</p>
              </div>
            </div>
          </div>
          <div className="stat-card border-indigo-500 bg-indigo-50">
            <div className="flex items-center">
              <IndianRupee className="h-6 w-6 text-indigo-500" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Net Revenue</p>
                <p className="text-2xl font-bold text-gray-900">₹{formatCurrency(summary.total_sales)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Section Nav */}
        <div className="card !p-2">
          <div className="flex items-center justify-between">
            <nav className="flex flex-wrap gap-1">
              {auditSections.map((s) => (
                <button key={s.id} onClick={() => setAuditSection(s.id)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    auditSection === s.id ? 'bg-slate-800 text-white shadow' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                  }`}>
                  <s.icon className="h-3 w-3" /> {s.label}
                </button>
              ))}
            </nav>
            <DownloadBtn onClick={() => {
              const rows = [];
              // Cash flow daily
              (cf.daily || []).forEach(d => rows.push({ section: 'Cash Flow', date: d.business_date, label: 'Daily', sales: d.total_sales, expenditure: d.total_expenditure, bank_deposits: d.bank_deposits, bank_withdrawals: d.bank_withdrawals, supplier_cash: d.supplier_cash_payments, opening: d.opening_balance, closing: d.closing_balance }));
              // Expenditure details
              (exp.details || []).forEach(e => rows.push({ section: 'Expenditure', date: e.business_date, label: e.category, description: e.description, amount: e.amount, payment_mode: e.payment_mode }));
              // Supplier balances
              (sup.balances || []).forEach(s => rows.push({ section: 'Supplier Balance', label: s.supplier, total_purchases: s.total_cost, total_paid: s.total_paid, outstanding: s.outstanding }));
              quickDownload(rows, [
                { key: 'section', label: 'Section' }, { key: 'date', label: 'Date' }, { key: 'label', label: 'Label' },
                { key: 'description', label: 'Description' }, { key: 'sales', label: 'Sales' }, { key: 'expenditure', label: 'Expenditure' },
                { key: 'bank_deposits', label: 'Bank Deposits' }, { key: 'bank_withdrawals', label: 'Bank Withdrawals' },
                { key: 'supplier_cash', label: 'Supplier Cash' }, { key: 'opening', label: 'Opening' }, { key: 'closing', label: 'Closing' },
                { key: 'amount', label: 'Amount' }, { key: 'payment_mode', label: 'Payment Mode' },
                { key: 'total_purchases', label: 'Total Purchases' }, { key: 'total_paid', label: 'Total Paid' }, { key: 'outstanding', label: 'Outstanding' }
              ], 'audit');
            }} label="Download Audit PDF" />
          </div>
        </div>

        {/* ── Cash Flow Section ── */}
        {auditSection === 'cashFlow' && (
          <div className="space-y-4">
            {/* Period Totals */}
            <div className="card">
              <h3 className="text-base font-bold text-gray-800 mb-4 flex items-center gap-2">
                <IndianRupee className="h-4 w-4 text-indigo-600" /> Cash Flow Summary
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 text-center">
                {[
                  { label: 'Total Sales', value: summary.total_sales, color: 'text-green-700 bg-green-50' },
                  { label: 'Expenditure', value: summary.total_expenditure, color: 'text-red-700 bg-red-50' },
                  { label: 'Bank Deposits', value: summary.total_bank_deposits, color: 'text-blue-700 bg-blue-50' },
                  { label: 'Bank Withdrawals', value: summary.total_bank_withdrawals, color: 'text-amber-700 bg-amber-50' },
                  { label: 'Supplier Cash', value: summary.total_supplier_cash, color: 'text-purple-700 bg-purple-50' },
                  { label: 'Net Cash Movement', value: (summary.total_sales || 0) - (summary.total_expenditure || 0) - (summary.total_bank_deposits || 0) + (summary.total_bank_withdrawals || 0) - (summary.total_supplier_cash || 0), color: 'text-slate-700 bg-slate-50' }
                ].map((item, i) => (
                  <div key={i} className={`rounded-xl p-3 ${item.color}`}>
                    <p className="text-xs font-medium opacity-80">{item.label}</p>
                    <p className="text-lg font-bold">₹{formatCurrency(item.value)}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Day-wise Breakdown */}
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-bold text-gray-800">Day-wise Cash Flow</h3>
                <FilterSelect value={statusFilter} onChange={setStatusFilter} label="Status" options={['verified', 'variance', 'pending']} />
              </div>
              <div className="table-container">
                <table className="table text-sm">
                  <thead>
                    <tr>
                      <SortableHeader label="Date" sortKey="business_date" sortConfig={cfDailySort} onSort={sortCfDaily} />
                      <SortableHeader label="Opening" sortKey="opening_balance" sortConfig={cfDailySort} onSort={sortCfDaily} />
                      <th className="text-green-700">+ Sales</th>
                      <th className="text-red-700">- Expenditure</th>
                      <th className="text-blue-700">- To Bank</th>
                      <th className="text-amber-700">+ From Bank</th>
                      <th className="text-purple-700">- Supplier Cash</th>
                      <SortableHeader label="Closing" sortKey="closing_balance" sortConfig={cfDailySort} onSort={sortCfDaily} />
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedCfDaily.filter(d => {
                      if (statusFilter === 'all') return true;
                      if (statusFilter === 'verified') return d.reviewed && !(d.variance && Math.abs(d.variance) >= 1);
                      if (statusFilter === 'variance') return d.reviewed && d.variance && Math.abs(d.variance) >= 1;
                      if (statusFilter === 'pending') return !d.reviewed;
                      return true;
                    }).map((d) => (
                      <tr key={d.business_date} className={d.variance && Math.abs(d.variance) >= 1 ? 'bg-red-50' : ''}>
                        <td className="font-medium whitespace-nowrap">{d.business_date}</td>
                        <td>₹{formatCurrency(d.opening_balance)}</td>
                        <td className="text-green-700">₹{formatCurrency(d.sales)}</td>
                        <td className="text-red-700">₹{formatCurrency(d.expenditure)}</td>
                        <td className="text-blue-700">₹{formatCurrency(d.bank_deposits)}</td>
                        <td className="text-amber-700">₹{formatCurrency(d.bank_withdrawals)}</td>
                        <td className="text-purple-700">₹{formatCurrency(d.supplier_payments_cash)}</td>
                        <td className="font-semibold">₹{formatCurrency(d.closing_balance)}</td>
                        <td>
                          {d.reviewed ? (
                            d.variance && Math.abs(d.variance) >= 1 ? (
                              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                                <XCircle className="h-3 w-3" /> ₹{formatCurrency(Math.abs(d.variance))} variance
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                                <CheckCircle className="h-3 w-3" /> Verified
                              </span>
                            )
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                              <AlertTriangle className="h-3 w-3" /> Pending
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {(cf.daily || []).length === 0 && <div className="text-center py-8 text-gray-400">No data for selected period</div>}
              </div>
            </div>
          </div>
        )}

        {/* ── Payment Mode Section ── */}
        {auditSection === 'paymentModes' && (
          <div className="space-y-4">
            {/* Sales breakdown by payment mode */}
            <div className="card">
              <h3 className="text-base font-bold text-gray-800 mb-4 flex items-center gap-2">
                <ShoppingCart className="h-4 w-4 text-indigo-600" /> Sales by Payment Mode
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {(pm.salesByMode || []).map((m) => (
                  <div key={m.payment_mode} className={`rounded-xl p-4 border-2 ${
                    m.payment_mode === 'cash' ? 'border-green-200 bg-green-50' :
                    m.payment_mode === 'upi' ? 'border-purple-200 bg-purple-50' :
                    'border-blue-200 bg-blue-50'
                  }`}>
                    <p className="text-xs font-semibold uppercase tracking-wide opacity-70">{m.payment_mode}</p>
                    <p className="text-2xl font-bold mt-1">₹{formatCurrency(m.total_amount)}</p>
                    <p className="text-xs mt-1 opacity-60">{m.transaction_count} transactions</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Cross-verification */}
            <div className="card">
              <h3 className="text-base font-bold text-gray-800 mb-4 flex items-center gap-2">
                <Shield className="h-4 w-4 text-indigo-600" /> Cross-Verification: Sales vs Bank Deposits
              </h3>
              <p className="text-xs text-gray-500 mb-4">UPI and Card sales should automatically create matching bank deposit entries. Any mismatch indicates missing or extra entries.</p>
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Payment Mode</th>
                      <th>Sales Total</th>
                      <th>Bank Deposits</th>
                      <th>Difference</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(pm.crossVerification || []).map((cv) => (
                      <tr key={cv.mode} className={!cv.matched ? 'bg-red-50' : ''}>
                        <td className="font-medium uppercase">{cv.mode}</td>
                        <td>₹{formatCurrency(cv.sales_total)}</td>
                        <td>₹{formatCurrency(cv.bank_deposits)}</td>
                        <td className={cv.difference ? 'font-semibold text-red-600' : 'text-green-600'}>
                          ₹{formatCurrency(Math.abs(cv.difference))}
                        </td>
                        <td>
                          {cv.matched ? (
                            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                              <CheckCircle className="h-3 w-3" /> Matched
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                              <XCircle className="h-3 w-3" /> Mismatch
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Manual deposits */}
            <div className="card">
              <h3 className="text-base font-bold text-gray-800 mb-4">Manual Cash Deposits to Bank</h3>
              <div className="flex items-center gap-4">
                <div className="rounded-xl p-4 bg-blue-50 border border-blue-200">
                  <p className="text-xs font-semibold text-blue-600">Total Manual Deposits</p>
                  <p className="text-2xl font-bold text-blue-800">₹{formatCurrency(pm.manualDeposits?.total_amount)}</p>
                  <p className="text-xs text-blue-500 mt-1">{pm.manualDeposits?.entry_count || 0} entries</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Expenditure Section ── */}
        {auditSection === 'expenditures' && (
          <div className="space-y-4">
            {/* Category breakdown */}
            <div className="card">
              <h3 className="text-base font-bold text-gray-800 mb-4 flex items-center gap-2">
                <ClipboardList className="h-4 w-4 text-indigo-600" /> Expenditure by Category
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                {(exp.byCategory || []).map((cat) => {
                  const catColors = {
                    general: 'border-amber-200 bg-amber-50 text-amber-800',
                    bank_withdrawal: 'border-blue-200 bg-blue-50 text-blue-800',
                  };
                  return (
                    <div key={cat.category} className={`rounded-xl p-4 border-2 ${catColors[cat.category] || 'border-gray-200 bg-gray-50 text-gray-800'}`}>
                      <p className="text-xs font-semibold uppercase tracking-wide opacity-70 capitalize">{cat.category.replace(/_/g, ' ')}</p>
                      <p className="text-2xl font-bold mt-1">₹{formatCurrency(cat.total_amount)}</p>
                      <p className="text-xs mt-1 opacity-60">{cat.entry_count} entries</p>
                    </div>
                  );
                })}
              </div>
              {(exp.byCategory || []).length === 0 && <div className="text-center py-4 text-gray-400">No expenditures in this period</div>}
            </div>

            {/* Detail table */}
            <div className="card">
              <h3 className="text-base font-bold text-gray-800 mb-4">All Expenditures</h3>
              <div className="table-container">
                <table className="table text-sm">
                  <thead>
                    <tr>
                      <SortableHeader label="Date" sortKey="expense_date" sortConfig={expDetailsSort} onSort={sortExpDetails} />
                      <SortableHeader label="Description" sortKey="description" sortConfig={expDetailsSort} onSort={sortExpDetails} />
                      <SortableHeader label="Category" sortKey="category" sortConfig={expDetailsSort} onSort={sortExpDetails} />
                      <SortableHeader label="Amount" sortKey="amount" sortConfig={expDetailsSort} onSort={sortExpDetails} />
                      <SortableHeader label="Created By" sortKey="created_by_name" sortConfig={expDetailsSort} onSort={sortExpDetails} />
                      <th>Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedExpDetails.map((e) => (
                      <tr key={e.id}>
                        <td className="whitespace-nowrap">{e.expense_date}</td>
                        <td>{e.description || '-'}</td>
                        <td><span className="capitalize text-xs px-2 py-0.5 rounded-full bg-gray-100">{(e.category || 'general').replace(/_/g, ' ')}</span></td>
                        <td className="font-semibold">₹{formatCurrency(e.amount)}</td>
                        <td>{e.created_by_name || '-'}</td>
                        <td className="text-xs">{fmtDateTime(e.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {(exp.details || []).length === 0 && <div className="text-center py-8 text-gray-400">No expenditure data</div>}
              </div>
            </div>
          </div>
        )}

        {/* ── Supplier Section ── */}
        {auditSection === 'suppliers' && (
          <div className="space-y-4">
            {/* Supplier balances */}
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-bold text-gray-800 flex items-center gap-2">
                  <Truck className="h-4 w-4 text-indigo-600" /> Supplier Balances (All-Time)
                </h3>
                <FilterSelect value={statusFilter} onChange={setStatusFilter} label="Status" options={['settled', 'due']} />
              </div>
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <SortableHeader label="Supplier" sortKey="supplier" sortConfig={supBalancesSort} onSort={sortSupBalances} />
                      <SortableHeader label="Total Purchases" sortKey="total_purchases" sortConfig={supBalancesSort} onSort={sortSupBalances} />
                      <SortableHeader label="Total Paid" sortKey="total_paid" sortConfig={supBalancesSort} onSort={sortSupBalances} />
                      <SortableHeader label="Remaining Balance" sortKey="remaining_balance" sortConfig={supBalancesSort} onSort={sortSupBalances} />
                      <SortableHeader label="Purchase Count" sortKey="purchase_count" sortConfig={supBalancesSort} onSort={sortSupBalances} />
                      <SortableHeader label="Payment Count" sortKey="payment_count" sortConfig={supBalancesSort} onSort={sortSupBalances} />
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedSupBalances.filter(s => {
                      if (statusFilter === 'all') return true;
                      if (statusFilter === 'settled') return Number(s.remaining_balance) <= 0;
                      if (statusFilter === 'due') return Number(s.remaining_balance) > 0;
                      return true;
                    }).map((s, i) => (
                      <tr key={i} className={Number(s.remaining_balance) > 0 ? 'bg-amber-50' : ''}>
                        <td className="font-medium">{s.supplier}</td>
                        <td>₹{formatCurrency(s.total_purchases)}</td>
                        <td>₹{formatCurrency(s.total_paid)}</td>
                        <td className={`font-semibold ${Number(s.remaining_balance) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                          ₹{formatCurrency(s.remaining_balance)}
                        </td>
                        <td>{s.purchase_count}</td>
                        <td>{s.payment_count}</td>
                        <td>
                          {Number(s.remaining_balance) <= 0 ? (
                            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                              <CheckCircle className="h-3 w-3" /> Settled
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                              <AlertTriangle className="h-3 w-3" /> Due
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {(sup.balances || []).length === 0 && <div className="text-center py-8 text-gray-400">No supplier data</div>}
              </div>
            </div>

            {/* Supplier payment mode breakdown (in selected range) */}
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-bold text-gray-800">Supplier Payments by Mode (Selected Period)</h3>
                <FilterSelect value={paymentFilter} onChange={setPaymentFilter} label="Mode" options={['cash', 'upi', 'bank']} />
              </div>
              <div className="table-container">
                <table className="table text-sm">
                  <thead>
                    <tr>
                      <SortableHeader label="Supplier" sortKey="supplier_name" sortConfig={supPayModesSort} onSort={sortSupPayModes} />
                      <SortableHeader label="Payment Mode" sortKey="payment_mode" sortConfig={supPayModesSort} onSort={sortSupPayModes} />
                      <SortableHeader label="Amount" sortKey="total_amount" sortConfig={supPayModesSort} onSort={sortSupPayModes} />
                      <SortableHeader label="Payments" sortKey="payment_count" sortConfig={supPayModesSort} onSort={sortSupPayModes} />
                    </tr>
                  </thead>
                  <tbody>
                    {sortedSupPayModes.filter(pm => paymentFilter === 'all' || pm.payment_mode === paymentFilter).map((pm, i) => (
                      <tr key={i}>
                        <td className="font-medium">{pm.supplier_name}</td>
                        <td>
                          <span className={`capitalize text-xs px-2 py-0.5 rounded-full font-semibold ${
                            pm.payment_mode === 'cash' ? 'bg-green-100 text-green-700' :
                            pm.payment_mode === 'upi' ? 'bg-purple-100 text-purple-700' :
                            'bg-blue-100 text-blue-700'
                          }`}>{pm.payment_mode}</span>
                        </td>
                        <td className="font-semibold">₹{formatCurrency(pm.total_amount)}</td>
                        <td>{pm.payment_count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {(sup.paymentModes || []).length === 0 && <div className="text-center py-8 text-gray-400">No supplier payments in period</div>}
              </div>
            </div>

            {/* Advance payments */}
            <div className="card">
              <h3 className="text-base font-bold text-gray-800 mb-4">Advance Payments on Purchases</h3>
              <div className="table-container">
                <table className="table text-sm">
                  <thead>
                    <tr>
                      <SortableHeader label="Purchase ID" sortKey="purchase_id" sortConfig={supAdvancesSort} onSort={sortSupAdvances} />
                      <SortableHeader label="Product" sortKey="product_name" sortConfig={supAdvancesSort} onSort={sortSupAdvances} />
                      <SortableHeader label="Supplier" sortKey="supplier" sortConfig={supAdvancesSort} onSort={sortSupAdvances} />
                      <SortableHeader label="Order Total" sortKey="total_amount" sortConfig={supAdvancesSort} onSort={sortSupAdvances} />
                      <SortableHeader label="Advance Paid" sortKey="advance_amount" sortConfig={supAdvancesSort} onSort={sortSupAdvances} />
                      <SortableHeader label="Balance Due" sortKey="balance_due" sortConfig={supAdvancesSort} onSort={sortSupAdvances} />
                      <th>Status</th>
                      <SortableHeader label="Date" sortKey="purchase_date" sortConfig={supAdvancesSort} onSort={sortSupAdvances} />
                    </tr>
                  </thead>
                  <tbody>
                    {sortedSupAdvances.map((a, i) => (
                      <tr key={i}>
                        <td className="font-mono text-xs">{a.purchase_id}</td>
                        <td>
                          <p className="font-medium">{a.product_name}</p>
                          {a.variety && <p className="text-xs text-gray-500">{a.variety}</p>}
                        </td>
                        <td>{a.supplier}</td>
                        <td>₹{formatCurrency(a.total_amount)}</td>
                        <td className="font-semibold text-amber-600">₹{formatCurrency(a.advance_amount)}</td>
                        <td className={`font-semibold ${Number(a.balance_due) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                          ₹{formatCurrency(a.balance_due)}
                        </td>
                        <td>
                          <span className={`capitalize text-xs px-2 py-0.5 rounded-full font-semibold ${
                            a.purchase_status === 'delivered' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                          }`}>{a.purchase_status}</span>
                        </td>
                        <td className="text-sm whitespace-nowrap">{a.purchase_date}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {(sup.advances || []).length === 0 && <div className="text-center py-8 text-gray-400">No advance payments in period</div>}
              </div>
            </div>
          </div>
        )}

        {/* ── Bank Reconciliation Section ── */}
        {auditSection === 'bankRecon' && (
          <div className="space-y-4">
            {bankRecon.map((bank) => (
              <div key={bank.bank_account_id} className="card">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-base font-bold text-gray-800 flex items-center gap-2">
                    <Landmark className="h-4 w-4 text-indigo-600" />
                    {bank.account_name} — {bank.bank_name}
                  </h3>
                  <span className="text-lg font-bold text-indigo-700">Balance: ₹{formatCurrency(bank.current_balance)}</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                  <div className="rounded-xl p-3 bg-green-50 text-center">
                    <p className="text-xs font-semibold text-green-600">Total Deposits</p>
                    <p className="text-lg font-bold text-green-800">₹{formatCurrency(bank.total_deposits)}</p>
                  </div>
                  <div className="rounded-xl p-3 bg-red-50 text-center">
                    <p className="text-xs font-semibold text-red-600">Total Withdrawals</p>
                    <p className="text-lg font-bold text-red-800">₹{formatCurrency(bank.total_withdrawals)}</p>
                  </div>
                  <div className="rounded-xl p-3 bg-indigo-50 text-center">
                    <p className="text-xs font-semibold text-indigo-600">Net Flow</p>
                    <p className={`text-lg font-bold ${Number(bank.net_flow) >= 0 ? 'text-green-800' : 'text-red-800'}`}>
                      ₹{formatCurrency(bank.net_flow)}
                    </p>
                  </div>
                  <div className="rounded-xl p-3 bg-slate-50 text-center">
                    <p className="text-xs font-semibold text-slate-600">Current Balance</p>
                    <p className="text-lg font-bold text-slate-800">₹{formatCurrency(bank.current_balance)}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Deposit breakdown */}
                  <div className="border rounded-xl p-4">
                    <h4 className="text-sm font-bold text-green-700 mb-3 flex items-center gap-1">
                      <ArrowDownLeft className="h-3.5 w-3.5" /> Deposit Breakdown
                    </h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">From Sales (UPI/Card)</span>
                        <span className="font-semibold">₹{formatCurrency(bank.sale_deposits)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Manual Cash Deposits</span>
                        <span className="font-semibold">₹{formatCurrency(bank.manual_deposits)}</span>
                      </div>
                      <div className="border-t pt-2 flex justify-between font-bold">
                        <span>Total</span>
                        <span>₹{formatCurrency(bank.total_deposits)}</span>
                      </div>
                    </div>
                  </div>
                  {/* Withdrawal breakdown */}
                  <div className="border rounded-xl p-4">
                    <h4 className="text-sm font-bold text-red-700 mb-3 flex items-center gap-1">
                      <ArrowUpRight className="h-3.5 w-3.5" /> Withdrawal Breakdown
                    </h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">To Cash Registry</span>
                        <span className="font-semibold">₹{formatCurrency(bank.cash_registry_withdrawals)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Business Expenses</span>
                        <span className="font-semibold">₹{formatCurrency(bank.business_expense_withdrawals)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Personal</span>
                        <span className="font-semibold">₹{formatCurrency(bank.personal_withdrawals)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Supplier Payments</span>
                        <span className="font-semibold">₹{formatCurrency(bank.supplier_payment_withdrawals)}</span>
                      </div>
                      <div className="border-t pt-2 flex justify-between font-bold">
                        <span>Total</span>
                        <span>₹{formatCurrency(bank.total_withdrawals)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {bankRecon.length === 0 && (
              <div className="card text-center py-8 text-gray-400">No active bank accounts found</div>
            )}
          </div>
        )}
      </div>
    );
  };

  // ═══════════════ TRANSACTIONS TAB ═══════════════
  const renderTransactionsReport = () => {
    if (!data) return null;
    const daily = data.dailyRows || [];
    const summary = data.summary || {};

    return (
      <div className="space-y-6">
        {/* Summary */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: 'Days', value: summary.total_days, prefix: '' },
            { label: 'Sales', value: summary.total_sales, prefix: '₹' },
            { label: 'Expenditure', value: summary.total_expenditure, prefix: '₹' },
            { label: 'Bank Deposits', value: summary.total_bank_deposits, prefix: '₹' },
            { label: 'Bank Withdrawals', value: summary.total_bank_withdrawals, prefix: '₹' },
            { label: 'Supplier Cash', value: summary.total_supplier_cash, prefix: '₹' }
          ].map((s, i) => (
            <div key={i} className="rounded-xl p-3 bg-slate-50 text-center">
              <p className="text-xs font-medium text-gray-500">{s.label}</p>
              <p className="text-lg font-bold text-gray-900">{s.prefix}{s.prefix ? formatCurrency(s.value) : (s.value || 0)}</p>
            </div>
          ))}
        </div>

        {/* Daily rows with expand */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-bold text-gray-800">Daily Balance Sheets</h3>
            <DownloadBtn onClick={() => quickDownload(daily, [
              { key: 'business_date', label: 'Date' },
              { key: 'total_sales', label: 'Sales' },
              { key: 'total_expenditure', label: 'Expenditure' },
              { key: 'bank_deposits', label: 'Bank Deposits' },
              { key: 'bank_withdrawals', label: 'Bank Withdrawals' },
              { key: 'supplier_cash_payments', label: 'Supplier Cash' },
              { key: 'opening_balance', label: 'Opening' },
              { key: 'closing_balance', label: 'Closing' }
            ], 'transactions')} />
          </div>
          <div className="space-y-2">
            {daily.map((d) => (
              <div key={d.business_date} className="border rounded-xl overflow-hidden">
                <button
                  className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
                  onClick={() => setExpandedAuditDay(expandedAuditDay === d.business_date ? null : d.business_date)}
                >
                  <div className="flex items-center gap-3">
                    {expandedAuditDay === d.business_date ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    <span className="font-medium">{d.business_date}</span>
                    {d.selected_bank_account_name && (
                      <span className="text-xs text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">{d.selected_bank_account_name}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <span className="text-gray-500">Open: ₹{formatCurrency(d.opening_balance)}</span>
                    <span className="font-semibold">Close: ₹{formatCurrency(d.closing_balance)}</span>
                  </div>
                </button>
                {expandedAuditDay === d.business_date && (
                  <div className="px-4 py-3 border-t space-y-2 text-sm">
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      <div className="flex justify-between"><span className="text-gray-500">Sales:</span><span className="text-green-700 font-medium">+₹{formatCurrency(d.sales)}</span></div>
                      <div className="flex justify-between"><span className="text-gray-500">Expenditure:</span><span className="text-red-700 font-medium">-₹{formatCurrency(d.expenditure)}</span></div>
                      <div className="flex justify-between"><span className="text-gray-500">Bank Deposits:</span><span className="text-blue-700 font-medium">-₹{formatCurrency(d.bank_deposits)}</span></div>
                      <div className="flex justify-between"><span className="text-gray-500">Bank Withdrawals:</span><span className="text-amber-700 font-medium">+₹{formatCurrency(d.bank_withdrawals)}</span></div>
                      <div className="flex justify-between"><span className="text-gray-500">Supplier Cash:</span><span className="text-purple-700 font-medium">-₹{formatCurrency(d.supplier_payments_cash)}</span></div>
                    </div>
                    {d.balance_reviewed_at && (
                      <p className="text-xs text-gray-400 mt-2">Reviewed by {d.balance_reviewed_by_name} at {fmtDateTime(d.balance_reviewed_at)}</p>
                    )}
                  </div>
                )}
              </div>
            ))}
            {daily.length === 0 && <div className="text-center py-8 text-gray-400">No transaction data</div>}
          </div>
        </div>

        {/* Expenditure details */}
        {sortedTxnExpenses.length > 0 && (
          <div className="card">
            <h3 className="text-base font-bold text-gray-800 mb-4">Expenditures ({sortedTxnExpenses.length})</h3>
            <div className="table-container">
              <table className="table text-sm">
                <thead><tr>
                  <SortableHeader label="Date" sortKey="expense_date" sortConfig={txnExpSort} onSort={sortTxnExp} />
                  <SortableHeader label="Description" sortKey="description" sortConfig={txnExpSort} onSort={sortTxnExp} />
                  <SortableHeader label="Category" sortKey="category" sortConfig={txnExpSort} onSort={sortTxnExp} />
                  <SortableHeader label="Amount" sortKey="amount" sortConfig={txnExpSort} onSort={sortTxnExp} />
                  <SortableHeader label="By" sortKey="created_by_name" sortConfig={txnExpSort} onSort={sortTxnExp} />
                </tr></thead>
                <tbody>
                  {sortedTxnExpenses.map((e) => (
                    <tr key={e.id}>
                      <td className="whitespace-nowrap">{e.expense_date}</td>
                      <td>{e.description || '-'}</td>
                      <td className="capitalize text-xs">{(e.category || 'general').replace(/_/g, ' ')}</td>
                      <td className="font-semibold">₹{formatCurrency(e.amount)}</td>
                      <td>{e.created_by_name || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Bank transfers */}
        {sortedTxnBank.length > 0 && (
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-gray-800">Bank Transfers ({sortedTxnBank.length})</h3>
              <FilterSelect value={statusFilter} onChange={setStatusFilter} label="Type" options={['deposit', 'withdrawal']} />
            </div>
            <div className="table-container">
              <table className="table text-sm">
                <thead><tr>
                  <SortableHeader label="Date" sortKey="transfer_date" sortConfig={txnBankSort} onSort={sortTxnBank} />
                  <SortableHeader label="Account" sortKey="account_name" sortConfig={txnBankSort} onSort={sortTxnBank} />
                  <th>Type</th>
                  <SortableHeader label="Source" sortKey="source_type" sortConfig={txnBankSort} onSort={sortTxnBank} />
                  <SortableHeader label="Amount" sortKey="amount" sortConfig={txnBankSort} onSort={sortTxnBank} />
                  <th>Description</th>
                  <SortableHeader label="By" sortKey="created_by_name" sortConfig={txnBankSort} onSort={sortTxnBank} />
                </tr></thead>
                <tbody>
                  {sortedTxnBank.filter(bt => statusFilter === 'all' || bt.transfer_type === statusFilter).map((bt) => (
                    <tr key={bt.id}>
                      <td className="whitespace-nowrap">{bt.transfer_date}</td>
                      <td>{bt.account_name}</td>
                      <td>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                          bt.transfer_type === 'deposit' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                        }`}>{bt.transfer_type}</span>
                      </td>
                      <td className="capitalize text-xs">{(bt.source_type || 'manual').replace(/_/g, ' ')}</td>
                      <td className="font-semibold">₹{formatCurrency(bt.amount)}</td>
                      <td className="text-xs">{bt.description || '-'}</td>
                      <td>{bt.created_by_name || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Supplier payments */}
        {sortedTxnSupplier.length > 0 && (
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-gray-800">Supplier Payments ({sortedTxnSupplier.length})</h3>
              <FilterSelect value={paymentFilter} onChange={setPaymentFilter} label="Mode" options={['cash', 'upi', 'bank']} />
            </div>
            <div className="table-container">
              <table className="table text-sm">
                <thead><tr>
                  <SortableHeader label="Date" sortKey="payment_date" sortConfig={txnSupSort} onSort={sortTxnSup} />
                  <SortableHeader label="Supplier" sortKey="supplier_name" sortConfig={txnSupSort} onSort={sortTxnSup} />
                  <th>Mode</th>
                  <SortableHeader label="Amount" sortKey="amount" sortConfig={txnSupSort} onSort={sortTxnSup} />
                  <SortableHeader label="Bank" sortKey="account_name" sortConfig={txnSupSort} onSort={sortTxnSup} />
                  <th>Description</th>
                  <SortableHeader label="By" sortKey="created_by_name" sortConfig={txnSupSort} onSort={sortTxnSup} />
                </tr></thead>
                <tbody>
                  {sortedTxnSupplier.filter(sp => paymentFilter === 'all' || sp.payment_mode === paymentFilter).map((sp) => (
                    <tr key={sp.id}>
                      <td className="whitespace-nowrap">{sp.payment_date}</td>
                      <td className="font-medium">{sp.supplier_name}</td>
                      <td>
                        <span className={`capitalize text-xs px-2 py-0.5 rounded-full font-semibold ${
                          sp.payment_mode === 'cash' ? 'bg-green-100 text-green-700' :
                          sp.payment_mode === 'upi' ? 'bg-purple-100 text-purple-700' :
                          'bg-blue-100 text-blue-700'
                        }`}>{sp.payment_mode}</span>
                      </td>
                      <td className="font-semibold">₹{formatCurrency(sp.amount)}</td>
                      <td>{sp.account_name || '-'}</td>
                      <td className="text-xs">{sp.description || '-'}</td>
                      <td>{sp.created_by_name || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'daily':
        return renderDailyReport();
      case 'inventory':
        return renderInventoryReport();
      case 'purchases':
        return renderPurchasesReport();
      case 'performance':
        return renderPerformanceReport();
      case 'customerSales':
        return renderCustomerSalesArchive();
      case 'suppliers':
        return renderSuppliersReport();
      case 'audit':
        return renderAuditReport();
      case 'transactions':
        return renderTransactionsReport();
      case 'gst':
        return renderGSTReport();
      case 'profitLoss':
        return renderProfitLossReport();
      default:
        return null;
    }
  };

  const renderGSTReport = () => {
    const sales = data?.sales || data?.dailySales || [];
    const gstMap = {};
    sales.forEach(s => {
      const rate = s.gst_percent || 0;
      if (!gstMap[rate]) gstMap[rate] = { rate, taxable: 0, cgst: 0, sgst: 0, total_tax: 0, count: 0 };
      const taxable = (s.total_amount || 0) - (s.tax_amount || 0);
      gstMap[rate].taxable += taxable;
      gstMap[rate].cgst += (s.tax_amount || 0) / 2;
      gstMap[rate].sgst += (s.tax_amount || 0) / 2;
      gstMap[rate].total_tax += (s.tax_amount || 0);
      gstMap[rate].count++;
    });
    const gstRows = Object.values(gstMap).sort((a, b) => a.rate - b.rate);
    const totals = gstRows.reduce((acc, r) => ({ taxable: acc.taxable + r.taxable, cgst: acc.cgst + r.cgst, sgst: acc.sgst + r.sgst, total_tax: acc.total_tax + r.total_tax }), { taxable: 0, cgst: 0, sgst: 0, total_tax: 0 });

    return (
      <div className="space-y-6">
        <div className="card">
          <h3 className="text-lg font-bold text-gray-900 mb-4">GST Summary</h3>
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>GST Rate</th>
                  <th className="text-right">Taxable Amount</th>
                  <th className="text-right">CGST</th>
                  <th className="text-right">SGST</th>
                  <th className="text-right">Total Tax</th>
                  <th className="text-right">Transactions</th>
                </tr>
              </thead>
              <tbody>
                {gstRows.map(r => (
                  <tr key={r.rate}>
                    <td className="font-medium">{r.rate}%</td>
                    <td className="text-right">₹{formatCurrency(r.taxable)}</td>
                    <td className="text-right">₹{formatCurrency(r.cgst)}</td>
                    <td className="text-right">₹{formatCurrency(r.sgst)}</td>
                    <td className="text-right font-medium">₹{formatCurrency(r.total_tax)}</td>
                    <td className="text-right">{r.count}</td>
                  </tr>
                ))}
                {gstRows.length === 0 && <tr><td colSpan="6" className="text-center text-gray-400 py-8">No GST data for selected period</td></tr>}
              </tbody>
              {gstRows.length > 0 && (
                <tfoot className="bg-gray-50 font-semibold">
                  <tr>
                    <td>Total</td>
                    <td className="text-right">₹{formatCurrency(totals.taxable)}</td>
                    <td className="text-right">₹{formatCurrency(totals.cgst)}</td>
                    <td className="text-right">₹{formatCurrency(totals.sgst)}</td>
                    <td className="text-right">₹{formatCurrency(totals.total_tax)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </div>
    );
  };

  const renderProfitLossReport = () => {
    if (!data) return <div className="text-center py-12 text-gray-400">Select a date range and load the report</div>;
    const fmt = (v) => formatCurrency(v);
    const marginClass = (v) => Number(v) >= 0 ? 'text-green-600' : 'text-red-600';

    return (
      <div className="space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="card !py-4">
            <p className="text-xs text-gray-500 uppercase">Revenue</p>
            <p className="text-xl font-bold text-gray-900">₹{fmt(data.revenue?.total_revenue)}</p>
            <p className="text-xs text-gray-400">{data.revenue?.total_transactions} transactions</p>
          </div>
          <div className="card !py-4">
            <p className="text-xs text-gray-500 uppercase">COGS</p>
            <p className="text-xl font-bold text-gray-900">₹{fmt(data.cost_of_goods_sold)}</p>
          </div>
          <div className="card !py-4">
            <p className="text-xs text-gray-500 uppercase">Gross Profit</p>
            <p className={`text-xl font-bold ${marginClass(data.gross_profit)}`}>₹{fmt(data.gross_profit)}</p>
            <p className="text-xs text-gray-400">{data.gross_margin_percent}% margin</p>
          </div>
          <div className="card !py-4">
            <p className="text-xs text-gray-500 uppercase">Net Profit</p>
            <p className={`text-xl font-bold ${marginClass(data.net_profit)}`}>₹{fmt(data.net_profit)}</p>
            <p className="text-xs text-gray-400">{data.net_margin_percent}% margin</p>
          </div>
        </div>

        {/* P&L Statement */}
        <div className="card">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Profit & Loss Statement</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between py-2 border-b"><span>Total Revenue</span><span className="font-medium">₹{fmt(data.revenue?.total_revenue)}</span></div>
            <div className="flex justify-between py-2 border-b text-gray-500 pl-4"><span>Less: Discounts</span><span>₹{fmt(data.revenue?.total_discounts)}</span></div>
            <div className="flex justify-between py-2 border-b text-gray-500 pl-4"><span>Tax Collected</span><span>₹{fmt(data.revenue?.total_tax_collected)}</span></div>
            <div className="flex justify-between py-2 border-b"><span>Cost of Goods Sold</span><span className="font-medium">₹{fmt(data.cost_of_goods_sold)}</span></div>
            <div className={`flex justify-between py-2 border-b font-semibold ${marginClass(data.gross_profit)}`}><span>Gross Profit</span><span>₹{fmt(data.gross_profit)} ({data.gross_margin_percent}%)</span></div>
            <div className="flex justify-between py-2 border-b"><span>Operating Expenses</span><span className="font-medium">₹{fmt(data.operating_expenses?.total)}</span></div>
            {data.operating_expenses?.breakdown?.map(exp => (
              <div key={exp.category} className="flex justify-between py-1 text-gray-500 pl-4"><span>{exp.category} ({exp.count})</span><span>₹{fmt(exp.total)}</span></div>
            ))}
            <div className="flex justify-between py-2 border-b"><span>Sales Returns / Refunds</span><span className="font-medium">₹{fmt(data.returns?.total_refunds)} ({data.returns?.return_count})</span></div>
            <div className={`flex justify-between py-3 text-lg font-bold ${marginClass(data.net_profit)}`}><span>Net Profit</span><span>₹{fmt(data.net_profit)} ({data.net_margin_percent}%)</span></div>
          </div>
        </div>

        {/* Product Margins */}
        {data.product_margins?.length > 0 && (
          <div className="card">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Product-wise Margins</h3>
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Category</th>
                    <th className="text-right">Qty Sold</th>
                    <th className="text-right">Revenue</th>
                    <th className="text-right">Cost</th>
                    <th className="text-right">Profit</th>
                    <th className="text-right">Margin %</th>
                  </tr>
                </thead>
                <tbody>
                  {data.product_margins.map(p => (
                    <tr key={p.id}>
                      <td className="font-medium">{p.product_name}{p.variety ? ` (${p.variety})` : ''}</td>
                      <td className="capitalize">{p.category}</td>
                      <td className="text-right">{p.quantity_sold} {p.unit}</td>
                      <td className="text-right">₹{fmt(p.revenue)}</td>
                      <td className="text-right">₹{fmt(p.cost)}</td>
                      <td className={`text-right font-medium ${marginClass(p.profit)}`}>₹{fmt(p.profit)}</td>
                      <td className={`text-right font-medium ${marginClass(p.margin_percent)}`}>{p.margin_percent}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  };

  const tabHasFilters = ['daily', 'performance', 'purchases', 'customerSales', 'suppliers', 'audit', 'transactions', 'gst', 'profitLoss'].includes(activeTab);

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* Header banner */}
      <div className="rounded-2xl px-7 py-5 flex items-center justify-between shadow-lg overflow-hidden relative"
           style={{background:'linear-gradient(135deg,#0f172a 0%,#1e40af 50%,#7c3aed 100%)'}}>
        <div className="absolute inset-0 opacity-10 pointer-events-none"
             style={{backgroundImage:'radial-gradient(circle at 75% 50%,#a78bfa,transparent 60%)'}} />
        <div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight">✦ Reports & Analytics</h1>
          <p className="mt-0.5 text-sm text-indigo-200">Detailed business insights and performance data</p>
        </div>
        {isAdmin && <ReportDownloader />}
      </div>

      {/* Tabs */}
      <div className="card !p-2">
        <nav className="flex flex-wrap gap-1">
          {[
            { id: 'daily', label: 'Daily Sales', icon: Calendar },
            { id: 'inventory', label: 'Inventory', icon: Package },
            { id: 'purchases', label: 'Purchases', icon: Truck },
            { id: 'performance', label: 'Performance', icon: TrendingUp },
            { id: 'customerSales', label: 'Sales Archive', icon: Users },
            { id: 'suppliers', label: 'Suppliers', icon: Truck },
            { id: 'transactions', label: 'Transactions', icon: ClipboardList },
            { id: 'audit', label: 'Audit', icon: Shield },
            { id: 'gst', label: 'GST', icon: IndianRupee },
            { id: 'profitLoss', label: 'P&L', icon: TrendingUp }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id); setStatusFilter('all'); setPaymentFilter('all'); }}
              className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                activeTab === tab.id
                  ? 'text-white shadow-md'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
              }`}
              style={activeTab === tab.id ? {background:'linear-gradient(135deg,#3b82f6,#6366f1)',boxShadow:'0 2px 8px rgba(99,102,241,0.35)'} : {}}
            >
              <tab.icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Filters */}
      {tabHasFilters && (
        <div className="card !py-4">
          <div className="flex flex-wrap gap-4 items-end">
            {activeTab === 'daily' && (
              <>
                <div>
                  <label className="block text-xs font-semibold text-indigo-600 uppercase tracking-wide mb-1.5">From</label>
                  <input type="date" className="input-field" value={startDate}
                    onChange={(e) => setStartDate(e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-indigo-600 uppercase tracking-wide mb-1.5">To</label>
                  <input type="date" className="input-field" value={endDate}
                    onChange={(e) => setEndDate(e.target.value)} />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const today = getISTDateString();
                    setStartDate(today);
                    setEndDate(today);
                  }}
                  className="btn-secondary !py-2"
                >
                  Today
                </button>
              </>
            )}
            {(activeTab === 'performance' || activeTab === 'purchases' || activeTab === 'customerSales' || activeTab === 'suppliers' || activeTab === 'audit' || activeTab === 'transactions') && (
              <>
                <div>
                  <label className="block text-xs font-semibold text-indigo-600 uppercase tracking-wide mb-1.5">From</label>
                  <input type="date" className="input-field" value={startDate}
                    onChange={(e) => setStartDate(e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-indigo-600 uppercase tracking-wide mb-1.5">To</label>
                  <input type="date" className="input-field" value={endDate}
                    onChange={(e) => setEndDate(e.target.value)} />
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 px-4 py-3 text-red-700 text-sm"
             style={{background:'linear-gradient(90deg,#fff5f5,#fef2f2)'}}>
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center h-64 gap-3">
          <div className="relative h-12 w-12">
            <div className="absolute inset-0 rounded-full border-4 border-indigo-100"></div>
            <div className="absolute inset-0 rounded-full border-4 border-t-indigo-500 animate-spin"></div>
          </div>
          <p className="text-sm text-indigo-400 font-medium">Loading report...</p>
        </div>
      ) : (
        renderContent()
      )}

      <SharedModal
        isOpen={deleteModal.open}
        onClose={() => setDeleteModal({ open: false, id: null, label: '' })}
        title="Delete Archive Record"
        type="warning"
        confirmText="Delete"
        onConfirm={handleDeleteArchive}
      >
        <p>Are you sure you want to delete this record?</p>
        <p className="mt-1 font-medium text-gray-900">{deleteModal.label}</p>
        <p className="mt-2 text-xs text-gray-500">This action cannot be undone.</p>
      </SharedModal>
    </div>
  );
};

export default Reports;
