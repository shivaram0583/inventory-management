import React, { useEffect, useMemo, useState, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import SharedModal from './shared/Modal';
import CustomSelect from './shared/CustomSelect';
import useSortableData from '../hooks/useSortableData';
import SortableHeader from './shared/SortableHeader';

const STRONG_PASSWORD_HINT = 'Use at least 8 characters with uppercase, lowercase, number, and special character';

const isStrongPassword = (password) => /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/.test(String(password || ''));

const Users = () => {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loginLogs, setLoginLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [actionError, setActionError] = useState('');
  const [success, setSuccess] = useState('');

  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('operator');
  const [creating, setCreating] = useState(false);
  const [deleteConfirmModal, setDeleteConfirmModal] = useState({ open: false, user: null });

  const [changePasswordModal, setChangePasswordModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newChangePassword, setNewChangePassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  const [resetPasswordModal, setResetPasswordModal] = useState({ open: false, targetUser: null });
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resettingPassword, setResettingPassword] = useState(false);

  const canManage = useMemo(() => user?.role === 'admin', [user]);
  const { sortedItems: sortedUsers, sortConfig: usersSort, requestSort: sortUsers } = useSortableData(users, { key: 'id', direction: 'desc' });
  const { sortedItems: sortedLogs, sortConfig: logsSort, requestSort: sortLogs } = useSortableData(loginLogs, { key: 'logged_in_at', direction: 'desc' });

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setActionError('');
    try {
      const res = await axios.get('/api/auth/users');
      setUsers(res.data || []);
    } catch (e) {
      setActionError(e.response?.data?.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const fetchLoginLogs = useCallback(async () => {
    if (!canManage) return;
    setLogsLoading(true);
    try {
      const res = await axios.get('/api/auth/login-logs');
      setLoginLogs(res.data || []);
    } catch (e) {
      console.error('Failed to load login logs:', e);
    } finally {
      setLogsLoading(false);
    }
  }, [canManage]);

  useEffect(() => {
    if (canManage) fetchLoginLogs();
  }, [canManage, fetchLoginLogs]);

  const handleCreate = async (e) => {
    if (e?.preventDefault) e.preventDefault();
    if (!canManage) return;

    setCreating(true);
    setActionError('');
    setSuccess('');

    if (!isStrongPassword(newPassword)) {
      setActionError(STRONG_PASSWORD_HINT);
      setCreating(false);
      return;
    }

    try {
      await axios.post('/api/auth/users', {
        username: newUsername,
        password: newPassword,
        role: newRole
      });
      setNewUsername('');
      setNewPassword('');
      setNewRole('operator');
      setSuccess('User created successfully');
      await fetchUsers();
    } catch (e2) {
      setActionError(e2.response?.data?.message || 'Failed to create user');
    } finally {
      setCreating(false);
    }
  };

  const handleToggleStatus = async (u) => {
    if (!canManage) return;

    setActionError('');
    setSuccess('');
    try {
      const nextStatus = u.is_active === 1 ? 0 : 1;
      await axios.put(`/api/auth/users/${u.id}/status`, { is_active: nextStatus });
      setSuccess('User status updated');
      await fetchUsers();
    } catch (e) {
      setActionError(e.response?.data?.message || 'Failed to update user status');
    }
  };

  const handleDelete = (u) => {
    if (!canManage) return;
    setDeleteConfirmModal({ open: true, user: u });
  };

  const confirmDelete = async () => {
    const u = deleteConfirmModal.user;
    setDeleteConfirmModal({ open: false, user: null });
    if (!u) return;

    setActionError('');
    setSuccess('');
    try {
      await axios.delete(`/api/auth/users/${u.id}`);
      setSuccess('User deleted');
      await fetchUsers();
    } catch (e) {
      setActionError(e.response?.data?.message || 'Failed to delete user');
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (!isStrongPassword(newChangePassword)) {
      setActionError(STRONG_PASSWORD_HINT);
      return;
    }
    setChangingPassword(true);
    setActionError('');
    setSuccess('');
    try {
      await axios.put('/api/auth/change-password', {
        current_password: currentPassword,
        new_password: newChangePassword
      });
      setChangePasswordModal(false);
      setCurrentPassword('');
      setNewChangePassword('');
      setSuccess('Password changed successfully');
    } catch (e2) {
      setActionError(e2.response?.data?.message || 'Failed to change password');
    } finally {
      setChangingPassword(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (!resetPasswordModal.targetUser) return;
    if (!isStrongPassword(resetNewPassword)) {
      setActionError(STRONG_PASSWORD_HINT);
      return;
    }
    setResettingPassword(true);
    setActionError('');
    setSuccess('');
    try {
      await axios.put(`/api/auth/users/${resetPasswordModal.targetUser.id}/reset-password`, {
        new_password: resetNewPassword
      });
      setResetPasswordModal({ open: false, targetUser: null });
      setResetNewPassword('');
      setSuccess(`Password reset for ${resetPasswordModal.targetUser.username}`);
    } catch (e2) {
      setActionError(e2.response?.data?.message || 'Failed to reset password');
    } finally {
      setResettingPassword(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* Header banner */}
      <div className="rounded-2xl px-7 py-5 flex items-center justify-between shadow-lg overflow-hidden relative"
           style={{background:'linear-gradient(135deg,#1e1b4b 0%,#7c3aed 60%,#a21caf 100%)'}}>
        <div className="absolute inset-0 opacity-10 pointer-events-none"
             style={{backgroundImage:'radial-gradient(circle at 80% 50%,#f0abfc,transparent 60%)'}} />
        <div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight">✦ User Management</h1>
          <p className="mt-0.5 text-sm text-purple-200">Create accounts, manage access and view login history</p>
        </div>
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => setChangePasswordModal(true)}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-white bg-white/10 border border-white/20 hover:bg-white/20 transition-all">
            Change Password
          </button>
          <div className="h-12 w-12 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center">
          <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
          </div>
        </div>
      </div>

      {actionError && (
        <div className="rounded-xl border border-red-200 px-4 py-3 text-red-700 text-sm animate-fade-in"
             style={{background:'linear-gradient(90deg,#fff5f5,#fef2f2)'}}>⚠ {actionError}</div>
      )}
      {success && (
        <div className="rounded-xl border border-emerald-200 px-4 py-3 text-emerald-700 text-sm animate-fade-in"
             style={{background:'linear-gradient(90deg,#f0fdf4,#ecfdf5)'}}>✓ {success}</div>
      )}

      {/* Create User */}
      <div className="card">
        <h2 className="text-base font-bold text-gray-800 mb-4 flex items-center gap-2">
          <span className="h-7 w-7 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-sm">
            <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" /></svg>
          </span>
          Create New User
        </h2>
        <form className="grid grid-cols-1 md:grid-cols-3 gap-4" onSubmit={handleCreate}>
          <div>
            <label className="block text-xs font-semibold text-indigo-600 uppercase tracking-wide mb-1.5">Username</label>
            <input type="text" required value={newUsername} onChange={(e) => setNewUsername(e.target.value)}
              className="input-field" placeholder="username" disabled={!canManage || creating} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-indigo-600 uppercase tracking-wide mb-1.5">Password</label>
            <input type="password" required value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
              className="input-field" placeholder="Strong password" disabled={!canManage || creating} />
            <p className="mt-1 text-xs text-gray-500">{STRONG_PASSWORD_HINT}</p>
          </div>
          <div>
            <label className="block text-xs font-semibold text-indigo-600 uppercase tracking-wide mb-1.5">Role</label>
            <CustomSelect
              options={[
                { value: 'operator', label: 'Operator' },
                { value: 'admin', label: 'Admin' },
              ]}
              value={newRole}
              onChange={(val) => setNewRole(val)}
              disabled={!canManage || creating}
            />
          </div>
          <div className="md:col-span-3">
            <button type="submit" className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={!canManage || creating}>
              {creating ? 'Creating...' : '+ Create User'}
            </button>
          </div>
        </form>
      </div>

      {/* All Users */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-gray-800 flex items-center gap-2">
            <span className="h-7 w-7 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-sm">
              <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
            </span>
            All Users
          </h2>
          <button type="button" onClick={fetchUsers} className="btn-secondary text-xs py-1.5 px-3" disabled={loading}>
            ↻ Refresh
          </button>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-indigo-400 py-4">
            <div className="h-4 w-4 rounded-full border-2 border-t-indigo-500 border-indigo-100 animate-spin"></div>Loading...
          </div>
        ) : users.length === 0 ? (
          <div className="text-sm text-gray-400 py-4">No users found.</div>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead><tr>
                <SortableHeader label="Username" sortKey="username" sortConfig={usersSort} onSort={sortUsers} />
                <SortableHeader label="Role" sortKey="role" sortConfig={usersSort} onSort={sortUsers} />
                <SortableHeader label="Status" sortKey="is_active" sortConfig={usersSort} onSort={sortUsers} />
                <th className="text-right">Actions</th>
              </tr></thead>
              <tbody>
                {sortedUsers.map((u) => (
                  <tr key={u.id}>
                    <td className="font-semibold text-gray-800">{u.username}</td>
                    <td>
                      <span className="inline-block px-2.5 py-0.5 rounded-lg text-xs font-semibold capitalize"
                            style={u.role === 'admin'
                              ? {background:'linear-gradient(90deg,#ede9fe,#e0e7ff)',color:'#6d28d9'}
                              : {background:'linear-gradient(90deg,#f0f9ff,#e0f2fe)',color:'#0369a1'}}>
                        {u.role}
                      </span>
                    </td>
                    <td>
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                        u.is_active === 1 ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'
                      }`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${
                          u.is_active === 1 ? 'bg-emerald-500' : 'bg-gray-400'
                        }`}></span>
                        {u.is_active === 1 ? 'Active' : 'Disabled'}
                      </span>
                    </td>
                    <td className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button type="button"
                          className={`px-3 py-1 text-xs rounded-lg font-medium border transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed ${
                            u.is_active === 1
                              ? 'border-orange-200 text-orange-600 hover:bg-orange-50'
                              : 'border-emerald-200 text-emerald-600 hover:bg-emerald-50'
                          }`}
                          onClick={() => handleToggleStatus(u)}
                          disabled={!canManage || u.id === user?.id}>
                          {u.is_active === 1 ? 'Disable' : 'Enable'}
                        </button>
                        <button type="button"
                          className="px-3 py-1 text-xs rounded-lg font-medium border border-red-200 text-red-600 hover:bg-red-50 transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
                          onClick={() => handleDelete(u)}
                          disabled={!canManage || u.id === user?.id}>
                          Delete
                        </button>
                        {canManage && u.id !== user?.id && (
                          <button type="button"
                            className="px-3 py-1 text-xs rounded-lg font-medium border border-amber-200 text-amber-600 hover:bg-amber-50 transition-all duration-150"
                            onClick={() => { setResetPasswordModal({ open: true, targetUser: u }); setResetNewPassword(''); }}>
                            Reset Pwd
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

      {/* Login History */}
      {canManage && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-gray-800 flex items-center gap-2">
              <span className="h-7 w-7 rounded-lg bg-gradient-to-br from-teal-500 to-cyan-600 flex items-center justify-center shadow-sm">
                <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </span>
              Login History
            </h2>
            <button type="button" onClick={fetchLoginLogs} className="btn-secondary text-xs py-1.5 px-3" disabled={logsLoading}>
              ↻ Refresh
            </button>
          </div>
          {logsLoading ? (
            <div className="flex items-center gap-2 text-sm text-indigo-400 py-4">
              <div className="h-4 w-4 rounded-full border-2 border-t-indigo-500 border-indigo-100 animate-spin"></div>Loading...
            </div>
          ) : loginLogs.length === 0 ? (
            <div className="text-sm text-gray-400 py-4">No login history found.</div>
          ) : (
            <div className="table-container">
              <table className="table">
                <thead><tr>
                  <SortableHeader label="User" sortKey="username" sortConfig={logsSort} onSort={sortLogs} />
                  <SortableHeader label="Role" sortKey="role" sortConfig={logsSort} onSort={sortLogs} />
                  <SortableHeader label="Login Time" sortKey="logged_in_at" sortConfig={logsSort} onSort={sortLogs} />
                  <SortableHeader label="IP Address" sortKey="ip" sortConfig={logsSort} onSort={sortLogs} />
                  <th>User Agent</th>
                </tr></thead>
                <tbody>
                  {sortedLogs.map((log) => (
                    <tr key={log.id}>
                      <td className="font-semibold text-gray-800">{log.username}</td>
                      <td>
                        <span className="inline-block px-2 py-0.5 rounded-lg text-xs font-semibold capitalize"
                              style={log.role === 'admin'
                                ? {background:'linear-gradient(90deg,#ede9fe,#e0e7ff)',color:'#6d28d9'}
                                : {background:'linear-gradient(90deg,#f0f9ff,#e0f2fe)',color:'#0369a1'}}>
                          {log.role}
                        </span>
                      </td>
                      <td className="text-gray-600">{new Date(log.logged_in_at).toLocaleString('en-IN', {timeZone:'Asia/Kolkata',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:true})}</td>
                      <td className="font-mono text-xs text-gray-500">{log.ip}</td>
                      <td className="text-xs text-gray-400 max-w-xs truncate" title={log.user_agent}>{log.user_agent}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      {/* Delete User Confirmation Modal */}
      <SharedModal
        isOpen={deleteConfirmModal.open}
        onClose={() => setDeleteConfirmModal({ open: false, user: null })}
        title="Delete User"
        type="warning"
        confirmText="Delete"
        onConfirm={confirmDelete}
      >
        <p>Are you sure you want to delete user <strong>"{deleteConfirmModal.user?.username}"</strong>?</p>
        <p className="mt-2">This action cannot be undone.</p>
      </SharedModal>

      {/* Change My Password Modal */}
      <SharedModal
        isOpen={changePasswordModal}
        onClose={() => { setChangePasswordModal(false); setCurrentPassword(''); setNewChangePassword(''); }}
        title="Change Password"
      >
        <form onSubmit={handleChangePassword} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Current Password</label>
            <input type="password" required className="input-field" placeholder="Enter current password"
              value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">New Password</label>
            <input type="password" required minLength={8} className="input-field" placeholder="Enter strong new password"
              value={newChangePassword} onChange={(e) => setNewChangePassword(e.target.value)} />
            <p className="mt-1 text-xs text-gray-500">{STRONG_PASSWORD_HINT}</p>
          </div>
          <button type="submit" disabled={changingPassword} className="btn-primary w-full disabled:opacity-50">
            {changingPassword ? 'Changing...' : 'Change Password'}
          </button>
        </form>
      </SharedModal>

      {/* Admin Reset Password Modal */}
      <SharedModal
        isOpen={resetPasswordModal.open}
        onClose={() => { setResetPasswordModal({ open: false, targetUser: null }); setResetNewPassword(''); }}
        title={`Reset Password for ${resetPasswordModal.targetUser?.username || ''}`}
      >
        <form onSubmit={handleResetPassword} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">New Password</label>
            <input type="password" required minLength={8} className="input-field" placeholder="Enter strong new password"
              value={resetNewPassword} onChange={(e) => setResetNewPassword(e.target.value)} />
            <p className="mt-1 text-xs text-gray-500">{STRONG_PASSWORD_HINT}</p>
          </div>
          <button type="submit" disabled={resettingPassword} className="btn-primary w-full disabled:opacity-50">
            {resettingPassword ? 'Resetting...' : 'Reset Password'}
          </button>
        </form>
      </SharedModal>
    </div>
  );
};

export default Users;
