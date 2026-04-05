const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { body, validationResult } = require('express-validator');
const { getRow, runQuery, getAll, nowIST } = require('../database/db');
const { authenticateToken, authorizeRole } = require('../middleware/auth');

const router = express.Router();

const STRONG_PASSWORD_MESSAGE = 'Password must be at least 8 characters and include uppercase, lowercase, number, and special character';

function validateStrongPassword(password) {
  const value = String(password || '');
  const isStrong = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/.test(value);
  if (!isStrong) {
    throw new Error(STRONG_PASSWORD_MESSAGE);
  }
  return true;
}

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

    const sessionId = crypto.randomUUID();
    await runQuery(
      'INSERT INTO sessions (id, user_id, last_activity) VALUES (?, ?, ?)',
      [sessionId, user.id, nowIST()]
    );

    const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString().split(',')[0].trim();
    const userAgent = (req.headers['user-agent'] || '').toString();
    
    await runQuery(
      'INSERT INTO login_logs (user_id, username, role, ip, user_agent, logged_in_at) VALUES (?, ?, ?, ?, ?, ?)',
      [user.id, user.username, user.role, ip, userAgent, nowIST()]
    );

    const token = jwt.sign(
      { userId: user.id, username: user.username, role: user.role, sessionId },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        force_password_change: !!user.force_password_change
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/logout', authenticateToken, async (req, res) => {
  try {
    if (req.sessionId) {
      await runQuery('DELETE FROM sessions WHERE id = ?', [req.sessionId]);
    }
    res.json({ message: 'Logged out' });
  } catch (error) {
    console.error('Logout error:', error);
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
      is_active: req.user.is_active,
      force_password_change: !!req.user.force_password_change
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
  body('password').custom(validateStrongPassword),
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
      'INSERT INTO users (username, password, role, is_active, force_password_change) VALUES (?, ?, ?, 1, 1)',
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

router.get('/login-logs', [authenticateToken, authorizeRole(['admin'])], async (req, res) => {
  try {
    const logs = await getAll(
      'SELECT id, user_id, username, role, ip, user_agent, logged_in_at FROM login_logs ORDER BY logged_in_at DESC LIMIT 10'
    );
    res.json(logs);
  } catch (error) {
    console.error('Get login logs error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Change own password
router.put('/change-password', [
  authenticateToken,
  body('current_password').notEmpty().withMessage('Current password is required'),
  body('new_password').custom(validateStrongPassword)
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { current_password, new_password } = req.body;
    const user = await getRow('SELECT * FROM users WHERE id = ?', [req.user.id]);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const isValid = await bcrypt.compare(current_password, user.password);
    if (!isValid) return res.status(401).json({ message: 'Current password is incorrect' });

    const isSamePassword = await bcrypt.compare(new_password, user.password);
    if (isSamePassword) {
      return res.status(400).json({ message: 'New password must be different from the current password' });
    }

    const hashedPassword = await bcrypt.hash(new_password, 10);
    await runQuery(
      'UPDATE users SET password = ?, force_password_change = 0, password_changed_at = ? WHERE id = ?',
      [hashedPassword, nowIST(), req.user.id]
    );

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Admin reset user password
router.put('/users/:id/reset-password', [
  authenticateToken,
  authorizeRole(['admin']),
  body('new_password').custom(validateStrongPassword)
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const userId = Number(req.params.id);
    const existing = await getRow('SELECT id, username FROM users WHERE id = ?', [userId]);
    if (!existing) return res.status(404).json({ message: 'User not found' });

    const hashedPassword = await bcrypt.hash(req.body.new_password, 10);
    await runQuery(
      'UPDATE users SET password = ?, force_password_change = 1, password_changed_at = NULL WHERE id = ?',
      [hashedPassword, userId]
    );

    res.json({ message: `Password for ${existing.username} has been reset` });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
