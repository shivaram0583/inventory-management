const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticateToken, authorizeRole } = require('../middleware/auth');
const { getRow, runQuery, getAll, nowIST, paginate } = require('../database/db');
const { logAudit } = require('../middleware/auditLog');
const { buildQuotationShareLink } = require('../services/communications');
const { resolveEffectivePrice } = require('../services/pricing');
const moment = require('moment');

const router = express.Router();

function generateQuotationNumber() {
  return 'Q-' + moment().utcOffset('+05:30').format('YYYYMMDD') + '-' + Math.random().toString(36).substr(2, 4).toUpperCase();
}

// Create quotation
router.post('/', [
  authenticateToken,
  body('items').isArray({ min: 1 }).withMessage('At least one item required'),
  body('items.*.product_id').isInt({ min: 1 }),
  body('items.*.quantity').isFloat({ gt: 0 }),
  body('valid_until').optional().isISO8601()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { items, customer_id, customer_name, customer_mobile, customer_address, discount_percent = 0, notes, valid_until } = req.body;
    const quotationNumber = generateQuotationNumber();

    let totalAmount = 0;
    let totalTax = 0;
    const resolvedItems = [];

    for (const item of items) {
      const product = await getRow('SELECT * FROM products WHERE id = ?', [item.product_id]);
      if (!product) return res.status(404).json({ message: `Product ${item.product_id} not found` });

      const manualPriceOverride = Boolean(item.manual_price_override);
      const resolvedPricing = manualPriceOverride
        ? null
        : await resolveEffectivePrice({
            productId: item.product_id,
            customerId: customer_id,
            quantity: item.quantity,
            pricingDate: valid_until || nowIST()
          });
      const pricePerUnit = manualPriceOverride && Number.isFinite(Number(item.price_per_unit))
        ? Number(item.price_per_unit)
        : (resolvedPricing?.effective_price || product.selling_price);
      const discountPct = item.discount_percent || 0;
      const taxPct = 0;

      const lineTotal = item.quantity * pricePerUnit;
      const lineDiscount = lineTotal * (discountPct / 100);
      const afterDiscount = lineTotal - lineDiscount;
      const lineTax = afterDiscount * (taxPct / 100);
      const lineNet = afterDiscount + lineTax;

      totalAmount += lineTotal;
      totalTax += lineTax;

      resolvedItems.push({
        product_id: product.id,
        quantity: item.quantity,
        price_per_unit: pricePerUnit,
        discount_percent: discountPct,
        tax_percent: taxPct,
        pricing_rule_type: manualPriceOverride ? 'manual' : (resolvedPricing?.applied_rule?.type || null),
        pricing_rule_label: manualPriceOverride ? 'Manual price override' : (resolvedPricing?.applied_rule?.label || null),
        total_amount: lineNet
      });
    }

    const discountAmount = totalAmount * (discount_percent / 100);
    const netAmount = totalAmount - discountAmount + totalTax;

    const defaultValidity = moment().utcOffset('+05:30').add(15, 'days').format('YYYY-MM-DD');

    const result = await runQuery(
      `INSERT INTO quotations (quotation_number, customer_id, customer_name, customer_mobile, customer_address, total_amount, discount_amount, tax_amount, net_amount, status, valid_until, notes, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?)`,
      [quotationNumber, customer_id || null, customer_name || null, customer_mobile || null, customer_address || null,
       totalAmount, discountAmount, totalTax, netAmount, valid_until || defaultValidity, notes || null,
       req.user.id, nowIST(), nowIST()]
    );

    for (const item of resolvedItems) {
      await runQuery(
        `INSERT INTO quotation_items (
           quotation_id, product_id, quantity, price_per_unit, discount_percent,
           tax_percent, pricing_rule_type, pricing_rule_label, total_amount
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          result.id,
          item.product_id,
          item.quantity,
          item.price_per_unit,
          item.discount_percent,
          item.tax_percent,
          item.pricing_rule_type,
          item.pricing_rule_label,
          item.total_amount
        ]
      );
    }

    await logAudit(req, 'create', 'quotation', result.id, { quotation_number: quotationNumber });

    const quotation = await getRow('SELECT * FROM quotations WHERE id = ?', [result.id]);
    const qItems = await getAll(
      'SELECT qi.*, p.product_name, p.unit FROM quotation_items qi JOIN products p ON qi.product_id = p.id WHERE qi.quotation_id = ?',
      [result.id]
    );
    res.status(201).json({ ...quotation, items: qItems });
  } catch (error) {
    console.error('Create quotation error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// List quotations
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { status, page = 1, limit = 50 } = req.query;
    let query = 'SELECT q.*, u.username as created_by_name FROM quotations q LEFT JOIN users u ON q.created_by = u.id';
    const params = [];
    if (status) { query += ' WHERE q.status = ?'; params.push(status); }
    query += ' ORDER BY q.created_at DESC';

    const result = await paginate(query, params, page, limit);
    res.json(result);
  } catch (error) {
    console.error('List quotations error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/public/:quotationNumber', async (req, res) => {
  try {
    const quotation = await getRow(
      'SELECT quotation_number, customer_name, customer_mobile, customer_address, net_amount, valid_until, status, notes, created_at FROM quotations WHERE quotation_number = ?',
      [req.params.quotationNumber]
    );
    if (!quotation) return res.status(404).json({ message: 'Quotation not found' });

    const items = await getAll(
      `SELECT qi.quantity, qi.price_per_unit, qi.discount_percent, qi.tax_percent, qi.total_amount, qi.pricing_rule_label, p.product_name, p.unit
       FROM quotation_items qi
       JOIN quotations q ON q.id = qi.quotation_id
       JOIN products p ON p.id = qi.product_id
       WHERE q.quotation_number = ?`,
      [req.params.quotationNumber]
    );

    const shareUrl = buildQuotationShareLink(quotation.quotation_number);

    if (req.accepts('html') && !String(req.query.format || '').toLowerCase().includes('json')) {
      return res.redirect(302, shareUrl);
    }

    res.json({
      ...quotation,
      share_url: shareUrl,
      items
    });
  } catch (error) {
    console.error('Public quotation lookup error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get single quotation
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const quotation = await getRow(
      'SELECT q.*, u.username as created_by_name FROM quotations q LEFT JOIN users u ON q.created_by = u.id WHERE q.id = ?',
      [req.params.id]
    );
    if (!quotation) return res.status(404).json({ message: 'Quotation not found' });

    const items = await getAll(
      'SELECT qi.*, p.product_name, p.unit, p.quantity_available FROM quotation_items qi JOIN products p ON qi.product_id = p.id WHERE qi.quotation_id = ?',
      [req.params.id]
    );
    res.json({ ...quotation, items });
  } catch (error) {
    console.error('Get quotation error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update quotation status
router.put('/:id/status', [
  authenticateToken,
  body('status').isIn(['draft', 'sent', 'accepted', 'rejected', 'expired']).withMessage('Invalid status')
], async (req, res) => {
  try {
    const quotation = await getRow('SELECT * FROM quotations WHERE id = ?', [req.params.id]);
    if (!quotation) return res.status(404).json({ message: 'Quotation not found' });
    if (quotation.status === 'converted') return res.status(400).json({ message: 'Cannot change status of converted quotation' });

    await runQuery('UPDATE quotations SET status = ?, updated_at = ? WHERE id = ?',
      [req.body.status, nowIST(), req.params.id]);

    await logAudit(req, 'update_status', 'quotation', req.params.id, { from: quotation.status, to: req.body.status });
    res.json({ message: `Quotation status updated to ${req.body.status}` });
  } catch (error) {
    console.error('Update quotation status error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Convert quotation to sale (returns pre-filled sale data)
router.post('/:id/convert', authenticateToken, async (req, res) => {
  try {
    const quotation = await getRow('SELECT * FROM quotations WHERE id = ?', [req.params.id]);
    if (!quotation) return res.status(404).json({ message: 'Quotation not found' });
    if (quotation.status === 'converted') return res.status(400).json({ message: 'Already converted' });
    if (quotation.status === 'rejected' || quotation.status === 'expired') {
      return res.status(400).json({ message: `Cannot convert ${quotation.status} quotation` });
    }

    const items = await getAll(
      'SELECT qi.*, p.product_name, p.unit, p.quantity_available, p.selling_price FROM quotation_items qi JOIN products p ON qi.product_id = p.id WHERE qi.quotation_id = ?',
      [req.params.id]
    );

    // Check stock availability
    for (const item of items) {
      if (item.quantity_available < item.quantity) {
        return res.status(400).json({
          message: `Insufficient stock for ${item.product_name}. Available: ${item.quantity_available}, Required: ${item.quantity}`
        });
      }
    }

    // Return pre-filled sale data for the frontend to submit via /api/sales
    res.json({
      quotation_id: quotation.id,
      quotation_number: quotation.quotation_number,
      customer_name: quotation.customer_name,
      customer_mobile: quotation.customer_mobile,
      customer_address: quotation.customer_address,
      customer_id: quotation.customer_id,
      items: items.map(i => ({
        product_id: i.product_id,
        product_name: i.product_name,
        variety: i.variety,
        quantity: i.quantity,
        quantity_available: i.quantity_available,
        price_per_unit: i.price_per_unit,
        discount_percent: i.discount_percent,
        tax_percent: i.tax_percent,
        unit: i.unit
      })),
      discount_amount: quotation.discount_amount,
      message: 'Quotation ready for conversion. Submit via POST /api/sales with quotation_id.'
    });
  } catch (error) {
    console.error('Convert quotation error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete quotation (only draft)
router.delete('/:id', [authenticateToken, authorizeRole(['admin'])], async (req, res) => {
  try {
    const quotation = await getRow('SELECT * FROM quotations WHERE id = ?', [req.params.id]);
    if (!quotation) return res.status(404).json({ message: 'Quotation not found' });
    if (quotation.status === 'converted') return res.status(400).json({ message: 'Cannot delete converted quotation' });

    await runQuery('DELETE FROM quotation_items WHERE quotation_id = ?', [req.params.id]);
    await runQuery('DELETE FROM quotations WHERE id = ?', [req.params.id]);
    await logAudit(req, 'delete', 'quotation', req.params.id, { quotation_number: quotation.quotation_number });
    res.json({ message: 'Quotation deleted' });
  } catch (error) {
    console.error('Delete quotation error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
