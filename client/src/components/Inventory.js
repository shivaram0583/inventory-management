import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import SharedModal from './shared/Modal';
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

const Inventory = () => {
  const { user } = useAuth();
  const [products, setProducts] = useState([]);
  const [filteredProducts, setFilteredProducts] = useState([]);
  const [categories, setCategories] = useState([]);
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
  const [formData, setFormData] = useState({
    product_id: '',
    category: 'seeds',
    product_name: '',
    variety: '',
    quantity_available: '',
    unit: 'kg',
    purchase_price: '',
    selling_price: ''
  });

  const closeActionModal = () => setActionModal((prev) => ({ ...prev, open: false }));
  const showActionModal = (title, message, type = 'success') => {
    setActionModal({ open: true, title, message, type });
  };

  useEffect(() => {
    fetchProducts();
    axios.get('/api/purchases/categories').then(r => setCategories(r.data || [])).catch(() => {});
  }, []);

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
    const { product_name, product_id } = formData;
    try {
      await axios.post('/api/inventory', formData);
      setShowAddModal(false);
      resetForm();
      await fetchProducts();
      showActionModal('Product Added', `Added "${product_name}" (${product_id}) to inventory.`);
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
    const updatedName = formData.product_name;
    const productCode = selectedProduct?.product_id || formData.product_id;
    try {
      await axios.put(`/api/inventory/${selectedProduct.id}`, formData);
      setShowEditModal(false);
      resetForm();
      await fetchProducts();
      showActionModal('Product Updated', `Updated "${updatedName}" (${productCode}).`);
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
    const quantityToAdd = parseFloat(formData.addStock) || 0;
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
    setFormData({
      product_id: '',
      category: categories[0]?.name || 'seeds',
      product_name: '',
      variety: '',
      quantity_available: '',
      unit: 'kg',
      purchase_price: '',
      selling_price: '',
      addStock: ''
    });
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
      selling_price: product.selling_price
    });
    setShowEditModal(true);
  };

  const openAddStockModal = (product) => {
    setSelectedProduct(product);
    setFormData({ addStock: '' });
    setShowAddStockModal(true);
  };

  const isAdmin = user.role === 'admin';
  const canEdit = user.role === 'admin' || user.role === 'operator';

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
            onClick={() => { resetForm(); const cat = categories[0]?.name || 'seeds'; setFormData(f => ({...f, category: cat})); fetchNextId(cat); setShowAddModal(true); }}
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
      <div className="card !py-4">
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
          <div className="flex gap-2 items-center">
            <select
              className="input-field"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
            >
              <option value="all">All Categories</option>
              {categories.map(c => (
                <option key={c.id} value={c.name} className="capitalize">{c.name.charAt(0).toUpperCase() + c.name.slice(1)}</option>
              ))}
            </select>
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
                <select
                  required
                  className="input-field"
                  value={formData.category}
                  onChange={(e) => { const cat = e.target.value; setFormData(f => ({...f, category: cat})); fetchNextId(cat); }}
                >
                  {categories.map(c => (
                    <option key={c.id} value={c.name} className="capitalize">{c.name.charAt(0).toUpperCase() + c.name.slice(1)}</option>
                  ))}
                </select>
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
                <label className="block text-sm font-medium text-gray-700 mb-1">Quantity</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  className="input-field"
                  value={formData.quantity_available}
                  onChange={(e) => setFormData({...formData, quantity_available: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Unit</label>
                <select
                  required
                  className="input-field"
                  value={formData.unit}
                  onChange={(e) => setFormData({...formData, unit: e.target.value})}
                >
                  <option value="kg">kg</option>
                  <option value="packet">packet</option>
                  <option value="bag">bag</option>
                  <option value="liters">liters</option>
                </select>
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
            <div className="flex justify-end space-x-3 pt-4">
              <button
                type="button"
                onClick={() => { setShowAddModal(false); resetForm(); }}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button type="submit" className="btn-primary">
                Add Product
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Edit Product Modal */}
      {showEditModal && (
        <Modal title="Edit Product" onClose={() => setShowEditModal(false)}>
          <form onSubmit={handleUpdateProduct} className="space-y-4">
            {/* Same form fields as Add Product but pre-filled */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Product ID</label>
                <input
                  type="text"
                  readOnly
                  className="input-field bg-gray-50 text-gray-500 cursor-not-allowed"
                  value={formData.product_id}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <select
                  required
                  className="input-field"
                  value={formData.category}
                  onChange={(e) => setFormData(f => ({...f, category: e.target.value}))}
                >
                  {categories.map(c => (
                    <option key={c.id} value={c.name} className="capitalize">{c.name.charAt(0).toUpperCase() + c.name.slice(1)}</option>
                  ))}
                </select>
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
                <label className="block text-sm font-medium text-gray-700 mb-1">Quantity</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  className="input-field"
                  value={formData.quantity_available}
                  onChange={(e) => setFormData({...formData, quantity_available: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Unit</label>
                <select
                  required
                  className="input-field"
                  value={formData.unit}
                  onChange={(e) => setFormData({...formData, unit: e.target.value})}
                >
                  <option value="kg">kg</option>
                  <option value="packet">packet</option>
                  <option value="bag">bag</option>
                  <option value="liters">liters</option>
                </select>
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
            <div className="flex justify-end space-x-3 pt-4">
              <button
                type="button"
                onClick={() => setShowEditModal(false)}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button type="submit" className="btn-primary">
                Update Product
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
                step="0.01"
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
                After Adding: {selectedProduct?.quantity_available + (parseFloat(formData.addStock) || 0)} {selectedProduct?.unit}
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
        confirmText="OK"
        hideClose={false}
      >
        <p>{actionModal.message}</p>
      </SharedModal>
    </div>
  );
};

const Modal = ({ title, children, onClose }) => {
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={onClose} />
        
        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
          <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium text-gray-900">{title}</h3>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-500"
              >
                <X className="h-6 w-6" />
              </button>
            </div>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Inventory;
