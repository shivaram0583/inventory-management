const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { runQuery, getRow, getAll, nowIST } = require('../database/db');
const { authenticateToken, authorizeRole } = require('../middleware/auth');

// GET all warehouses
router.get('/', authenticateToken, async (req, res) => {
  try {
    const warehouses = await getAll(
      `SELECT w.*, 
        (SELECT COUNT(DISTINCT ws.product_id) FROM warehouse_stock ws WHERE ws.warehouse_id = w.id AND ws.quantity > 0) as product_count,
        (SELECT COALESCE(SUM(ws.quantity), 0) FROM warehouse_stock ws WHERE ws.warehouse_id = w.id) as total_stock
       FROM warehouses w ORDER BY w.name`
    );
    res.json(warehouses);
  } catch (error) {
    console.error('Error fetching warehouses:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET single warehouse with stock detail
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const warehouse = await getRow('SELECT * FROM warehouses WHERE id = ?', [req.params.id]);
    if (!warehouse) return res.status(404).json({ message: 'Warehouse not found' });

    const stock = await getAll(
      `SELECT ws.*, p.product_name, p.variety, p.unit, p.category
       FROM warehouse_stock ws
       JOIN products p ON p.id = ws.product_id
       WHERE ws.warehouse_id = ? AND ws.quantity > 0
       ORDER BY p.product_name`,
      [req.params.id]
    );

    res.json({ ...warehouse, stock });
  } catch (error) {
    console.error('Error fetching warehouse detail:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST create warehouse
router.post('/', [
  authenticateToken,
  authorizeRole(['admin']),
  body('name').trim().notEmpty().withMessage('Warehouse name is required'),
  body('address').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { name, address } = req.body;
    const now = nowIST();

    const existing = await getRow('SELECT id FROM warehouses WHERE LOWER(name) = LOWER(?)', [name]);
    if (existing) return res.status(400).json({ message: 'Warehouse name already exists' });

    const result = await runQuery(
      'INSERT INTO warehouses (name, address, created_at, updated_at) VALUES (?, ?, ?, ?)',
      [name, address || null, now, now]
    );
    res.status(201).json({ id: result.lastID, name, address, message: 'Warehouse created' });
  } catch (error) {
    console.error('Error creating warehouse:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT update warehouse
router.put('/:id', [
  authenticateToken,
  authorizeRole(['admin']),
  body('name').optional().trim().notEmpty(),
  body('address').optional().trim(),
  body('is_active').optional().isIn([0, 1])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const warehouse = await getRow('SELECT * FROM warehouses WHERE id = ?', [req.params.id]);
    if (!warehouse) return res.status(404).json({ message: 'Warehouse not found' });

    const { name, address, is_active } = req.body;
    const now = nowIST();

    if (name && name.toLowerCase() !== warehouse.name.toLowerCase()) {
      const dup = await getRow('SELECT id FROM warehouses WHERE LOWER(name) = LOWER(?) AND id != ?', [name, req.params.id]);
      if (dup) return res.status(400).json({ message: 'Warehouse name already exists' });
    }

    await runQuery(
      'UPDATE warehouses SET name = ?, address = ?, is_active = ?, updated_at = ? WHERE id = ?',
      [name || warehouse.name, address !== undefined ? address : warehouse.address, is_active !== undefined ? is_active : warehouse.is_active, now, req.params.id]
    );

    res.json({ message: 'Warehouse updated' });
  } catch (error) {
    console.error('Error updating warehouse:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST assign stock to warehouse
router.post('/:id/stock', [
  authenticateToken,
  authorizeRole(['admin', 'operator']),
  body('product_id').isInt({ min: 1 }),
  body('quantity').isInt({ min: 0 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { product_id, quantity } = req.body;
    const now = nowIST();

    const warehouse = await getRow('SELECT * FROM warehouses WHERE id = ? AND is_active = 1', [req.params.id]);
    if (!warehouse) return res.status(404).json({ message: 'Warehouse not found or inactive' });

    const product = await getRow('SELECT * FROM products WHERE id = ?', [product_id]);
    if (!product) return res.status(404).json({ message: 'Product not found' });

    const existing = await getRow(
      'SELECT * FROM warehouse_stock WHERE warehouse_id = ? AND product_id = ?',
      [req.params.id, product_id]
    );

    if (existing) {
      await runQuery(
        'UPDATE warehouse_stock SET quantity = ?, updated_at = ? WHERE warehouse_id = ? AND product_id = ?',
        [quantity, now, req.params.id, product_id]
      );
    } else {
      await runQuery(
        'INSERT INTO warehouse_stock (warehouse_id, product_id, quantity, updated_at) VALUES (?, ?, ?, ?)',
        [req.params.id, product_id, quantity, now]
      );
    }

    res.json({ message: 'Stock updated' });
  } catch (error) {
    console.error('Error updating warehouse stock:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST transfer stock between warehouses
router.post('/transfer', [
  authenticateToken,
  authorizeRole(['admin', 'operator']),
  body('from_warehouse_id').isInt({ min: 1 }),
  body('to_warehouse_id').isInt({ min: 1 }),
  body('product_id').isInt({ min: 1 }),
  body('quantity').isInt({ min: 1 }),
  body('notes').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { from_warehouse_id, to_warehouse_id, product_id, quantity, notes } = req.body;

    if (from_warehouse_id === to_warehouse_id) {
      return res.status(400).json({ message: 'Source and destination warehouses must be different' });
    }

    const fromWarehouse = await getRow('SELECT * FROM warehouses WHERE id = ? AND is_active = 1', [from_warehouse_id]);
    if (!fromWarehouse) return res.status(404).json({ message: 'Source warehouse not found or inactive' });

    const toWarehouse = await getRow('SELECT * FROM warehouses WHERE id = ? AND is_active = 1', [to_warehouse_id]);
    if (!toWarehouse) return res.status(404).json({ message: 'Destination warehouse not found or inactive' });

    const fromStock = await getRow(
      'SELECT * FROM warehouse_stock WHERE warehouse_id = ? AND product_id = ?',
      [from_warehouse_id, product_id]
    );

    if (!fromStock || fromStock.quantity < quantity) {
      return res.status(400).json({ message: `Insufficient stock. Available: ${fromStock?.quantity || 0}` });
    }

    const now = nowIST();

    await runQuery('BEGIN TRANSACTION');
    try {
      // Decrease source
      await runQuery(
        'UPDATE warehouse_stock SET quantity = quantity - ?, updated_at = ? WHERE warehouse_id = ? AND product_id = ?',
        [quantity, now, from_warehouse_id, product_id]
      );

      // Increase destination
      const toStock = await getRow(
        'SELECT * FROM warehouse_stock WHERE warehouse_id = ? AND product_id = ?',
        [to_warehouse_id, product_id]
      );

      if (toStock) {
        await runQuery(
          'UPDATE warehouse_stock SET quantity = quantity + ?, updated_at = ? WHERE warehouse_id = ? AND product_id = ?',
          [quantity, now, to_warehouse_id, product_id]
        );
      } else {
        await runQuery(
          'INSERT INTO warehouse_stock (warehouse_id, product_id, quantity, updated_at) VALUES (?, ?, ?, ?)',
          [to_warehouse_id, product_id, quantity, now]
        );
      }

      // Record transfer
      await runQuery(
        'INSERT INTO warehouse_transfers (from_warehouse_id, to_warehouse_id, product_id, quantity, notes, transferred_by, transferred_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [from_warehouse_id, to_warehouse_id, product_id, quantity, notes || null, req.user.id, now]
      );

      await runQuery('COMMIT');
    } catch (txErr) {
      try { await runQuery('ROLLBACK'); } catch (e) { /* ignore */ }
      throw txErr;
    }

    res.json({ message: `Transferred ${quantity} units successfully` });
  } catch (error) {
    console.error('Error transferring stock:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET transfer history
router.get('/transfers/history', authenticateToken, async (req, res) => {
  try {
    const transfers = await getAll(
      `SELECT wt.*, 
        fw.name as from_warehouse_name, tw.name as to_warehouse_name,
        p.product_name, p.variety, p.unit,
        u.username as transferred_by_name
       FROM warehouse_transfers wt
       JOIN warehouses fw ON fw.id = wt.from_warehouse_id
       JOIN warehouses tw ON tw.id = wt.to_warehouse_id
       JOIN products p ON p.id = wt.product_id
       LEFT JOIN users u ON u.id = wt.transferred_by
       ORDER BY wt.transferred_at DESC
       LIMIT 200`
    );
    res.json(transfers);
  } catch (error) {
    console.error('Error fetching transfer history:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
