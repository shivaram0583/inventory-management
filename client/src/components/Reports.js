import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import SharedModal from './shared/Modal';
import { 
  FileText, 
  Calendar, 
  TrendingUp, 
  Package, 
  IndianRupee,
  Download,
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
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleteModal, setDeleteModal] = useState({ open: false, id: null, label: '' });

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

  useEffect(() => {
    fetchReportData();
  }, [activeTab, selectedDate, startDate, endDate]);

  const fetchReportData = async () => {
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
  };

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
                  <th>Product</th>
                  <th>Variety</th>
                  <th>Quantity Sold</th>
                  <th>Total Amount</th>
                  <th>Transactions</th>
                </tr>
              </thead>
              <tbody>
                {(data.sales || []).map((sale, index) => (
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
                  <th>Customer</th>
                  <th>Mobile</th>
                  <th>Address</th>
                  <th>Item</th>
                  <th>Quantity</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                {(data.customerSales || []).map((cs, idx) => (
                  <tr key={idx}>
                    <td className="font-medium">{cs.customer_name || '-'}</td>
                    <td>{cs.customer_mobile || '-'}</td>
                    <td>{cs.customer_address || '-'}</td>
                    <td>{cs.product_name}</td>
                    <td>{cs.quantity}</td>
                    <td className="text-sm">
                      {new Date(cs.sale_date).toLocaleTimeString('en-IN', {
                        timeZone: 'Asia/Kolkata',
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: true
                      })}
                    </td>
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
                  <th>Product ID</th>
                  <th>Name</th>
                  <th>Variety</th>
                  <th>Category</th>
                  <th>Stock</th>
                  <th>Value</th>
                </tr>
              </thead>
              <tbody>
                {(data.products || []).map((product, index) => (
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

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Top Products */}
          <div className="card">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Top Performing Products</h3>
            <div className="space-y-3">
              {(data.topProducts || []).map((product, index) => (
                <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <p className="font-medium text-gray-900">{product.product_name}</p>
                    <p className="text-sm text-gray-500">{product.variety}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-gray-900">₹{formatCurrency(product.total_revenue)}</p>
                    <p className="text-sm text-gray-500">{product.total_sold} {product.unit}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Least Selling Products */}
          <div className="card">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Least Selling Products</h3>
            <div className="space-y-3">
              {(data.leastSelling || []).map((product, index) => (
                <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <p className="font-medium text-gray-900">{product.product_name}</p>
                    <p className="text-sm text-gray-500">{product.variety}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-gray-900">₹{formatCurrency(product.total_revenue)}</p>
                    <p className="text-sm text-gray-500">{product.total_sold} {product.unit}</p>
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

    return (
      <div className="space-y-6">
        <div className="card">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Monthly Sales Trend</h3>
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Transactions</th>
                  <th>Items Sold</th>
                  <th>Revenue</th>
                </tr>
              </thead>
              <tbody>
                {(data.trend || []).map((month, index) => (
                  <tr key={index}>
                    <td className="font-medium">{month.month}</td>
                    <td>{month.transactions}</td>
                    <td>{month.items_sold}</td>
                    <td>₹{formatCurrency(month.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
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
                  <th>Purchase ID</th>
                  <th>Product</th>
                  <th>Category</th>
                  <th>Quantity</th>
                  <th>Price/Unit</th>
                  <th>Total</th>
                  <th>Supplier</th>
                  <th>Date</th>
                  <th>Added By</th>
                </tr>
              </thead>
              <tbody>
                {(data.purchases || []).map((purchase) => (
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
                    <td className="text-sm">
                      {new Date(purchase.purchase_date).toLocaleString('en-IN', {
                        timeZone: 'Asia/Kolkata',
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: true
                      })}
                    </td>
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
                  <th>Sale ID</th>
                  <th>Customer</th>
                  <th>Mobile</th>
                  <th>Address</th>
                  <th>Item</th>
                  <th>Quantity</th>
                  <th>Date</th>
                  {isAdmin && <th>Action</th>}
                </tr>
              </thead>
              <tbody>
                {records.map((r) => (
                  <tr key={r.id}>
                    <td className="text-xs font-mono">{r.sale_id}</td>
                    <td className="font-medium">{r.customer_name || '-'}</td>
                    <td>{r.customer_mobile || '-'}</td>
                    <td>{r.customer_address || '-'}</td>
                    <td>{r.product_name}</td>
                    <td>{r.quantity}</td>
                    <td className="text-sm">
                      {new Date(r.sale_date).toLocaleString('en-IN', {
                        timeZone: 'Asia/Kolkata',
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: true
                      })}
                    </td>
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
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Reports & Analytics</h1>
        <p className="mt-1 text-sm text-gray-600">View detailed reports and business insights</p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {[
            { id: 'daily', label: 'Daily Sales', icon: Calendar },
            { id: 'inventory', label: 'Inventory Status', icon: Package },
            { id: 'purchases', label: 'Purchases', icon: Truck },
            { id: 'range', label: 'Date Range', icon: Calendar },
            { id: 'performance', label: 'Product Performance', icon: TrendingUp },
            { id: 'trend', label: 'Monthly Trend', icon: BarChart3 },
            { id: 'customerSales', label: 'Sales Archive', icon: Users }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`group inline-flex items-center py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <tab.icon className="h-4 w-4 mr-2" />
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Filters */}
      <div className="card">
        <div className="flex flex-wrap gap-4 items-end">
          {activeTab === 'daily' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
              <input
                type="date"
                className="input-field"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
              />
            </div>
          )}
          
          {(activeTab === 'range' || activeTab === 'performance' || activeTab === 'purchases' || activeTab === 'customerSales') && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                <input
                  type="date"
                  className="input-field"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                <input
                  type="date"
                  className="input-field"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <p className="text-red-700">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
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
