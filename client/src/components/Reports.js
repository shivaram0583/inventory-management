import React, { useState, useEffect, useCallback } from 'react';
import {
  BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { getISTDateString, fmtDateTime } from '../utils/dateUtils';
import SharedModal from './shared/Modal';
import useSortableData from '../hooks/useSortableData';
import SortableHeader from './shared/SortableHeader';
import ReportDownloader from './ReportDownloader';
import { 
  Calendar, 
  TrendingUp, 
  Package, 
  IndianRupee,
  BarChart3,
  ShoppingCart,
  Truck,
  Users,
  Trash2
} from 'lucide-react';

const Reports = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [activeTab, setActiveTab] = useState('daily');
  const [selectedDate, setSelectedDate] = useState(getISTDateString());
  const [startDate, setStartDate] = useState(getISTDateString());
  const [endDate, setEndDate] = useState(getISTDateString());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleteModal, setDeleteModal] = useState({ open: false, id: null, label: '' });

  const { sortedItems: sortedSales, sortConfig: salesSort, requestSort: sortSales } = useSortableData(data?.sales || [], { key: 'total_amount', direction: 'desc' });
  const { sortedItems: sortedCustSales, sortConfig: custSalesSort, requestSort: sortCustSales } = useSortableData(data?.customerSales || [], { key: 'sale_date', direction: 'desc' });
  const { sortedItems: sortedProducts, sortConfig: productsSort, requestSort: sortProducts } = useSortableData(data?.products || []);
  const { sortedItems: sortedPurchases, sortConfig: purchasesSort, requestSort: sortPurchases } = useSortableData(data?.purchases || [], { key: 'purchase_date', direction: 'desc' });
  const { sortedItems: sortedArchive, sortConfig: archiveSort, requestSort: sortArchive } = useSortableData(data?.records || [], { key: 'sale_date', direction: 'desc' });
  const { sortedItems: sortedTrend, sortConfig: trendSort, requestSort: sortTrend } = useSortableData(data?.trend || [], { key: 'month', direction: 'desc' });

  const formatCurrency = (value) => {
    const amount = Number(value);
    if (Number.isNaN(amount) || amount == null) return '0';
    return amount.toLocaleString('en-IN');
  };

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

  const fetchReportData = useCallback(async () => {
    setLoading(true);
    setError('');
    
    try {
      if (activeTab === 'range') {
        if (!startDate || !endDate) {
          setError('Start date and end date are required');
          setLoading(false);
          return;
        }

        const paramsRange = { start_date: startDate, end_date: endDate };
        const [salesRangeResponse, purchasesRangeResponse] = await Promise.all([
          axios.get('/api/reports/sales-range', { params: paramsRange }),
          axios.get('/api/reports/purchases', { params: paramsRange })
        ]);

        setData({
          ...salesRangeResponse.data,
          purchaseSummary: purchasesRangeResponse.data.summary,
          purchaseRecords: purchasesRangeResponse.data.purchases
        });
        return;
      }

      let url = '';
      let params = {};

      switch (activeTab) {
        case 'daily':
          url = '/api/reports/daily-sales';
          params = { date: selectedDate };
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
        case 'trend':
          url = '/api/reports/monthly-trend';
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
        default:
          url = '/api/reports/daily-sales';
          params = { date: selectedDate };
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
  }, [activeTab, selectedDate, startDate, endDate]);

  useEffect(() => {
    fetchReportData();
  }, [fetchReportData]);

  const renderDailyReport = () => {
    if (!data) return null;

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
          <h3 className="text-lg font-medium text-gray-900 mb-4">Sales Details</h3>
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

  const renderRangeReport = () => {
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
          <h3 className="text-lg font-medium text-gray-900 mb-4">Daily Breakdown</h3>
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
          <h3 className="text-lg font-medium text-gray-900 mb-4">All Products</h3>
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
                {sortedProducts.map((product, index) => (
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

  const renderTrendReport = () => {
    if (!data) return null;

    const trendChartData = (data.trend || []).map(m => ({
      month: m.month,
      revenue: Number(m.revenue),
      transactions: Number(m.transactions),
      items: Number(m.items_sold)
    }));

    return (
      <div className="space-y-6">
        {/* Revenue Area Chart */}
        {trendChartData.length > 0 && (
          <div className="card">
            <h3 className="text-base font-bold text-gray-800 mb-4 flex items-center gap-2">
              <span className="h-5 w-5 rounded bg-gradient-to-br from-blue-500 to-indigo-600 inline-flex items-center justify-center">
                <BarChart3 className="h-3 w-3 text-white" />
              </span>
              Monthly Revenue Trend
            </h3>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={trendChartData} margin={{top:8,right:16,left:8,bottom:8}}>
                <defs>
                  <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{fontSize:11}} />
                <YAxis tick={{fontSize:11}} tickFormatter={v => `₹${(v/1000).toFixed(0)}k`} />
                <Tooltip
                  formatter={(v, name) => name === 'revenue'
                    ? [`₹${Number(v).toLocaleString('en-IN')}`, 'Revenue']
                    : [v, name === 'transactions' ? 'Transactions' : 'Items Sold']}
                />
                <Legend />
                <Area type="monotone" dataKey="revenue" stroke="#6366f1" strokeWidth={2.5}
                  fill="url(#revGrad)" dot={{r:4,fill:'#6366f1'}} activeDot={{r:6}} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Transactions + Items Bar Chart */}
        {trendChartData.length > 0 && (
          <div className="card">
            <h3 className="text-base font-bold text-gray-800 mb-4 flex items-center gap-2">
              <span className="h-5 w-5 rounded bg-gradient-to-br from-emerald-500 to-teal-600 inline-flex items-center justify-center">
                <TrendingUp className="h-3 w-3 text-white" />
              </span>
              Transactions & Items Sold per Month
            </h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={trendChartData} margin={{top:4,right:16,left:8,bottom:4}}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{fontSize:11}} />
                <YAxis tick={{fontSize:11}} />
                <Tooltip />
                <Legend />
                <Bar dataKey="transactions" name="Transactions" fill="#3b82f6" radius={[4,4,0,0]} />
                <Bar dataKey="items" name="Items Sold" fill="#10b981" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Data Table */}
        <div className="card">
          <h3 className="text-base font-bold text-gray-800 mb-4">Monthly Data Table</h3>
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <SortableHeader label="Month" sortKey="month" sortConfig={trendSort} onSort={sortTrend} />
                  <SortableHeader label="Transactions" sortKey="transactions" sortConfig={trendSort} onSort={sortTrend} />
                  <SortableHeader label="Items Sold" sortKey="items_sold" sortConfig={trendSort} onSort={sortTrend} />
                  <SortableHeader label="Revenue" sortKey="revenue" sortConfig={trendSort} onSort={sortTrend} />
                </tr>
              </thead>
              <tbody>
                {sortedTrend.map((month, index) => (
                  <tr key={index}>
                    <td className="font-medium">{month.month}</td>
                    <td>{month.transactions}</td>
                    <td>{month.items_sold}</td>
                    <td>₹{formatCurrency(month.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(data.trend || []).length === 0 && (
              <div className="text-center py-8 text-gray-400">No trend data available</div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderPurchasesReport = () => {
    if (!data) return null;

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
          <h3 className="text-lg font-medium text-gray-900 mb-4">Purchase Details</h3>
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
                {sortedPurchases.map((purchase) => (
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

    return (
      <div className="space-y-6">
        <div className="card">
          <h3 className="text-lg font-medium text-gray-900 mb-4">
            <Users className="h-5 w-5 inline mr-2" />
            Sales Archive ({records.length} records)
          </h3>
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
                  <SortableHeader label="Date" sortKey="sale_date" sortConfig={archiveSort} onSort={sortArchive} />
                  {isAdmin && <th>Action</th>}
                </tr>
              </thead>
              <tbody>
                {sortedArchive.map((r) => (
                  <tr key={r.id}>
                    <td className="text-xs font-mono">{r.sale_id}</td>
                    <td className="font-medium">{r.customer_name || '-'}</td>
                    <td>{r.customer_mobile || '-'}</td>
                    <td>{r.customer_address || '-'}</td>
                    <td>{r.product_name}</td>
                    <td>{r.quantity}</td>
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
    const suppliersList = data.suppliers || [];
    const details = data.details || [];

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
          <h3 className="text-lg font-medium text-gray-900 mb-4">
            <Truck className="h-5 w-5 inline mr-2" />
            Supplier Summary
          </h3>
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Supplier</th>
                  <th>Products Supplied</th>
                  <th>Total Purchases</th>
                  <th>Total Quantity</th>
                  <th>Total Spent</th>
                  <th>First Purchase</th>
                  <th>Last Purchase</th>
                </tr>
              </thead>
              <tbody>
                {suppliersList.map((sup, idx) => (
                  <tr key={idx}>
                    <td className="font-medium">{sup.supplier}</td>
                    <td>{sup.products_supplied}</td>
                    <td>{sup.total_purchases}</td>
                    <td>{Number(sup.total_quantity || 0).toFixed(1)}</td>
                    <td className="font-medium">₹{formatCurrency(sup.total_spent)}</td>
                    <td className="text-sm">{fmtDateTime(sup.first_purchase)}</td>
                    <td className="text-sm">{fmtDateTime(sup.last_purchase)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {suppliersList.length === 0 && (
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
                  <th>Supplier</th>
                  <th>Product ID</th>
                  <th>Product</th>
                  <th>Category</th>
                  <th>Total Qty</th>
                  <th>Total Spent</th>
                  <th>Purchases</th>
                  <th>Last Purchase</th>
                </tr>
              </thead>
              <tbody>
                {details.map((d, idx) => (
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
            {details.length === 0 && (
              <div className="text-center py-8 text-gray-500">No detail data available</div>
            )}
          </div>
        </div>
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
      case 'range':
        return renderRangeReport();
      case 'performance':
        return renderPerformanceReport();
      case 'trend':
        return renderTrendReport();
      case 'customerSales':
        return renderCustomerSalesArchive();
      case 'suppliers':
        return renderSuppliersReport();
      default:
        return null;
    }
  };

  const tabHasFilters = ['daily', 'range', 'performance', 'purchases', 'customerSales', 'suppliers'].includes(activeTab);

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
            { id: 'range', label: 'Date Range', icon: Calendar },
            { id: 'performance', label: 'Performance', icon: TrendingUp },
            { id: 'trend', label: 'Monthly Trend', icon: BarChart3 },
            { id: 'customerSales', label: 'Sales Archive', icon: Users },
            { id: 'suppliers', label: 'Suppliers', icon: Truck }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
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
              <div>
                <label className="block text-xs font-semibold text-indigo-600 uppercase tracking-wide mb-1.5">Date</label>
                <input type="date" className="input-field" value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)} />
              </div>
            )}
            {(activeTab === 'range' || activeTab === 'performance' || activeTab === 'purchases' || activeTab === 'customerSales' || activeTab === 'suppliers') && (
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
