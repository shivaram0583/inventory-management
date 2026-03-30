import React, { useState, useEffect, useCallback } from 'react';
import { fmtDate, fmtTime } from '../utils/dateUtils';
import { useParams, useNavigate } from 'react-router-dom';
import { useReactToPrint } from 'react-to-print';
import axios from 'axios';
import {
  ArrowLeft,
  Printer,
  Store,
  Phone,
  Mail,
  User,
  CreditCard
} from 'lucide-react';

const Receipt = () => {
  const { saleId } = useParams();
  const navigate = useNavigate();
  const [saleData, setSaleData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const receiptRef = React.useRef();

  const fetchSaleData = useCallback(async () => {
    try {
      const response = await axios.get(`/api/sales/${saleId}`);
      setSaleData(response.data);
    } catch (error) {
      setError('Failed to load receipt data');
      console.error('Receipt error:', error);
    } finally {
      setLoading(false);
    }
  }, [saleId]);

  useEffect(() => {
    fetchSaleData();
  }, [fetchSaleData]);

  const handlePrint = useReactToPrint({
    content: () => receiptRef.current,
    documentTitle: saleData?.receipt?.receipt_number,
    onAfterPrint: async () => {
      // Mark receipt as printed
      try {
        await axios.put(`/api/sales/receipts/${saleData.receipt.id}/print`);
      } catch (error) {
        console.error('Failed to update receipt print status:', error);
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

  return (
    <div className="space-y-6">
      {/* Action Buttons */}
      <div className="flex justify-between items-center">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center text-blue-600 hover:text-blue-800"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Sales
        </button>
        <button
          onClick={handlePrint}
          className="btn-primary no-print"
        >
          <Printer className="h-4 w-4 mr-2" />
          Print Receipt
        </button>
      </div>

      {/* Receipt Preview */}
      <div className="flex justify-center">
        <div
          ref={receiptRef}
          className="bg-white p-8 rounded-lg shadow-lg max-w-md w-full"
          style={{ minHeight: '600px' }}
        >
          {/* Header */}
          <div className="text-center mb-6 border-b-2 border-gray-800 pb-4">
            <div className="flex justify-center mb-2">
              <Store className="h-12 w-12 text-blue-600" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Sri Venkata Lakshmi Vigneswara Traders</h1>
            <p className="text-sm text-gray-600 mt-1">Inventory Management System</p>
            <div className="mt-2 text-xs text-gray-500">
              <p className="flex items-center justify-center">
                <Phone className="h-3 w-3 mr-1" />
                +91 7036953734
              </p>
              <p className="flex items-center justify-center">
                <Mail className="h-3 w-3 mr-1" />
                dvvshivaram@gmail.com
              </p>
            </div>
          </div>

          {/* Receipt Info */}
          <div className="mb-6">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-medium text-gray-600">Receipt No:</span>
              <span className="text-sm font-bold text-gray-900">{receipt.receipt_number}</span>
            </div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-medium text-gray-600">Date:</span>
              <span className="text-sm text-gray-900">
                {fmtDate(receipt.receipt_date)}
              </span>
            </div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-medium text-gray-600">Time:</span>
              <span className="text-sm text-gray-900">
                {fmtTime(receipt.receipt_date)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium text-gray-600">Sale ID:</span>
              <span className="text-sm text-gray-900">{saleId}</span>
            </div>
          </div>

          {/* Customer Info */}
          <div className="mb-6 p-3 bg-gray-50 rounded">
            <div className="flex items-center mb-1">
              <User className="h-4 w-4 text-gray-500 mr-2" />
              <span className="text-sm font-medium text-gray-700">Customer:</span>
            </div>
            <p className="text-sm text-gray-900 ml-6">{receipt.customer_name}</p>

            {receipt.customer_mobile && (
              <>
                <div className="flex items-center mt-2 mb-1">
                  <Phone className="h-4 w-4 text-gray-500 mr-2" />
                  <span className="text-sm font-medium text-gray-700">Mobile:</span>
                </div>
                <p className="text-sm text-gray-900 ml-6">{receipt.customer_mobile}</p>
              </>
            )}

            {receipt.customer_address && (
              <>
                <div className="flex items-center mt-2 mb-1">
                  <Mail className="h-4 w-4 text-gray-500 mr-2" />
                  <span className="text-sm font-medium text-gray-700">Address:</span>
                </div>
                <p className="text-sm text-gray-900 ml-6">{receipt.customer_address}</p>
              </>
            )}
            
            <div className="flex items-center mt-2 mb-1">
              <CreditCard className="h-4 w-4 text-gray-500 mr-2" />
              <span className="text-sm font-medium text-gray-700">Payment:</span>
            </div>
            <p className="text-sm text-gray-900 ml-6 capitalize">{receipt.payment_mode}</p>
          </div>

          {/* Items Table */}
          <div className="mb-6">
            <h3 className="text-sm font-bold text-gray-900 mb-3">Items Purchased</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-300">
                  <th className="text-left py-2">Item</th>
                  <th className="text-center py-2">Qty</th>
                  <th className="text-right py-2">Price</th>
                  <th className="text-right py-2">Total</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => (
                  <tr key={index} className="border-b border-gray-200">
                    <td className="py-2">
                      <div>
                        <p className="font-medium text-gray-900">{item.product_name}</p>
                        {item.variety && (
                          <p className="text-xs text-gray-500">{item.variety}</p>
                        )}
                      </div>
                    </td>
                    <td className="text-center py-2">
                      {item.quantity_sold} {item.unit}
                    </td>
                    <td className="text-right py-2">
                      ₹{item.price_per_unit}/{item.unit}
                    </td>
                    <td className="text-right py-2 font-medium">
                      ₹{item.total_amount.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Total */}
          <div className="border-t-2 border-gray-800 pt-4">
            <div className="flex justify-between items-center mb-2">
              <span className="text-lg font-bold text-gray-900">Total Amount:</span>
              <span className="text-xl font-bold text-gray-900">
                ₹{saleData.totalAmount.toFixed(2)}
              </span>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-8 pt-4 border-t border-gray-300">
            <p className="text-center text-xs text-gray-500 mb-2">
              Thank you for your business!
            </p>
            <p className="text-center text-xs text-gray-500">
              Please visit again
            </p>
            <div className="mt-4 text-center">
              <p className="text-xs text-gray-400">
                This is a computer generated receipt
              </p>
              <p className="text-xs text-gray-400">
                No signature required
              </p>
            </div>
          </div>

          {/* Print-only watermark */}
          <div className="print-only">
            <div className="absolute inset-0 flex items-center justify-center opacity-10">
              <div className="text-center">
                <Store className="h-32 w-32 text-gray-600 mx-auto mb-2" />
                <p className="text-2xl font-bold text-gray-600">PAID</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
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
    </div>
  );
};

export default Receipt;
