import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import { Link } from 'react-router-dom';
import SharedModal from './shared/Modal';
import { 
  ShoppingCart, 
  Plus, 
  Search, 
  X, 
  Receipt,
  Package,
  IndianRupee,
  User,
  CreditCard,
  Phone,
  FileText
} from 'lucide-react';

const Sales = () => {
  const { user } = useAuth();
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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Sales Management</h1>
        <p className="mt-1 text-sm text-gray-600">Process sales and generate receipts</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <p className="text-red-700">{error}</p>
        </div>
      )}


      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Product Selection */}
        <div className="lg:col-span-2">
          <div className="card">
            <div className="mb-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search products..."
                  className="input-field pl-10"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-96 overflow-y-auto">
              {filteredProducts.map((product) => (
                <div key={product.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h3 className="font-medium text-gray-900">{product.product_name}</h3>
                      {product.variety && (
                        <p className="text-sm text-gray-500">{product.variety}</p>
                      )}
                      <p className="text-xs text-gray-400 capitalize">{product.category}</p>
                    </div>
                    <span className={`text-sm font-medium ${
                      product.quantity_available <= 10 ? 'text-red-600' : 'text-green-600'
                    }`}>
                      {product.quantity_available} {product.unit}
                    </span>
                  </div>
                  
                  <div className="flex justify-between items-center">
                    <span className="text-lg font-bold text-blue-600">
                      ₹{product.selling_price}/{product.unit}
                    </span>
                    <button
                      onClick={() => addToCart(product)}
                      className="btn-primary text-sm py-1 px-3"
                      disabled={product.quantity_available <= 0}
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Add
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {filteredProducts.length === 0 && (
              <div className="text-center py-8 text-gray-500">
                No products available
              </div>
            )}
          </div>
        </div>

        {/* Cart */}
        <div className="lg:col-span-1">
          <div className="card">
            <h2 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
              <ShoppingCart className="h-5 w-5 mr-2" />
              Cart ({cart.length})
            </h2>

            {cart.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <ShoppingCart className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                <p>Cart is empty</p>
              </div>
            ) : (
              <>
                <div className="space-y-3 max-h-64 overflow-y-auto mb-4">
                  {cart.map((item) => (
                    <div key={item.product_id} className="border border-gray-200 rounded-lg p-3">
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex-1">
                          <h4 className="font-medium text-gray-900 text-sm">{item.product_name}</h4>
                          {item.variety && (
                            <p className="text-xs text-gray-500">{item.variety}</p>
                          )}
                          <p className="text-sm text-blue-600 font-medium">
                            ₹{item.price_per_unit}/{item.unit}
                          </p>
                        </div>
                        <button
                          onClick={() => removeFromCart(item.product_id)}
                          className="text-red-500 hover:text-red-700"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                      
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => updateCartItemQuantity(item.product_id, item.quantity - 1)}
                            className="w-6 h-6 rounded-full bg-gray-200 hover:bg-gray-300 flex items-center justify-center"
                          >
                            -
                          </button>
                          <span className="w-8 text-center text-sm font-medium">{item.quantity}</span>
                          <button
                            onClick={() => updateCartItemQuantity(item.product_id, item.quantity + 1)}
                            className="w-6 h-6 rounded-full bg-gray-200 hover:bg-gray-300 flex items-center justify-center"
                          >
                            +
                          </button>
                        </div>
                        <span className="text-sm font-medium text-gray-900">
                          ₹{(item.quantity * item.price_per_unit).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Customer Info */}
                <div className="space-y-3 mb-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      <User className="h-4 w-4 inline mr-1" />
                      Customer Name
                    </label>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="Enter customer name"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      <Phone className="h-4 w-4 inline mr-1" />
                      Mobile Number
                    </label>
                    <input
                      type="tel"
                      className="input-field"
                      placeholder="Enter mobile number"
                      value={customerMobile}
                      onChange={(e) => setCustomerMobile(e.target.value)}
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Address
                    </label>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="Enter address"
                      value={customerAddress}
                      onChange={(e) => setCustomerAddress(e.target.value)}
                      required
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      <CreditCard className="h-4 w-4 inline mr-1" />
                      Payment Mode
                    </label>
                    <select
                      className="input-field"
                      value={paymentMode}
                      onChange={(e) => setPaymentMode(e.target.value)}
                    >
                      <option value="cash">Cash</option>
                      <option value="card">Card</option>
                      <option value="upi">UPI</option>
                    </select>
                  </div>
                </div>

                {/* Total */}
                <div className="border-t border-gray-200 pt-4">
                  <div className="flex justify-between items-center mb-4">
                    <span className="text-lg font-medium text-gray-900">Total:</span>
                    <span className="text-2xl font-bold text-blue-600">
                      ₹{calculateTotal().toFixed(2)}
                    </span>
                  </div>
                  
                  <button
                    onClick={handleSale}
                    disabled={loading || cart.length === 0}
                    className="w-full btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? 'Processing...' : 'Complete Sale'}
                  </button>
                </div>
              </>
            )}
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
