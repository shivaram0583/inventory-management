import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import SharedModal from './shared/Modal';
import CustomSelect from './shared/CustomSelect';
import InventoryFlowPanel from './InventoryFlowPanel';
import useSortableData from '../hooks/useSortableData';
import SortableHeader from './shared/SortableHeader';
import { getISTDateString } from '../utils/dateUtils';
import {
  buildProductCreationPayload,
  getEmptyProductCreationForm,
  GST_OPTIONS,
  PRODUCT_CREATION_MODE,
  UNIT_OPTIONS,
  validateProductCreationForm
} from '../utils/productCreation';
import {
  Package,
  Plus,
  Search,
  Edit,
  Trash2,
  AlertTriangle,
  IndianRupee,
  History,
  X
} from 'lucide-react';

const PURCHASE_STATUS = {
  ORDERED: 'ordered',
  DELIVERED: 'delivered'
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
  ...getEmptyProductCreationForm({ defaultCategory }),
  addStock: '',
  addStockMode: PURCHASE_STATUS.DELIVERED,
  addStockPricePerUnit: '',
  addStockSupplier: '',
  addStockDate: getISTDateString(),
  addStockAdvanceAmount: '',
  addStockBankAccountId: ''
});

const createEmptyTierRule = () => ({ min_quantity: '', price_per_unit: '', label: '' });
const createEmptyPromotionRule = () => ({ promotional_price: '', start_date: '', end_date: '', label: '', is_active: true });

