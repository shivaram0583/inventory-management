# Low-Level Design — SLVT Inventory Management System

> **Version:** 2.0 · **Last Updated:** April 2026
> **System:** Shri Lakshmi Vigneswara Traders — Inventory & Business Management Platform

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Architecture Diagram](#2-architecture-diagram)
3. [Technology Stack](#3-technology-stack)
4. [Database Design](#4-database-design)
5. [Backend Module Design](#5-backend-module-design)
6. [Frontend Module Design](#6-frontend-module-design)
7. [Authentication & Authorization](#7-authentication--authorization)
8. [Core Business Workflows](#8-core-business-workflows)
9. [Service Layer Design](#9-service-layer-design)
10. [Middleware Pipeline](#10-middleware-pipeline)
11. [Data Flow Diagrams](#11-data-flow-diagrams)
12. [ID & Number Generation](#12-id--number-generation)
13. [Timestamp & Timezone Strategy](#13-timestamp--timezone-strategy)
14. [Error Handling Strategy](#14-error-handling-strategy)
15. [Security Design](#15-security-design)

---

## 1. System Overview

A monorepo full-stack web application for managing inventory, sales, purchases, supplier relations, banking, quotations, customer accounts, warehouse operations, and business analytics for an agricultural inputs trading business.

### Functional Scope

| Domain | Capabilities |
|---|---|
| **Inventory** | Product CRUD, category management, auto-ID, stock tracking, FIFO lot ledger, soft-delete, barcode/HSN/GST, expiry tracking, reorder alerts |
| **Sales** | Multi-item POS cart, dynamic pricing (tiers/promotions/customer), credit sales, receipt generation, QR verification, email delivery |
| **Purchases** | Order lifecycle (ordered→partial→delivered→cancelled), advance payments, supplier resolution, lot tracking |
| **Suppliers** | Directory CRUD, balance tracking (received−returned−paid), lot-level returns, payment ledger |
| **Customers** | Directory CRUD, credit limits, outstanding balance, payment collection, aging reports, customer-specific pricing |
| **Quotations** | Quote lifecycle (draft→sent→accepted→converted), convert-to-sale, PDF export, email delivery |
| **Transactions** | Bank accounts, daily setup gate, bank ledger, expenditures, supplier payments, cash-book summary |
| **Warehouses** | Multi-warehouse stock, inter-warehouse transfers |
| **Returns** | Customer sales returns (cash/credit/bank refund), supplier returns (lot-level) |
| **Reports** | 12 report types: daily sales, range, inventory, performance, monthly trend, purchases, customer sales, suppliers, settlement, audit, transactions, P&L |
| **Admin** | User management, audit log, backup/restore, notifications |

---

## 2. Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Browser (Client)                                │
│   React 18 SPA · React Router v6 · Tailwind CSS · Recharts             │
│                                                                         │
│   ┌──────────┐ ┌──────────┐ ┌───────┐ ┌──────────┐ ┌─────────┐        │
│   │Dashboard │ │Inventory │ │ Sales │ │Purchases │ │Suppliers│ ...     │
│   └──────────┘ └──────────┘ └───────┘ └──────────┘ └─────────┘        │
│                                                                         │
│   AuthContext (JWT + idle timeout) · DailySetupGate · Axios             │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │  REST / JSON
                                │  Authorization: Bearer <JWT>
┌───────────────────────────────▼─────────────────────────────────────────┐
│                 Express.js API Server (port 5000)                       │
│                                                                         │
│  ┌─────────────────── Middleware Pipeline ────────────────────────┐     │
│  │ CORS → express.json → authenticateToken → authorizeRole       │     │
│  │ → requireDailySetupForOperatorWrites → route handler          │     │
│  └───────────────────────────────────────────────────────────────┘     │
│                                                                         │
│  19 Route Modules:                                                      │
│  auth · inventory · sales · purchases · suppliers · transactions        │
│  returns · customers · quotations · stock-adjustments · warehouses      │
│  reports · dashboard · notifications · audit-log · backup               │
│  delivery · pricing · publicPages                                       │
│                                                                         │
│  Service Layer:                                                         │
│  purchaseLotLedger · bankLedger · pricing · supplierDirectory           │
│  supplierFinancials · communications · dailySetup · backupScheduler     │
│  reviewNotifications                                                    │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │  sqlite3 driver
┌───────────────────────────────▼─────────────────────────────────────────┐
│                    SQLite Database (inventory.db)                        │
│                                                                         │
│  34 Tables · FIFO lot tracking · IST timestamps · PRAGMA foreign_keys   │
│                                                                         │
│  Core:    users · products · product_categories · sessions · login_logs │
│  Sales:   sales · receipts · customer_sales · sale_allocations          │
│  Purchase: purchases · purchase_lots                                    │
│  Supplier: suppliers · supplier_payments · supplier_returns             │
│            supplier_return_items                                        │
│  Customer: customers · customer_payments · sales_returns                │
│  Pricing:  price_tiers · product_promotions · customer_pricing          │
│  Banking:  bank_accounts · bank_transfers · expenditures                │
│            daily_operation_setup                                        │
│  Warehouse: warehouses · warehouse_stock · warehouse_transfers          │
│  Quotes:   quotations · quotation_items                                 │
│  Ops:      stock_adjustments · audit_log · notifications                │
│  System:   app_migrations                                               │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Technology Stack

### Backend

| Component | Technology | Version | Purpose |
|---|---|---|---|
| Runtime | Node.js | ≥16 | JavaScript runtime |
| Framework | Express.js | ^4.18.2 | HTTP server & routing |
| Database | SQLite3 | ^5.1.6 | Embedded relational database |
| Auth | jsonwebtoken | ^9.0.2 | JWT generation & verification |
| Hashing | bcryptjs | ^2.4.3 | Password hashing (10 salt rounds) |
| Validation | express-validator | ^7.0.1 | Request body/param validation |
| Date/Time | moment | ^2.29.4 | IST timezone handling |
| Email | nodemailer | ^8.0.4 | SMTP email delivery |
| QR | qrcode | ^1.5.4 | Receipt QR code generation |
| Env | dotenv | ^16.3.1 | Environment variable loading |
| CORS | cors | ^2.8.5 | Cross-origin handling |
| Dev | nodemon | ^3.0.1 | Auto-restart in development |
| Test | jest + supertest | — | API integration testing |
| Concurrency | concurrently | ^8.2.2 | Parallel dev server launch |

### Frontend

| Component | Technology | Version | Purpose |
|---|---|---|---|
| Framework | React | ^18.2.0 | UI framework (CRA) |
| Routing | react-router-dom | ^6.8.1 | Client-side SPA routing |
| HTTP | axios | ^1.3.4 | REST client with interceptors |
| Styling | Tailwind CSS | ^3.2.7 | Utility-first CSS framework |
| Icons | lucide-react | ^0.263.1 | SVG icon library |
| Charts | recharts | ^3.8.0 | Data visualisation |
| Printing | react-to-print | ^2.14.7 | Browser print for receipts & statements |

---

## 4. Database Design

### 4.1 Entity-Relationship Overview

```
users ──1:N──→ sessions
users ──1:N──→ login_logs
users ──1:N──→ sales (operator_id)
users ──1:N──→ purchases (added_by)
users ──1:N──→ audit_log

products ──1:N──→ sales
products ──1:N──→ purchases
products ──1:N──→ purchase_lots
products ──1:N──→ sale_allocations
products ──1:N──→ quotation_items
products ──1:N──→ stock_adjustments
products ──1:N──→ price_tiers
products ──1:N──→ product_promotions
products ──N:M──→ customers (via customer_pricing)
products ──N:M──→ warehouses (via warehouse_stock)

purchases ──1:1──→ purchase_lots
purchase_lots ──1:N──→ sale_allocations
purchase_lots ──1:N──→ supplier_return_items

suppliers ──1:N──→ purchases
suppliers ──1:N──→ purchase_lots
suppliers ──1:N──→ supplier_payments
suppliers ──1:N──→ supplier_returns
supplier_returns ──1:N──→ supplier_return_items

customers ──1:N──→ customer_payments
customers ──1:N──→ receipts
customers ──1:N──→ quotations
customers ──1:N──→ customer_pricing

quotations ──1:N──→ quotation_items

bank_accounts ──1:N──→ bank_transfers
bank_accounts ──1:N──→ daily_operation_setup

warehouses ──1:N──→ warehouse_stock
warehouses ──1:N──→ warehouse_transfers (from/to)
```

### 4.2 Complete Table Definitions

#### `users`
| Column | Type | Constraints | Description |
|---|---|---|---|
| id | INTEGER | PK AUTOINCREMENT | |
| username | TEXT | UNIQUE NOT NULL | Login identifier |
| password | TEXT | NOT NULL | bcrypt hash |
| role | TEXT | CHECK('admin','operator') | Role-based access |
| is_active | INTEGER | DEFAULT 1, CHECK(0,1) | Soft-disable |
| force_password_change | INTEGER | DEFAULT 0, CHECK(0,1) | First-login flag |
| password_changed_at | DATETIME | | Timestamp of last password change |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |

#### `products`
| Column | Type | Constraints | Description |
|---|---|---|---|
| id | INTEGER | PK AUTOINCREMENT | |
| product_id | TEXT | UNIQUE NOT NULL | Auto-generated code (e.g. SD001) |
| category | TEXT | NOT NULL | FK-like to product_categories.name |
| product_name | TEXT | NOT NULL | |
| variety | TEXT | | Optional variant descriptor |
| quantity_available | REAL | DEFAULT 0 | Current stock level |
| unit | TEXT | CHECK('kg','grams','packet','bag','liters','ml','pieces','bottles','tonnes') | |
| purchase_price | REAL | DEFAULT 0 | Last purchase cost |
| selling_price | REAL | DEFAULT 0 | Base selling price |
| gst_percent | REAL | DEFAULT 0 | GST rate |
| hsn_code | TEXT | | HSN/SAC code |
| reorder_point | REAL | DEFAULT 10 | Low-stock alert threshold |
| reorder_quantity | REAL | DEFAULT 0 | Suggested reorder qty |
| barcode | TEXT | | Optional barcode |
| expiry_date | DATE | | Product expiry |
| batch_number | TEXT | | Batch identifier |
| manufacturing_date | DATE | | Manufacturing date |
| supplier | TEXT | | Legacy supplier name |
| supplier_id | INTEGER | FK→suppliers | Linked supplier |
| is_deleted | INTEGER | DEFAULT 0 | Soft-delete flag |
| date_added | DATETIME | | |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |
| updated_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |

#### `product_categories`
| Column | Type | Constraints | Description |
|---|---|---|---|
| id | INTEGER | PK AUTOINCREMENT | |
| name | TEXT | UNIQUE NOT NULL | Lowercase category name |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |

Seeded: `seeds`, `fertilizers`, `pesticides`, `tools`

#### `sales`
| Column | Type | Constraints | Description |
|---|---|---|---|
| id | INTEGER | PK AUTOINCREMENT | Line-item row ID |
| sale_id | TEXT | NOT NULL | Shared across items in one transaction |
| product_id | INTEGER | FK→products | |
| quantity_sold | REAL | NOT NULL | |
| price_per_unit | REAL | NOT NULL | Effective price after pricing resolution |
| total_amount | REAL | NOT NULL | qty × price |
| discount_amount | REAL | DEFAULT 0 | Per-item discount |
| tax_amount | REAL | DEFAULT 0 | Computed GST |
| gst_percent | REAL | DEFAULT 0 | Applied GST rate |
| pricing_rule_type | TEXT | | customer/promotion/tier/base |
| pricing_rule_label | TEXT | | Human-readable pricing rule |
| sale_date | DATETIME | | IST timestamp |
| operator_id | INTEGER | FK→users | |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |

> Multiple rows share the same `sale_id` for a multi-product transaction.

#### `receipts`
| Column | Type | Constraints | Description |
|---|---|---|---|
| id | INTEGER | PK AUTOINCREMENT | |
| receipt_number | TEXT | UNIQUE NOT NULL | Format: R-YYYYMMDD-name-XX |
| sale_id | TEXT | NOT NULL | Links to sales.sale_id |
| customer_name | TEXT | | |
| customer_mobile | TEXT | | |
| customer_address | TEXT | | |
| payment_mode | TEXT | DEFAULT 'cash' | cash/card/upi/credit |
| payment_gateway | TEXT | | Gateway provider |
| payment_reference | TEXT | | Transaction reference |
| gateway_order_id | TEXT | | Gateway order ID |
| total_amount | REAL | NOT NULL | |
| discount_amount | REAL | DEFAULT 0 | Bill-level discount |
| tax_amount | REAL | DEFAULT 0 | Total GST |
| payment_status | TEXT | DEFAULT 'paid' | paid/credit |
| customer_id | INTEGER | FK→customers | |
| receipt_date | DATETIME | DEFAULT CURRENT_TIMESTAMP | |
| printed | BOOLEAN | DEFAULT FALSE | Print tracking |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |

#### `customer_sales`
Archival denormalised snapshot — survives product edits/deletes.

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | INTEGER | PK AUTOINCREMENT | |
| sale_id | TEXT | | Reference |
| receipt_id | TEXT | | Reference |
| customer_name | TEXT | | Snapshot |
| customer_mobile | TEXT | | Snapshot |
| customer_address | TEXT | | Snapshot |
| product_name | TEXT | | Snapshot |
| quantity | REAL | | Snapshot |
| amount | REAL | DEFAULT 0 | Snapshot |
| payment_mode | TEXT | DEFAULT 'cash' | Snapshot |
| sale_date | DATETIME | | |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |

#### `purchases`
| Column | Type | Constraints | Description |
|---|---|---|---|
| id | INTEGER | PK AUTOINCREMENT | |
| purchase_id | TEXT | UNIQUE NOT NULL | Auto-generated PUR… |
| product_id | INTEGER | FK→products | |
| quantity | REAL | NOT NULL | Ordered/received qty |
| price_per_unit | REAL | NOT NULL | |
| total_amount | REAL | NOT NULL | |
| supplier | TEXT | | Legacy name field |
| supplier_id | INTEGER | FK→suppliers | |
| purchase_date | DATETIME | | IST date |
| added_by | INTEGER | FK→users | |
| purchase_status | TEXT | DEFAULT 'delivered' | ordered/delivered |
| delivery_date | DATETIME | | Date stock received |
| advance_amount | REAL | DEFAULT 0 | Advance paid on order |
| advance_payment_id | INTEGER | | FK→supplier_payments for advance |
| quantity_delivered | REAL | DEFAULT 0 | Running delivered qty |
| updated_at | DATETIME | | |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |

#### `purchase_lots`
FIFO lot tracking — one lot per purchase delivery.

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | INTEGER | PK AUTOINCREMENT | |
| purchase_id | INTEGER | UNIQUE FK→purchases | |
| product_id | INTEGER | FK→products | |
| supplier_id | INTEGER | FK→suppliers | |
| supplier_name | TEXT | | |
| source_type | TEXT | CHECK('purchase','opening','adjustment') | Lot origin |
| quantity_received | REAL | DEFAULT 0 | Total received |
| quantity_sold | REAL | DEFAULT 0 | Consumed by sales |
| quantity_returned | REAL | DEFAULT 0 | Returned to supplier |
| quantity_adjusted | REAL | DEFAULT 0 | Stock adjustments |
| quantity_remaining | REAL | DEFAULT 0 | = received − sold − returned − adjusted |
| price_per_unit | REAL | DEFAULT 0 | Lot cost basis |
| gst_percent | REAL | DEFAULT 0 | |
| purchase_date | DATETIME | | |
| delivery_date | DATETIME | | |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |
| updated_at | DATETIME | | |

#### `sale_allocations`
Links sales to purchase lots for FIFO tracking.

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | INTEGER | PK AUTOINCREMENT | |
| sale_line_id | INTEGER | FK→sales.id | |
| sale_id | TEXT | | Shared sale ID |
| product_id | INTEGER | FK→products | |
| purchase_lot_id | INTEGER | FK→purchase_lots | |
| quantity_allocated | REAL | | Qty from this lot |
| quantity_returned | REAL | DEFAULT 0 | Returned from this allocation |
| unit_cost | REAL | DEFAULT 0 | Cost basis for P&L |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |
| updated_at | DATETIME | | |

#### `suppliers`
| Column | Type | Constraints | Description |
|---|---|---|---|
| id | INTEGER | PK AUTOINCREMENT | |
| name | TEXT | NOT NULL | |
| contact_person | TEXT | | |
| mobile | TEXT | | |
| email | TEXT | | |
| address | TEXT | | |
| gstin | TEXT | | GST number |
| is_active | INTEGER | DEFAULT 1 | |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |
| updated_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |

#### `supplier_payments`
| Column | Type | Constraints | Description |
|---|---|---|---|
| id | INTEGER | PK AUTOINCREMENT | |
| supplier_name | TEXT | | Legacy name reference |
| supplier_id | INTEGER | FK→suppliers | |
| amount | REAL | NOT NULL | |
| payment_mode | TEXT | CHECK('cash','bank','upi') | |
| bank_account_id | INTEGER | FK→bank_accounts | |
| description | TEXT | | |
| payment_date | DATE | | IST date |
| created_by | INTEGER | FK→users | |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |

#### `supplier_returns`
| Column | Type | Constraints | Description |
|---|---|---|---|
| id | INTEGER | PK AUTOINCREMENT | |
| return_id | TEXT | UNIQUE NOT NULL | Auto-generated |
| supplier_id | INTEGER | FK→suppliers | |
| supplier_name | TEXT | | |
| total_quantity | REAL | DEFAULT 0 | |
| total_amount | REAL | DEFAULT 0 | |
| notes | TEXT | | |
| return_date | DATETIME | | |
| created_by | INTEGER | FK→users | |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |

#### `supplier_return_items`
| Column | Type | Constraints | Description |
|---|---|---|---|
| id | INTEGER | PK AUTOINCREMENT | |
| supplier_return_id | INTEGER | FK→supplier_returns ON DELETE CASCADE | |
| purchase_lot_id | INTEGER | FK→purchase_lots | |
| purchase_id | INTEGER | FK→purchases | |
| product_id | INTEGER | FK→products | |
| quantity_returned | REAL | NOT NULL | |
| price_per_unit | REAL | NOT NULL | Lot cost basis |
| total_amount | REAL | NOT NULL | |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |

#### `customers`
| Column | Type | Constraints | Description |
|---|---|---|---|
| id | INTEGER | PK AUTOINCREMENT | |
| name | TEXT | NOT NULL | |
| mobile | TEXT | | |
| email | TEXT | | |
| address | TEXT | | |
| gstin | TEXT | | |
| credit_limit | REAL | DEFAULT 0 | Max allowed outstanding |
| outstanding_balance | REAL | DEFAULT 0 | Current balance due |
| is_active | INTEGER | DEFAULT 1 | |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |
| updated_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |

#### `customer_payments`
| Column | Type | Constraints | Description |
|---|---|---|---|
| id | INTEGER | PK AUTOINCREMENT | |
| customer_id | INTEGER | FK→customers | |
| amount | REAL | NOT NULL | |
| payment_mode | TEXT | CHECK('cash','bank','upi') | |
| bank_account_id | INTEGER | FK→bank_accounts | |
| reference_note | TEXT | | |
| payment_date | DATETIME | | |
| collected_by | INTEGER | FK→users | |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |

#### `sales_returns`
| Column | Type | Constraints | Description |
|---|---|---|---|
| id | INTEGER | PK AUTOINCREMENT | |
| return_id | TEXT | UNIQUE NOT NULL | Auto-generated |
| sale_id | TEXT | | Links to original sale |
| product_id | INTEGER | FK→products | |
| quantity_returned | REAL | NOT NULL | |
| price_per_unit | REAL | NOT NULL | |
| refund_amount | REAL | NOT NULL | |
| refund_mode | TEXT | CHECK('cash','credit','bank') | |
| bank_account_id | INTEGER | FK→bank_accounts | For bank refunds |
| reason | TEXT | | |
| returned_by | INTEGER | FK→users | |
| return_date | DATETIME | | |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |

#### `quotations`
| Column | Type | Constraints | Description |
|---|---|---|---|
| id | INTEGER | PK AUTOINCREMENT | |
| quotation_number | TEXT | UNIQUE NOT NULL | Auto-generated |
| customer_id | INTEGER | FK→customers | |
| customer_name | TEXT | | |
| customer_mobile | TEXT | | |
| customer_address | TEXT | | |
| total_amount | REAL | DEFAULT 0 | |
| discount_amount | REAL | DEFAULT 0 | |
| tax_amount | REAL | DEFAULT 0 | |
| net_amount | REAL | DEFAULT 0 | |
| status | TEXT | CHECK('draft','sent','accepted','rejected','converted','expired') | |
| valid_until | DATE | | Quotation expiry |
| notes | TEXT | | |
| converted_sale_id | TEXT | | Links to sale if converted |
| created_by | INTEGER | FK→users | |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |
| updated_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |

#### `quotation_items`
| Column | Type | Constraints | Description |
|---|---|---|---|
| id | INTEGER | PK AUTOINCREMENT | |
| quotation_id | INTEGER | FK→quotations ON DELETE CASCADE | |
| product_id | INTEGER | FK→products | |
| quantity | REAL | NOT NULL | |
| price_per_unit | REAL | NOT NULL | |
| discount_percent | REAL | DEFAULT 0 | |
| tax_percent | REAL | DEFAULT 0 | |
| pricing_rule_type | TEXT | | |
| pricing_rule_label | TEXT | | |
| total_amount | REAL | NOT NULL | |

#### `price_tiers`
| Column | Type | Constraints | Description |
|---|---|---|---|
| id | INTEGER | PK AUTOINCREMENT | |
| product_id | INTEGER | FK→products ON DELETE CASCADE | |
| min_quantity | REAL | NOT NULL | Minimum qty for tier |
| price_per_unit | REAL | NOT NULL | Tier price |
| label | TEXT | | Display label |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |
| updated_at | DATETIME | | |

UNIQUE(product_id, min_quantity)

#### `product_promotions`
| Column | Type | Constraints | Description |
|---|---|---|---|
| id | INTEGER | PK AUTOINCREMENT | |
| product_id | INTEGER | FK→products ON DELETE CASCADE | |
| promotional_price | REAL | NOT NULL | |
| start_date | DATE | NOT NULL | |
| end_date | DATE | NOT NULL | |
| label | TEXT | | Display label |
| is_active | INTEGER | DEFAULT 1 | |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |
| updated_at | DATETIME | | |

#### `customer_pricing`
| Column | Type | Constraints | Description |
|---|---|---|---|
| id | INTEGER | PK AUTOINCREMENT | |
| customer_id | INTEGER | FK→customers ON DELETE CASCADE | |
| product_id | INTEGER | FK→products ON DELETE CASCADE | |
| price_per_unit | REAL | NOT NULL | |
| start_date | DATE | | Validity window start |
| end_date | DATE | | Validity window end |
| notes | TEXT | | |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |
| updated_at | DATETIME | | |

#### `bank_accounts`
| Column | Type | Constraints | Description |
|---|---|---|---|
| id | INTEGER | PK AUTOINCREMENT | |
| account_name | TEXT | NOT NULL | Display name |
| bank_name | TEXT | | Bank institution |
| account_number | TEXT | | Number |
| balance | REAL | DEFAULT 0 | Running balance |
| is_active | INTEGER | DEFAULT 1 | Soft-deactivate |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |
| updated_at | DATETIME | | |

#### `bank_transfers`
| Column | Type | Constraints | Description |
|---|---|---|---|
| id | INTEGER | PK AUTOINCREMENT | |
| bank_account_id | INTEGER | FK→bank_accounts | |
| amount | REAL | NOT NULL | |
| transfer_type | TEXT | CHECK('deposit','withdrawal') | |
| source_type | TEXT | | sale/supplier_payment/manual/refund |
| source_reference | TEXT | | Linking reference |
| payment_mode | TEXT | | cash/card/upi |
| description | TEXT | | |
| transfer_date | DATE | | IST date |
| created_by | INTEGER | FK→users | |
| withdrawal_purpose | TEXT | | cash_registry/business_expense/personal |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |

#### `daily_operation_setup`
| Column | Type | Constraints | Description |
|---|---|---|---|
| id | INTEGER | PK AUTOINCREMENT | |
| business_date | DATE | UNIQUE NOT NULL | IST date |
| selected_bank_account_id | INTEGER | FK→bank_accounts | |
| bank_selected_by | INTEGER | FK→users | |
| bank_selected_at | DATETIME | | |
| opening_balance_snapshot | REAL | | |
| closing_balance_snapshot | REAL | | |
| balance_reviewed_by | INTEGER | FK→users | |
| balance_reviewed_at | DATETIME | | |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |
| updated_at | DATETIME | | |

#### `expenditures`
| Column | Type | Constraints | Description |
|---|---|---|---|
| id | INTEGER | PK AUTOINCREMENT | |
| amount | REAL | NOT NULL | |
| description | TEXT | NOT NULL | |
| category | TEXT | DEFAULT 'general' | general/renovation/utilities/transport/salary/maintenance/other |
| expense_date | DATE | | IST date |
| created_by | INTEGER | FK→users | |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |

#### `sessions`
| Column | Type | Constraints | Description |
|---|---|---|---|
| id | TEXT | PK | UUID v4 |
| user_id | INTEGER | FK→users | |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |
| last_activity | DATETIME | DEFAULT CURRENT_TIMESTAMP | Updated on every request |

#### `login_logs`
| Column | Type | Constraints | Description |
|---|---|---|---|
| id | INTEGER | PK AUTOINCREMENT | |
| user_id | INTEGER | FK→users | |
| username | TEXT | | Snapshot |
| role | TEXT | | Snapshot |
| ip | TEXT | | Client IP (x-forwarded-for) |
| user_agent | TEXT | | Browser identifier |
| logged_in_at | DATETIME | | IST string |

#### `stock_adjustments`
| Column | Type | Constraints | Description |
|---|---|---|---|
| id | INTEGER | PK AUTOINCREMENT | |
| product_id | INTEGER | FK→products | |
| adjustment_type | TEXT | CHECK('damage','theft','spoilage','counting_error','other') | |
| quantity_adjusted | REAL | NOT NULL | Signed: negative = loss |
| quantity_before | REAL | | Snapshot before |
| quantity_after | REAL | | Snapshot after |
| reason | TEXT | | |
| adjusted_by | INTEGER | FK→users | |
| adjustment_date | DATETIME | | IST |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |

#### `audit_log`
| Column | Type | Constraints | Description |
|---|---|---|---|
| id | INTEGER | PK AUTOINCREMENT | |
| user_id | INTEGER | FK→users | |
| username | TEXT | | Snapshot |
| action | TEXT | NOT NULL | create/update/delete/cancel |
| entity_type | TEXT | NOT NULL | sale/purchase/product/customer/… |
| entity_id | TEXT | | |
| details | TEXT | | JSON-encoded context |
| ip | TEXT | | Client IP |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |

#### `notifications`
| Column | Type | Constraints | Description |
|---|---|---|---|
| id | INTEGER | PK AUTOINCREMENT | |
| actor_id | INTEGER | FK→users | |
| actor_name | TEXT | | |
| actor_role | TEXT | | |
| type | TEXT | | Notification category |
| title | TEXT | | |
| description | TEXT | | |
| is_read | INTEGER | DEFAULT 0 | |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |

#### `warehouses`
| Column | Type | Constraints | Description |
|---|---|---|---|
| id | INTEGER | PK AUTOINCREMENT | |
| name | TEXT | UNIQUE NOT NULL | |
| address | TEXT | | |
| is_active | INTEGER | DEFAULT 1 | |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |
| updated_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |

#### `warehouse_stock`
| Column | Type | Constraints | Description |
|---|---|---|---|
| id | INTEGER | PK AUTOINCREMENT | |
| warehouse_id | INTEGER | FK→warehouses | |
| product_id | INTEGER | FK→products | |
| quantity | INTEGER | DEFAULT 0 | |
| updated_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |

UNIQUE(warehouse_id, product_id)

#### `warehouse_transfers`
| Column | Type | Constraints | Description |
|---|---|---|---|
| id | INTEGER | PK AUTOINCREMENT | |
| from_warehouse_id | INTEGER | FK→warehouses | |
| to_warehouse_id | INTEGER | FK→warehouses | |
| product_id | INTEGER | FK→products | |
| quantity | INTEGER | NOT NULL | |
| notes | TEXT | | |
| transferred_by | INTEGER | FK→users | |
| transferred_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |

#### `app_migrations`
| Column | Type | Constraints | Description |
|---|---|---|---|
| name | TEXT | PK | Migration identifier |
| executed_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |

### 4.3 Key Database Helpers

| Function | Signature | Returns |
|---|---|---|
| `runQuery` | `(sql, params)` | `{ id, changes }` |
| `getRow` | `(sql, params)` | Single row or `undefined` |
| `getAll` | `(sql, params)` | Array of rows |
| `nowIST` | `()` | IST timestamp string `YYYY-MM-DD HH:mm:ss` |
| `combineISTDateWithCurrentTime` | `(dateString, ref?)` | Full IST datetime |
| `runTransaction` | `(callback)` | Executes inside BEGIN/COMMIT with auto-rollback |
| `paginate` | `(sql, params, page, limit)` | `{ data, pagination: { page, limit, total, totalPages } }` |

### 4.4 Migration Strategy

- Schema migrations run as one-time operations via `runOneTimeMigration(name, statements)` tracked in `app_migrations` table.
- Column additions use `PRAGMA table_info` checks for idempotent `ALTER TABLE ADD COLUMN`.
- Data backfills (lot ledger, timestamps, status defaults) are versioned as named migrations.

---

## 5. Backend Module Design

### 5.1 Route Module Inventory

| Mount Path | Module | Endpoints | Purpose |
|---|---|---|---|
| `/api/auth` | auth.js | 10 | Authentication, user CRUD, password management |
| `/api/inventory` | inventory.js | 9 | Product CRUD, stock, alerts, flow timeline |
| `/api/sales` | sales.js | 8 | POS sales, receipts, verification |
| `/api/purchases` | purchases.js | 12 | Purchase lifecycle, categories, supplier view |
| `/api/suppliers` | suppliers.js | 6 | Supplier directory, returns |
| `/api/transactions` | transactions.js | 18 | Banking, daily setup, expenditures, payments |
| `/api/returns` | returns.js | 3 | Customer sales returns |
| `/api/customers` | customers.js | 8 | Customer directory, payments, ledger |
| `/api/quotations` | quotations.js | 7 | Quotation lifecycle |
| `/api/stock-adjustments` | stockAdjustments.js | 3 | Stock corrections with FIFO lot impact |
| `/api/reports` | reports.js | 16 | All analytics and reports |
| `/api/dashboard` | dashboard.js | 3 | Role-specific dashboards |
| `/api/warehouses` | warehouses.js | 7 | Multi-warehouse operations |
| `/api/notifications` | notifications.js | 5 | Admin notification management |
| `/api/audit-log` | auditLog.js | 2 | Audit trail viewing |
| `/api/backup` | backup.js | 6 | Database backup/restore |
| `/api/delivery` | delivery.js | 3 | Email delivery of receipts/quotations |
| `/api/pricing` | pricing.js | 5 | Dynamic pricing rules management |
| `/` | publicPages.js | 2 | Public receipt/quotation HTML pages |

**Total: 19 route modules, ~131 endpoints**

### 5.2 Route Handler Pattern

Every mutating endpoint follows this consistent pattern:

```
router.post('/path',
  authenticateToken,              // JWT + session validation
  authorizeRole(['admin']),       // Role gate (optional)
  requireDailySetupForOperator,   // Daily setup gate (optional)
  body('field').isLength(...)     // express-validator (optional)
  async (req, res) => {
    try {
      // Validation check
      // Business logic (often in runTransaction)
      // logAudit(req, action, entity, id, details)
      // res.status(201).json(result)
    } catch (error) {
      res.status(500).json({ message: 'Error...' })
    }
  }
);
```

---

## 6. Frontend Module Design

### 6.1 Component Architecture

```
App.js (Router)
├── Login.js                    (public)
├── ForcePasswordChange.js      (PasswordChangeRoute)
└── Layout.js                   (parent for all protected routes)
    ├── Sidebar Navigation
    ├── DailySetupGate
    ├── NotificationsPanel (admin)
    └── <Outlet /> for child routes:
        ├── Dashboard.js
        ├── Inventory.js
        │   └── InventoryFlowPanel.js
        ├── Sales.js
        │   └── SalesRecordsPanel.js
        ├── Purchases.js
        ├── Suppliers.js
        ├── Transactions.js (4 internal tabs)
        ├── Returns.js
        ├── Customers.js
        ├── Quotations.js
        ├── StockAdjustments.js
        ├── Warehouses.js
        ├── Reports.js
        │   └── ReportDownloader.js
        ├── Receipt.js
        ├── Users.js          (AdminRoute)
        ├── AuditLog.js       (AdminRoute)
        └── Backup.js         (AdminRoute)
```

### 6.2 State Management

| Concern | Mechanism |
|---|---|
| Auth state | `AuthContext` — user, token, loading, sessionExpired |
| Daily setup | `AuthContext.dailySetupStatus` — polled every 30s |
| Component state | React `useState` / `useEffect` — local to each component |
| Sorting | `useSortableData` hook — reusable across all tables |
| Idle timeout | `useRef` timer in AuthContext — 5 min inactivity triggers logout |

### 6.3 Route Guards

| Guard | Purpose | Redirects to |
|---|---|---|
| `ProtectedRoute` | Requires authenticated user | `/login` if no user, `/change-password` if force_password_change |
| `PasswordChangeRoute` | Requires force_password_change flag | `/` if flag is false |
| `AdminRoute` | Requires `role === 'admin'` | `/` if operator |

### 6.4 Shared Components

| Component | Purpose |
|---|---|
| `Modal.js` | Portal-rendered modal with theme variants (info/success/warning/error) |
| `CustomSelect.js` | Styled dropdown with portal rendering and keyboard support |
| `DailySetupGate.js` | Blocks app until admin selects bank + reviews balance |
| `SortableHeader.js` | Clickable table header with sort direction indicators |

### 6.5 Utility Modules

| Module | Exports | Purpose |
|---|---|---|
| `dateUtils.js` | `fmtDateTime`, `fmtDate`, `fmtTime`, `getISTDateString`, `getFinancialYearForDate`, `getFinancialYearLabel`, `getFinancialYearRange`, `getFinancialYearOptions` | IST display formatting, financial year logic |
| `csvExport.js` | `downloadCSV(rows, columns, filename)` | BOM-prefixed CSV file download |
| `pdfExport.js` | `downloadPDF(rows, columns, filename)` | HTML table → print dialog PDF |
| `productCreation.js` | `UNIT_OPTIONS`, `GST_OPTIONS`, `PRODUCT_CREATION_MODE`, `getEmptyProductCreationForm`, `validateProductCreationForm`, `buildProductCreationPayload` | Product form logic |

---

## 7. Authentication & Authorization

### 7.1 Authentication Flow

```
1. POST /api/auth/login { username, password }
   ├─ bcrypt.compare(password, stored_hash)
   ├─ Check user.is_active
   ├─ INSERT INTO sessions (id = UUIDv4, user_id)
   ├─ INSERT INTO login_logs (IST timestamp, IP, user-agent)
   ├─ jwt.sign({ userId, username, role, sessionId }, JWT_SECRET, { expiresIn: '24h' })
   └─ Response: { token, user: { id, username, role, force_password_change } }

2. Client stores token → localStorage
   └─ axios default header: Authorization: Bearer <token>

3. Every authenticated request:
   └─ authenticateToken middleware:
      ├─ JWT verify → extract { userId, sessionId }
      ├─ Session lookup → check idle time
      ├─ idle_seconds > 300 → DELETE session → 401
      ├─ UPDATE sessions.last_activity
      ├─ SELECT user → check is_active
      └─ req.user = { id, username, role, force_password_change }

4. POST /api/auth/logout
   └─ DELETE FROM sessions WHERE id = sessionId

5. Client-side idle detection:
   └─ 5-minute timer on mousemove/keydown/scroll → auto-logout
```

### 7.2 Password Security

| Aspect | Implementation |
|---|---|
| Hashing | bcrypt with 10 salt rounds |
| Strength validation | ≥8 chars, uppercase, lowercase, digit, special character |
| Force change | `force_password_change = 1` for all new users and admin-reset users |
| Password change | Clears `force_password_change`, sets `password_changed_at` |
| Default credentials | admin/admin123, operator/operator123 — force change on first login |

### 7.3 Authorization Matrix

| Action | Admin | Operator |
|---|---|---|
| View all data | ✅ | ✅ |
| Create sales, purchases, stock adjustments | ✅ | ✅ (gated by daily setup) |
| Create/edit products | ✅ | ✅ (gated by daily setup) |
| Delete products | ✅ | ❌ |
| Manage users | ✅ | ❌ |
| Manage bank accounts | ✅ | ❌ |
| Record bank transfers | ✅ | ❌ |
| Record supplier payments | ✅ | ❌ |
| Delete records (expenditures, transfers, etc.) | ✅ | ❌ |
| Daily setup (select bank, review balance) | ✅ | ❌ |
| View audit log | ✅ | ❌ |
| Backup/restore | ✅ | ❌ |
| View notifications | ✅ | ❌ |

---

## 8. Core Business Workflows

### 8.1 Sales Workflow (POS)

```
1. Operator opens Sales tab → GET /api/inventory (stock > 0)
2. Adds items to cart → adjusts quantities
3. Dynamic pricing: POST /api/pricing/resolve → effective prices
4. Customer lookup: GET /api/customers/lookup/by-mobile
5. Select payment mode: cash / card / upi / credit
6. Submit: POST /api/sales
   ├─ BEGIN TRANSACTION
   ├─ Validate stock per item
   ├─ INSERT sales rows (one per line item, shared sale_id)
   ├─ UPDATE products.quantity_available (deduct)
   ├─ FIFO lot allocation → INSERT sale_allocations
   ├─ INSERT receipt (unique receipt_number)
   ├─ INSERT customer_sales (archival snapshot)
   ├─ If card/upi → INSERT bank_transfer (auto-deposit to daily bank)
   ├─ If credit → UPDATE customer.outstanding_balance
   ├─ If quotation conversion → UPDATE quotation.status = 'converted'
   ├─ logAudit()
   ├─ addReviewNotification() (operator actions only)
   └─ COMMIT
7. Navigate to /receipt/:saleId → printable receipt with QR
```

### 8.2 Purchase Lifecycle

```
Status: ordered → (partial-delivery)* → delivered
        ordered → cancelled

Record Purchase (delivered):
  POST /api/purchases { purchase_status: 'delivered' }
  ├─ INSERT purchase
  ├─ UPDATE product.quantity_available += qty
  ├─ UPDATE product.purchase_price = new price
  ├─ syncPurchaseLotForPurchase → INSERT/UPDATE purchase_lot
  └─ resolveSupplier → auto-create supplier directory entry

Record Purchase (ordered):
  POST /api/purchases { purchase_status: 'ordered', advance_amount }
  ├─ INSERT purchase (no stock update)
  ├─ createSupplierPaymentRecord (advance)
  └─ Bank balance deducted if bank/upi payment

Mark Delivered:
  POST /api/purchases/:id/mark-delivered
  ├─ UPDATE product.quantity_available += remaining qty
  ├─ UPDATE purchase_status = 'delivered'
  └─ syncPurchaseLotForPurchase

Partial Delivery:
  POST /api/purchases/:id/partial-delivery { quantity_delivered, mark_as_completed? }
  ├─ UPDATE product.quantity_available += delivered qty
  ├─ UPDATE purchase.quantity_delivered
  └─ If mark_as_completed → set status = 'delivered'

Cancel Order:
  POST /api/purchases/:id/cancel
  ├─ UPDATE purchase_status = 'cancelled'
  └─ reverseSupplierPaymentBankEffects (reverse advance)
```

### 8.3 FIFO Lot Allocation (Sales)

```
allocateSaleToLots(product_id, quantity, sale_line_id, sale_id):
  1. Check total lot remaining >= quantity
     └─ If insufficient, ensureTrackedStockCoverage → create 'opening' lot
  2. SELECT purchase_lots WHERE product_id AND quantity_remaining > 0
     ORDER BY delivery_date ASC, id ASC  (FIFO)
  3. Loop lots until quantity exhausted:
     ├─ allocate = min(lot.remaining, needed)
     ├─ INSERT sale_allocation(lot, allocate, unit_cost)
     ├─ UPDATE lot: quantity_sold += allocate, quantity_remaining -= allocate
     └─ remaining -= allocate
```

### 8.4 Customer Returns

```
POST /api/returns { items, refund_mode, bank_account_id? }
  ├─ BEGIN TRANSACTION
  ├─ For each item:
  │   ├─ Validate sale exists and has sufficient sold quantity
  │   ├─ INSERT sales_return
  │   ├─ UPDATE product.quantity_available += returned qty
  │   └─ reverseSaleFromLots → restore lot quantities (FIFO reversal)
  ├─ If refund_mode = 'credit' → UPDATE customer.outstanding_balance -= refund
  ├─ If refund_mode = 'bank' → INSERT bank_transfer (withdrawal/refund)
  └─ COMMIT
```

### 8.5 Supplier Returns

```
POST /api/suppliers/:id/returns { items: [{ purchase_lot_id, quantity_returned }] }
  createSupplierReturn():
    ├─ Validate lots belong to supplier
    ├─ Validate quantity_remaining >= quantity_returned
    ├─ INSERT supplier_return (header)
    ├─ For each item:
    │   ├─ INSERT supplier_return_item
    │   ├─ UPDATE purchase_lot: quantity_returned += qty, quantity_remaining -= qty
    │   └─ UPDATE product.quantity_available -= qty
    └─ Return { returnId, items, totals }
```

### 8.6 Quotation → Sale Conversion

```
1. GET /api/quotations/:id → quotation with items + prices
2. POST /api/quotations/:id/convert
   ├─ Validates status is 'draft' or 'accepted'
   ├─ Returns pre-filled sale data (does NOT auto-create sale)
   └─ Marks quotation status = 'converted'
3. Frontend navigates to /sales with location.state.quotationConversion
4. Sales component pre-fills cart with locked prices
5. Operator completes sale normally → POST /api/sales { quotation_id }
```

### 8.7 Daily Setup Gate

```
Admin opens app each day:
  1. DailySetupGate checks GET /api/transactions/daily-setup/status
  2. If no bank selected for today → Modal: select bank
     POST /api/transactions/daily-setup/select-bank { bank_account_id }
  3. Review opening balance → Modal: opening/closing snapshot
     POST /api/transactions/daily-setup/review-balance
  4. Status becomes isReady = true → app unlocked

Operator write operations:
  requireDailySetupForOperatorWrites middleware
  ├─ Admin: always passes
  └─ Operator: checks getDailySetupStatus()
     ├─ isReady = true → passes
     └─ isReady = false → 403 DAILY_SETUP_PENDING
```

### 8.8 Dynamic Pricing Resolution

```
POST /api/pricing/resolve { items: [{ product_id, quantity, customer_id? }] }

Priority chain (lower number = higher priority):
  1. Customer-specific pricing (customer_pricing table)
  2. Active product promotion (product_promotions table)
  3. Quantity-based tier pricing (price_tiers table)
  4. Base selling price (products.selling_price)

Resolution per item:
  ├─ Check customer_pricing (if customer_id provided)
  ├─ Check active promotions (today between start_date and end_date)
  ├─ Check tiers (highest min_quantity ≤ ordered quantity)
  ├─ Pick winner by priority; tie-break: lowest price
  └─ Return { effective_price, rule_type, rule_label, base_price }
```

---

## 9. Service Layer Design

### 9.1 Purchase Lot Ledger (`purchaseLotLedger.js`)

Central service for FIFO inventory tracking across all stock movements.

| Function | Purpose |
|---|---|
| `syncPurchaseLotForPurchase(purchase)` | Create/update lot for a purchase delivery |
| `createStandaloneLot(params)` | Create an opening/adjustment lot |
| `ensureTrackedStockCoverage(product_id, needed)` | Auto-create opening lot if untracked stock exists |
| `allocateSaleToLots(product_id, qty, sale_line, sale_id)` | FIFO allocation: oldest lots first |
| `reverseSaleFromLots(product_id, sale_line, qty)` | Reverse FIFO allocation (for returns) |
| `applyStockAdjustmentToLots(product_id, type, qty)` | Positive → standalone lot; negative → reduce oldest lots |
| `createSupplierReturn(supplier_id, items, ...)` | Validate lot ownership, deduct quantities, create return record |
| `backfillPurchaseLotLedger()` | Replay all historical transactions to rebuild lot data |

### 9.2 Bank Ledger (`bankLedger.js`)

Manages bank balance integrity for supplier payments.

| Function | Purpose |
|---|---|
| `createSupplierPaymentRecord(params)` | Insert payment + bank transfer + update balance |
| `reverseSupplierPaymentBankEffects(payment)` | Restore balance + delete bank transfer |
| `isBankTrackedSupplierPaymentMode(mode)` | Returns true for 'bank' and 'upi' |

### 9.3 Pricing Engine (`pricing.js`)

| Function | Purpose |
|---|---|
| `resolveEffectivePrice(product_id, quantity, customer_id?)` | Single-item pricing resolution |
| `resolveEffectivePrices(items)` | Batch pricing resolution |
| `replaceProductPricingRules(product_id, tiers, promotions)` | Replace all tiers + promotions |
| `replaceCustomerPricingRules(customer_id, rules)` | Replace all customer-specific prices |
| `getProductPricingRules(product_id)` | Fetch tiers + promotions |
| `getCustomerPricingRules(customer_id)` | Fetch customer pricing rules |

### 9.4 Supplier Directory (`supplierDirectory.js`)

| Function | Purpose |
|---|---|
| `resolveSupplier({ supplierName, supplierId })` | Find supplier by ID or name |
| `ensureSupplierDirectoryEntry({ supplierName })` | Auto-create supplier if not exists |
| `syncSupplierForeignKeys(supplierId, name)` | Backfill supplier_id across tables |
| `backfillSupplierDirectory()` | Scan all supplier names, create entries, sync FKs |
| `renameSupplierReferences(id, oldName, newName)` | Propagate rename across all tables |

### 9.5 Daily Setup (`dailySetup.js`)

| Function | Purpose |
|---|---|
| `getDailySetupStatus()` | Check if today's bank selection + balance review is done |
| `getDailyBalanceSnapshot(businessDate)` | Calculate opening + closing balance from transactions |
| `upsertSelectedBank(bank_id, user_id)` | Record today's bank selection |
| `markBalanceReviewed(user_id)` | Snapshot balances and mark reviewed |

### 9.6 Communications (`communications.js`)

| Function | Purpose |
|---|---|
| `sendEmail(to, subject, html)` | SMTP email delivery via nodemailer |
| `buildReceiptVerificationLink(receiptNumber)` | Public receipt URL |
| `buildQuotationShareLink(quotationNumber)` | Public quotation URL |
| `getCommunicationCapabilities()` | Check if email is configured |

### 9.7 Backup Scheduler (`backupScheduler.js`)

| Function | Purpose |
|---|---|
| `createBackupSnapshot()` | Copy SQLite DB to backups/ |
| `listBackups()` | List backup files with metadata |
| `pruneOldBackups()` | Delete files older than retention period |
| `startBackupScheduler()` | Start periodic backup timer |
| `getAutomationStatus()` | Return schedule config |

### 9.8 Review Notifications (`reviewNotifications.js`)

Hybrid storage: in-memory (max 200) + DB persistence.

| Function | Purpose |
|---|---|
| `addReviewNotification(actor, type, title, description)` | Add to both stores |
| `listReviewNotifications()` | Merge + deduplicate + sort |
| `markNotificationRead(id)` | Mark read in DB |
| `markAllNotificationsRead()` | Mark all read |
| `removeReviewNotification(id)` | Delete from both stores |
| `clearReviewNotifications()` | Clear all |

---

## 10. Middleware Pipeline

### 10.1 Request Flow

```
Incoming Request
  │
  ▼
CORS (dynamic origin from CORS_ORIGIN env)
  │
  ▼
express.json() — body parsing
  │
  ▼
express.static('public') — static files
  │
  ▼
Route matching → Route-specific middleware chain:
  │
  ├─ authenticateToken
  │   ├─ Extract Bearer token → 401 if missing
  │   ├─ jwt.verify(token, JWT_SECRET) → 401/403 if invalid
  │   ├─ SELECT session → 401 if not found
  │   ├─ Idle check: last_activity > 300s → DELETE session → 401
  │   ├─ UPDATE sessions.last_activity
  │   ├─ SELECT user → check is_active → 403 if disabled
  │   └─ req.user = { id, username, role, force_password_change }
  │
  ├─ authorizeRole(['admin'])
  │   └─ 403 if req.user.role not in allowed list
  │
  ├─ requireDailySetupForOperatorWrites
  │   ├─ Admin: pass through
  │   └─ Operator: getDailySetupStatus()
  │       ├─ isReady: pass through
  │       └─ not ready: 403 DAILY_SETUP_PENDING
  │
  ├─ express-validator body/param checks
  │   └─ 400 with validation errors if failed
  │
  └─ Route handler → response
```

### 10.2 Audit Logging

```
logAudit(req, action, entityType, entityId, details):
  ├─ IP: x-forwarded-for || req.ip
  ├─ Timestamp: nowIST()
  └─ INSERT INTO audit_log
```

---

## 11. Data Flow Diagrams

### 11.1 Making a Sale (Complete)

```
┌──────────┐   GET /api/inventory     ┌─────────┐
│  Sales   │ ──────────────────────→  │  Server │
│Component │ ←─ products[]             │         │
│          │                           │         │
│ Cart     │   POST /api/pricing/     │         │
│ Builder  │ ──resolve──────────────→ │Pricing  │
│          │ ←─ effective_prices[]     │Service  │
│          │                           │         │
│ Checkout │   POST /api/sales        │         │
│          │ ──────────────────────→  │Sales    │
│          │                           │Route    │
│          │                           │  │      │
│          │                           │  ├─ Validate stock
│          │                           │  ├─ INSERT sales (per item)
│          │                           │  ├─ UPDATE products.qty
│          │                           │  ├─ allocateSaleToLots (FIFO)
│          │                           │  ├─ INSERT receipt
│          │                           │  ├─ INSERT customer_sales
│          │                           │  ├─ INSERT bank_transfer (if card/upi)
│          │                           │  ├─ UPDATE customer.outstanding (if credit)
│          │                           │  ├─ logAudit()
│          │                           │  └─ addReviewNotification()
│          │ ←─ { saleId, receipt }    │         │
│          │                           │         │
│ Receipt  │   GET /api/sales/:id     │         │
│ Page     │ ──────────────────────→  │         │
│          │ ←─ { items, receipt, QR } │         │
└──────────┘                           └─────────┘
```

### 11.2 Purchase + Lot Tracking

```
POST /api/purchases { status:'delivered' }
  │
  ├─ INSERT purchases row
  ├─ resolveSupplier() → auto-create if needed
  ├─ syncSupplierForeignKeys()
  ├─ UPDATE products.quantity_available += qty
  ├─ UPDATE products.purchase_price
  └─ syncPurchaseLotForPurchase()
       └─ INSERT/UPDATE purchase_lots
            (quantity_received, quantity_remaining, price_per_unit)
```

### 11.3 Bank Ledger Impact Map

```
Deposits (balance increases):
  ├─ Sale via card/upi → auto-deposit to daily bank
  ├─ Manual bank deposit → POST /api/transactions/bank-transfers
  └─ Customer payment via bank/upi → POST /api/customers/:id/payments

Withdrawals (balance decreases):
  ├─ Supplier payment via bank/upi → auto-withdrawal
  ├─ Manual bank withdrawal → POST /api/transactions/bank-transfers
  ├─ Sales return bank refund → POST /api/returns
  └─ Purchase advance via bank/upi → POST /api/purchases
```

---

## 12. ID & Number Generation

| Entity | Format | Example |
|---|---|---|
| Product ID | 2-char category prefix + 3-digit sequence | `SD001`, `FR003`, `PS002` |
| Sale ID | `SALE` + IST YYYYMMDDHHmmss + 4 random alphanumeric | `SALE20260316231000XK2A` |
| Receipt Number | `R-` + YYYYMMDD + `-` + sanitised name (≤15, a-z0-9) + `-` + 2 random | `R-20260316-rameshkumar-4K` |
| Purchase ID | `PUR` + IST YYYYMMDDHHmmss + 4 random hex | `PUR20260316231000AB3F` |
| Quotation Number | `Q-` + YYYYMMDD + `-` + 4 random | `Q-20260410-A7F3` |
| Return ID (sales) | `RET-` + YYYYMMDD + `-` + 4 random | `RET-20260410-B2C1` |
| Supplier Return ID | `SRET-` + YYYYMMDD + `-` + 4 random | `SRET-20260410-D4E5` |

---

## 13. Timestamp & Timezone Strategy

| Context | Storage Format | Display |
|---|---|---|
| All business timestamps | IST string via `nowIST()` | Displayed as-is in `en-IN` locale |
| SQLite `DEFAULT CURRENT_TIMESTAMP` | UTC | `dateUtils.fmtDateTime()` parses as UTC → displays IST |
| User-picked dates | IST date string `YYYY-MM-DD` | Combined with current IST time via `combineISTDateWithCurrentTime()` |
| Login logs | IST string (intentional) | Displayed as-is for audit readability |
| Financial year | April 1 → March 31 | `getFinancialYearForDate()` returns `2025-26` format |

---

## 14. Error Handling Strategy

### Backend

| Layer | Approach |
|---|---|
| Route handlers | try/catch with `res.status(500).json({ message })` |
| Validation | express-validator → 400 with `{ errors: [{ msg, param }] }` |
| Auth | 401 (no token/expired), 403 (disabled/unauthorized) |
| Business rules | 400 with descriptive message (e.g. "Insufficient stock") |
| Transactions | `runTransaction()` auto-rollback on error |
| Database | SQLite errors caught and logged to console |

### Frontend

| Layer | Approach |
|---|---|
| HTTP errors | Axios interceptors: 401 → auto-logout with session expired modal |
| Component errors | try/catch → `setError(message)` → inline error banner |
| Loading states | `setLoading(true)` → spinner overlay → `setLoading(false)` |
| Network failures | Axios catch → `error.response?.data?.message` fallback |

---

## 15. Security Design

| Area | Implementation |
|---|---|
| Password storage | bcrypt, 10 salt rounds |
| Token security | JWT with 24h expiry, JWT_SECRET from environment |
| Session management | Server-side session table with 5-min idle timeout |
| Input validation | express-validator on all mutating endpoints |
| Role enforcement | `authorizeRole()` middleware on every sensitive route |
| SQL injection | Parameterised queries throughout (`?` placeholders) |
| XSS | `escapeHtml()` in public pages; React auto-escapes in JSX |
| CORS | Configurable origin whitelist from `CORS_ORIGIN` env |
| Self-protection | Admin cannot delete/disable own account |
| Soft deletes | Products, customers, suppliers, bank accounts use soft-delete |
| Force password change | All new/reset users must change password on first login |
| Audit trail | All mutations logged to `audit_log` table with IP |
| Automated backups | Configurable interval + retention-based pruning |

---

*End of Low-Level Design Document*
