import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
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
  ArrowLeft,
  Landmark,
  AlertTriangle,
  Clock3
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
  { value: 'tonnes', label: 'tonnes' }
];

const PURCHASE_STATUS = {
  ORDERED: 'ordered',
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled'
};

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

const getPurchaseStatusMeta = (status, productDeleted) => {
  if (productDeleted) {
    return {
      label: 'Deleted',
      badgeClass: 'bg-red-100 text-red-700',
      helperText: 'This product has been removed from inventory.'
    };
  }
  const normalized = String(status || PURCHASE_STATUS.DELIVERED).toLowerCase();
  if (normalized === PURCHASE_STATUS.ORDERED) {
    return {
      label: 'Ordered',
      badgeClass: 'bg-amber-100 text-amber-700',
      helperText: 'Inventory will update only after you mark this order as delivered.'
    };
  }

  if (normalized === PURCHASE_STATUS.CANCELLED) {
    return {
      label: 'Cancelled',
      badgeClass: 'bg-red-100 text-red-700',
      helperText: 'This order was cancelled.'
    };
  }

  return {
    label: 'Delivered',
    badgeClass: 'bg-emerald-100 text-emerald-700',
    helperText: 'Inventory is updated immediately for this purchase.'
  };
};

const getEmptyNewProductForm = () => ({
  product_id: '',
  category: '',
  product_name: '',
  variety: '',
  quantity_available: '0',
  unit: 'kg',
  purchase_price: '',
  selling_price: '',
  supplier: '',
  creation_mode: PRODUCT_CREATION_MODE.INVENTORY,
  order_quantity: '',
  order_date: getISTDateString(),
  advance_amount: '',
  bank_account_id: ''
});

