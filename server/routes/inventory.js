const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticateToken, authorizeRole } = require('../middleware/auth');
const { requireDailySetupForOperatorWrites } = require('../middleware/dailySetup');
const { getRow, runQuery, getAll, nowIST, combineISTDateWithCurrentTime } = require('../database/db');
const { addReviewNotification } = require('../services/reviewNotifications');
const { createSupplierPaymentRecord } = require('../services/bankLedger');
const { resolveSupplier } = require('../services/supplierDirectory');
const { logAudit } = require('../middleware/auditLog');
const crypto = require('crypto');
const moment = require('moment');

const router = express.Router();

const PRODUCT_CREATION_MODE = {
  INVENTORY: 'inventory',
  ORDER: 'order'
};

const PURCHASE_STATUS = {
  ORDERED: 'ordered',
  DELIVERED: 'delivered'
};

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const createHttpError = (status, message) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

const parseAuditDetails = (details) => {
  if (!details) return {};
  if (typeof details === 'object') return details;

  try {
    return JSON.parse(details);
  } catch (error) {
    return {};
  }
};

const includesSearchTerm = (movement, searchTerm) => {
  if (!searchTerm) return true;

  const lowered = String(searchTerm).trim().toLowerCase();
  if (!lowered) return true;

  return [
    movement.product_code,
    movement.product_name,
    movement.variety,
    movement.reference_id,
    movement.event_type,
    movement.source_type,
    movement.description,
    movement.actor_name
  ].some((value) => String(value || '').toLowerCase().includes(lowered));
};

const toFlowNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

async function createAdvancePayment({
  supplierName,
  amount,
  bankAccountId,
  purchaseId,
  paymentDate,
  userId,
  eventTimestamp
}) {
  const result = await createSupplierPaymentRecord({
    supplierName,
    amount,
    paymentMode: 'bank',
    bankAccountId,
    description: `Advance payment for purchase ${purchaseId}`,
    paymentDate,
    userId,
    eventTimestamp
  });

  return result.id;
}

