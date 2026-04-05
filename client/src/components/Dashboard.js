import React, { useState, useEffect, useCallback } from 'react';
import { fmtDateTime, fmtTime } from '../utils/dateUtils';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import { 
  Package, 
  ShoppingCart, 
  TrendingUp, 
  AlertTriangle,
  IndianRupee,
  BarChart3,
  Calendar,
  Clock3
} from 'lucide-react';

const Dashboard = () => {
  const { user } = useAuth();
  const [dashboardData, setDashboardData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentTime, setCurrentTime] = useState('');

  const fetchDashboardData = useCallback(async () => {
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
  }, [user.role]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

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
    <div className="space-y-6 animate-fade-in-up">
      {/* Header banner */}
      <div className="rounded-2xl px-7 py-5 flex items-center justify-between shadow-lg overflow-hidden relative"
           style={{background:'linear-gradient(135deg,#1e1b4b 0%,#4338ca 50%,#6d28d9 100%)'}}>
        <div className="absolute inset-0 opacity-10 pointer-events-none"
             style={{backgroundImage:'radial-gradient(circle at 80% 50%,#a78bfa 0%,transparent 60%)'}} />
        <div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight">
            {isAdmin ? '✦ Admin Dashboard' : '✦ Operator Dashboard'}
          </h1>
          <p className="mt-0.5 text-sm text-indigo-200">
            Welcome back, <span className="font-semibold text-white">{user.username}</span>! Here's your business overview.
          </p>
        </div>
        <div className="flex items-center gap-2 bg-white/10 border border-white/20 rounded-xl px-4 py-2.5 backdrop-blur-sm">
          <Calendar className="h-5 w-5 text-indigo-200" />
          <div className="text-right">
            <p className="text-xs text-indigo-300 font-medium">India Time (IST)</p>
            <p className="text-sm font-bold text-white">{currentTime}</p>
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
          <div className="card animate-fade-in-up stagger-1">
            <h3 className="text-base font-bold text-gray-800 mb-4 flex items-center gap-2">
              <span className="h-7 w-7 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-sm">
                <ShoppingCart className="h-4 w-4 text-white" />
              </span>
              Recent Sales
            </h3>
            <div className="space-y-2">
              {dashboardData.recent_activity.sales.map((sale, index) => (
                <div key={index} className="flex items-center justify-between px-4 py-3 rounded-xl transition-all duration-200 hover:shadow-sm cursor-default"
                     style={{background:'linear-gradient(90deg,#f8faff,#f3f0ff)'}}>
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{sale.product_name}</p>
                    <p className="text-xs text-indigo-400 font-mono">{sale.sale_id}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-indigo-700">₹{sale.total_amount.toLocaleString()}</p>
                    <p className="text-xs text-gray-400">{fmtTime(sale.sale_date)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Ordered Items */}
        {dashboardData.ordered_items && (
          <div className="card animate-fade-in-up stagger-2">
            <h3 className="text-base font-bold text-gray-800 mb-4 flex items-center gap-2">
              <span className="h-7 w-7 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-sm">
                <Clock3 className="h-4 w-4 text-white" />
              </span>
              Ordered Items
            </h3>
            <div className="space-y-2">
              {dashboardData.ordered_items.length > 0 ? dashboardData.ordered_items.map((order, index) => (
                <div key={index} className="flex items-center justify-between px-4 py-3 rounded-xl transition-all duration-200 hover:shadow-sm cursor-default"
                     style={{ background: 'linear-gradient(90deg,#fff7ed,#fffbeb)' }}>
                  <div className="min-w-0 pr-3">
                    <p className="text-sm font-semibold text-gray-800">{order.product_name}</p>
                    {order.variety && <p className="text-xs text-gray-400">{order.variety}</p>}
                    <p className="text-xs text-amber-500 font-mono mt-0.5">{order.purchase_id}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {order.quantity} {order.unit}
                      {order.supplier ? ` • ${order.supplier}` : ''}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold text-amber-700">Due: ₹{Number(order.balance_due || 0).toLocaleString('en-IN')}</p>
                    <p className="text-xs text-gray-400">{fmtDateTime(order.purchase_date)}</p>
                  </div>
                </div>
              )) : (
                <div className="px-4 py-6 rounded-xl text-center text-sm text-gray-500"
                     style={{ background: 'linear-gradient(90deg,#fff7ed,#fffbeb)' }}>
                  No pending ordered items right now.
                </div>
              )}
            </div>
          </div>
        )}

        {/* Low Stock Alerts (Admin) */}
        {isAdmin && dashboardData.alerts?.low_stock_items?.length > 0 && (
          <div className="card animate-fade-in-up stagger-2">
            <h3 className="text-base font-bold text-gray-800 mb-4 flex items-center gap-2">
              <span className="h-7 w-7 rounded-lg bg-gradient-to-br from-red-500 to-rose-600 flex items-center justify-center shadow-sm">
                <AlertTriangle className="h-4 w-4 text-white" />
              </span>
              Low Stock Alerts
            </h3>
            <div className="space-y-2">
              {dashboardData.alerts.low_stock_items.map((item, index) => (
                <div key={index} className="flex items-center justify-between px-4 py-3 rounded-xl transition-all duration-200 hover:shadow-sm cursor-default"
                     style={{background:'linear-gradient(90deg,#fff5f5,#fef2f2)'}}>
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{item.product_name}</p>
                    {item.variety && <p className="text-xs text-gray-400">{item.variety}</p>}
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-red-600">{item.quantity_available} {item.unit}</p>
                    <p className="text-xs text-red-400">⚠ Low stock</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Expiry Alerts (Admin) */}
        {isAdmin && dashboardData.alerts?.expiring_items?.length > 0 && (
          <div className="card animate-fade-in-up stagger-3">
            <h3 className="text-base font-bold text-gray-800 mb-4 flex items-center gap-2">
              <span className="h-7 w-7 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-sm">
                <AlertTriangle className="h-4 w-4 text-white" />
              </span>
              Expiry Alerts
            </h3>
            <div className="space-y-2">
              {dashboardData.alerts.expiring_items.map((item, index) => {
                const daysLeft = Math.ceil((new Date(item.expiry_date) - new Date()) / (1000 * 60 * 60 * 24));
                const isExpired = daysLeft <= 0;
                return (
                  <div key={index} className="flex items-center justify-between px-4 py-3 rounded-xl transition-all duration-200 hover:shadow-sm cursor-default"
                       style={{background: isExpired ? 'linear-gradient(90deg,#fff5f5,#fef2f2)' : 'linear-gradient(90deg,#fffbeb,#fefce8)'}}>
                    <div>
                      <p className="text-sm font-semibold text-gray-800">{item.product_name}</p>
                      {item.variety && <p className="text-xs text-gray-400">{item.variety}</p>}
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-bold ${isExpired ? 'text-red-600' : 'text-amber-600'}`}>
                        {isExpired ? 'Expired' : `${daysLeft} days left`}
                      </p>
                      <p className="text-xs text-gray-400">{item.expiry_date}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Popular Items (Operator) */}
        {!isAdmin && dashboardData.popular_items && (
          <div className="card animate-fade-in-up stagger-2">
            <h3 className="text-base font-bold text-gray-800 mb-4 flex items-center gap-2">
              <span className="h-7 w-7 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-sm">
                <TrendingUp className="h-4 w-4 text-white" />
              </span>
              Popular Items
            </h3>
            <div className="space-y-2">
              {dashboardData.popular_items.slice(0, 5).map((item, index) => (
                <div key={index} className="flex items-center justify-between px-4 py-3 rounded-xl transition-all duration-200 hover:shadow-sm cursor-default"
                     style={{background:'linear-gradient(90deg,#faf5ff,#f3f0ff)'}}>
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{item.product_name}</p>
                    {item.variety && <p className="text-xs text-gray-400">{item.variety}</p>}
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-violet-700">₹{item.selling_price}/{item.unit}</p>
                    <p className="text-xs text-gray-400">{item.quantity_available} {item.unit} left</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Category Performance (Admin) */}
        {isAdmin && dashboardData.analytics?.category_performance && (
          <div className="card animate-fade-in-up stagger-3">
            <h3 className="text-base font-bold text-gray-800 mb-4 flex items-center gap-2">
              <span className="h-7 w-7 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-sm">
                <BarChart3 className="h-4 w-4 text-white" />
              </span>
              Category Performance
            </h3>
            <div className="space-y-2">
              {dashboardData.analytics.category_performance.map((category, index) => (
                <div key={index} className="flex items-center justify-between px-4 py-3 rounded-xl transition-all duration-200 hover:shadow-sm cursor-default"
                     style={{background:'linear-gradient(90deg,#f0fdf4,#ecfdf5)'}}>
                  <div>
                    <p className="text-sm font-semibold text-gray-800 capitalize">{category.category}</p>
                    <p className="text-xs text-gray-400">{category.product_count} products</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-emerald-700">₹{category.revenue.toLocaleString()}</p>
                    <p className="text-xs text-gray-400">Today's revenue</p>
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
  const gradients = {
    blue:   'linear-gradient(135deg,#3b82f6,#6366f1)',
    green:  'linear-gradient(135deg,#10b981,#059669)',
    purple: 'linear-gradient(135deg,#8b5cf6,#7c3aed)',
    orange: 'linear-gradient(135deg,#f59e0b,#ea580c)',
    red:    'linear-gradient(135deg,#ef4444,#dc2626)',
  };
  const glows = {
    blue:   'rgba(99,102,241,0.25)',
    green:  'rgba(16,185,129,0.25)',
    purple: 'rgba(139,92,246,0.25)',
    orange: 'rgba(245,158,11,0.25)',
    red:    'rgba(239,68,68,0.25)',
  };
  const bgs = {
    blue:   'linear-gradient(135deg,#eff6ff,#eef2ff)',
    green:  'linear-gradient(135deg,#f0fdf4,#ecfdf5)',
    purple: 'linear-gradient(135deg,#faf5ff,#f3e8ff)',
    orange: 'linear-gradient(135deg,#fffbeb,#fff7ed)',
    red:    'linear-gradient(135deg,#fff5f5,#fef2f2)',
  };

  return (
    <div className="stat-card animate-fade-in-up" style={{background: bgs[color]}}>
      <div className="absolute top-0 right-0 w-24 h-24 rounded-full opacity-10 pointer-events-none -translate-y-8 translate-x-8"
           style={{background: gradients[color]}} />
      <div className="flex items-center gap-4">
        <div className="h-12 w-12 rounded-2xl flex items-center justify-center shadow-lg flex-shrink-0"
             style={{background: gradients[color], boxShadow: `0 4px 14px ${glows[color]}`}}>
          <Icon className="h-6 w-6 text-white" />
        </div>
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{title}</p>
          <p className="text-2xl font-extrabold text-gray-900 leading-tight">{value}</p>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
