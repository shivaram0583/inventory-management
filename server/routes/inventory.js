const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticateToken, authorizeRole } = require('../middleware/auth');
const { getRow, runQuery, getAll, nowIST } = require('../database/db');

const router = express.Router();

// Get all products
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { category, search } = req.query;
    let query = 'SELECT * FROM products WHERE 1=1';
    const params = [];

    if (category && category !== 'all') {
      query += ' AND category = ?';
      params.push(category);
    }

    if (search) {
      query += ' AND (product_name LIKE ? OR variety LIKE ? OR product_id LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    query += ' ORDER BY created_at DESC';
    
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
  body('product_id').optional(),
  body('product_name').notEmpty().withMessage('Product name is required'),
  body('category').notEmpty().withMessage('Category is required'),
  body('unit').isIn(['kg', 'grams', 'packet', 'bag', 'liters', 'ml', 'pieces', 'bottles', 'tonnes']).withMessage('Invalid unit'),
  body('quantity_available').isFloat({ min: 0 }).withMessage('Quantity must be non-negative'),
  body('purchase_price').isFloat({ min: 0 }).withMessage('Purchase price must be non-negative'),
  body('selling_price').isFloat({ min: 0 }).withMessage('Selling price must be non-negative')
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
      supplier
    } = req.body;

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

    const result = await runQuery(
      `INSERT INTO products (product_id, category, product_name, variety, quantity_available, unit, purchase_price, selling_price, supplier)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [product_id, category, product_name, variety, quantity_available, unit, purchase_price, selling_price, supplier]
    );

    const newProduct = await getRow('SELECT * FROM products WHERE id = ?', [result.id]);

    // Record initial purchase if quantity > 0
    if (parseFloat(quantity_available) > 0) {
      const crypto = require('crypto');
      const purchaseId = 'PUR' + Date.now() + crypto.randomBytes(2).toString('hex').toUpperCase();
      await runQuery(
        `INSERT INTO purchases (purchase_id, product_id, quantity, price_per_unit, total_amount, supplier, added_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [purchaseId, newProduct.id, quantity_available, purchase_price, quantity_available * purchase_price, supplier || null, req.user.id]
      );
    }

    res.status(201).json(newProduct);
  } catch (error) {
    console.error('Add product error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update product (admin and operator)
router.put('/:id', [
  authenticateToken,
  authorizeRole(['admin', 'operator']),
  body('product_name').optional().notEmpty().withMessage('Product name cannot be empty'),
  body('unit').optional().isIn(['kg', 'grams', 'packet', 'bag', 'liters', 'ml', 'pieces', 'bottles', 'tonnes']).withMessage('Invalid unit'),
  body('quantity_available').optional().isFloat({ min: 0 }).withMessage('Quantity must be non-negative'),
  body('purchase_price').optional().isFloat({ min: 0 }).withMessage('Purchase price must be non-negative'),
  body('selling_price').optional().isFloat({ min: 0 }).withMessage('Selling price must be non-negative')
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

    const {
      product_name,
      variety,
      quantity_available,
      unit,
      purchase_price,
      selling_price,
      supplier
    } = req.body;

    const updateFields = [];
    const updateValues = [];

    if (product_name !== undefined) {
      updateFields.push('product_name = ?');
      updateValues.push(product_name);
    }
    if (variety !== undefined) {
      updateFields.push('variety = ?');
      updateValues.push(variety);
    }
    if (quantity_available !== undefined) {
      updateFields.push('quantity_available = ?');
      updateValues.push(quantity_available);
    }
    if (unit !== undefined) {
      updateFields.push('unit = ?');
      updateValues.push(unit);
    }
    if (purchase_price !== undefined) {
      updateFields.push('purchase_price = ?');
      updateValues.push(purchase_price);
    }
    if (selling_price !== undefined) {
      updateFields.push('selling_price = ?');
      updateValues.push(selling_price);
    }
    if (supplier !== undefined) {
      updateFields.push('supplier = ?');
      updateValues.push(supplier);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ message: 'No fields to update' });
    }

    updateFields.push('updated_at = ?');
    updateValues.push(nowIST());
    updateValues.push(productId);

    await runQuery(
      `UPDATE products SET ${updateFields.join(', ')} WHERE id = ?`,
      updateValues
    );

    const updatedProduct = await getRow('SELECT * FROM products WHERE id = ?', [productId]);
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
    const product = await getRow('SELECT id FROM products WHERE id = ?', [productId]);
    
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // Check if product has sales records
    const salesCount = await getRow('SELECT COUNT(*) as count FROM sales WHERE product_id = ?', [productId]);
    if (salesCount.count > 0) {
      return res.status(400).json({ message: 'Cannot delete product with sales records' });
    }

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
  body('quantity').isFloat({ min: 0.01 }).withMessage('Quantity must be positive')
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
      `INSERT INTO purchases (purchase_id, product_id, quantity, price_per_unit, total_amount, supplier, added_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [purchaseId, updatedProduct.id, quantity, updatedProduct.purchase_price, quantity * updatedProduct.purchase_price, updatedProduct.supplier || null, req.user.id]
    );

    res.json({
      message: `Added ${quantity} ${updatedProduct.unit} to stock`,
      product: updatedProduct
    });
  } catch (error) {
    console.error('Add stock error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get low stock items
router.get('/alerts/low-stock', authenticateToken, async (req, res) => {
  try {
    const products = await getAll(
      'SELECT * FROM products WHERE quantity_available <= 10 ORDER BY quantity_available ASC'
    );
    res.json(products);
  } catch (error) {
    console.error('Get low stock error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
