import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import SharedModal from './shared/Modal';
import { downloadPDF } from '../utils/pdfExport';
import { FileText, Plus, Eye, Send, CheckCircle, XCircle, Download, ShoppingCart } from 'lucide-react';

const Quotations = () => {
  const navigate = useNavigate();
  const [quotations, setQuotations] = useState([]);
  const [products, setProducts] = useState([]);
  // eslint-disable-next-line no-unused-vars
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedQuotation, setSelectedQuotation] = useState(null);
  const [actionModal, setActionModal] = useState({ open: false, title: '', message: '', type: 'success' });
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0, limit: 10 });
  const [exportingId, setExportingId] = useState(null);
  const [convertingId, setConvertingId] = useState(null);
  const [deliveryCapabilities, setDeliveryCapabilities] = useState({ emailEnabled: false, smsEnabled: false });
  const [deliveryModal, setDeliveryModal] = useState({
    open: false,
    quotation: null,
    email: '',
    mobile: '',
    sendEmail: true,
    sendSms: false,
    submitting: false
  });

  const [formData, setFormData] = useState({
    customer_name: '', customer_mobile: '', customer_address: '',
    customer_id: '', notes: '', valid_days: 15, items: [{ product_id: '', quantity: 1, price_per_unit: '', discount_percent: 0, manual_price_override: false, pricing_rule: null }]
  });

  const pageSize = 10;

  const fetchDeliveryCapabilities = async () => {
    try {
      const response = await axios.get('/api/delivery/capabilities');
      setDeliveryCapabilities(response.data || { emailEnabled: false, smsEnabled: false });
    } catch {
      setDeliveryCapabilities({ emailEnabled: false, smsEnabled: false });
    }
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [qRes, pRes] = await Promise.all([
        axios.get('/api/quotations', { params: { ...(statusFilter ? { status: statusFilter } : {}), page, limit: pageSize } }),
        axios.get('/api/inventory')
      ]);
      setQuotations(qRes.data?.data || []);
      setPagination(qRes.data?.pagination || { page: 1, totalPages: 1, total: 0, limit: pageSize });
      setProducts(pRes.data || []);
      try {
        const cRes = await axios.get('/api/customers');
        setCustomers(cRes.data.data || cRes.data || []);
      } catch { setCustomers([]); }
    } catch {
      setError('Failed to load quotations');
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { setPage(1); }, [statusFilter]);
  useEffect(() => {
    fetchDeliveryCapabilities();
  }, []);

  const resolveQuotationPricing = useCallback(async (items, customerId) => {
    const resolvableItems = items.filter((item) => item.product_id && !item.manual_price_override);
    if (!resolvableItems.length) {
      setFormData((current) => ({ ...current, items }));
      return;
    }

    try {
      const response = await axios.post('/api/pricing/resolve', {
        customer_id: customerId ? Number(customerId) : undefined,
        pricing_date: new Date().toISOString().slice(0, 10),
        items: resolvableItems.map((item) => ({
          product_id: Number(item.product_id),
          quantity: Number(item.quantity || 1)
        }))
      });

      const pricingByProductId = new Map((response.data?.items || []).map((item) => [item.product_id, item]));
      setFormData((current) => ({
        ...current,
        items: items.map((item) => {
          if (!item.product_id || item.manual_price_override) {
            return item;
          }

          const resolvedPricing = pricingByProductId.get(Number(item.product_id));
          if (!resolvedPricing) {
            return item;
          }

          return {
            ...item,
            price_per_unit: String(resolvedPricing.effective_price),
            pricing_rule: resolvedPricing.applied_rule || null
          };
        })
      }));
    } catch {
      setFormData((current) => ({ ...current, items }));
    }
  }, []);

  const addItem = () => {
    setFormData({...formData, items: [...formData.items, { product_id: '', quantity: 1, price_per_unit: '', discount_percent: 0, manual_price_override: false, pricing_rule: null }]});
  };

  const removeItem = (idx) => {
    if (formData.items.length <= 1) return;
    setFormData({...formData, items: formData.items.filter((_, i) => i !== idx)});
  };

  const updateItem = (idx, field, val) => {
    const items = [...formData.items];
    items[idx] = {
      ...items[idx],
      [field]: val,
      ...(field === 'price_per_unit' ? { manual_price_override: true, pricing_rule: { type: 'manual', label: 'Manual price override' } } : {}),
      ...(field === 'product_id' ? { manual_price_override: false, pricing_rule: null, price_per_unit: '' } : {})
    };
    if (field === 'product_id' && val) {
      resolveQuotationPricing(items, formData.customer_id);
    } else if (field === 'quantity') {
      resolveQuotationPricing(items, formData.customer_id);
    }
    setFormData({...formData, items});
  };

  const handleCreate = async (e) => {
    if (e?.preventDefault) e.preventDefault();
    try {
      const payload = {
        ...formData,
        customer_id: formData.customer_id ? Number(formData.customer_id) : undefined,
        items: formData.items.map(i => ({
          product_id: Number(i.product_id),
          quantity: Number(i.quantity),
          price_per_unit: Number(i.price_per_unit),
          discount_percent: Number(i.discount_percent) || 0,
          manual_price_override: Boolean(i.manual_price_override)
        }))
      };
      await axios.post('/api/quotations', payload);
      setShowCreateModal(false);
      setFormData({ customer_name: '', customer_mobile: '', customer_address: '', customer_id: '', notes: '', valid_days: 15,
        items: [{ product_id: '', quantity: 1, price_per_unit: '', discount_percent: 0, manual_price_override: false, pricing_rule: null }]
      });
      setPage(1);
      fetchData();
      setActionModal({ open: true, title: 'Quotation Created', message: 'Quotation has been created successfully', type: 'success' });
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create quotation');
    }
  };

  const viewDetail = async (q) => {
    try {
      const res = await axios.get(`/api/quotations/${q.id}`);
      setSelectedQuotation(res.data);
      setShowDetailModal(true);
    } catch {
      setError('Failed to load quotation details');
    }
  };

  const updateStatus = async (id, status) => {
    try {
      await axios.put(`/api/quotations/${id}/status`, { status });
      fetchData();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update status');
    }
  };

  const openDeliveryModal = (quotation) => {
    setDeliveryModal({
      open: true,
      quotation,
      email: '',
      mobile: quotation.customer_mobile || '',
      sendEmail: deliveryCapabilities.emailEnabled,
      sendSms: deliveryCapabilities.smsEnabled && Boolean(quotation.customer_mobile),
      submitting: false
    });
  };

  const sendQuotation = async () => {
    const channels = [];
    if (deliveryModal.sendEmail) channels.push('email');
    if (deliveryModal.sendSms) channels.push('sms');

    if (channels.length === 0) {
      setError('Select at least one delivery channel');
      return;
    }

    if (deliveryModal.sendEmail && !deliveryModal.email.trim()) {
      setError('Enter an email address to send the quotation');
      return;
    }

    if (deliveryModal.sendSms && !deliveryModal.mobile.trim()) {
      setError('Enter a mobile number to send the quotation');
      return;
    }

    setDeliveryModal((current) => ({ ...current, submitting: true }));
    try {
      const response = await axios.post(`/api/delivery/quotations/${deliveryModal.quotation.id}`, {
        channels,
        email: deliveryModal.email.trim() || undefined,
        mobile: deliveryModal.mobile.trim() || undefined
      });
      setDeliveryModal({ open: false, quotation: null, email: '', mobile: '', sendEmail: true, sendSms: false, submitting: false });
      fetchData();
      setActionModal({
        open: true,
        title: 'Quotation Delivered',
        message: response.data?.message || 'Quotation sent successfully',
        type: 'success'
      });
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to deliver quotation');
      setDeliveryModal((current) => ({ ...current, submitting: false }));
    }
  };

  const exportQuotation = async (quotationId) => {
    setExportingId(quotationId);
    try {
      const response = await axios.get(`/api/quotations/${quotationId}`);
      const quotation = response.data;
      const rows = (quotation.items || []).map((item, index) => ({
        line: index + 1,
        product: item.product_name || `Product #${item.product_id}`,
        quantity: item.quantity,
        unit: item.unit || '-',
        price: fmt(item.price_per_unit),
        discount: `${Number(item.discount_percent || 0).toFixed(2)}%`,
        tax: `${Number(item.tax_percent || 0).toFixed(2)}%`,
        total: fmt(item.total_amount)
      }));

      rows.push({
        line: '',
        product: 'Net Amount',
        quantity: '',
        unit: '',
        price: '',
        discount: '',
        tax: '',
        total: fmt(quotation.net_amount)
      });

      downloadPDF(
        rows,
        [
          { key: 'line', label: '#' },
          { key: 'product', label: 'Product' },
          { key: 'quantity', label: 'Qty' },
          { key: 'unit', label: 'Unit' },
          { key: 'price', label: 'Price' },
          { key: 'discount', label: 'Discount' },
          { key: 'tax', label: 'Tax' },
          { key: 'total', label: 'Total' }
        ],
        `${quotation.quotation_number || 'quotation'}.pdf`
      );
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to export quotation');
    } finally {
      setExportingId(null);
    }
  };

  const convertToSale = async (quotationId) => {
    setConvertingId(quotationId);
    try {
      const response = await axios.post(`/api/quotations/${quotationId}/convert`);
      navigate('/sales', { state: { quotationConversion: response.data } });
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to convert quotation');
    } finally {
      setConvertingId(null);
    }
  };

  const statusColors = {
    draft: 'bg-gray-100 text-gray-700',
    sent: 'bg-blue-100 text-blue-700',
    accepted: 'bg-green-100 text-green-700',
    rejected: 'bg-red-100 text-red-700',
    converted: 'bg-purple-100 text-purple-700',
    expired: 'bg-yellow-100 text-yellow-700'
  };

  const fmt = (v) => Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <FileText className="h-7 w-7 text-indigo-600" /> Quotations
          </h1>
          <p className="text-sm text-gray-500 mt-1">{pagination.total} quotations</p>
        </div>
        <button onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 text-white font-medium hover:bg-indigo-700 transition-colors">
          <Plus className="h-4 w-4" /> New Quotation
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 px-4 py-3 text-red-700 text-sm" style={{background:'linear-gradient(90deg,#fff5f5,#fef2f2)'}}>
          ⚠ {error}
        </div>
      )}

      <div className="flex gap-2">
        {['', 'draft', 'sent', 'accepted', 'rejected', 'converted', 'expired'].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${statusFilter === s ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {s || 'All'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600" /></div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100">
              <thead className="bg-gray-50/80">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Registered Customer</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Quote #</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Customer</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Net Amount</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Valid Until</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {quotations.map(q => (
                  <tr key={q.id} className="hover:bg-indigo-50/30 transition-colors">
                    <td className="px-4 py-3 text-sm text-gray-600">{q.customer_id ? 'Linked' : 'Walk-in'}</td>
                    <td className="px-4 py-3 text-sm font-mono">{q.quotation_number}</td>
                    <td className="px-4 py-3 text-sm">{q.customer_name || '-'}</td>
                    <td className="px-4 py-3 text-sm text-right font-medium">₹{fmt(q.net_amount)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[q.status] || 'bg-gray-100'}`}>
                        {q.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{q.valid_until || '-'}</td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => viewDetail(q)} className="text-indigo-600 hover:text-indigo-800 p-1" title="View"><Eye className="h-4 w-4" /></button>
                        <button
                          onClick={() => exportQuotation(q.id)}
                          className="text-slate-600 hover:text-slate-800 p-1"
                          title="Export PDF"
                          disabled={exportingId === q.id}
                        >
                          <Download className="h-4 w-4" />
                        </button>
                        {['draft', 'sent', 'accepted'].includes(q.status) && (
                          <button onClick={() => openDeliveryModal(q)} className="text-blue-600 hover:text-blue-800 p-1" title="Send"><Send className="h-4 w-4" /></button>
                        )}
                        {(q.status === 'sent' || q.status === 'draft') && (
                          <>
                            <button onClick={() => updateStatus(q.id, 'accepted')} className="text-green-600 hover:text-green-800 p-1" title="Accept"><CheckCircle className="h-4 w-4" /></button>
                            <button onClick={() => updateStatus(q.id, 'rejected')} className="text-red-600 hover:text-red-800 p-1" title="Reject"><XCircle className="h-4 w-4" /></button>
                          </>
                        )}
                        {(q.status === 'accepted' || q.status === 'sent' || q.status === 'draft') && (
                          <button
                            onClick={() => convertToSale(q.id)}
                            className="text-emerald-600 hover:text-emerald-800 p-1"
                            title="Convert to Sale"
                            disabled={convertingId === q.id}
                          >
                            <ShoppingCart className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {quotations.length === 0 && (
                  <tr><td colSpan="7" className="px-4 py-12 text-center text-gray-400">No quotations found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-2xl border border-gray-100 bg-white px-4 py-3 shadow-sm">
        <p className="text-sm text-gray-500">
          Page {pagination.page} of {Math.max(1, pagination.totalPages || 1)}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={pagination.page <= 1 || loading}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Previous
          </button>
          <button
            type="button"
            onClick={() => setPage((current) => Math.min(pagination.totalPages || 1, current + 1))}
            disabled={pagination.page >= (pagination.totalPages || 1) || loading}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>

      {/* Create Modal */}
      <SharedModal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} title="New Quotation" type="info"
        confirmText="Create" onConfirm={handleCreate}>
        <form onSubmit={handleCreate} className="space-y-4 max-h-[60vh] overflow-y-auto">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Registered Customer</label>
            <select
              value={formData.customer_id}
              onChange={(event) => {
                const customerId = event.target.value;
                const customer = customers.find((entry) => entry.id === Number(customerId));
                const nextFormData = {
                  ...formData,
                  customer_id: customerId,
                  customer_name: customer ? customer.name : formData.customer_name,
                  customer_mobile: customer ? customer.mobile || '' : formData.customer_mobile,
                  customer_address: customer ? customer.address || '' : formData.customer_address
                };
                setFormData(nextFormData);
                resolveQuotationPricing(nextFormData.items, customerId);
              }}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">Walk-in / Unlinked customer</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>{customer.name}{customer.mobile ? ` (${customer.mobile})` : ''}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Customer Name</label>
              <input type="text" value={formData.customer_name}
                onChange={e => setFormData({...formData, customer_name: e.target.value})}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Mobile</label>
              <input type="text" value={formData.customer_mobile}
                onChange={e => setFormData({...formData, customer_mobile: e.target.value})}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-indigo-500" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Validity (days)</label>
            <input type="number" min="1" value={formData.valid_days}
              onChange={e => setFormData({...formData, valid_days: Number(e.target.value)})}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-indigo-500" />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium">Items</h4>
              <button type="button" onClick={addItem} className="text-xs text-indigo-600 hover:text-indigo-800">+ Add Item</button>
            </div>
            {formData.items.map((item, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-end bg-gray-50 p-2 rounded-lg">
                <div className="col-span-4">
                  <label className="block text-xs text-gray-500 mb-1">Product</label>
                  <select value={item.product_id} onChange={e => updateItem(idx, 'product_id', e.target.value)}
                    className="w-full px-2 py-1.5 text-sm rounded border border-gray-200">
                    <option value="">Select...</option>
                    {products.map(p => <option key={p.id} value={p.id}>{p.product_name} {p.variety ? `(${p.variety})` : ''}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-gray-500 mb-1">Qty</label>
                  <input type="number" min="1" value={item.quantity}
                    onChange={e => updateItem(idx, 'quantity', e.target.value)}
                    className="w-full px-2 py-1.5 text-sm rounded border border-gray-200" />
                </div>
                <div className="col-span-3">
                  <label className="block text-xs text-gray-500 mb-1">Price</label>
                  <input type="number" min="0" step="0.01" value={item.price_per_unit}
                    onChange={e => updateItem(idx, 'price_per_unit', e.target.value)}
                    className="w-full px-2 py-1.5 text-sm rounded border border-gray-200" />
                  {item.pricing_rule?.label && (
                    <p className="mt-1 text-[11px] font-semibold text-emerald-600">{item.pricing_rule.label}</p>
                  )}
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-gray-500 mb-1">Disc %</label>
                  <input type="number" min="0" max="100" value={item.discount_percent}
                    onChange={e => updateItem(idx, 'discount_percent', e.target.value)}
                    className="w-full px-2 py-1.5 text-sm rounded border border-gray-200" />
                </div>
                <div className="col-span-1">
                  {formData.items.length > 1 && (
                    <button type="button" onClick={() => removeItem(idx)} className="text-red-500 hover:text-red-700 text-sm">✕</button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-indigo-500" rows={2} />
          </div>
        </form>
      </SharedModal>

      {/* Detail Modal */}
      <SharedModal isOpen={showDetailModal} onClose={() => setShowDetailModal(false)}
        title={`Quotation ${selectedQuotation?.quotation_number || ''}`} type="info" confirmText="Close">
        {selectedQuotation && (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div><span className="text-gray-500">Customer:</span> {selectedQuotation.customer_name || '-'}</div>
              <div><span className="text-gray-500">Mobile:</span> {selectedQuotation.customer_mobile || '-'}</div>
              <div><span className="text-gray-500">Status:</span> <span className={`px-2 py-0.5 rounded-full text-xs ${statusColors[selectedQuotation.status]}`}>{selectedQuotation.status}</span></div>
              <div><span className="text-gray-500">Valid Until:</span> {selectedQuotation.valid_until || '-'}</div>
            </div>
            {selectedQuotation.items?.length > 0 && (
              <table className="min-w-full divide-y divide-gray-100 text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left">Product</th>
                    <th className="px-3 py-2 text-right">Qty</th>
                    <th className="px-3 py-2 text-right">Price</th>
                    <th className="px-3 py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {selectedQuotation.items.map((item, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2">{item.product_name || `Product #${item.product_id}`}</td>
                      <td className="px-3 py-2 text-right">{item.quantity}</td>
                      <td className="px-3 py-2 text-right">
                        ₹{fmt(item.price_per_unit)}
                        {item.pricing_rule_label && <div className="mt-1 text-[11px] text-emerald-600">{item.pricing_rule_label}</div>}
                      </td>
                      <td className="px-3 py-2 text-right">₹{fmt(item.total_amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="bg-gray-50 rounded-lg p-3 grid grid-cols-3 gap-2 text-xs">
              <div>Subtotal: ₹{fmt(selectedQuotation.total_amount)}</div>
              <div>Discount: ₹{fmt(selectedQuotation.discount_amount)}</div>
              <div className="font-semibold">Net: ₹{fmt(selectedQuotation.net_amount)}</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => exportQuotation(selectedQuotation.id)}
                className="inline-flex items-center gap-2 rounded-lg bg-slate-800 px-3 py-2 text-xs font-medium text-white hover:bg-slate-900"
              >
                <Download className="h-3.5 w-3.5" /> Export PDF
              </button>
              {(selectedQuotation.status === 'accepted' || selectedQuotation.status === 'sent' || selectedQuotation.status === 'draft') && (
                <button
                  type="button"
                  onClick={() => convertToSale(selectedQuotation.id)}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-700"
                >
                  <ShoppingCart className="h-3.5 w-3.5" /> Convert to Sale
                </button>
              )}
              {['draft', 'sent', 'accepted'].includes(selectedQuotation.status) && (
                <button
                  type="button"
                  onClick={() => openDeliveryModal(selectedQuotation)}
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700"
                >
                  <Send className="h-3.5 w-3.5" /> Send
                </button>
              )}
            </div>
          </div>
        )}
      </SharedModal>

      <SharedModal
        isOpen={deliveryModal.open}
        onClose={() => setDeliveryModal({ open: false, quotation: null, email: '', mobile: '', sendEmail: true, sendSms: false, submitting: false })}
        title={`Send ${deliveryModal.quotation?.quotation_number || 'Quotation'}`}
        type="info"
        confirmText={deliveryModal.submitting ? 'Sending...' : 'Send'}
        onConfirm={!deliveryModal.submitting ? sendQuotation : undefined}
      >
        <div className="space-y-4 text-sm">
          <div className="space-y-2">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={deliveryModal.sendEmail}
                disabled={!deliveryCapabilities.emailEnabled}
                onChange={(event) => setDeliveryModal((current) => ({ ...current, sendEmail: event.target.checked }))}
              />
              <span>Email delivery {deliveryCapabilities.emailEnabled ? '' : '(not configured)'}</span>
            </label>
            <input
              type="email"
              value={deliveryModal.email}
              onChange={(event) => setDeliveryModal((current) => ({ ...current, email: event.target.value }))}
              placeholder="Customer email"
              disabled={!deliveryModal.sendEmail}
              className="w-full rounded-lg border border-gray-200 px-3 py-2"
            />
          </div>
          <div className="space-y-2">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={deliveryModal.sendSms}
                disabled={!deliveryCapabilities.smsEnabled}
                onChange={(event) => setDeliveryModal((current) => ({ ...current, sendSms: event.target.checked }))}
              />
              <span>SMS delivery {deliveryCapabilities.smsEnabled ? '' : '(not configured)'}</span>
            </label>
            <input
              type="text"
              value={deliveryModal.mobile}
              onChange={(event) => setDeliveryModal((current) => ({ ...current, mobile: event.target.value }))}
              placeholder="Customer mobile number"
              disabled={!deliveryModal.sendSms}
              className="w-full rounded-lg border border-gray-200 px-3 py-2"
            />
          </div>
        </div>
      </SharedModal>

      <SharedModal isOpen={actionModal.open} onClose={() => setActionModal({...actionModal, open: false})}
        title={actionModal.title} type={actionModal.type} confirmText="OK">
        <p>{actionModal.message}</p>
      </SharedModal>
    </div>
  );
};

export default Quotations;
