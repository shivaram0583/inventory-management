const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticateToken } = require('../middleware/auth');
const { createGatewayOrder, getGatewayPublicConfig } = require('../services/paymentGateway');

const router = express.Router();

router.get('/config', authenticateToken, async (req, res) => {
  try {
    res.json(getGatewayPublicConfig());
  } catch (error) {
    console.error('Get payment config error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/create-order', [
  authenticateToken,
  body('amount').isFloat({ gt: 0 }).withMessage('Amount must be greater than zero')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const order = await createGatewayOrder({
      amount: req.body.amount,
      reference: req.body.reference,
      notes: {
        customer_name: req.body.customer_name || '',
        created_by: req.user.username || ''
      }
    });

    res.status(201).json(order);
  } catch (error) {
    console.error('Create payment order error:', error);
    res.status(400).json({ message: error.message || 'Failed to create payment order' });
  }
});

module.exports = router;