// Get all products
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { category, search } = req.query;
    let query = `
      SELECT p.*
      FROM products p
      WHERE COALESCE(p.is_deleted, 0) = 0
      AND NOT (
        COALESCE(p.quantity_available, 0) <= 0
        AND EXISTS (
          SELECT 1
          FROM purchases pur
          WHERE pur.product_id = p.id
            AND COALESCE(pur.purchase_status, 'delivered') = 'ordered'
        )
      )`;
    const params = [];

    if (category && category !== 'all') {
      query += ' AND p.category = ?';
      params.push(category);
    }

    if (search) {
      query += ' AND (p.product_name LIKE ? OR p.variety LIKE ? OR p.product_id LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    query += ' ORDER BY p.created_at DESC';
    
    const products = await getAll(query, params);
    res.json(products);
  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Generate next product ID based on category
router.get('/next-id', authenticateToken, async (req, res) => {
  try {
    const { category } = req.query;
    if (!category) return res.status(400).json({ message: 'Category is required' });

    const prefix = category.substring(0, 4).toUpperCase();
    const latest = await getRow(
      `SELECT product_id FROM products WHERE product_id LIKE ? ORDER BY product_id DESC LIMIT 1`,
      [`${prefix}%`]
    );

    let nextNum = 1;
    if (latest) {
      const match = latest.product_id.match(/(\d+)$/);
      if (match) nextNum = parseInt(match[1]) + 1;
    }

    const nextId = prefix + String(nextNum).padStart(3, '0');
    res.json({ nextId });
  } catch (error) {
    console.error('Generate next ID error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Inventory flow timeline
router.get('/flow', authenticateToken, async (req, res) => {
  try {
    const {
      product_id,
      category,
      event_type = 'all',
      search = '',
      start_date,
      end_date,
      page = 1,
      limit = 25
    } = req.query;

    const normalizedCategory = category && category !== 'all' ? String(category).trim() : null;
    const normalizedEventType = String(event_type || 'all').trim().toLowerCase();
    const safePage = Math.max(1, parseInt(page, 10) || 1);
    const safeLimit = Math.min(Math.max(1, parseInt(limit, 10) || 25), 100);

    const salesConditions = ['1 = 1'];
    const salesParams = [];
    if (product_id) {
      salesConditions.push('p.id = ?');
      salesParams.push(product_id);
    }
    if (normalizedCategory) {
      salesConditions.push('p.category = ?');
      salesParams.push(normalizedCategory);
    }
    if (start_date) {
      salesConditions.push('DATE(s.sale_date) >= ?');
      salesParams.push(start_date);
    }
    if (end_date) {
      salesConditions.push('DATE(s.sale_date) <= ?');
      salesParams.push(end_date);
    }

    const returnsConditions = ['1 = 1'];
    const returnsParams = [];
    if (product_id) {
      returnsConditions.push('p.id = ?');
      returnsParams.push(product_id);
    }
    if (normalizedCategory) {
      returnsConditions.push('p.category = ?');
      returnsParams.push(normalizedCategory);
    }
    if (start_date) {
      returnsConditions.push('DATE(sr.return_date) >= ?');
      returnsParams.push(start_date);
    }
    if (end_date) {
      returnsConditions.push('DATE(sr.return_date) <= ?');
      returnsParams.push(end_date);
    }

    const purchaseConditions = [
      `COALESCE(pur.purchase_status, '${PURCHASE_STATUS.DELIVERED}') = '${PURCHASE_STATUS.DELIVERED}'`,
      `NOT EXISTS (
         SELECT 1
         FROM audit_log al
         WHERE al.entity_type = 'purchase'
           AND al.entity_id = pur.purchase_id
           AND al.action IN ('partial_delivery', 'mark_delivered')
       )`
    ];
    const purchaseParams = [];
    if (product_id) {
      purchaseConditions.push('p.id = ?');
      purchaseParams.push(product_id);
    }
    if (normalizedCategory) {
      purchaseConditions.push('p.category = ?');
      purchaseParams.push(normalizedCategory);
    }
    if (start_date) {
      purchaseConditions.push('DATE(COALESCE(pur.delivery_date, pur.purchase_date, pur.created_at)) >= ?');
      purchaseParams.push(start_date);
    }
    if (end_date) {
      purchaseConditions.push('DATE(COALESCE(pur.delivery_date, pur.purchase_date, pur.created_at)) <= ?');
      purchaseParams.push(end_date);
    }

    const adjustmentConditions = ['1 = 1'];
    const adjustmentParams = [];
    if (product_id) {
      adjustmentConditions.push('p.id = ?');
      adjustmentParams.push(product_id);
    }
    if (normalizedCategory) {
      adjustmentConditions.push('p.category = ?');
      adjustmentParams.push(normalizedCategory);
    }
    if (start_date) {
      adjustmentConditions.push('DATE(sa.adjustment_date) >= ?');
      adjustmentParams.push(start_date);
    }
    if (end_date) {
      adjustmentConditions.push('DATE(sa.adjustment_date) <= ?');
      adjustmentParams.push(end_date);
    }

    const purchaseAuditConditions = [
      "al.entity_type = 'purchase'",
      "al.action IN ('partial_delivery', 'mark_delivered')"
    ];
    const purchaseAuditParams = [];
    if (product_id) {
      purchaseAuditConditions.push('pur.product_id = ?');
      purchaseAuditParams.push(product_id);
    }
    if (normalizedCategory) {
      purchaseAuditConditions.push('p.category = ?');
      purchaseAuditParams.push(normalizedCategory);
    }
    if (start_date) {
      purchaseAuditConditions.push('DATE(al.created_at) >= ?');
      purchaseAuditParams.push(start_date);
    }
    if (end_date) {
      purchaseAuditConditions.push('DATE(al.created_at) <= ?');
      purchaseAuditParams.push(end_date);
    }

    const deletionAuditConditions = ["al.entity_type = 'product'", "al.action = 'delete'"];
    const deletionAuditParams = [];
    if (start_date) {
      deletionAuditConditions.push('DATE(al.created_at) >= ?');
      deletionAuditParams.push(start_date);
    }
    if (end_date) {
      deletionAuditConditions.push('DATE(al.created_at) <= ?');
      deletionAuditParams.push(end_date);
    }

    const [salesRows, returnRows, purchaseRows, adjustmentRows, purchaseAuditRows, deletionAuditRows] = await Promise.all([
      getAll(
        `SELECT
           s.sale_id AS reference_id,
           s.sale_date AS event_date,
           s.quantity_sold,
           p.id AS inventory_product_id,
           p.product_id AS product_code,
           p.product_name,
           p.variety,
           p.category,
           p.unit,
           u.username AS actor_name,
           r.customer_name,
           r.payment_mode
         FROM sales s
         JOIN products p ON s.product_id = p.id
         LEFT JOIN users u ON s.operator_id = u.id
         LEFT JOIN receipts r ON r.sale_id = s.sale_id
         WHERE ${salesConditions.join(' AND ')}`,
        salesParams
      ),
      getAll(
        `SELECT
           sr.return_id AS reference_id,
           sr.return_date AS event_date,
           sr.quantity_returned,
           sr.refund_mode,
           sr.reason,
           p.id AS inventory_product_id,
           p.product_id AS product_code,
           p.product_name,
           p.variety,
           p.category,
           p.unit,
           u.username AS actor_name
         FROM sales_returns sr
         JOIN products p ON sr.product_id = p.id
         LEFT JOIN users u ON sr.returned_by = u.id
         WHERE ${returnsConditions.join(' AND ')}`,
        returnsParams
      ),
      getAll(
        `SELECT
           pur.purchase_id AS reference_id,
           COALESCE(pur.delivery_date, pur.purchase_date, pur.created_at) AS event_date,
           pur.quantity,
           pur.supplier,
           p.id AS inventory_product_id,
           p.product_id AS product_code,
           p.product_name,
           p.variety,
           p.category,
           p.unit,
           u.username AS actor_name
         FROM purchases pur
         LEFT JOIN products p ON pur.product_id = p.id
         LEFT JOIN users u ON pur.added_by = u.id
         WHERE ${purchaseConditions.join(' AND ')}`,
        purchaseParams
      ),
      getAll(
        `SELECT
           sa.id AS reference_id,
           sa.adjustment_date AS event_date,
           sa.adjustment_type,
           sa.quantity_adjusted,
           sa.reason,
           p.id AS inventory_product_id,
           p.product_id AS product_code,
           p.product_name,
           p.variety,
           p.category,
           p.unit,
           u.username AS actor_name
         FROM stock_adjustments sa
         JOIN products p ON sa.product_id = p.id
         LEFT JOIN users u ON sa.adjusted_by = u.id
         WHERE ${adjustmentConditions.join(' AND ')}`,
        adjustmentParams
      ),
      getAll(
        `SELECT
           al.*,
           p.id AS inventory_product_id,
           p.product_id AS product_code,
           p.product_name,
           p.variety,
           p.category,
           p.unit
         FROM audit_log al
         LEFT JOIN purchases pur ON pur.purchase_id = al.entity_id
         LEFT JOIN products p ON pur.product_id = p.id
         WHERE ${purchaseAuditConditions.join(' AND ')}`,
        purchaseAuditParams
      ),
      getAll(
        `SELECT al.*
         FROM audit_log al
         WHERE ${deletionAuditConditions.join(' AND ')}`,
        deletionAuditParams
      )
    ]);

    const salesMovements = salesRows.map((row) => ({
      event_type: 'sale',
      source_type: 'sale',
      quantity_change: -toFlowNumber(row.quantity_sold),
      quantity_moved: toFlowNumber(row.quantity_sold),
      event_date: row.event_date,
      reference_id: row.reference_id,
      inventory_product_id: row.inventory_product_id,
      product_code: row.product_code,
      product_name: row.product_name,
      variety: row.variety,
      category: row.category,
      unit: row.unit,
      actor_name: row.actor_name,
      description: row.customer_name
        ? `Sold to ${row.customer_name}${row.payment_mode ? ` via ${String(row.payment_mode).toUpperCase()}` : ''}`
        : `Inventory reduced by sale${row.payment_mode ? ` via ${String(row.payment_mode).toUpperCase()}` : ''}`
    }));

    const returnMovements = returnRows.map((row) => ({
      event_type: 'return',
      source_type: 'sales_return',
      quantity_change: toFlowNumber(row.quantity_returned),
      quantity_moved: toFlowNumber(row.quantity_returned),
      event_date: row.event_date,
      reference_id: row.reference_id,
      inventory_product_id: row.inventory_product_id,
      product_code: row.product_code,
      product_name: row.product_name,
      variety: row.variety,
      category: row.category,
      unit: row.unit,
      actor_name: row.actor_name,
      description: row.reason || `Returned to inventory via ${String(row.refund_mode || 'cash').toUpperCase()} refund`
    }));

    const purchaseMovements = purchaseRows.map((row) => ({
      event_type: 'purchase',
      source_type: 'purchase',
      quantity_change: toFlowNumber(row.quantity),
      quantity_moved: toFlowNumber(row.quantity),
      event_date: row.event_date,
      reference_id: row.reference_id,
      inventory_product_id: row.inventory_product_id,
      product_code: row.product_code,
      product_name: row.product_name,
      variety: row.variety,
      category: row.category,
      unit: row.unit,
      actor_name: row.actor_name,
      description: row.supplier
        ? `Stock received from ${row.supplier}`
        : 'Stock received into inventory'
    }));

    const adjustmentMovements = adjustmentRows.map((row) => ({
      event_type: String(row.adjustment_type || 'other').toLowerCase(),
      source_type: 'stock_adjustment',
      quantity_change: toFlowNumber(row.quantity_adjusted),
      quantity_moved: Math.abs(toFlowNumber(row.quantity_adjusted)),
      event_date: row.event_date,
      reference_id: `ADJ-${row.reference_id}`,
      inventory_product_id: row.inventory_product_id,
      product_code: row.product_code,
      product_name: row.product_name,
      variety: row.variety,
      category: row.category,
      unit: row.unit,
      actor_name: row.actor_name,
      description: row.reason || 'Stock adjusted'
    }));

    const purchaseAuditMovements = purchaseAuditRows
      .map((row) => {
        const details = parseAuditDetails(row.details);
        const deliveredQuantity = toFlowNumber(details.quantity_delivered);

        if (deliveredQuantity <= 0) {
          return null;
        }

        return {
          event_type: 'purchase',
          source_type: row.action === 'partial_delivery' ? 'partial_delivery' : 'purchase_delivery',
          quantity_change: deliveredQuantity,
          quantity_moved: deliveredQuantity,
          event_date: row.created_at,
          reference_id: row.entity_id,
          inventory_product_id: row.inventory_product_id,
          product_code: row.product_code,
          product_name: row.product_name,
          variety: row.variety,
          category: row.category,
          unit: row.unit,
          actor_name: row.username,
          description: row.action === 'partial_delivery'
            ? `Partial delivery recorded (${deliveredQuantity} received)`
            : `Pending purchase marked as delivered (${deliveredQuantity} received)`
        };
      })
      .filter(Boolean);

    const deletionMovements = deletionAuditRows
      .map((row) => {
        const details = parseAuditDetails(row.details);
        const previousQuantity = Math.abs(toFlowNumber(details.previous_quantity));

        if (product_id && String(details.product_id || '') !== String(product_id)) {
          return null;
        }

        if (normalizedCategory && String(details.category || '').toLowerCase() !== normalizedCategory.toLowerCase()) {
          return null;
        }

        return {
          event_type: 'deletion',
          source_type: details.deleted_mode === 'soft' ? 'soft_delete' : 'hard_delete',
          quantity_change: previousQuantity > 0 ? -previousQuantity : 0,
          quantity_moved: previousQuantity,
          event_date: row.created_at,
          reference_id: details.product_code || row.entity_id,
          inventory_product_id: details.product_id || null,
          product_code: details.product_code || row.entity_id,
          product_name: details.product_name || '[Deleted Product]',
          variety: details.variety || null,
          category: details.category || null,
          unit: details.unit || null,
          actor_name: row.username,
          description: details.deleted_mode === 'soft'
            ? 'Product removed from active inventory and stock reset to zero'
            : 'Product deleted from inventory'
        };
      })
      .filter(Boolean);

    let movements = [
      ...salesMovements,
      ...returnMovements,
      ...purchaseMovements,
      ...adjustmentMovements,
      ...purchaseAuditMovements,
      ...deletionMovements
    ];

    if (normalizedEventType && normalizedEventType !== 'all') {
      movements = movements.filter((movement) => movement.event_type === normalizedEventType);
    }

    movements = movements.filter((movement) => includesSearchTerm(movement, search));
    movements.sort((left, right) => String(right.event_date || '').localeCompare(String(left.event_date || '')));

    const total = movements.length;
    const offset = (safePage - 1) * safeLimit;
    const pagedMovements = movements.slice(offset, offset + safeLimit);

    const summary = movements.reduce((accumulator, movement) => {
      const quantityChange = toFlowNumber(movement.quantity_change);
      accumulator.total_events += 1;
      accumulator.net_quantity += quantityChange;

      if (quantityChange >= 0) {
        accumulator.inbound_quantity += quantityChange;
      } else {
        accumulator.outbound_quantity += Math.abs(quantityChange);
      }

      accumulator.event_breakdown[movement.event_type] = (accumulator.event_breakdown[movement.event_type] || 0) + 1;
      return accumulator;
    }, {
      total_events: 0,
      inbound_quantity: 0,
      outbound_quantity: 0,
      net_quantity: 0,
      event_breakdown: {}
    });

    res.json({
      data: pagedMovements,
      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages: Math.ceil(total / safeLimit)
      },
      summary
    });
  } catch (error) {
    console.error('Inventory flow error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get single product
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const product = await getRow('SELECT * FROM products WHERE id = ?', [req.params.id]);
    
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    res.json(product);
  } catch (error) {
    console.error('Get product error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Add new product (admin and operator)
router.post('/', [
  authenticateToken,
  authorizeRole(['admin', 'operator']),
  requireDailySetupForOperatorWrites,
  body('product_id').optional(),
  body('product_name').notEmpty().withMessage('Product name is required'),
  body('category').notEmpty().withMessage('Category is required'),
  body('unit').isIn(['kg', 'grams', 'packet', 'bag', 'liters', 'ml', 'pieces', 'bottles', 'tonnes']).withMessage('Invalid unit'),
  body('quantity_available').isInt({ min: 0 }).withMessage('Quantity must be a non-negative whole number'),
  body('purchase_price').isFloat({ min: 0 }).withMessage('Purchase price must be non-negative'),
  body('selling_price').isFloat({ min: 0 }).withMessage('Selling price must be non-negative'),
  body('creation_mode').optional().isIn(['inventory', 'order']).withMessage('Invalid creation mode'),
  body('order_quantity').optional().isInt({ min: 1 }).withMessage('Order quantity must be a positive whole number'),
  body('order_date').optional().trim(),
  body('advance_amount').optional().isFloat({ min: 0 }).withMessage('Advance amount must be non-negative'),
  body('bank_account_id').optional({ nullable: true }).isInt({ min: 1 }).withMessage('Invalid bank account'),
  body('gst_percent').optional().isFloat({ min: 0, max: 28 }).withMessage('GST must be 0-28%'),
  body('hsn_code').optional().isString(),
  body('reorder_point').optional().isFloat({ min: 0 }),
  body('reorder_quantity').optional().isFloat({ min: 0 }),
  body('barcode').optional().isString(),
  body('expiry_date').optional().isString(),
  body('batch_number').optional().isString(),
  body('manufacturing_date').optional().isString()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    let {
      product_id,
      category,
      product_name,
      variety,
      quantity_available,
      unit,
      purchase_price,
      selling_price,
      supplier,
      creation_mode,
      order_quantity,
      order_date,
      advance_amount,
      bank_account_id,
      gst_percent,
      hsn_code,
      reorder_point,
      reorder_quantity,
      barcode,
      expiry_date,
      batch_number,
      manufacturing_date
    } = req.body;

    const creationMode = creation_mode === PRODUCT_CREATION_MODE.ORDER
      ? PRODUCT_CREATION_MODE.ORDER
      : PRODUCT_CREATION_MODE.INVENTORY;
    const inventoryQuantity = creationMode === PRODUCT_CREATION_MODE.ORDER ? 0 : toNumber(quantity_available);
    const orderQuantity = creationMode === PRODUCT_CREATION_MODE.ORDER ? toNumber(order_quantity) : 0;
    const advanceAmount = creationMode === PRODUCT_CREATION_MODE.ORDER ? toNumber(advance_amount) : 0;
    const bankAccountId = bank_account_id ? Number(bank_account_id) : null;
    const supplierName = supplier ? String(supplier).trim() : '';

    if (creationMode === PRODUCT_CREATION_MODE.ORDER && orderQuantity <= 0) {
      return res.status(400).json({ message: 'Enter an order quantity for ordered products' });
    }

    if (creationMode === PRODUCT_CREATION_MODE.ORDER) {
      const orderTotal = orderQuantity * toNumber(purchase_price);
      if (advanceAmount > orderTotal) {
        return res.status(400).json({ message: 'Advance amount cannot exceed the total order amount' });
      }
      if (advanceAmount > 0 && !supplierName) {
        return res.status(400).json({ message: 'Supplier is required when paying an advance amount' });
      }
      if (advanceAmount > 0 && !bankAccountId) {
        return res.status(400).json({ message: 'Select a bank account for the advance payment' });
      }
    }

    // Validate category against product_categories table
    const validCategory = await getRow('SELECT id FROM product_categories WHERE name = ?', [category]);
    if (!validCategory) {
      return res.status(400).json({ message: `Invalid category: ${category}` });
    }

    // Auto-generate product_id if not provided
    if (!product_id || !product_id.trim()) {
      const prefix = category.substring(0, 4).toUpperCase();
      const latest = await getRow(
        `SELECT product_id FROM products WHERE product_id LIKE ? ORDER BY product_id DESC LIMIT 1`,
        [`${prefix}%`]
      );
      let nextNum = 1;
      if (latest) {
        const match = latest.product_id.match(/(\d+)$/);
        if (match) nextNum = parseInt(match[1]) + 1;
      }
      product_id = prefix + String(nextNum).padStart(3, '0');
    }

    // Check if product_id already exists
    const existingProduct = await getRow('SELECT id FROM products WHERE product_id = ?', [product_id]);
    if (existingProduct) {
      return res.status(400).json({ message: 'Product ID already exists' });
    }

    const eventTimestamp = nowIST();
    const supplierRecord = supplierName
      ? await resolveSupplier({ supplierName, createIfMissing: true, eventTimestamp })
      : null;
    const supplierId = supplierRecord?.id || null;
    const canonicalSupplierName = supplierRecord?.name || supplierName || null;
    let newProduct;
    let createdPurchase = null;

    await runQuery('BEGIN TRANSACTION');
    try {
      const result = await runQuery(
        `INSERT INTO products (product_id, category, product_name, variety, quantity_available, unit, purchase_price, selling_price, supplier, supplier_id, gst_percent, hsn_code, reorder_point, reorder_quantity, barcode, expiry_date, batch_number, manufacturing_date)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [product_id, category, product_name, variety, inventoryQuantity, unit, purchase_price, selling_price, canonicalSupplierName, supplierId,
         toNumber(gst_percent), hsn_code || null, toNumber(reorder_point) || 10, toNumber(reorder_quantity), barcode || null, expiry_date || null, batch_number || null, manufacturing_date || null]
      );

      newProduct = await getRow('SELECT * FROM products WHERE id = ?', [result.id]);

      if (creationMode === PRODUCT_CREATION_MODE.INVENTORY && inventoryQuantity > 0) {
        const purchaseId = 'PUR' + Date.now() + crypto.randomBytes(2).toString('hex').toUpperCase();
        const purchaseResult = await runQuery(
          `INSERT INTO purchases (
             purchase_id,
             product_id,
             quantity,
             price_per_unit,
             total_amount,
             supplier,
             supplier_id,
             purchase_date,
             delivery_date,
             purchase_status,
             advance_amount,
             added_by
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            purchaseId,
            newProduct.id,
            inventoryQuantity,
            toNumber(purchase_price),
            inventoryQuantity * toNumber(purchase_price),
            canonicalSupplierName,
            supplierId,
            eventTimestamp,
            eventTimestamp,
            PURCHASE_STATUS.DELIVERED,
            0,
            req.user.id
          ]
        );
        createdPurchase = await getRow('SELECT * FROM purchases WHERE id = ?', [purchaseResult.id]);
      }

      if (creationMode === PRODUCT_CREATION_MODE.ORDER) {
        const purchaseId = 'PUR' + moment().utcOffset('+05:30').format('YYYYMMDDHHmmss') +
          crypto.randomBytes(2).toString('hex').toUpperCase();
        const storedOrderDate = order_date && String(order_date).length === 10
          ? combineISTDateWithCurrentTime(order_date, eventTimestamp)
          : eventTimestamp;

        const purchaseResult = await runQuery(
          `INSERT INTO purchases (
             purchase_id,
             product_id,
             quantity,
             price_per_unit,
             total_amount,
             supplier,
             supplier_id,
             purchase_date,
             delivery_date,
             purchase_status,
             advance_amount,
             added_by
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            purchaseId,
            newProduct.id,
            orderQuantity,
            toNumber(purchase_price),
            orderQuantity * toNumber(purchase_price),
            canonicalSupplierName,
            supplierId,
            storedOrderDate,
            null,
            PURCHASE_STATUS.ORDERED,
            advanceAmount,
            req.user.id
          ]
        );

        if (advanceAmount > 0) {
          const advancePaymentId = await createAdvancePayment({
            supplierId,
            supplierName,
            amount: advanceAmount,
            bankAccountId,
            purchaseId,
            paymentDate: String(storedOrderDate).slice(0, 10),
            userId: req.user.id,
            eventTimestamp
          });

          await runQuery(
            'UPDATE purchases SET advance_payment_id = ? WHERE id = ?',
            [advancePaymentId, purchaseResult.id]
          );
        }

        createdPurchase = await getRow('SELECT * FROM purchases WHERE id = ?', [purchaseResult.id]);
      }

      await runQuery('COMMIT');
    } catch (transactionError) {
      try {
        await runQuery('ROLLBACK');
      } catch (rollbackError) {
        console.error('Rollback add product error:', rollbackError);
      }
      throw transactionError;
    }

    addReviewNotification({
      actorId: req.user.id,
      actorName: req.user.username,
      actorRole: req.user.role,
      type: 'inventory',
      title: creationMode === PRODUCT_CREATION_MODE.ORDER ? 'Added a new product and placed an order' : 'Added a new inventory item',
      description: creationMode === PRODUCT_CREATION_MODE.ORDER
        ? `${newProduct.product_name} (${newProduct.product_id}) was created and ordered for ${orderQuantity} ${newProduct.unit}.`
        : `${newProduct.product_name} (${newProduct.product_id}) was added under ${newProduct.category}.`,
      createdAt: eventTimestamp
    });

    res.status(201).json({
      ...newProduct,
      created_purchase: createdPurchase,
      creation_mode: creationMode
    });
  } catch (error) {
    console.error('Add product error:', error);
    res.status(error.status || 500).json({ message: error.message || 'Server error' });
  }
});

// Update product (admin and operator)
router.put('/:id', [
  authenticateToken,
  authorizeRole(['admin', 'operator']),
  requireDailySetupForOperatorWrites,
  body('selling_price').optional().isFloat({ min: 0 }).withMessage('Selling price must be non-negative'),
  body('gst_percent').optional().isFloat({ min: 0, max: 28 }),
  body('hsn_code').optional().isString(),
  body('reorder_point').optional().isFloat({ min: 0 }),
  body('reorder_quantity').optional().isFloat({ min: 0 }),
  body('barcode').optional().isString(),
  body('expiry_date').optional().isString(),
  body('batch_number').optional().isString(),
  body('manufacturing_date').optional().isString()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const productId = req.params.id;
    const product = await getRow('SELECT id FROM products WHERE id = ?', [productId]);
    
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    const updateFields = [];
    const updateValues = [];
    const { selling_price, gst_percent, hsn_code, reorder_point, reorder_quantity, barcode, expiry_date, batch_number, manufacturing_date } = req.body;

    if (selling_price !== undefined) { updateFields.push('selling_price = ?'); updateValues.push(selling_price); }
    if (gst_percent !== undefined) { updateFields.push('gst_percent = ?'); updateValues.push(gst_percent); }
    if (hsn_code !== undefined) { updateFields.push('hsn_code = ?'); updateValues.push(hsn_code); }
    if (reorder_point !== undefined) { updateFields.push('reorder_point = ?'); updateValues.push(reorder_point); }
    if (reorder_quantity !== undefined) { updateFields.push('reorder_quantity = ?'); updateValues.push(reorder_quantity); }
    if (barcode !== undefined) { updateFields.push('barcode = ?'); updateValues.push(barcode); }
    if (expiry_date !== undefined) { updateFields.push('expiry_date = ?'); updateValues.push(expiry_date || null); }
    if (batch_number !== undefined) { updateFields.push('batch_number = ?'); updateValues.push(batch_number || null); }
    if (manufacturing_date !== undefined) { updateFields.push('manufacturing_date = ?'); updateValues.push(manufacturing_date || null); }

    if (updateFields.length === 0) {
      return res.status(400).json({ message: 'No valid fields to update' });
    }

    updateFields.push('updated_at = ?');
    updateValues.push(nowIST());
    updateValues.push(productId);

    await runQuery(
      `UPDATE products SET ${updateFields.join(', ')} WHERE id = ?`,
      updateValues
    );

    const updatedProduct = await getRow('SELECT * FROM products WHERE id = ?', [productId]);

    addReviewNotification({
      actorId: req.user.id,
      actorName: req.user.username,
      actorRole: req.user.role,
      type: 'inventory',
      title: 'Updated an inventory item',
      description: `${updatedProduct.product_name} (${updatedProduct.product_id}) was updated.`,
      createdAt: nowIST()
    });

    res.json(updatedProduct);
  } catch (error) {
    console.error('Update product error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete product (admin only)
router.delete('/:id', [
  authenticateToken,
  authorizeRole(['admin'])
], async (req, res) => {
  try {
    const productId = req.params.id;
    const product = await getRow('SELECT * FROM products WHERE id = ?', [productId]);
    
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    const eventTimestamp = nowIST();

    // Check if product has sales records
    const salesCount = await getRow('SELECT COUNT(*) as count FROM sales WHERE product_id = ?', [productId]);
    if (salesCount.count > 0) {
      return res.status(400).json({ message: 'Cannot delete product with sales records' });
    }

    // Check if product has purchase history — soft-delete to preserve history
    const purchaseCount = await getRow('SELECT COUNT(*) as count FROM purchases WHERE product_id = ?', [productId]);
    const deleteAuditDetails = {
      product_id: product.id,
      product_code: product.product_id,
      product_name: product.product_name,
      variety: product.variety,
      category: product.category,
      unit: product.unit,
      previous_quantity: toFlowNumber(product.quantity_available)
    };

    if (purchaseCount.count > 0) {
      await runQuery('UPDATE products SET is_deleted = 1, quantity_available = 0, updated_at = ? WHERE id = ?', [eventTimestamp, productId]);
      await logAudit(req, 'delete', 'product', productId, {
        ...deleteAuditDetails,
        deleted_mode: 'soft',
        quantity_after: 0
      });
      return res.json({ message: 'Product removed from inventory. Purchase history preserved.' });
    }

    await logAudit(req, 'delete', 'product', productId, {
      ...deleteAuditDetails,
      deleted_mode: 'hard',
      quantity_after: null
    });
    await runQuery('DELETE FROM products WHERE id = ?', [productId]);
    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    console.error('Delete product error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Add stock (admin and operator)
router.post('/:id/add-stock', [
  authenticateToken,
  authorizeRole(['admin', 'operator']),
  requireDailySetupForOperatorWrites,
  body('quantity').isInt({ min: 1 }).withMessage('Quantity must be a positive whole number')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const productId = req.params.id;
    const { quantity } = req.body;

    const product = await getRow('SELECT id, quantity_available FROM products WHERE id = ?', [productId]);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    const newQuantity = product.quantity_available + quantity;
    await runQuery(
      'UPDATE products SET quantity_available = ?, updated_at = ? WHERE id = ?',
      [newQuantity, nowIST(), productId]
    );

    const updatedProduct = await getRow('SELECT * FROM products WHERE id = ?', [productId]);

    // Record purchase
    const crypto = require('crypto');
    const purchaseId = 'PUR' + Date.now() + crypto.randomBytes(2).toString('hex').toUpperCase();
    await runQuery(
      `INSERT INTO purchases (purchase_id, product_id, quantity, price_per_unit, total_amount, supplier, supplier_id, added_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        purchaseId,
        updatedProduct.id,
        quantity,
        updatedProduct.purchase_price,
        quantity * updatedProduct.purchase_price,
        updatedProduct.supplier || null,
        updatedProduct.supplier_id || null,
        req.user.id
      ]
    );

    addReviewNotification({
      actorId: req.user.id,
      actorName: req.user.username,
      actorRole: req.user.role,
      type: 'inventory',
      title: 'Added stock to inventory',
      description: `${quantity} ${updatedProduct.unit} was added to ${updatedProduct.product_name} (${updatedProduct.product_id}).`,
      createdAt: nowIST()
    });

    res.json({
      message: `Added ${quantity} ${updatedProduct.unit} to stock`,
      product: updatedProduct
    });
  } catch (error) {
    console.error('Add stock error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get low stock items (using configurable reorder_point per product)
router.get('/alerts/low-stock', authenticateToken, async (req, res) => {
  try {
    const products = await getAll(
      `SELECT p.*
       FROM products p
       WHERE p.quantity_available <= COALESCE(p.reorder_point, 10)
         AND COALESCE(p.is_deleted, 0) = 0
         AND NOT (
           COALESCE(p.quantity_available, 0) <= 0
           AND EXISTS (
             SELECT 1
             FROM purchases pur
             WHERE pur.product_id = p.id
               AND COALESCE(pur.purchase_status, 'delivered') = 'ordered'
           )
         )
       ORDER BY p.quantity_available ASC`
    );
    res.json(products);
  } catch (error) {
    console.error('Get low stock error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get expiring products
router.get('/alerts/expiring', authenticateToken, async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const products = await getAll(
      `SELECT * FROM products
       WHERE expiry_date IS NOT NULL
         AND DATE(expiry_date) <= DATE('now', '+' || ? || ' days')
         AND COALESCE(is_deleted, 0) = 0
       ORDER BY expiry_date ASC`,
      [parseInt(days)]
    );
    res.json(products);
  } catch (error) {
    console.error('Get expiring products error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
