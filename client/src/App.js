import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { useAuth } from './contexts/AuthContext';
import Login from './components/Login';
import ForcePasswordChange from './components/ForcePasswordChange';
import Dashboard from './components/Dashboard';
import Inventory from './components/Inventory';
import Sales from './components/Sales';
import Reports from './components/Reports';
import Receipt from './components/Receipt';
import Layout from './components/Layout';
import Users from './components/Users';
import Purchases from './components/Purchases';
import Transactions from './components/Transactions';
import Customers from './components/Customers';
import Quotations from './components/Quotations';
import Returns from './components/Returns';
import StockAdjustments from './components/StockAdjustments';
import AuditLog from './components/AuditLog';
import Backup from './components/Backup';
import Warehouses from './components/Warehouses';
import Suppliers from './components/Suppliers';
import Modal from './components/shared/Modal';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }
  
  if (!user) {
    return <Navigate to="/login" />;
  }

  if (user.force_password_change) {
    return <Navigate to="/change-password" />;
  }
  
  return children;
}

function PasswordChangeRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" />;
  }

  if (!user.force_password_change) {
    return <Navigate to="/" />;
  }

  return children;
}

function AdminRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" />;
  }

  if (user.force_password_change) {
    return <Navigate to="/change-password" />;
  }

  if (user.role !== 'admin') {
    return <Navigate to="/" />;
  }

  return children;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/change-password" element={
        <PasswordChangeRoute>
          <ForcePasswordChange />
        </PasswordChangeRoute>
      } />
      <Route path="/" element={
        <ProtectedRoute>
          <Layout />
        </ProtectedRoute>
      }>
        <Route index element={<Dashboard />} />
        <Route path="inventory" element={<Inventory />} />
        <Route path="sales" element={<Sales />} />
        <Route path="purchases" element={<Purchases />} />
        <Route path="transactions" element={<Transactions />} />
        <Route path="reports" element={<Reports />} />
        <Route path="customers" element={<Customers />} />
        <Route path="quotations" element={<Quotations />} />
        <Route path="returns" element={<Returns />} />
        <Route path="stock-adjustments" element={<StockAdjustments />} />
        <Route path="warehouses" element={<Warehouses />} />
        <Route path="suppliers" element={<Suppliers />} />
        <Route path="users" element={
          <AdminRoute>
            <Users />
          </AdminRoute>
        } />
        <Route path="audit-log" element={
          <AdminRoute>
            <AuditLog />
          </AdminRoute>
        } />
        <Route path="backup" element={
          <AdminRoute>
            <Backup />
          </AdminRoute>
        } />
        <Route path="receipt/:saleId" element={<Receipt />} />
      </Route>
    </Routes>
  );
}

function SessionExpiredModal() {
  const { sessionExpired, dismissSessionExpired } = useAuth();

  return (
    <Modal
      isOpen={sessionExpired}
      onClose={dismissSessionExpired}
      title="Session Expired"
      type="warning"
      confirmText="Login Again"
      hideClose
    >
      <p>Your session has expired due to inactivity.</p>
      <p className="mt-2">Please log in again to renew your session.</p>
    </Modal>
  );
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <SessionExpiredModal />
        <AppRoutes />
      </Router>
    </AuthProvider>
  );
}

export default App;
