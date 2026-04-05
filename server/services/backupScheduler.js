const fs = require('fs');
const path = require('path');

const dbPath = process.env.SQLITE_DB_PATH || path.join(__dirname, '..', 'database', 'inventory.db');
const backupDir = path.join(__dirname, '..', 'backups');
const automationEnabled = process.env.AUTO_BACKUP_ENABLED !== 'false';
const intervalHours = Math.max(1, Number(process.env.BACKUP_INTERVAL_HOURS) || 24);
const retentionDays = Math.max(1, Number(process.env.BACKUP_RETENTION_DAYS) || 14);

let schedulerHandle = null;
let lastRunAt = null;
let lastBackupFilename = null;
let lastError = null;
let nextRunAt = null;
let running = false;

function ensureBackupDirectory() {
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
}

function createBackupFilename(reason = 'manual') {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const prefix = reason === 'auto' ? 'inventory_backup_auto' : 'inventory_backup';
  return `${prefix}_${timestamp}.db`;
}

function getBackupPath(filename) {
  return path.join(backupDir, filename);
}

function getBackupMetadata(filename) {
  const filePath = getBackupPath(filename);
  const stat = fs.statSync(filePath);

  return {
    filename,
    size: stat.size,
    created_at: stat.mtime.toISOString(),
    is_automated: filename.startsWith('inventory_backup_auto_')
  };
}

function createBackupSnapshot(options = {}) {
  const { reason = 'manual' } = options;

  if (!fs.existsSync(dbPath)) {
    const error = new Error('Database file not found');
    error.code = 'DB_NOT_FOUND';
    throw error;
  }

  ensureBackupDirectory();

  const filename = createBackupFilename(reason);
  const backupPath = getBackupPath(filename);
  fs.copyFileSync(dbPath, backupPath);

  const metadata = getBackupMetadata(filename);
  lastRunAt = metadata.created_at;
  lastBackupFilename = metadata.filename;
  lastError = null;
  return metadata;
}

function listBackups() {
  ensureBackupDirectory();

  return fs.readdirSync(backupDir)
    .filter((file) => file.startsWith('inventory_backup_') && file.endsWith('.db'))
    .map((file) => getBackupMetadata(file))
    .sort((first, second) => new Date(second.created_at) - new Date(first.created_at));
}

function pruneOldBackups() {
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  const backups = listBackups();

  backups.forEach((backup) => {
    if (new Date(backup.created_at).getTime() < cutoff) {
      fs.unlinkSync(getBackupPath(backup.filename));
    }
  });
}

function getAutomationStatus() {
  return {
    enabled: automationEnabled,
    interval_hours: intervalHours,
    retention_days: retentionDays,
    running,
    next_run_at: nextRunAt,
    last_run_at: lastRunAt,
    last_backup_filename: lastBackupFilename,
    last_error: lastError
  };
}

function startBackupScheduler() {
  if (!automationEnabled || schedulerHandle) {
    return getAutomationStatus();
  }

  const intervalMs = intervalHours * 60 * 60 * 1000;
  nextRunAt = new Date(Date.now() + intervalMs).toISOString();

  schedulerHandle = setInterval(async () => {
    if (running) {
      return;
    }

    running = true;
    try {
      createBackupSnapshot({ reason: 'auto' });
      pruneOldBackups();
    } catch (error) {
      lastError = error.message;
      console.error('Automated backup failed:', error.message);
    } finally {
      running = false;
      nextRunAt = new Date(Date.now() + intervalMs).toISOString();
    }
  }, intervalMs);

  if (typeof schedulerHandle.unref === 'function') {
    schedulerHandle.unref();
  }

  return getAutomationStatus();
}

module.exports = {
  backupDir,
  dbPath,
  getBackupPath,
  createBackupSnapshot,
  listBackups,
  pruneOldBackups,
  getAutomationStatus,
  startBackupScheduler
};
