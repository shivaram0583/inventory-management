const { getDailySetupStatus } = require('../services/dailySetup');

async function requireDailySetupForOperatorWrites(req, res, next) {
  try {
    if (req.user?.role !== 'operator') {
      return next();
    }

    const status = await getDailySetupStatus();
    if (status.isReady) {
      return next();
    }

    return res.status(403).json({
      message: status.blockingMessage || 'Operations are blocked until admin completes today\'s setup.',
      code: 'DAILY_SETUP_PENDING',
      dailySetupStatus: status
    });
  } catch (error) {
    console.error('Daily setup middleware error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
}

module.exports = {
  requireDailySetupForOperatorWrites
};
