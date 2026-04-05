import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { ScrollText } from 'lucide-react';

const AuditLog = () => {
  const [logs, setLogs] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({ entity_type: '', action: '', start_date: '', end_date: '' });
  const [summary, setSummary] = useState(null);

  const fetchLogs = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const params = { page, limit: 50, ...filters };
      Object.keys(params).forEach(k => { if (!params[k]) delete params[k]; });
      const [logRes, sumRes] = await Promise.all([
        axios.get('/api/audit-log', { params }),
        axios.get('/api/audit-log/summary')
      ]);
      setLogs(logRes.data.data || []);
      setPagination(logRes.data.pagination || { page: 1, limit: 50, total: 0, totalPages: 0 });
      setSummary(sumRes.data);
    } catch {
      setError('Failed to load audit log');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { fetchLogs(1); }, [fetchLogs]);

  const actionColors = {
    create: 'bg-green-100 text-green-700',
    update: 'bg-blue-100 text-blue-700',
    delete: 'bg-red-100 text-red-700',
    cancel: 'bg-yellow-100 text-yellow-700',
    partial_delivery: 'bg-purple-100 text-purple-700'
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <ScrollText className="h-7 w-7 text-indigo-600" /> Audit Log
        </h1>
        <p className="text-sm text-gray-500 mt-1">{pagination.total} entries</p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 px-4 py-3 text-red-700 text-sm" style={{background:'linear-gradient(90deg,#fff5f5,#fef2f2)'}}>
          ⚠ {error}
        </div>
      )}

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {(summary.by_entity || []).slice(0, 4).map(e => (
            <div key={e.entity_type} className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
              <p className="text-xs text-gray-500 uppercase">{e.entity_type}</p>
              <p className="text-2xl font-bold text-gray-900">{e.count}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end bg-white rounded-xl border border-gray-100 p-4">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Entity Type</label>
          <select value={filters.entity_type} onChange={e => setFilters({...filters, entity_type: e.target.value})}
            className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm">
            <option value="">All</option>
            <option value="sale">Sale</option>
            <option value="purchase">Purchase</option>
            <option value="product">Product</option>
            <option value="customer">Customer</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Action</label>
          <select value={filters.action} onChange={e => setFilters({...filters, action: e.target.value})}
            className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm">
            <option value="">All</option>
            <option value="create">Create</option>
            <option value="update">Update</option>
            <option value="delete">Delete</option>
            <option value="cancel">Cancel</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">From</label>
          <input type="date" value={filters.start_date}
            onChange={e => setFilters({...filters, start_date: e.target.value})}
            className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">To</label>
          <input type="date" value={filters.end_date}
            onChange={e => setFilters({...filters, end_date: e.target.value})}
            className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm" />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600" /></div>
      ) : (
        <>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-100">
                <thead className="bg-gray-50/80">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Time</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">User</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Action</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Entity</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Entity ID</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {logs.map(log => (
                    <tr key={log.id} className="hover:bg-indigo-50/30 transition-colors">
                      <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{log.created_at}</td>
                      <td className="px-4 py-3 text-sm">{log.username || '-'}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${actionColors[log.action] || 'bg-gray-100 text-gray-700'}`}>
                          {log.action}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm">{log.entity_type}</td>
                      <td className="px-4 py-3 text-xs font-mono">{log.entity_id || '-'}</td>
                      <td className="px-4 py-3 text-xs text-gray-500 max-w-xs truncate">
                        {log.details ? (typeof log.details === 'string' ? log.details : JSON.stringify(log.details)) : '-'}
                      </td>
                    </tr>
                  ))}
                  {logs.length === 0 && (
                    <tr><td colSpan="6" className="px-4 py-12 text-center text-gray-400">No audit log entries</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <button onClick={() => fetchLogs(pagination.page - 1)} disabled={pagination.page <= 1}
                className="px-3 py-1.5 rounded-lg border text-sm disabled:opacity-50">Previous</button>
              <span className="text-sm text-gray-600">Page {pagination.page} of {pagination.totalPages}</span>
              <button onClick={() => fetchLogs(pagination.page + 1)} disabled={pagination.page >= pagination.totalPages}
                className="px-3 py-1.5 rounded-lg border text-sm disabled:opacity-50">Next</button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default AuditLog;
