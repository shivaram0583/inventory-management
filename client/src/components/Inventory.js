import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import SharedModal from './shared/Modal';
import CustomSelect from './shared/CustomSelect';
import useSortableData from '../hooks/useSortableData';
import SortableHeader from './shared/SortableHeader';
import {
  Plus,
  Search,
  Edit,
  Trash2,
  AlertTriangle,
  X
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

const PRODUCT_CREATION_MODE = {
  INVENTORY: 'inventory',
  ORDER: 'order'
};

const num = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const fmtMoney = (value) => `₹${num(value).toLocaleString('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})}`;

const getEmptyFormData = (defaultCategory = 'seeds') => ({
  product_id: '',
  category: defaultCategory,
  product_name: '',
  variety: '',
  quantity_available: '',
  unit: 'kg',
  purchase_price: '',
  selling_price: '',
  supplier: '',
  creation_mode: PRODUCT_CREATION_MODE.INVENTORY,
  order_quantity: '',
  order_date: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }),
  advance_amount: '',
  bank_account_id: '',
  addStock: ''
});

const Inventory = () => {
  const { user, dailySetupStatus } = useAuth();
  const [products, setProducts] = useState([]);
  const [filteredProducts, setFilteredProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showAddStockModal, setShowAddStockModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [duplicateIdModal, setDuplicateIdModal] = useState(false);
  const [deleteConfirmModal, setDeleteConfirmModal] = useState({ open: false, product: null });
  const { sortedItems: sortedProducts, sortConfig: invSort, requestSort: sortInv } = useSortableData(filteredProducts, { key: 'created_at', direction: 'desc' });
  const [actionModal, setActionModal] = useState({ open: false, title: '', message: '', type: 'success' });
  const [formData, setFormData] = useState(getEmptyFormData());

  const closeActionModal = () => setActionModal((prev) => ({ ...prev, open: false }));
  const showActionModal = (title, message, type = 'success') => {
    setActionModal({ open: true, title, message, type });
  };

  useEffect(() => {
    fetchProducts();
    axios.get('/api/purchases/categories').then(r => setCategories(r.data || [])).catch(() => {});
    axios.get('/api/transactions/bank-accounts').then(r => setBankAccounts(r.data || [])).catch(() => {});
  }, []);

  useEffect(() => {
    const preferredBank = dailySetupStatus?.selectedBankAccountId || bankAccounts[0]?.id || '';
    if (preferredBank && !formData.bank_account_id) {
      setFormData((current) => ({ ...current, bank_account_id: String(preferredBank) }));
    }
  }, [dailySetupStatus?.selectedBankAccountId, bankAccounts, formData.bank_account_id]);

  const fetchProducts = async () => {
    try {
      const response = await axios.get('/api/inventory');
      setProducts(response.data);
    } catch (error) {
      setError('Failed to fetch products');
      console.error('Fetch products error:', error);
    } finally {
      setLoading(false);
    }
  };

  const filterProducts = useCallback(() => {
    let filtered = products;

    if (searchTerm) {
      filtered = filtered.filter(product =>
        product.product_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.variety?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.product_id.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (categoryFilter !== 'all') {
      filtered = filtered.filter(product => product.category === categoryFilter);
    }

    setFilteredProducts(filtered);
  }, [products, searchTerm, categoryFilter]);

  useEffect(() => {
    filterProducts();
  }, [filterProducts]);

  const handleAddProduct = async (e) => {
    e.preventDefault();
    const { product_name, product_id, creation_mode } = formData;
    const inventoryQuantity = num(formData.quantity_available);
    const orderQuantity = num(formData.order_quantity);
    const advanceAmount = num(formData.advance_amount);
    const purchasePrice = num(formData.purchase_price);

    if (creation_mode === PRODUCT_CREATION_MODE.INVENTORY && inventoryQuantity <= 0) {
      setError('Enter stock quantity when adding the new product directly to inventory');
      showActionModal('Add Product Failed', 'Enter stock quantity when adding the new product directly to inventory', 'error');
      return;
    }

    if (creation_mode === PRODUCT_CREATION_MODE.ORDER && orderQuantity <= 0) {
      setError('Enter order quantity when creating a pending order');
      showActionModal('Add Product Failed', 'Enter order quantity when creating a pending order', 'error');
      return;
    }

    if (creation_mode === PRODUCT_CREATION_MODE.ORDER && advanceAmount > (orderQuantity * purchasePrice)) {
      setError('Advance amount cannot be more than the total order amount');
      showActionModal('Add Product Failed', 'Advance amount cannot be more than the total order amount', 'error');
      return;
    }

    if (creation_mode === PRODUCT_CREATION_MODE.ORDER && advanceAmount > 0 && !String(formData.supplier || '').trim()) {
      setError('Supplier is required when paying an advance amount');
      showActionModal('Add Product Failed', 'Supplier is required when paying an advance amount', 'error');
      return;
    }

    if (creation_mode === PRODUCT_CREATION_MODE.ORDER && advanceAmount > 0 && !formData.bank_account_id) {
      setError('Select a bank account for the advance payment');
      showActionModal('Add Product Failed', 'Select a bank account for the advance payment', 'error');
      return;
    }

    try {
      await axios.post('/api/inventory', {
        ...formData,
        quantity_available: creation_mode === PRODUCT_CREATION_MODE.ORDER ? 0 : inventoryQuantity,
        purchase_price: purchasePrice,
        selling_price: num(formData.selling_price),
        order_quantity: creation_mode === PRODUCT_CREATION_MODE.ORDER ? orderQuantity : undefined,
        advance_amount: creation_mode === PRODUCT_CREATION_MODE.ORDER ? advanceAmount : undefined,
        bank_account_id: creation_mode === PRODUCT_CREATION_MODE.ORDER && advanceAmount > 0
          ? Number(formData.bank_account_id)
          : undefined
      });
      setShowAddModal(false);
      resetForm();
      await fetchProducts();
      showActionModal(
        creation_mode === PRODUCT_CREATION_MODE.ORDER ? 'Product Ordered' : 'Product Added',
        creation_mode === PRODUCT_CREATION_MODE.ORDER
          ? `Created "${product_name}" (${product_id}) and recorded a pending order for ${orderQuantity}.`
          : `Added "${product_name}" (${product_id}) to inventory.`
      );
    } catch (error) {
      if (error.response?.status === 400 && error.response?.data?.message === 'Product ID already exists') {
        setDuplicateIdModal(true);
      } else {
        const message = error.response?.data?.message || 'Failed to add product';
        setError(message);
        showActionModal('Add Product Failed', message, 'error');
      }
    }
  };

  const handleUpdateProduct = async (e) => {
    e.preventDefault();
    const updatedName = selectedProduct?.product_name || formData.product_name;
    const productCode = selectedProduct?.product_id || formData.product_id;
    try {
      await axios.put(`/api/inventory/${selectedProduct.id}`, {
        selling_price: num(formData.selling_price)
      });
      setShowEditModal(false);
      resetForm();
      await fetchProducts();
      showActionModal('Price Updated', `Updated selling price for "${updatedName}" (${productCode}).`);
    } catch (error) {
      const message = error.response?.data?.message || 'Failed to update product';
      setError(message);
      showActionModal('Update Failed', message, 'error');
    }
  };

  const handleDeleteProduct = async (product) => {
    setDeleteConfirmModal({ open: true, product });
  };

  const confirmDeleteProduct = async () => {
    const product = deleteConfirmModal.product;
    setDeleteConfirmModal({ open: false, product: null });
    if (!product) return;
    try {
      await axios.delete(`/api/inventory/${product.id}`);
      await fetchProducts();
      showActionModal('Product Deleted', `Deleted "${product.product_name}" (${product.product_id}).`, 'warning');
    } catch (error) {
      const message = error.response?.data?.message || 'Failed to delete product';
      setError(message);
      showActionModal('Delete Failed', message, 'error');
    }
  };

  const handleAddStock = async (e) => {
    e.preventDefault();
    const quantityToAdd = num(formData.addStock);
    const productName = selectedProduct?.product_name;
    try {
      await axios.post(`/api/inventory/${selectedProduct.id}/add-stock`, {
        quantity: quantityToAdd
      });
      setShowAddStockModal(false);
      resetForm();
      await fetchProducts();
      showActionModal('Stock Updated', `Added ${quantityToAdd} ${selectedProduct?.unit || ''} to "${productName}".`);
    } catch (error) {
      const message = error.response?.data?.message || 'Failed to add stock';
      setError(message);
      showActionModal('Stock Update Failed', message, 'error');
    }
  };

  const fetchNextId = async (category) => {
    try {
      const res = await axios.get(`/api/inventory/next-id?category=${category}`);
      setFormData(f => ({...f, product_id: res.data.nextId}));
    } catch (err) {
      console.error('Failed to fetch next ID:', err);
    }
  };

  const resetForm = () => {
    setFormData(getEmptyFormData(categories[0]?.name || 'seeds'));
    setSelectedProduct(null);
  };

  const openEditModal = (product) => {
    setSelectedProduct(product);
    setFormData({
      product_id: product.product_id,
      category: product.category,
      product_name: product.product_name,
      variety: product.variety || '',
      quantity_available: product.quantity_available,
      unit: product.unit,
      purchase_price: product.purchase_price,
      selling_price: product.selling_price,
      supplier: product.supplier || '',
      creation_mode: PRODUCT_CREATION_MODE.INVENTORY,
      order_quantity: '',
      order_date: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }),
      advance_amount: '',
      bank_account_id: dailySetupStatus?.selectedBankAccountId ? String(dailySetupStatus.selectedBankAccountId) : '',
      addStock: ''
    });
    setShowEditModal(true);
  };

  const openAddStockModal = (product) => {
    setSelectedProduct(product);
    setFormData((current) => ({ ...current, addStock: '' }));
    setShowAddStockModal(true);
  };

  const isAdmin = user.role === 'admin';
  const canEdit = user.role === 'admin' || user.role === 'operator';
  const bankOptions = bankAccounts.map((account) => ({
    value: String(account.id),
    label: `${account.account_name} - ${account.bank_name} (${fmtMoney(account.balance)})`
  }));

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* Header banner */}
      <div className="rounded-2xl px-7 py-5 flex items-center justify-between shadow-lg overflow-hidden relative"
           style={{background:'linear-gradient(135deg,#0c4a6e 0%,#0369a1 45%,#0891b2 100%)'}}>
        <div className="absolute inset-0 opacity-10 pointer-events-none"
             style={{backgroundImage:'radial-gradient(circle at 80% 50%,#7dd3fc,transparent 60%)'}} />
        <div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight">✦ Inventory Management</h1>
          <p className="mt-0.5 text-sm text-sky-200">Manage your seeds and fertilizers inventory</p>
        </div>
        {canEdit && (
          <button
            onClick={() => {
              const cat = categories[0]?.name || 'seeds';
              setFormData(getEmptyFormData(cat));
              fetchNextId(cat);
              setShowAddModal(true);
            }}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white shadow-xl hover:shadow-2xl active:scale-95 transition-all duration-200 border border-white/20"
            style={{background:'linear-gradient(135deg,rgba(255,255,255,0.2),rgba(255,255,255,0.1))',backdropFilter:'blur(8px)'}}
          >
            <Plus className="h-4 w-4" />
            Add Product
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 px-4 py-3 text-red-700 text-sm"
             style={{background:'linear-gradient(90deg,#fff5f5,#fef2f2)'}}>⚠ {error}</div>
      )}

      {/* Filters */}
      <div className="card !py-4 relative z-20">
        <div className="flex flex-col sm:flex-row gap-4 items-center">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search products..."
                className="input-field pl-10"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          <div className="w-full sm:w-52 flex-shrink-0">
            <CustomSelect
              options={[{ value: 'all', label: 'All Categories' }, ...categories.map(c => ({ value: c.name, label: c.name.charAt(0).toUpperCase() + c.name.slice(1) }))]}
              value={categoryFilter}
              onChange={(val) => setCategoryFilter(val)}
            />
          </div>
        </div>
      </div>

      {/* Products Table */}
      <div className="card">
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <SortableHeader label="Product ID" sortKey="product_id" sortConfig={invSort} onSort={sortInv} />
                <SortableHeader label="Name" sortKey="product_name" sortConfig={invSort} onSort={sortInv} />
                <SortableHeader label="Variety" sortKey="variety" sortConfig={invSort} onSort={sortInv} />
                <SortableHeader label="Category" sortKey="category" sortConfig={invSort} onSort={sortInv} />
                <SortableHeader label="Stock" sortKey="quantity_available" sortConfig={invSort} onSort={sortInv} />
                <SortableHeader label="Unit Price" sortKey="selling_price" sortConfig={invSort} onSort={sortInv} />
                {canEdit && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {sortedProducts.map((product) => (
                <tr key={product.id} className={product.quantity_available <= 10 ? 'bg-red-50' : ''}>
                  <td className="font-medium">{product.product_id}</td>
                  <td>{product.product_name}</td>
                  <td>{product.variety || '-'}</td>
                  <td className="capitalize">{product.category}</td>
                  <td>
                    <div className="flex items-center">
                      {product.quantity_available <= 10 && (
                        <AlertTriangle className="h-4 w-4 text-red-500 mr-1" />
                      )}
                      <span className={product.quantity_available <= 10 ? 'text-red-600 font-medium' : ''}>
                        {product.quantity_available} {product.unit}
                      </span>
                    </div>
                  </td>
                  <td>₹{product.selling_price}/{product.unit}</td>
                  {canEdit && (
                    <td>
                      <div className="flex space-x-2">
                        <button
                          onClick={() => openEditModal(product)}
                          className="text-blue-600 hover:text-blue-800"
                          title="Edit product"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => openAddStockModal(product)}
                          className="text-green-600 hover:text-green-800"
                          title="Add stock"
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                        {isAdmin && (
                          <button
                            onClick={() => handleDeleteProduct(product)}
                            className="text-red-600 hover:text-red-800"
                            title="Delete product"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {filteredProducts.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              No products found
            </div>
          )}
        </div>
      </div>

      {/* Add Product Modal */}
      {showAddModal && (
        <Modal title="Add New Product" onClose={() => setShowAddModal(false)}>
          <form onSubmit={handleAddProduct} className="space-y-4">
            <div className="grid grid-cols-2 gap-2 rounded-xl bg-gray-100 p-1">
              <button
                type="button"
                onClick={() => setFormData((current) => ({ ...current, creation_mode: PRODUCT_CREATION_MODE.INVENTORY }))}
                className={`rounded-lg px-3 py-2 text-sm font-semibold transition-all ${formData.creation_mode === PRODUCT_CREATION_MODE.INVENTORY ? 'bg-white text-emerald-700 shadow-sm' : 'text-gray-500'}`}
              >
                Add To Inventory
              </button>
              <button
                type="button"
                onClick={() => setFormData((current) => ({ ...current, creation_mode: PRODUCT_CREATION_MODE.ORDER, quantity_available: '0' }))}
                className={`rounded-lg px-3 py-2 text-sm font-semibold transition-all ${formData.creation_mode === PRODUCT_CREATION_MODE.ORDER ? 'bg-white text-amber-700 shadow-sm' : 'text-gray-500'}`}
              >
                Create Order
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Product ID <span className="text-xs text-gray-400">(auto)</span></label>
                <input
                  type="text"
                  readOnly
                  className="input-field bg-gray-50 text-gray-500 cursor-not-allowed"
                  value={formData.product_id}
                  placeholder="Auto-generated..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <CustomSelect
                  required
                  options={categories.map(c => ({ value: c.name, label: c.name.charAt(0).toUpperCase() + c.name.slice(1) }))}
                  value={formData.category}
                  onChange={(val) => { setFormData(f => ({...f, category: val})); fetchNextId(val); }}
                  placeholder="Select category"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Product Name</label>
              <input
                type="text"
                required
                className="input-field"
                value={formData.product_name}
                onChange={(e) => setFormData({...formData, product_name: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Variety</label>
              <input
                type="text"
                className="input-field"
                value={formData.variety}
                onChange={(e) => setFormData({...formData, variety: e.target.value})}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {formData.creation_mode === PRODUCT_CREATION_MODE.ORDER ? 'Opening Stock' : 'Quantity'}
                </label>
                <input
                  type="number"
                  step="1"
                  required={formData.creation_mode === PRODUCT_CREATION_MODE.INVENTORY}
                  className={`input-field ${formData.creation_mode === PRODUCT_CREATION_MODE.ORDER ? 'bg-gray-50 text-gray-500 cursor-not-allowed' : ''}`}
                  value={formData.creation_mode === PRODUCT_CREATION_MODE.ORDER ? '0' : formData.quantity_available}
                  onChange={(e) => setFormData({...formData, quantity_available: e.target.value})}
                  readOnly={formData.creation_mode === PRODUCT_CREATION_MODE.ORDER}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Unit</label>
                <CustomSelect
                  required
                  options={UNIT_OPTIONS}
                  value={formData.unit}
                  onChange={(val) => setFormData({...formData, unit: val})}
                  placeholder="Select unit"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Purchase Price</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  className="input-field"
                  value={formData.purchase_price}
                  onChange={(e) => setFormData({...formData, purchase_price: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Selling Price</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  className="input-field"
                  value={formData.selling_price}
                  onChange={(e) => setFormData({...formData, selling_price: e.target.value})}
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Supplier</label>
              <input
                type="text"
                className="input-field"
                value={formData.supplier}
                onChange={(e) => setFormData({...formData, supplier: e.target.value})}
                placeholder={formData.creation_mode === PRODUCT_CREATION_MODE.ORDER ? 'Recommended for order tracking' : 'Optional'}
              />
            </div>

            {formData.creation_mode === PRODUCT_CREATION_MODE.ORDER && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Order Quantity</label>
                    <input
                      type="number"
                      step="1"
                      min="1"
                      required={formData.creation_mode === PRODUCT_CREATION_MODE.ORDER}
                      className="input-field"
                      value={formData.order_quantity}
                      onChange={(e) => setFormData({ ...formData, order_quantity: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Order Date</label>
                    <input
                      type="date"
                      required={formData.creation_mode === PRODUCT_CREATION_MODE.ORDER}
                      className="input-field"
                      value={formData.order_date}
                      onChange={(e) => setFormData({ ...formData, order_date: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Advance From Bank (₹)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      className="input-field"
                      value={formData.advance_amount}
                      onChange={(e) => setFormData({ ...formData, advance_amount: e.target.value })}
                      placeholder="0 if no advance"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Bank Account</label>
                    {bankOptions.length > 0 ? (
                      <CustomSelect
                        options={bankOptions}
                        value={formData.bank_account_id}
                        onChange={(val) => setFormData({ ...formData, bank_account_id: val })}
                        placeholder="Select bank"
                      />
                    ) : (
                      <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                        Add a bank account in Transactions before recording an advance payment.
                      </div>
                    )}
                  </div>
                </div>
                <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-xs text-amber-700">
                  This will create the product with zero stock and record a pending purchase order for it.
                </div>
              </>
            )}

            {formData.creation_mode === PRODUCT_CREATION_MODE.INVENTORY && (
              <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-xs text-emerald-700">
                This will create the product and add the entered quantity directly into inventory now.
              </div>
            )}

            <div className="flex justify-end space-x-3 pt-4">
              <button
                type="button"
                onClick={() => { setShowAddModal(false); resetForm(); }}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button type="submit" className="btn-primary">
                {formData.creation_mode === PRODUCT_CREATION_MODE.ORDER ? 'Create Product & Order' : 'Add Product To Inventory'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Edit Product Modal */}
      {showEditModal && (
        <Modal title="Update Selling Price" onClose={() => setShowEditModal(false)}>
          <form onSubmit={handleUpdateProduct} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Product ID</p>
                <p className="mt-1 font-semibold text-gray-900">{selectedProduct?.product_id}</p>
              </div>
              <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Category</p>
                <p className="mt-1 font-semibold text-gray-900 capitalize">{selectedProduct?.category}</p>
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Product</p>
              <p className="mt-1 font-semibold text-gray-900">{selectedProduct?.product_name}</p>
              {selectedProduct?.variety && <p className="mt-1 text-sm text-gray-500">{selectedProduct.variety}</p>}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Current Stock</p>
                <p className="mt-1 font-semibold text-gray-900">{selectedProduct?.quantity_available} {selectedProduct?.unit}</p>
              </div>
              <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Supplier</p>
                <p className="mt-1 font-semibold text-gray-900">{selectedProduct?.supplier || 'Not set'}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Purchase Price</p>
                <p className="mt-1 font-semibold text-gray-900">{fmtMoney(selectedProduct?.purchase_price)}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Selling Price</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  className="input-field"
                  value={formData.selling_price}
                  onChange={(e) => setFormData({...formData, selling_price: e.target.value})}
                />
              </div>
            </div>

            <p className="text-xs text-gray-500">
              To change stock, use <span className="font-semibold">Add Quantity</span>. To bring in new stock later, create an order from inventory or purchases.
            </p>

            <div className="flex justify-end space-x-3 pt-4">
              <button
                type="button"
                onClick={() => setShowEditModal(false)}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button type="submit" className="btn-primary">
                Update Selling Price
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Add Stock Modal */}
      {showAddStockModal && (
        <Modal title={`Add Stock - ${selectedProduct?.product_name}`} onClose={() => setShowAddStockModal(false)}>
          <form onSubmit={handleAddStock} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Quantity to Add ({selectedProduct?.unit})
              </label>
              <input
                type="number"
                step="1"
                required
                className="input-field"
                value={formData.addStock}
                onChange={(e) => setFormData({...formData, addStock: e.target.value})}
                placeholder="Enter quantity to add"
              />
            </div>
            <div className="bg-gray-50 p-3 rounded-lg">
              <p className="text-sm text-gray-600">
                Current Stock: {selectedProduct?.quantity_available} {selectedProduct?.unit}
              </p>
              <p className="text-sm text-gray-600">
                After Adding: {selectedProduct?.quantity_available + (parseInt(formData.addStock) || 0)} {selectedProduct?.unit}
              </p>
            </div>
            <div className="flex justify-end space-x-3 pt-4">
              <button
                type="button"
                onClick={() => setShowAddStockModal(false)}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button type="submit" className="btn-primary">
                Add Stock
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Duplicate Product ID Modal */}
      <SharedModal
        isOpen={duplicateIdModal}
        onClose={() => setDuplicateIdModal(false)}
        title="Duplicate Product ID"
        type="error"
        theme="inventory"
        confirmText="OK"
      >
        <p>A product with ID <strong>"{formData.product_id}"</strong> already exists.</p>
        <p className="mt-2">Please use a different Product ID.</p>
      </SharedModal>

      {/* Delete Confirmation Modal */}
      <SharedModal
        isOpen={deleteConfirmModal.open}
        onClose={() => setDeleteConfirmModal({ open: false, product: null })}
        title="Delete Product"
        type="warning"
        theme="inventory"
        confirmText="Delete"
        onConfirm={confirmDeleteProduct}
      >
        <p>Are you sure you want to delete <strong>"{deleteConfirmModal.product?.product_name}"</strong>?</p>
        <p className="mt-2">This action cannot be undone.</p>
      </SharedModal>

      {/* Action Feedback Modal */}
      <SharedModal
        isOpen={actionModal.open}
        onClose={closeActionModal}
        title={actionModal.title}
        type={actionModal.type}
        theme="inventory"
        confirmText="OK"
        hideClose={false}
      >
        <p>{actionModal.message}</p>
      </SharedModal>
    </div>
  );
};

const getInventoryModalMeta = (title) => {
  if (title === 'Add New Product') {
    return {
      eyebrow: 'Inventory Form',
      headerBg: 'linear-gradient(135deg,#e0f2fe,#cffafe)',
      borderColor: 'border-sky-100/80',
      headerBorder: 'border-sky-100/80',
      Icon: Plus,
      iconBg: 'linear-gradient(135deg,#0ea5e9,#0284c7)'
    };
  }

  if (title === 'Update Selling Price') {
    return {
      eyebrow: 'Price Update',
      headerBg: 'linear-gradient(135deg,#e0f2fe,#cffafe)',
      borderColor: 'border-sky-100/80',
      headerBorder: 'border-sky-100/80',
      Icon: Edit,
      iconBg: 'linear-gradient(135deg,#0284c7,#0369a1)'
    };
  }

  return {
    eyebrow: 'Stock Update',
    headerBg: 'linear-gradient(135deg,#e0f2fe,#cffafe)',
    borderColor: 'border-sky-100/80',
    headerBorder: 'border-sky-100/80',
    Icon: Plus,
    iconBg: 'linear-gradient(135deg,#06b6d4,#0891b2)'
  };
};

const Modal = ({ title, children, onClose }) => {
  const meta = getInventoryModalMeta(title);
  const HeaderIcon = meta.Icon;
  const modalContent = (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         style={{background:'rgba(15,23,42,0.55)',backdropFilter:'blur(4px)'}}>
      <div className={`bg-white rounded-2xl shadow-2xl w-full max-w-lg animate-scale-in flex flex-col border overflow-hidden ${meta.borderColor}`}
           style={{maxHeight:'85vh'}}>
        <div className={`flex justify-between items-center px-6 pt-5 pb-4 border-b flex-shrink-0 ${meta.headerBorder}`}
             style={{ background: meta.headerBg }}>
          <div className="flex items-center gap-3">
            <span className="h-9 w-9 rounded-xl flex items-center justify-center shadow"
                  style={{ background: meta.iconBg }}>
              <HeaderIcon className="h-5 w-5 text-white" />
            </span>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-sky-700/70">{meta.eyebrow}</p>
              <h3 className="text-lg font-bold text-slate-900">{title}</h3>
            </div>
          </div>
          <button onClick={onClose}
            className="h-8 w-8 rounded-lg flex items-center justify-center text-sky-400 hover:text-sky-700 hover:bg-white/80 transition-all">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="px-6 py-5 overflow-y-auto flex-1" style={{scrollbarWidth:'thin'}}>
          {children}
        </div>
      </div>
    </div>
  );

  if (typeof document === 'undefined') {
    return modalContent;
  }

  return createPortal(modalContent, document.body);
};

export default Inventory;
