import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import SharedModal from './shared/Modal';
import { RotateCcw, Search, Eye } from 'lucide-react';

const Returns = () => {
  const [returns, setReturns] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, totalPages: 0 });
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedReturn, setSelectedReturn] = useState(null);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [actionModal, setActionModal] = useState({ open: false, title: '', message: '', type: 'success' });

  const [formData, setFormData] = useState({
    sale_id: '', product_id: '', quantity_returned: 1,
    reason: '', refund_mode: 'cash', bank_account_id: ''
  });

  const [saleDetails, setSaleDetails] = useState(null);

  const fetchReturns = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const [retRes, bankRes] = await Promise.all([
        axios.get('/api/returns', { params: { page, limit: 50 } }),
        axios.get('/api/transactions/bank-accounts')
      ]);
      setReturns(retRes.data?.data || retRes.data || []);
      if (retRes.data?.pagination) setPagination(retRes.data.pagination);
      setBankAccounts(bankRes.data || []);
    } catch {
      setError('Failed to load returns');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchReturns(); }, [fetchReturns]);

  const lookupSale = async () => {
    if (!formData.sale_id) return;
    try {
      const res = await axios.get(`/api/sales/${formData.sale_id}`);
      setSaleDetails(res.data);
      if (res.data.items?.length === 1) {
        setFormData({...formData, product_id: String(res.data.items[0].product_id)});
      }
    } catch {
      setError('Sale not found');
      setSaleDetails(null);
    }
  };

  const handleCreate = async (e) => {
    if (e?.preventDefault) e.preventDefault();
    try {
      await axios.post('/api/returns', {
        sale_id: formData.sale_id,
        items: [{ product_id: Number(formData.product_id), quantity: Number(formData.quantity_returned) }],
        refund_mode: formData.refund_mode,
        bank_account_id: formData.bank_account_id ? Number(formData.bank_account_id) : undefined,
        reason: formData.reason
      });
      setShowCreateModal(false);
      setFormData({ sale_id: '', product_id: '', quantity_returned: 1, reason: '', refund_mode: 'cash', bank_account_id: '' });
      setSaleDetails(null);
      fetchReturns();
      setActionModal({ open: true, title: 'Return Processed', message: 'Sales return has been recorded successfully', type: 'success' });
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to process return');
    }
  };

  const viewDetail = async (ret) => {
    try {
      const res = await axios.get(`/api/returns/${ret.return_id || ret.id}`);
      setSelectedReturn(res.data);
      setShowDetailModal(true);
    } catch {
      setError('Failed to load return details');
    }
  };

  const fmt = (v) => Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <RotateCcw className="h-7 w-7 text-indigo-600" /> Sales Returns
          </h1>
          <p className="text-sm text-gray-500 mt-1">{pagination.total || returns.length} returns</p>
        </div>
        <button onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 text-white font-medium hover:bg-indigo-700 transition-colors">
          <RotateCcw className="h-4 w-4" /> Process Return
        </button>
      </div>

      <div className="rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm text-indigo-800">
        Returns are tracked in the register below against the original <span className="font-semibold">Sale ID</span> and <span className="font-semibold">Return ID</span>. Each entry also stores refund mode, operator, date, and item-level refund values.
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
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Return ID</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Sale ID</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Customer</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Product</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Qty</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Refund</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Mode</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Date</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {returns.map(r => (
                  <tr key={r.id} className="hover:bg-indigo-50/30 transition-colors">
                    <td className="px-4 py-3 text-sm font-mono">{r.return_id}</td>
                    <td className="px-4 py-3 text-sm font-mono">
                      <p>{r.sale_id}</p>
                      <p className="text-xs text-gray-400">Receipt #{r.receipt_number || '-'}</p>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <p className="font-medium text-gray-900">{r.customer_name || 'Walk-in Customer'}</p>
                      <p className="text-xs text-gray-500">{r.customer_mobile || '-'}</p>
                    </td>
                    <td className="px-4 py-3 text-sm">{r.product_name || '-'}</td>
                    <td className="px-4 py-3 text-sm text-right">{r.quantity_returned}</td>
                    <td className="px-4 py-3 text-sm text-right font-medium text-red-600">₹{fmt(r.refund_amount)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100">{r.refund_mode}</span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      <p>{r.return_date?.slice(0, 10)}</p>
                      <p className="text-xs text-gray-400">By {r.returned_by_name || '-'}</p>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => viewDetail(r)} className="text-indigo-600 hover:text-indigo-800">
                        <Eye className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
                {returns.length === 0 && (
                  <tr><td colSpan="9" className="px-4 py-12 text-center text-gray-400">No returns found</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-center gap-4 py-3 border-t border-gray-100">
              <button onClick={() => fetchReturns(pagination.page - 1)} disabled={pagination.page <= 1}
                className="px-3 py-1.5 rounded-lg border text-sm disabled:opacity-50 hover:bg-gray-50">Previous</button>
              <span className="text-sm text-gray-600">Page {pagination.page} of {pagination.totalPages}</span>
              <button onClick={() => fetchReturns(pagination.page + 1)} disabled={pagination.page >= pagination.totalPages}
                className="px-3 py-1.5 rounded-lg border text-sm disabled:opacity-50 hover:bg-gray-50">Next</button>
            </div>
          )}
        </div>
      )}

      {/* Create Return Modal */}
      <SharedModal isOpen={showCreateModal} onClose={() => { setShowCreateModal(false); setSaleDetails(null); }}
        title="Process Sales Return" type="info" confirmText="Process Return" onConfirm={handleCreate}>
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Sale ID *</label>
            <div className="flex gap-2">
              <input type="text" required value={formData.sale_id}
                onChange={e => setFormData({...formData, sale_id: e.target.value})}
                className="flex-1 px-3 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-indigo-500" placeholder="e.g. SALE20240101..." />
              <button type="button" onClick={lookupSale}
                className="px-3 py-2 bg-gray-100 rounded-lg hover:bg-gray-200 text-sm"><Search className="h-4 w-4" /></button>
            </div>
          </div>

          {saleDetails && (
            <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-2">
              <p className="font-medium">Sale Items:</p>
              {saleDetails.items?.map((item, i) => (
                <div key={i} className="flex justify-between text-xs">
                  <span>{item.product_name} ({item.variety || ''})</span>
                  <span>{item.quantity_sold} {item.unit} × ₹{fmt(item.price_per_unit)}</span>
                </div>
              ))}
            </div>
          )}

          {saleDetails && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Product</label>
              <select value={formData.product_id} onChange={e => setFormData({...formData, product_id: e.target.value})}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-indigo-500">
                <option value="">Select product...</option>
                {saleDetails.items?.map(item => (
                  <option key={item.product_id} value={item.product_id}>{item.product_name} ({item.quantity_sold} sold)</option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Quantity to Return *</label>
              <input type="number" min="1" required value={formData.quantity_returned}
                onChange={e => setFormData({...formData, quantity_returned: Number(e.target.value)})}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Refund Mode</label>
              <select value={formData.refund_mode} onChange={e => setFormData({...formData, refund_mode: e.target.value})}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-indigo-500">
                <option value="cash">Cash</option>
                <option value="credit">Store Credit</option>
                <option value="bank">Bank</option>
              </select>
            </div>
          </div>

          {formData.refund_mode === 'bank' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Bank Account</label>
              <select value={formData.bank_account_id}
                onChange={e => setFormData({...formData, bank_account_id: e.target.value})}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-indigo-500">
                <option value="">Select Account</option>
                {bankAccounts.map(b => <option key={b.id} value={b.id}>{b.account_name} - {b.bank_name}</option>)}
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
            <textarea value={formData.reason} onChange={e => setFormData({...formData, reason: e.target.value})}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-indigo-500" rows={2} />
          </div>
        </form>
      </SharedModal>

      {/* Detail Modal */}
      <SharedModal isOpen={showDetailModal} onClose={() => setShowDetailModal(false)}
        title={`Return ${selectedReturn?.return_id || ''}`} type="info" confirmText="Close">
        {selectedReturn && (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div><span className="text-gray-500">Sale ID:</span> <span className="font-medium">{selectedReturn.sale_id}</span></div>
              <div><span className="text-gray-500">Receipt:</span> <span className="font-medium">{selectedReturn.receipt_number || '-'}</span></div>
              <div><span className="text-gray-500">Customer:</span> <span className="font-medium">{selectedReturn.customer_name || 'Walk-in Customer'}</span></div>
              <div><span className="text-gray-500">Mobile:</span> <span className="font-medium">{selectedReturn.customer_mobile || '-'}</span></div>
              <div><span className="text-gray-500">Refund Mode:</span> <span className="font-medium capitalize">{selectedReturn.refund_mode}</span></div>
              <div><span className="text-gray-500">Returned By:</span> <span className="font-medium">{selectedReturn.returned_by_name || '-'}</span></div>
              <div><span className="text-gray-500">Date:</span> <span className="font-medium">{selectedReturn.return_date?.slice(0, 10)}</span></div>
              <div><span className="text-gray-500">Total Refund:</span> <span className="font-semibold text-red-600">₹{fmt(selectedReturn.total_refund)}</span></div>
              <div className="sm:col-span-2"><span className="text-gray-500">Address:</span> <span className="font-medium">{selectedReturn.customer_address || '-'}</span></div>
            </div>
            {selectedReturn.reason && (
              <div><span className="text-gray-500">Reason:</span> <span className="font-medium">{selectedReturn.reason}</span></div>
            )}
            <div className="rounded-xl border border-gray-100 overflow-hidden">
              <table className="min-w-full divide-y divide-gray-100">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-600">Product</th>
                    <th className="px-3 py-2 text-center text-xs font-semibold uppercase text-gray-600">Qty</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-gray-600">Rate</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-gray-600">Refund</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {selectedReturn.items?.map((item) => (
                    <tr key={item.id}>
                      <td className="px-3 py-2 text-gray-900 font-medium">{item.product_name || item.product_id}</td>
                      <td className="px-3 py-2 text-center">{item.quantity_returned} {item.unit}</td>
                      <td className="px-3 py-2 text-right">₹{fmt(item.price_per_unit)}</td>
                      <td className="px-3 py-2 text-right font-semibold text-red-600">₹{fmt(item.refund_amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </SharedModal>

      <SharedModal isOpen={actionModal.open} onClose={() => setActionModal({...actionModal, open: false})}
        title={actionModal.title} type={actionModal.type} confirmText="OK">
        <p>{actionModal.message}</p>
      </SharedModal>
    </div>
  );
};

export default Returns;
