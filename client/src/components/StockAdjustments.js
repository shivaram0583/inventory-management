import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import SharedModal from './shared/Modal';
import { ClipboardCheck, Plus } from 'lucide-react';

const StockAdjustments = () => {
  const [adjustments, setAdjustments] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, totalPages: 0 });
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [actionModal, setActionModal] = useState({ open: false, title: '', message: '', type: 'success' });

  const [formData, setFormData] = useState({
    product_id: '', adjustment_type: 'counting_error', quantity_adjusted: 0, reason: ''
  });

  const fetchData = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const [adjRes, prodRes] = await Promise.all([
        axios.get('/api/stock-adjustments', { params: { page, limit: 50 } }),
        axios.get('/api/inventory')
      ]);
      setAdjustments(adjRes.data.data || adjRes.data || []);
      if (adjRes.data.pagination) setPagination(adjRes.data.pagination);
      setProducts(prodRes.data || []);
    } catch {
      setError('Failed to load adjustments');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleCreate = async (e) => {
    if (e?.preventDefault) e.preventDefault();
    try {
      await axios.post('/api/stock-adjustments', {
        ...formData,
        product_id: Number(formData.product_id),
        quantity_adjusted: Number(formData.quantity_adjusted)
      });
      setShowCreateModal(false);
      setFormData({ product_id: '', adjustment_type: 'counting_error', quantity_adjusted: 0, reason: '' });
      fetchData();
      setActionModal({ open: true, title: 'Adjustment Recorded', message: 'Stock adjustment has been saved', type: 'success' });
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create adjustment');
    }
  };

  const typeLabels = {
    damage: { label: 'Damage', color: 'bg-red-100 text-red-700' },
    theft: { label: 'Theft', color: 'bg-red-100 text-red-800' },
    spoilage: { label: 'Spoilage', color: 'bg-yellow-100 text-yellow-700' },
    counting_error: { label: 'Counting Error', color: 'bg-blue-100 text-blue-700' },
    other: { label: 'Other', color: 'bg-gray-100 text-gray-700' }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ClipboardCheck className="h-7 w-7 text-indigo-600" /> Stock Adjustments
          </h1>
          <p className="text-sm text-gray-500 mt-1">{pagination.total || adjustments.length} adjustments</p>
        </div>
        <button onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 text-white font-medium hover:bg-indigo-700 transition-colors">
          <Plus className="h-4 w-4" /> New Adjustment
        </button>
      </div>

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
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Product</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Type</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Qty Adjusted</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Before</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">After</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Reason</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {adjustments.map(a => {
                  const t = typeLabels[a.adjustment_type] || typeLabels.other;
                  return (
                    <tr key={a.id} className="hover:bg-indigo-50/30 transition-colors">
                      <td className="px-4 py-3 text-sm font-medium">{a.product_name || '-'}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${t.color}`}>{t.label}</span>
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-medium text-red-600">-{a.quantity_adjusted}</td>
                      <td className="px-4 py-3 text-sm text-right">{a.quantity_before}</td>
                      <td className="px-4 py-3 text-sm text-right">{a.quantity_after}</td>
                      <td className="px-4 py-3 text-sm text-gray-600 max-w-xs truncate">{a.reason}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{a.adjustment_date?.slice(0, 10)}</td>
                    </tr>
                  );
                })}
                {adjustments.length === 0 && (
                  <tr><td colSpan="7" className="px-4 py-12 text-center text-gray-400">No adjustments found</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-center gap-4 py-3 border-t border-gray-100">
              <button onClick={() => fetchData(pagination.page - 1)} disabled={pagination.page <= 1}
                className="px-3 py-1.5 rounded-lg border text-sm disabled:opacity-50 hover:bg-gray-50">Previous</button>
              <span className="text-sm text-gray-600">Page {pagination.page} of {pagination.totalPages}</span>
              <button onClick={() => fetchData(pagination.page + 1)} disabled={pagination.page >= pagination.totalPages}
                className="px-3 py-1.5 rounded-lg border text-sm disabled:opacity-50 hover:bg-gray-50">Next</button>
            </div>
          )}
        </div>
      )}

      {/* Create Modal */}
      <SharedModal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)}
        title="Record Stock Adjustment" type="info" confirmText="Save Adjustment" onConfirm={handleCreate}>
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Product *</label>
            <select required value={formData.product_id}
              onChange={e => setFormData({...formData, product_id: e.target.value})}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-indigo-500">
              <option value="">Select product...</option>
              {products.filter(p => !p.is_deleted).map(p => (
                <option key={p.id} value={p.id}>{p.product_name} {p.variety ? `(${p.variety})` : ''} - Stock: {p.quantity_available}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type *</label>
              <select value={formData.adjustment_type}
                onChange={e => setFormData({...formData, adjustment_type: e.target.value})}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-indigo-500">
                <option value="counting_error">Counting Error</option>
                <option value="damage">Damage</option>
                <option value="theft">Theft</option>
                <option value="spoilage">Spoilage</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Quantity *</label>
              <input type="number" min="1" required value={formData.quantity_adjusted}
                onChange={e => setFormData({...formData, quantity_adjusted: Number(e.target.value)})}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-indigo-500" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Reason *</label>
            <textarea required value={formData.reason}
              onChange={e => setFormData({...formData, reason: e.target.value})}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-indigo-500" rows={3}
              placeholder="Describe the reason for this adjustment..." />
          </div>
        </form>
      </SharedModal>

      <SharedModal isOpen={actionModal.open} onClose={() => setActionModal({...actionModal, open: false})}
        title={actionModal.title} type={actionModal.type} confirmText="OK">
        <p>{actionModal.message}</p>
      </SharedModal>
    </div>
  );
};

export default StockAdjustments;
