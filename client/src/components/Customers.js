import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import SharedModal from './shared/Modal';
import { Users, Plus, Search, Phone, Mail, MapPin, IndianRupee, CreditCard, Eye } from 'lucide-react';

const createEmptyCustomerPricingRule = () => ({ product_id: '', price_per_unit: '', start_date: '', end_date: '', notes: '' });

const Customers = () => {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerDetail, setCustomerDetail] = useState(null);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [formData, setFormData] = useState({
    name: '', mobile: '', email: '', address: '', gstin: '', credit_limit: 0
  });
  const [paymentData, setPaymentData] = useState({
    amount: '', payment_mode: 'cash', bank_account_id: '', reference_note: ''
  });
  const [actionModal, setActionModal] = useState({ open: false, title: '', message: '', type: 'success' });
  const [pricingModal, setPricingModal] = useState({
    open: false,
    customer: null,
    rules: [createEmptyCustomerPricingRule()],
    products: [],
    loading: false,
    saving: false
  });

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const [custRes, bankRes] = await Promise.all([
        axios.get('/api/customers', { params: { search: searchTerm || undefined } }),
        axios.get('/api/transactions/bank-accounts')
      ]);
      setCustomers(custRes.data.data || custRes.data || []);
      setBankAccounts(bankRes.data || []);
    } catch (e) {
      setError('Failed to load customers');
    } finally {
      setLoading(false);
    }
  }, [searchTerm]);

  useEffect(() => { fetchCustomers(); }, [fetchCustomers]);

  const handleAdd = async (e) => {
    if (e?.preventDefault) e.preventDefault();
    try {
      await axios.post('/api/customers', formData);
      setShowAddModal(false);
      setFormData({ name: '', mobile: '', email: '', address: '', gstin: '', credit_limit: 0 });
      fetchCustomers();
      setActionModal({ open: true, title: 'Customer Added', message: 'Customer created successfully', type: 'success' });
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to add customer');
    }
  };

  const viewDetail = async (customer) => {
    try {
      const res = await axios.get(`/api/customers/${customer.id}`);
      setCustomerDetail(res.data);
      setSelectedCustomer(customer);
      setShowDetailModal(true);
    } catch (err) {
      setError('Failed to fetch customer details');
    }
  };

  const handlePayment = async (e) => {
    if (e?.preventDefault) e.preventDefault();
    if (!selectedCustomer) return;
    try {
      await axios.post(`/api/customers/${selectedCustomer.id}/payments`, {
        ...paymentData,
        amount: Number(paymentData.amount),
        bank_account_id: paymentData.bank_account_id ? Number(paymentData.bank_account_id) : undefined
      });
      setShowPaymentModal(false);
      setPaymentData({ amount: '', payment_mode: 'cash', bank_account_id: '', reference_note: '' });
      fetchCustomers();
      setActionModal({ open: true, title: 'Payment Recorded', message: 'Payment collected successfully', type: 'success' });
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to record payment');
    }
  };

  const openPricingModal = async (customer) => {
    setPricingModal({
      open: true,
      customer,
      rules: [createEmptyCustomerPricingRule()],
      products: [],
      loading: true,
      saving: false
    });

    try {
      const [pricingResponse, productsResponse] = await Promise.all([
        axios.get(`/api/pricing/customers/${customer.id}`),
        axios.get('/api/inventory')
      ]);
      setPricingModal({
        open: true,
        customer,
        products: productsResponse.data || [],
        rules: pricingResponse.data?.rules?.length
          ? pricingResponse.data.rules.map((rule) => ({
              product_id: String(rule.product_id || ''),
              price_per_unit: String(rule.price_per_unit || ''),
              start_date: rule.start_date || '',
              end_date: rule.end_date || '',
              notes: rule.notes || ''
            }))
          : [createEmptyCustomerPricingRule()],
        loading: false,
        saving: false
      });
    } catch (pricingError) {
      setPricingModal((current) => ({ ...current, loading: false }));
      setError('Failed to load customer pricing rules');
    }
  };

  const updateCustomerPricingRule = (index, field, value) => {
    setPricingModal((current) => ({
      ...current,
      rules: current.rules.map((rule, ruleIndex) => ruleIndex === index ? { ...rule, [field]: value } : rule)
    }));
  };

  const addCustomerPricingRule = () => {
    setPricingModal((current) => ({
      ...current,
      rules: [...current.rules, createEmptyCustomerPricingRule()]
    }));
  };

  const removeCustomerPricingRule = (index) => {
    setPricingModal((current) => {
      const nextRules = current.rules.filter((_, ruleIndex) => ruleIndex !== index);
      return {
        ...current,
        rules: nextRules.length ? nextRules : [createEmptyCustomerPricingRule()]
      };
    });
  };

  const saveCustomerPricingRules = async (e) => {
    if (e?.preventDefault) e.preventDefault();
    if (!pricingModal.customer) return;

    setPricingModal((current) => ({ ...current, saving: true }));
    try {
      await axios.put(`/api/pricing/customers/${pricingModal.customer.id}`, {
        rules: pricingModal.rules
          .filter((rule) => rule.product_id && rule.price_per_unit)
          .map((rule) => ({
            product_id: Number(rule.product_id),
            price_per_unit: Number(rule.price_per_unit),
            start_date: rule.start_date || undefined,
            end_date: rule.end_date || undefined,
            notes: rule.notes.trim() || undefined
          }))
      });
      setPricingModal({
        open: false,
        customer: null,
        rules: [createEmptyCustomerPricingRule()],
        products: [],
        loading: false,
        saving: false
      });
      setActionModal({ open: true, title: 'Pricing Updated', message: 'Customer-specific pricing saved successfully', type: 'success' });
    } catch (pricingError) {
      setPricingModal((current) => ({ ...current, saving: false }));
      setError(pricingError.response?.data?.message || 'Failed to save customer pricing rules');
    }
  };

  const fmt = (v) => Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Users className="h-7 w-7 text-indigo-600" /> Customer Management
          </h1>
          <p className="text-sm text-gray-500 mt-1">{customers.length} customers</p>
        </div>
        <button onClick={() => setShowAddModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 text-white font-medium hover:bg-indigo-700 transition-colors">
          <Plus className="h-4 w-4" /> Add Customer
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 px-4 py-3 text-red-700 text-sm" style={{background:'linear-gradient(90deg,#fff5f5,#fef2f2)'}}>
          ⚠ {error}
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input type="text" placeholder="Search by name, mobile, GSTIN..."
          value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500" />
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600" />
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100">
              <thead className="bg-gray-50/80">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Mobile</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">GSTIN</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Credit Limit</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Outstanding</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {customers.map(c => (
                  <tr key={c.id} className="hover:bg-indigo-50/30 transition-colors">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{c.name}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{c.mobile || '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{c.gstin || '-'}</td>
                    <td className="px-4 py-3 text-sm text-right">₹{fmt(c.credit_limit)}</td>
                    <td className="px-4 py-3 text-sm text-right">
                      <span className={c.outstanding_balance > 0 ? 'text-red-600 font-semibold' : 'text-green-600'}>
                        ₹{fmt(c.outstanding_balance)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button onClick={() => viewDetail(c)} className="text-indigo-600 hover:text-indigo-800">
                          <Eye className="h-4 w-4" />
                        </button>
                        <button onClick={() => openPricingModal(c)} className="text-amber-600 hover:text-amber-800">
                          <IndianRupee className="h-4 w-4" />
                        </button>
                        {c.outstanding_balance > 0 && (
                          <button onClick={() => { setSelectedCustomer(c); setShowPaymentModal(true); }}
                            className="text-green-600 hover:text-green-800">
                            <CreditCard className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {customers.length === 0 && (
                  <tr><td colSpan="6" className="px-4 py-12 text-center text-gray-400">No customers found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add Customer Modal */}
      <SharedModal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title="Add Customer" type="info"
        confirmText="Add Customer" onConfirm={handleAdd}>
        <form onSubmit={handleAdd} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
            <input type="text" required value={formData.name}
              onChange={e => setFormData({...formData, name: e.target.value})}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1"><Phone className="inline h-3 w-3" /> Mobile</label>
              <input type="text" value={formData.mobile}
                onChange={e => setFormData({...formData, mobile: e.target.value})}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1"><Mail className="inline h-3 w-3" /> Email</label>
              <input type="email" value={formData.email}
                onChange={e => setFormData({...formData, email: e.target.value})}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-indigo-500" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1"><MapPin className="inline h-3 w-3" /> Address</label>
            <textarea value={formData.address}
              onChange={e => setFormData({...formData, address: e.target.value})}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-indigo-500" rows={2} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">GSTIN</label>
              <input type="text" value={formData.gstin}
                onChange={e => setFormData({...formData, gstin: e.target.value})}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1"><IndianRupee className="inline h-3 w-3" /> Credit Limit</label>
              <input type="number" min="0" value={formData.credit_limit}
                onChange={e => setFormData({...formData, credit_limit: Number(e.target.value)})}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-indigo-500" />
            </div>
          </div>
        </form>
      </SharedModal>

      {/* Customer Detail Modal */}
      <SharedModal isOpen={showDetailModal} onClose={() => setShowDetailModal(false)}
        title={`Customer: ${selectedCustomer?.name || ''}`} type="info" confirmText="Close">
        {customerDetail && (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div><span className="text-gray-500">Mobile:</span> {customerDetail.mobile || '-'}</div>
              <div><span className="text-gray-500">Email:</span> {customerDetail.email || '-'}</div>
              <div><span className="text-gray-500">GSTIN:</span> {customerDetail.gstin || '-'}</div>
              <div><span className="text-gray-500">Credit Limit:</span> ₹{fmt(customerDetail.credit_limit)}</div>
              <div><span className="text-gray-500">Outstanding:</span> <span className="font-semibold text-red-600">₹{fmt(customerDetail.outstanding_balance)}</span></div>
            </div>
            {customerDetail.address && (
              <div><span className="text-gray-500">Address:</span> {customerDetail.address}</div>
            )}
            {customerDetail.summary && (
              <div className="bg-gray-50 rounded-lg p-3">
                <h4 className="font-medium mb-2">Summary</h4>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div>Total Sales: {customerDetail.summary.total_sales || 0}</div>
                  <div>Total Amount: ₹{fmt(customerDetail.summary.total_amount)}</div>
                  <div>Total Paid: ₹{fmt(customerDetail.summary.total_paid)}</div>
                </div>
              </div>
            )}
            {customerDetail.recent_sales?.length > 0 && (
              <div>
                <h4 className="font-medium mb-2">Recent Sales</h4>
                <div className="space-y-1">
                  {customerDetail.recent_sales.slice(0, 5).map((s, i) => (
                    <div key={i} className="flex justify-between text-xs bg-gray-50 px-3 py-1.5 rounded">
                      <span>{s.sale_id}</span>
                      <span>₹{fmt(s.total_amount)}</span>
                      <span>{s.sale_date?.slice(0, 10)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="pt-2">
              <button
                type="button"
                onClick={() => openPricingModal(selectedCustomer || customerDetail)}
                className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-3 py-2 text-xs font-medium text-white hover:bg-amber-700"
              >
                <IndianRupee className="h-3.5 w-3.5" /> Manage Special Pricing
              </button>
            </div>
          </div>
        )}
      </SharedModal>

      <SharedModal
        isOpen={pricingModal.open}
        onClose={() => setPricingModal({ open: false, customer: null, rules: [createEmptyCustomerPricingRule()], products: [], loading: false, saving: false })}
        title={`Special Pricing - ${pricingModal.customer?.name || ''}`}
        type="info"
        confirmText={pricingModal.saving ? 'Saving...' : 'Save Pricing'}
        onConfirm={!pricingModal.saving ? saveCustomerPricingRules : undefined}
      >
        {pricingModal.loading ? (
          <div className="flex justify-center py-10">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600" />
          </div>
        ) : (
          <form onSubmit={saveCustomerPricingRules} className="space-y-4 max-h-[60vh] overflow-y-auto">
            <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-xs text-amber-800">
              These prices override the standard product price for this customer whenever they are lower than other active rules.
            </div>
            <div className="flex justify-between items-center">
              <h4 className="text-sm font-medium">Customer-Specific Prices</h4>
              <button type="button" onClick={addCustomerPricingRule} className="text-xs font-semibold text-indigo-600 hover:text-indigo-800">+ Add Rule</button>
            </div>
            {pricingModal.rules.map((rule, index) => (
              <div key={index} className="space-y-3 rounded-xl border border-gray-100 bg-gray-50 p-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Product</label>
                    <select value={rule.product_id} onChange={(event) => updateCustomerPricingRule(index, 'product_id', event.target.value)} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm">
                      <option value="">Select product</option>
                      {pricingModal.products.map((product) => (
                        <option key={product.id} value={product.id}>{product.product_name}{product.variety ? ` (${product.variety})` : ''}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Price / Unit</label>
                    <input type="number" min="0" step="0.01" value={rule.price_per_unit} onChange={(event) => updateCustomerPricingRule(index, 'price_per_unit', event.target.value)} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Start Date</label>
                    <input type="date" value={rule.start_date} onChange={(event) => updateCustomerPricingRule(index, 'start_date', event.target.value)} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">End Date</label>
                    <input type="date" value={rule.end_date} onChange={(event) => updateCustomerPricingRule(index, 'end_date', event.target.value)} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
                  </div>
                </div>
                <div className="flex items-end gap-3">
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-gray-500 mb-1">Notes</label>
                    <input type="text" value={rule.notes} onChange={(event) => updateCustomerPricingRule(index, 'notes', event.target.value)} placeholder="Preferred grower rate" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
                  </div>
                  {pricingModal.rules.length > 1 && (
                    <button type="button" onClick={() => removeCustomerPricingRule(index)} className="text-sm font-bold text-red-500 hover:text-red-700">✕</button>
                  )}
                </div>
              </div>
            ))}
          </form>
        )}
      </SharedModal>

      {/* Payment Modal */}
      <SharedModal isOpen={showPaymentModal} onClose={() => setShowPaymentModal(false)}
        title={`Collect Payment - ${selectedCustomer?.name || ''}`} type="info"
        confirmText="Record Payment" onConfirm={handlePayment}>
        <form onSubmit={handlePayment} className="space-y-4">
          <div className="text-sm text-gray-600 mb-2">
            Outstanding: <span className="font-semibold text-red-600">₹{fmt(selectedCustomer?.outstanding_balance)}</span>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Amount *</label>
            <input type="number" min="0.01" step="0.01" required value={paymentData.amount}
              onChange={e => setPaymentData({...paymentData, amount: e.target.value})}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Payment Mode</label>
            <select value={paymentData.payment_mode}
              onChange={e => setPaymentData({...paymentData, payment_mode: e.target.value})}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-indigo-500">
              <option value="cash">Cash</option>
              <option value="bank">Bank Transfer</option>
              <option value="upi">UPI</option>
            </select>
          </div>
          {(paymentData.payment_mode === 'bank' || paymentData.payment_mode === 'upi') && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Bank Account</label>
              <select value={paymentData.bank_account_id}
                onChange={e => setPaymentData({...paymentData, bank_account_id: e.target.value})}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-indigo-500">
                <option value="">Select bank account</option>
                {bankAccounts.map(b => (
                  <option key={b.id} value={b.id}>{b.account_name} - {b.bank_name}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Reference Note</label>
            <input type="text" value={paymentData.reference_note}
              onChange={e => setPaymentData({...paymentData, reference_note: e.target.value})}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-indigo-500" />
          </div>
        </form>
      </SharedModal>

      <SharedModal isOpen={actionModal.open} onClose={() => setActionModal({...actionModal, open: false})}
        title={actionModal.title} type={actionModal.type} confirmText="OK">
        <p>{actionModal.message}</p>
      </SharedModal>
    </div>
  );
};

export default Customers;
