# Shri Lakshmi Vigneswara Traders — Inventory Management System

> **Business Contact:** +91 70369 53734 · dvvshivaram@gmail.com
> **Developed by:** dvvshivaram © 2026

A full-stack web application for managing inventory, sales, purchases, supplier relations, banking, quotations, customer accounts, warehouse operations, and business analytics for an agricultural inputs trading business (seeds, fertilizers, pesticides & tools).

---

## Table of Contents

1. [Tech Stack](#tech-stack)
2. [Project Structure](#project-structure)
3. [High-Level Design (HLD)](#high-level-design-hld)
4. [Database Schema](#database-schema)
5. [API Reference](#api-reference)
6. [Frontend Guide](#frontend-guide)
7. [Core Business Workflows](#core-business-workflows)
8. [Setup & Installation](#setup--installation)
9. [Database Workflows](#database-workflows)
10. [Environment Variables](#environment-variables)
11. [Default Credentials](#default-credentials)
12. [Feature Guide](#feature-guide)
13. [Security Design](#security-design)
14. [Testing](#testing)
15. [Deployment](#deployment)

---

## Tech Stack

### Backend (`server/`)

| Dependency | Version | Purpose |
|---|---|---|
| Node.js + Express | ^4.18.2 | HTTP server & routing |
| SQLite3 | ^5.1.6 | Embedded relational database (34 tables) |
| jsonwebtoken | ^9.0.2 | JWT token generation & verification |
| bcryptjs | ^2.4.3 | Password hashing (10 salt rounds) |
| express-validator | ^7.0.1 | Request body validation |
| moment | ^2.29.4 | Date/time formatting (IST UTC+5:30) |
| dotenv | ^16.3.1 | Environment variable loading |
| cors | ^2.8.5 | Configurable cross-origin handling |
| nodemailer | ^8.0.4 | SMTP email delivery for quotations & receipts |
| qrcode | ^1.5.4 | Receipt QR code generation |
| nodemon | ^3.0.1 | Dev auto-restart |
| jest + supertest | — | API integration testing |

### Frontend (`client/`)

| Dependency | Version | Purpose |
|---|---|---|
| React | ^18.2.0 | UI framework (CRA) |
| React Router DOM | ^6.8.1 | Client-side SPA routing |
| Axios | ^1.3.4 | HTTP client with interceptors |
| Tailwind CSS | ^3.2.7 | Utility-first styling |
| Lucide React | ^0.263.1 | SVG icon library |
| Recharts | ^3.8.0 | Charts & data visualisation |
| react-to-print | ^2.14.7 | Browser print for receipts & bank statements |

---

## Project Structure

```
inventory-management/
├── package.json                     # Root scripts (dev, build, clean-db, seed)
├── LLD.md                           # Low-Level Design document
├── TEST_STRATEGY.md                 # Test strategy document
├── SLVT_Inventory_API.postman_collection.json
├── netlify.toml / railway.toml / render.yaml   # Deployment configs
│
├── client/
│   ├── package.json
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   ├── public/
│   │   ├── index.html
│   │   └── _redirects                # SPA routing for Netlify
│   ├── build/                        # Production build output
│   └── src/
│       ├── App.js                    # Routes, guards (ProtectedRoute/AdminRoute/PasswordChangeRoute)
│       ├── index.js                  # CRA entry point
│       ├── index.css                 # Tailwind layers, custom classes, animations
│       ├── contexts/
│       │   └── AuthContext.js        # JWT auth, idle timeout, daily setup polling, session management
│       ├── hooks/
│       │   └── useSortableData.js    # Multi-column table sort hook
│       ├── utils/
│       │   ├── dateUtils.js          # IST formatters, financial year helpers
│       │   ├── csvExport.js          # BOM-prefixed CSV download
│       │   ├── pdfExport.js          # HTML table → print dialog
│       │   └── productCreation.js    # Product form validation & payload builder
│       └── components/
│           ├── Login.js              # Animated login page
│           ├── ForcePasswordChange.js # Mandatory password change
│           ├── Layout.js             # Sidebar nav, notifications, DailySetupGate, footer
│           ├── Dashboard.js          # Role-specific KPI dashboard with live clock
│           ├── Inventory.js          # Product CRUD, stock, pricing rules
│           ├── InventoryFlowPanel.js # Stock movement timeline
│           ├── Sales.js              # POS cart, dynamic pricing, customer lookup
│           ├── SalesRecordsPanel.js  # Sales history with metrics
│           ├── Purchases.js          # Purchase recording, history, suppliers, categories
│           ├── Suppliers.js          # Supplier directory, returns, balance tracking
│           ├── Transactions.js       # Banking, expenditures, supplier payments, daily summary
│           ├── Returns.js            # Customer sales returns
│           ├── Customers.js          # Customer directory, payments, customer pricing
│           ├── Quotations.js         # Quotation lifecycle, email, convert to sale
│           ├── StockAdjustments.js   # Stock corrections (damage/theft/spoilage/counting)
│           ├── Warehouses.js         # Multi-warehouse stock & transfers
│           ├── Receipt.js            # Printable receipt with QR, email delivery
│           ├── Reports.js            # 12 report tabs with charts
│           ├── ReportDownloader.js   # CSV/PDF export for all reports
│           ├── Users.js              # User management, login history (admin)
│           ├── AuditLog.js           # Audit trail viewer (admin)
│           ├── Backup.js             # DB backup/restore (admin)
│           └── shared/
│               ├── Modal.js          # Portal-rendered modal with theme variants
│               ├── CustomSelect.js   # Styled dropdown with portal
│               ├── DailySetupGate.js # Daily bank selection + balance review gate
│               └── SortableHeader.js # Sortable table column header
│
└── server/
    ├── index.js                      # Express app, 19 route mounts, CORS, backup scheduler
    ├── Dockerfile
    ├── package.json
    ├── seed.js                       # Demo data seeder
    ├── database/
    │   └── db.js                     # SQLite init, 34 tables, migrations, helpers
    ├── middleware/
    │   ├── auth.js                   # JWT verify, session idle (5min), role gate
    │   ├── auditLog.js               # logAudit() — writes to audit_log table
    │   └── dailySetup.js             # requireDailySetupForOperatorWrites
    ├── routes/
    │   ├── auth.js                   # /api/auth — login, users, passwords (10 endpoints)
    │   ├── inventory.js              # /api/inventory — products, stock, alerts (9 endpoints)
    │   ├── sales.js                  # /api/sales — POS, receipts (8 endpoints)
    │   ├── purchases.js              # /api/purchases — orders, delivery, categories (12 endpoints)
    │   ├── suppliers.js              # /api/suppliers — directory, returns (6 endpoints)
    │   ├── transactions.js           # /api/transactions — banking, payments (18 endpoints)
    │   ├── returns.js                # /api/returns — customer returns (3 endpoints)
    │   ├── customers.js              # /api/customers — directory, payments, ledger (8 endpoints)
    │   ├── quotations.js             # /api/quotations — quotes, convert (7 endpoints)
    │   ├── stockAdjustments.js       # /api/stock-adjustments — corrections (3 endpoints)
    │   ├── reports.js                # /api/reports — analytics (16 endpoints)
    │   ├── dashboard.js              # /api/dashboard — role dashboards (3 endpoints)
    │   ├── warehouses.js             # /api/warehouses — multi-warehouse (7 endpoints)
    │   ├── notifications.js          # /api/notifications — admin alerts (5 endpoints)
    │   ├── auditLog.js               # /api/audit-log — audit viewer (2 endpoints)
    │   ├── backup.js                 # /api/backup — backup/restore (6 endpoints)
    │   ├── delivery.js               # /api/delivery — email delivery (3 endpoints)
    │   ├── pricing.js                # /api/pricing — dynamic pricing rules (5 endpoints)
    │   └── publicPages.js            # / — public receipt/quotation pages (2 endpoints)
    ├── services/
    │   ├── purchaseLotLedger.js      # FIFO lot tracking, allocation, reversal, supplier return
    │   ├── bankLedger.js             # Bank balance management for supplier payments
    │   ├── pricing.js                # Dynamic pricing resolution engine
    │   ├── supplierDirectory.js      # Auto-create suppliers, FK sync, rename propagation
    │   ├── supplierFinancials.js     # Supplier balance calculation
    │   ├── dailySetup.js             # Daily bank setup status + balance snapshots
    │   ├── communications.js         # SMTP email, link builders
    │   ├── backupScheduler.js        # Automated SQLite backup with retention
    │   └── reviewNotifications.js    # Hybrid in-memory + DB notification system
    ├── scripts/
    │   └── clean-db.js               # Database reset utility
    ├── backups/                      # Auto/manual backup files
    └── tests/
        ├── setup/
        │   ├── testDb.js             # In-memory SQLite for tests
        │   └── testHelpers.js        # Auth helpers, factories
        ├── auth.test.js
        ├── customers.test.js
        ├── dailySetup.test.js
        ├── dashboard.test.js
        ├── e2e.test.js
        ├── inventory.test.js
        ├── notifications.test.js
        ├── pricing.test.js
        ├── purchases.test.js
        ├── reports.test.js
        ├── returns.test.js
        ├── sales.test.js
        ├── stockAdjustments.test.js
        ├── suppliers.test.js
        └── transactions.test.js
```

---

## High-Level Design (HLD)

### System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Browser (Client)                                │
│   React 18 SPA · React Router v6 · Tailwind CSS · Recharts             │
│                                                                         │
│   Dashboard  Inventory  Sales  Purchases  Suppliers  Transactions       │
│   Returns  Customers  Quotations  Reports  Warehouses  Users            │
│                                                                         │
│   AuthContext (JWT + idle timeout) · DailySetupGate · Axios             │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │  REST / JSON
                                │  Authorization: Bearer <JWT>
┌───────────────────────────────▼─────────────────────────────────────────┐
│                 Express.js API Server (port 5000)                       │
│                                                                         │
│   ┌──────────────────── Middleware Pipeline ─────────────────────────┐  │
│   │ CORS → JSON → authenticateToken → authorizeRole                 │  │
│   │ → requireDailySetupForOperatorWrites → express-validator        │  │
│   └─────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│   19 Route Modules · 9 Service Modules · 3 Middleware · ~131 Endpoints  │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │  sqlite3 driver
┌───────────────────────────────▼─────────────────────────────────────────┐
│                    SQLite Database (inventory.db)                        │
│                                                                         │
│   34 Tables · FIFO lot tracking · IST timestamps · Foreign keys ON      │
│                                                                         │
│   Core:     users · products · product_categories · sessions · logs     │
│   Sales:    sales · receipts · customer_sales · sale_allocations        │
│   Purchase: purchases · purchase_lots                                   │
│   Supplier: suppliers · supplier_payments · supplier_returns/items      │
│   Customer: customers · customer_payments · sales_returns               │
│   Pricing:  price_tiers · product_promotions · customer_pricing         │
│   Banking:  bank_accounts · bank_transfers · expenditures               │
│             daily_operation_setup                                        │
│   Warehouse: warehouses · warehouse_stock · warehouse_transfers         │
│   Quotes:   quotations · quotation_items                                │
│   Ops:      stock_adjustments · audit_log · notifications               │
│   System:   app_migrations                                              │
└─────────────────────────────────────────────────────────────────────────┘
```

### Key Design Decisions

| Decision | Rationale |
|---|---|
| **SQLite** | Zero-config embedded DB for single-node small-business deployment |
| **IST timestamps** | All business timestamps stored as IST strings via `nowIST()`; display matches storage |
| **Session + JWT dual auth** | JWT carries identity; DB `sessions` table enables 5-min idle timeout and instant logout |
| **Two roles only** | `admin` (full access) and `operator` (daily-setup-gated writes, no admin functions) |
| **FIFO lot tracking** | `purchase_lots` + `sale_allocations` enable per-lot P&L, supplier returns, and stock traceability |
| **Dynamic pricing** | 4-tier priority: customer-specific > promotion > quantity tier > base price |
| **Daily setup gate** | Admin must select a bank each day before operators can create sales/purchases |
| **Monorepo** | Client + server share one Git repo; root scripts run both concurrently |

---

## Database Schema

> **34 tables** — full column-level schema documented in [LLD.md](LLD.md#4-database-design)

### Overview by Domain

| Domain | Tables |
|---|---|
| **Core** | `users`, `products`, `product_categories`, `sessions`, `login_logs` |
| **Sales** | `sales`, `receipts`, `customer_sales`, `sale_allocations` |
| **Purchases** | `purchases`, `purchase_lots` |
| **Suppliers** | `suppliers`, `supplier_payments`, `supplier_returns`, `supplier_return_items` |
| **Customers** | `customers`, `customer_payments`, `sales_returns` |
| **Pricing** | `price_tiers`, `product_promotions`, `customer_pricing` |
| **Banking** | `bank_accounts`, `bank_transfers`, `expenditures`, `daily_operation_setup` |
| **Warehouses** | `warehouses`, `warehouse_stock`, `warehouse_transfers` |
| **Quotations** | `quotations`, `quotation_items` |
| **Operations** | `stock_adjustments`, `audit_log`, `notifications` |
| **System** | `app_migrations` |

### Key Relationships

- **Sales → Lots (FIFO):** `sale_allocations` links each sale line item to specific `purchase_lots`, enabling per-lot cost tracking and accurate P&L
- **Supplier Balance:** `received_value (purchase_lots) − returned_value (supplier_return_items) − paid (supplier_payments)`
- **Customer Balance:** `outstanding_balance` on `customers` table, updated on credit sales and payment collection
- **Bank Ledger:** `bank_transfers` tracks all deposits/withdrawals with `source_type` linking to originating transaction

### Database Helpers (exported from `db.js`)

| Function | Returns |
|---|---|
| `runQuery(sql, params)` | `{ id, changes }` |
| `getRow(sql, params)` | Single row or `undefined` |
| `getAll(sql, params)` | Array of rows |
| `runTransaction(callback)` | Executes callback in BEGIN/COMMIT with auto-rollback |
| `paginate(sql, params, page, limit)` | `{ data, pagination: { page, limit, total, totalPages } }` |
| `nowIST()` | Current IST timestamp `YYYY-MM-DD HH:mm:ss` |

---

## API Reference

> All endpoints except login and public pages require: `Authorization: Bearer <JWT_TOKEN>`
>
> Detailed request/response shapes for every endpoint are in [LLD.md](LLD.md#5-backend-module-design)

### Auth — `/api/auth` (10 endpoints)

| Method | Path | Role | Description |
|---|---|---|---|
| POST | `/login` | Public | Login → JWT + user object (includes `force_password_change`) |
| POST | `/logout` | Any | Invalidate session |
| GET | `/me` | Any | Current user info |
| PUT | `/change-password` | Any | Change own password (validates strength, clears force flag) |
| PUT | `/users/:id/reset-password` | Admin | Reset user password (re-enables force flag) |
| POST | `/users` | Admin | Create user (strong password: 8+ chars, upper, lower, digit, special) |
| GET | `/users` | Admin | List all users |
| PUT | `/users/:id/status` | Admin | Enable/disable user (cannot toggle self) |
| DELETE | `/users/:id` | Admin | Delete user (cannot delete self) |
| GET | `/login-logs` | Admin | Last 10 login audit entries |

### Inventory — `/api/inventory` (9 endpoints)

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/` | Any | All products (`?category=&search=`). Excludes soft-deleted and order-only |
| GET | `/next-id` | Any | Auto-generate next product ID → `?category=seeds` → `{ nextId: "SD005" }` |
| GET | `/flow` | Any | Inventory flow timeline with filters (type, category, date range, pagination) |
| GET | `/:id` | Any | Single product with purchase and sale history |
| POST | `/` | Admin/Op | Create product (auto-ID, supports inventory or order creation mode) |
| PUT | `/:id` | Admin/Op | Update product fields (selling price, GST, HSN, reorder, barcode, expiry, batch) |
| DELETE | `/:id` | Admin | Soft-delete if has purchases; hard-delete otherwise |
| POST | `/:id/add-stock` | Admin/Op | Add stock (creates purchase record + lot sync) |
| GET | `/alerts/low-stock` | Any | Products at/below reorder_point |
| GET | `/alerts/expiring` | Any | Products expiring within `?days=30` |

### Sales — `/api/sales` (8 endpoints)

| Method | Path | Role | Description |
|---|---|---|---|
| POST | `/` | Any | Create multi-item sale (FIFO lot allocation, receipt, bank auto-deposit) |
| GET | `/` | Any | List sales with pagination (`?start_date&end_date&page&limit`) |
| GET | `/summary` | Any | Receipt-level summary with search, totals, pagination |
| GET | `/archive` | Any | Customer sales archive |
| GET | `/:saleId` | Any | Sale detail: items, receipt, returns, QR |
| GET | `/receipts/verify/:receiptNumber` | Public | Receipt verification (redirect or JSON) |
| GET | `/receipts/all` | Any | All receipts |
| PUT | `/receipts/:id/print` | Any | Mark receipt as printed |

### Purchases — `/api/purchases` (12 endpoints)

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/` | Any | List purchases (`?start_date&end_date&product_id&status&page&limit`) |
| POST | `/` | Admin/Op | Record purchase (delivered or ordered, with optional advance payment) |
| PUT | `/:id` | Admin/Op | Edit purchase (adjusts stock by qty diff, syncs lot) |
| POST | `/:id/mark-delivered` | Admin/Op | Mark pending order as fully delivered |
| POST | `/:id/partial-delivery` | Admin/Op | Partial delivery with lot sync |
| POST | `/:id/cancel` | Admin | Cancel pending order + reverse advance payment |
| GET | `/categories` | Any | List product categories |
| POST | `/categories` | Admin/Op | Add category |
| DELETE | `/categories/:id` | Admin | Delete category (blocked if products use it) |
| GET | `/suppliers` | Any | Supplier summary (purchases, paid, balance_due) |
| GET | `/suppliers/:name` | Any | Supplier detail (lots, returns, payments, purchases) |
| DELETE | `/suppliers/:name` | Admin | Delete supplier + reverse bank effects |

### Suppliers — `/api/suppliers` (6 endpoints)

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/` | Any | Supplier directory with aggregated stats |
| GET | `/:id` | Any | Supplier detail: summary, purchases, payments, lots, returns |
| POST | `/` | Admin | Create supplier master record |
| PUT | `/:id` | Admin | Update supplier (renames references across all tables) |
| PATCH | `/:id/toggle` | Admin | Toggle active/inactive |
| POST | `/:id/returns` | Admin/Op | Record lot-level supplier return |

### Transactions — `/api/transactions` (18 endpoints)

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/bank-accounts` | Any | Active bank accounts |
| GET | `/bank-accounts/:id/statement` | Any | Bank statement with running balance |
| POST | `/bank-accounts` | Admin | Create bank account |
| PUT | `/bank-accounts/:id` | Admin | Update bank account |
| DELETE | `/bank-accounts/:id` | Admin | Soft-deactivate bank account |
| GET | `/daily-setup/status` | Any | Daily setup status (isReady, blocking reason) |
| POST | `/daily-setup/select-bank` | Admin | Select today's operating bank |
| POST | `/daily-setup/review-balance` | Admin | Review + snapshot opening/closing balances |
| GET | `/expenditures` | Any | List expenditures |
| POST | `/expenditures` | Admin/Op | Create expenditure (category: general/renovation/utilities/transport/salary/maintenance/other) |
| DELETE | `/expenditures/:id` | Admin | Delete expenditure |
| GET | `/bank-transfers` | Any | Bank transfer ledger |
| POST | `/bank-transfers` | Admin | Deposit/withdrawal (purpose: cash_registry/business_expense/personal) |
| DELETE | `/bank-transfers/:id` | Admin | Delete transfer + reverse balance |
| GET | `/supplier-payments` | Any | Supplier payment ledger |
| POST | `/supplier-payments` | Admin | Record supplier payment (auto bank ledger entry) |
| DELETE | `/supplier-payments/:id` | Admin | Delete + reverse bank effect |
| GET | `/supplier-balances` | Any | Supplier settlement view |
| GET | `/daily-summary` | Any | Daily cash-book with opening/closing balance |

### Returns — `/api/returns` (3 endpoints)

| Method | Path | Role | Description |
|---|---|---|---|
| POST | `/` | Any | Create multi-item sales return (refund: cash/credit/bank, FIFO lot reversal) |
| GET | `/` | Any | Paginated return list |
| GET | `/:returnId` | Any | Return detail |

### Customers — `/api/customers` (8 endpoints)

| Method | Path | Role | Description |
|---|---|---|---|
| POST | `/` | Any | Create customer |
| GET | `/` | Any | List with search (name, mobile, GSTIN) |
| GET | `/reports/aging` | Any | Aging report (0-30, 31-60, 61-90, 90+ day buckets) |
| GET | `/lookup/by-mobile` | Any | Customer lookup by mobile |
| GET | `/:id` | Any | Customer detail: sales, payments, summary |
| PUT | `/:id` | Any | Update customer |
| DELETE | `/:id` | Admin | Deactivate (blocked if outstanding_balance > 0) |
| POST | `/:id/payments` | Any | Collect payment (updates outstanding_balance) |
| GET | `/:id/ledger` | Any | Ledger statement with running balance |

### Quotations — `/api/quotations` (7 endpoints)

| Method | Path | Role | Description |
|---|---|---|---|
| POST | `/` | Any | Create quotation with pricing resolution |
| GET | `/` | Any | List with status filter, search, pagination |
| GET | `/public/:quotationNumber` | Public | Public quotation view |
| GET | `/:id` | Any | Quotation detail with items |
| PUT | `/:id/status` | Any | Update status (draft→sent→accepted→rejected) |
| POST | `/:id/convert` | Any | Convert to sale (returns pre-filled data, marks converted) |
| DELETE | `/:id` | Admin | Delete (must not be converted) |

### Stock Adjustments — `/api/stock-adjustments` (3 endpoints)

| Method | Path | Role | Description |
|---|---|---|---|
| POST | `/` | Any | Create adjustment (damage/theft/spoilage/counting_error/other) with FIFO lot impact |
| GET | `/` | Any | Paginated list with filters |
| POST | `/variance-check` | Admin | Physical count vs system quantity variance report |

### Pricing — `/api/pricing` (5 endpoints)

| Method | Path | Role | Description |
|---|---|---|---|
| POST | `/resolve` | Any | Batch pricing resolution (priority: customer > promotion > tier > base) |
| GET | `/products/:productId` | Any | Product tiers + promotions |
| PUT | `/products/:productId` | Admin/Op | Replace product pricing rules |
| GET | `/customers/:customerId` | Any | Customer-specific pricing rules |
| PUT | `/customers/:customerId` | Admin/Op | Replace customer pricing rules |

### Reports — `/api/reports` (16 endpoints)

| Method | Path | Description |
|---|---|---|
| GET | `/daily-sales` | Product-wise sales for one date |
| GET | `/sales-range` | Sales grouped by day |
| GET | `/inventory-status` | Full product snapshot + category stats |
| GET | `/product-performance` | Top/least selling products by revenue |
| GET | `/monthly-trend` | Monthly revenue/transaction trend |
| GET | `/purchases` | Purchase report with summary |
| GET | `/purchases/search` | Search purchases |
| GET | `/customer-sales` | Customer sales archive |
| GET | `/customer-sales/search` | Search archive |
| DELETE | `/customer-sales/:id` | Delete archive record (admin) |
| GET | `/suppliers` | Supplier report with items |
| GET | `/supplier-settlement` | Financial year settlement (opening/closing due, activity) |
| GET | `/transactions` | Day-by-day cash-book report |
| GET | `/audit` | Cash flow, payment verification, expenditure, supplier balances, bank reconciliation |
| GET | `/profit-loss` | P&L: revenue, COGS, gross profit, expenses, net profit, product-level margins |
| GET | `/profit-loss/daily` | Daily P&L trend |

### Dashboard — `/api/dashboard` (3 endpoints)

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/admin` | Admin | Stock value, today's sales, low-stock alerts, expiring items, week comparison, category performance |
| GET | `/operator` | Any | Inventory summary, today's personal sales, popular items |
| GET | `/quick-stats` | Any | KPIs: product count, stock, today/month revenue + transactions |

### Additional Routes

| Mount | Endpoints | Description |
|---|---|---|
| `/api/warehouses` | 7 | Warehouse CRUD, stock assignment, transfers, transfer history |
| `/api/notifications` | 5 | Admin notification list, mark read, clear, delete |
| `/api/audit-log` | 2 | Audit log viewer with filters + summary |
| `/api/backup` | 6 | Backup create, list, download, delete, restore, automation status |
| `/api/delivery` | 3 | Email capabilities check, send quotation, send receipt |
| `/` | 2 | Public HTML pages for receipt verification and quotation sharing |

---

## Frontend Guide

### Route Map

| Path | Component | Guard | Description |
|---|---|---|---|
| `/login` | Login | — | Animated login page |
| `/change-password` | ForcePasswordChange | PasswordChangeRoute | Mandatory first-login password change |
| `/` | Dashboard | ProtectedRoute | Role-specific KPI dashboard |
| `/inventory` | Inventory | ProtectedRoute | Products, stock, pricing rules, inventory flow |
| `/sales` | Sales | ProtectedRoute | POS cart, dynamic pricing, sales history |
| `/purchases` | Purchases | ProtectedRoute | Record, history, suppliers, categories |
| `/suppliers` | Suppliers | ProtectedRoute | Supplier directory, returns, balance |
| `/transactions` | Transactions | ProtectedRoute | Banking, expenditures, supplier payments, daily summary |
| `/returns` | Returns | ProtectedRoute | Customer sales returns |
| `/customers` | Customers | ProtectedRoute | Customer directory, payments, pricing |
| `/quotations` | Quotations | ProtectedRoute | Quotation lifecycle, email, convert to sale |
| `/stock-adjustments` | StockAdjustments | ProtectedRoute | Stock corrections |
| `/warehouses` | Warehouses | ProtectedRoute | Multi-warehouse operations |
| `/reports` | Reports | ProtectedRoute | 12 report tabs with charts and exports |
| `/receipt/:saleId` | Receipt | ProtectedRoute | Printable receipt with QR |
| `/users` | Users | AdminRoute | User management, login history |
| `/audit-log` | AuditLog | AdminRoute | Audit trail viewer |
| `/backup` | Backup | AdminRoute | Database backup/restore |

### Route Guards

| Guard | Logic |
|---|---|
| **ProtectedRoute** | No user → `/login`; `force_password_change` → `/change-password`; otherwise render children |
| **PasswordChangeRoute** | No user → `/login`; `force_password_change` false → `/`; otherwise render children |
| **AdminRoute** | All ProtectedRoute checks + `role !== 'admin'` → `/` |

### State Management

| Concern | Mechanism |
|---|---|
| Auth state | `AuthContext` — user, token, loading, sessionExpired, dailySetupStatus |
| Idle timeout | 5-min timer on user activity events → forced logout |
| Daily setup | Polled every 30 seconds; blocks operators via `DailySetupGate` |
| Component data | Local `useState`/`useEffect` per component |
| Table sorting | `useSortableData` hook (reusable across all tables) |

### Key Component Details

#### Dashboard
- **Admin view:** Total stock quantity + value, today's revenue + transactions, low-stock alerts (≤ reorder_point), expiring items, recent sales, pending orders, week-over-week comparison, category performance
- **Operator view:** Available products, own today's sales summary, popular items, pending orders
- **Live IST clock** displayed in header

#### Inventory (2 tabs)
- **Inventory tab:** Product catalog table with search + category filter. Modals for add product (auto-ID, inventory/order creation mode), edit product (selling price, GST, HSN, reorder, barcode, expiry, batch), add stock, manage pricing tiers + promotions, delete confirm
- **Inventory Flow tab:** Timeline of all stock movements (purchases, sales, returns, adjustments, deletions) with event type badges, impact quantities, references. Filterable, paginated (25/page)

#### Sales (2 tabs)
- **Record Sale tab:** Full POS cart with product search, dynamic pricing resolution, per-item quantity/price editing, customer lookup by mobile, payment mode selection (cash/card/upi/credit), quotation conversion support
- **Sales Done tab:** Receipt-level history with metrics (count, gross, refunded, returned, net), multi-field search, date range filter, CSV export

#### Purchases (4 tabs)
- **Record Purchase:** Product card grid, new product creation inline, delivered/ordered mode, advance payment with bank account
- **Purchase History:** Status filters, edit/cancel/deliver/partial-delivery actions
- **Suppliers:** Supplier detail cards with summary, open lots, returns, purchase history
- **Manage Categories:** Add/delete product categories

#### Transactions (4 tabs)
- **Daily Summary:** Expandable daily rows with opening/closing balance, sales, expenditure, bank activity
- **Expenditures:** CRUD with categories (general/renovation/utilities/transport/salary/maintenance/other)
- **Bank:** Account management, manual deposits/withdrawals (purpose types), printable bank statements
- **Supplier Payments:** Balance overview, payment history, record new payment

#### Reports (12 tabs)
1. **Daily Sales** — single day or date range
2. **Inventory Status** — full snapshot with category stats
3. **Product Performance** — top/least selling, bar chart, pie chart
4. **Purchases** — purchase report with costs
5. **Customer Sales** — archive with search
6. **Suppliers** — summary + detailed breakdown
7. **Supplier Settlement** — financial year view (opening/closing due)
8. **Audit Report** — 5 sections: cash flow, payment mode verification, expenditure, supplier advances, bank reconciliation
9. **Transactions** — day-by-day cash-book
10. **GST Report** — GST breakdown
11. **Profit & Loss** — revenue, COGS, gross/net profit, product-level margins
12. **Monthly Trend** — area + bar charts

All reports support CSV and PDF download via `ReportDownloader`.

---

## Core Business Workflows

### Making a Sale

```
1. GET /api/inventory         → Load products with stock
2. POST /api/pricing/resolve  → Resolve dynamic prices
3. GET /api/customers/lookup/by-mobile → Customer auto-fill
4. POST /api/sales            → Create sale
   ├─ BEGIN TRANSACTION
   ├─ Validate stock per item
   ├─ INSERT sales (one row per line item, shared sale_id)
   ├─ UPDATE products.quantity_available (deduct)
   ├─ FIFO lot allocation via allocateSaleToLots()
   ├─ INSERT receipt (unique receipt_number)
   ├─ INSERT customer_sales (archival snapshot)
   ├─ If card/upi: INSERT bank_transfer (auto-deposit to daily bank)
   ├─ If credit: UPDATE customer.outstanding_balance
   ├─ If quotation: UPDATE quotation.status = 'converted'
   ├─ logAudit() + addReviewNotification()
   └─ COMMIT
5. Navigate to /receipt/:saleId → Print with QR
```

### Purchase Lifecycle

```
ordered → partial-delivery(s) → delivered
ordered → cancelled (reverses advance)

Delivered: stock += qty, lot created, supplier auto-resolved
Ordered: no stock change, advance recorded in bank ledger
Partial: stock += delivered_qty, lot updated incrementally
Edit: stock adjusted by (new_qty − old_qty), lot re-synced
```

### FIFO Lot Tracking

```
Purchase → creates purchase_lot (quantity_received, quantity_remaining)
Sale → allocateSaleToLots (oldest lots first, ORDER BY delivery_date ASC)
     → creates sale_allocations (links sale line to specific lots)
Return → reverseSaleFromLots (restores lot quantities)
Supplier Return → deducts lot quantity_remaining + product stock
Adjustment → positive: standalone lot; negative: reduces oldest lots
```

### Dynamic Pricing

```
Priority: customer(1) > promotion(2) > tier(3) > base(4)
  1. Customer-specific price (customer_pricing table, date range)
  2. Active promotion (product_promotions, today in range)
  3. Best matching tier (price_tiers, highest min_qty ≤ order qty)
  4. Base selling_price from products table
Tie-break at same priority: lowest price wins
```

### Supplier Balance

```
Balance Due = Received Value − Returned Value − Total Paid

Received Value: SUM(purchase_lots.quantity_received × price_per_unit)
Returned Value: SUM(supplier_return_items.quantity_returned × price_per_unit)
Total Paid:     SUM(supplier_payments.amount)
```

### Daily Setup Gate

```
Each business day:
  1. Admin selects operating bank account
  2. Admin reviews opening + closing balance
  3. System sets isReady = true
  
Operators are blocked from write operations until setup is complete.
Admin is never blocked.
```

---

## Setup & Installation

### Prerequisites
- Node.js ≥ 16, npm ≥ 8

```bash
# 1. Clone
git clone <repository-url>
cd inventory-management

# 2. Install all dependencies
npm run install-deps
# or manually:
npm install
npm install --prefix server
npm install --prefix client

# 3. Configure environment (server/.env — safe defaults provided)
#    ⚠️ Change JWT_SECRET before production use

# 4. Development mode (server :5000 + client :3000 concurrently)
npm run dev

# 5. Production build
npm run build                   # Builds React SPA → client/build/
cd server && node index.js      # Express serves API + static build

# 6. Data management
npm run clean-db                # Wipe data, keep default users + base categories
npm run seed                    # Load demo dataset
```

> The SQLite database is auto-created on first server start.
> Default users and seed categories are inserted automatically.

---

## Database Workflows

### Reset for Testing
```bash
npm run clean-db
```
- Clears all transactional and master data (products, customers, suppliers, purchases, sales, returns, payments, bank activity, warehouses, audit logs, notifications)
- Preserves default login accounts (`admin`, `operator`) with `force_password_change = 1`
- Preserves base product categories (`seeds`, `fertilizers`, `pesticides`, `tools`)
- Existing JWT sessions become invalid — log in again

### Load Demo Data
```bash
npm run seed
```
Loads a prebuilt scenario for exploratory testing/screenshots.

### Run Tests
```bash
cd server
npm test                        # All tests
npm run test:coverage          # With coverage
npm run test:auth              # Auth tests only
npm run test:sales             # Sales tests only
npm run test:e2e               # End-to-end workflows
```

### API Testing
The Postman collection at `SLVT_Inventory_API.postman_collection.json` includes all endpoint categories.

---

## Environment Variables

### Core

| Variable | Default | Description |
|---|---|---|
| `PORT` | `5000` | Express server listen port |
| `JWT_SECRET` | `your-secret-key` | **Must change in production** |
| `SQLITE_DB_PATH` | `./database/inventory.db` | Database file path |
| `CORS_ORIGIN` | `*` | Comma-separated allowed origins |
| `FRONTEND_BASE_URL` | — | Frontend URL for email links |
| `PUBLIC_API_BASE_URL` | — | Public API URL for QR/share links |

### Email (SMTP)

| Variable | Default | Description |
|---|---|---|
| `SMTP_HOST` | — | SMTP server hostname |
| `SMTP_PORT` | — | SMTP port |
| `SMTP_SECURE` | — | Use TLS |
| `SMTP_USER` | — | SMTP username |
| `SMTP_PASS` | — | SMTP password |
| `SMTP_FROM` | — | Sender address |

### Backup Automation

| Variable | Default | Description |
|---|---|---|
| `AUTO_BACKUP_ENABLED` | `true` | Enable/disable auto backup |
| `BACKUP_INTERVAL_HOURS` | `24` | Backup frequency |
| `BACKUP_RETENTION_DAYS` | `14` | Retention period |

---

## Default Credentials

| Role | Username | Password |
|---|---|---|
| Admin (Business Owner) | `admin` | `admin123` |
| Operator (Shop In-Charge) | `operator` | `operator123` |

> **On first login, users are forced to change their password.** The system redirects to a password change screen and blocks all other access until the password is updated.
>
> Password requirements: ≥ 8 characters, uppercase, lowercase, digit, special character.

---

## Feature Guide

### Dashboard
- **Admin:** Total stock value, today's revenue, low-stock alerts, expiring items, recent sales, pending orders, week-over-week comparison, category performance
- **Operator:** Available products (top 20), own today's sales, popular items, pending orders
- **Live IST clock** in header

### Inventory
- Product CRUD with dynamically managed categories and auto-generated IDs (e.g. `SD001`, `FR003`)
- Units: kg, grams, packet, bag, liters, ml, pieces, bottles, tonnes
- Fields: GST%, HSN code, barcode, expiry date, batch number, manufacturing date, reorder point/quantity
- Two creation modes: **Inventory** (immediate stock) and **Order** (pending purchase)
- Tier pricing and promotional pricing per product
- Low-stock highlighting (≤ reorder_point), expiry alerts
- Inventory flow timeline: all stock movement history

### Sales (POS)
- **Multi-item cart** with dynamic pricing resolution
- **Customer lookup** by mobile number → auto-fill name/address
- **Payment modes:** Cash, Card, UPI, Credit (credit requires existing customer)
- **Quotation conversion:** Pre-fills cart with locked prices from accepted quotation
- Unique receipt number (default PDF filename for browser print)
- QR code on receipt linking to public verification page
- Email delivery of receipts

### Purchases
- **Delivered purchases:** Stock updated immediately, lot created
- **Ordered purchases:** With advance payment, pending delivery
- **Partial delivery:** Receive portions over time
- **Cancel:** Reverse advance payment bank effects
- **Edit:** Adjusts stock by quantity difference
- Inline product creation with full field support
- Supplier auto-resolution (creates directory entry automatically)

### Suppliers
- Dedicated directory with contact details, GSTIN
- **Live balance:** received value − returned value − payments made
- **Lot-level returns:** Select specific purchase lots, return quantities
- **Rename propagation:** Updating supplier name cascades across all tables
- Activate/deactivate suppliers

### Customers
- Directory with credit limits and outstanding balance tracking
- **Customer-specific pricing:** Override product prices per customer with date ranges
- **Payment collection:** Cash, bank, UPI with automatic balance reduction
- **Ledger:** Running balance statement
- **Aging report:** 0-30, 31-60, 61-90, 90+ day buckets

### Quotations
- **Lifecycle:** Draft → Sent → Accepted → Converted | Rejected | Expired
- Dynamic pricing resolution for quotation items
- Email delivery, PDF export
- **Convert to sale:** Pre-fills Sales POS with quoted prices
- Public shareable quotation page

### Transactions
- **Daily Setup:** Admin selects operating bank + reviews balance each day
- **Bank Accounts:** CRUD, printable statements with running balance
- **Bank Transfers:** Manual deposits/withdrawals with purpose tracking
- **Expenditures:** Categorised business expenses
- **Supplier Payments:** Linked to bank ledger, with settlement view
- **Daily Cash-Book:** Day-by-day summary with opening/closing balance

### Warehouses
- Multiple warehouse locations
- Stock assignment per warehouse
- Inter-warehouse transfers with history tracking

### Returns
- **Customer returns:** Lookup sale by ID, select products, enter return quantity
- **Refund modes:** Cash, credit (reduces outstanding), bank (creates withdrawal)
- FIFO lot reversal: returned quantities restore to original lots

### Stock Adjustments
- **Types:** Damage, theft, spoilage, counting error, other
- Loss types auto-reduce stock; counting errors accept positive/negative
- FIFO lot-level adjustment
- **Variance check:** Admin can compare physical count vs system quantity

### Reports (12 types)
| Report | Key Features |
|---|---|
| Daily Sales | Product-wise for single date or range |
| Inventory Status | Full snapshot with category-level stats |
| Product Performance | Top/least selling, BarChart, PieChart |
| Purchases | Purchase summary with cost analysis |
| Customer Sales | Archive with search |
| Suppliers | Summary + itemised breakdown |
| Supplier Settlement | Financial year opening/closing due |
| Audit | Cash flow, payment verification, expenditure audit, supplier advances, bank reconciliation |
| Transactions | Day-by-day cash-book report |
| GST | GST breakdown by product |
| Profit & Loss | Revenue, COGS, gross/net profit, product margins |
| Monthly Trend | Revenue + transaction trend charts |

All reports support **CSV download** and **PDF print**.

### Admin-Only Features
- **User Management:** Create, enable/disable, delete users, reset passwords, login history
- **Audit Log:** Searchable/filterable audit trail with summary
- **Backup/Restore:** Manual + automated backups with retention, download, restore

---

## Security Design

| Area | Implementation |
|---|---|
| **Password hashing** | bcrypt, 10 salt rounds |
| **Password strength** | ≥8 chars with uppercase, lowercase, digit, special character |
| **Force password change** | All new users and admin-reset users must change on first login |
| **Token security** | JWT with 24h expiry, secret from environment variable |
| **Session management** | Server-side session table with 5-minute idle timeout |
| **Client idle detection** | 5-minute timer on user activity → auto-logout |
| **Input validation** | express-validator on all mutating endpoints |
| **SQL injection prevention** | Parameterised queries throughout (`?` placeholders) |
| **XSS prevention** | `escapeHtml()` in server-rendered pages; React auto-escapes JSX |
| **Role enforcement** | `authorizeRole()` middleware on every sensitive route |
| **CORS** | Configurable origin whitelist from `CORS_ORIGIN` env |
| **Self-protection** | Admin cannot disable/delete own account |
| **Soft deletes** | Products, customers, suppliers, bank accounts use soft-delete |
| **Audit trail** | All mutations logged to `audit_log` table with IP |
| **Automated backups** | Configurable interval with retention-based pruning |
| **Daily setup gate** | Operator writes blocked until admin completes daily bank setup |

---

## Testing

### Test Architecture

```
server/tests/
├── setup/
│   ├── testDb.js         # In-memory SQLite (mirrors production schema)
│   └── testHelpers.js    # Auth helpers, factories
├── auth.test.js          # Authentication, user management, password flows
├── customers.test.js     # Customer CRUD, payments, ledger
├── dailySetup.test.js    # Daily setup workflow
├── dashboard.test.js     # Dashboard endpoints
├── e2e.test.js           # Multi-step business workflows
├── inventory.test.js     # Product/category CRUD, stock
├── notifications.test.js # Notification system
├── pricing.test.js       # Dynamic pricing resolution
├── purchases.test.js     # Purchase lifecycle, advance, delivery
├── reports.test.js       # Report generation
├── returns.test.js       # Sales/supplier returns
├── sales.test.js         # Sales, receipts, FIFO allocation
├── stockAdjustments.test.js # Stock corrections
├── suppliers.test.js     # Supplier directory, returns
└── transactions.test.js  # Banking, expenditures, payments
```

### Running Tests
```bash
cd server
npm test                   # All tests (sequential, force exit)
npm run test:coverage      # With coverage report
npm run test:watch         # Watch mode
npm run test:auth          # Single suite
```

### Test Tools
| Tool | Purpose |
|---|---|
| Jest | Test framework with `--runInBand` for sequential execution |
| Supertest | HTTP assertion library for Express endpoints |
| In-memory SQLite | Isolated test database (mirrors production schema) |

---

## Deployment

### Railway / Render
- `railway.toml` and `render.yaml` included
- Set `JWT_SECRET`, `SQLITE_DB_PATH`, and SMTP vars as platform environment variables
- Start command: `cd server && node index.js`

### Netlify (frontend-only)
- `netlify.toml` + `_redirects` for SPA routing
- Set `REACT_APP_API_BASE_URL` pointing to hosted backend

### Docker
```dockerfile
# server/Dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
EXPOSE 5000
CMD ["node", "index.js"]
```

### Production Checklist
- [ ] Change `JWT_SECRET` from default
- [ ] Set `CORS_ORIGIN` to specific frontend domain
- [ ] Configure SMTP for email delivery
- [ ] Set `FRONTEND_BASE_URL` and `PUBLIC_API_BASE_URL` for links
- [ ] Verify `AUTO_BACKUP_ENABLED=true` with appropriate interval
- [ ] Change default passwords on first login

---

## ID & Number Formats

| Entity | Format | Example |
|---|---|---|
| Product ID | 2-char prefix + 3-digit seq | `SD001`, `FR003` |
| Sale ID | `SALE` + YYYYMMDDHHmmss + 4 random | `SALE20260316231000XK2A` |
| Receipt | `R-` + YYYYMMDD + `-` + name + `-` + 2 random | `R-20260316-rameshkumar-4K` |
| Purchase ID | `PUR` + YYYYMMDDHHmmss + 4 hex | `PUR20260316231000AB3F` |
| Quotation | `Q-` + YYYYMMDD + `-` + 4 random | `Q-20260410-A7F3` |
| Return (sales) | `RET-` + YYYYMMDD + `-` + 4 random | `RET-20260410-B2C1` |
| Return (supplier) | `SRET-` + YYYYMMDD + `-` + 4 random | `SRET-20260410-D4E5` |

---

## Copyright

© 2026 Shri Lakshmi Vigneswara Traders.
Developed by dvvshivaram · dvvshivaram@gmail.com · +91 70369 53734
