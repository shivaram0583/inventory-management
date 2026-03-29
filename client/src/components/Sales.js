import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import SharedModal from './shared/Modal';
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
  FileText
} from 'lucide-react';

const Sales = () => {
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerMobile, setCustomerMobile] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [paymentMode, setPaymentMode] = useState('cash');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [receiptModal, setReceiptModal] = useState({ open: false, saleId: null, receiptNumber: null });
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const pendingSaleRef = useRef(null);

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      const response = await axios.get('/api/inventory');
      setProducts(response.data.filter(p => p.quantity_available > 0));
    } catch (error) {
      setError('Failed to fetch products');
      console.error('Fetch products error:', error);
    }
  };

  const openReceipt = (saleId) => {
    if (!saleId) return;
    const receiptUrl = `${window.location.origin}/receipt/${saleId}`;
    window.open(receiptUrl, '_blank', 'noopener');
  };

  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);

  const filteredProducts = products.filter(product =>
    product.product_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    product.variety?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    product.product_id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const addToCart = (product) => {
    const existingItem = cart.find(item => item.product_id === product.id);
    
    if (existingItem) {
      if (existingItem.quantity >= product.quantity_available) {
        setError(`Only ${product.quantity_available} ${product.unit} available`);
        setTimeout(() => setError(''), 3000);
        return;
      }
      setCart(cart.map(item =>
        item.product_id === product.id
          ? { ...item, quantity: item.quantity + 1 }
          : item
      ));
    } else {
      setCart([...cart, {
        product_id: product.id,
        product_name: product.product_name,
        variety: product.variety,
        unit: product.unit,
        price_per_unit: product.selling_price,
        quantity: 1,
        max_quantity: product.quantity_available
      }]);
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
      setCart(cart.map(item =>
        item.product_id === productId
          ? { ...item, quantity: newQuantity }
          : item
      ));
    }
  };

  const removeFromCart = (productId) => {
    setCart(cart.filter(item => item.product_id !== productId));
  };

  const calculateTotal = () => {
    return cart.reduce((total, item) => total + (item.quantity * item.price_per_unit), 0);
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

    const saleData = {
      items: cart.map(item => ({
        product_id: item.product_id,
        quantity: item.quantity
      })),
      customer_name: customerName,
      customer_mobile: customerMobile,
      customer_address: customerAddress,
      payment_mode: paymentMode
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
      setPaymentMode('cash');
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
            <div className="mb-4 mt-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input type="text" placeholder="Search products..."
                  className="input-field pl-10" value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)} />
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
                            step="any"
                            value={item.quantity}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value);
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
                    {icon:Phone, label:'Mobile Number', type:'tel', val:customerMobile, set:setCustomerMobile, ph:'Enter mobile number'},
                    {icon:IndianRupee, label:'Address', type:'text', val:customerAddress, set:setCustomerAddress, ph:'Enter address'}]
                    .map(({icon:Icon, label, type, val, set, ph}) => (
                    <div key={label}>
                      <label className="block text-xs font-medium text-gray-500 mb-1 flex items-center gap-1">
                        <Icon className="h-3 w-3" />{label}
                      </label>
                      <input type={type} className="input-field !py-1.5 !text-xs" placeholder={ph}
                        value={val} onChange={(e) => set(e.target.value)} required />
                    </div>
                  ))}
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1 flex items-center gap-1">
                      <CreditCard className="h-3 w-3" />Payment Mode
                    </label>
                    <select className="input-field !py-1.5 !text-xs" value={paymentMode}
                      onChange={(e) => setPaymentMode(e.target.value)}>
                      <option value="cash">Cash</option>
                      <option value="card">Card</option>
                      <option value="upi">UPI</option>
                    </select>
                  </div>
                </div>

                {/* Total + CTA */}
                <div className="rounded-xl px-4 py-3 mb-3" style={{background:'linear-gradient(135deg,#f0fdf4,#ecfdf5)'}}>
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

      <SharedModal
        isOpen={confirmModalOpen}
        onClose={() => setConfirmModalOpen(false)}
        title="Confirm Sale"
        type="warning"
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
                </div>
              </div>
            ))}
          </div>
          <div className="text-sm text-gray-700">
            <p>Customer: <span className="font-medium">{customerName}</span></p>
            <p>Mobile: <span className="font-medium">{customerMobile}</span></p>
            <p>Address: <span className="font-medium">{customerAddress}</span></p>
            <p className="mt-2">Total Items: <span className="font-medium">{totalItems}</span></p>
            <p>Total Amount: <span className="font-semibold text-gray-900">₹{calculateTotal().toFixed(2)}</span></p>
          </div>
        </div>
      </SharedModal>

      <SharedModal
        isOpen={receiptModal.open}
        onClose={() => setReceiptModal({ open: false, saleId: null, receiptNumber: null })}
        title="Receipt Generated"
        type="success"
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
    </div>
  );
};

export default Sales;