const Purchases = () => {
  const { user, dailySetupStatus } = useAuth();
  const isAdmin = user?.role === 'admin';
  const canManagePurchases = ['admin', 'operator'].includes(user?.role);

  const [activeTab, setActiveTab] = useState('record');
  const [purchases, setPurchases] = useState([]);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [formProductId, setFormProductId] = useState('');
  const [formQuantity, setFormQuantity] = useState('');
  const [formPrice, setFormPrice] = useState('');
  const [formSupplier, setFormSupplier] = useState('');
  const [formDate, setFormDate] = useState(getISTDateString());
  const [formStatus, setFormStatus] = useState(PURCHASE_STATUS.DELIVERED);
  const [formAdvanceAmount, setFormAdvanceAmount] = useState('');
  const [formBankAccountId, setFormBankAccountId] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [productCategoryFilter, setProductCategoryFilter] = useState('all');
  const [submitting, setSubmitting] = useState(false);

  const [newCategoryName, setNewCategoryName] = useState('');
  const [deleteCatModal, setDeleteCatModal] = useState({ open: false, id: null, name: '' });
  const [deleteSupplierModal, setDeleteSupplierModal] = useState({ open: false, supplier: '' });
  const [confirmModal, setConfirmModal] = useState({ open: false, data: null });
  const [editModal, setEditModal] = useState({ open: false, purchase: null });
  const [editForm, setEditForm] = useState({ quantity: '', price_per_unit: '', supplier: '', purchase_date: '' });
  const [editSubmitting] = useState(false);
  const [deliverModal, setDeliverModal] = useState({ open: false, purchase: null, delivery_date: getISTDateString() });
  const [deliverSubmitting, setDeliverSubmitting] = useState(false);
  const [cancelModal, setCancelModal] = useState({ open: false, purchase: null });
  const [cancelSubmitting, setCancelSubmitting] = useState(false);
  const [partialModal, setPartialModal] = useState({ open: false, purchase: null, quantity: '', delivery_date: getISTDateString() });
  const [partialSubmitting, setPartialSubmitting] = useState(false);

  const [showNewProductModal, setShowNewProductModal] = useState(false);
  const [newProductForm, setNewProductForm] = useState(getEmptyNewProductForm());
  const [newProductSubmitting, setNewProductSubmitting] = useState(false);

  const [suppliers, setSuppliers] = useState([]);
  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const [supplierDetail, setSupplierDetail] = useState(null);
  const [supplierLoading, setSupplierLoading] = useState(false);

  const [historySearch, setHistorySearch] = useState('');
  const [historyStatusFilter, setHistoryStatusFilter] = useState('all');
  const [historyCategoryFilter, setHistoryCategoryFilter] = useState('all');
  const [supplierSearch, setSupplierSearch] = useState('');
  const [categorySearch, setCategorySearch] = useState('');

  const pendingPurchaseProductIds = new Set(
    purchases
      .filter((purchase) => String(purchase.purchase_status || PURCHASE_STATUS.DELIVERED).toLowerCase() === PURCHASE_STATUS.ORDERED)
      .map((purchase) => String(purchase.product_id))
  );
  const availableProducts = products.filter((product) => {
    const hasPendingOrder = pendingPurchaseProductIds.has(String(product.id));
    const hasExistingStock = num(product.quantity_available) > 0;
    // Only hide products that are newly created with zero stock and have a pending order
    // Existing products with stock should remain available even with pending orders
    if (hasPendingOrder && !hasExistingStock) return false;
    return true;
  });
  const selectedProduct = availableProducts.find((p) => String(p.id) === String(formProductId));
  const totalCost = num(formQuantity) * num(formPrice);
  const advanceAmount = formStatus === PURCHASE_STATUS.ORDERED ? num(formAdvanceAmount) : 0;
  const remainingAmount = Math.max(totalCost - advanceAmount, 0);
  const renderPortalModal = (content) => (
    typeof document === 'undefined' ? content : createPortal(content, document.body)
  );

  const resetPurchaseForm = useCallback(() => {
    setFormProductId('');
    setFormQuantity('');
    setFormPrice('');
    setFormSupplier('');
    setFormDate(getISTDateString());
    setFormStatus(PURCHASE_STATUS.DELIVERED);
    setFormAdvanceAmount('');
    setProductSearch('');
  }, []);

  const fetchNextProductId = async (category) => {
    if (!category) return;
    try {
      const res = await axios.get(`/api/inventory/next-id?category=${category}`);
      setNewProductForm((current) => ({ ...current, product_id: res.data.nextId }));
    } catch (err) {
      console.error('Failed to fetch next ID:', err);
    }
  };

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [purRes, prodRes, catRes, supRes, bankRes] = await Promise.all([
        axios.get('/api/purchases'),
        axios.get('/api/inventory'),
        axios.get('/api/purchases/categories'),
        axios.get('/api/purchases/suppliers'),
        axios.get('/api/transactions/bank-accounts')
      ]);
      setPurchases(purRes.data || []);
      setProducts(prodRes.data || []);
      setCategories(catRes.data || []);
      setSuppliers(supRes.data || []);
      setBankAccounts(bankRes.data || []);
    } catch (e) {
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    if (formProductId) {
      const product = products.find((item) => String(item.id) === String(formProductId));
      if (product) {
        setFormPrice(String(product.purchase_price || ''));
        if (!formSupplier && product.supplier) {
          setFormSupplier(product.supplier);
        }
      }
    }
  }, [formProductId, products, formSupplier]);

  useEffect(() => {
    const preferredBank = dailySetupStatus?.selectedBankAccountId || bankAccounts[0]?.id || '';
    if (preferredBank && !formBankAccountId) {
      setFormBankAccountId(String(preferredBank));
    }
  }, [dailySetupStatus?.selectedBankAccountId, bankAccounts, formBankAccountId]);

  useEffect(() => {
    const preferredBank = dailySetupStatus?.selectedBankAccountId || bankAccounts[0]?.id || '';
    if (preferredBank && !newProductForm.bank_account_id) {
      setNewProductForm((current) => ({ ...current, bank_account_id: String(preferredBank) }));
    }
  }, [dailySetupStatus?.selectedBankAccountId, bankAccounts, newProductForm.bank_account_id]);

  useEffect(() => {
    if (formStatus !== PURCHASE_STATUS.ORDERED) {
      setFormAdvanceAmount('');
    }
  }, [formStatus]);

  const filteredPurchases = purchases.filter((purchase) => {
    const normalizedStatus = String(purchase.purchase_status || PURCHASE_STATUS.DELIVERED).toLowerCase();
    const matchesStatus = historyStatusFilter === 'all' || normalizedStatus === historyStatusFilter;
    const matchesCategory = historyCategoryFilter === 'all' || purchase.category === historyCategoryFilter;
    if (!matchesStatus) return false;
    if (!matchesCategory) return false;
    if (!historySearch) return true;

    const query = historySearch.toLowerCase();
    return (purchase.product_name || '').toLowerCase().includes(query)
      || (purchase.variety || '').toLowerCase().includes(query)
      || (purchase.purchase_id || '').toLowerCase().includes(query)
      || (purchase.supplier || '').toLowerCase().includes(query)
      || (purchase.category || '').toLowerCase().includes(query)
      || (purchase.added_by_name || '').toLowerCase().includes(query)
      || normalizedStatus.includes(query);
  });

  const filteredSuppliers = suppliers.filter((supplier) => {
    if (!supplierSearch) return true;
    return (supplier.supplier || '').toLowerCase().includes(supplierSearch.toLowerCase());
  });

  const filteredCategories = categories.filter((category) => {
    if (!categorySearch) return true;
    return (category.name || '').toLowerCase().includes(categorySearch.toLowerCase());
  });

  const filteredProducts = [...availableProducts]
    .filter((product) => {
      const q = productSearch.toLowerCase();
      const matchesSearch = product.product_name.toLowerCase().includes(q)
        || product.product_id.toLowerCase().includes(q)
        || (product.variety || '').toLowerCase().includes(q);
      const matchesCategory = productCategoryFilter === 'all' || product.category === productCategoryFilter;
      return matchesSearch && matchesCategory;
    })
    .sort((a, b) => {
      const aLow = num(a.quantity_available) <= 10 ? 0 : 1;
      const bLow = num(b.quantity_available) <= 10 ? 0 : 1;
      if (aLow !== bLow) return aLow - bLow;
      return a.product_name.localeCompare(b.product_name);
    });

  const { sortedItems: sortedPurchases, sortConfig, requestSort } = useSortableData(filteredPurchases, {
    key: 'purchase_date',
    direction: 'desc'
  });
  const { sortedItems: sortedSupProducts, sortConfig: supProductsSort, requestSort: sortSupProducts } = useSortableData(supplierDetail?.products || [], { key: 'total_spent', direction: 'desc' });
  const { sortedItems: sortedSupHistory, sortConfig: supHistorySort, requestSort: sortSupHistory } = useSortableData(supplierDetail?.history || [], { key: 'purchase_date', direction: 'desc' });
  const [supHistoryStatusFilter, setSupHistoryStatusFilter] = useState('all');
  const hasPendingOrders = purchases.some(p => String(p.purchase_status).toLowerCase() === PURCHASE_STATUS.ORDERED);
  const showHistoryActions = canManagePurchases && (historyStatusFilter === PURCHASE_STATUS.ORDERED || (historyStatusFilter === 'all' && hasPendingOrders));

  const handleRecordPurchase = (event) => {
    event.preventDefault();
    if (!selectedProduct || !formQuantity || !formPrice) {
      setError('Product, quantity, and price are required');
      return;
    }
    if (formStatus === PURCHASE_STATUS.ORDERED && advanceAmount > totalCost) {
      setError('Advance amount cannot be more than the total order amount');
      return;
    }
    if (formStatus === PURCHASE_STATUS.ORDERED && advanceAmount > 0 && !formSupplier.trim()) {
      setError('Supplier is required when paying an advance amount');
      return;
    }
    if (formStatus === PURCHASE_STATUS.ORDERED && advanceAmount > 0 && !formBankAccountId) {
      setError('Select a bank account for the advance payment');
      return;
    }

    const bankAccount = bankAccounts.find((account) => String(account.id) === String(formBankAccountId));
    setError('');
    setConfirmModal({
      open: true,
      data: {
        product_id: Number(formProductId),
        quantity: num(formQuantity),
        price_per_unit: num(formPrice),
        supplier: formSupplier.trim() || null,
        purchase_date: formDate,
        purchase_status: formStatus,
        advance_amount: advanceAmount,
        bank_account_id: formStatus === PURCHASE_STATUS.ORDERED && advanceAmount > 0 ? Number(formBankAccountId) : null,
        bank_account_name: bankAccount ? `${bankAccount.account_name} (${bankAccount.bank_name})` : '',
        product: selectedProduct
      }
    });
  };

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
        purchase_date: data.purchase_date,
        purchase_status: data.purchase_status,
        advance_amount: data.purchase_status === PURCHASE_STATUS.ORDERED ? data.advance_amount : undefined,
        bank_account_id: data.purchase_status === PURCHASE_STATUS.ORDERED && data.advance_amount > 0
          ? data.bank_account_id
          : undefined
      });

      setSuccess(
        data.purchase_status === PURCHASE_STATUS.ORDERED
          ? 'Order recorded successfully. Inventory will update after delivery.'
          : 'Purchase recorded and inventory updated successfully'
      );
      resetPurchaseForm();
      await fetchAll();
      setTimeout(() => setSuccess(''), 4000);
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to record purchase');
    } finally {
      setSubmitting(false);
    }
  };

  const openDeliverPurchaseModal = (purchase) => {
    setDeliverModal({
      open: true,
      purchase,
      delivery_date: purchase.delivery_date ? String(purchase.delivery_date).slice(0, 10) : getISTDateString()
    });
  };

  const handleEditPurchase = (event) => {
    event.preventDefault();
  };

  const handleMarkDelivered = async (event) => {
    event.preventDefault();
    if (!deliverModal.purchase) return;

    setDeliverSubmitting(true);
    setError('');
    try {
      await axios.post(`/api/purchases/${deliverModal.purchase.id}/mark-delivered`, {
        delivery_date: deliverModal.delivery_date
      });
      setDeliverModal({ open: false, purchase: null, delivery_date: getISTDateString() });
      setSuccess('Purchase marked as delivered and inventory updated');
      await fetchAll();
      setTimeout(() => setSuccess(''), 3000);
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to mark purchase as delivered');
    } finally {
      setDeliverSubmitting(false);
    }
  };

  const handleCancelOrder = async () => {
    if (!cancelModal.purchase) return;
    setCancelSubmitting(true);
    setError('');
    try {
      await axios.post(`/api/purchases/${cancelModal.purchase.id}/cancel`);
      setCancelModal({ open: false, purchase: null });
      setSuccess('Purchase order cancelled successfully');
      await fetchAll();
      setTimeout(() => setSuccess(''), 3000);
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to cancel order');
    } finally {
      setCancelSubmitting(false);
    }
  };

  const handlePartialDelivery = async (event) => {
    event.preventDefault();
    if (!partialModal.purchase || !partialModal.quantity) return;
    setPartialSubmitting(true);
    setError('');
    try {
      await axios.post(`/api/purchases/${partialModal.purchase.id}/partial-delivery`, {
        quantity_delivered: Number(partialModal.quantity),
        delivery_date: partialModal.delivery_date
      });
      setPartialModal({ open: false, purchase: null, quantity: '', delivery_date: getISTDateString() });
      setSuccess('Partial delivery recorded and inventory updated');
      await fetchAll();
      setTimeout(() => setSuccess(''), 3000);
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to record partial delivery');
    } finally {
      setPartialSubmitting(false);
    }
  };

  const handleCreateProduct = async (event) => {
    event.preventDefault();
    const creationMode = newProductForm.creation_mode || PRODUCT_CREATION_MODE.INVENTORY;
    const newProductPurchasePrice = num(newProductForm.purchase_price);
    const newProductOrderQty = num(newProductForm.order_quantity);
    const newProductAdvance = num(newProductForm.advance_amount);

    if (creationMode === PRODUCT_CREATION_MODE.INVENTORY && num(newProductForm.quantity_available) <= 0) {
      setError('Enter opening stock when adding the new product directly to inventory');
      return;
    }

    if (creationMode === PRODUCT_CREATION_MODE.ORDER && newProductOrderQty <= 0) {
      setError('Enter the order quantity for the new product');
      return;
    }

    if (creationMode === PRODUCT_CREATION_MODE.ORDER && newProductAdvance > (newProductOrderQty * newProductPurchasePrice)) {
      setError('Advance amount cannot be more than the total order amount');
      return;
    }

    if (creationMode === PRODUCT_CREATION_MODE.ORDER && newProductAdvance > 0 && !newProductForm.supplier.trim()) {
      setError('Supplier is required when recording an advance payment');
      return;
    }

    if (creationMode === PRODUCT_CREATION_MODE.ORDER && newProductAdvance > 0 && !newProductForm.bank_account_id) {
      setError('Select a bank account for the advance payment');
      return;
    }

    setNewProductSubmitting(true);
    setError('');
    try {
      const res = await axios.post('/api/inventory', {
        ...newProductForm,
        quantity_available: creationMode === PRODUCT_CREATION_MODE.ORDER ? 0 : num(newProductForm.quantity_available),
        purchase_price: newProductPurchasePrice,
        selling_price: num(newProductForm.selling_price),
        order_quantity: creationMode === PRODUCT_CREATION_MODE.ORDER ? newProductOrderQty : undefined,
        advance_amount: creationMode === PRODUCT_CREATION_MODE.ORDER ? newProductAdvance : undefined,
        bank_account_id: creationMode === PRODUCT_CREATION_MODE.ORDER && newProductAdvance > 0
          ? Number(newProductForm.bank_account_id)
          : undefined
      });
      setShowNewProductModal(false);
      setNewProductForm(getEmptyNewProductForm());
      await fetchAll();
      if (res.data?.id && creationMode === PRODUCT_CREATION_MODE.INVENTORY) {
        setFormProductId(String(res.data.id));
        if (res.data.purchase_price) setFormPrice(String(res.data.purchase_price));
        if (res.data.supplier) setFormSupplier(res.data.supplier);
      } else {
        resetPurchaseForm();
      }
      setSuccess(
        creationMode === PRODUCT_CREATION_MODE.ORDER
          ? 'Product created and purchase order recorded successfully.'
          : 'Product created and added directly to inventory successfully.'
      );
      setTimeout(() => setSuccess(''), 3500);
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to create product');
    } finally {
      setNewProductSubmitting(false);
    }
  };

  const handleAddCategory = async (event) => {
    event.preventDefault();
    if (!newCategoryName.trim()) return;
    setError('');
    setSuccess('');
    try {
      await axios.post('/api/purchases/categories', { name: newCategoryName.trim() });
      setNewCategoryName('');
      setSuccess('Category added');
      await fetchAll();
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
      await fetchAll();
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

  const bankOptions = bankAccounts.map((account) => ({
    value: String(account.id),
    label: `${account.account_name} - ${account.bank_name} (${fmtMoney(account.balance)})`
  }));

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div
        className="rounded-2xl px-7 py-5 flex items-center justify-between shadow-lg overflow-hidden relative"
        style={{ background: 'linear-gradient(135deg,#1e3a5f 0%,#1d4ed8 50%,#7c3aed 100%)' }}
      >
        <div
          className="absolute inset-0 opacity-10 pointer-events-none"
          style={{ backgroundImage: 'radial-gradient(circle at 80% 50%,#93c5fd,transparent 60%)' }}
        />
        <div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight">Purchases</h1>
          <p className="mt-0.5 text-sm text-blue-200">
            Receive stock now or place an order and move it into inventory after delivery
          </p>
        </div>
        <div className="h-12 w-12 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center">
          <Truck className="h-6 w-6 text-white" />
        </div>
      </div>

      <div className="card !p-2">
        <nav className="flex gap-1">
          {[
            { id: 'record', label: 'Record Purchase', icon: Truck },
            { id: 'history', label: 'Purchase History', icon: Package },
            { id: 'suppliers', label: 'Suppliers', icon: Users },
            { id: 'categories', label: 'Manage Categories', icon: Tag }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                activeTab === tab.id ? 'text-white shadow-md' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
              }`}
              style={activeTab === tab.id
                ? { background: 'linear-gradient(135deg,#3b82f6,#6366f1)', boxShadow: '0 2px 8px rgba(99,102,241,0.35)' }
                : {}}
            >
              <tab.icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 px-4 py-3 text-red-700 text-sm" style={{ background: 'linear-gradient(90deg,#fff5f5,#fef2f2)' }}>
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-xl border border-green-200 px-4 py-3 text-green-700 text-sm" style={{ background: 'linear-gradient(90deg,#f0fdf4,#ecfdf5)' }}>
          {success}
        </div>
      )}

      {activeTab === 'record' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          <div className="lg:col-span-2 card self-start">
            <div className="flex items-center gap-2 mb-4">
              <span className="h-6 w-6 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                <Search className="h-3.5 w-3.5 text-white" />
              </span>
              <h2 className="text-base font-bold text-gray-800">Select Product</h2>
              <button
                type="button"
                onClick={() => {
                  setNewProductForm(getEmptyNewProductForm());
                  setShowNewProductModal(true);
                }}
                className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-white shadow-sm hover:shadow-md active:scale-95 transition-all duration-150"
                style={{ background: 'linear-gradient(135deg,#059669,#10b981)' }}
              >
                <Plus className="h-3 w-3" /> New Product
              </button>
            </div>
            <div className="flex gap-3 mb-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input type="text" placeholder="Search products..." className="input-field pl-10" value={productSearch} onChange={(e) => setProductSearch(e.target.value)} />
              </div>
              <div style={{ minWidth: '160px' }}>
                <CustomSelect
                  options={[
                    { value: 'all', label: 'All Categories' },
                    ...categories.map((category) => ({
                      value: category.name,
                      label: category.name.charAt(0).toUpperCase() + category.name.slice(1)
                    }))
                  ]}
                  value={productCategoryFilter}
                  onChange={(value) => setProductCategoryFilter(value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filteredProducts.map((product) => {
                const isSelected = String(formProductId) === String(product.id);
                const isLowStock = num(product.quantity_available) <= 10;
                return (
                  <div
                    key={product.id}
                    onClick={() => {
                      setFormProductId(String(product.id));
                      setProductSearch('');
                    }}
                    className={`rounded-xl p-4 border cursor-pointer transition-all duration-200 ${
                      isSelected ? 'border-blue-400 shadow-md' : isLowStock ? 'border-amber-200 hover:border-amber-300 hover:shadow-sm' : 'border-gray-100 hover:border-blue-200 hover:shadow-sm'
                    }`}
                    style={{
                      background: isSelected
                        ? 'linear-gradient(135deg,#eff6ff,#eef2ff)'
                        : isLowStock
                          ? 'linear-gradient(135deg,#fff7ed,#fffbeb)'
                          : 'linear-gradient(135deg,#f8faff,#f5f3ff)'
                    }}
                  >
                    <div className="flex justify-between items-start mb-1 gap-2">
                      <div>
                        <h3 className="font-semibold text-gray-900 text-sm">{product.product_name}</h3>
                        {product.variety && <p className="text-xs text-gray-400">{product.variety}</p>}
                        <div className="flex flex-wrap items-center gap-1.5 mt-1">
                          <span className="inline-block text-xs px-2 py-0.5 rounded-full font-medium capitalize" style={{ background: 'linear-gradient(90deg,#ede9fe,#e0e7ff)', color: '#6d28d9' }}>
                            {product.category}
                          </span>
                          {isLowStock && (
                            <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-bold bg-amber-100 text-amber-700">
                              <AlertTriangle className="h-3 w-3" />
                              Low Stock
                            </span>
                          )}
                        </div>
                      </div>
                      <span className={`text-xs font-bold px-2 py-1 rounded-lg ${isLowStock ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                        {product.quantity_available} {product.unit}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                      Buy price: <span className="font-semibold text-gray-700">{fmtMoney(product.purchase_price)}/{product.unit}</span>
                    </p>
                  </div>
                );
              })}

              {filteredProducts.length === 0 && (
                <div className="col-span-2 text-center py-10 text-gray-400">
                  <Package className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No available products found</p>
                  <button
                    type="button"
                    onClick={() => {
                      setNewProductForm(getEmptyNewProductForm());
                      setShowNewProductModal(true);
                    }}
                    className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white shadow-sm active:scale-95 transition-all"
                    style={{ background: 'linear-gradient(135deg,#059669,#10b981)' }}
                  >
                    <Plus className="h-3.5 w-3.5" /> Create New Product
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="card !p-0 overflow-hidden self-start lg:sticky lg:top-6">
            <div className="px-5 py-4 border-b border-gray-100" style={{ background: 'linear-gradient(90deg,#eff6ff,#eef2ff)' }}>
              <div className="flex items-center gap-2">
                <span className="h-7 w-7 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-sm">
                  <Truck className="h-4 w-4 text-white" />
                </span>
                <h2 className="text-base font-bold text-gray-800">Purchase Details</h2>
              </div>
            </div>

            <form onSubmit={handleRecordPurchase} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-2 rounded-xl bg-gray-100 p-1">
                <button type="button" onClick={() => setFormStatus(PURCHASE_STATUS.DELIVERED)} className={`rounded-lg px-3 py-2 text-sm font-semibold transition-all ${formStatus === PURCHASE_STATUS.DELIVERED ? 'bg-white text-emerald-700 shadow-sm' : 'text-gray-500'}`}>
                  Delivered Now
                </button>
                <button type="button" onClick={() => setFormStatus(PURCHASE_STATUS.ORDERED)} className={`rounded-lg px-3 py-2 text-sm font-semibold transition-all ${formStatus === PURCHASE_STATUS.ORDERED ? 'bg-white text-amber-700 shadow-sm' : 'text-gray-500'}`}>
                  Order Now
                </button>
              </div>

              {selectedProduct ? (
                <div className={`rounded-xl p-4 text-sm border-2 relative ${formStatus === PURCHASE_STATUS.ORDERED ? 'border-amber-300' : 'border-blue-400'}`} style={{ background: formStatus === PURCHASE_STATUS.ORDERED ? 'linear-gradient(135deg,#fff7ed,#fffbeb)' : 'linear-gradient(135deg,#eff6ff,#eef2ff)' }}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-gray-900 text-base">{selectedProduct.product_name}</p>
                      {selectedProduct.variety && <p className="text-sm text-gray-500 mt-0.5">{selectedProduct.variety}</p>}
                      <div className="flex flex-wrap items-center gap-2 mt-1.5">
                        <span className="inline-block text-xs px-2 py-0.5 rounded-full font-semibold capitalize" style={{ background: '#ede9fe', color: '#6d28d9' }}>
                          {selectedProduct.category}
                        </span>
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-lg ${num(selectedProduct.quantity_available) <= 10 ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                          {selectedProduct.quantity_available} {selectedProduct.unit}
                        </span>
                      </div>
                    </div>
                    <button type="button" onClick={() => setFormProductId('')} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-gray-500 bg-white border border-gray-200 hover:border-red-300 hover:text-red-600 hover:bg-red-50 transition-all duration-150 shadow-sm flex-shrink-0">
                      <X className="h-3.5 w-3.5" /> Clear
                    </button>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl p-4 border-2 border-dashed border-gray-200 text-center">
                  <p className="text-sm text-gray-400">Select a product from the list</p>
                </div>
              )}

              <div className={`rounded-xl px-4 py-3 text-xs ${formStatus === PURCHASE_STATUS.ORDERED ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>
                {formStatus === PURCHASE_STATUS.ORDERED
                  ? 'This creates a pending order. Stock will move into inventory only after delivery is confirmed.'
                  : 'This records received stock immediately and updates inventory right away.'}
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1 flex items-center gap-1">
                  <Package className="h-3 w-3" /> Quantity
                </label>
                <input type="number" min="1" step="1" className="input-field !text-sm" placeholder={`e.g. 50 ${selectedProduct?.unit || ''}`} value={formQuantity} onChange={(e) => setFormQuantity(e.target.value)} required />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1 flex items-center gap-1">
                  <IndianRupee className="h-3 w-3" /> Price per Unit (₹)
                </label>
                <input type="number" min="0" step="0.01" className="input-field !text-sm" placeholder="e.g. 120" value={formPrice} onChange={(e) => setFormPrice(e.target.value)} required />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1 flex items-center gap-1">
                  <Truck className="h-3 w-3" /> Supplier
                </label>
                <input type="text" className="input-field !text-sm" placeholder={formStatus === PURCHASE_STATUS.ORDERED ? 'Supplier name (recommended for due tracking)' : 'Supplier name (optional)'} value={formSupplier} onChange={(e) => setFormSupplier(e.target.value)} />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  {formStatus === PURCHASE_STATUS.ORDERED ? 'Order Date' : 'Purchase Date'}
                </label>
                <input type="date" className="input-field !text-sm" value={formDate} onChange={(e) => setFormDate(e.target.value)} />
              </div>

              {formStatus === PURCHASE_STATUS.ORDERED && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1 flex items-center gap-1">
                      <IndianRupee className="h-3 w-3" /> Advance Payment from Bank (₹)
                    </label>
                    <input type="number" min="0" step="0.01" className="input-field !text-sm" placeholder="Leave 0 if no advance is paid now" value={formAdvanceAmount} onChange={(e) => setFormAdvanceAmount(e.target.value)} />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1 flex items-center gap-1">
                      <Landmark className="h-3 w-3" /> Bank Account for Advance
                    </label>
                    {bankOptions.length > 0 ? (
                      <CustomSelect options={bankOptions} value={formBankAccountId} onChange={(value) => setFormBankAccountId(value)} placeholder="Select bank account" />
                    ) : (
                      <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                        Add a bank account in Transactions before recording an advance payment.
                      </div>
                    )}
                  </div>
                </>
              )}

              {(formQuantity || formPrice || (formStatus === PURCHASE_STATUS.ORDERED && formAdvanceAmount)) && (
                <div className="rounded-xl px-4 py-3 space-y-2" style={{ background: 'linear-gradient(135deg,#eff6ff,#eef2ff)' }}>
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-semibold text-gray-500 uppercase">Total Cost</span>
                    <span className="text-xl font-extrabold text-blue-700">{fmtMoney(totalCost)}</span>
                  </div>
                  {formStatus === PURCHASE_STATUS.ORDERED && (
                    <>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Advance from bank</span>
                        <span className="font-semibold text-violet-700">{fmtMoney(advanceAmount)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Balance due</span>
                        <span className="font-semibold text-amber-700">{fmtMoney(remainingAmount)}</span>
                      </div>
                    </>
                  )}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting || !selectedProduct}
                className="w-full py-2.5 rounded-xl font-bold text-sm text-white shadow-lg hover:shadow-xl active:scale-95 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ background: formStatus === PURCHASE_STATUS.ORDERED ? 'linear-gradient(135deg,#f59e0b,#d97706)' : 'linear-gradient(135deg,#3b82f6,#6366f1)' }}
              >
                {submitting ? 'Saving...' : formStatus === PURCHASE_STATUS.ORDERED ? 'Review & Confirm Order' : 'Review & Confirm Purchase'}
              </button>
            </form>
          </div>
        </div>
      )}

      {activeTab === 'history' && (
        <div className="card">
          <div className="flex flex-col lg:flex-row lg:items-center gap-4 mb-4">
            <div>
              <h3 className="text-base font-bold text-gray-800">Purchase History</h3>
            </div>
            <div className="flex gap-2">
              {[
                { value: 'all', label: 'All' },
                { value: PURCHASE_STATUS.ORDERED, label: 'Pending Orders' },
                { value: PURCHASE_STATUS.DELIVERED, label: 'Delivered' }
              ].map((filter) => (
                <button
                  key={filter.value}
                  type="button"
                  onClick={() => setHistoryStatusFilter(filter.value)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${historyStatusFilter === filter.value ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-500 hover:text-gray-700'}`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
            <div className="relative flex-1 lg:max-w-xs lg:ml-auto">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input type="text" placeholder="Search purchases..." className="input-field pl-10 !text-sm" value={historySearch} onChange={(e) => setHistorySearch(e.target.value)} />
            </div>
            <div className="w-full lg:w-52">
              <CustomSelect
                options={[
                  { value: 'all', label: 'All Categories' },
                  ...categories.map((category) => ({
                    value: category.name,
                    label: category.name.charAt(0).toUpperCase() + category.name.slice(1)
                  }))
                ]}
                value={historyCategoryFilter}
                onChange={(value) => setHistoryCategoryFilter(value || 'all')}
                placeholder="Filter by category"
              />
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
                    <SortableHeader label="Order At" sortKey="purchase_date" sortConfig={sortConfig} onSort={requestSort} />
                    <SortableHeader label="Product" sortKey="product_name" sortConfig={sortConfig} onSort={requestSort} />
                    <SortableHeader label="Category" sortKey="category" sortConfig={sortConfig} onSort={requestSort} />
                    <SortableHeader label="Status" sortKey="purchase_status" sortConfig={sortConfig} onSort={requestSort} />
                    <SortableHeader label="Quantity" sortKey="quantity" sortConfig={sortConfig} onSort={requestSort} />
                    <SortableHeader label="Amounts" sortKey="total_amount" sortConfig={sortConfig} onSort={requestSort} />
                    <SortableHeader label="Supplier" sortKey="supplier" sortConfig={sortConfig} onSort={requestSort} />
                    <SortableHeader label="Delivery" sortKey="delivery_date" sortConfig={sortConfig} onSort={requestSort} />
                    {showHistoryActions && <th className="text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {sortedPurchases.map((purchase) => {
                    const statusMeta = getPurchaseStatusMeta(purchase.purchase_status, purchase.product_deleted);
                    const isPending = String(purchase.purchase_status).toLowerCase() === PURCHASE_STATUS.ORDERED;
                    return (
                      <tr key={purchase.id} className={isPending ? 'bg-amber-50/50' : ''}>
                        <td>
                          <div>
                            <p className="text-sm font-medium text-gray-900">{fmtDateTime(purchase.purchase_date)}</p>
                            <p className="text-xs font-mono text-gray-400">{purchase.purchase_id}</p>
                          </div>
                        </td>
                        <td>
                          <div>
                            <p className="font-medium text-gray-900">{purchase.product_name}</p>
                            {purchase.variety && <p className="text-xs text-gray-400">{purchase.variety}</p>}
                          </div>
                        </td>
                        <td className="capitalize">{purchase.category || '-'}</td>
                        <td>
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-bold ${statusMeta.badgeClass}`}>
                            {isPending ? <Clock3 className="h-3 w-3" /> : <CheckCircle className="h-3 w-3" />}
                            {statusMeta.label}
                          </span>
                        </td>
                        <td>{purchase.quantity} {purchase.unit}</td>
                        <td>
                          <div className="space-y-1 text-sm">
                            <p className="font-semibold text-blue-700">{fmtMoney(purchase.total_amount)}</p>
                            <p className="text-xs text-gray-500">Rate: {fmtMoney(purchase.price_per_unit)} / {purchase.unit}</p>
                            {num(purchase.advance_amount) > 0 && (
                              <p className="text-xs text-violet-600">Advance: {fmtMoney(purchase.advance_amount)}</p>
                            )}
                            {num(purchase.balance_due) > 0 && (
                              <p className="text-xs font-semibold text-amber-700">Due: {fmtMoney(purchase.balance_due)}</p>
                            )}
                          </div>
                        </td>
                        <td>{purchase.supplier || '-'}</td>
                        <td>
                          {purchase.delivery_date ? (
                            <div>
                              <p className="text-sm font-medium text-gray-900">{fmtDateTime(purchase.delivery_date)}</p>
                              <p className="text-xs text-gray-400">
                                {purchase.added_by_name ? `Updated by ${purchase.added_by_name}` : 'Received into inventory'}
                              </p>
                            </div>
                          ) : isPending ? (
                            <span className="inline-flex rounded-full bg-amber-100 px-2 py-1 text-xs font-bold text-amber-700">
                              Awaiting delivery
                            </span>
                          ) : (
                            <span className="text-sm text-gray-500">Received immediately</span>
                          )}
                        </td>
                        {showHistoryActions && (
                          <td>
                            {isPending && (
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => openDeliverPurchaseModal(purchase)}
                                className="inline-flex items-center gap-1 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 transition-colors hover:bg-emerald-100"
                              >
                                <CheckCircle className="h-3.5 w-3.5" />
                                Deliver
                              </button>
                              <button
                                type="button"
                                onClick={() => setPartialModal({ open: true, purchase, quantity: '', delivery_date: getISTDateString() })}
                                className="inline-flex items-center gap-1 rounded-lg border border-blue-100 bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700 transition-colors hover:bg-blue-100"
                              >
                                <Package className="h-3.5 w-3.5" />
                                Partial
                              </button>
                              {isAdmin && (
                                <button
                                  type="button"
                                  onClick={() => setCancelModal({ open: true, purchase })}
                                  className="inline-flex items-center gap-1 rounded-lg border border-red-100 bg-red-50 px-3 py-1.5 text-xs font-bold text-red-700 transition-colors hover:bg-red-100"
                                >
                                  <X className="h-3.5 w-3.5" />
                                  Cancel
                                </button>
                              )}
                            </div>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
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

      {activeTab === 'suppliers' && (
        <div className="space-y-6">
          {!selectedSupplier ? (
            <div className="card">
              <div className="flex items-center gap-2 mb-4">
                <span className="h-6 w-6 rounded-lg bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center">
                  <Users className="h-3.5 w-3.5 text-white" />
                </span>
                <h2 className="text-base font-bold text-gray-800">All Suppliers</h2>
                <span className="ml-auto text-xs font-bold px-2 py-0.5 rounded-full text-white" style={{ background: 'linear-gradient(135deg,#14b8a6,#059669)' }}>
                  {filteredSuppliers.length}
                </span>
              </div>

              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input type="text" placeholder="Search suppliers..." className="input-field pl-10 !text-sm" value={supplierSearch} onChange={(e) => setSupplierSearch(e.target.value)} />
              </div>

              {filteredSuppliers.length === 0 ? (
                <div className="text-center py-10 text-gray-400">
                  <Users className="h-10 w-10 mx-auto mb-2 opacity-20" />
                  <p className="text-sm">No suppliers found. Record purchases with supplier names to see them here.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredSuppliers.map((supplier, index) => (
                    <div
                      key={index}
                      onClick={() => fetchSupplierDetail(supplier.supplier)}
                      className="rounded-xl p-4 border border-gray-100 cursor-pointer hover:border-teal-300 hover:shadow-md transition-all duration-200"
                      style={{ background: 'linear-gradient(135deg,#f0fdfa,#f0fdf4)' }}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-bold text-gray-900">{supplier.supplier}</p>
                          <div className="flex gap-4 mt-1 text-xs text-gray-500 flex-wrap">
                            <span><strong>{supplier.products_supplied}</strong> products</span>
                            <span><strong>{supplier.total_purchases}</strong> purchases</span>
                            <span>Last: {supplier.last_purchase_date ? fmtDateTime(supplier.last_purchase_date) : '—'}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <p className="text-sm font-bold text-teal-700">{fmtMoney(supplier.total_spent || 0)}</p>
                            <p className="text-xs text-gray-400">{supplier.total_quantity} units</p>
                          </div>
                          {isAdmin && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteSupplierModal({ open: true, supplier: supplier.supplier });
                              }}
                              className="inline-flex items-center gap-1 rounded-lg bg-red-50 px-2.5 py-1.5 text-xs font-bold text-red-600 hover:bg-red-100 transition-colors"
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
          ) : (
            <>
              <button onClick={() => { setSelectedSupplier(null); setSupplierDetail(null); }} className="inline-flex items-center gap-1.5 text-sm font-medium text-teal-600 hover:text-teal-800 transition-colors">
                <ArrowLeft className="h-4 w-4" /> Back to all suppliers
              </button>

              {supplierLoading ? (
                <div className="flex flex-col items-center justify-center h-40 gap-3">
                  <div className="relative h-10 w-10">
                    <div className="absolute inset-0 rounded-full border-4 border-teal-100" />
                    <div className="absolute inset-0 rounded-full border-4 border-t-teal-500 animate-spin" />
                  </div>
                  <p className="text-sm text-teal-400 font-medium">Loading supplier details...</p>
                </div>
              ) : supplierDetail ? (
                <div className="space-y-6">
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
                      <div className="rounded-xl p-4" style={{ background: 'linear-gradient(135deg,#f0fdfa,#ecfdf5)' }}>
                        <p className="text-xs font-semibold text-gray-500 uppercase">Total Purchases</p>
                        <p className="text-2xl font-extrabold text-teal-700">{supplierDetail.summary?.total_purchases || 0}</p>
                      </div>
                      <div className="rounded-xl p-4" style={{ background: 'linear-gradient(135deg,#eff6ff,#eef2ff)' }}>
                        <p className="text-xs font-semibold text-gray-500 uppercase">Total Items</p>
                        <p className="text-2xl font-extrabold text-blue-700">{Number(supplierDetail.summary?.total_items || 0)}</p>
                      </div>
                      <div className="rounded-xl p-4" style={{ background: 'linear-gradient(135deg,#faf5ff,#f5f3ff)' }}>
                        <p className="text-xs font-semibold text-gray-500 uppercase">Total Cost</p>
                        <p className="text-2xl font-extrabold text-purple-700">{fmtMoney(supplierDetail.summary?.total_cost || 0)}</p>
                      </div>
                    </div>
                  </div>

                  <div className="card">
                    <h3 className="text-base font-bold text-gray-800 mb-4">Products Supplied</h3>
                    <div className="table-container">
                      <table className="table">
                        <thead>
                          <tr>
                            <SortableHeader label="Product ID" sortKey="product_code" sortConfig={supProductsSort} onSort={sortSupProducts} />
                            <SortableHeader label="Product" sortKey="product_name" sortConfig={supProductsSort} onSort={sortSupProducts} />
                            <SortableHeader label="Category" sortKey="category" sortConfig={supProductsSort} onSort={sortSupProducts} />
                            <SortableHeader label="Total Qty" sortKey="total_quantity" sortConfig={supProductsSort} onSort={sortSupProducts} />
                            <SortableHeader label="Total Spent" sortKey="total_spent" sortConfig={supProductsSort} onSort={sortSupProducts} />
                            <SortableHeader label="Purchases" sortKey="purchase_count" sortConfig={supProductsSort} onSort={sortSupProducts} />
                            <SortableHeader label="Last Purchase" sortKey="last_purchase_date" sortConfig={supProductsSort} onSort={sortSupProducts} />
                          </tr>
                        </thead>
                        <tbody>
                          {sortedSupProducts.map((product, index) => (
                            <tr key={index}>
                              <td className="font-mono text-xs">{product.product_code}</td>
                              <td>
                                <p className="font-medium">{product.product_name}</p>
                                {product.variety && <p className="text-xs text-gray-400">{product.variety}</p>}
                              </td>
                              <td className="capitalize">{product.category}</td>
                              <td>{product.total_quantity} {product.unit}</td>
                              <td className="font-medium">{fmtMoney(product.total_spent || 0)}</td>
                              <td>{product.purchase_count}</td>
                              <td className="text-sm">{fmtDateTime(product.last_purchase_date)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {sortedSupProducts.length === 0 && <div className="text-center py-6 text-gray-400 text-sm">No products found</div>}
                    </div>
                  </div>

                  <div className="card">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-base font-bold text-gray-800">Purchase History</h3>
                      <select value={supHistoryStatusFilter} onChange={(e) => setSupHistoryStatusFilter(e.target.value)}
                        className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-300">
                        <option value="all">Status: All</option>
                        <option value="delivered">Delivered</option>
                        <option value="ordered">Ordered</option>
                        <option value="deleted">Deleted</option>
                      </select>
                    </div>
                    <div className="table-container">
                      <table className="table">
                        <thead>
                          <tr>
                            <SortableHeader label="Purchase ID" sortKey="purchase_id" sortConfig={supHistorySort} onSort={sortSupHistory} />
                            <SortableHeader label="Product" sortKey="product_name" sortConfig={supHistorySort} onSort={sortSupHistory} />
                            <th>Status</th>
                            <SortableHeader label="Qty" sortKey="quantity" sortConfig={supHistorySort} onSort={sortSupHistory} />
                            <SortableHeader label="Total" sortKey="total_amount" sortConfig={supHistorySort} onSort={sortSupHistory} />
                            <SortableHeader label="Advance" sortKey="advance_amount" sortConfig={supHistorySort} onSort={sortSupHistory} />
                            <SortableHeader label="Order Date" sortKey="purchase_date" sortConfig={supHistorySort} onSort={sortSupHistory} />
                            <SortableHeader label="Delivery Date" sortKey="delivery_date" sortConfig={supHistorySort} onSort={sortSupHistory} />
                            <SortableHeader label="Added By" sortKey="added_by" sortConfig={supHistorySort} onSort={sortSupHistory} />
                          </tr>
                        </thead>
                        <tbody>
                          {sortedSupHistory.filter(h => {
                            if (supHistoryStatusFilter === 'all') return true;
                            if (supHistoryStatusFilter === 'deleted') return h.product_deleted;
                            return h.purchase_status === supHistoryStatusFilter;
                          }).map((history, index) => {
                            const statusMeta = getPurchaseStatusMeta(history.purchase_status, history.product_deleted);
                            return (
                              <tr key={index}>
                                <td className="font-mono text-xs">{history.purchase_id}</td>
                                <td>
                                  <p className="font-medium">{history.product_name}</p>
                                  {history.variety && <p className="text-xs text-gray-400">{history.variety}</p>}
                                </td>
                                <td><span className={`inline-flex rounded-full px-2 py-1 text-xs font-bold ${statusMeta.badgeClass}`}>{statusMeta.label}</span></td>
                                <td>{history.quantity} {history.unit}</td>
                                <td className="font-medium">{fmtMoney(history.total_amount)}</td>
                                <td>{num(history.advance_amount) > 0 ? fmtMoney(history.advance_amount) : '-'}</td>
                                <td className="text-sm">{fmtDateTime(history.purchase_date)}</td>
                                <td className="text-sm">
                                  {history.delivery_date
                                    ? fmtDateTime(history.delivery_date)
                                    : String(history.purchase_status).toLowerCase() === PURCHASE_STATUS.ORDERED
                                      ? 'Awaiting delivery'
                                      : 'Received immediately'}
                                </td>
                                <td>{history.added_by || '—'}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                      {sortedSupHistory.length === 0 && <div className="text-center py-6 text-gray-400 text-sm">No purchase history</div>}
                    </div>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>
      )}

      {activeTab === 'categories' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card">
            <div className="flex items-center gap-2 mb-4">
              <span className="h-6 w-6 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
                <Plus className="h-3.5 w-3.5 text-white" />
              </span>
              <h3 className="text-base font-bold text-gray-800">Add New Category</h3>
            </div>
            <form onSubmit={handleAddCategory} className="flex gap-3">
              <input type="text" className="input-field flex-1 !text-sm" placeholder="e.g. pesticides, tools..." value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} required />
              <button type="submit" className="px-4 py-2 rounded-xl font-semibold text-sm text-white shadow-sm hover:shadow-md active:scale-95 transition-all duration-150" style={{ background: 'linear-gradient(135deg,#7c3aed,#6366f1)' }}>
                <Plus className="h-4 w-4" />
              </button>
            </form>
            <p className="text-xs text-gray-400 mt-3">Categories are used across the inventory when adding new products.</p>
          </div>

          <div className="card">
            <div className="flex items-center gap-2 mb-4">
              <span className="h-6 w-6 rounded-lg bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center">
                <Tag className="h-3.5 w-3.5 text-white" />
              </span>
              <h3 className="text-base font-bold text-gray-800">Current Categories</h3>
              <span className="ml-auto text-xs font-bold px-2 py-0.5 rounded-full text-white" style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>
                {filteredCategories.length}
              </span>
            </div>

            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input type="text" placeholder="Search categories..." className="input-field pl-10 !text-sm" value={categorySearch} onChange={(e) => setCategorySearch(e.target.value)} />
            </div>

            <div className="space-y-2">
              {filteredCategories.map((category) => (
                <div key={category.id} className="flex items-center justify-between rounded-xl px-4 py-2.5 border border-indigo-100/60" style={{ background: 'linear-gradient(135deg,#fafbff,#f5f3ff)' }}>
                  <span className="text-sm font-semibold text-gray-700 capitalize">{category.name}</span>
                  {isAdmin && (
                    <button onClick={() => setDeleteCatModal({ open: true, id: category.id, name: category.name })} className="text-gray-300 hover:text-red-500 transition-colors" title="Delete category">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
              {categories.length === 0 && <p className="text-sm text-gray-400 text-center py-4">No categories yet</p>}
            </div>
          </div>
        </div>
      )}

      <SharedModal
        isOpen={deleteCatModal.open}
        onClose={() => setDeleteCatModal({ open: false, id: null, name: '' })}
        title="Delete Category"
        type="warning"
        theme="purchases"
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
        theme="purchases"
        confirmText="Delete"
        onConfirm={handleDeleteSupplier}
      >
        <p>Are you sure you want to delete supplier <span className="font-semibold">"{deleteSupplierModal.supplier}"</span>?</p>
        <p className="mt-2 text-xs text-gray-500">
          This will remove the supplier name from purchases and products, and delete that supplier&apos;s payment records from Transactions.
        </p>
      </SharedModal>

      {confirmModal.open && confirmModal.data && renderPortalModal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(4px)' }}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md animate-scale-in flex flex-col border border-indigo-100/70 overflow-hidden" style={{ maxHeight: '85vh' }}>
            <div className="px-6 py-4 border-b border-indigo-100 flex-shrink-0" style={{ background: 'linear-gradient(135deg,#eff6ff,#eef2ff)' }}>
              <div className="flex items-center gap-3">
                <span className="h-9 w-9 rounded-xl flex items-center justify-center shadow bg-gradient-to-br from-indigo-500 to-violet-600">
                  {confirmModal.data.purchase_status === PURCHASE_STATUS.ORDERED ? <Clock3 className="h-5 w-5 text-white" /> : <CheckCircle className="h-5 w-5 text-white" />}
                </span>
                <div>
                  <h3 className="text-base font-bold text-gray-900">
                    {confirmModal.data.purchase_status === PURCHASE_STATUS.ORDERED ? 'Confirm Purchase Order' : 'Confirm Purchase'}
                  </h3>
                  <p className="text-xs text-gray-500">
                    {confirmModal.data.purchase_status === PURCHASE_STATUS.ORDERED ? 'Inventory will update after delivery confirmation' : 'Inventory will be updated immediately'}
                  </p>
                </div>
                <button onClick={() => setConfirmModal({ open: false, data: null })} className="ml-auto h-9 w-9 rounded-2xl flex items-center justify-center text-indigo-300 hover:text-indigo-700 hover:bg-white/80 transition-all">
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto flex-1" style={{ scrollbarWidth: 'thin' }}>
              <div className="rounded-2xl p-4 space-y-3" style={{ background: 'linear-gradient(135deg,#f8faff,#f5f3ff)' }}>
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-bold text-gray-900">{confirmModal.data.product?.product_name}</p>
                    {confirmModal.data.product?.variety && <p className="text-xs text-gray-400">{confirmModal.data.product.variety}</p>}
                    <span className="inline-block mt-1 text-xs px-2 py-0.5 rounded-full font-medium capitalize" style={{ background: '#ede9fe', color: '#6d28d9' }}>
                      {confirmModal.data.product?.category}
                    </span>
                  </div>
                  <span className="text-xs font-bold px-2 py-1 rounded-lg bg-blue-100 text-blue-700">{confirmModal.data.product?.unit}</span>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-indigo-100">
                  <div>
                    <p className="text-xs text-gray-400 uppercase font-semibold">Status</p>
                    <p className="font-bold text-gray-900">{confirmModal.data.purchase_status === PURCHASE_STATUS.ORDERED ? 'Ordered' : 'Delivered'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 uppercase font-semibold">Quantity</p>
                    <p className="font-bold text-gray-900">{confirmModal.data.quantity} {confirmModal.data.product?.unit}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 uppercase font-semibold">Price / Unit</p>
                    <p className="font-bold text-gray-900">{fmtMoney(confirmModal.data.price_per_unit)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 uppercase font-semibold">Supplier</p>
                    <p className="font-semibold text-gray-700">{confirmModal.data.supplier || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 uppercase font-semibold">{confirmModal.data.purchase_status === PURCHASE_STATUS.ORDERED ? 'Order Date' : 'Purchase Date'}</p>
                    <p className="font-semibold text-gray-700">{confirmModal.data.purchase_date}</p>
                  </div>
                  {confirmModal.data.purchase_status === PURCHASE_STATUS.ORDERED && (
                    <div>
                      <p className="text-xs text-gray-400 uppercase font-semibold">Advance from Bank</p>
                      <p className="font-semibold text-gray-700">{confirmModal.data.advance_amount > 0 ? fmtMoney(confirmModal.data.advance_amount) : 'No advance'}</p>
                    </div>
                  )}
                </div>

                {confirmModal.data.purchase_status === PURCHASE_STATUS.ORDERED && confirmModal.data.advance_amount > 0 && (
                  <div className="rounded-2xl border border-violet-100 bg-violet-50 px-3 py-2 text-xs text-violet-700">
                    Advance will be deducted from: <span className="font-bold">{confirmModal.data.bank_account_name}</span>
                  </div>
                )}
              </div>

              <div className="rounded-2xl px-4 py-3 space-y-2" style={{ background: 'linear-gradient(135deg,#eff6ff,#eef2ff)' }}>
                <div className="flex justify-between items-center">
                  <span className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Total Cost</span>
                  <span className="text-2xl font-extrabold text-indigo-700">{fmtMoney(confirmModal.data.quantity * confirmModal.data.price_per_unit)}</span>
                </div>
                {confirmModal.data.purchase_status === PURCHASE_STATUS.ORDERED && (
                  <>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Advance paid now</span>
                      <span className="font-semibold text-violet-700">{fmtMoney(confirmModal.data.advance_amount)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Balance due</span>
                      <span className="font-semibold text-indigo-700">{fmtMoney((confirmModal.data.quantity * confirmModal.data.price_per_unit) - confirmModal.data.advance_amount)}</span>
                    </div>
                  </>
                )}
              </div>

              <p className="text-xs text-gray-400 text-center">
                {confirmModal.data.purchase_status === PURCHASE_STATUS.ORDERED
                  ? <>Stock will remain unchanged until you mark this order as delivered.</>
                  : <>Stock will increase by <strong>{confirmModal.data.quantity} {confirmModal.data.product?.unit}</strong> after confirmation.</>}
              </p>
            </div>

            <div className="px-6 py-4 border-t border-indigo-100 flex gap-3 flex-shrink-0" style={{ background: 'linear-gradient(90deg,#f8faff,#f5f3ff)' }}>
              <button type="button" onClick={() => setConfirmModal({ open: false, data: null })} className="flex-1 py-2.5 rounded-2xl font-semibold text-sm text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button type="button" onClick={handleConfirmPurchase} className="flex-1 py-2.5 rounded-2xl font-bold text-sm text-white shadow-lg hover:shadow-xl active:scale-95 transition-all" style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>
                {confirmModal.data.purchase_status === PURCHASE_STATUS.ORDERED ? 'Confirm Order' : 'Confirm Purchase'}
              </button>
            </div>
          </div>
        </div>
      )}

      {editModal.open && editModal.purchase && renderPortalModal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(4px)' }}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md animate-scale-in flex flex-col border border-indigo-100/70 overflow-hidden" style={{ maxHeight: '85vh' }}>
            <div className="px-6 py-4 border-b border-gray-100 flex-shrink-0" style={{ background: 'linear-gradient(135deg,#eff6ff,#eef2ff)' }}>
              <div className="flex items-center gap-3">
                <span className="h-9 w-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow">
                  <Edit className="h-5 w-5 text-white" />
                </span>
                <div>
                  <h3 className="text-base font-bold text-gray-900">Edit Purchase</h3>
                  <p className="text-xs text-gray-500 font-mono">{editModal.purchase.purchase_id}</p>
                </div>
                <button onClick={() => setEditModal({ open: false, purchase: null })} className="ml-auto h-9 w-9 rounded-2xl flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-white/80 transition-all">
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <form onSubmit={handleEditPurchase} className="flex flex-col flex-1 overflow-hidden">
              <div className="p-6 space-y-4 overflow-y-auto flex-1" style={{ scrollbarWidth: 'thin' }}>
                <div className="rounded-2xl px-4 py-3 mb-2" style={{ background: 'linear-gradient(135deg,#f5f3ff,#eef2ff)' }}>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-gray-900 text-sm">{editModal.purchase.product_name}</p>
                      {editModal.purchase.variety && <p className="text-xs text-gray-400">{editModal.purchase.variety}</p>}
                      <p className="text-xs text-gray-400 mt-0.5 capitalize">{editModal.purchase.category} · {editModal.purchase.unit}</p>
                    </div>
                    <span className={`inline-flex rounded-full px-2 py-1 text-xs font-bold ${getPurchaseStatusMeta(editModal.purchase.purchase_status, editModal.purchase.product_deleted).badgeClass}`}>
                      {getPurchaseStatusMeta(editModal.purchase.purchase_status, editModal.purchase.product_deleted).label}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Quantity ({editModal.purchase.unit})</label>
                    <input type="number" min="1" step="1" required className="input-field !text-sm !rounded-2xl" value={editForm.quantity} onChange={(e) => setEditForm((current) => ({ ...current, quantity: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Price / Unit (₹)</label>
                    <input type="number" min="0" step="0.01" required className="input-field !text-sm !rounded-2xl" value={editForm.price_per_unit} onChange={(e) => setEditForm((current) => ({ ...current, price_per_unit: e.target.value }))} />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Supplier</label>
                  <input type="text" className="input-field !text-sm !rounded-2xl" placeholder="Supplier name" value={editForm.supplier} onChange={(e) => setEditForm((current) => ({ ...current, supplier: e.target.value }))} />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Order / Purchase Date</label>
                  <input type="date" className="input-field !text-sm !rounded-2xl" value={editForm.purchase_date} onChange={(e) => setEditForm((current) => ({ ...current, purchase_date: e.target.value }))} />
                </div>

                {num(editModal.purchase.advance_amount) > 0 && (
                  <div className="rounded-2xl border border-violet-100 bg-violet-50 px-4 py-3 text-xs text-violet-700">
                    This purchase already has an advance payment of <span className="font-bold">{fmtMoney(editModal.purchase.advance_amount)}</span>.
                    Keep a supplier name on this record so the due amount stays mapped correctly in Transactions.
                  </div>
                )}

                {editForm.quantity && editForm.price_per_unit && (
                  <div className="rounded-2xl px-4 py-3" style={{ background: 'linear-gradient(135deg,#eff6ff,#eef2ff)' }}>
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-semibold text-gray-500 uppercase">Updated Total</span>
                      <span className="text-xl font-extrabold text-blue-700">{fmtMoney(num(editForm.quantity) * num(editForm.price_per_unit))}</span>
                    </div>
                    {String(editModal.purchase.purchase_status).toLowerCase() === PURCHASE_STATUS.DELIVERED ? (
                      <p className="text-xs text-gray-400 mt-1">
                        Stock will be adjusted by{' '}
                        <strong className={num(editForm.quantity) - num(editModal.purchase.quantity) >= 0 ? 'text-green-600' : 'text-red-600'}>
                          {num(editForm.quantity) - num(editModal.purchase.quantity) >= 0 ? '+' : ''}
                          {num(editForm.quantity) - num(editModal.purchase.quantity)} {editModal.purchase.unit}
                        </strong>
                      </p>
                    ) : (
                      <p className="text-xs text-amber-600 mt-1">This is still a pending order. Inventory will change only when you mark it as delivered.</p>
                    )}
                  </div>
                )}
              </div>

              <div className="px-6 py-4 border-t border-gray-100 flex gap-3" style={{ background: 'linear-gradient(90deg,#f8faff,#f5f3ff)' }}>
                <button type="button" onClick={() => setEditModal({ open: false, purchase: null })} className="flex-1 py-2.5 rounded-2xl font-semibold text-sm text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={editSubmitting} className="flex-1 py-2.5 rounded-2xl font-bold text-sm text-white shadow-lg hover:shadow-xl active:scale-95 transition-all disabled:opacity-50" style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>
                  {editSubmitting ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deliverModal.open && deliverModal.purchase && renderPortalModal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(4px)' }}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md animate-scale-in flex flex-col border border-indigo-100/80 overflow-hidden">
            <div className="px-6 py-4 border-b border-indigo-100" style={{ background: 'linear-gradient(135deg,#eff6ff,#eef2ff)' }}>
              <div className="flex items-center gap-3">
                <span className="h-9 w-9 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow">
                  <CheckCircle className="h-5 w-5 text-white" />
                </span>
                <div>
                  <h3 className="text-base font-bold text-gray-900">Mark Order As Delivered</h3>
                  <p className="text-xs text-gray-500 font-mono">{deliverModal.purchase.purchase_id}</p>
                </div>
                <button onClick={() => setDeliverModal({ open: false, purchase: null, delivery_date: getISTDateString() })} className="ml-auto h-9 w-9 rounded-2xl flex items-center justify-center text-indigo-300 hover:text-indigo-700 hover:bg-white/80 transition-all">
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <form onSubmit={handleMarkDelivered} className="p-6 space-y-4">
              <div className="rounded-2xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm text-indigo-800">
                <p className="font-bold">{deliverModal.purchase.product_name}</p>
                <p className="mt-1">{deliverModal.purchase.quantity} {deliverModal.purchase.unit} will be added to inventory.</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Delivery Date</label>
                <input type="date" className="input-field !text-sm !rounded-2xl" value={deliverModal.delivery_date} onChange={(e) => setDeliverModal((current) => ({ ...current, delivery_date: e.target.value }))} required />
              </div>

              <div className="rounded-2xl bg-gray-50 px-4 py-3 text-xs text-gray-500">
                Once confirmed, this stock will be reflected in inventory and the order status will change to delivered.
              </div>

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setDeliverModal({ open: false, purchase: null, delivery_date: getISTDateString() })} className="flex-1 py-2.5 rounded-2xl font-semibold text-sm text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={deliverSubmitting} className="flex-1 py-2.5 rounded-2xl font-bold text-sm text-white shadow-lg hover:shadow-xl active:scale-95 transition-all disabled:opacity-50" style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>
                  {deliverSubmitting ? 'Updating...' : 'Confirm Delivery'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {cancelModal.open && cancelModal.purchase && renderPortalModal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(4px)' }}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md animate-scale-in flex flex-col border border-red-100/80 overflow-hidden">
            <div className="px-6 py-4 border-b border-red-100" style={{ background: 'linear-gradient(135deg,#fef2f2,#fff1f2)' }}>
              <div className="flex items-center gap-3">
                <span className="h-9 w-9 rounded-2xl bg-gradient-to-br from-red-500 to-rose-600 flex items-center justify-center shadow">
                  <AlertTriangle className="h-5 w-5 text-white" />
                </span>
                <div>
                  <h3 className="text-base font-bold text-gray-900">Cancel Order</h3>
                  <p className="text-xs text-gray-500 font-mono">{cancelModal.purchase.purchase_id}</p>
                </div>
                <button onClick={() => setCancelModal({ open: false, purchase: null })} className="ml-auto h-9 w-9 rounded-2xl flex items-center justify-center text-red-300 hover:text-red-700 hover:bg-white/80 transition-all">
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-800">
                <p className="font-bold">{cancelModal.purchase.product_name}</p>
                <p className="mt-1">{cancelModal.purchase.quantity} {cancelModal.purchase.unit} @ {fmtMoney(cancelModal.purchase.price_per_unit)}</p>
                {num(cancelModal.purchase.advance_amount) > 0 && (
                  <p className="mt-1 text-xs">Advance of {fmtMoney(cancelModal.purchase.advance_amount)} will be reversed.</p>
                )}
              </div>
              <div className="rounded-2xl bg-amber-50 border border-amber-100 px-4 py-3 text-xs text-amber-700">
                This action cannot be undone. The order will be cancelled and any advance payment will be refunded to the bank account.
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setCancelModal({ open: false, purchase: null })} className="flex-1 py-2.5 rounded-2xl font-semibold text-sm text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors">
                  Keep Order
                </button>
                <button type="button" onClick={handleCancelOrder} disabled={cancelSubmitting} className="flex-1 py-2.5 rounded-2xl font-bold text-sm text-white shadow-lg hover:shadow-xl active:scale-95 transition-all disabled:opacity-50" style={{ background: 'linear-gradient(135deg,#ef4444,#dc2626)' }}>
                  {cancelSubmitting ? 'Cancelling...' : 'Cancel Order'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {partialModal.open && partialModal.purchase && renderPortalModal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(4px)' }}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md animate-scale-in flex flex-col border border-blue-100/80 overflow-hidden">
            <div className="px-6 py-4 border-b border-blue-100" style={{ background: 'linear-gradient(135deg,#eff6ff,#dbeafe)' }}>
              <div className="flex items-center gap-3">
                <span className="h-9 w-9 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow">
                  <Package className="h-5 w-5 text-white" />
                </span>
                <div>
                  <h3 className="text-base font-bold text-gray-900">Partial Delivery</h3>
                  <p className="text-xs text-gray-500 font-mono">{partialModal.purchase.purchase_id}</p>
                </div>
                <button onClick={() => setPartialModal({ open: false, purchase: null, quantity: '', delivery_date: getISTDateString() })} className="ml-auto h-9 w-9 rounded-2xl flex items-center justify-center text-blue-300 hover:text-blue-700 hover:bg-white/80 transition-all">
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
            <form onSubmit={handlePartialDelivery} className="p-6 space-y-4">
              <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
                <p className="font-bold">{partialModal.purchase.product_name}</p>
                <p className="mt-1">Ordered: {partialModal.purchase.quantity} {partialModal.purchase.unit}</p>
                <p>Already delivered: {num(partialModal.purchase.quantity_delivered || 0)} {partialModal.purchase.unit}</p>
                <p className="font-semibold">Remaining: {partialModal.purchase.quantity - num(partialModal.purchase.quantity_delivered || 0)} {partialModal.purchase.unit}</p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Quantity to Deliver *</label>
                <input type="number" min="1" max={partialModal.purchase.quantity - num(partialModal.purchase.quantity_delivered || 0)} className="input-field !text-sm !rounded-2xl" placeholder="Enter quantity" value={partialModal.quantity} onChange={(e) => setPartialModal(prev => ({ ...prev, quantity: e.target.value }))} required />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Delivery Date</label>
                <input type="date" className="input-field !text-sm !rounded-2xl" value={partialModal.delivery_date} onChange={(e) => setPartialModal(prev => ({ ...prev, delivery_date: e.target.value }))} required />
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setPartialModal({ open: false, purchase: null, quantity: '', delivery_date: getISTDateString() })} className="flex-1 py-2.5 rounded-2xl font-semibold text-sm text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={partialSubmitting} className="flex-1 py-2.5 rounded-2xl font-bold text-sm text-white shadow-lg hover:shadow-xl active:scale-95 transition-all disabled:opacity-50" style={{ background: 'linear-gradient(135deg,#3b82f6,#6366f1)' }}>
                  {partialSubmitting ? 'Processing...' : 'Confirm Delivery'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showNewProductModal && renderPortalModal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(4px)' }}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg flex flex-col animate-scale-in border border-indigo-100/80 overflow-hidden" style={{ maxHeight: '85vh' }}>
            <div className="px-6 py-4 border-b border-indigo-100 flex-shrink-0" style={{ background: 'linear-gradient(135deg,#eff6ff,#eef2ff)' }}>
              <div className="flex items-center gap-3">
                <span className="h-9 w-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow">
                  <Plus className="h-5 w-5 text-white" />
                </span>
                <div>
                  <h3 className="text-base font-bold text-gray-900">Create New Product</h3>
                </div>
                <button onClick={() => setShowNewProductModal(false)} className="ml-auto h-9 w-9 rounded-2xl flex items-center justify-center text-indigo-300 hover:text-indigo-700 hover:bg-white/80 transition-all">
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <form onSubmit={handleCreateProduct} className="overflow-y-auto">
              <div className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-2 rounded-2xl bg-gray-100 p-1">
                  <button
                    type="button"
                    onClick={() => setNewProductForm((current) => ({ ...current, creation_mode: PRODUCT_CREATION_MODE.INVENTORY }))}
                    className={`rounded-2xl px-3 py-2 text-sm font-semibold transition-all ${newProductForm.creation_mode === PRODUCT_CREATION_MODE.INVENTORY ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500'}`}
                  >
                    Add To Inventory
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewProductForm((current) => ({ ...current, creation_mode: PRODUCT_CREATION_MODE.ORDER, quantity_available: '0' }))}
                    className={`rounded-2xl px-3 py-2 text-sm font-semibold transition-all ${newProductForm.creation_mode === PRODUCT_CREATION_MODE.ORDER ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500'}`}
                  >
                    Create Order
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Product ID <span className="text-gray-400">(auto)</span></label>
                    <input type="text" readOnly className="input-field !text-sm !rounded-2xl bg-gray-50 text-gray-500 cursor-not-allowed" placeholder="Select category first..." value={newProductForm.product_id} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Category *</label>
                    <CustomSelect
                      required
                      options={categories.map((category) => ({
                        value: category.name,
                        label: category.name.charAt(0).toUpperCase() + category.name.slice(1)
                      }))}
                      value={newProductForm.category}
                      onChange={(value) => {
                        setNewProductForm((current) => ({ ...current, category: value }));
                        fetchNextProductId(value);
                      }}
                      placeholder="-- Select --"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Product Name *</label>
                    <input type="text" required className="input-field !text-sm !rounded-2xl" placeholder="e.g. Tomato Seeds" value={newProductForm.product_name} onChange={(e) => setNewProductForm((current) => ({ ...current, product_name: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Variety</label>
                    <input type="text" className="input-field !text-sm !rounded-2xl" placeholder="e.g. Hybrid F1" value={newProductForm.variety} onChange={(e) => setNewProductForm((current) => ({ ...current, variety: e.target.value }))} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Unit *</label>
                    <CustomSelect required options={UNIT_OPTIONS} value={newProductForm.unit} onChange={(value) => setNewProductForm((current) => ({ ...current, unit: value }))} placeholder="Select unit" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">
                      {newProductForm.creation_mode === PRODUCT_CREATION_MODE.ORDER ? 'Opening Stock' : 'Quantity To Add'}
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      className={`input-field !text-sm !rounded-2xl ${newProductForm.creation_mode === PRODUCT_CREATION_MODE.ORDER ? 'bg-gray-50 text-gray-500 cursor-not-allowed' : ''}`}
                      value={newProductForm.creation_mode === PRODUCT_CREATION_MODE.ORDER ? '0' : newProductForm.quantity_available}
                      onChange={(e) => setNewProductForm((current) => ({ ...current, quantity_available: e.target.value }))}
                      readOnly={newProductForm.creation_mode === PRODUCT_CREATION_MODE.ORDER}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Purchase Price (₹) *</label>
                    <input type="number" min="0" step="0.01" required className="input-field !text-sm !rounded-2xl" placeholder="Cost per unit" value={newProductForm.purchase_price} onChange={(e) => setNewProductForm((current) => ({ ...current, purchase_price: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Selling Price (₹) *</label>
                    <input type="number" min="0" step="0.01" required className="input-field !text-sm !rounded-2xl" placeholder="Price per unit" value={newProductForm.selling_price} onChange={(e) => setNewProductForm((current) => ({ ...current, selling_price: e.target.value }))} />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Supplier</label>
                  <input
                    type="text"
                    className="input-field !text-sm !rounded-2xl"
                    placeholder={newProductForm.creation_mode === PRODUCT_CREATION_MODE.ORDER ? 'Recommended for order tracking' : 'Optional'}
                    value={newProductForm.supplier}
                    onChange={(e) => setNewProductForm((current) => ({ ...current, supplier: e.target.value }))}
                  />
                </div>

                {newProductForm.creation_mode === PRODUCT_CREATION_MODE.ORDER && (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">Order Quantity *</label>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          className="input-field !text-sm !rounded-2xl"
                          value={newProductForm.order_quantity}
                          onChange={(e) => setNewProductForm((current) => ({ ...current, order_quantity: e.target.value }))}
                          required={newProductForm.creation_mode === PRODUCT_CREATION_MODE.ORDER}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">Order Date *</label>
                        <input
                          type="date"
                          className="input-field !text-sm !rounded-2xl"
                          value={newProductForm.order_date}
                          onChange={(e) => setNewProductForm((current) => ({ ...current, order_date: e.target.value }))}
                          required={newProductForm.creation_mode === PRODUCT_CREATION_MODE.ORDER}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">Advance From Bank (₹)</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className="input-field !text-sm !rounded-2xl"
                          value={newProductForm.advance_amount}
                          onChange={(e) => setNewProductForm((current) => ({ ...current, advance_amount: e.target.value }))}
                          placeholder="0 if no advance"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">Bank Account</label>
                        {bankOptions.length > 0 ? (
                          <CustomSelect
                            options={bankOptions}
                            value={newProductForm.bank_account_id}
                            onChange={(value) => setNewProductForm((current) => ({ ...current, bank_account_id: value }))}
                            placeholder="Select bank"
                          />
                        ) : (
                          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                            Add a bank account in Transactions before recording an advance payment.
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-xs text-indigo-700">
                      This will create the product with zero on-hand stock and immediately create a pending purchase order for it.
                    </div>
                  </>
                )}

                {newProductForm.creation_mode === PRODUCT_CREATION_MODE.INVENTORY && (
                  <div className="rounded-2xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-xs text-indigo-700">
                    This will create the product and add the entered quantity directly into inventory right away.
                  </div>
                )}
              </div>

              <div className="px-6 py-4 border-t border-indigo-100 flex gap-3 flex-shrink-0" style={{ background: 'linear-gradient(90deg,#f8faff,#f5f3ff)' }}>
                <button type="button" onClick={() => setShowNewProductModal(false)} className="flex-1 py-2.5 rounded-2xl font-semibold text-sm text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={newProductSubmitting} className="flex-1 py-2.5 rounded-2xl font-bold text-sm text-white shadow-lg hover:shadow-xl active:scale-95 transition-all disabled:opacity-50" style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>
                  {newProductSubmitting ? 'Creating...' : newProductForm.creation_mode === PRODUCT_CREATION_MODE.ORDER ? 'Create Product & Order' : 'Create Product & Add Stock'}
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
