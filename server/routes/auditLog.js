const express = require('express');
const { authenticateToken, authorizeRole } = require('../middleware/auth');
const { getAll, nowIST, paginate } = require('../database/db');
const { logAudit } = require('../middleware/auditLog');

const router = express.Router();

// Get audit log (admin only)
router.get('/', [authenticateToken, authorizeRole(['admin'])], async (req, res) => {
  try {
    const { entity_type, action, user_id, start_date, end_date, page = 1, limit = 50 } = req.query;
    let query = 'SELECT * FROM audit_log';
    const params = [];
    const conditions = [];

    if (entity_type) { conditions.push('entity_type = ?'); params.push(entity_type); }
    if (action) { conditions.push('action = ?'); params.push(action); }
    if (user_id) { conditions.push('user_id = ?'); params.push(user_id); }
    if (start_date) { conditions.push('DATE(created_at) >= ?'); params.push(start_date); }
    if (end_date) { conditions.push('DATE(created_at) <= ?'); params.push(end_date); }
    if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');
    query += ' ORDER BY created_at DESC';

    const result = await paginate(query, params, page, limit);
    res.json(result);
  } catch (error) {
    console.error('Audit log error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get audit log summary stats
router.get('/summary', [authenticateToken, authorizeRole(['admin'])], async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    let dateFilter = '';
    const params = [];
    if (start_date && end_date) {
      dateFilter = ' WHERE DATE(created_at) >= ? AND DATE(created_at) <= ?';
      params.push(start_date, end_date);
    }

    const byEntity = await getAll(`SELECT entity_type, COUNT(*) as count FROM audit_log${dateFilter} GROUP BY entity_type ORDER BY count DESC`, params);
    const byAction = await getAll(`SELECT action, COUNT(*) as count FROM audit_log${dateFilter} GROUP BY action ORDER BY count DESC`, params);
    const byUser = await getAll(`SELECT username, COUNT(*) as count FROM audit_log${dateFilter} GROUP BY username ORDER BY count DESC LIMIT 10`, params);

    res.json({ by_entity: byEntity, by_action: byAction, by_user: byUser });
  } catch (error) {
    console.error('Audit log summary error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
