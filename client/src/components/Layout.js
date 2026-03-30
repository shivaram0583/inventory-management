import React from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
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
  ArrowLeftRight
} from 'lucide-react';

const Layout = () => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = React.useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const isActive = (path) => location.pathname === path;

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

  if (user?.role === 'admin') {
    navigation.push({
      name: 'Users',
      href: '/users',
      icon: Users,
      current: isActive('/users')
    });
  }

  return (
    <div className="min-h-screen" style={{background:'linear-gradient(135deg,#f0f4ff 0%,#faf5ff 50%,#f0fdf4 100%)'}}>
      {/* Mobile sidebar overlay */}
      <div className={`fixed inset-0 z-40 lg:hidden ${sidebarOpen ? '' : 'pointer-events-none'}`}>
        <div
          className={`fixed inset-0 bg-indigo-950/50 backdrop-blur-sm transition-opacity duration-300 ${sidebarOpen ? 'opacity-100' : 'opacity-0'}`}
          onClick={() => setSidebarOpen(false)}
        />
        <div className={`relative flex-1 flex flex-col max-w-xs w-full transform transition-transform duration-300 ease-out ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
             style={{background:'linear-gradient(180deg,#1e1b4b 0%,#312e81 40%,#1e1b4b 100%)'}}>
          <div className="absolute top-0 right-0 -mr-12 pt-2">
            <button type="button"
              className="ml-1 flex items-center justify-center h-10 w-10 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
              onClick={() => setSidebarOpen(false)}>
              <X className="h-6 w-6 text-white" />
            </button>
          </div>
          <SidebarContent navigation={navigation} user={user} onLogout={handleLogout} />
        </div>
      </div>

      {/* Desktop sidebar */}
      <div className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 shadow-2xl">
        <div className="flex flex-col flex-grow pt-5 pb-4 overflow-y-auto"
             style={{background:'linear-gradient(180deg,#1e1b4b 0%,#312e81 40%,#1e1b4b 100%)'}}>
          <SidebarContent navigation={navigation} user={user} onLogout={handleLogout} />
        </div>
      </div>

      {/* Main content */}
      <div className="lg:pl-64 flex flex-col flex-1">
        {/* Mobile top bar */}
        <div className="sticky top-0 z-10 flex-shrink-0 flex h-16 lg:hidden shadow-md"
             style={{background:'linear-gradient(90deg,#1e1b4b,#4338ca)'}}>
          <button type="button"
            className="px-4 text-indigo-200 hover:text-white focus:outline-none transition-colors"
            onClick={() => setSidebarOpen(true)}>
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

        {/* Copyright footer */}
        <footer className="lg:pl-0 py-3 border-t border-indigo-100/60 mt-auto"
                style={{background:'linear-gradient(90deg,rgba(240,244,255,0.8),rgba(250,245,255,0.8))'}}>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-1">
            <p className="text-xs text-gray-400">
              © 2026 <span className="font-medium text-gray-500">Sri Venkata Lakshmi Vigneswara Traders</span>. All rights reserved.
            </p>
            <p className="text-xs text-gray-400">
              Developed by{' '}
              <a href="https://github.com/dvvshivaram" target="_blank" rel="noopener noreferrer"
                 className="font-medium text-indigo-500 hover:text-indigo-700 transition-colors">
                dvvshivaram
              </a>
              {' '}· dvvshivaram@gmail.com
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
};

const SidebarContent = ({ navigation, user, onLogout }) => {
  return (
    <>
      {/* Logo */}
      <div className="flex items-center flex-shrink-0 px-5 pb-4 border-b border-white/10">
        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center shadow-lg">
          <Store className="h-6 w-6 text-white" />
        </div>
        <div className="ml-3">
          <h1 className="text-base font-bold text-white tracking-wide">SVLVT</h1>
          <p className="text-xs text-indigo-300">Inventory System</p>
        </div>
      </div>

      {/* Nav links */}
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
              style={item.current ? {background:'linear-gradient(90deg,rgba(99,102,241,0.5),rgba(139,92,246,0.3))',boxShadow:'0 2px 12px rgba(99,102,241,0.4)'} : {}}
            >
              {item.current && (
                <span className="absolute left-0 w-1 h-8 rounded-r-full bg-gradient-to-b from-blue-400 to-violet-400" />
              )}
              <item.icon className={`mr-3 h-5 w-5 flex-shrink-0 transition-transform duration-200 group-hover:scale-110 ${item.current ? 'text-blue-300' : 'text-indigo-400 group-hover:text-indigo-200'}`} />
              {item.name}
            </Link>
          ))}
        </nav>

        {/* User profile + logout */}
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
