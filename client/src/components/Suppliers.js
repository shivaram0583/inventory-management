import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import SharedModal from './shared/Modal';
import { Truck, Plus, Search, Phone, Mail, MapPin, Eye, Edit2, ToggleLeft, ToggleRight } from 'lucide-react';

const Suppliers = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const [supplierDetail, setSupplierDetail] = useState(null);
  const [actionModal, setActionModal] = useState({ open: false, title: '', message: '', type: 'success' });

  const emptyForm = { name: '', contact_person: '', mobile: '', email: '', address: '', gstin: '' };
  const [formData, setFormData] = useState(emptyForm);

  const fetchSuppliers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/suppliers');
      setSuppliers(res.data || []);
    } catch {
      setError('Failed to load suppliers');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSuppliers(); }, [fetchSuppliers]);

  const handleAdd = async (e) => {
    if (e?.preventDefault) e.preventDefault();
    try {
      await axios.post('/api/suppliers', formData);
      setShowAddModal(false);
      setFormData(emptyForm);
      fetchSuppliers();
      setActionModal({ open: true, title: 'Supplier Added', message: 'Supplier created successfully', type: 'success' });
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to add supplier');
    }
  };

  const handleEdit = async (e) => {
    if (e?.preventDefault) e.preventDefault();
    if (!selectedSupplier) return;
    try {
      await axios.put(`/api/suppliers/${selectedSupplier.id}`, formData);
      setShowEditModal(false);
      setFormData(emptyForm);
      setSelectedSupplier(null);
      fetchSuppliers();
      setActionModal({ open: true, title: 'Supplier Updated', message: 'Supplier updated successfully', type: 'success' });
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update supplier');
    }
  };

  const openEdit = (supplier) => {
    setSelectedSupplier(supplier);
    setFormData({
      name: supplier.name || '',
      contact_person: supplier.contact_person || '',
      mobile: supplier.mobile || '',
      email: supplier.email || '',
      address: supplier.address || '',
      gstin: supplier.gstin || ''
    });
    setShowEditModal(true);
  };

  const viewDetail = async (supplier) => {
    try {
      const res = await axios.get(`/api/suppliers/${supplier.id}`);
      setSupplierDetail(res.data);
      setSelectedSupplier(supplier);
      setShowDetailModal(true);
    } catch {
      setError('Failed to load supplier details');
    }
  };

  const toggleStatus = async (supplier) => {
    try {
      await axios.patch(`/api/suppliers/${supplier.id}/toggle`);
      fetchSuppliers();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update status');
    }
  };

  const fmt = (v) => Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const filtered = suppliers.filter(s =>
    s.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.contact_person?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.mobile?.includes(searchTerm)
  );

  const renderForm = (onSubmit) => (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Supplier Name *</label>
        <input type="text" required value={formData.name}
          onChange={e => setFormData({...formData, name: e.target.value})}
          className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Contact Person</label>
          <input type="text" value={formData.contact_person}
            onChange={e => setFormData({...formData, contact_person: e.target.value})}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Mobile</label>
          <input type="tel" value={formData.mobile}
            onChange={e => setFormData({...formData, mobile: e.target.value})}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
          <input type="email" value={formData.email}
            onChange={e => setFormData({...formData, email: e.target.value})}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">GSTIN</label>
          <input type="text" value={formData.gstin}
            onChange={e => setFormData({...formData, gstin: e.target.value})}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
        <textarea value={formData.address} rows={2}
          onChange={e => setFormData({...formData, address: e.target.value})}
          className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent" />
      </div>
    </form>
  );

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* Header */}
      <div className="rounded-2xl px-7 py-5 flex items-center justify-between shadow-lg overflow-hidden relative"
           style={{background:'linear-gradient(135deg,#1e3a5f 0%,#2563eb 60%,#3b82f6 100%)'}}>
        <div className="absolute inset-0 opacity-10 pointer-events-none"
             style={{backgroundImage:'radial-gradient(circle at 80% 50%,#93c5fd,transparent 60%)'}} />
        <div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight">✦ Supplier Management</h1>
          <p className="mt-0.5 text-sm text-blue-200">Manage your supplier directory</p>
        </div>
        <div className="h-12 w-12 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center">
          <Truck className="h-6 w-6 text-white" />
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 px-4 py-3 text-red-700 text-sm" style={{background:'linear-gradient(90deg,#fff5f5,#fef2f2)'}}>
          ⚠ {error}
          <button onClick={() => setError('')} className="ml-2 font-bold">×</button>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input type="text" placeholder="Search suppliers..." className="input-field pl-10"
            value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
        </div>
        {isAdmin && (
          <button onClick={() => { setFormData(emptyForm); setShowAddModal(true); }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white shadow-md hover:shadow-lg active:scale-95 transition-all"
            style={{background:'linear-gradient(135deg,#3b82f6,#2563eb)'}}>
            <Plus className="h-4 w-4" /> Add Supplier
          </button>
        )}
      </div>

      {/* Supplier List */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="card text-center py-12 text-gray-400">
          <Truck className="h-10 w-10 mx-auto mb-2 opacity-30" />
          <p>No suppliers found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(s => (
            <div key={s.id} className={`card hover:shadow-lg transition-all duration-200 ${!s.is_active ? 'opacity-60' : ''}`}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-bold text-gray-900">{s.name}</h3>
                  {s.contact_person && <p className="text-xs text-gray-500">{s.contact_person}</p>}
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                  {s.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
              <div className="space-y-1 text-sm text-gray-600 mb-3">
                {s.mobile && <p className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5 text-gray-400" />{s.mobile}</p>}
                {s.email && <p className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5 text-gray-400" />{s.email}</p>}
                {s.address && <p className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-gray-400" />{s.address}</p>}
              </div>
              <div className="flex items-center justify-between text-xs text-gray-500 border-t pt-2">
                <span>{s.total_orders || 0} orders • Due ₹{fmt(Math.max(Number(s.remaining_balance || 0), 0))}</span>
                <div className="flex items-center gap-1">
                  <button onClick={() => viewDetail(s)} className="p-1.5 rounded-lg hover:bg-gray-100" title="View Details">
                    <Eye className="h-3.5 w-3.5 text-gray-500" />
                  </button>
                  {isAdmin && (
                    <>
                      <button onClick={() => openEdit(s)} className="p-1.5 rounded-lg hover:bg-gray-100" title="Edit">
                        <Edit2 className="h-3.5 w-3.5 text-gray-500" />
                      </button>
                      <button onClick={() => toggleStatus(s)} className="p-1.5 rounded-lg hover:bg-gray-100" title={s.is_active ? 'Deactivate' : 'Activate'}>
                        {s.is_active ? <ToggleRight className="h-4 w-4 text-green-500" /> : <ToggleLeft className="h-4 w-4 text-gray-400" />}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Modal */}
      <SharedModal isOpen={showAddModal} onClose={() => setShowAddModal(false)}
        title="Add Supplier" type="info" confirmText="Add Supplier" onConfirm={handleAdd}>
        {renderForm(handleAdd)}
      </SharedModal>

      {/* Edit Modal */}
      <SharedModal isOpen={showEditModal} onClose={() => setShowEditModal(false)}
        title="Edit Supplier" type="info" confirmText="Save Changes" onConfirm={handleEdit}>
        {renderForm(handleEdit)}
      </SharedModal>

      {/* Detail Modal */}
      <SharedModal isOpen={showDetailModal} onClose={() => setShowDetailModal(false)}
        title={`Supplier: ${selectedSupplier?.name || ''}`} type="info">
        {supplierDetail && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-gray-500">Contact:</span> <span className="font-medium">{supplierDetail.contact_person || '-'}</span></div>
              <div><span className="text-gray-500">Mobile:</span> <span className="font-medium">{supplierDetail.mobile || '-'}</span></div>
              <div><span className="text-gray-500">Email:</span> <span className="font-medium">{supplierDetail.email || '-'}</span></div>
              <div><span className="text-gray-500">GSTIN:</span> <span className="font-medium">{supplierDetail.gstin || '-'}</span></div>
            </div>
            {supplierDetail.address && <p className="text-sm text-gray-600"><span className="text-gray-500">Address:</span> {supplierDetail.address}</p>}

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl bg-teal-50 px-3 py-2"><span className="text-gray-500">Sold Value:</span> <span className="font-bold text-teal-700">₹{fmt(supplierDetail.summary?.sold_value)}</span></div>
              <div className="rounded-xl bg-violet-50 px-3 py-2"><span className="text-gray-500">Paid:</span> <span className="font-bold text-violet-700">₹{fmt(supplierDetail.summary?.total_paid)}</span></div>
              <div className="rounded-xl bg-amber-50 px-3 py-2"><span className="text-gray-500">Balance Due:</span> <span className="font-bold text-amber-700">₹{fmt(Math.max(Number(supplierDetail.summary?.balance_due || 0), 0))}</span></div>
              <div className="rounded-xl bg-rose-50 px-3 py-2"><span className="text-gray-500">Stock On Hand:</span> <span className="font-bold text-rose-700">{Number(supplierDetail.summary?.total_remaining_qty || 0)}</span></div>
            </div>

            {supplierDetail.open_lots?.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-2">Open Lots</h4>
                <div className="max-h-40 overflow-y-auto border rounded-lg">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 sticky top-0"><tr>
                      <th className="px-2 py-1.5 text-left">Product</th>
                      <th className="px-2 py-1.5 text-right">Remaining</th>
                      <th className="px-2 py-1.5 text-right">Rate</th>
                    </tr></thead>
                    <tbody>
                      {supplierDetail.open_lots.map((lot) => (
                        <tr key={lot.id} className="border-t">
                          <td className="px-2 py-1.5">{lot.product_name}</td>
                          <td className="px-2 py-1.5 text-right">{lot.quantity_remaining} {lot.unit}</td>
                          <td className="px-2 py-1.5 text-right">₹{fmt(lot.price_per_unit)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {supplierDetail.purchases?.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-2">Recent Purchases</h4>
                <div className="max-h-40 overflow-y-auto border rounded-lg">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 sticky top-0"><tr>
                      <th className="px-2 py-1.5 text-left">Product</th>
                      <th className="px-2 py-1.5 text-right">Qty</th>
                      <th className="px-2 py-1.5 text-right">Sold</th>
                      <th className="px-2 py-1.5 text-right">On Hand</th>
                      <th className="px-2 py-1.5 text-right">Amount</th>
                      <th className="px-2 py-1.5 text-center">Status</th>
                    </tr></thead>
                    <tbody>
                      {supplierDetail.purchases.map((p, i) => (
                        <tr key={i} className="border-t">
                          <td className="px-2 py-1.5">{p.product_name}{p.variety ? ` (${p.variety})` : ''}</td>
                          <td className="px-2 py-1.5 text-right">{p.quantity}</td>
                          <td className="px-2 py-1.5 text-right">{p.quantity_sold || 0}</td>
                          <td className="px-2 py-1.5 text-right">{p.quantity_remaining || 0}</td>
                          <td className="px-2 py-1.5 text-right">₹{fmt(p.total_amount)}</td>
                          <td className="px-2 py-1.5 text-center">
                            <span className={`px-1.5 py-0.5 rounded text-xs ${p.purchase_status === 'delivered' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                              {p.purchase_status || 'delivered'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </SharedModal>

      {/* Action result modal */}
      <SharedModal isOpen={actionModal.open} onClose={() => setActionModal({ ...actionModal, open: false })}
        title={actionModal.title} type={actionModal.type}>
        <p className="text-sm text-gray-700">{actionModal.message}</p>
      </SharedModal>
    </div>
  );
};

export default Suppliers;
