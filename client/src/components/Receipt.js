import React, { useState, useEffect, useCallback } from 'react';
import { fmtDate, fmtTime } from '../utils/dateUtils';
import { useParams, useNavigate } from 'react-router-dom';
import { useReactToPrint } from 'react-to-print';
import axios from 'axios';
import SharedModal from './shared/Modal';
import {
  ArrowLeft,
  Printer,
  Send,
  Store,
  Phone,
  Mail,
  User,
  CreditCard
} from 'lucide-react';

const GST_NUMBER = '33AAACH7409R1Z8';

const Receipt = () => {
  const { saleId } = useParams();
  const navigate = useNavigate();
  const [saleData, setSaleData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deliveryCapabilities, setDeliveryCapabilities] = useState({ emailEnabled: false });
  const [sendModal, setSendModal] = useState({
    open: false,
    email: '',
    submitting: false
  });
  const [deliveryMessage, setDeliveryMessage] = useState('');
  const receiptRef = React.useRef();

  const fetchDeliveryCapabilities = useCallback(async () => {
    try {
      const response = await axios.get('/api/delivery/capabilities');
      setDeliveryCapabilities(response.data || { emailEnabled: false });
    } catch {
      setDeliveryCapabilities({ emailEnabled: false });
    }
  }, []);

  const fetchSaleData = useCallback(async () => {
    try {
      const response = await axios.get(`/api/sales/${saleId}`);
      setSaleData(response.data);
    } catch (fetchError) {
      setError('Failed to load receipt data');
      console.error('Receipt error:', fetchError);
    } finally {
      setLoading(false);
    }
  }, [saleId]);

  useEffect(() => {
    fetchSaleData();
  }, [fetchSaleData]);

  useEffect(() => {
    fetchDeliveryCapabilities();
  }, [fetchDeliveryCapabilities]);

  const handlePrint = useReactToPrint({
    content: () => receiptRef.current,
    documentTitle: saleData?.receipt?.receipt_number,
    onAfterPrint: async () => {
      try {
        await axios.put(`/api/sales/receipts/${saleData.receipt.id}/print`);
      } catch (printError) {
        console.error('Failed to update receipt print status:', printError);
      }
    }
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error || !saleData) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center text-blue-600 hover:text-blue-800"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </button>
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <p className="text-red-700">{error || 'Receipt not found'}</p>
        </div>
      </div>
    );
  }

  const { items, receipt } = saleData;
  const totalQuantity = items.reduce((sum, item) => sum + Number(item.quantity_sold || 0), 0);
  const formatAmount = (value) =>
    `Rs. ${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const sendReceipt = async () => {
    if (!deliveryCapabilities.emailEnabled) {
      setError('Email delivery is not configured');
      return;
    }

    if (!sendModal.email.trim()) {
      setError('Enter an email address to send the receipt');
      return;
    }

    setSendModal((current) => ({ ...current, submitting: true }));
    try {
      const response = await axios.post(`/api/delivery/receipts/${saleId}`, {
        channels: ['email'],
        email: sendModal.email.trim() || undefined
      });
      setSendModal({ open: false, email: '', submitting: false });
      setDeliveryMessage(response.data?.message || 'Receipt sent successfully');
    } catch (deliveryError) {
      setError(deliveryError.response?.data?.message || 'Failed to send receipt');
      setSendModal((current) => ({ ...current, submitting: false }));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center text-blue-600 hover:text-blue-800"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Sales
        </button>
        <div className="flex items-center gap-3 no-print">
          <button
            type="button"
            onClick={() => setSendModal({
              open: true,
              email: '',
              submitting: false
            })}
            className="btn-secondary"
          >
            <Send className="h-4 w-4 mr-2" />
            Send Receipt
          </button>
          <button
            onClick={handlePrint}
            className="btn-primary no-print"
          >
            <Printer className="h-4 w-4 mr-2" />
            Print Receipt
          </button>
        </div>
      </div>

      {deliveryMessage && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 no-print">
          {deliveryMessage}
        </div>
      )}

      <div className="flex justify-center">
        <div ref={receiptRef} className="receipt-sheet bg-white">
          <div className="receipt-header">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3 min-w-0">
                <div className="receipt-logo-wrap">
                  <Store className="h-8 w-8 text-blue-700" />
                </div>
                <div className="min-w-0">
                  <h1 className="receipt-store-name">Sri Venkata Lakshmi Vigneswara Traders</h1>
                  <p className="receipt-gst">GSTIN: {GST_NUMBER}</p>
                  <div className="receipt-contact-list">
                    <p className="flex items-center">
                      <Phone className="h-3.5 w-3.5 mr-1.5" />
                      +91 7036953734
                    </p>
                    <p className="flex items-center break-all">
                      <Mail className="h-3.5 w-3.5 mr-1.5 flex-shrink-0" />
                      dvvshivaram@gmail.com
                    </p>
                  </div>
                </div>
              </div>
              <div className="receipt-badge">Retail Receipt</div>
            </div>
          </div>

          <div className="receipt-meta-grid">
            <div className="receipt-section">
              <div className="receipt-section-title">Receipt Details</div>
              <div className="receipt-keyvals">
                <div className="receipt-keyval-row">
                  <span>Receipt No</span>
                  <span className="font-semibold text-gray-900">{receipt.receipt_number}</span>
                </div>
                <div className="receipt-keyval-row">
                  <span>Date</span>
                  <span className="text-gray-900">{fmtDate(receipt.receipt_date)}</span>
                </div>
                <div className="receipt-keyval-row">
                  <span>Time</span>
                  <span className="text-gray-900">{fmtTime(receipt.receipt_date)}</span>
                </div>
                <div className="receipt-keyval-row">
                  <span>Sale ID</span>
                  <span className="text-gray-900">{saleId}</span>
                </div>
                {receipt.payment_gateway && (
                  <div className="receipt-keyval-row">
                    <span>Gateway</span>
                    <span className="text-gray-900 capitalize">{receipt.payment_gateway}</span>
                  </div>
                )}
                {receipt.payment_reference && (
                  <div className="receipt-keyval-row">
                    <span>Reference</span>
                    <span className="text-gray-900">{receipt.payment_reference}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="receipt-section">
              <div className="receipt-section-title">Customer Details</div>
              <div className="receipt-customer-lines">
                <p className="receipt-info-line">
                  <User className="h-3.5 w-3.5 text-gray-500" />
                  <span className="receipt-info-label">Customer</span>
                  <span className="receipt-info-value">{receipt.customer_name}</span>
                </p>
                {receipt.customer_mobile && (
                  <p className="receipt-info-line">
                    <Phone className="h-3.5 w-3.5 text-gray-500" />
                    <span className="receipt-info-label">Mobile</span>
                    <span className="receipt-info-value">{receipt.customer_mobile}</span>
                  </p>
                )}
                {receipt.customer_address && (
                  <p className="receipt-info-line receipt-address-line">
                    <Mail className="h-3.5 w-3.5 text-gray-500" />
                    <span className="receipt-info-label">Address</span>
                    <span className="receipt-info-value">{receipt.customer_address}</span>
                  </p>
                )}
                <p className="receipt-info-line">
                  <CreditCard className="h-3.5 w-3.5 text-gray-500" />
                  <span className="receipt-info-label">Payment</span>
                  <span className="receipt-info-value capitalize">{receipt.payment_mode}</span>
                </p>
              </div>
            </div>
          </div>

          <div className="receipt-section">
            <div className="receipt-section-title receipt-table-title-row">
              <span>Items Purchased</span>
              <span>{items.length} item{items.length === 1 ? '' : 's'} | Qty {totalQuantity}</span>
            </div>
            <table className="receipt-table">
              <thead>
                <tr>
                  <th className="text-left">Item</th>
                  <th className="text-center">Qty</th>
                  <th className="text-right">Price</th>
                  <th className="text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => (
                  <tr key={index}>
                    <td>
                      <div>
                        <p className="font-medium text-gray-900 leading-tight">{item.product_name}</p>
                        {item.variety && (
                          <p className="text-[11px] text-gray-500 leading-tight">{item.variety}</p>
                        )}
                      </div>
                    </td>
                    <td className="text-center">
                      {item.quantity_sold} {item.unit}
                    </td>
                    <td className="text-right">
                      {formatAmount(item.price_per_unit)}/{item.unit}
                    </td>
                    <td className="text-right font-semibold">
                      {formatAmount(item.total_amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="receipt-totals">
            <div className="receipt-total-box">
              <div className="receipt-total-row">
                <span>Items Count</span>
                <span>{items.length}</span>
              </div>
              <div className="receipt-total-row">
                <span>Total Quantity</span>
                <span>{totalQuantity}</span>
              </div>
              <div className="receipt-total-row receipt-grand-total">
                <span>Total Amount</span>
                <span>{formatAmount(saleData.totalAmount)}</span>
              </div>
            </div>
          </div>

          {saleData.receipt_qr?.data_url && (
            <div className="receipt-section">
              <div className="receipt-section-title">Receipt Verification QR</div>
              <div className="flex flex-col sm:flex-row items-center gap-4">
                <img src={saleData.receipt_qr.data_url} alt="Receipt verification QR" className="h-36 w-36 border border-gray-200 rounded-xl p-2" />
                <div className="text-sm text-gray-600">
                  <p className="font-medium text-gray-900">Scan to verify this receipt</p>
                  <p className="mt-1 break-all">{saleData.receipt_qr.verification_link}</p>
                </div>
              </div>
            </div>
          )}

          <div className="receipt-footer">
            <p className="receipt-footer-message">Thank you for your business. Please visit again.</p>
            <p className="receipt-footer-note">This is a computer generated receipt. No signature required.</p>
          </div>
        </div>
      </div>

      <div className="flex justify-center space-x-4 no-print">
        <button
          onClick={() => navigate('/sales')}
          className="btn-secondary"
        >
          New Sale
        </button>
        <button
          onClick={handlePrint}
          className="btn-primary"
        >
          <Printer className="h-4 w-4 mr-2" />
          Print Again
        </button>
      </div>

      <SharedModal
        isOpen={sendModal.open}
        onClose={() => setSendModal({ open: false, email: '', submitting: false })}
        title={`Send ${receipt.receipt_number}`}
        type="info"
        confirmText={sendModal.submitting ? 'Sending...' : 'Send'}
        onConfirm={!sendModal.submitting ? sendReceipt : undefined}
      >
        <div className="space-y-4 text-sm">
          <div className="space-y-2">
            <label className="block font-medium text-gray-700">Customer email</label>
            <input
              type="email"
              value={sendModal.email}
              onChange={(event) => setSendModal((current) => ({ ...current, email: event.target.value }))}
              placeholder="Customer email"
              disabled={!deliveryCapabilities.emailEnabled}
              className="w-full rounded-lg border border-gray-200 px-3 py-2"
            />
          </div>
          {!deliveryCapabilities.emailEnabled && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-700">
              Email delivery is not configured on the server.
            </p>
          )}
        </div>
      </SharedModal>
    </div>
  );
};

export default Receipt;
