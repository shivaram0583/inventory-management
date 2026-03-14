const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { getRow, runQuery, getAll } = require('../database/db');
const { authenticateToken, authorizeRole } = require('../middleware/auth');

const router = express.Router();

// Login route
router.post('/login', [
  body('username').notEmpty().withMessage('Username is required'),
  body('password').notEmpty().withMessage('Password is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { username, password } = req.body;

    const user = await getRow('SELECT * FROM users WHERE username = ?', [username]);
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    if (user.is_active === 0) {
      return res.status(403).json({ message: 'Account disabled' });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { userId: user.id, username: user.username, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get current user info
router.get('/me', authenticateToken, async (req, res) => {
  try {
    res.json({
      id: req.user.id,
      username: req.user.username,
      role: req.user.role,
      is_active: req.user.is_active
    });
  } catch (error) {
    return res.status(403).json({ message: 'Invalid token' });
  }
});

// Create user (admin only)
router.post('/users', [
  authenticateToken,
  authorizeRole(['admin']),
  body('username').isLength({ min: 3 }).withMessage('Username must be at least 3 characters'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('role').isIn(['admin', 'operator']).withMessage('Role must be admin or operator')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { username, password, role } = req.body;

    // Check if username already exists
    const existingUser = await getRow('SELECT id FROM users WHERE username = ?', [username]);
    if (existingUser) {
      return res.status(400).json({ message: 'Username already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await runQuery(
      'INSERT INTO users (username, password, role, is_active) VALUES (?, ?, ?, 1)',
      [username, hashedPassword, role]
    );

    res.status(201).json({
      id: result.id,
      username,
      role,
      message: 'User created successfully'
    });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get all users (admin only)
router.get('/users', [authenticateToken, authorizeRole(['admin'])], async (req, res) => {
  try {
    const users = await getAll('SELECT id, username, role, is_active, created_at FROM users ORDER BY created_at DESC');
    res.json(users);
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update user active status (admin only)
router.put('/users/:id/status', [
  authenticateToken,
  authorizeRole(['admin']),
  body('is_active').isIn([0, 1, true, false]).withMessage('is_active must be 0/1 or boolean')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const userId = Number(req.params.id);
    if (req.user.id === userId) {
      return res.status(400).json({ message: 'Cannot change your own status' });
    }

    const existing = await getRow('SELECT id FROM users WHERE id = ?', [userId]);
    if (!existing) {
      return res.status(404).json({ message: 'User not found' });
    }

    const isActive = req.body.is_active === true || req.body.is_active === 1 ? 1 : 0;
    await runQuery('UPDATE users SET is_active = ? WHERE id = ?', [isActive, userId]);
    const updated = await getRow('SELECT id, username, role, is_active, created_at FROM users WHERE id = ?', [userId]);
    res.json(updated);
  } catch (error) {
    console.error('Update user status error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete user (admin only)
router.delete('/users/:id', [authenticateToken, authorizeRole(['admin'])], async (req, res) => {
  try {
    const userId = Number(req.params.id);
    if (req.user.id === userId) {
      return res.status(400).json({ message: 'Cannot delete your own account' });
    }

    const existing = await getRow('SELECT id FROM users WHERE id = ?', [userId]);
    if (!existing) {
      return res.status(404).json({ message: 'User not found' });
    }

    await runQuery('DELETE FROM users WHERE id = ?', [userId]);
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
