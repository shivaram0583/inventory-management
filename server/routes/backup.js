const express = require('express');
const path = require('path');
const fs = require('fs');
const { authenticateToken, authorizeRole } = require('../middleware/auth');
const { logAudit } = require('../middleware/auditLog');
const {
  backupDir,
  dbPath,
  getBackupPath,
  createBackupSnapshot,
  listBackups,
  pruneOldBackups,
  getAutomationStatus
} = require('../services/backupScheduler');

const router = express.Router();

// Create database backup (admin only)
router.post('/create', [authenticateToken, authorizeRole(['admin'])], async (req, res) => {
  try {
    if (!fs.existsSync(dbPath)) {
      return res.status(404).json({ message: 'Database file not found' });
    }

    const backup = createBackupSnapshot({ reason: 'manual' });
    pruneOldBackups();

    await logAudit(req, 'backup_create', 'database', null, { filename: backup.filename });

    res.json({
      message: 'Backup created successfully',
      ...backup
    });
  } catch (error) {
    console.error('Backup create error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// List backups
router.get('/', [authenticateToken, authorizeRole(['admin'])], async (req, res) => {
  try {
    res.json(listBackups());
  } catch (error) {
    console.error('List backups error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/automation', [authenticateToken, authorizeRole(['admin'])], async (req, res) => {
  try {
    res.json(getAutomationStatus());
  } catch (error) {
    console.error('Backup automation status error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Download backup
router.get('/download/:filename', [authenticateToken, authorizeRole(['admin'])], (req, res) => {
  try {
    const { filename } = req.params;
    // Validate filename to prevent path traversal
    if (!filename.match(/^inventory_backup_[\w-]+\.db$/)) {
      return res.status(400).json({ message: 'Invalid filename' });
    }

    const backupPath = getBackupPath(filename);
    if (!fs.existsSync(backupPath)) {
      return res.status(404).json({ message: 'Backup not found' });
    }

    res.download(backupPath, filename);
  } catch (error) {
    console.error('Download backup error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete backup
router.delete('/:filename', [authenticateToken, authorizeRole(['admin'])], async (req, res) => {
  try {
    const { filename } = req.params;
    if (!filename.match(/^inventory_backup_[\w-]+\.db$/)) {
      return res.status(400).json({ message: 'Invalid filename' });
    }

    const backupPath = getBackupPath(filename);
    if (!fs.existsSync(backupPath)) {
      return res.status(404).json({ message: 'Backup not found' });
    }

    fs.unlinkSync(backupPath);
    await logAudit(req, 'backup_delete', 'database', null, { filename });
    res.json({ message: 'Backup deleted' });
  } catch (error) {
    console.error('Delete backup error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Restore backup (with safety confirmation)
router.post('/restore/:filename', [authenticateToken, authorizeRole(['admin'])], async (req, res) => {
  try {
    const { filename } = req.params;
    const { confirm } = req.body;

    if (confirm !== 'RESTORE') {
      return res.status(400).json({ message: 'Send { "confirm": "RESTORE" } to confirm database restoration' });
    }

    if (!filename.match(/^inventory_backup_[\w-]+\.db$/)) {
      return res.status(400).json({ message: 'Invalid filename' });
    }

    const backupPath = getBackupPath(filename);
    if (!fs.existsSync(backupPath)) {
      return res.status(404).json({ message: 'Backup not found' });
    }

    // Create safety backup of current DB first
    const safetyName = `pre_restore_safety_${Date.now()}.db`;
    fs.copyFileSync(dbPath, path.join(backupDir, safetyName));

    // Restore
    fs.copyFileSync(backupPath, dbPath);

    await logAudit(req, 'backup_restore', 'database', null, { restored_from: filename, safety_backup: safetyName });

    res.json({
      message: 'Database restored successfully. Server restart required for changes to take effect.',
      restored_from: filename,
      safety_backup: safetyName
    });
  } catch (error) {
    console.error('Restore backup error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
