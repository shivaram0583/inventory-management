import React, { useState, useEffect } from 'react';
import { fmtTime } from '../utils/dateUtils';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import { 
  Package, 
  ShoppingCart, 
  TrendingUp, 
  AlertTriangle,
  IndianRupee,
  BarChart3,
  Users,
  Calendar
} from 'lucide-react';

const Dashboard = () => {
  const { user } = useAuth();
  const [dashboardData, setDashboardData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentTime, setCurrentTime] = useState('');

  useEffect(() => {
    fetchDashboardData();
  }, []);

  useEffect(() => {
    const updateIndiaTime = () => {
      const now = new Date();
      const indiaTime = now.toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      });
      const indiaDate = now.toLocaleDateString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      });
      setCurrentTime(`${indiaDate}, ${indiaTime}`);
    };

    updateIndiaTime();
    const interval = setInterval(updateIndiaTime, 1000);

    return () => clearInterval(interval);
  }, []);

  const fetchDashboardData = async () => {
    try {
      const endpoint = user.role === 'admin' ? '/api/dashboard/admin' : '/api/dashboard/operator';
      const response = await axios.get(endpoint);
      setDashboardData(response.data);
    } catch (error) {
      setError('Failed to load dashboard data');
      console.error('Dashboard error:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-md p-4">
        <p className="text-red-700">{error}</p>
      </div>
    );
  }

  const isAdmin = user.role === 'admin';

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {isAdmin ? 'Admin Dashboard' : 'Operator Dashboard'}
          </h1>
          <p className="mt-1 text-sm text-gray-600">
            Welcome back, {user.username}! Here's your business overview.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center space-x-2 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2">
            <Calendar className="h-5 w-5 text-blue-600" />
            <div className="text-right">
              <p className="text-xs text-blue-600 font-medium">India Time (UTC+5:30)</p>
              <p className="text-sm font-semibold text-gray-900">{currentTime}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {isAdmin ? (
          <>
            <StatCard
              title="Total Products"
              value={dashboardData.summary.total_stock.products}
              icon={Package}
              color="blue"
            />
            <StatCard
              title="Total Stock Value"
              value={`₹${dashboardData.summary.total_stock.value.toLocaleString()}`}
              icon={IndianRupee}
              color="green"
            />
            <StatCard
              title="Today's Revenue"
              value={`₹${dashboardData.summary.today_sales.revenue.toLocaleString()}`}
              icon={TrendingUp}
              color="purple"
            />
            <StatCard
              title="Low Stock Alerts"
              value={dashboardData.summary.low_stock_count}
              icon={AlertTriangle}
              color="red"
            />
          </>
        ) : (
          <>
            <StatCard
              title="Available Products"
              value={dashboardData.inventory.length}
              icon={Package}
              color="blue"
            />
            <StatCard
              title="Today's Sales"
              value={dashboardData.today_summary.transactions}
              icon={ShoppingCart}
              color="green"
            />
            <StatCard
              title="Items Sold Today"
              value={dashboardData.today_summary.items_sold}
              icon={BarChart3}
              color="purple"
            />
            <StatCard
              title="Today's Revenue"
              value={`₹${dashboardData.today_summary.revenue.toLocaleString()}`}
              icon={IndianRupee}
              color="orange"
            />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Sales */}
        {dashboardData.recent_activity?.sales && (
          <div className="card">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Recent Sales</h3>
            <div className="space-y-3">
              {dashboardData.recent_activity.sales.map((sale, index) => (
                <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{sale.product_name}</p>
                    <p className="text-xs text-gray-500">{sale.sale_id}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-gray-900">₹{sale.total_amount.toLocaleString()}</p>
                    <p className="text-xs text-gray-500">
                      {fmtTime(sale.sale_date)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Low Stock Alerts (Admin only) */}
        {isAdmin && dashboardData.alerts?.low_stock_items?.length > 0 && (
          <div className="card">
            <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
              <AlertTriangle className="h-5 w-5 text-red-500 mr-2" />
              Low Stock Alerts
            </h3>
            <div className="space-y-3">
              {dashboardData.alerts.low_stock_items.map((item, index) => (
                <div key={index} className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{item.product_name}</p>
                    {item.variety && <p className="text-xs text-gray-500">{item.variety}</p>}
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-red-600">{item.quantity_available} {item.unit}</p>
                    <p className="text-xs text-gray-500">Low stock</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Popular Items (Operator only) */}
        {!isAdmin && dashboardData.popular_items && (
          <div className="card">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Popular Items</h3>
            <div className="space-y-3">
              {dashboardData.popular_items.slice(0, 5).map((item, index) => (
                <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{item.product_name}</p>
                    {item.variety && <p className="text-xs text-gray-500">{item.variety}</p>}
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-gray-900">₹{item.selling_price}/{item.unit}</p>
                    <p className="text-xs text-gray-500">{item.quantity_available} {item.unit} available</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Category Performance (Admin only) */}
        {isAdmin && dashboardData.analytics?.category_performance && (
          <div className="card">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Category Performance</h3>
            <div className="space-y-3">
              {dashboardData.analytics.category_performance.map((category, index) => (
                <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <p className="text-sm font-medium text-gray-900 capitalize">{category.category}</p>
                    <p className="text-xs text-gray-500">{category.product_count} products</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-gray-900">₹{category.revenue.toLocaleString()}</p>
                    <p className="text-xs text-gray-500">Today's revenue</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const StatCard = ({ title, value, icon: Icon, color }) => {
  const colorClasses = {
    blue: 'border-blue-500 bg-blue-50',
    green: 'border-green-500 bg-green-50',
    purple: 'border-purple-500 bg-purple-50',
    orange: 'border-orange-500 bg-orange-50',
    red: 'border-red-500 bg-red-50'
  };

  const iconColors = {
    blue: 'text-blue-500',
    green: 'text-green-500',
    purple: 'text-purple-500',
    orange: 'text-orange-500',
    red: 'text-red-500'
  };

  return (
    <div className={`stat-card ${colorClasses[color]}`}>
      <div className="flex items-center">
        <div className="flex-shrink-0">
          <Icon className={`h-6 w-6 ${iconColors[color]}`} />
        </div>
        <div className="ml-4">
          <p className="text-sm font-medium text-gray-600">{title}</p>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
