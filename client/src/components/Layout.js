import React from 'react';
import axios from 'axios';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import SharedModal from './shared/Modal';
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  FileText,
  Users,
  LogOut,
  Store,
  Menu,
  X,
  Truck,
  ArrowLeftRight,
  Bell,
  Trash2,
  Clock3
} from 'lucide-react';

const Layout = () => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const [reviewNotifications, setReviewNotifications] = React.useState([]);
  const [showNotifications, setShowNotifications] = React.useState(false);
  const [loadingNotifications, setLoadingNotifications] = React.useState(false);

  const isAdmin = user?.role === 'admin';

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const isActive = (path) => location.pathname === path;

  const fetchReviewNotifications = React.useCallback(async () => {
    if (!isAdmin) {
      setReviewNotifications([]);
      return;
    }

    try {
      setLoadingNotifications(true);
      const res = await axios.get('/api/notifications');
      setReviewNotifications(res.data.notifications || []);
    } catch (error) {
      console.error('Failed to fetch review notifications:', error);
    } finally {
      setLoadingNotifications(false);
    }
  }, [isAdmin]);

  React.useEffect(() => {
    if (!isAdmin) {
      setReviewNotifications([]);
      return;
    }

    fetchReviewNotifications();
    const intervalId = window.setInterval(fetchReviewNotifications, 30000);
    return () => window.clearInterval(intervalId);
  }, [isAdmin, fetchReviewNotifications]);

  const handleOpenNotifications = async () => {
    setShowNotifications(true);
    await fetchReviewNotifications();
  };

  const handleDismissNotification = async (notificationId) => {
    try {
      await axios.delete(`/api/notifications/${notificationId}`);
      setReviewNotifications((prev) => prev.filter((item) => item.id !== notificationId));
    } catch (error) {
      console.error('Failed to remove notification:', error);
    }
  };

  const handleClearNotifications = async () => {
    try {
      await axios.delete('/api/notifications');
      setReviewNotifications([]);
    } catch (error) {
      console.error('Failed to clear notifications:', error);
    }
  };

  const formatNotificationDate = (value) => {
    if (!value) return 'Unknown date';

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;

    return parsed.toLocaleString('en-IN', {
      dateStyle: 'medium',
      timeStyle: 'short'
    });
  };

  const navigation = [
    {
      name: 'Dashboard',
      href: '/',
      icon: LayoutDashboard,
      current: isActive('/')
    },
    {
      name: 'Inventory',
      href: '/inventory',
      icon: Package,
      current: isActive('/inventory')
    },
    {
      name: 'Purchases',
      href: '/purchases',
      icon: Truck,
      current: isActive('/purchases')
    },
    {
      name: 'Sales',
      href: '/sales',
      icon: ShoppingCart,
      current: isActive('/sales')
    },
    {
      name: 'Transactions',
      href: '/transactions',
      icon: ArrowLeftRight,
      current: isActive('/transactions')
    },
    {
      name: 'Reports',
      href: '/reports',
      icon: FileText,
      current: isActive('/reports')
    }
  ];

  if (isAdmin) {
    navigation.push({
      name: 'Users',
      href: '/users',
      icon: Users,
      current: isActive('/users')
    });
  }

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(135deg,#f0f4ff 0%,#faf5ff 50%,#f0fdf4 100%)' }}>
      <div className={`fixed inset-0 z-40 lg:hidden ${sidebarOpen ? '' : 'pointer-events-none'}`}>
        <div
          className={`fixed inset-0 bg-indigo-950/50 backdrop-blur-sm transition-opacity duration-300 ${sidebarOpen ? 'opacity-100' : 'opacity-0'}`}
          onClick={() => setSidebarOpen(false)}
        />
        <div
          className={`relative flex-1 flex flex-col max-w-xs w-full transform transition-transform duration-300 ease-out ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
          style={{ background: 'linear-gradient(180deg,#1e1b4b 0%,#312e81 40%,#1e1b4b 100%)' }}
        >
          <div className="absolute top-0 right-0 -mr-12 pt-2">
            <button
              type="button"
              className="ml-1 flex items-center justify-center h-10 w-10 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
              onClick={() => setSidebarOpen(false)}
            >
              <X className="h-6 w-6 text-white" />
            </button>
          </div>
          <SidebarContent
            navigation={navigation}
            user={user}
            onLogout={handleLogout}
            notificationCount={reviewNotifications.length}
            onOpenNotifications={handleOpenNotifications}
          />
        </div>
      </div>

      <div className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 shadow-2xl">
        <div
          className="flex flex-col flex-grow pt-5 pb-4 overflow-y-auto"
          style={{ background: 'linear-gradient(180deg,#1e1b4b 0%,#312e81 40%,#1e1b4b 100%)' }}
        >
          <SidebarContent
            navigation={navigation}
            user={user}
            onLogout={handleLogout}
            notificationCount={reviewNotifications.length}
            onOpenNotifications={handleOpenNotifications}
          />
        </div>
      </div>

      <div className="lg:pl-64 flex flex-col flex-1">
        <div className="sticky top-0 z-10 flex-shrink-0 flex h-16 lg:hidden shadow-md" style={{ background: 'linear-gradient(90deg,#1e1b4b,#4338ca)' }}>
          <button
            type="button"
            className="px-4 text-indigo-200 hover:text-white focus:outline-none transition-colors"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-6 w-6" />
          </button>
          <div className="flex-1 flex items-center px-4 gap-3">
            <div className="h-8 w-8 rounded-xl bg-white/20 flex items-center justify-center">
              <Store className="h-5 w-5 text-white" />
            </div>
            <span className="text-lg font-bold text-white tracking-wide">SVLVT</span>
          </div>
        </div>

        <main className="flex-1">
          <div className="py-6">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <Outlet />
            </div>
          </div>
        </main>

        <footer
          className="lg:pl-0 py-3 border-t border-indigo-100/60 mt-auto"
          style={{ background: 'linear-gradient(90deg,rgba(240,244,255,0.8),rgba(250,245,255,0.8))' }}
        >
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-1">
            <p className="text-xs text-gray-400">
              Â© 2026 <span className="font-medium text-gray-500">Sri Venkata Lakshmi Vigneswara Traders</span>. All rights reserved.
            </p>
            <p className="text-xs text-gray-400">
              Developed by{' '}
              <a
                href="https://github.com/dvvshivaram"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-indigo-500 hover:text-indigo-700 transition-colors"
              >
                dvvshivaram
              </a>
              {' '}Â· dvvshivaram@gmail.com
            </p>
          </div>
        </footer>
      </div>

      <SharedModal
        isOpen={showNotifications}
        onClose={() => setShowNotifications(false)}
        title="Operator Review Notifications"
        type="info"
        confirmText={reviewNotifications.length ? 'Clear All' : 'Close'}
        onConfirm={reviewNotifications.length ? handleClearNotifications : undefined}
      >
        {loadingNotifications ? (
          <div className="py-6 text-center text-sm text-gray-400">Loading notifications...</div>
        ) : reviewNotifications.length === 0 ? (
          <div className="py-6 text-center text-sm text-gray-400">
            No operator updates are waiting for review.
          </div>
        ) : (
          <div className="space-y-3">
            {reviewNotifications.map((notification) => (
              <div
                key={notification.id}
                className="rounded-2xl border border-gray-100 bg-gradient-to-r from-slate-50 to-indigo-50/60 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{notification.title}</p>
                    <p className="mt-1 text-sm text-gray-600">{notification.description}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-gray-400">
                      <span className="font-medium text-indigo-600">{notification.actorName}</span>
                      <span className="capitalize">{notification.type}</span>
                      <span className="inline-flex items-center gap-1">
                        <Clock3 className="h-3.5 w-3.5" />
                        {formatNotificationDate(notification.createdAt)}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDismissNotification(notification.id)}
                    className="inline-flex items-center gap-1 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-500 hover:border-red-200 hover:text-red-600 transition-all"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </SharedModal>
    </div>
  );
};

const NotificationBell = ({ count, onClick, className = '' }) => {
  const displayCount = count > 99 ? '99+' : count;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative inline-flex h-8 w-8 items-center justify-center rounded-xl bg-white/10 text-indigo-100 hover:bg-white/20 hover:text-white transition-all duration-200 ${className}`}
      title="Review operator notifications"
    >
      <Bell className="h-4 w-4" />
      {count > 0 && (
        <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center shadow-md">
          {displayCount}
        </span>
      )}
    </button>
  );
};

