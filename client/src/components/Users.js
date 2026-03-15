import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import SharedModal from './shared/Modal';
import useSortableData from '../hooks/useSortableData';
import SortableHeader from './shared/SortableHeader';

const Users = () => {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [loginLogs, setLoginLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [actionError, setActionError] = useState('');
  const [success, setSuccess] = useState('');

  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('operator');
  const [creating, setCreating] = useState(false);
  const [deleteConfirmModal, setDeleteConfirmModal] = useState({ open: false, user: null });

  const canManage = useMemo(() => user?.role === 'admin', [user]);
  const { sortedItems: sortedUsers, sortConfig: usersSort, requestSort: sortUsers } = useSortableData(users);
  const { sortedItems: sortedLogs, sortConfig: logsSort, requestSort: sortLogs } = useSortableData(loginLogs);

  const fetchUsers = async () => {
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
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchLoginLogs = async () => {
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
  };

  useEffect(() => {
    if (canManage) fetchLoginLogs();
  }, [canManage]);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!canManage) return;

    setCreating(true);
    setActionError('');
    setSuccess('');
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Users</h1>
        <p className="text-sm text-gray-600 mt-1">Admin can create users, disable/enable access, and delete users.</p>
      </div>

      {actionError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
          {actionError}
        </div>
      )}

      {success && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-md text-green-700 text-sm">
          {success}
        </div>
      )}

      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Create User</h2>

        <form className="grid grid-cols-1 md:grid-cols-3 gap-4" onSubmit={handleCreate}>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
            <input
              type="text"
              required
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              className="input-field"
              placeholder="username"
              disabled={!canManage || creating}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              type="password"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="input-field"
              placeholder="password"
              disabled={!canManage || creating}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value)}
              className="input-field"
              disabled={!canManage || creating}
            >
              <option value="operator">operator</option>
              <option value="admin">admin</option>
            </select>
          </div>

          <div className="md:col-span-3">
            <button
              type="submit"
              className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={!canManage || creating}
            >
              {creating ? 'Creating...' : 'Create User'}
            </button>
          </div>
        </form>
      </div>

      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium text-gray-900">All Users</h2>
          <button
            type="button"
            onClick={fetchUsers}
            className="px-3 py-2 text-sm rounded-md border border-gray-300 hover:bg-gray-50"
            disabled={loading}
          >
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="text-sm text-gray-600">Loading...</div>
        ) : users.length === 0 ? (
          <div className="text-sm text-gray-600">No users found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <SortableHeader label="Username" sortKey="username" sortConfig={usersSort} onSort={sortUsers} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" />
                  <SortableHeader label="Role" sortKey="role" sortConfig={usersSort} onSort={sortUsers} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" />
                  <SortableHeader label="Status" sortKey="is_active" sortConfig={usersSort} onSort={sortUsers} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" />
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {sortedUsers.map((u) => (
                  <tr key={u.id}>
                    <td className="px-4 py-3 text-sm text-gray-900">{u.username}</td>
                    <td className="px-4 py-3 text-sm text-gray-700 capitalize">{u.role}</td>
                    <td className="px-4 py-3 text-sm">
                      <span
                        className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${
                          u.is_active === 1 ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {u.is_active === 1 ? 'Active' : 'Disabled'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-right space-x-2">
                      <button
                        type="button"
                        className="px-3 py-2 text-xs rounded-md border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        onClick={() => handleToggleStatus(u)}
                        disabled={!canManage || u.id === user?.id}
                        title={u.id === user?.id ? 'You cannot change your own status' : ''}
                      >
                        {u.is_active === 1 ? 'Disable' : 'Enable'}
                      </button>
                      <button
                        type="button"
                        className="px-3 py-2 text-xs rounded-md border border-red-300 text-red-700 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        onClick={() => handleDelete(u)}
                        disabled={!canManage || u.id === user?.id}
                        title={u.id === user?.id ? 'You cannot delete your own account' : ''}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {canManage && (
        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-medium text-gray-900">Login History</h2>
            <button
              type="button"
              onClick={fetchLoginLogs}
              className="px-3 py-2 text-sm rounded-md border border-gray-300 hover:bg-gray-50"
              disabled={logsLoading}
            >
              Refresh
            </button>
          </div>

          {logsLoading ? (
            <div className="text-sm text-gray-600">Loading login logs...</div>
          ) : loginLogs.length === 0 ? (
            <div className="text-sm text-gray-600">No login history found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <SortableHeader label="User" sortKey="username" sortConfig={logsSort} onSort={sortLogs} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" />
                    <SortableHeader label="Role" sortKey="role" sortConfig={logsSort} onSort={sortLogs} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" />
                    <SortableHeader label="Login Time" sortKey="logged_in_at" sortConfig={logsSort} onSort={sortLogs} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" />
                    <SortableHeader label="IP Address" sortKey="ip" sortConfig={logsSort} onSort={sortLogs} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" />
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User Agent</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {sortedLogs.map((log) => (
                    <tr key={log.id}>
                      <td className="px-4 py-3 text-sm text-gray-900">{log.username}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 capitalize">{log.role}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        {new Date(log.logged_in_at).toLocaleString('en-IN', {
                          timeZone: 'Asia/Kolkata',
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                          hour12: true
                        })}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">{log.ip}</td>
                      <td className="px-4 py-3 text-sm text-gray-500 max-w-xs truncate" title={log.user_agent}>{log.user_agent}</td>
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
    </div>
  );
};

export default Users;
