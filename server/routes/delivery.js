const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticateToken } = require('../middleware/auth');
const { getRow, getAll, nowIST, runQuery } = require('../database/db');
const { logAudit } = require('../middleware/auditLog');
const { addReviewNotification } = require('../services/reviewNotifications');
const {
  getCommunicationCapabilities,
  sendEmail,
  sendSms,
  buildReceiptVerificationLink,
  buildQuotationShareLink
} = require('../services/communications');

const router = express.Router();

function normalizeChannels(channels) {
  return Array.from(new Set((channels || []).map((channel) => String(channel).toLowerCase())));
}

async function deliverByChannels({ channels, email, mobile, emailPayload, smsPayload }) {
  const results = [];

  for (const channel of channels) {
    if (channel === 'email') {
      if (!email) {
        throw new Error('Email recipient is required for email delivery');
      }
      await sendEmail({ to: email, ...emailPayload });
      results.push({ channel, status: 'sent', recipient: email });
    }

    if (channel === 'sms') {
      if (!mobile) {
        throw new Error('Mobile recipient is required for SMS delivery');
      }
      await sendSms({ to: mobile, body: smsPayload.body });
      results.push({ channel, status: 'sent', recipient: mobile });
    }
  }

  return results;
}

router.get('/capabilities', authenticateToken, async (req, res) => {
  try {
    res.json(getCommunicationCapabilities());
  } catch (error) {
    console.error('Get communication capabilities error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/quotations/:id', [
  authenticateToken,
  body('channels').isArray({ min: 1 }).withMessage('At least one delivery channel is required'),
  body('email').optional({ checkFalsy: true }).isEmail().withMessage('Valid email is required'),
  body('mobile').optional({ checkFalsy: true }).isString().isLength({ min: 8 }).withMessage('Valid mobile number is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const quotation = await getRow('SELECT * FROM quotations WHERE id = ?', [req.params.id]);
    if (!quotation) {
      return res.status(404).json({ message: 'Quotation not found' });
    }

    const items = await getAll(
      `SELECT qi.*, p.product_name, p.unit
       FROM quotation_items qi
       JOIN products p ON qi.product_id = p.id
       WHERE qi.quotation_id = ?`,
      [req.params.id]
    );

    const channels = normalizeChannels(req.body.channels);
    const recipientEmail = req.body.email || quotation.customer_email || '';
    const recipientMobile = req.body.mobile || quotation.customer_mobile || '';
    const quoteLink = buildQuotationShareLink(quotation.quotation_number);
    const itemLines = items.map((item) => `${item.product_name} - ${item.quantity} ${item.unit} @ ₹${Number(item.price_per_unit).toFixed(2)}`).join('\n');
    const emailPayload = {
      subject: `Quotation ${quotation.quotation_number} from Sri Lakshmi Vigneswara Traders`,
      text: [
        `Quotation Number: ${quotation.quotation_number}`,
        `Customer: ${quotation.customer_name || 'Valued Customer'}`,
        `Valid Until: ${quotation.valid_until || '-'}`,
        `Net Amount: ₹${Number(quotation.net_amount || 0).toFixed(2)}`,
        '',
        itemLines,
        '',
        `View summary: ${quoteLink}`
      ].join('\n'),
      html: `
        <div style="font-family:Segoe UI,Arial,sans-serif;color:#111827">
          <h2 style="margin-bottom:8px">Quotation ${quotation.quotation_number}</h2>
          <p style="margin:0 0 8px">Customer: <strong>${quotation.customer_name || 'Valued Customer'}</strong></p>
          <p style="margin:0 0 8px">Valid Until: <strong>${quotation.valid_until || '-'}</strong></p>
          <p style="margin:0 0 16px">Net Amount: <strong>₹${Number(quotation.net_amount || 0).toFixed(2)}</strong></p>
          <pre style="background:#f8fafc;padding:12px;border-radius:8px;white-space:pre-wrap">${itemLines}</pre>
          <p style="margin-top:16px"><a href="${quoteLink}">${quoteLink}</a></p>
        </div>`
    };
    const smsPayload = {
      body: `Quotation ${quotation.quotation_number} from Sri Lakshmi Vigneswara Traders. Amount: ₹${Number(quotation.net_amount || 0).toFixed(2)}. Valid until ${quotation.valid_until || '-'}. ${quoteLink}`
    };

    const deliveryResults = await deliverByChannels({
      channels,
      email: recipientEmail,
      mobile: recipientMobile,
      emailPayload,
      smsPayload
    });

    if (quotation.status === 'draft') {
      await runQuery('UPDATE quotations SET status = ?, updated_at = ? WHERE id = ?', ['sent', nowIST(), req.params.id]);
    }

    await logAudit(req, 'deliver', 'quotation', quotation.quotation_number, { channels: deliveryResults });
    addReviewNotification({
      actorId: req.user.id,
      actorName: req.user.username,
      actorRole: req.user.role,
      type: 'quotation',
      title: 'Delivered quotation',
      description: `${quotation.quotation_number} sent via ${deliveryResults.map((entry) => entry.channel).join(', ')}`,
      createdAt: nowIST()
    });

    res.json({
      message: 'Quotation delivered successfully',
      channels: deliveryResults
    });
  } catch (error) {
    console.error('Deliver quotation error:', error);
    res.status(400).json({ message: error.message || 'Failed to deliver quotation' });
  }
});

router.post('/receipts/:saleId', [
  authenticateToken,
  body('channels').isArray({ min: 1 }).withMessage('At least one delivery channel is required'),
  body('email').optional({ checkFalsy: true }).isEmail().withMessage('Valid email is required'),
  body('mobile').optional({ checkFalsy: true }).isString().isLength({ min: 8 }).withMessage('Valid mobile number is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const receipt = await getRow('SELECT * FROM receipts WHERE sale_id = ?', [req.params.saleId]);
    if (!receipt) {
      return res.status(404).json({ message: 'Receipt not found' });
    }

    const items = await getAll(
      `SELECT s.*, p.product_name, p.unit
       FROM sales s
       JOIN products p ON s.product_id = p.id
       WHERE s.sale_id = ?`,
      [req.params.saleId]
    );

    const channels = normalizeChannels(req.body.channels);
    const recipientEmail = req.body.email || '';
    const recipientMobile = req.body.mobile || receipt.customer_mobile || '';
    const receiptLink = buildReceiptVerificationLink(receipt.receipt_number);
    const itemLines = items.map((item) => `${item.product_name} - ${item.quantity_sold} ${item.unit} = ₹${Number(item.total_amount).toFixed(2)}`).join('\n');
    const emailPayload = {
      subject: `Receipt ${receipt.receipt_number} from Sri Lakshmi Vigneswara Traders`,
      text: [
        `Receipt Number: ${receipt.receipt_number}`,
        `Sale ID: ${req.params.saleId}`,
        `Customer: ${receipt.customer_name || 'Valued Customer'}`,
        `Payment Mode: ${receipt.payment_mode}`,
        `Total Amount: ₹${Number(receipt.total_amount || 0).toFixed(2)}`,
        '',
        itemLines,
        '',
        `Verify receipt: ${receiptLink}`
      ].join('\n'),
      html: `
        <div style="font-family:Segoe UI,Arial,sans-serif;color:#111827">
          <h2 style="margin-bottom:8px">Receipt ${receipt.receipt_number}</h2>
          <p style="margin:0 0 8px">Customer: <strong>${receipt.customer_name || 'Valued Customer'}</strong></p>
          <p style="margin:0 0 8px">Payment Mode: <strong>${receipt.payment_mode}</strong></p>
          <p style="margin:0 0 16px">Total Amount: <strong>₹${Number(receipt.total_amount || 0).toFixed(2)}</strong></p>
          <pre style="background:#f8fafc;padding:12px;border-radius:8px;white-space:pre-wrap">${itemLines}</pre>
          <p style="margin-top:16px"><a href="${receiptLink}">${receiptLink}</a></p>
        </div>`
    };
    const smsPayload = {
      body: `Receipt ${receipt.receipt_number} from Sri Lakshmi Vigneswara Traders. Amount: ₹${Number(receipt.total_amount || 0).toFixed(2)}. Verify: ${receiptLink}`
    };

    const deliveryResults = await deliverByChannels({
      channels,
      email: recipientEmail,
      mobile: recipientMobile,
      emailPayload,
      smsPayload
    });

    await logAudit(req, 'deliver', 'receipt', receipt.receipt_number, { channels: deliveryResults });
    addReviewNotification({
      actorId: req.user.id,
      actorName: req.user.username,
      actorRole: req.user.role,
      type: 'sale',
      title: 'Delivered receipt',
      description: `${receipt.receipt_number} sent via ${deliveryResults.map((entry) => entry.channel).join(', ')}`,
      createdAt: nowIST()
    });

    res.json({
      message: 'Receipt delivered successfully',
      channels: deliveryResults
    });
  } catch (error) {
    console.error('Deliver receipt error:', error);
    res.status(400).json({ message: error.message || 'Failed to deliver receipt' });
  }
});

module.exports = router;