const SidebarContent = ({ navigation, user, onLogout, notificationCount = 0, onOpenNotifications }) => {
  const showNotifications = user?.role === 'admin' && typeof onOpenNotifications === 'function';

  return (
    <>
      <div className="flex items-center justify-between flex-shrink-0 px-5 pb-4 border-b border-white/10">
        <div className="flex items-center min-w-0 flex-1">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center shadow-lg">
            <Store className="h-6 w-6 text-white" />
          </div>
          <div className="ml-3 min-w-0">
            <h1 className="text-base font-bold text-white tracking-wide">SVLVT</h1>
            <p className="mt-0.5 text-xs text-indigo-300">Inventory System</p>
          </div>
        </div>
        {showNotifications && (
          <NotificationBell
            count={notificationCount}
            onClick={onOpenNotifications}
            className="ml-4 flex-shrink-0"
          />
        )}
      </div>

      <div className="mt-6 flex-grow flex flex-col px-3">
        <nav className="flex-1 space-y-1">
          {navigation.map((item) => (
            <Link
              key={item.name}
              to={item.href}
              className={`group flex items-center px-3 py-2.5 text-sm font-medium rounded-xl transition-all duration-200 ${
                item.current
                  ? 'text-white shadow-lg'
                  : 'text-indigo-200 hover:text-white hover:bg-white/10'
              }`}
              style={item.current ? { background: 'linear-gradient(90deg,rgba(99,102,241,0.5),rgba(139,92,246,0.3))', boxShadow: '0 2px 12px rgba(99,102,241,0.4)' } : {}}
            >
              {item.current && (
                <span className="absolute left-0 w-1 h-8 rounded-r-full bg-gradient-to-b from-blue-400 to-violet-400" />
              )}
              <item.icon className={`mr-3 h-5 w-5 flex-shrink-0 transition-transform duration-200 group-hover:scale-110 ${item.current ? 'text-blue-300' : 'text-indigo-400 group-hover:text-indigo-200'}`} />
              {item.name}
            </Link>
          ))}
        </nav>

        <div className="mt-auto pt-4 border-t border-white/10">
          <div className="flex items-center px-3 py-3 rounded-xl bg-white/5 mb-2">
            <div className="h-9 w-9 rounded-full bg-gradient-to-br from-violet-400 to-indigo-500 flex items-center justify-center shadow-md text-sm font-bold text-white flex-shrink-0">
              {user?.username?.charAt(0).toUpperCase()}
            </div>
            <div className="ml-3 min-w-0">
              <p className="text-sm font-semibold text-white truncate">{user?.username}</p>
              <p className="text-xs text-indigo-300 capitalize">{user?.role}</p>
            </div>
          </div>
          <button
            onClick={onLogout}
            className="w-full flex items-center px-3 py-2.5 text-sm text-indigo-300 hover:text-white rounded-xl hover:bg-red-500/20 transition-all duration-200 group"
          >
            <LogOut className="mr-3 h-4 w-4 group-hover:translate-x-0.5 transition-transform duration-200" />
            Sign Out
          </button>
        </div>
      </div>
    </>
  );
};

export default Layout;
