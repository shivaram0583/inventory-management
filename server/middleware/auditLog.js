const { runQuery, nowIST } = require('../database/db');

/**
 * Log an action to the audit_log table.
 */
async function logAudit(req, action, entityType, entityId, details) {
  try {
    const ip = req ? (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').toString().split(',')[0].trim() : null;
    await runQuery(
      `INSERT INTO audit_log (user_id, username, action, entity_type, entity_id, details, ip, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req?.user?.id || null,
        req?.user?.username || 'system',
        action,
        entityType,
        entityId ? String(entityId) : null,
        details ? (typeof details === 'string' ? details : JSON.stringify(details)) : null,
        ip,
        nowIST()
      ]
    );
  } catch (err) {
    console.error('Audit log error:', err.message);
  }
}

module.exports = { logAudit };
