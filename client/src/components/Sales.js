import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { useLocation, useNavigate } from 'react-router-dom';
import SharedModal from './shared/Modal';
import CustomSelect from './shared/CustomSelect';
import SalesRecordsPanel from './SalesRecordsPanel';
import { 
  ShoppingCart, 
  Plus, 
  Search, 
  X, 
  Package,
  IndianRupee,
  User,
  CreditCard,
  Phone,
  FileText,
  History,
  Archive
} from 'lucide-react';

const fmtMoney = (value) => Number(value || 0).toLocaleString('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

const fmtDate = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value).slice(0, 10) : date.toLocaleString('en-IN');
};

const Sales = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [cart, setCart] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [customerName, setCustomerName] = useState('');
  const [customerMobile, setCustomerMobile] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [paymentMode, setPaymentMode] = useState('cash');
  const [discountAmount, setDiscountAmount] = useState('');
  const [customerLookupLoading, setCustomerLookupLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [receiptModal, setReceiptModal] = useState({ open: false, saleId: null, receiptNumber: null });
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('record');
  const [saleDetailModal, setSaleDetailModal] = useState({ open: false, sale: null });
  const [quotationConversion, setQuotationConversion] = useState(null);
  const [quotationNotice, setQuotationNotice] = useState('');
  const pendingSaleRef = useRef(null);
  const cartRef = useRef([]);

  const resolvePricingForCart = useCallback(async (nextCart, customerId) => {
    if (!nextCart.length) {
      setCart(nextCart);
      return;
    }

    const resolvableItems = nextCart.filter((item) => !item.quote_locked_price);
    if (!resolvableItems.length) {
      setCart(nextCart);
      return;
    }

    try {
      const response = await axios.post('/api/pricing/resolve', {
        customer_id: customerId || undefined,
        pricing_date: new Date().toISOString().slice(0, 10),
        items: resolvableItems.map((item) => ({
          product_id: item.product_id,
          quantity: item.quantity
        }))
      });

      const pricingByProductId = new Map((response.data?.items || []).map((item) => [item.product_id, item]));

      setCart(
        nextCart.map((item) => {
          if (item.quote_locked_price) {
            return item;
          }

          const resolvedPricing = pricingByProductId.get(item.product_id);
          if (!resolvedPricing) {
            return item;
          }

          return {
            ...item,
            price_per_unit: Number(resolvedPricing.effective_price || item.price_per_unit),
            base_price: Number(resolvedPricing.base_price || item.base_price || item.price_per_unit),
            pricing_rule: resolvedPricing.applied_rule || null
          };
        })
      );
    } catch {
      setCart(nextCart);
    }
  }, []);

  useEffect(() => {
    fetchProducts();
    fetchCategories();
  }, []);

  useEffect(() => {
    const quotationConversion = location.state?.quotationConversion;
    if (!quotationConversion) {
      return;
    }

    setQuotationConversion(quotationConversion);
    setCart(
      (quotationConversion.items || []).map((item) => ({
        product_id: item.product_id,
        product_name: item.product_name,
        variety: item.variety,
        unit: item.unit,
        price_per_unit: Number(item.price_per_unit || 0),
        base_price: Number(item.price_per_unit || 0),
        quantity: Number(item.quantity || 0),
        max_quantity: Number(item.quantity_available || item.quantity || 0),
        quote_locked_price: true,
        pricing_rule: {
          type: item.pricing_rule_type || 'quotation',
          label: item.pricing_rule_label || 'Quoted rate'
        }
      }))
    );
    setCustomerName(quotationConversion.customer_name || '');
    setCustomerMobile(quotationConversion.customer_mobile || '');
    setCustomerAddress(quotationConversion.customer_address || '');
    setSelectedCustomer(
      quotationConversion.customer_id
        ? {
            id: quotationConversion.customer_id,
            name: quotationConversion.customer_name,
            mobile: quotationConversion.customer_mobile
          }
        : null
    );
    setDiscountAmount(String(quotationConversion.discount_amount || 0));
    setQuotationNotice(`Quotation ${quotationConversion.quotation_number || ''} loaded. Review the cart and complete the sale.`.trim());
    pendingSaleRef.current = null;
    navigate(location.pathname, { replace: true, state: null });
  }, [location.pathname, location.state, navigate]);

  useEffect(() => {
    cartRef.current = cart;
  }, [cart]);

  useEffect(() => {
    if (cartRef.current.length > 0) {
      resolvePricingForCart(cartRef.current, selectedCustomer?.id);
    }
  }, [selectedCustomer?.id, resolvePricingForCart]);

  const fetchProducts = async () => {
    try {
      const response = await axios.get('/api/inventory');
      setProducts(response.data.filter(p => p.quantity_available > 0));
    } catch (error) {
      setError('Failed to fetch products');
      console.error('Fetch products error:', error);
    }
  };

  const fetchCategories = async () => {
    try {
      const response = await axios.get('/api/purchases/categories');
      setCategories(response.data);
    } catch (error) {
      console.error('Fetch categories error:', error);
    }
  };

  const lookupCustomerByMobile = async (mobile) => {
    const trimmedMobile = String(mobile || '').trim();
    if (!trimmedMobile) {
      setSelectedCustomer(null);
      return;
    }

    setCustomerLookupLoading(true);
    try {
      const response = await axios.get('/api/customers/lookup/by-mobile', {
        params: { mobile: trimmedMobile }
      });
      const customer = response.data;
      setSelectedCustomer(customer || null);

      if (customer) {
        setCustomerName(customer.name || '');
        setCustomerAddress(customer.address || '');
      }
    } catch (lookupError) {
      setSelectedCustomer(null);
    } finally {
      setCustomerLookupLoading(false);
    }
  };

  const openReceipt = (saleId) => {
    if (!saleId) return;
    window.location.href = `/receipt/${saleId}`;
  };

  const openSaleDetail = async (saleId) => {
    try {
      const response = await axios.get(`/api/sales/${saleId}`);
      setSaleDetailModal({ open: true, sale: response.data });
    } catch (detailError) {
      setError(detailError.response?.data?.message || 'Failed to load sale details');
    }
  };

  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);

  const filteredProducts = products.filter(product => {
    const matchesSearch = product.product_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.variety?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.product_id.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = categoryFilter === 'all' || product.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const addToCart = (product) => {
    const existingItem = cart.find(item => item.product_id === product.id);
    
    if (existingItem) {
      if (existingItem.quantity >= product.quantity_available) {
        setError(`Only ${product.quantity_available} ${product.unit} available`);
        setTimeout(() => setError(''), 3000);
        return;
      }
      const nextCart = cart.map(item =>
        item.product_id === product.id
          ? { ...item, quantity: item.quantity + 1 }
          : item
      );
      resolvePricingForCart(nextCart, selectedCustomer?.id);
    } else {
      const nextCart = [...cart, {
        product_id: product.id,
        product_name: product.product_name,
        variety: product.variety,
        unit: product.unit,
        price_per_unit: product.selling_price,
        base_price: product.selling_price,
        quantity: 1,
        max_quantity: product.quantity_available,
        pricing_rule: null,
        quote_locked_price: false
      }];
      resolvePricingForCart(nextCart, selectedCustomer?.id);
    }
  };

  const updateCartItemQuantity = (productId, newQuantity) => {
    const item = cart.find(item => item.product_id === productId);
    if (newQuantity > item.max_quantity) {
      setError(`Only ${item.max_quantity} ${item.unit} available`);
      setTimeout(() => setError(''), 3000);
      return;
    }
    
    if (newQuantity <= 0) {
      removeFromCart(productId);
    } else {
      const nextCart = cart.map(item =>
        item.product_id === productId
          ? { ...item, quantity: newQuantity }
          : item
      );
      resolvePricingForCart(nextCart, selectedCustomer?.id);
    }
  };

  const removeFromCart = (productId) => {
    setCart(cart.filter(item => item.product_id !== productId));
  };

  const calculateSubtotal = () => {
    return cart.reduce((total, item) => total + (item.quantity * item.price_per_unit), 0);
  };

  const calculateTotal = () => {
    const subtotal = calculateSubtotal();
    const discount = Number(discountAmount) || 0;
    return Math.max(0, subtotal - discount);
  };

  const handleSale = () => {
    if (cart.length === 0) {
      setError('Cart is empty');
      return;
    }

    if (!customerName.trim() || !customerMobile.trim() || !customerAddress.trim()) {
      setError('Customer name, mobile number, and address are required.');
      return;
    }

    if (paymentMode === 'credit' && !selectedCustomer?.id) {
      setError('Credit sales require an existing customer. Enter a registered mobile number to auto-fill the customer record.');
      return;
    }

    const saleData = {
      items: cart.map(item => ({
        product_id: item.product_id,
        quantity: item.quantity,
        ...(item.quote_locked_price ? {
          price_per_unit: item.price_per_unit,
          manual_price_override: true
        } : {})
      })),
      customer_name: customerName,
      customer_mobile: customerMobile,
      customer_address: customerAddress,
      customer_id: selectedCustomer?.id,
      payment_mode: paymentMode,
      discount_amount: Number(discountAmount) || 0,
      quotation_id: quotationConversion?.quotation_id || undefined
    };

    pendingSaleRef.current = saleData;
    setError('');
    setConfirmModalOpen(true);
  };

  const confirmSale = async () => {
    if (!pendingSaleRef.current) {
      setConfirmModalOpen(false);
      return;
    }

    setLoading(true);
    setError('');
    setConfirmModalOpen(false);

    try {
      const response = await axios.post('/api/sales', pendingSaleRef.current);

      setReceiptModal({
        open: true,
        saleId: response.data.saleId,
        receiptNumber: response.data.receiptNumber
      });
      setCart([]);
      setCustomerName('');
      setCustomerMobile('');
      setCustomerAddress('');
      setSelectedCustomer(null);
      setPaymentMode('cash');
      setDiscountAmount('');
      setQuotationConversion(null);
      setQuotationNotice('');
      pendingSaleRef.current = null;

      // Refresh products to update stock
      fetchProducts();
    } catch (error) {
      setError(error.response?.data?.message || 'Failed to complete sale');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* Header banner */}
      <div className="rounded-2xl px-7 py-5 flex items-center justify-between shadow-lg overflow-hidden relative"
           style={{background:'linear-gradient(135deg,#064e3b 0%,#065f46 40%,#047857 100%)'}}>
        <div className="absolute inset-0 opacity-10 pointer-events-none"
             style={{backgroundImage:'radial-gradient(circle at 80% 50%,#6ee7b7,transparent 60%)'}} />
        <div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight">✦ Sales Management</h1>
          <p className="mt-0.5 text-sm text-emerald-200">Process sales and generate receipts</p>
        </div>
        <div className="h-12 w-12 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center">
          <ShoppingCart className="h-6 w-6 text-white" />
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 px-4 py-3 text-red-700 text-sm animate-fade-in"
             style={{background:'linear-gradient(90deg,#fff5f5,#fef2f2)'}}>⚠ {error}</div>
      )}

      {quotationNotice && (
        <div className="rounded-xl border border-emerald-200 px-4 py-3 text-emerald-800 text-sm"
             style={{background:'linear-gradient(90deg,#ecfdf5,#f0fdf4)'}}>
          {quotationNotice}
        </div>
      )}

      <div className="card !p-2">
        <nav className="flex gap-1">
          {[
            { id: 'record', label: 'Record Sale', icon: ShoppingCart },
            { id: 'history', label: 'Sales Done', icon: History },
            { id: 'archive', label: 'Sales Archive', icon: Archive }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                activeTab === tab.id ? 'text-white shadow-md' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
              }`}
              style={activeTab === tab.id
                ? { background: 'linear-gradient(135deg,#059669,#10b981)', boxShadow: '0 2px 8px rgba(16,185,129,0.35)' }
                : {}}
            >
              <tab.icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {activeTab === 'record' && (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Product Selection */}
        <div className="lg:col-span-2">
          <div className="card">
            <div className="flex items-center gap-2 mb-1">
              <span className="h-6 w-6 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
                <Package className="h-3.5 w-3.5 text-white" />
              </span>
              <h2 className="text-base font-bold text-gray-800">Products</h2>
            </div>
            <div className="flex gap-3 mb-4 mt-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input type="text" placeholder="Search products..."
                  className="input-field pl-10" value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)} />
              </div>
              <div style={{minWidth:'160px'}}>
                <CustomSelect
                  options={[{ value: 'all', label: 'All Categories' }, ...categories.map(c => ({ value: c.name, label: c.name.charAt(0).toUpperCase() + c.name.slice(1) }))]}
                  value={categoryFilter}
                  onChange={(val) => setCategoryFilter(val)}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[420px] overflow-y-auto pr-1">
              {filteredProducts.map((product) => (
                <div key={product.id}
                     className="rounded-xl p-4 border border-gray-100 hover:border-indigo-200 hover:shadow-md transition-all duration-200 cursor-pointer group"
                     style={{background:'linear-gradient(135deg,#f8faff,#f3f0ff)'}}>
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h3 className="font-semibold text-gray-900 text-sm group-hover:text-indigo-700 transition-colors">{product.product_name}</h3>
                      {product.variety && <p className="text-xs text-gray-500">{product.variety}</p>}
                      <span className="inline-block mt-0.5 text-xs px-2 py-0.5 rounded-full font-medium capitalize"
                            style={{background:'linear-gradient(90deg,#ede9fe,#e0e7ff)',color:'#6d28d9'}}>
                        {product.category}
                      </span>
                    </div>
                    <span className={`text-xs font-bold px-2 py-1 rounded-lg ${
                      product.quantity_available <= 10
                        ? 'bg-red-100 text-red-600'
                        : 'bg-emerald-100 text-emerald-700'
                    }`}>
                      {product.quantity_available} {product.unit}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-base font-extrabold text-indigo-600">₹{product.selling_price}<span className="text-xs font-normal text-gray-400">/{product.unit}</span></span>
                    <button onClick={() => addToCart(product)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-white shadow-sm hover:shadow-md active:scale-95 transition-all duration-150"
                      style={{background:'linear-gradient(135deg,#10b981,#059669)'}}
                      disabled={product.quantity_available <= 0}>
                      <Plus className="h-3 w-3" /> Add
                    </button>
                  </div>
                </div>
              ))}
            </div>
            {filteredProducts.length === 0 && (
              <div className="text-center py-10 text-gray-400">
                <Package className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No products available</p>
              </div>
            )}
          </div>
        </div>

        {/* Cart */}
        <div className="lg:col-span-1">
          <div className="card !p-0 overflow-hidden">
            {/* Cart header */}
            <div className="px-5 py-4 flex items-center gap-2 border-b border-gray-100"
                 style={{background:'linear-gradient(90deg,#f8faff,#f3f0ff)'}}>
              <span className="h-7 w-7 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-sm">
                <ShoppingCart className="h-4 w-4 text-white" />
              </span>
              <h2 className="text-base font-bold text-gray-800">Cart</h2>
              {cart.length > 0 && (
                <span className="ml-auto text-xs font-bold px-2 py-0.5 rounded-full text-white"
                      style={{background:'linear-gradient(135deg,#6366f1,#8b5cf6)'}}>{cart.length}</span>
              )}
            </div>

            <div className="p-5">
            {cart.length === 0 ? (
              <div className="text-center py-10 text-gray-400">
                <ShoppingCart className="h-10 w-10 mx-auto mb-2 opacity-20" />
                <p className="text-sm">Cart is empty</p>
                <p className="text-xs mt-1">Add products to get started</p>
              </div>
            ) : (
              <>
                <div className="space-y-2.5 max-h-56 overflow-y-auto mb-4 pr-0.5">
                  {cart.map((item) => (
                    <div key={item.product_id} className="rounded-xl p-3 border border-indigo-100/60"
                         style={{background:'linear-gradient(135deg,#fafbff,#f5f3ff)'}}>
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex-1 min-w-0">
                          <h4 className="font-semibold text-gray-900 text-xs truncate">{item.product_name}</h4>
                          {item.variety && <p className="text-xs text-gray-400">{item.variety}</p>}
                          <p className="text-xs font-bold text-indigo-600 mt-0.5">₹{item.price_per_unit}/{item.unit}</p>
                          {item.base_price > item.price_per_unit && (
                            <p className="text-[11px] text-gray-400 line-through">₹{item.base_price}/{item.unit}</p>
                          )}
                          {item.pricing_rule?.label && (
                            <p className="text-[11px] font-semibold text-emerald-600 mt-1">{item.pricing_rule.label}</p>
                          )}
                        </div>
                        <button onClick={() => removeFromCart(item.product_id)}
                          className="text-gray-300 hover:text-red-500 transition-colors ml-2">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1">
                          <button onClick={() => updateCartItemQuantity(item.product_id, item.quantity - 1)}
                            className="w-7 h-7 rounded-lg text-sm font-bold text-indigo-600 hover:text-white hover:bg-indigo-500 transition-all duration-150 flex items-center justify-center"
                            style={{background:'linear-gradient(135deg,#ede9fe,#e0e7ff)'}}>
                            −
                          </button>
                          <input
                            type="number"
                            min="1"
                            max={item.max_quantity}
                            step="1"
                            value={item.quantity}
                            onChange={(e) => {
                              const val = parseInt(e.target.value);
                              if (!isNaN(val) && val > 0) updateCartItemQuantity(item.product_id, val);
                            }}
                            className="w-16 text-center text-xs font-bold text-gray-800 border border-indigo-200 rounded-lg py-1 focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white"
                          />
                          <button onClick={() => updateCartItemQuantity(item.product_id, item.quantity + 1)}
                            className="w-7 h-7 rounded-lg text-sm font-bold text-white transition-all duration-150 flex items-center justify-center"
                            style={{background:'linear-gradient(135deg,#6366f1,#8b5cf6)'}}>
                            +
                          </button>
                        </div>
                        <span className="text-xs font-bold text-gray-700">₹{(item.quantity * item.price_per_unit).toFixed(2)}</span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Customer Info */}
                <div className="space-y-2.5 mb-4">
                  <p className="text-xs font-semibold text-indigo-500 uppercase tracking-wider">Customer Details</p>
                  {[{icon:User, label:'Customer Name', type:'text', val:customerName, set:setCustomerName, ph:'Enter customer name'},
                    {icon:Phone, label:'Mobile Number', type:'tel', val:customerMobile, set:(value) => {
                      setCustomerMobile(value);
                      if (selectedCustomer && value !== selectedCustomer.mobile) {
                        setSelectedCustomer(null);
                      }
                    }, ph:'Enter mobile number'},
                    {icon:IndianRupee, label:'Address', type:'text', val:customerAddress, set:setCustomerAddress, ph:'Enter address'}]
                    .map(({icon:Icon, label, type, val, set, ph}) => (
                    <div key={label}>
                      <label className="block text-xs font-medium text-gray-500 mb-1 flex items-center gap-1">
                        <Icon className="h-3 w-3" />{label}
                      </label>
                      <input type={type} className="input-field !py-1.5 !text-xs" placeholder={ph}
                        value={val}
                        onChange={(e) => set(e.target.value)}
                        onBlur={label === 'Mobile Number' ? () => lookupCustomerByMobile(customerMobile) : undefined}
                        required />
                    </div>
                  ))}
                  <div className="rounded-xl border border-indigo-100 bg-indigo-50 px-3 py-2 text-xs text-indigo-700">
                    {customerLookupLoading
                      ? 'Looking up customer record...'
                      : selectedCustomer
                        ? `Matched customer: ${selectedCustomer.name}${selectedCustomer.outstanding_balance > 0 ? ` | Outstanding: ₹${Number(selectedCustomer.outstanding_balance).toFixed(2)}` : ''}`
                        : 'Enter a registered mobile number to auto-fill repeat customer details.'}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1 flex items-center gap-1">
                      <CreditCard className="h-3 w-3" />Payment Mode
                    </label>
                    <CustomSelect
                      options={[
                        { value: 'cash', label: 'Cash' },
                        { value: 'card', label: 'Card' },
                        { value: 'upi', label: 'UPI' },
                        { value: 'credit', label: 'Credit' }
                      ]}
                      value={paymentMode}
                      onChange={(val) => setPaymentMode(val)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1 flex items-center gap-1">
                      <IndianRupee className="h-3 w-3" />Discount (₹)
                    </label>
                    <input type="number" min="0" step="0.01" className="input-field !py-1.5 !text-xs" placeholder="Enter discount amount"
                      value={discountAmount} onChange={(e) => setDiscountAmount(e.target.value)} />
                  </div>
                </div>

                {/* Total + CTA */}
                <div className="rounded-xl px-4 py-3 mb-3" style={{background:'linear-gradient(135deg,#f0fdf4,#ecfdf5)'}}>
                  {Number(discountAmount) > 0 && (
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-xs text-gray-500">Subtotal</span>
                      <span className="text-sm text-gray-500">₹{calculateSubtotal().toFixed(2)}</span>
                    </div>
                  )}
                  {Number(discountAmount) > 0 && (
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-xs text-red-500">Discount</span>
                      <span className="text-sm text-red-500">-₹{(Number(discountAmount) || 0).toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Total Amount</span>
                    <span className="text-xl font-extrabold text-emerald-700">₹{calculateTotal().toFixed(2)}</span>
                  </div>
                </div>
                <button onClick={handleSale} disabled={loading || cart.length === 0}
                  className="w-full py-2.5 rounded-xl font-bold text-sm text-white shadow-lg hover:shadow-xl active:scale-95 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{background:'linear-gradient(135deg,#10b981,#059669)'}}>
                  {loading ? 'Processing...' : '✓ Complete Sale'}
                </button>
              </>
            )}
            </div>
          </div>
        </div>
      </div>
      )}

      {activeTab === 'history' && (
        <SalesRecordsPanel mode="history" onOpenSaleDetail={openSaleDetail} onOpenReceipt={openReceipt} />
      )}

      {activeTab === 'archive' && (
        <SalesRecordsPanel mode="archive" onOpenSaleDetail={openSaleDetail} onOpenReceipt={openReceipt} />
      )}

      <SharedModal
        isOpen={confirmModalOpen}
        onClose={() => setConfirmModalOpen(false)}
        title="Confirm Sale"
        type="warning"
        theme="sales"
        confirmText={loading ? 'Processing...' : 'Confirm Sale'}
        onConfirm={!loading ? confirmSale : undefined}
      >
        <div className="space-y-3">
          <p className="text-sm text-gray-700">
            Please review the order before completing the sale.
          </p>
          <div className="bg-gray-50 rounded border max-h-48 overflow-y-auto">
            {cart.map((item) => (
              <div key={item.product_id} className="flex justify-between items-start px-3 py-2 border-b last:border-b-0 text-sm">
                <div>
                  <p className="font-medium text-gray-900">{item.product_name}</p>
                  {item.variety && <p className="text-xs text-gray-500">{item.variety}</p>}
                </div>
                <div className="text-right text-gray-700">
                  <p>{item.quantity} {item.unit}</p>
                  <p className="text-xs text-gray-500">₹{(item.quantity * item.price_per_unit).toFixed(2)}</p>
                  {item.pricing_rule?.label && <p className="text-[11px] text-emerald-600">{item.pricing_rule.label}</p>}
                </div>
              </div>
            ))}
          </div>
          <div className="text-sm text-gray-700">
            <p>Customer: <span className="font-medium">{customerName}</span></p>
            <p>Mobile: <span className="font-medium">{customerMobile}</span></p>
            <p>Address: <span className="font-medium">{customerAddress}</span></p>
            <p className="mt-2">Total Items: <span className="font-medium">{totalItems}</span></p>
            {Number(discountAmount) > 0 && <p>Discount: <span className="font-medium text-red-600">-₹{(Number(discountAmount) || 0).toFixed(2)}</span></p>}
            <p>Total Amount: <span className="font-semibold text-gray-900">₹{calculateTotal().toFixed(2)}</span></p>
          </div>
        </div>
      </SharedModal>

      <SharedModal
        isOpen={receiptModal.open}
        onClose={() => setReceiptModal({ open: false, saleId: null, receiptNumber: null })}
        title="Receipt Generated"
        type="success"
        theme="sales"
        confirmText="Close"
      >
        <div className="space-y-3">
          <p className="text-sm text-gray-700">
            Sale completed successfully.
          </p>
          {receiptModal.receiptNumber && (
            <p className="text-sm text-gray-900">
              Receipt <span className="font-semibold">#{receiptModal.receiptNumber}</span> is ready.
            </p>
          )}
          <button
            type="button"
            onClick={() => openReceipt(receiptModal.saleId)}
            className="w-full inline-flex items-center justify-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700"
          >
            <FileText className="h-4 w-4 mr-2" />
            Open Receipt PDF
          </button>
        </div>
      </SharedModal>

      <SharedModal
        isOpen={saleDetailModal.open}
        onClose={() => setSaleDetailModal({ open: false, sale: null })}
        title={`Sale ${saleDetailModal.sale?.saleId || ''}`}
        type="info"
        theme="sales"
        confirmText="Close"
      >
        {saleDetailModal.sale && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 text-sm">
              <div><span className="text-gray-500">Receipt:</span> <span className="font-medium">{saleDetailModal.sale.receipt?.receipt_number || '-'}</span></div>
              <div><span className="text-gray-500">Payment:</span> <span className="font-medium capitalize">{saleDetailModal.sale.receipt?.payment_mode || '-'}</span></div>
              <div><span className="text-gray-500">Payment Status:</span> <span className="font-medium uppercase">{saleDetailModal.sale.receipt?.payment_status || '-'}</span></div>
              <div><span className="text-gray-500">Receipt Date:</span> <span className="font-medium">{fmtDate(saleDetailModal.sale.receipt?.receipt_date)}</span></div>
              <div><span className="text-gray-500">Customer:</span> <span className="font-medium">{saleDetailModal.sale.receipt?.customer_name || 'Walk-in Customer'}</span></div>
              <div><span className="text-gray-500">Mobile:</span> <span className="font-medium">{saleDetailModal.sale.receipt?.customer_mobile || '-'}</span></div>
              <div className="sm:col-span-2"><span className="text-gray-500">Address:</span> <span className="font-medium">{saleDetailModal.sale.receipt?.customer_address || '-'}</span></div>
            </div>
            <div className="rounded-xl border border-gray-100 overflow-hidden">
              <table className="min-w-full divide-y divide-gray-100">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-600">Product</th>
                    <th className="px-3 py-2 text-center text-xs font-semibold uppercase text-gray-600">Qty</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-gray-600">Rate</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-gray-600">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 text-sm">
                  {saleDetailModal.sale.items.map((item) => (
                    <tr key={`${item.sale_id}-${item.product_id}`}>
                      <td className="px-3 py-2">
                        <p className="font-medium text-gray-900">{item.product_name}</p>
                        {item.pricing_rule_label && <p className="text-[11px] text-emerald-600">{item.pricing_rule_label}</p>}
                      </td>
                      <td className="px-3 py-2 text-center">{item.quantity_sold} {item.unit}</td>
                      <td className="px-3 py-2 text-right">₹{fmtMoney(item.price_per_unit)}</td>
                      <td className="px-3 py-2 text-right font-semibold">₹{fmtMoney(item.total_amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-between text-sm font-semibold text-gray-900">
              <span>Total</span>
              <span>₹{fmtMoney(saleDetailModal.sale.totalAmount)}</span>
            </div>
            <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm">
              <div className="flex items-center justify-between text-gray-800">
                <span className="font-semibold">Returns Summary</span>
                <span className="text-xs uppercase tracking-wide text-amber-700">{saleDetailModal.sale.returns_summary?.return_entries || 0} entries</span>
              </div>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3 text-xs text-gray-700">
                <div>Returned Qty: <span className="font-semibold">{saleDetailModal.sale.returns_summary?.returned_quantity || 0}</span></div>
                <div>Refunded: <span className="font-semibold">₹{fmtMoney(saleDetailModal.sale.returns_summary?.refunded_amount || 0)}</span></div>
                <div>Net Sale: <span className="font-semibold">₹{fmtMoney(Number(saleDetailModal.sale.totalAmount || 0) - Number(saleDetailModal.sale.returns_summary?.refunded_amount || 0))}</span></div>
              </div>
            </div>
            {saleDetailModal.sale.returns?.length > 0 && (
              <div className="rounded-xl border border-gray-100 overflow-hidden">
                <table className="min-w-full divide-y divide-gray-100">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-600">Return</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-600">Product</th>
                      <th className="px-3 py-2 text-center text-xs font-semibold uppercase text-gray-600">Qty</th>
                      <th className="px-3 py-2 text-center text-xs font-semibold uppercase text-gray-600">Mode</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-gray-600">Refund</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 text-sm">
                    {saleDetailModal.sale.returns.map((item, index) => (
                      <tr key={`${item.return_id}-${item.product_id}-${index}`}>
                        <td className="px-3 py-2">
                          <p className="font-medium text-gray-900">{item.return_id}</p>
                          <p className="text-[11px] text-gray-500">{fmtDate(item.return_date)}</p>
                        </td>
                        <td className="px-3 py-2">
                          <p className="font-medium text-gray-900">{item.product_name}</p>
                          {item.reason && <p className="text-[11px] text-gray-500">{item.reason}</p>}
                        </td>
                        <td className="px-3 py-2 text-center">{item.quantity_returned} {item.unit}</td>
                        <td className="px-3 py-2 text-center capitalize">{item.refund_mode}</td>
                        <td className="px-3 py-2 text-right font-semibold text-amber-700">₹{fmtMoney(item.refund_amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </SharedModal>
    </div>
  );
};

export default Sales;