const Inventory = () => {
  const { user, dailySetupStatus } = useAuth();
  const [products, setProducts] = useState([]);
  const [filteredProducts, setFilteredProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('catalog');
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
  const [pricingModal, setPricingModal] = useState({
    open: false,
    product: null,
    loading: false,
    saving: false,
    tierPricing: [createEmptyTierRule()],
    promotions: [createEmptyPromotionRule()]
  });

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
    const validationMessage = validateProductCreationForm(formData);
    if (validationMessage) {
      setError(validationMessage);
      showActionModal('Add Product Failed', validationMessage, 'error');
      return;
    }

    try {
      const payload = buildProductCreationPayload(formData);
      await axios.post('/api/inventory', payload);
      setShowAddModal(false);
      resetForm();
      await fetchProducts();
      showActionModal(
        creation_mode === PRODUCT_CREATION_MODE.ORDER ? 'Product Ordered' : 'Product Added',
        creation_mode === PRODUCT_CREATION_MODE.ORDER
          ? `Created "${product_name}" (${product_id}) and recorded a pending order for ${payload.order_quantity}.`
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
    const purchaseStatus = formData.addStockMode || PURCHASE_STATUS.DELIVERED;
    const pricePerUnit = num(formData.addStockPricePerUnit || selectedProduct?.purchase_price);
    const advanceAmount = purchaseStatus === PURCHASE_STATUS.ORDERED ? num(formData.addStockAdvanceAmount) : 0;
    const totalAmount = quantityToAdd * pricePerUnit;
    const supplierName = String(formData.addStockSupplier || '').trim();
    const productName = selectedProduct?.product_name;

    if (!selectedProduct) {
      setError('Select a product first');
      showActionModal('Stock Update Failed', 'Select a product first', 'error');
      return;
    }

    if (quantityToAdd <= 0) {
      setError('Enter a valid quantity');
      showActionModal('Stock Update Failed', 'Enter a valid quantity', 'error');
      return;
    }

    if (pricePerUnit < 0) {
      setError('Enter a valid purchase price');
      showActionModal('Stock Update Failed', 'Enter a valid purchase price', 'error');
      return;
    }

    if (purchaseStatus === PURCHASE_STATUS.ORDERED && advanceAmount > totalAmount) {
      setError('Advance amount cannot be more than the total order amount');
      showActionModal('Order Failed', 'Advance amount cannot be more than the total order amount', 'error');
      return;
    }

    if (purchaseStatus === PURCHASE_STATUS.ORDERED && advanceAmount > 0 && !supplierName) {
      setError('Supplier is required when paying an advance amount');
      showActionModal('Order Failed', 'Supplier is required when paying an advance amount', 'error');
      return;
    }

    if (purchaseStatus === PURCHASE_STATUS.ORDERED && advanceAmount > 0 && !formData.addStockBankAccountId) {
      setError('Select a bank account for the advance payment');
      showActionModal('Order Failed', 'Select a bank account for the advance payment', 'error');
      return;
    }

    try {
      await axios.post('/api/purchases', {
        product_id: selectedProduct.id,
        quantity: quantityToAdd,
        price_per_unit: pricePerUnit,
        supplier: supplierName || undefined,
        purchase_date: formData.addStockDate,
        purchase_status: purchaseStatus,
        advance_amount: purchaseStatus === PURCHASE_STATUS.ORDERED ? advanceAmount : undefined,
        bank_account_id: purchaseStatus === PURCHASE_STATUS.ORDERED && advanceAmount > 0
          ? Number(formData.addStockBankAccountId)
          : undefined
      });
      setShowAddStockModal(false);
      resetForm();
      await fetchProducts();
      showActionModal(
        purchaseStatus === PURCHASE_STATUS.ORDERED ? 'Order Recorded' : 'Stock Updated',
        purchaseStatus === PURCHASE_STATUS.ORDERED
          ? `Recorded a pending order of ${quantityToAdd} ${selectedProduct?.unit || ''} for "${productName}".`
          : `Added ${quantityToAdd} ${selectedProduct?.unit || ''} to "${productName}".`
      );
    } catch (error) {
      const message = error.response?.data?.message || (purchaseStatus === PURCHASE_STATUS.ORDERED ? 'Failed to record order' : 'Failed to add stock');
      setError(message);
      showActionModal(purchaseStatus === PURCHASE_STATUS.ORDERED ? 'Order Failed' : 'Stock Update Failed', message, 'error');
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
      gst_percent: String(product.gst_percent || 0),
      hsn_code: product.hsn_code || '',
      reorder_point: String(product.reorder_point || 10),
      reorder_quantity: String(product.reorder_quantity || 0),
      barcode: product.barcode || '',
      expiry_date: product.expiry_date || '',
      batch_number: product.batch_number || '',
      manufacturing_date: product.manufacturing_date || '',
      creation_mode: PRODUCT_CREATION_MODE.INVENTORY,
      order_quantity: '',
      order_date: getISTDateString(),
      advance_amount: '',
      bank_account_id: dailySetupStatus?.selectedBankAccountId ? String(dailySetupStatus.selectedBankAccountId) : '',
      addStock: '',
      addStockMode: PURCHASE_STATUS.DELIVERED,
      addStockPricePerUnit: String(product.purchase_price || ''),
      addStockSupplier: product.supplier || '',
      addStockDate: getISTDateString(),
      addStockAdvanceAmount: '',
      addStockBankAccountId: dailySetupStatus?.selectedBankAccountId ? String(dailySetupStatus.selectedBankAccountId) : ''
    });
    setShowEditModal(true);
  };

  const openAddStockModal = (product) => {
    setSelectedProduct(product);
    setFormData((current) => ({
      ...current,
      addStock: '',
      addStockMode: PURCHASE_STATUS.DELIVERED,
      addStockPricePerUnit: String(product.purchase_price || ''),
      addStockSupplier: product.supplier || '',
      addStockDate: getISTDateString(),
      addStockAdvanceAmount: '',
      addStockBankAccountId: dailySetupStatus?.selectedBankAccountId
        ? String(dailySetupStatus.selectedBankAccountId)
        : String(bankAccounts[0]?.id || '')
    }));
    setShowAddStockModal(true);
  };

  const openPricingModal = async (product) => {
    setPricingModal({
      open: true,
      product,
      loading: true,
      saving: false,
      tierPricing: [createEmptyTierRule()],
      promotions: [createEmptyPromotionRule()]
    });

    try {
      const response = await axios.get(`/api/pricing/products/${product.id}`);
      setPricingModal({
        open: true,
        product,
        loading: false,
        saving: false,
        tierPricing: response.data?.tierPricing?.length
          ? response.data.tierPricing.map((rule) => ({
              min_quantity: String(rule.min_quantity || ''),
              price_per_unit: String(rule.price_per_unit || ''),
              label: rule.label || ''
            }))
          : [createEmptyTierRule()],
        promotions: response.data?.promotions?.length
          ? response.data.promotions.map((rule) => ({
              promotional_price: String(rule.promotional_price || ''),
              start_date: rule.start_date || '',
              end_date: rule.end_date || '',
              label: rule.label || '',
              is_active: Boolean(rule.is_active)
            }))
          : [createEmptyPromotionRule()]
      });
    } catch (pricingError) {
      setPricingModal((current) => ({ ...current, loading: false }));
      showActionModal('Pricing Rules Failed', 'Failed to load pricing rules for this product.', 'error');
    }
  };

  const updatePricingModalRows = (collection, index, field, value) => {
    setPricingModal((current) => ({
      ...current,
      [collection]: current[collection].map((row, rowIndex) => rowIndex === index ? { ...row, [field]: value } : row)
    }));
  };

  const addPricingModalRow = (collection) => {
    setPricingModal((current) => ({
      ...current,
      [collection]: [
        ...current[collection],
        collection === 'tierPricing' ? createEmptyTierRule() : createEmptyPromotionRule()
      ]
    }));
  };

  const removePricingModalRow = (collection, index) => {
    setPricingModal((current) => {
      const nextRows = current[collection].filter((_, rowIndex) => rowIndex !== index);
      return {
        ...current,
        [collection]: nextRows.length
          ? nextRows
          : [collection === 'tierPricing' ? createEmptyTierRule() : createEmptyPromotionRule()]
      };
    });
  };

  const savePricingRules = async (event) => {
    if (event?.preventDefault) event.preventDefault();
    if (!pricingModal.product) return;

    setPricingModal((current) => ({ ...current, saving: true }));
    try {
      await axios.put(`/api/pricing/products/${pricingModal.product.id}`, {
        tierPricing: pricingModal.tierPricing
          .filter((rule) => rule.min_quantity && rule.price_per_unit)
          .map((rule) => ({
            min_quantity: Number(rule.min_quantity),
            price_per_unit: Number(rule.price_per_unit),
            label: rule.label.trim() || undefined
          })),
        promotions: pricingModal.promotions
          .filter((rule) => rule.promotional_price)
          .map((rule) => ({
            promotional_price: Number(rule.promotional_price),
            start_date: rule.start_date || undefined,
            end_date: rule.end_date || undefined,
            label: rule.label.trim() || undefined,
            is_active: Boolean(rule.is_active)
          }))
      });
      setPricingModal({
        open: false,
        product: null,
        loading: false,
        saving: false,
        tierPricing: [createEmptyTierRule()],
        promotions: [createEmptyPromotionRule()]
      });
      showActionModal('Pricing Updated', `Updated pricing rules for "${pricingModal.product.product_name}".`);
    } catch (pricingError) {
      setPricingModal((current) => ({ ...current, saving: false }));
      showActionModal('Pricing Update Failed', pricingError.response?.data?.message || 'Failed to update pricing rules.', 'error');
    }
  };

  const isAdmin = user.role === 'admin';
  const canEdit = user.role === 'admin' || user.role === 'operator';
  const bankOptions = bankAccounts.map((account) => ({
    value: String(account.id),
    label: `${account.account_name} - ${account.bank_name} (${fmtMoney(account.balance)})`
  }));
  const addStockQuantity = num(formData.addStock);
  const addStockPricePerUnit = num(formData.addStockPricePerUnit || selectedProduct?.purchase_price);
  const addStockTotal = addStockQuantity * addStockPricePerUnit;
  const addStockAdvance = formData.addStockMode === PURCHASE_STATUS.ORDERED ? num(formData.addStockAdvanceAmount) : 0;
  const addStockBalance = Math.max(addStockTotal - addStockAdvance, 0);
  const addStockAfterQuantity = num(selectedProduct?.quantity_available) + addStockQuantity;

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

      <div className="card !p-2">
        <nav className="flex gap-1">
          {[
            { id: 'catalog', label: 'Inventory', icon: Package },
            { id: 'flow', label: 'Inventory Flow', icon: History }
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                activeTab === tab.id ? 'text-white shadow-md' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
              }`}
              style={activeTab === tab.id
                ? { background: 'linear-gradient(135deg,#0369a1,#0891b2)', boxShadow: '0 2px 8px rgba(8,145,178,0.35)' }
                : {}}
            >
              <tab.icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {activeTab === 'catalog' && (
        <>
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
                    <tr key={product.id} className={product.quantity_available <= (product.reorder_point || 10) ? 'bg-red-50' : ''}>
                      <td className="font-medium">{product.product_id}</td>
                      <td>{product.product_name}</td>
                      <td>{product.variety || '-'}</td>
                      <td className="capitalize">{product.category}</td>
                      <td>
                        <div className="flex items-center">
                          {product.quantity_available <= (product.reorder_point || 10) && (
                            <AlertTriangle className="h-4 w-4 text-red-500 mr-1" />
                          )}
                          <span className={product.quantity_available <= (product.reorder_point || 10) ? 'text-red-600 font-medium' : ''}>
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
                            <button
                              onClick={() => openPricingModal(product)}
                              className="text-amber-600 hover:text-amber-800"
                              title="Manage pricing rules"
                            >
                              <IndianRupee className="h-4 w-4" />
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
        </>
      )}

      {activeTab === 'flow' && (
        <InventoryFlowPanel categories={categories} />
      )}

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

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">GST %</label>
                <CustomSelect
                  options={GST_OPTIONS}
                  value={formData.gst_percent}
                  onChange={(val) => setFormData({...formData, gst_percent: val})}
                  placeholder="GST Rate"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">HSN Code</label>
                <input
                  type="text"
                  className="input-field"
                  value={formData.hsn_code}
                  onChange={(e) => setFormData({...formData, hsn_code: e.target.value})}
                  placeholder="e.g. 31052000"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Barcode</label>
                <input
                  type="text"
                  className="input-field"
                  value={formData.barcode}
                  onChange={(e) => setFormData({...formData, barcode: e.target.value})}
                  placeholder="Optional"
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reorder Point</label>
                <input
                  type="number"
                  min="0"
                  className="input-field"
                  value={formData.reorder_point}
                  onChange={(e) => setFormData({...formData, reorder_point: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reorder Qty</label>
                <input
                  type="number"
                  min="0"
                  className="input-field"
                  value={formData.reorder_quantity}
                  onChange={(e) => setFormData({...formData, reorder_quantity: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Expiry Date</label>
                <input
                  type="date"
                  className="input-field"
                  value={formData.expiry_date}
                  onChange={(e) => setFormData({...formData, expiry_date: e.target.value})}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Batch / Lot Number</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="e.g. BATCH-2024-001"
                  value={formData.batch_number}
                  onChange={(e) => setFormData({...formData, batch_number: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Manufacturing Date</label>
                <input
                  type="date"
                  className="input-field"
                  value={formData.manufacturing_date}
                  onChange={(e) => setFormData({...formData, manufacturing_date: e.target.value})}
                />
              </div>
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
        <Modal title={`${formData.addStockMode === PURCHASE_STATUS.ORDERED ? 'Order Product' : 'Receive Stock'} - ${selectedProduct?.product_name}`} onClose={() => setShowAddStockModal(false)}>
          <form onSubmit={handleAddStock} className="space-y-4">
            <div className="grid grid-cols-2 gap-2 rounded-xl bg-gray-100 p-1">
              <button
                type="button"
                onClick={() => setFormData((current) => ({ ...current, addStockMode: PURCHASE_STATUS.DELIVERED, addStockAdvanceAmount: '' }))}
                className={`rounded-lg px-3 py-2 text-sm font-semibold transition-all ${formData.addStockMode === PURCHASE_STATUS.DELIVERED ? 'bg-white text-emerald-700 shadow-sm' : 'text-gray-500'}`}
              >
                Delivered Now
              </button>
              <button
                type="button"
                onClick={() => setFormData((current) => ({ ...current, addStockMode: PURCHASE_STATUS.ORDERED }))}
                className={`rounded-lg px-3 py-2 text-sm font-semibold transition-all ${formData.addStockMode === PURCHASE_STATUS.ORDERED ? 'bg-white text-amber-700 shadow-sm' : 'text-gray-500'}`}
              >
                Order Now
              </button>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Quantity ({selectedProduct?.unit})
              </label>
              <input
                type="number"
                step="1"
                required
                className="input-field"
                value={formData.addStock}
                onChange={(e) => setFormData({...formData, addStock: e.target.value})}
                placeholder={formData.addStockMode === PURCHASE_STATUS.ORDERED ? 'Enter quantity to order' : 'Enter quantity received'}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Price per Unit
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                required
                className="input-field"
                value={formData.addStockPricePerUnit}
                onChange={(e) => setFormData({...formData, addStockPricePerUnit: e.target.value})}
                placeholder="Enter purchase price"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Supplier
              </label>
              <input
                type="text"
                className="input-field"
                value={formData.addStockSupplier}
                onChange={(e) => setFormData({...formData, addStockSupplier: e.target.value})}
                placeholder={formData.addStockMode === PURCHASE_STATUS.ORDERED ? 'Supplier name (recommended for due tracking)' : 'Supplier name (optional)'}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {formData.addStockMode === PURCHASE_STATUS.ORDERED ? 'Order Date' : 'Purchase Date'}
              </label>
              <input
                type="date"
                className="input-field"
                value={formData.addStockDate}
                onChange={(e) => setFormData({...formData, addStockDate: e.target.value})}
              />
            </div>

            {formData.addStockMode === PURCHASE_STATUS.ORDERED && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Advance Payment from Bank
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="input-field"
                    value={formData.addStockAdvanceAmount}
                    onChange={(e) => setFormData({...formData, addStockAdvanceAmount: e.target.value})}
                    placeholder="Leave 0 if no advance is paid"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Bank Account for Advance
                  </label>
                  {bankOptions.length > 0 ? (
                    <CustomSelect
                      options={bankOptions}
                      value={formData.addStockBankAccountId}
                      onChange={(value) => setFormData({...formData, addStockBankAccountId: value})}
                      placeholder="Select bank account"
                    />
                  ) : (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                      Add a bank account in Transactions before recording an advance payment.
                    </div>
                  )}
                </div>
              </>
            )}

            <div className="bg-gray-50 p-3 rounded-lg">
              <p className="text-sm text-gray-600">
                Current Stock: {selectedProduct?.quantity_available} {selectedProduct?.unit}
              </p>
              {formData.addStockMode === PURCHASE_STATUS.DELIVERED ? (
                <p className="text-sm text-gray-600">
                  After Receiving: {addStockAfterQuantity} {selectedProduct?.unit}
                </p>
              ) : (
                <p className="text-sm text-gray-600">
                  Stock remains unchanged until delivery is confirmed.
                </p>
              )}
              <p className="mt-2 text-sm text-gray-600">
                Total Amount: <span className="font-semibold text-gray-800">{fmtMoney(addStockTotal)}</span>
              </p>
              {formData.addStockMode === PURCHASE_STATUS.ORDERED && (
                <>
                  <p className="text-sm text-gray-600">
                    Advance Paid: <span className="font-semibold text-violet-700">{fmtMoney(addStockAdvance)}</span>
                  </p>
                  <p className="text-sm text-gray-600">
                    Balance Due: <span className="font-semibold text-amber-700">{fmtMoney(addStockBalance)}</span>
                  </p>
                </>
              )}
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
                {formData.addStockMode === PURCHASE_STATUS.ORDERED ? 'Record Order' : 'Add Stock'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Duplicate Product ID Modal */}
      {pricingModal.open && (
        <Modal title={`Pricing Rules - ${pricingModal.product?.product_name || ''}`} onClose={() => setPricingModal({ open: false, product: null, loading: false, saving: false, tierPricing: [createEmptyTierRule()], promotions: [createEmptyPromotionRule()] })}>
          {pricingModal.loading ? (
            <div className="flex items-center justify-center py-10">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
            </div>
          ) : (
            <form onSubmit={savePricingRules} className="space-y-5">
              <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                Base price: <span className="font-semibold">{fmtMoney(pricingModal.product?.selling_price)}</span>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-gray-800">Tier Pricing</h4>
                  <button type="button" onClick={() => addPricingModalRow('tierPricing')} className="text-xs font-semibold text-blue-600 hover:text-blue-800">+ Add Tier</button>
                </div>
                {pricingModal.tierPricing.map((rule, index) => (
                  <div key={`tier-${index}`} className="grid grid-cols-12 gap-2 rounded-xl border border-gray-100 bg-gray-50 p-3">
                    <div className="col-span-3">
                      <label className="mb-1 block text-xs font-medium text-gray-500">Min Qty</label>
                      <input type="number" min="1" value={rule.min_quantity} onChange={(event) => updatePricingModalRows('tierPricing', index, 'min_quantity', event.target.value)} className="input-field !py-2 !text-sm" />
                    </div>
                    <div className="col-span-4">
                      <label className="mb-1 block text-xs font-medium text-gray-500">Price / Unit</label>
                      <input type="number" min="0" step="0.01" value={rule.price_per_unit} onChange={(event) => updatePricingModalRows('tierPricing', index, 'price_per_unit', event.target.value)} className="input-field !py-2 !text-sm" />
                    </div>
                    <div className="col-span-4">
                      <label className="mb-1 block text-xs font-medium text-gray-500">Label</label>
                      <input type="text" value={rule.label} onChange={(event) => updatePricingModalRows('tierPricing', index, 'label', event.target.value)} placeholder="Bulk order" className="input-field !py-2 !text-sm" />
                    </div>
                    <div className="col-span-1 flex items-end justify-end">
                      {pricingModal.tierPricing.length > 1 && <button type="button" onClick={() => removePricingModalRow('tierPricing', index)} className="text-sm font-bold text-red-500 hover:text-red-700">✕</button>}
                    </div>
                  </div>
                ))}
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-gray-800">Date-Based Promotions</h4>
                  <button type="button" onClick={() => addPricingModalRow('promotions')} className="text-xs font-semibold text-blue-600 hover:text-blue-800">+ Add Promotion</button>
                </div>
                {pricingModal.promotions.map((rule, index) => (
                  <div key={`promotion-${index}`} className="space-y-3 rounded-xl border border-gray-100 bg-gray-50 p-3">
                    <div className="grid grid-cols-12 gap-2">
                      <div className="col-span-4">
                        <label className="mb-1 block text-xs font-medium text-gray-500">Promo Price</label>
                        <input type="number" min="0" step="0.01" value={rule.promotional_price} onChange={(event) => updatePricingModalRows('promotions', index, 'promotional_price', event.target.value)} className="input-field !py-2 !text-sm" />
                      </div>
                      <div className="col-span-4">
                        <label className="mb-1 block text-xs font-medium text-gray-500">Start Date</label>
                        <input type="date" value={rule.start_date} onChange={(event) => updatePricingModalRows('promotions', index, 'start_date', event.target.value)} className="input-field !py-2 !text-sm" />
                      </div>
                      <div className="col-span-4">
                        <label className="mb-1 block text-xs font-medium text-gray-500">End Date</label>
                        <input type="date" value={rule.end_date} onChange={(event) => updatePricingModalRows('promotions', index, 'end_date', event.target.value)} className="input-field !py-2 !text-sm" />
                      </div>
                    </div>
                    <div className="grid grid-cols-12 gap-2 items-center">
                      <div className="col-span-8">
                        <label className="mb-1 block text-xs font-medium text-gray-500">Label</label>
                        <input type="text" value={rule.label} onChange={(event) => updatePricingModalRows('promotions', index, 'label', event.target.value)} placeholder="Festival offer" className="input-field !py-2 !text-sm" />
                      </div>
                      <label className="col-span-3 flex items-center gap-2 pt-5 text-xs font-medium text-gray-600">
                        <input type="checkbox" checked={Boolean(rule.is_active)} onChange={(event) => updatePricingModalRows('promotions', index, 'is_active', event.target.checked)} />
                        Active
                      </label>
                      <div className="col-span-1 flex justify-end pt-5">
                        {pricingModal.promotions.length > 1 && <button type="button" onClick={() => removePricingModalRow('promotions', index)} className="text-sm font-bold text-red-500 hover:text-red-700">✕</button>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setPricingModal({ open: false, product: null, loading: false, saving: false, tierPricing: [createEmptyTierRule()], promotions: [createEmptyPromotionRule()] })} className="btn-secondary">Cancel</button>
                <button type="submit" className="btn-primary">{pricingModal.saving ? 'Saving...' : 'Save Pricing Rules'}</button>
              </div>
            </form>
          )}
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
