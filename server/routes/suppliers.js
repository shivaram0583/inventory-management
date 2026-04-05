const express = require('express');
const { authenticateToken, authorizeRole } = require('../middleware/auth');
const { getRow, runQuery, getAll, nowIST } = require('../database/db');

const requireAdmin = authorizeRole(['admin']);

const router = express.Router();

// List all suppliers
router.get('/', authenticateToken, async (req, res) => {
  try {
    const suppliers = await getAll(
      `SELECT s.*, 
        (SELECT COUNT(*) FROM purchases p WHERE p.supplier = s.name) as total_orders,
        (SELECT COALESCE(SUM(p.total_amount), 0) FROM purchases p WHERE p.supplier = s.name) as total_spent
       FROM suppliers s
       ORDER BY s.name ASC`
    );
    res.json(suppliers);
  } catch (error) {
    console.error('List suppliers error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get supplier by ID
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const supplier = await getRow('SELECT * FROM suppliers WHERE id = ?', [req.params.id]);
    if (!supplier) return res.status(404).json({ message: 'Supplier not found' });

    const purchases = await getAll(
      `SELECT p.purchase_id, p.purchase_date, p.quantity, p.total_amount, p.purchase_status,
              pr.product_name, pr.variety
       FROM purchases p
       JOIN products pr ON p.product_id = pr.id
       WHERE p.supplier = ?
       ORDER BY p.purchase_date DESC
       LIMIT 20`,
      [supplier.name]
    );

    const payments = await getAll(
      `SELECT * FROM supplier_payments WHERE supplier_name = ? ORDER BY payment_date DESC LIMIT 20`,
      [supplier.name]
    );

    res.json({ ...supplier, purchases, payments });
  } catch (error) {
    console.error('Get supplier error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create supplier
router.post('/', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { name, contact_person, mobile, email, address, gstin } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Supplier name is required' });
    }

    const existing = await getRow('SELECT id FROM suppliers WHERE LOWER(name) = LOWER(?)', [name.trim()]);
    if (existing) {
      return res.status(409).json({ message: 'Supplier with this name already exists' });
    }

    const ts = nowIST();
    const result = await runQuery(
      `INSERT INTO suppliers (name, contact_person, mobile, email, address, gstin, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [name.trim(), contact_person || null, mobile || null, email || null, address || null, gstin || null, ts, ts]
    );

    res.status(201).json({ id: result.id, message: 'Supplier created' });
  } catch (error) {
    console.error('Create supplier error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update supplier
router.put('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const supplier = await getRow('SELECT * FROM suppliers WHERE id = ?', [req.params.id]);
    if (!supplier) return res.status(404).json({ message: 'Supplier not found' });

    const { name, contact_person, mobile, email, address, gstin } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Supplier name is required' });
    }

    const duplicate = await getRow('SELECT id FROM suppliers WHERE LOWER(name) = LOWER(?) AND id != ?', [name.trim(), req.params.id]);
    if (duplicate) {
      return res.status(409).json({ message: 'Another supplier with this name already exists' });
    }

    await runQuery(
      `UPDATE suppliers SET name = ?, contact_person = ?, mobile = ?, email = ?, address = ?, gstin = ?, updated_at = ? WHERE id = ?`,
      [name.trim(), contact_person || null, mobile || null, email || null, address || null, gstin || null, nowIST(), req.params.id]
    );

    res.json({ message: 'Supplier updated' });
  } catch (error) {
    console.error('Update supplier error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Toggle supplier active status
router.patch('/:id/toggle', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const supplier = await getRow('SELECT * FROM suppliers WHERE id = ?', [req.params.id]);
    if (!supplier) return res.status(404).json({ message: 'Supplier not found' });

    await runQuery(
      'UPDATE suppliers SET is_active = ?, updated_at = ? WHERE id = ?',
      [supplier.is_active ? 0 : 1, nowIST(), req.params.id]
    );

    res.json({ message: supplier.is_active ? 'Supplier deactivated' : 'Supplier activated' });
  } catch (error) {
    console.error('Toggle supplier error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
