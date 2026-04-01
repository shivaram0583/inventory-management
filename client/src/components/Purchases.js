import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import SharedModal from './shared/Modal';
import CustomSelect from './shared/CustomSelect';
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
  CheckCircle,
  Users,
  ChevronRight,
  ArrowLeft
} from 'lucide-react';

const UNIT_OPTIONS = [
  { value: 'kg', label: 'kg' },
  { value: 'grams', label: 'grams' },
  { value: 'packet', label: 'packet' },
  { value: 'bag', label: 'bag' },
  { value: 'liters', label: 'liters' },
  { value: 'ml', label: 'ml' },
  { value: 'pieces', label: 'pieces' },
  { value: 'bottles', label: 'bottles' },
  { value: 'tonnes', label: 'tonnes' },
];

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
  const [productCategoryFilter, setProductCategoryFilter] = useState('all');
  const [submitting, setSubmitting] = useState(false);

  // Category form state
  const [newCategoryName, setNewCategoryName] = useState('');
  const [deleteCatModal, setDeleteCatModal] = useState({ open: false, id: null, name: '' });
  const [deleteSupplierModal, setDeleteSupplierModal] = useState({ open: false, supplier: '' });

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

  const fetchNextProductId = async (category) => {
    if (!category) return;
    try {
      const res = await axios.get(`/api/inventory/next-id?category=${category}`);
      setNewProductForm(f => ({...f, product_id: res.data.nextId}));
    } catch (err) {
      console.error('Failed to fetch next ID:', err);
    }
  };
  const [newProductSubmitting, setNewProductSubmitting] = useState(false);

  // Supplier state
  const [suppliers, setSuppliers] = useState([]);
  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const [supplierDetail, setSupplierDetail] = useState(null);
  const [supplierLoading, setSupplierLoading] = useState(false);

  // Search states for sub-tabs
  const [historySearch, setHistorySearch] = useState('');
  const [supplierSearch, setSupplierSearch] = useState('');
  const [categorySearch, setCategorySearch] = useState('');

  // Filtered purchase history
  const filteredPurchases = purchases.filter(p => {
    if (!historySearch) return true;
    const q = historySearch.toLowerCase();
    return (p.product_name || '').toLowerCase().includes(q)
      || (p.variety || '').toLowerCase().includes(q)
      || (p.purchase_id || '').toLowerCase().includes(q)
      || (p.supplier || '').toLowerCase().includes(q)
      || (p.category || '').toLowerCase().includes(q)
      || (p.added_by_name || '').toLowerCase().includes(q);
  });

  // Filtered suppliers
  const filteredSuppliers = suppliers.filter(s => {
    if (!supplierSearch) return true;
    return (s.supplier || '').toLowerCase().includes(supplierSearch.toLowerCase());
  });

  // Filtered categories
  const filteredCategories = categories.filter(c => {
    if (!categorySearch) return true;
    return (c.name || '').toLowerCase().includes(categorySearch.toLowerCase());
  });

  const { sortedItems: sortedPurchases, sortConfig, requestSort } = useSortableData(filteredPurchases, { key: 'purchase_date', direction: 'desc' });

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [purRes, prodRes, catRes, supRes] = await Promise.all([
        axios.get('/api/purchases'),
        axios.get('/api/inventory'),
        axios.get('/api/purchases/categories'),
        axios.get('/api/purchases/suppliers')
      ]);
      setPurchases(purRes.data || []);
      setProducts(prodRes.data || []);
      setCategories(catRes.data || []);
      setSuppliers(supRes.data || []);
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

  const filteredProducts = products.filter(p => {
    const matchesSearch = p.product_name.toLowerCase().includes(productSearch.toLowerCase()) ||
      p.product_id.toLowerCase().includes(productSearch.toLowerCase()) ||
      (p.variety || '').toLowerCase().includes(productSearch.toLowerCase());
    const matchesCategory = productCategoryFilter === 'all' || p.category === productCategoryFilter;
    return matchesSearch && matchesCategory;
  }
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
        ? purchase.purchase_date.toString().substring(0, 10)
        : new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
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
      // Refresh next IDs for future use
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

  const handleDeleteSupplier = async () => {
    const supplierName = deleteSupplierModal.supplier;
    setDeleteSupplierModal({ open: false, supplier: '' });
    if (!supplierName) return;

    setError('');
    setSuccess('');
    try {
      const res = await axios.delete(`/api/purchases/suppliers/${encodeURIComponent(supplierName)}`);
      const removed = res.data?.removed || {};

      if (selectedSupplier === supplierName) {
        setSelectedSupplier(null);
        setSupplierDetail(null);
      }

      await fetchAll();
      setSuccess(
        `Supplier "${supplierName}" deleted. Removed ${removed.supplier_payments || 0} transaction records and cleared ${removed.purchases || 0} purchase entries.`
      );
      setTimeout(() => setSuccess(''), 5000);
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to delete supplier');
    }
  };

  const fetchSupplierDetail = async (supplierName) => {
    setSupplierLoading(true);
    try {
      const res = await axios.get(`/api/purchases/suppliers/${encodeURIComponent(supplierName)}`);
      setSupplierDetail(res.data);
      setSelectedSupplier(supplierName);
    } catch (e) {
      setError('Failed to load supplier details');
    } finally {
      setSupplierLoading(false);
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
            { id: 'suppliers', label: 'Suppliers', icon: Users },
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
            <div className="flex gap-3 mb-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input type="text" placeholder="Search products..."
                  className="input-field pl-10" value={productSearch}
                  onChange={e => setProductSearch(e.target.value)} />
              </div>
              <div style={{minWidth:'160px'}}>
                <CustomSelect
                  options={[{ value: 'all', label: 'All Categories' }, ...categories.map(c => ({ value: c.name, label: c.name.charAt(0).toUpperCase() + c.name.slice(1) }))]}
                  value={productCategoryFilter}
                  onChange={(val) => setProductCategoryFilter(val)}
                />
              </div>
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
                <div className="rounded-xl p-4 text-sm border-2 border-blue-400 relative"
                     style={{background:'linear-gradient(135deg,#eff6ff,#eef2ff)'}}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-gray-900 text-base">{selectedProduct.product_name}</p>
                      {selectedProduct.variety && <p className="text-sm text-gray-500 mt-0.5">{selectedProduct.variety}</p>}
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className="inline-block text-xs px-2 py-0.5 rounded-full font-semibold capitalize"
                              style={{background:'#ede9fe',color:'#6d28d9'}}>
                          {selectedProduct.category}
                        </span>
                        <span className="text-xs font-bold px-2 py-0.5 rounded-lg bg-blue-100 text-blue-700">
                          {selectedProduct.quantity_available} {selectedProduct.unit}
                        </span>
                      </div>
                    </div>
                    <button type="button" onClick={() => setFormProductId('')}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-gray-500 bg-white border border-gray-200 hover:border-red-300 hover:text-red-600 hover:bg-red-50 transition-all duration-150 shadow-sm flex-shrink-0">
                      <X className="h-3.5 w-3.5" /> Clear
                    </button>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl p-4 border-2 border-dashed border-gray-200 text-center">
                  <p className="text-sm text-gray-400">← Select a product from the list</p>
                </div>
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
          <div className="flex items-center gap-4 mb-4">
            <h3 className="text-base font-bold text-gray-800">Purchase History</h3>
            <div className="relative flex-1 max-w-xs ml-auto">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input type="text" placeholder="Search purchases..."
                className="input-field pl-10 !text-sm" value={historySearch}
                onChange={e => setHistorySearch(e.target.value)} />
            </div>
          </div>
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

      {/* Suppliers Tab */}
      {activeTab === 'suppliers' && (
        <div className="space-y-6">
          {!selectedSupplier ? (
            <>
              <div className="card">
                <div className="flex items-center gap-2 mb-4">
                  <span className="h-6 w-6 rounded-lg bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center">
                    <Users className="h-3.5 w-3.5 text-white" />
                  </span>
                  <h2 className="text-base font-bold text-gray-800">All Suppliers</h2>
                  <span className="ml-auto text-xs font-bold px-2 py-0.5 rounded-full text-white"
                        style={{background:'linear-gradient(135deg,#14b8a6,#059669)'}}>{filteredSuppliers.length}</span>
                </div>
                <div className="relative mb-4">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input type="text" placeholder="Search suppliers..."
                    className="input-field pl-10 !text-sm" value={supplierSearch}
                    onChange={e => setSupplierSearch(e.target.value)} />
                </div>
                {filteredSuppliers.length === 0 ? (
                  <div className="text-center py-10 text-gray-400">
                    <Users className="h-10 w-10 mx-auto mb-2 opacity-20" />
                    <p className="text-sm">No suppliers found. Record purchases with supplier names to see them here.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredSuppliers.map((sup, idx) => (
                      <div key={idx}
                           onClick={() => fetchSupplierDetail(sup.supplier)}
                           className="rounded-xl p-4 border border-gray-100 cursor-pointer hover:border-teal-300 hover:shadow-md transition-all duration-200"
                           style={{background:'linear-gradient(135deg,#f0fdfa,#f0fdf4)'}}>
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-bold text-gray-900">{sup.supplier}</p>
                            <div className="flex gap-4 mt-1 text-xs text-gray-500">
                              <span><strong>{sup.products_supplied}</strong> products</span>
                              <span><strong>{sup.total_purchases}</strong> purchases</span>
                              <span>Last: {sup.last_purchase_date ? fmtDateTime(sup.last_purchase_date) : '—'}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <p className="text-sm font-bold text-teal-700">₹{Number(sup.total_spent || 0).toLocaleString('en-IN', {minimumFractionDigits:2})}</p>
                              <p className="text-xs text-gray-400">{sup.total_quantity} units</p>
                            </div>
                            {isAdmin && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeleteSupplierModal({ open: true, supplier: sup.supplier });
                                }}
                                className="inline-flex items-center gap-1 rounded-lg bg-red-50 px-2.5 py-1.5 text-xs font-bold text-red-600 hover:bg-red-100 transition-colors"
                                title="Delete supplier"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                Delete
                              </button>
                            )}
                            <ChevronRight className="h-4 w-4 text-gray-300" />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <button
                onClick={() => { setSelectedSupplier(null); setSupplierDetail(null); }}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-teal-600 hover:text-teal-800 transition-colors">
                <ArrowLeft className="h-4 w-4" /> Back to all suppliers
              </button>

              {supplierLoading ? (
                <div className="flex flex-col items-center justify-center h-40 gap-3">
                  <div className="relative h-10 w-10">
                    <div className="absolute inset-0 rounded-full border-4 border-teal-100"></div>
                    <div className="absolute inset-0 rounded-full border-4 border-t-teal-500 animate-spin"></div>
                  </div>
                  <p className="text-sm text-teal-400 font-medium">Loading supplier details...</p>
                </div>
              ) : supplierDetail ? (
                <div className="space-y-6">
                  {/* Supplier Header */}
                  <div className="card">
                    <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <h2 className="text-lg font-bold text-gray-900">{supplierDetail.supplier}</h2>
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => setDeleteSupplierModal({ open: true, supplier: supplierDetail.supplier })}
                          className="inline-flex items-center gap-2 self-start rounded-xl bg-red-50 px-4 py-2 text-sm font-bold text-red-600 hover:bg-red-100 transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
                          Delete Supplier
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="rounded-xl p-4" style={{background:'linear-gradient(135deg,#f0fdfa,#ecfdf5)'}}>
                        <p className="text-xs font-semibold text-gray-500 uppercase">Total Purchases</p>
                        <p className="text-2xl font-extrabold text-teal-700">{supplierDetail.summary?.total_purchases || 0}</p>
                      </div>
                      <div className="rounded-xl p-4" style={{background:'linear-gradient(135deg,#eff6ff,#eef2ff)'}}>
                        <p className="text-xs font-semibold text-gray-500 uppercase">Total Items</p>
                        <p className="text-2xl font-extrabold text-blue-700">{Number(supplierDetail.summary?.total_items || 0).toFixed(1)}</p>
                      </div>
                      <div className="rounded-xl p-4" style={{background:'linear-gradient(135deg,#faf5ff,#f5f3ff)'}}>
                        <p className="text-xs font-semibold text-gray-500 uppercase">Total Cost</p>
                        <p className="text-2xl font-extrabold text-purple-700">₹{Number(supplierDetail.summary?.total_cost || 0).toLocaleString('en-IN', {minimumFractionDigits:2})}</p>
                      </div>
                    </div>
                  </div>

                  {/* Products Supplied */}
                  <div className="card">
                    <h3 className="text-base font-bold text-gray-800 mb-4">Products Supplied</h3>
                    <div className="table-container">
                      <table className="table">
                        <thead>
                          <tr>
                            <th>Product ID</th>
                            <th>Product</th>
                            <th>Category</th>
                            <th>Total Qty</th>
                            <th>Total Spent</th>
                            <th>Purchases</th>
                            <th>Last Purchase</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(supplierDetail.products || []).map((p, idx) => (
                            <tr key={idx}>
                              <td className="font-mono text-xs">{p.product_code}</td>
                              <td>
                                <p className="font-medium">{p.product_name}</p>
                                {p.variety && <p className="text-xs text-gray-400">{p.variety}</p>}
                              </td>
                              <td className="capitalize">{p.category}</td>
                              <td>{p.total_quantity} {p.unit}</td>
                              <td className="font-medium">₹{Number(p.total_spent || 0).toLocaleString('en-IN')}</td>
                              <td>{p.purchase_count}</td>
                              <td className="text-sm">{fmtDateTime(p.last_purchase_date)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {(supplierDetail.products || []).length === 0 && (
                        <div className="text-center py-6 text-gray-400 text-sm">No products found</div>
                      )}
                    </div>
                  </div>

                  {/* Purchase History */}
                  <div className="card">
                    <h3 className="text-base font-bold text-gray-800 mb-4">Purchase History</h3>
                    <div className="table-container">
                      <table className="table">
                        <thead>
                          <tr>
                            <th>Purchase ID</th>
                            <th>Product</th>
                            <th>Category</th>
                            <th>Qty</th>
                            <th>Price/Unit</th>
                            <th>Total</th>
                            <th>Date</th>
                            <th>Added By</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(supplierDetail.history || []).map((h, idx) => (
                            <tr key={idx}>
                              <td className="font-mono text-xs">{h.purchase_id}</td>
                              <td>
                                <p className="font-medium">{h.product_name}</p>
                                {h.variety && <p className="text-xs text-gray-400">{h.variety}</p>}
                              </td>
                              <td className="capitalize">{h.category}</td>
                              <td>{h.quantity} {h.unit}</td>
                              <td>₹{Number(h.price_per_unit).toLocaleString('en-IN')}</td>
                              <td className="font-medium">₹{Number(h.total_amount).toLocaleString('en-IN')}</td>
                              <td className="text-sm">{fmtDateTime(h.purchase_date)}</td>
                              <td>{h.added_by || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {(supplierDetail.history || []).length === 0 && (
                        <div className="text-center py-6 text-gray-400 text-sm">No purchase history</div>
                      )}
                    </div>
                  </div>
                </div>
              ) : null}
            </>
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
                    style={{background:'linear-gradient(135deg,#6366f1,#8b5cf6)'}}>{filteredCategories.length}</span>
            </div>
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input type="text" placeholder="Search categories..."
                className="input-field pl-10 !text-sm" value={categorySearch}
                onChange={e => setCategorySearch(e.target.value)} />
            </div>
            <div className="space-y-2">
              {filteredCategories.map(cat => (
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

      <SharedModal
        isOpen={deleteSupplierModal.open}
        onClose={() => setDeleteSupplierModal({ open: false, supplier: '' })}
        title="Delete Supplier"
        type="warning"
        confirmText="Delete"
        onConfirm={handleDeleteSupplier}
      >
        <p>Are you sure you want to delete supplier <span className="font-semibold">"{deleteSupplierModal.supplier}"</span>?</p>
        <p className="mt-2 text-xs text-gray-500">
          This will remove the supplier name from purchases and products, and delete that supplier&apos;s payment records from Transactions.
        </p>
      </SharedModal>

      {/* Purchase Confirmation Modal */}
      {confirmModal.open && confirmModal.data && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
             style={{background:'rgba(15,23,42,0.55)',backdropFilter:'blur(4px)'}}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-scale-in flex flex-col" style={{maxHeight:'85vh'}}>
            <div className="px-6 py-4 border-b border-gray-100 flex-shrink-0"
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
                  className="ml-auto h-8 w-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all">
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
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-scale-in flex flex-col" style={{maxHeight:'85vh'}}>
            <div className="px-6 py-4 border-b border-gray-100 flex-shrink-0"
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
                  className="ml-auto h-8 w-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all">
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
            <form onSubmit={handleEditPurchase} className="flex flex-col flex-1 overflow-hidden">
              <div className="p-6 space-y-4 overflow-y-auto flex-1" style={{scrollbarWidth:'thin'}}>
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
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col animate-scale-in" style={{maxHeight:'85vh'}}>
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
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Product ID <span className="text-gray-400">(auto)</span></label>
                    <input type="text" readOnly className="input-field !text-sm bg-gray-50 text-gray-500 cursor-not-allowed"
                      placeholder="Select category first..."
                      value={newProductForm.product_id} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Category *</label>
                    <CustomSelect
                      required
                      options={categories.map(c => ({ value: c.name, label: c.name.charAt(0).toUpperCase()+c.name.slice(1) }))}
                      value={newProductForm.category}
                      onChange={(val) => { setNewProductForm(f => ({...f, category: val})); fetchNextProductId(val); }}
                      placeholder="-- Select --"
                    />
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
                    <CustomSelect
                      required
                      options={UNIT_OPTIONS}
                      value={newProductForm.unit}
                      onChange={(val) => setNewProductForm(f => ({...f, unit: val}))}
                      placeholder="Select unit"
                    />
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
