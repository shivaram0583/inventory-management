import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import SharedModal from './shared/Modal';
import useSortableData from '../hooks/useSortableData';
import SortableHeader from './shared/SortableHeader';
import { fmtDateTime, getISTDateString } from '../utils/dateUtils';
import {
  Truck,
  Plus,
  Search,
  Tag,
  Package,
  IndianRupee,
  Trash2,
  X,
  Edit,
  CheckCircle
} from 'lucide-react';

const Purchases = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [activeTab, setActiveTab] = useState('record');

  // Purchases state
  const [purchases, setPurchases] = useState([]);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Purchase form state
  const [formProductId, setFormProductId] = useState('');
  const [formQuantity, setFormQuantity] = useState('');
  const [formPrice, setFormPrice] = useState('');
  const [formSupplier, setFormSupplier] = useState('');
  const [formDate, setFormDate] = useState(getISTDateString());
  const [productSearch, setProductSearch] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Category form state
  const [newCategoryName, setNewCategoryName] = useState('');
  const [deleteCatModal, setDeleteCatModal] = useState({ open: false, id: null, name: '' });

  // Confirmation modal (before submitting purchase)
  const [confirmModal, setConfirmModal] = useState({ open: false, data: null });

  // Edit purchase modal
  const [editModal, setEditModal] = useState({ open: false, purchase: null });
  const [editForm, setEditForm] = useState({ quantity: '', price_per_unit: '', supplier: '', purchase_date: '' });
  const [editSubmitting, setEditSubmitting] = useState(false);

  // New product modal
  const [showNewProductModal, setShowNewProductModal] = useState(false);
  const [newProductForm, setNewProductForm] = useState({
    product_id: '', category: '', product_name: '', variety: '',
    quantity_available: '0', unit: 'kg', purchase_price: '', selling_price: '', supplier: ''
  });
  const [newProductSubmitting, setNewProductSubmitting] = useState(false);

  const { sortedItems: sortedPurchases, sortConfig, requestSort } = useSortableData(purchases);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [purRes, prodRes, catRes] = await Promise.all([
        axios.get('/api/purchases'),
        axios.get('/api/inventory'),
        axios.get('/api/purchases/categories')
      ]);
      setPurchases(purRes.data || []);
      setProducts(prodRes.data || []);
      setCategories(catRes.data || []);
    } catch (e) {
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Auto-fill price when product selected
  useEffect(() => {
    if (formProductId) {
      const p = products.find(x => String(x.id) === String(formProductId));
      if (p) setFormPrice(String(p.purchase_price || ''));
    }
  }, [formProductId, products]);

  const filteredProducts = products.filter(p =>
    p.product_name.toLowerCase().includes(productSearch.toLowerCase()) ||
    p.product_id.toLowerCase().includes(productSearch.toLowerCase()) ||
    (p.variety || '').toLowerCase().includes(productSearch.toLowerCase())
  );

  // Step 1 — validate and open confirmation popup
  const handleRecordPurchase = (e) => {
    e.preventDefault();
    if (!formProductId || !formQuantity || !formPrice) {
      setError('Product, quantity, and price are required');
      return;
    }
    setError('');
    setConfirmModal({
      open: true,
      data: {
        product_id: parseInt(formProductId),
        quantity: parseFloat(formQuantity),
        price_per_unit: parseFloat(formPrice),
        supplier: formSupplier.trim() || null,
        purchase_date: formDate,
        product: selectedProduct
      }
    });
  };

  // Step 2 — actually submit after confirmation
  const handleConfirmPurchase = async () => {
    const { data } = confirmModal;
    setConfirmModal({ open: false, data: null });
    setSubmitting(true);
    setError('');
    setSuccess('');
    try {
      await axios.post('/api/purchases', {
        product_id: data.product_id,
        quantity: data.quantity,
        price_per_unit: data.price_per_unit,
        supplier: data.supplier || undefined,
        purchase_date: data.purchase_date
      });
      setSuccess('Purchase recorded and inventory updated successfully');
      setFormProductId('');
      setFormQuantity('');
      setFormPrice('');
      setFormSupplier('');
      setFormDate(getISTDateString());
      setProductSearch('');
      fetchAll();
      setTimeout(() => setSuccess(''), 4000);
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to record purchase');
    } finally {
      setSubmitting(false);
    }
  };

  // Open edit modal for a purchase
  const openEditModal = (purchase) => {
    setEditForm({
      quantity: String(purchase.quantity),
      price_per_unit: String(purchase.price_per_unit),
      supplier: purchase.supplier || '',
      purchase_date: purchase.purchase_date
        ? new Date(purchase.purchase_date).toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0]
    });
    setEditModal({ open: true, purchase });
  };

  const handleEditPurchase = async (e) => {
    e.preventDefault();
    setEditSubmitting(true);
    setError('');
    try {
      await axios.put(`/api/purchases/${editModal.purchase.id}`, {
        quantity: parseFloat(editForm.quantity),
        price_per_unit: parseFloat(editForm.price_per_unit),
        supplier: editForm.supplier.trim() || undefined,
        purchase_date: editForm.purchase_date
      });
      setEditModal({ open: false, purchase: null });
      setSuccess('Purchase updated successfully');
      fetchAll();
      setTimeout(() => setSuccess(''), 3000);
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to update purchase');
    } finally {
      setEditSubmitting(false);
    }
  };

  // Create a new product from Purchases tab
  const handleCreateProduct = async (e) => {
    e.preventDefault();
    setNewProductSubmitting(true);
    setError('');
    try {
      const res = await axios.post('/api/inventory', {
        ...newProductForm,
        quantity_available: parseFloat(newProductForm.quantity_available) || 0,
        purchase_price: parseFloat(newProductForm.purchase_price) || 0,
        selling_price: parseFloat(newProductForm.selling_price) || 0
      });
      setShowNewProductModal(false);
      setNewProductForm({
        product_id: '', category: '', product_name: '', variety: '',
        quantity_available: '0', unit: 'kg', purchase_price: '', selling_price: '', supplier: ''
      });
      await fetchAll();
      // Auto-select the newly created product
      if (res.data?.id) {
        setFormProductId(String(res.data.id));
        if (res.data.purchase_price) setFormPrice(String(res.data.purchase_price));
      }
      setSuccess('Product created and selected');
      setTimeout(() => setSuccess(''), 3000);
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to create product');
    } finally {
      setNewProductSubmitting(false);
    }
  };

  const handleAddCategory = async (e) => {
    e.preventDefault();
    if (!newCategoryName.trim()) return;
    setError('');
    setSuccess('');
    try {
      await axios.post('/api/purchases/categories', { name: newCategoryName.trim() });
      setNewCategoryName('');
      setSuccess('Category added');
      fetchAll();
      setTimeout(() => setSuccess(''), 3000);
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to add category');
    }
  };

  const handleDeleteCategory = async () => {
    const { id } = deleteCatModal;
    setDeleteCatModal({ open: false, id: null, name: '' });
    if (!id) return;
    setError('');
    try {
      await axios.delete(`/api/purchases/categories/${id}`);
      setSuccess('Category deleted');
      fetchAll();
      setTimeout(() => setSuccess(''), 3000);
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to delete category');
    }
  };

  const selectedProduct = products.find(p => String(p.id) === String(formProductId));

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* Header */}
      <div className="rounded-2xl px-7 py-5 flex items-center justify-between shadow-lg overflow-hidden relative"
           style={{background:'linear-gradient(135deg,#1e3a5f 0%,#1d4ed8 50%,#7c3aed 100%)'}}>
        <div className="absolute inset-0 opacity-10 pointer-events-none"
             style={{backgroundImage:'radial-gradient(circle at 80% 50%,#93c5fd,transparent 60%)'}} />
        <div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight">✦ Purchases</h1>
          <p className="mt-0.5 text-sm text-blue-200">Record stock purchases and manage categories</p>
        </div>
        <div className="h-12 w-12 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center">
          <Truck className="h-6 w-6 text-white" />
        </div>
      </div>

      {/* Tabs */}
      <div className="card !p-2">
        <nav className="flex gap-1">
          {[
            { id: 'record', label: 'Record Purchase', icon: Truck },
            { id: 'history', label: 'Purchase History', icon: Package },
            { id: 'categories', label: 'Manage Categories', icon: Tag }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                activeTab === tab.id ? 'text-white shadow-md' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
              }`}
              style={activeTab === tab.id ? {background:'linear-gradient(135deg,#3b82f6,#6366f1)',boxShadow:'0 2px 8px rgba(99,102,241,0.35)'} : {}}
            >
              <tab.icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 px-4 py-3 text-red-700 text-sm"
             style={{background:'linear-gradient(90deg,#fff5f5,#fef2f2)'}}>⚠ {error}</div>
      )}
      {success && (
        <div className="rounded-xl border border-green-200 px-4 py-3 text-green-700 text-sm"
             style={{background:'linear-gradient(90deg,#f0fdf4,#ecfdf5)'}}>✓ {success}</div>
      )}

      {/* Record Purchase Tab */}
      {activeTab === 'record' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Product selector */}
          <div className="lg:col-span-2 card">
            <div className="flex items-center gap-2 mb-4">
              <span className="h-6 w-6 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                <Search className="h-3.5 w-3.5 text-white" />
              </span>
              <h2 className="text-base font-bold text-gray-800">Select Product</h2>
              <button
                type="button"
                onClick={() => setShowNewProductModal(true)}
                className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-white shadow-sm hover:shadow-md active:scale-95 transition-all duration-150"
                style={{background:'linear-gradient(135deg,#059669,#10b981)'}}>
                <Plus className="h-3 w-3" /> New Product
              </button>
            </div>
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input type="text" placeholder="Search products..."
                className="input-field pl-10" value={productSearch}
                onChange={e => setProductSearch(e.target.value)} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[400px] overflow-y-auto pr-1">
              {filteredProducts.map(p => (
                <div key={p.id}
                     onClick={() => { setFormProductId(String(p.id)); setProductSearch(''); }}
                     className={`rounded-xl p-4 border cursor-pointer transition-all duration-200 ${
                       String(formProductId) === String(p.id)
                         ? 'border-blue-400 shadow-md'
                         : 'border-gray-100 hover:border-blue-200 hover:shadow-sm'
                     }`}
                     style={{background: String(formProductId) === String(p.id)
                       ? 'linear-gradient(135deg,#eff6ff,#eef2ff)'
                       : 'linear-gradient(135deg,#f8faff,#f5f3ff)'}}>
                  <div className="flex justify-between items-start mb-1">
                    <div>
                      <h3 className="font-semibold text-gray-900 text-sm">{p.product_name}</h3>
                      {p.variety && <p className="text-xs text-gray-400">{p.variety}</p>}
                      <span className="inline-block mt-0.5 text-xs px-2 py-0.5 rounded-full font-medium capitalize"
                            style={{background:'linear-gradient(90deg,#ede9fe,#e0e7ff)',color:'#6d28d9'}}>
                        {p.category}
                      </span>
                    </div>
                    <span className="text-xs font-bold px-2 py-1 rounded-lg bg-blue-100 text-blue-700">
                      {p.quantity_available} {p.unit}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Buy price: <span className="font-semibold text-gray-700">₹{p.purchase_price}/{p.unit}</span>
                  </p>
                </div>
              ))}
              {filteredProducts.length === 0 && (
                <div className="col-span-2 text-center py-10 text-gray-400">
                  <Package className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No products found</p>
                  <button
                    type="button"
                    onClick={() => setShowNewProductModal(true)}
                    className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white shadow-sm active:scale-95 transition-all"
                    style={{background:'linear-gradient(135deg,#059669,#10b981)'}}>
                    <Plus className="h-3.5 w-3.5" /> Create New Product
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Purchase form */}
          <div className="card !p-0 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100"
                 style={{background:'linear-gradient(90deg,#eff6ff,#eef2ff)'}}>
              <div className="flex items-center gap-2">
                <span className="h-7 w-7 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-sm">
                  <Truck className="h-4 w-4 text-white" />
                </span>
                <h2 className="text-base font-bold text-gray-800">Purchase Details</h2>
              </div>
            </div>
            <form onSubmit={handleRecordPurchase} className="p-5 space-y-4">
              {selectedProduct ? (
                <div className="rounded-xl p-3 text-sm"
                     style={{background:'linear-gradient(135deg,#eff6ff,#eef2ff)'}}>
                  <p className="font-semibold text-gray-900">{selectedProduct.product_name}</p>
                  {selectedProduct.variety && <p className="text-xs text-gray-500">{selectedProduct.variety}</p>}
                  <p className="text-xs text-gray-500 capitalize">{selectedProduct.category} · {selectedProduct.unit}</p>
                  <button type="button" onClick={() => setFormProductId('')}
                    className="mt-1 text-xs text-red-400 hover:text-red-600 flex items-center gap-0.5">
                    <X className="h-3 w-3" /> Clear
                  </button>
                </div>
              ) : (
                <p className="text-xs text-gray-400 italic">← Select a product from the list</p>
              )}

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1 flex items-center gap-1">
                  <Package className="h-3 w-3" /> Quantity
                </label>
                <input type="number" min="0.01" step="0.01" className="input-field !text-sm"
                  placeholder={`e.g. 50 ${selectedProduct?.unit || ''}`}
                  value={formQuantity} onChange={e => setFormQuantity(e.target.value)} required />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1 flex items-center gap-1">
                  <IndianRupee className="h-3 w-3" /> Price per Unit (₹)
                </label>
                <input type="number" min="0" step="0.01" className="input-field !text-sm"
                  placeholder="e.g. 120"
                  value={formPrice} onChange={e => setFormPrice(e.target.value)} required />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1 flex items-center gap-1">
                  <Truck className="h-3 w-3" /> Supplier
                </label>
                <input type="text" className="input-field !text-sm" placeholder="Supplier name (optional)"
                  value={formSupplier} onChange={e => setFormSupplier(e.target.value)} />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Purchase Date</label>
                <input type="date" className="input-field !text-sm"
                  value={formDate} onChange={e => setFormDate(e.target.value)} />
              </div>

              {formQuantity && formPrice && (
                <div className="rounded-xl px-4 py-3"
                     style={{background:'linear-gradient(135deg,#eff6ff,#eef2ff)'}}>
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-semibold text-gray-500 uppercase">Total Cost</span>
                    <span className="text-xl font-extrabold text-blue-700">
                      ₹{(parseFloat(formQuantity || 0) * parseFloat(formPrice || 0)).toFixed(2)}
                    </span>
                  </div>
                </div>
              )}

              <button type="submit" disabled={submitting || !formProductId}
                className="w-full py-2.5 rounded-xl font-bold text-sm text-white shadow-lg hover:shadow-xl active:scale-95 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{background:'linear-gradient(135deg,#3b82f6,#6366f1)'}}>
                {submitting ? 'Recording...' : 'Review & Confirm Purchase →'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Purchase History Tab */}
      {activeTab === 'history' && (
        <div className="card">
          <h3 className="text-base font-bold text-gray-800 mb-4">Purchase History</h3>
          {loading ? (
            <div className="flex justify-center py-10">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : (
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <SortableHeader label="Purchase ID" sortKey="purchase_id" sortConfig={sortConfig} onSort={requestSort} />
                    <SortableHeader label="Product" sortKey="product_name" sortConfig={sortConfig} onSort={requestSort} />
                    <SortableHeader label="Category" sortKey="category" sortConfig={sortConfig} onSort={requestSort} />
                    <SortableHeader label="Quantity" sortKey="quantity" sortConfig={sortConfig} onSort={requestSort} />
                    <SortableHeader label="Price/Unit" sortKey="price_per_unit" sortConfig={sortConfig} onSort={requestSort} />
                    <SortableHeader label="Total" sortKey="total_amount" sortConfig={sortConfig} onSort={requestSort} />
                    <SortableHeader label="Supplier" sortKey="supplier" sortConfig={sortConfig} onSort={requestSort} />
                    <SortableHeader label="Date" sortKey="purchase_date" sortConfig={sortConfig} onSort={requestSort} />
                    <SortableHeader label="Added By" sortKey="added_by_name" sortConfig={sortConfig} onSort={requestSort} />
                    <th>Edit</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedPurchases.map(p => (
                    <tr key={p.id}>
                      <td className="text-xs font-mono text-gray-500">{p.purchase_id}</td>
                      <td>
                        <div>
                          <p className="font-medium text-gray-900">{p.product_name}</p>
                          {p.variety && <p className="text-xs text-gray-400">{p.variety}</p>}
                        </div>
                      </td>
                      <td className="capitalize">{p.category}</td>
                      <td>{p.quantity} {p.unit}</td>
                      <td>₹{Number(p.price_per_unit).toLocaleString('en-IN')}</td>
                      <td className="font-semibold text-blue-700">₹{Number(p.total_amount).toLocaleString('en-IN')}</td>
                      <td>{p.supplier || '-'}</td>
                      <td className="text-sm">{fmtDateTime(p.purchase_date)}</td>
                      <td>{p.added_by_name || '-'}</td>
                      <td>
                        <button
                          onClick={() => openEditModal(p)}
                          className="text-indigo-400 hover:text-indigo-600 transition-colors"
                          title="Edit purchase">
                          <Edit className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {sortedPurchases.length === 0 && (
                <div className="text-center py-10 text-gray-400">
                  <Truck className="h-10 w-10 mx-auto mb-2 opacity-20" />
                  <p className="text-sm">No purchases recorded yet</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Manage Categories Tab */}
      {activeTab === 'categories' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Add category */}
          <div className="card">
            <div className="flex items-center gap-2 mb-4">
              <span className="h-6 w-6 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
                <Plus className="h-3.5 w-3.5 text-white" />
              </span>
              <h3 className="text-base font-bold text-gray-800">Add New Category</h3>
            </div>
            <form onSubmit={handleAddCategory} className="flex gap-3">
              <input type="text" className="input-field flex-1 !text-sm"
                placeholder="e.g. pesticides, tools..."
                value={newCategoryName}
                onChange={e => setNewCategoryName(e.target.value)} required />
              <button type="submit"
                className="px-4 py-2 rounded-xl font-semibold text-sm text-white shadow-sm hover:shadow-md active:scale-95 transition-all duration-150"
                style={{background:'linear-gradient(135deg,#7c3aed,#6366f1)'}}>
                <Plus className="h-4 w-4" />
              </button>
            </form>
            <p className="text-xs text-gray-400 mt-3">
              Categories are used across the inventory when adding new products.
            </p>
          </div>

          {/* Category list */}
          <div className="card">
            <div className="flex items-center gap-2 mb-4">
              <span className="h-6 w-6 rounded-lg bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center">
                <Tag className="h-3.5 w-3.5 text-white" />
              </span>
              <h3 className="text-base font-bold text-gray-800">Current Categories</h3>
              <span className="ml-auto text-xs font-bold px-2 py-0.5 rounded-full text-white"
                    style={{background:'linear-gradient(135deg,#6366f1,#8b5cf6)'}}>{categories.length}</span>
            </div>
            <div className="space-y-2">
              {categories.map(cat => (
                <div key={cat.id}
                     className="flex items-center justify-between rounded-xl px-4 py-2.5 border border-indigo-100/60"
                     style={{background:'linear-gradient(135deg,#fafbff,#f5f3ff)'}}>
                  <span className="text-sm font-semibold text-gray-700 capitalize">{cat.name}</span>
                  {isAdmin && (
                    <button
                      onClick={() => setDeleteCatModal({ open: true, id: cat.id, name: cat.name })}
                      className="text-gray-300 hover:text-red-500 transition-colors"
                      title="Delete category">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
              {categories.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-4">No categories yet</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete Category Confirmation Modal */}
      <SharedModal
        isOpen={deleteCatModal.open}
        onClose={() => setDeleteCatModal({ open: false, id: null, name: '' })}
        title="Delete Category"
        type="warning"
        confirmText="Delete"
        onConfirm={handleDeleteCategory}
      >
        <p>Are you sure you want to delete the category <span className="font-semibold capitalize">"{deleteCatModal.name}"</span>?</p>
        <p className="mt-2 text-xs text-gray-500">Categories in use by existing products cannot be deleted.</p>
      </SharedModal>

      {/* Purchase Confirmation Modal */}
      {confirmModal.open && confirmModal.data && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
             style={{background:'rgba(15,23,42,0.55)',backdropFilter:'blur(4px)'}}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-scale-in">
            <div className="px-6 py-4 border-b border-gray-100"
                 style={{background:'linear-gradient(135deg,#eff6ff,#eef2ff)'}}>
              <div className="flex items-center gap-3">
                <span className="h-9 w-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow">
                  <CheckCircle className="h-5 w-5 text-white" />
                </span>
                <div>
                  <h3 className="text-base font-bold text-gray-900">Confirm Purchase</h3>
                  <p className="text-xs text-gray-500">This will be added to inventory</p>
                </div>
                <button onClick={() => setConfirmModal({ open: false, data: null })}
                  className="ml-auto text-gray-400 hover:text-gray-600">
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div className="rounded-xl p-4 space-y-3"
                   style={{background:'linear-gradient(135deg,#f8faff,#f5f3ff)'}}>
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-bold text-gray-900">{confirmModal.data.product?.product_name}</p>
                    {confirmModal.data.product?.variety && (
                      <p className="text-xs text-gray-400">{confirmModal.data.product.variety}</p>
                    )}
                    <span className="inline-block mt-1 text-xs px-2 py-0.5 rounded-full font-medium capitalize"
                          style={{background:'#ede9fe',color:'#6d28d9'}}>
                      {confirmModal.data.product?.category}
                    </span>
                  </div>
                  <span className="text-xs font-bold px-2 py-1 rounded-lg bg-blue-100 text-blue-700">
                    {confirmModal.data.product?.unit}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-indigo-100">
                  <div>
                    <p className="text-xs text-gray-400 uppercase font-semibold">Quantity</p>
                    <p className="font-bold text-gray-900">
                      {confirmModal.data.quantity} {confirmModal.data.product?.unit}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 uppercase font-semibold">Price / Unit</p>
                    <p className="font-bold text-gray-900">₹{confirmModal.data.price_per_unit}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 uppercase font-semibold">Supplier</p>
                    <p className="font-semibold text-gray-700">{confirmModal.data.supplier || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 uppercase font-semibold">Date</p>
                    <p className="font-semibold text-gray-700">{confirmModal.data.purchase_date}</p>
                  </div>
                </div>
              </div>
              <div className="rounded-xl px-4 py-3"
                   style={{background:'linear-gradient(135deg,#eff6ff,#eef2ff)'}}>
                <div className="flex justify-between items-center">
                  <span className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Total Cost</span>
                  <span className="text-2xl font-extrabold text-blue-700">
                    ₹{(confirmModal.data.quantity * confirmModal.data.price_per_unit).toLocaleString('en-IN', {minimumFractionDigits:2, maximumFractionDigits:2})}
                  </span>
                </div>
              </div>
              <p className="text-xs text-gray-400 text-center">
                Stock will increase by <strong>{confirmModal.data.quantity} {confirmModal.data.product?.unit}</strong> after confirmation.
              </p>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex gap-3"
                 style={{background:'linear-gradient(90deg,#f8faff,#f5f3ff)'}}>
              <button
                onClick={() => setConfirmModal({ open: false, data: null })}
                className="flex-1 py-2.5 rounded-xl font-semibold text-sm text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button
                onClick={handleConfirmPurchase}
                className="flex-1 py-2.5 rounded-xl font-bold text-sm text-white shadow-lg hover:shadow-xl active:scale-95 transition-all"
                style={{background:'linear-gradient(135deg,#3b82f6,#6366f1)'}}>
                ✓ Confirm &amp; Record
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Purchase Modal */}
      {editModal.open && editModal.purchase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
             style={{background:'rgba(15,23,42,0.55)',backdropFilter:'blur(4px)'}}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100"
                 style={{background:'linear-gradient(135deg,#eff6ff,#eef2ff)'}}>
              <div className="flex items-center gap-3">
                <span className="h-9 w-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow">
                  <Edit className="h-5 w-5 text-white" />
                </span>
                <div>
                  <h3 className="text-base font-bold text-gray-900">Edit Purchase</h3>
                  <p className="text-xs text-gray-500 font-mono">{editModal.purchase.purchase_id}</p>
                </div>
                <button onClick={() => setEditModal({ open: false, purchase: null })}
                  className="ml-auto text-gray-400 hover:text-gray-600">
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
            <form onSubmit={handleEditPurchase}>
              <div className="p-6 space-y-4">
                <div className="rounded-xl px-4 py-3 mb-2"
                     style={{background:'linear-gradient(135deg,#f5f3ff,#eef2ff)'}}>
                  <p className="font-semibold text-gray-900 text-sm">{editModal.purchase.product_name}</p>
                  {editModal.purchase.variety && <p className="text-xs text-gray-400">{editModal.purchase.variety}</p>}
                  <p className="text-xs text-gray-400 mt-0.5 capitalize">{editModal.purchase.category} · {editModal.purchase.unit}</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">
                      Quantity ({editModal.purchase.unit})
                    </label>
                    <input type="number" min="0.01" step="0.01" required className="input-field !text-sm"
                      value={editForm.quantity}
                      onChange={e => setEditForm(f => ({...f, quantity: e.target.value}))} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Price / Unit (₹)</label>
                    <input type="number" min="0" step="0.01" required className="input-field !text-sm"
                      value={editForm.price_per_unit}
                      onChange={e => setEditForm(f => ({...f, price_per_unit: e.target.value}))} />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Supplier</label>
                  <input type="text" className="input-field !text-sm" placeholder="Supplier name"
                    value={editForm.supplier}
                    onChange={e => setEditForm(f => ({...f, supplier: e.target.value}))} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Purchase Date</label>
                  <input type="date" className="input-field !text-sm"
                    value={editForm.purchase_date}
                    onChange={e => setEditForm(f => ({...f, purchase_date: e.target.value}))} />
                </div>
                {editForm.quantity && editForm.price_per_unit && (
                  <div className="rounded-xl px-4 py-3"
                       style={{background:'linear-gradient(135deg,#eff6ff,#eef2ff)'}}>
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-semibold text-gray-500 uppercase">Updated Total</span>
                      <span className="text-xl font-extrabold text-blue-700">
                        ₹{(parseFloat(editForm.quantity||0)*parseFloat(editForm.price_per_unit||0)).toLocaleString('en-IN',{minimumFractionDigits:2})}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">
                      Stock will be adjusted by{' '}
                      <strong className={parseFloat(editForm.quantity) - editModal.purchase.quantity >= 0 ? 'text-green-600' : 'text-red-600'}>
                        {parseFloat(editForm.quantity) - editModal.purchase.quantity >= 0 ? '+' : ''}{(parseFloat(editForm.quantity||0) - editModal.purchase.quantity).toFixed(2)} {editModal.purchase.unit}
                      </strong>
                    </p>
                  </div>
                )}
              </div>
              <div className="px-6 py-4 border-t border-gray-100 flex gap-3"
                   style={{background:'linear-gradient(90deg,#f8faff,#f5f3ff)'}}>
                <button type="button"
                  onClick={() => setEditModal({ open: false, purchase: null })}
                  className="flex-1 py-2.5 rounded-xl font-semibold text-sm text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={editSubmitting}
                  className="flex-1 py-2.5 rounded-xl font-bold text-sm text-white shadow-lg hover:shadow-xl active:scale-95 transition-all disabled:opacity-50"
                  style={{background:'linear-gradient(135deg,#6366f1,#8b5cf6)'}}>
                  {editSubmitting ? 'Saving...' : '✓ Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New Product Modal */}
      {showNewProductModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
             style={{background:'rgba(15,23,42,0.55)',backdropFilter:'blur(4px)'}}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b border-gray-100 flex-shrink-0"
                 style={{background:'linear-gradient(135deg,#ecfdf5,#d1fae5)'}}>
              <div className="flex items-center gap-3">
                <span className="h-9 w-9 rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center shadow">
                  <Plus className="h-5 w-5 text-white" />
                </span>
                <div>
                  <h3 className="text-base font-bold text-gray-900">Create New Product</h3>
                  <p className="text-xs text-gray-500">Product will be added to inventory and selected</p>
                </div>
                <button onClick={() => setShowNewProductModal(false)}
                  className="ml-auto text-gray-400 hover:text-gray-600">
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
            <form onSubmit={handleCreateProduct} className="overflow-y-auto">
              <div className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Product ID *</label>
                    <input type="text" required className="input-field !text-sm"
                      placeholder="e.g. PROD001"
                      value={newProductForm.product_id}
                      onChange={e => setNewProductForm(f => ({...f, product_id: e.target.value}))} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Category *</label>
                    <select required className="input-field !text-sm"
                      value={newProductForm.category}
                      onChange={e => setNewProductForm(f => ({...f, category: e.target.value}))}>
                      <option value="">-- Select --</option>
                      {categories.map(c => (
                        <option key={c.id} value={c.name}>{c.name.charAt(0).toUpperCase()+c.name.slice(1)}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Product Name *</label>
                    <input type="text" required className="input-field !text-sm"
                      placeholder="e.g. Tomato Seeds"
                      value={newProductForm.product_name}
                      onChange={e => setNewProductForm(f => ({...f, product_name: e.target.value}))} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Variety</label>
                    <input type="text" className="input-field !text-sm"
                      placeholder="e.g. Hybrid F1"
                      value={newProductForm.variety}
                      onChange={e => setNewProductForm(f => ({...f, variety: e.target.value}))} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Unit *</label>
                    <select required className="input-field !text-sm"
                      value={newProductForm.unit}
                      onChange={e => setNewProductForm(f => ({...f, unit: e.target.value}))}>
                      <option value="kg">kg</option>
                      <option value="packet">packet</option>
                      <option value="bag">bag</option>
                      <option value="liters">liters</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Initial Quantity</label>
                    <input type="number" min="0" step="0.01" className="input-field !text-sm"
                      value={newProductForm.quantity_available}
                      onChange={e => setNewProductForm(f => ({...f, quantity_available: e.target.value}))} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Purchase Price (₹) *</label>
                    <input type="number" min="0" step="0.01" required className="input-field !text-sm"
                      placeholder="Cost per unit"
                      value={newProductForm.purchase_price}
                      onChange={e => setNewProductForm(f => ({...f, purchase_price: e.target.value}))} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Selling Price (₹) *</label>
                    <input type="number" min="0" step="0.01" required className="input-field !text-sm"
                      placeholder="Price per unit"
                      value={newProductForm.selling_price}
                      onChange={e => setNewProductForm(f => ({...f, selling_price: e.target.value}))} />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Supplier</label>
                  <input type="text" className="input-field !text-sm" placeholder="Optional"
                    value={newProductForm.supplier}
                    onChange={e => setNewProductForm(f => ({...f, supplier: e.target.value}))} />
                </div>
              </div>
              <div className="px-6 py-4 border-t border-gray-100 flex gap-3 flex-shrink-0"
                   style={{background:'linear-gradient(90deg,#ecfdf5,#d1fae5)'}}>
                <button type="button"
                  onClick={() => setShowNewProductModal(false)}
                  className="flex-1 py-2.5 rounded-xl font-semibold text-sm text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={newProductSubmitting}
                  className="flex-1 py-2.5 rounded-xl font-bold text-sm text-white shadow-lg hover:shadow-xl active:scale-95 transition-all disabled:opacity-50"
                  style={{background:'linear-gradient(135deg,#059669,#10b981)'}}>
                  {newProductSubmitting ? 'Creating...' : '+ Create & Select Product'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Purchases;
