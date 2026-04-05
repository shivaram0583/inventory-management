const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticateToken, authorizeRole } = require('../middleware/auth');
const { requireDailySetupForOperatorWrites } = require('../middleware/dailySetup');
const { getRow } = require('../database/db');
const {
  getProductPricingRules,
  getCustomerPricingRules,
  resolveEffectivePrices,
  replaceProductPricingRules,
  replaceCustomerPricingRules
} = require('../services/pricing');

const router = express.Router();

router.post('/resolve', [
  authenticateToken,
  body('items').isArray({ min: 1 }).withMessage('At least one item is required'),
  body('items.*.product_id').isInt({ min: 1 }).withMessage('Valid product is required'),
  body('items.*.quantity').isFloat({ gt: 0 }).withMessage('Quantity must be positive'),
  body('customer_id').optional({ nullable: true }).isInt({ min: 1 }),
  body('pricing_date').optional().isString()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const pricing = await resolveEffectivePrices({
      items: req.body.items,
      customerId: req.body.customer_id,
      pricingDate: req.body.pricing_date
    });

    res.json({ items: pricing });
  } catch (error) {
    console.error('Resolve pricing error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/products/:productId', authenticateToken, async (req, res) => {
  try {
    const product = await getRow('SELECT id, product_id, product_name, selling_price, unit FROM products WHERE id = ?', [req.params.productId]);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    const rules = await getProductPricingRules(req.params.productId);
    res.json({ product, ...rules });
  } catch (error) {
    console.error('Get product pricing rules error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/products/:productId', [
  authenticateToken,
  authorizeRole(['admin', 'operator']),
  requireDailySetupForOperatorWrites,
  body('tierPricing').optional().isArray(),
  body('promotions').optional().isArray()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const product = await getRow('SELECT id FROM products WHERE id = ?', [req.params.productId]);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    const updatedRules = await replaceProductPricingRules(req.params.productId, {
      tierPricing: req.body.tierPricing || [],
      promotions: req.body.promotions || []
    });

    res.json({ message: 'Product pricing rules updated', ...updatedRules });
  } catch (error) {
    console.error('Update product pricing rules error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/customers/:customerId', authenticateToken, async (req, res) => {
  try {
    const customer = await getRow('SELECT id, name, mobile FROM customers WHERE id = ?', [req.params.customerId]);
    if (!customer) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    const rules = await getCustomerPricingRules(req.params.customerId);
    res.json({ customer, rules });
  } catch (error) {
    console.error('Get customer pricing rules error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/customers/:customerId', [
  authenticateToken,
  authorizeRole(['admin', 'operator']),
  requireDailySetupForOperatorWrites,
  body('rules').optional().isArray()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const customer = await getRow('SELECT id FROM customers WHERE id = ?', [req.params.customerId]);
    if (!customer) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    const rules = await replaceCustomerPricingRules(req.params.customerId, req.body.rules || []);
    res.json({ message: 'Customer pricing rules updated', rules });
  } catch (error) {
    console.error('Update customer pricing rules error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;