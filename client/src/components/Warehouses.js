import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import SharedModal from './shared/Modal';
import { Warehouse, Plus, ArrowRightLeft, MapPin, Package, ChevronRight, ArrowLeft } from 'lucide-react';

const Warehouses = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const canManage = ['admin', 'operator'].includes(user?.role);

  const [warehouses, setWarehouses] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({ name: '', address: '' });
  const [, setCreating] = useState(false);

  const [selectedWarehouse, setSelectedWarehouse] = useState(null);
  const [warehouseDetail, setWarehouseDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferForm, setTransferForm] = useState({ from_warehouse_id: '', to_warehouse_id: '', product_id: '', quantity: '', notes: '' });
  const [, setTransferring] = useState(false);

  const [showStockModal, setShowStockModal] = useState(false);
  const [stockForm, setStockForm] = useState({ product_id: '', quantity: '' });
  const [, setSettingStock] = useState(false);

  const [transfers, setTransfers] = useState([]);

  const fetchWarehouses = useCallback(async () => {
    setLoading(true);
    try {
      const [whRes, prodRes] = await Promise.all([
        axios.get('/api/warehouses'),
        axios.get('/api/inventory')
      ]);
      setWarehouses(whRes.data || []);
      setProducts((prodRes.data || []).filter(p => !p.is_deleted));
    } catch {
      setError('Failed to load warehouses');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchWarehouses(); }, [fetchWarehouses]);

  const fetchDetail = async (id) => {
    setDetailLoading(true);
    try {
      const res = await axios.get(`/api/warehouses/${id}`);
      setWarehouseDetail(res.data);
      setSelectedWarehouse(id);
    } catch {
      setError('Failed to load warehouse details');
    } finally {
      setDetailLoading(false);
    }
  };

  const fetchTransfers = async () => {
    try {
      const res = await axios.get('/api/warehouses/transfers/history');
      setTransfers(res.data || []);
    } catch {
      setError('Failed to load transfer history');
    }
  };

  const handleCreate = async (e) => {
    if (e?.preventDefault) e.preventDefault();
    setCreating(true);
    setError('');
    try {
      await axios.post('/api/warehouses', createForm);
      setShowCreateModal(false);
      setCreateForm({ name: '', address: '' });
      setSuccess('Warehouse created');
      await fetchWarehouses();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create warehouse');
    } finally {
      setCreating(false);
    }
  };

  const handleTransfer = async (e) => {
    if (e?.preventDefault) e.preventDefault();
    setTransferring(true);
    setError('');
    try {
      await axios.post('/api/warehouses/transfer', {
        ...transferForm,
        from_warehouse_id: Number(transferForm.from_warehouse_id),
        to_warehouse_id: Number(transferForm.to_warehouse_id),
        product_id: Number(transferForm.product_id),
        quantity: Number(transferForm.quantity)
      });
      setShowTransferModal(false);
      setTransferForm({ from_warehouse_id: '', to_warehouse_id: '', product_id: '', quantity: '', notes: '' });
      setSuccess('Stock transferred successfully');
      await fetchWarehouses();
      if (selectedWarehouse) await fetchDetail(selectedWarehouse);
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to transfer stock');
    } finally {
      setTransferring(false);
    }
  };

  const handleSetStock = async (e) => {
    if (e?.preventDefault) e.preventDefault();
    if (!selectedWarehouse) return;
    setSettingStock(true);
    setError('');
    try {
      await axios.post(`/api/warehouses/${selectedWarehouse}/stock`, {
        product_id: Number(stockForm.product_id),
        quantity: Number(stockForm.quantity)
      });
      setShowStockModal(false);
      setStockForm({ product_id: '', quantity: '' });
      setSuccess('Stock updated');
      await fetchDetail(selectedWarehouse);
      await fetchWarehouses();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update stock');
    } finally {
      setSettingStock(false);
    }
  };

  const activeWarehouses = warehouses.filter(w => w.is_active);

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="rounded-2xl px-7 py-5 flex items-center justify-between shadow-lg overflow-hidden relative"
           style={{background:'linear-gradient(135deg,#1e3a5f 0%,#0369a1 50%,#0891b2 100%)'}}>
        <div className="absolute inset-0 opacity-10 pointer-events-none"
             style={{backgroundImage:'radial-gradient(circle at 80% 50%,#67e8f9,transparent 60%)'}} />
        <div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight">Warehouses</h1>
          <p className="mt-0.5 text-sm text-cyan-200">Manage warehouse locations and inter-warehouse stock transfers</p>
        </div>
        <div className="flex items-center gap-3">
          {canManage && (
            <button onClick={() => setShowTransferModal(true)}
              className="px-4 py-2 rounded-xl text-sm font-semibold text-white bg-white/10 border border-white/20 hover:bg-white/20 transition-all flex items-center gap-1.5">
              <ArrowRightLeft className="h-4 w-4" /> Transfer Stock
            </button>
          )}
          <div className="h-12 w-12 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center">
            <Warehouse className="h-6 w-6 text-white" />
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 px-4 py-3 text-red-700 text-sm" style={{background:'linear-gradient(90deg,#fff5f5,#fef2f2)'}}>
          ⚠ {error}
        </div>
      )}
      {success && (
        <div className="rounded-xl border border-emerald-200 px-4 py-3 text-emerald-700 text-sm" style={{background:'linear-gradient(90deg,#f0fdf4,#ecfdf5)'}}>
          ✓ {success}
        </div>
      )}

      {selectedWarehouse && warehouseDetail ? (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <button onClick={() => { setSelectedWarehouse(null); setWarehouseDetail(null); }}
              className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
              <ArrowLeft className="h-5 w-5 text-gray-500" />
            </button>
            <h2 className="text-lg font-bold text-gray-800">{warehouseDetail.name}</h2>
            {warehouseDetail.address && <span className="text-sm text-gray-500 flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{warehouseDetail.address}</span>}
          </div>

          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">{warehouseDetail.stock?.length || 0} products in stock</p>
            {canManage && (
              <button onClick={() => setShowStockModal(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-600 text-white text-xs font-medium hover:bg-cyan-700 transition-colors">
                <Plus className="h-3.5 w-3.5" /> Assign Stock
              </button>
            )}
          </div>

          {detailLoading ? (
            <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-600" /></div>
          ) : (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <table className="min-w-full divide-y divide-gray-100">
                <thead className="bg-gray-50/80">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Product</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Category</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Quantity</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Unit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {(warehouseDetail.stock || []).map(s => (
                    <tr key={s.product_id} className="hover:bg-cyan-50/30 transition-colors">
                      <td className="px-4 py-3 text-sm font-medium">{s.product_name} {s.variety ? `(${s.variety})` : ''}</td>
                      <td className="px-4 py-3 text-sm text-gray-600 capitalize">{s.category || '-'}</td>
                      <td className="px-4 py-3 text-sm text-right font-semibold">{s.quantity}</td>
                      <td className="px-4 py-3 text-sm text-gray-500">{s.unit}</td>
                    </tr>
                  ))}
                  {(!warehouseDetail.stock || warehouseDetail.stock.length === 0) && (
                    <tr><td colSpan="4" className="px-4 py-8 text-center text-gray-400">No stock assigned</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">{warehouses.length} warehouses</p>
            <div className="flex gap-2">
              <button onClick={fetchTransfers}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 text-xs font-medium hover:bg-gray-50 transition-colors">
                <ArrowRightLeft className="h-3.5 w-3.5" /> Transfer History
              </button>
              {isAdmin && (
                <button onClick={() => setShowCreateModal(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-600 text-white text-xs font-medium hover:bg-cyan-700 transition-colors">
                  <Plus className="h-3.5 w-3.5" /> Add Warehouse
                </button>
              )}
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-cyan-600" /></div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {warehouses.map(wh => (
                <div key={wh.id} onClick={() => fetchDetail(wh.id)}
                  className="card cursor-pointer hover:shadow-md transition-all group">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-bold text-gray-800 group-hover:text-cyan-700 transition-colors">{wh.name}</h3>
                      {wh.address && <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5"><MapPin className="h-3 w-3" />{wh.address}</p>}
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${wh.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                      {wh.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-3">
                      <span className="text-gray-500"><Package className="h-3.5 w-3.5 inline mr-1" />{wh.product_count || 0} products</span>
                      <span className="text-gray-500">{wh.total_stock || 0} units</span>
                    </div>
                    <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-cyan-500 transition-colors" />
                  </div>
                </div>
              ))}
              {warehouses.length === 0 && (
                <div className="col-span-full text-center py-12 text-gray-400">
                  <Warehouse className="h-10 w-10 mx-auto mb-2 opacity-20" />
                  <p className="text-sm">No warehouses created yet</p>
                </div>
              )}
            </div>
          )}

          {transfers.length > 0 && (
            <div className="card mt-6">
              <h3 className="text-base font-bold text-gray-800 mb-3 flex items-center gap-2">
                <ArrowRightLeft className="h-5 w-5 text-cyan-600" /> Recent Transfers
              </h3>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-100">
                  <thead className="bg-gray-50/80">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">From</th>
                      <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">To</th>
                      <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Product</th>
                      <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600">Qty</th>
                      <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">By</th>
                      <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {transfers.map(t => (
                      <tr key={t.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-2 text-sm">{t.from_warehouse_name}</td>
                        <td className="px-4 py-2 text-sm">{t.to_warehouse_name}</td>
                        <td className="px-4 py-2 text-sm">{t.product_name} {t.variety ? `(${t.variety})` : ''}</td>
                        <td className="px-4 py-2 text-sm text-right font-medium">{t.quantity} {t.unit}</td>
                        <td className="px-4 py-2 text-sm text-gray-500">{t.transferred_by_name || '-'}</td>
                        <td className="px-4 py-2 text-sm text-gray-500">{t.transferred_at?.slice(0, 10)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Create Warehouse Modal */}
      <SharedModal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)}
        title="Create Warehouse" type="info" confirmText="Create" onConfirm={handleCreate}>
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Warehouse Name *</label>
            <input type="text" required value={createForm.name}
              onChange={e => setCreateForm({...createForm, name: e.target.value})}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-cyan-500" placeholder="e.g. Main Store" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
            <input type="text" value={createForm.address}
              onChange={e => setCreateForm({...createForm, address: e.target.value})}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-cyan-500" placeholder="e.g. 123 Main St" />
          </div>
        </form>
      </SharedModal>

      {/* Transfer Stock Modal */}
      <SharedModal isOpen={showTransferModal} onClose={() => setShowTransferModal(false)}
        title="Transfer Stock Between Warehouses" type="info" confirmText="Transfer" onConfirm={handleTransfer}>
        <form onSubmit={handleTransfer} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">From Warehouse *</label>
            <select required value={transferForm.from_warehouse_id}
              onChange={e => setTransferForm({...transferForm, from_warehouse_id: e.target.value})}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-cyan-500">
              <option value="">Select source...</option>
              {activeWarehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">To Warehouse *</label>
            <select required value={transferForm.to_warehouse_id}
              onChange={e => setTransferForm({...transferForm, to_warehouse_id: e.target.value})}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-cyan-500">
              <option value="">Select destination...</option>
              {activeWarehouses.filter(w => String(w.id) !== transferForm.from_warehouse_id).map(w => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Product *</label>
            <select required value={transferForm.product_id}
              onChange={e => setTransferForm({...transferForm, product_id: e.target.value})}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-cyan-500">
              <option value="">Select product...</option>
              {products.map(p => <option key={p.id} value={p.id}>{p.product_name} {p.variety ? `(${p.variety})` : ''}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Quantity *</label>
            <input type="number" min="1" required value={transferForm.quantity}
              onChange={e => setTransferForm({...transferForm, quantity: e.target.value})}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-cyan-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <input type="text" value={transferForm.notes}
              onChange={e => setTransferForm({...transferForm, notes: e.target.value})}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-cyan-500" placeholder="Optional transfer notes" />
          </div>
        </form>
      </SharedModal>

      {/* Assign Stock Modal */}
      <SharedModal isOpen={showStockModal} onClose={() => setShowStockModal(false)}
        title={`Assign Stock to ${warehouseDetail?.name || ''}`} type="info" confirmText="Save" onConfirm={handleSetStock}>
        <form onSubmit={handleSetStock} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Product *</label>
            <select required value={stockForm.product_id}
              onChange={e => setStockForm({...stockForm, product_id: e.target.value})}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-cyan-500">
              <option value="">Select product...</option>
              {products.map(p => <option key={p.id} value={p.id}>{p.product_name} {p.variety ? `(${p.variety})` : ''} - Stock: {p.quantity_available}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Quantity *</label>
            <input type="number" min="0" required value={stockForm.quantity}
              onChange={e => setStockForm({...stockForm, quantity: e.target.value})}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-cyan-500" />
          </div>
        </form>
      </SharedModal>
    </div>
  );
};

export default Warehouses;
