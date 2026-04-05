import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import SharedModal from './shared/Modal';
import { Database, Download, Upload, Trash2, RefreshCw } from 'lucide-react';

const Backup = () => {
  const [backups, setBackups] = useState([]);
  const [automation, setAutomation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [actionModal, setActionModal] = useState({ open: false, title: '', message: '', type: 'success' });
  const [confirmRestore, setConfirmRestore] = useState({ open: false, filename: '' });

  const fetchBackups = useCallback(async () => {
    setLoading(true);
    try {
      const [res, automationRes] = await Promise.all([
        axios.get('/api/backup'),
        axios.get('/api/backup/automation')
      ]);
      setBackups(res.data || []);
      setAutomation(automationRes.data || null);
    } catch {
      setError('Failed to load backups');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchBackups(); }, [fetchBackups]);

  const createBackup = async () => {
    setCreating(true);
    try {
      const res = await axios.post('/api/backup/create');
      fetchBackups();
      setActionModal({ open: true, title: 'Backup Created', message: res.data?.message || 'Database backup created successfully', type: 'success' });
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create backup');
    } finally {
      setCreating(false);
    }
  };

  const downloadBackup = (filename) => {
    window.open(`/api/backup/download/${encodeURIComponent(filename)}`, '_blank');
  };

  const deleteBackup = async (filename) => {
    try {
      await axios.delete(`/api/backup/${encodeURIComponent(filename)}`);
      fetchBackups();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete backup');
    }
  };

  const restoreBackup = async () => {
    try {
      await axios.post(`/api/backup/restore/${encodeURIComponent(confirmRestore.filename)}`, { confirm: 'RESTORE' });
      setConfirmRestore({ open: false, filename: '' });
      setActionModal({ open: true, title: 'Restore Complete', message: 'Database has been restored. Please restart the server.', type: 'warning' });
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to restore backup');
      setConfirmRestore({ open: false, filename: '' });
    }
  };

  const formatSize = (bytes) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Database className="h-7 w-7 text-indigo-600" /> Backup & Restore
          </h1>
          <p className="text-sm text-gray-500 mt-1">{backups.length} backups available</p>
        </div>
        <button onClick={createBackup} disabled={creating}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 text-white font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50">
          {creating ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
          {creating ? 'Creating...' : 'Create Backup'}
        </button>
      </div>

      {automation && (
        <div className="rounded-2xl border border-indigo-100 bg-indigo-50/70 px-4 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-indigo-900">Automated Backups</h2>
              <p className="mt-1 text-sm text-indigo-700">
                {automation.enabled
                  ? `Runs every ${automation.interval_hours} hour(s) and keeps backups for ${automation.retention_days} day(s).`
                  : 'Automated backups are currently disabled by server configuration.'}
              </p>
            </div>
            {automation.enabled && (
              <div className="text-xs text-indigo-700 space-y-1">
                <p>Next run: {automation.next_run_at || '-'}</p>
                <p>Last run: {automation.last_run_at || '-'}</p>
                <p>Last backup: {automation.last_backup_filename || '-'}</p>
              </div>
            )}
          </div>
          {automation.last_error && (
            <p className="mt-3 text-sm text-red-600">Last automation error: {automation.last_error}</p>
          )}
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 px-4 py-3 text-red-700 text-sm" style={{background:'linear-gradient(90deg,#fff5f5,#fef2f2)'}}>
          ⚠ {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600" /></div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100">
              <thead className="bg-gray-50/80">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Filename</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Size</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Created</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Type</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {backups.map((b, i) => (
                  <tr key={i} className="hover:bg-indigo-50/30 transition-colors">
                    <td className="px-4 py-3 text-sm font-mono">{b.filename}</td>
                    <td className="px-4 py-3 text-sm text-right text-gray-600">{formatSize(b.size)}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{b.created_at || b.date || '-'}</td>
                    <td className="px-4 py-3 text-center text-xs text-gray-600">{b.is_automated ? 'Auto' : 'Manual'}</td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button onClick={() => downloadBackup(b.filename)} className="text-indigo-600 hover:text-indigo-800 p-1" title="Download">
                          <Download className="h-4 w-4" />
                        </button>
                        <button onClick={() => setConfirmRestore({ open: true, filename: b.filename })}
                          className="text-yellow-600 hover:text-yellow-800 p-1" title="Restore">
                          <Upload className="h-4 w-4" />
                        </button>
                        <button onClick={() => deleteBackup(b.filename)} className="text-red-600 hover:text-red-800 p-1" title="Delete">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {backups.length === 0 && (
                  <tr><td colSpan="5" className="px-4 py-12 text-center text-gray-400">No backups yet. Click "Create Backup" to get started.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <SharedModal isOpen={confirmRestore.open} onClose={() => setConfirmRestore({ open: false, filename: '' })}
        title="Confirm Restore" type="warning" confirmText="Restore" onConfirm={restoreBackup}>
        <div className="space-y-3">
          <p className="text-sm text-gray-700">Are you sure you want to restore from <strong>{confirmRestore.filename}</strong>?</p>
          <p className="text-sm text-red-600 font-medium">This will replace the current database. A safety backup will be created automatically.</p>
        </div>
      </SharedModal>

      <SharedModal isOpen={actionModal.open} onClose={() => setActionModal({...actionModal, open: false})}
        title={actionModal.title} type={actionModal.type} confirmText="OK">
        <p>{actionModal.message}</p>
      </SharedModal>
    </div>
  );
};
                  <tr><td colSpan="5" className="px-4 py-12 text-center text-gray-400">No backups yet. Click "Create Backup" to get started.</td></tr>
export default Backup;
