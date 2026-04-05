const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const inventoryRoutes = require('./routes/inventory');
const salesRoutes = require('./routes/sales');
const reportsRoutes = require('./routes/reports');
const dashboardRoutes = require('./routes/dashboard');
const purchasesRoutes = require('./routes/purchases');
const transactionsRoutes = require('./routes/transactions');
const notificationsRoutes = require('./routes/notifications');
const customersRoutes = require('./routes/customers');
const returnsRoutes = require('./routes/returns');
const quotationsRoutes = require('./routes/quotations');
const stockAdjustmentsRoutes = require('./routes/stockAdjustments');
const auditLogRoutes = require('./routes/auditLog');
const backupRoutes = require('./routes/backup');
const warehousesRoutes = require('./routes/warehouses');
const suppliersRoutes = require('./routes/suppliers');
const paymentsRoutes = require('./routes/payments');
const deliveryRoutes = require('./routes/delivery');
const pricingRoutes = require('./routes/pricing');
const publicPagesRoutes = require('./routes/publicPages');
const { startBackupScheduler, getAutomationStatus } = require('./services/backupScheduler');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
const corsOrigin = process.env.CORS_ORIGIN;
const allowedOrigins = corsOrigin
  ? corsOrigin.split(',').map((s) => s.trim()).filter(Boolean)
  : [];

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) {
      return callback(null, true);
    }

    if (allowedOrigins.length === 0) {
      return callback(null, true);
    }

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 204
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/purchases', purchasesRoutes);
app.use('/api/transactions', transactionsRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/customers', customersRoutes);
app.use('/api/returns', returnsRoutes);
app.use('/api/quotations', quotationsRoutes);
app.use('/api/stock-adjustments', stockAdjustmentsRoutes);
app.use('/api/audit-log', auditLogRoutes);
app.use('/api/backup', backupRoutes);
app.use('/api/warehouses', warehousesRoutes);
app.use('/api/suppliers', suppliersRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/delivery', deliveryRoutes);
app.use('/api/pricing', pricingRoutes);
app.use('/', publicPagesRoutes);

// Database initialization
const db = require('./database/db');
const backupAutomationStatus = startBackupScheduler();

app.get('/', (req, res) => {
  res.json({ message: 'Inventory Management System API is running' });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  if (backupAutomationStatus.enabled) {
    console.log(
      `Automated backups enabled every ${backupAutomationStatus.interval_hours} hour(s), retention ${backupAutomationStatus.retention_days} day(s)`
    );
  } else {
    console.log('Automated backups disabled');
  }
});
