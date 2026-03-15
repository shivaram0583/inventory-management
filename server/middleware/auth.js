const jwt = require('jsonwebtoken');
const { getRow, runQuery } = require('../database/db');

const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded.sessionId) {
      return res.status(403).json({ message: 'Invalid token' });
    }

    const session = await getRow(
      `SELECT id, user_id,
              CAST((julianday('now') - julianday(last_activity)) * 86400 AS INTEGER) AS idle_seconds
       FROM sessions
       WHERE id = ?`,
      [decoded.sessionId]
    );

    if (!session) {
      return res.status(401).json({ message: 'Session expired' });
    }

    if (Number(session.idle_seconds) > 300) {
      await runQuery('DELETE FROM sessions WHERE id = ?', [decoded.sessionId]);
      return res.status(401).json({ message: 'Session expired' });
    }

    await runQuery('UPDATE sessions SET last_activity = CURRENT_TIMESTAMP WHERE id = ?', [decoded.sessionId]);

    const user = await getRow('SELECT id, username, role, is_active FROM users WHERE id = ?', [decoded.userId]);
    
    if (!user) {
      return res.status(401).json({ message: 'Invalid token' });
    }

    if (user.is_active === 0) {
      return res.status(403).json({ message: 'Account disabled' });
    }

    req.user = user;
    req.sessionId = decoded.sessionId;
    next();
  } catch (error) {
    return res.status(403).json({ message: 'Invalid token' });
  }
};

const authorizeRole = (roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }
    next();
  };
};

module.exports = {
  authenticateToken,
  authorizeRole
};
