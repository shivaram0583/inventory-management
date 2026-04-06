const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticateToken, authorizeRole } = require('../middleware/auth');
const { requireDailySetupForOperatorWrites } = require('../middleware/dailySetup');
const { getRow, runQuery, getAll, nowIST, paginate } = require('../database/db');
const { logAudit } = require('../middleware/auditLog');
const { addReviewNotification } = require('../services/reviewNotifications');

const router = express.Router();

const LOSS_ADJUSTMENT_TYPES = new Set(['damage', 'theft', 'spoilage']);

// Create stock adjustment
router.post('/', [
  authenticateToken,
  requireDailySetupForOperatorWrites,
  body('product_id').isInt({ min: 1 }).withMessage('Valid product ID required'),
  body('adjustment_type').isIn(['damage', 'theft', 'spoilage', 'counting_error', 'other']).withMessage('Invalid adjustment type'),
  body('quantity_adjusted').isFloat().withMessage('Quantity is required'),
  body('reason').notEmpty().withMessage('Reason is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { product_id, adjustment_type, quantity_adjusted, reason } = req.body;
    const requestedQuantity = Number(quantity_adjusted);

    if (!Number.isFinite(requestedQuantity) || requestedQuantity === 0) {
      return res.status(400).json({ message: 'Quantity must be a non-zero number' });
    }

    const product = await getRow('SELECT * FROM products WHERE id = ?', [product_id]);
    if (!product) return res.status(404).json({ message: 'Product not found' });

    const signedAdjustment = LOSS_ADJUSTMENT_TYPES.has(adjustment_type)
      ? -Math.abs(requestedQuantity)
      : requestedQuantity;

    const newQuantity = Number(product.quantity_available) + signedAdjustment;
    if (newQuantity < 0) {
      return res.status(400).json({ message: `Cannot adjust below zero. Current stock: ${product.quantity_available}` });
    }

    const adjustmentDate = nowIST();

    await runQuery(
      'UPDATE products SET quantity_available = ?, updated_at = ? WHERE id = ?',
      [newQuantity, adjustmentDate, product_id]
    );

    const result = await runQuery(
      `INSERT INTO stock_adjustments (product_id, adjustment_type, quantity_adjusted, quantity_before, quantity_after, reason, adjusted_by, adjustment_date, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [product_id, adjustment_type, signedAdjustment, product.quantity_available, newQuantity, reason, req.user.id, adjustmentDate, adjustmentDate]
    );

    addReviewNotification({
      actorId: req.user.id, actorName: req.user.username, actorRole: req.user.role,
      type: 'inventory',
      title: 'Stock adjustment',
      description: `${adjustment_type}: ${signedAdjustment > 0 ? '+' : ''}${signedAdjustment} ${product.unit} of ${product.product_name} (${product.quantity_available} → ${newQuantity})`,
      createdAt: adjustmentDate
    });

    await logAudit(req, 'stock_adjustment', 'product', product_id, {
      adjustment_type, quantity_adjusted: signedAdjustment, before: product.quantity_available, after: newQuantity, reason
    });

    const adjustment = await getRow('SELECT * FROM stock_adjustments WHERE id = ?', [result.id]);
    res.status(201).json(adjustment);
  } catch (error) {
    console.error('Stock adjustment error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// List stock adjustments
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { product_id, adjustment_type, start_date, end_date, page = 1, limit = 50 } = req.query;
    let query = `
      SELECT sa.*, p.product_name, p.product_id as product_code, p.unit, u.username as adjusted_by_name
      FROM stock_adjustments sa
      JOIN products p ON sa.product_id = p.id
      LEFT JOIN users u ON sa.adjusted_by = u.id
    `;
    const params = [];
    const conditions = [];

    if (product_id) { conditions.push('sa.product_id = ?'); params.push(product_id); }
    if (adjustment_type) { conditions.push('sa.adjustment_type = ?'); params.push(adjustment_type); }
    if (start_date) { conditions.push('DATE(sa.adjustment_date) >= ?'); params.push(start_date); }
    if (end_date) { conditions.push('DATE(sa.adjustment_date) <= ?'); params.push(end_date); }
    if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');
    query += ' ORDER BY sa.adjustment_date DESC';

    const result = await paginate(query, params, page, limit);
    res.json(result);
  } catch (error) {
    console.error('List adjustments error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Stock variance report (system vs physical count)
router.post('/variance-check', [
  authenticateToken,
  authorizeRole(['admin']),
  body('counts').isArray({ min: 1 }),
  body('counts.*.product_id').isInt({ min: 1 }),
  body('counts.*.physical_count').isFloat({ min: 0 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { counts } = req.body;
    const variances = [];

    for (const count of counts) {
      const product = await getRow('SELECT id, product_id, product_name, quantity_available, unit FROM products WHERE id = ?', [count.product_id]);
      if (!product) continue;

      const variance = count.physical_count - product.quantity_available;
      variances.push({
        product_id: product.id,
        product_code: product.product_id,
        product_name: product.product_name,
        unit: product.unit,
        system_quantity: product.quantity_available,
        physical_count: count.physical_count,
        variance,
        variance_percent: product.quantity_available > 0 ? ((variance / product.quantity_available) * 100).toFixed(2) : null
      });
    }

    res.json({
      variance_report: variances,
      summary: {
        total_items_checked: variances.length,
        items_with_variance: variances.filter(v => v.variance !== 0).length,
        total_shortage: variances.filter(v => v.variance < 0).reduce((sum, v) => sum + Math.abs(v.variance), 0),
        total_surplus: variances.filter(v => v.variance > 0).reduce((sum, v) => sum + v.variance, 0)
      }
    });
  } catch (error) {
    console.error('Variance check error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
