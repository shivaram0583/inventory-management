# Shri Lakshmi Vigneswara Traders — Inventory Management System

> **Business Contact:** +91 70369 53734 · dvvshivaram@gmail.com
> **Developed by:** dvvshivaram © 2026

A full-stack web application for managing inventory, sales, purchases, receipts,
and business analytics for an agricultural inputs trading business (seeds & fertilizers).

---

## Table of Contents

1. [Tech Stack](#tech-stack)
2. [Project Structure](#project-structure)
3. [High-Level Design (HLD)](#high-level-design-hld)
4. [Low-Level Design (LLD)](#low-level-design-lld)
5. [API Reference](#api-reference)
6. [Setup & Installation](#setup--installation)
7. [Database Workflows](#database-workflows)
8. [Environment Variables](#environment-variables)
9. [Default Credentials](#default-credentials)
10. [Feature Guide](#feature-guide)
11. [Deployment](#deployment)

---

## Tech Stack

### Backend (`server/`)

| Dependency | Version | Purpose |
|---|---|---|
| Node.js + Express | ^4.18.2 | HTTP server & routing |
| SQLite3 | ^5.1.6 | Embedded relational database |
| jsonwebtoken | ^9.0.2 | JWT token generation & verification |
| bcryptjs | ^2.4.3 | Password hashing (salt rounds: 10) |
| express-validator | ^7.0.1 | Request body validation |
| moment | ^2.29.4 | Date/time formatting (IST UTC+5:30) |
| dotenv | ^16.3.1 | Environment variable loading |
| cors | ^2.8.5 | Cross-origin request handling |
| Nodemailer | latest | SMTP email delivery for quotations & receipts |
| qrcode | latest | Receipt QR generation |
| nodemon | ^3.0.1 | Dev auto-restart |

### Frontend (`client/`)

| Dependency | Version | Purpose |
|---|---|---|
| React | ^18.2.0 | UI framework |
| React Router DOM | ^6.8.1 | Client-side routing |
| Axios | ^1.3.4 | HTTP client (proxy → localhost:5000) |
| Tailwind CSS | ^3.2.7 | Utility-first styling |
| Lucide React | ^0.263.1 | Icon library |
| Recharts | ^3.8.0 | Charts & data visualisation |
| react-to-print | ^2.14.7 | Browser print for receipts |

---

## Project Structure

```
inventory-management/
├── client/
│   └── src/
│       ├── App.js                   # Route definitions & ProtectedRoute / AdminRoute guards
│       ├── index.css                # Global Tailwind styles & animations
│       ├── contexts/AuthContext.js  # JWT auth context + axios header injection
│       ├── hooks/useSortableData.js # Reusable multi-column table sort hook
│       ├── utils/
│       │   ├── dateUtils.js         # UTC→IST display formatters + getISTDateString()
│       │   └── csvExport.js         # CSV download utility
│       └── components/
│           ├── Login.js             # Login page
│           ├── Layout.js            # Sidebar nav + copyright footer
│           ├── Dashboard.js         # Role-specific KPI dashboard
│           ├── Inventory.js         # Product CRUD + stock management
│           ├── Sales.js             # POS / cart-based sales screen
│           ├── Purchases.js         # Purchase recording + history + category mgmt
│           ├── Suppliers.js         # Supplier directory, balances, open lots, returns
│           ├── Transactions.js      # Banking, supplier payments, daily setup, cash-book
│           ├── Returns.js           # Customer sales return workflow
│           ├── Receipt.js           # Printable receipt view
│           ├── Reports.js           # Analytics tabs + Recharts charts
│           ├── ReportDownloader.js  # CSV export for all report types
│           ├── Customers.js         # Customer directory and balance tracking
│           ├── Users.js             # User management (admin only)
│           └── shared/
│               ├── Modal.js         # Reusable confirm/alert modal
│               └── SortableHeader.js# Sortable table column header
│
└── server/
    ├── index.js                     # CORS, body parser, route mounts, static serve
    ├── .env                         # Secret env vars (not committed)
    ├── Dockerfile
    ├── middleware/auth.js           # JWT verify + 5-min idle session enforcement
    ├── database/db.js               # SQLite init, CREATE TABLE, schema migrations
    └── routes/
        ├── auth.js                  # /api/auth
        ├── inventory.js             # /api/inventory
        ├── sales.js                 # /api/sales
        ├── purchases.js             # /api/purchases
      ├── suppliers.js             # /api/suppliers
      ├── transactions.js          # /api/transactions
      ├── returns.js               # /api/returns
      ├── customers.js             # /api/customers
        ├── reports.js               # /api/reports
        └── dashboard.js             # /api/dashboard
```

---

## High-Level Design (HLD)

### System Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                        Browser (Client)                           │
│  React 18 SPA · React Router v6 · Tailwind CSS · Recharts        │
│                                                                   │
│  Dashboard  Inventory  Sales  Purchases  Reports  Users  Receipt  │
│                    AuthContext (JWT)                              │
│                    Axios (dev proxy → :5000)                      │
└─────────────────────────────┬────────────────────────────────────┘
                              │  HTTP / REST  JSON
                              │  Authorization: Bearer <JWT>
┌─────────────────────────────▼────────────────────────────────────┐
│              Express.js API Server  (port 5000)                   │
│                                                                   │
│   CORS MW    authenticateToken (JWT + session)    authorizeRole   │
│   express-validator (body validation on all mutating endpoints)   │
│                                                                   │
│  /api/auth  /api/inventory  /api/sales  /api/purchases            │
│  /api/suppliers  /api/transactions  /api/returns                  │
│  /api/customers  /api/reports       /api/dashboard                │
└─────────────────────────────┬────────────────────────────────────┘
                              │  sqlite3 driver
┌─────────────────────────────▼────────────────────────────────────┐
│              SQLite Database  (inventory.db)                      │
│  users · products · sales · receipts · purchases                  │
│  customer_sales · product_categories · sessions · login_logs      │
└────────────────────────────────────────────────────────────────────┘
```

### Key Design Decisions

| Decision | Rationale |
|---|---|
| **SQLite** | Zero-config embedded DB for single-node small-business deployment |
| **UTC storage for all timestamps** | `CURRENT_TIMESTAMP` is UTC; frontend `dateUtils.js` converts to IST for display |
| **Session + JWT dual auth** | JWT carries identity; DB `sessions` table enables 5-min idle timeout and instant logout |
| **Two roles only** | `admin` (full access) and `operator` (no user management, no deletes) |
| **Dynamic categories** | `product_categories` table — owner adds/removes categories at runtime without code changes |
| **Monorepo** | Client + server share one git repo; root scripts run both concurrently |

### Data Flow — Making a Sale

```
Operator fills cart → POST /api/sales
  ├─ Validate stock availability per item
  ├─ INSERT INTO sales (one row per line item, shared sale_id)
  ├─ UPDATE products.quantity_available  (deduct sold qty)
  ├─ INSERT INTO receipts  (customer info + unique receipt_number)
  ├─ INSERT INTO customer_sales  (archival denormalised snapshot)
  └─ Return { saleId, receiptNumber, items, receipt }
         ↓
Frontend navigates to /receipt/:saleId
  ├─ GET /api/sales/:saleId  → line items + receipt row
  ├─ Render printable receipt with business details
  └─ PUT /api/sales/receipts/:id/print  (mark printed)
```

### Data Flow — Recording a Purchase

```
Purchases tab → select product (or create new inline)
  └─ Fill qty, price/unit, supplier, date
  └─ "Review & Confirm" → confirmation popup (no API call yet)
  └─ Operator confirms → POST /api/purchases
       ├─ Convert user's IST date → UTC for storage
       ├─ INSERT INTO purchases
       └─ UPDATE products SET quantity_available += qty,
                               purchase_price = new_price
```

### Data Flow — Edit Purchase

```
Purchase History table → Edit (pencil icon) → pre-filled modal
  → PUT /api/purchases/:id
       ├─ qty_diff = new_qty - old_qty
       ├─ UPDATE products.quantity_available += qty_diff
       ├─ UPDATE products.purchase_price = new_price
       └─ UPDATE purchases row
```

---

## Low-Level Design (LLD)

### Database Schema

#### `users`
| Column | Type | Constraints |
|---|---|---|
| id | INTEGER | PK AUTOINCREMENT |
| username | TEXT | UNIQUE NOT NULL |
| password | TEXT | bcrypt hash, NOT NULL |
| role | TEXT | CHECK IN ('admin','operator') |
| is_active | INTEGER | DEFAULT 1, CHECK IN (0,1) |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP (UTC) |

#### `product_categories`
| Column | Type | Constraints |
|---|---|---|
| id | INTEGER | PK AUTOINCREMENT |
| name | TEXT | UNIQUE NOT NULL (lowercase) |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP |

> Seeded with `seeds` and `fertilizers` on first run. New categories added from Purchases → Manage Categories.

#### `products`
| Column | Type | Constraints |
|---|---|---|
| id | INTEGER | PK AUTOINCREMENT |
| product_id | TEXT | UNIQUE NOT NULL (user code e.g. PROD001) |
| category | TEXT | Validated against product_categories.name |
| product_name | TEXT | NOT NULL |
| variety | TEXT | nullable |
| quantity_available | REAL | DEFAULT 0 |
| unit | TEXT | CHECK IN ('kg','packet','bag','liters') |
| purchase_price | REAL | DEFAULT 0 |
| selling_price | REAL | DEFAULT 0 |
| supplier | TEXT | nullable |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP (UTC) |
| updated_at | DATETIME | DEFAULT CURRENT_TIMESTAMP (UTC) |

#### `sales`
| Column | Type | Constraints |
|---|---|---|
| id | INTEGER | PK AUTOINCREMENT |
| sale_id | TEXT | UNIQUE — `SALE{IST-YYYYMMDDHHmmss}{4rand}` |
| product_id | INTEGER | FK → products.id |
| quantity_sold | REAL | NOT NULL |
| price_per_unit | REAL | NOT NULL |
| total_amount | REAL | NOT NULL |
| sale_date | DATETIME | DEFAULT CURRENT_TIMESTAMP (UTC) |
| operator_id | INTEGER | FK → users.id |

> **One row per line item.** Multiple rows share the same `sale_id` for a multi-product transaction.

#### `receipts`
| Column | Type | Constraints |
|---|---|---|
| id | INTEGER | PK AUTOINCREMENT |
| receipt_number | TEXT | UNIQUE — `R-{YYYYMMDD}-{customerName15}-{2rand}` |
| sale_id | INTEGER | FK → sales.id |
| customer_name | TEXT | nullable |
| customer_mobile | TEXT | nullable |
| customer_address | TEXT | nullable |
| payment_mode | TEXT | DEFAULT 'cash' — (cash / card / upi) |
| total_amount | REAL | NOT NULL |
| receipt_date | DATETIME | DEFAULT CURRENT_TIMESTAMP (UTC) |
| printed | BOOLEAN | DEFAULT FALSE |

#### `purchases`
| Column | Type | Constraints |
|---|---|---|
| id | INTEGER | PK AUTOINCREMENT |
| purchase_id | TEXT | UNIQUE — `PUR{IST-YYYYMMDDHHmmss}{4hexChars}` |
| product_id | INTEGER | FK → products.id |
| quantity | REAL | NOT NULL |
| price_per_unit | REAL | NOT NULL |
| total_amount | REAL | NOT NULL |
| supplier | TEXT | nullable |
| purchase_date | DATETIME | UTC — converted from user's IST date selection on write |
| added_by | INTEGER | FK → users.id |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP (UTC) |

#### `customer_sales`
Archival denormalised snapshot; survives product edits/deletes.

| Column | Type | Notes |
|---|---|---|
| id | INTEGER | PK AUTOINCREMENT |
| sale_id | TEXT | Reference to sale |
| receipt_id | INTEGER | Reference to receipt |
| customer_name / mobile / address | TEXT | Snapshots at time of sale |
| product_name | TEXT | Snapshot |
| quantity | REAL | Snapshot |
| sale_date | DATETIME | DEFAULT CURRENT_TIMESTAMP (UTC) |

#### `sessions`
| Column | Type | Purpose |
|---|---|---|
| id | TEXT | PK (UUID v4) |
| user_id | INTEGER | FK → users.id |
| last_activity | DATETIME | Updated on every authenticated request |

> Session expires when `last_activity` is more than **300 seconds** (5 min) ago — enforced in `auth.js` on every request.

#### `login_logs`
| Column | Type | Purpose |
|---|---|---|
| id | INTEGER | PK AUTOINCREMENT |
| user_id / username / role | — | Snapshots |
| ip | TEXT | Client IP (handles X-Forwarded-For) |
| user_agent | TEXT | Browser user-agent string |
| logged_in_at | DATETIME | Stored as IST string for audit readability |

---

### Backend Architecture

#### Route mount order (`server/index.js`)
```
Express app
  cors({ origin:'*', methods:['GET','POST','PUT','DELETE'] })
  express.json()
  /api/auth        → routes/auth.js
  /api/inventory   → routes/inventory.js
  /api/sales       → routes/sales.js
  /api/purchases   → routes/purchases.js
  /api/reports     → routes/reports.js
  /api/dashboard   → routes/dashboard.js
  /* (production)  → serve React build via express.static
```

#### Auth Middleware (`middleware/auth.js`)
```
authenticateToken(req, res, next):
  1. Extract Bearer <token> from Authorization header  →  401 if absent
  2. jwt.verify(token, JWT_SECRET)  →  { userId, username, role, sessionId }
  3. SELECT session WHERE id = sessionId
     ├─ not found           →  401 "Session expired"
     └─ idle_seconds > 300  →  DELETE session  →  401 "Session expired"
  4. UPDATE sessions SET last_activity = CURRENT_TIMESTAMP
  5. SELECT user WHERE id = userId; check is_active  →  403 if disabled
  6. req.user = user; req.sessionId = sessionId; next()

authorizeRole(allowedRoles)(req, res, next):
  └─ req.user.role not in allowedRoles  →  403 "Insufficient permissions"
```

#### ID / Number Generation

| Entity | Format | Example |
|---|---|---|
| Product ID | Auto: first 4 chars of category uppercased + 3-digit sequence | `SEED001`, `FERT003`, `PEST002` |
| Sale ID | `SALE` + IST YYYYMMDDHHmmss + 4 random alphanumeric | `SALE20260316231000XK2A` |
| Receipt Number | `R-` + YYYYMMDD + `-` + sanitised customer name (≤15 chars, a-z0-9) + `-` + 2 random chars | `R-20260316-rameshkumar-4K` |
| Purchase ID | `PUR` + IST YYYYMMDDHHmmss + 4 random hex uppercase | `PUR20260316231000AB3F` |

#### Timestamp Strategy

| Source | Stored as | How displayed |
|---|---|---|
| SQLite `CURRENT_TIMESTAMP` (sales, receipts, sessions, etc.) | UTC `YYYY-MM-DD HH:MM:SS` | `dateUtils.toDate()` appends `Z` → parses as UTC → `toLocaleString` in IST |
| User-picked purchase date (`YYYY-MM-DD` IST) | UTC: `moment.utc(date + 'T00:00:00+05:30')` | Displays correctly as the chosen IST date |
| Login log `logged_in_at` | IST string (intentional) | Displayed as-is |

---

### Frontend Architecture

#### Route Guard Pattern
```
<ProtectedRoute>   Redirects to /login if no token in localStorage
<AdminRoute>       Redirects to /    if user.role !== 'admin'

/              →  Dashboard    (ProtectedRoute)
/inventory     →  Inventory    (ProtectedRoute)
/sales         →  Sales        (ProtectedRoute)
/purchases     →  Purchases    (ProtectedRoute)
/reports       →  Reports      (ProtectedRoute)
/users         →  Users        (AdminRoute)
/receipt/:id   →  Receipt      (ProtectedRoute)
/login         →  Login        (public)
```

#### `AuthContext` (`contexts/AuthContext.js`)
- Stores `{ user, token }` in React state + `localStorage`
- On login: sets `axios.defaults.headers.common['Authorization'] = 'Bearer ' + token`
- Exposes `login(token, user)` and `logout()` consumed by all components

#### `useSortableData` Hook
Accepts array → returns `{ sortedItems, sortConfig, requestSort }`.
Each `requestSort(key)` call cycles: `asc → desc → none → asc`. Used by every table.

#### `dateUtils.js`
```
toDate(str)          Appends 'Z' to treat stored UTC string correctly → Date object
fmtDateTime(str)     "16 Mar 2026, 11:10 PM"  (IST, en-IN locale)
fmtDate(str)         "16 March 2026"
fmtTime(str)         "11:10 PM"
getISTDateString()   "2026-03-16"  (today in IST, for date-picker defaults)
```

#### Key Component Data Flows
```
Sales.js
  GET /api/inventory          → product list for cart
  POST /api/sales             → { saleId, receiptNumber }
  navigate('/receipt/' + saleId)

Receipt.js
  GET /api/sales/:saleId      → line items + receipt
  react-to-print              → window.print()  (documentTitle = receipt_number → used as PDF filename)

Reports.js
  activeTab state → calls different /api/reports/* endpoint
  Recharts visuals:
    AreaChart  — monthly revenue trend
    BarChart   — monthly transactions + items sold
    PieChart   — product revenue share
    BarChart   — top/least selling products
  <ReportDownloader> → CSV via csvExport.js

Purchases.js  (3 tabs)
  Tab 1 "Record Purchase"
    Product card grid (filterable) + "New Product" button
    New Product modal → POST /api/inventory → auto-selects created product
    Confirmation popup → POST /api/purchases
  Tab 2 "Purchase History"
    Sortable table + Edit pencil → PUT /api/purchases/:id
    Edit modal shows live stock-adjustment diff (new qty − old qty)
  Tab 3 "Manage Categories"
    POST /api/purchases/categories
    DELETE /api/purchases/categories/:id
```

---

### Authentication & Session Flow

```
1. POST /api/auth/login  { username, password }
   ├─ bcrypt.compare(password, stored_hash)
   ├─ INSERT INTO sessions (id = UUIDv4, user_id)
   ├─ INSERT INTO login_logs (IST timestamp, IP, user-agent)
   └─ jwt.sign({ userId, username, role, sessionId }, JWT_SECRET, { expiresIn: '24h' })
      → Response: { token, user: { id, username, role } }

2. Client stores token in localStorage
   └─ axios default header: Authorization: Bearer <token>

3. Every protected request:
   └─ auth.js: verify JWT + session idle check + UPDATE last_activity

4. POST /api/auth/logout
   └─ DELETE FROM sessions WHERE id = sessionId
   └─ Client: clear localStorage → navigate /login

5. Auto-expiry:
   └─ idle_seconds > 300 → DELETE session → 401
   └─ Axios interceptor on client catches 401 → logout() → /login
```

---

## API Reference

> All endpoints except `POST /api/auth/login` require:
> `Authorization: Bearer <JWT_TOKEN>`

### Auth — `/api/auth`

| Method | Path | Role | Description |
|---|---|---|---|
| POST | `/login` | Public | Login; returns JWT + user object |
| POST | `/logout` | Any | Invalidate current session |
| GET | `/me` | Any | Current user info |
| POST | `/users` | admin | Create user (username≥3, password≥6) |
| GET | `/users` | admin | List all users |
| PUT | `/users/:id/status` | admin | Enable / disable user |
| DELETE | `/users/:id` | admin | Delete user (cannot delete self) |
| GET | `/login-logs` | admin | Last 10 login audit entries |

**Login:**
```json
// POST /api/auth/login
// Request
{ "username": "admin", "password": "admin123" }

// Response 200
{ "token": "<jwt>", "user": { "id": 1, "username": "admin", "role": "admin" } }
```

---

### Inventory — `/api/inventory`

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/` | Any | All products — `?category=&search=` |
| GET | `/next-id` | Any | Next auto-generated product ID — `?category=seeds` → `{ nextId: "SEED005" }` |
| GET | `/:id` | Any | Single product by DB id |
| POST | `/` | admin, operator | Create product (`product_id` optional — auto-generated from category if omitted) |
| PUT | `/:id` | admin, operator | Update fields (partial) |
| DELETE | `/:id` | admin | Delete (blocked if has sales records) |
| POST | `/:id/add-stock` | admin, operator | Add qty to existing stock |
| GET | `/alerts/low-stock` | Any | Products where `quantity_available <= 10` |

**Create product:**
```json
// POST /api/inventory
{
  "category": "seeds",
  "product_name": "Tomato Seeds",
  "variety": "Hybrid F1",
  "quantity_available": 100,
  "unit": "packet",
  "purchase_price": 120.00,
  "selling_price": 150.00,
  "supplier": "ABC Agro Pvt Ltd"
}
// Response 201: full product object
```

**Add stock:**
```json
// POST /api/inventory/:id/add-stock
{ "quantity": 50 }
// Response: { "message": "Added 50 packet to stock", "product": { ... } }
```

---

### Sales — `/api/sales`

| Method | Path | Role | Description |
|---|---|---|---|
| POST | `/` | Any | Create sale (multi-item checkout) |
| GET | `/` | Any | List sales — `?start_date=&end_date=&product_id=` |
| GET | `/receipts/all` | Any | List receipts — `?start_date=&end_date=` |
| GET | `/:saleId` | Any | Sale details + receipt |
| PUT | `/receipts/:id/print` | Any | Mark receipt as printed |

**Create sale:**
```json
// POST /api/sales
{
  "items": [
    { "product_id": 1, "quantity": 5 },
    { "product_id": 3, "quantity": 2 }
  ],
  "customer_name": "Ramesh Kumar",
  "customer_mobile": "9876543210",
  "customer_address": "12 MG Road, Hyderabad",
  "payment_mode": "cash"
}
```

**Response 201:**
```json
{
  "saleId": "SALE20260316231000AB12",
  "receiptNumber": "R-20260316-rameshkumar-4K",
  "totalAmount": 1050.00,
  "items": [
    { "product_name": "Tomato Seeds", "quantity_sold": 5, "price_per_unit": 150, "total_amount": 750 }
  ],
  "receipt": { "id": 1, "receipt_number": "R-20260316-rameshkumar-4K", "payment_mode": "cash", "printed": false }
}
```

---

### Purchases — `/api/purchases`

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/categories` | Any | List all product categories |
| POST | `/categories` | admin, operator | Add category — `{ "name": "pesticides" }` |
| DELETE | `/categories/:id` | admin | Delete category (blocked if products use it) |
| GET | `/` | Any | List purchases — `?start_date=&end_date=&product_id=` |
| POST | `/` | admin, operator | Record purchase as ordered or delivered, with optional advance payment |
| PUT | `/:id` | admin, operator | Edit purchase (adjusts stock by qty diff) |
| POST | `/:id/mark-delivered` | admin, operator | Receive the remaining pending quantity into stock |
| POST | `/:id/partial-delivery` | admin, operator | Receive part of a pending order and optionally close it |
| POST | `/:id/cancel` | admin | Cancel a pending order and reverse advance payment effects |
| GET | `/suppliers` | Any | Supplier summary from purchase history with live payable |
| GET | `/suppliers/:name` | Any | Supplier drilldown: open lots, payments, purchases, itemized returns |

**Record purchase:**
```json
// POST /api/purchases
{
  "product_id": 1,
  "quantity": 50,
  "price_per_unit": 110.00,
  "supplier": "ABC Agro Pvt Ltd",
  "purchase_date": "2026-03-16",
  "purchase_status": "ordered",
  "advance_amount": 1000,
  "bank_account_id": 1
}
// Response 201: full purchase row with product + user info
```

**Edit purchase:**
```json
// PUT /api/purchases/:id
{
  "quantity": 60,
  "price_per_unit": 115.00,
  "supplier": "XYZ Seeds Co",
  "purchase_date": "2026-03-17"
}
// Stock adjusts by (60 - old_qty). Can be negative to correct over-entries.
```

**Partial delivery:**
```json
// POST /api/purchases/:id/partial-delivery
{
  "quantity_delivered": 20,
  "mark_as_completed": false,
  "delivery_date": "2026-04-10"
}
```

**Live supplier balance rule:**
```text
balance_due = total_received_value - total_returned_value - total_paid
```

---

### Suppliers — `/api/suppliers`

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/` | Any | Supplier directory with received, returned, paid, and live balance values |
| GET | `/:id` | Any | Supplier detail with purchases, open lots, payments, and itemized supplier returns |
| POST | `/:id/returns` | admin, operator | Return selected unsold lot quantities back to the supplier |
| POST | `/` | admin | Create supplier master record |
| PUT | `/:id` | admin | Update supplier master record and rename linked references |
| PATCH | `/:id/toggle` | admin | Activate or deactivate a supplier |

**Record supplier return:**
```json
// POST /api/suppliers/:id/returns
{
  "items": [
    { "purchase_lot_id": 12, "quantity_returned": 5 },
    { "purchase_lot_id": 13, "quantity_returned": 2 }
  ],
  "return_date": "2026-04-10",
  "notes": "Financial year closing return"
}
```

---

### Transactions — `/api/transactions`

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/bank-accounts` | Any | Active bank accounts |
| GET | `/bank-accounts/:id/statement` | Any | Date-range bank statement for one account |
| POST | `/bank-accounts` | admin | Create bank account |
| PUT | `/bank-accounts/:id` | admin | Update bank account metadata |
| DELETE | `/bank-accounts/:id` | admin | Deactivate a bank account |
| GET | `/daily-setup/status` | Any | Daily bank-selection and balance-review status |
| POST | `/daily-setup/select-bank` | admin | Select today’s operating bank |
| POST | `/daily-setup/review-balance` | admin | Mark daily balance as reviewed |
| GET | `/expenditures` | Any | List expenditures |
| POST | `/expenditures` | admin, operator | Create expenditure |
| DELETE | `/expenditures/:id` | admin | Delete expenditure |
| GET | `/bank-transfers` | Any | Manual bank transfers and linked entries |
| POST | `/bank-transfers` | admin | Deposit or withdraw from a bank account |
| DELETE | `/bank-transfers/:id` | admin | Delete a manual transfer and reverse its balance effect |
| GET | `/supplier-payments` | Any | Supplier payment ledger |
| POST | `/supplier-payments` | admin | Record supplier payment and linked bank movement |
| DELETE | `/supplier-payments/:id` | admin | Delete supplier payment and reverse linked bank effect |
| GET | `/supplier-balances` | Any | Live supplier settlement view |
| GET | `/daily-summary` | Any | Daily cash-book summary |

**Record supplier payment:**
```json
// POST /api/transactions/supplier-payments
{
  "supplier_name": "ABC Agro Pvt Ltd",
  "amount": 2500,
  "payment_mode": "bank",
  "payment_date": "2026-04-10",
  "bank_account_id": 1,
  "description": "Part payment against April deliveries"
}
```

---

### Reports — `/api/reports`

| Method | Path | Query Params | Description |
|---|---|---|---|
| GET | `/daily-sales` | `?date=YYYY-MM-DD` | Product-wise sales for one date |
| GET | `/sales-range` | `?start_date=&end_date=` | Sales grouped by day |
| GET | `/inventory-status` | `?category=seeds` | Full product snapshot + stats |
| GET | `/product-performance` | `?start_date=&end_date=&limit=10` | Top + least selling |
| GET | `/monthly-trend` | `?months=12` | Revenue/transactions by month |
| GET | `/purchases` | `?start_date=&end_date=` | Purchase history + cost summary |
| GET | `/customer-sales` | `?start_date=&end_date=` | Customer-level archive |
| DELETE | `/customer-sales/:id` | — | Delete archive record (admin) |

---

### Dashboard — `/api/dashboard`

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/admin` | admin | Total stock, today sales, low-stock list, 7-day chart, category breakdown |
| GET | `/operator` | admin, operator | Available inventory, operator's own today sales, popular items |
| GET | `/quick-stats` | Any | KPIs: total products, stock, today/month revenue + transactions |

---

## Setup & Installation

### Prerequisites
- Node.js ≥ 16, npm ≥ 8

```bash
# 1. Clone
git clone <repository-url>
cd inventory-management

# 2. Install all dependencies
npm install
npm install --prefix server
npm install --prefix client

# 3. Review / edit environment (server/.env already provided with safe defaults)
#    Change JWT_SECRET before any production use.

# 4. Start in development mode (server :5000 + client :3000 concurrently)
npm run dev

# 5. Production build + serve
npm run build --prefix client   # builds React SPA → client/build/
cd server && node index.js      # Express serves API + static React build

# 6. Optional data workflows
npm run clean-db                # wipe live data, keep only default users + base categories
npm run seed                    # load the sample/demo dataset again
```

> The SQLite database is created automatically on first server start.
> Default admin + operator accounts and seed categories are inserted automatically.

---

## Database Workflows

### Reset for manual testing
- Run `npm run clean-db` from the repo root to clear the live SQLite data in place.
- The reset removes transactional and master data such as products, customers, suppliers, purchases, sales, returns, payments, bank activity, warehouses, audit logs, and notifications.
- After the reset, only the default login accounts and the base product categories (`seeds`, `fertilizers`, `pesticides`, `tools`) remain.
- Existing JWT sessions become invalid because session and login data are cleared. Log in again after the reset.

### Load sample data again
- Run `npm run seed` when you want the prebuilt demo scenario back for exploratory testing or screenshots.

### API testing assets
- The Postman collection at `SLVT_Inventory_API.postman_collection.json` now includes supplier returns, supplier balances, supplier payments, bank-account setup, and purchase supplier-detail flows.

---

## Environment Variables

Core:
`PORT`, `CORS_ORIGIN`, `SQLITE_DB_PATH`, `FRONTEND_BASE_URL`, `PUBLIC_API_BASE_URL`

Email delivery:
`SMTP_HOST`
`SMTP_PORT`
`SMTP_SECURE`
`SMTP_USER`
`SMTP_PASS`
`SMTP_FROM`

| Variable | Default | Description |
|---|---|---|
| `PORT` | `5000` | Express server listen port |
| `JWT_SECRET` | `your-secret-key` | **Must change in production** — signs all JWTs |
| `SQLITE_DB_PATH` | `./database/inventory.db` | Absolute or relative path to SQLite file |

---

## Default Credentials

| Role | Username | Password |
|---|---|---|
| Admin (Business Owner) | `admin` | `admin123` |
| Operator (Shop In-Charge) | `operator` | `operator123` |

> **Change these immediately after first login.** Admin can update passwords from the Users tab.

---

## Feature Guide

### Dashboard
- **Admin**: total stock quantity + value, today's revenue + transactions, low-stock alerts (≤10 units), last 7-day daily revenue bar chart, category-level performance
- **Operator**: available product list (top 20), own today's sales summary, most-sold products today

### Inventory
- Add / edit / delete products with dynamically managed categories
- **Auto-generated Product IDs** based on category: `SEED001`, `FERT001`, `PEST001`, etc.
- Units supported: `kg`, `packet`, `bag`, `liters`
- Low-stock items highlighted in red (≤10 units)
- "Add Stock" on each product row logs an automatic purchase record

### Sales (POS)
- **Multi-item cart**: add multiple products, adjust quantities, then checkout all at once
- **Editable quantity**: type a number directly or use +/− buttons (ideal for large quantities like 20 bags)
- Customer details capture: name, mobile, address (all optional)
- Payment modes: Cash / Card / UPI
- Real-time stock validation — sale blocked if insufficient stock
- Unique receipt generated: `R-YYYYMMDD-customername-XX`
- Receipt number used as the **default PDF filename** when saving via browser print

### Purchases

| Tab | What it does |
|---|---|
| **Record Purchase** | Record delivered stock immediately or place an ordered purchase with advance amount, selected bank account, and later delivery updates. |
| **Purchase History** | Sortable table of all past purchases. Each row supports edit, cancel, mark-delivered, and partial-delivery actions with live stock and bank impact. |
| **Supplier View** | Shows supplier-level received value, returned value, payments, balance due, open lots, purchase history, and itemized supplier returns. Returns can be recorded only for selected lots/products still on hand. |
| **Manage Categories** | Add or delete categories used across Inventory and Purchases. Deletion blocked if any product uses the category. |

### Suppliers
- Dedicated supplier directory with contact details, latest purchases, open stock lots, payments, returns, and live balance due.
- Supplier returns are itemized by product and reduce the operational supplier payable immediately.
- Live supplier payable uses the formula: `received value - returned value - payments made`.

### Transactions
- Bank account management, statements, manual bank transfers, expenditures, supplier payments, and daily cash-book summary.
- Daily setup supports selecting the operating bank for the day and marking the balance as reviewed.
- Supplier payment create/delete operations are transactionally coupled to bank ledger entries.
- Supplier settlement view exposes received value, returned value, stock on hand, total paid, and live payable/credit.

### Receipts
- A4-formatted printable receipt: business name, address, contact (+91 70369 53734, dvvshivaram@gmail.com)
- Itemised line items, unit prices, subtotals, payment mode, receipt number
- Print status tracked per receipt (`printed` flag)

### Reports

| Tab | Charts | CSV Export |
|---|---|---|
| Daily Sales | — | Yes |
| Sales Range | — | Yes |
| Inventory Status | — | Yes |
| Product Performance | Bar chart (top/least), Pie chart (revenue share) | Yes |
| Monthly Trend | Area chart (revenue), Bar chart (transactions + items) | Yes |
| Purchases | — | Yes |
| Customer Sales | — | Yes |

### Users (Admin only)
- Create operator accounts with role assignment
- Enable / disable accounts (disabled users are blocked at login)
- Delete users (self-delete protected)
- Login audit log: last 10 entries with IP address and browser info

---

## Deployment

### Railway / Render
- `railway.toml` and `render.yaml` are included
- Set `JWT_SECRET` and `SQLITE_DB_PATH` as platform environment variables
- Start command: `cd server && node index.js`

### Netlify (frontend-only)
- `netlify.toml` included with `_redirects` for SPA routing
- Point `REACT_APP_API_URL` to your hosted backend if deployed separately

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

---

## Security Notes

| Area | Implementation |
|---|---|
| Password hashing | bcrypt, 10 salt rounds |
| Token expiry | JWT 24h; session idle timeout 5 min (server-enforced) |
| Input validation | express-validator on all POST/PUT endpoints |
| Role enforcement | `authorizeRole` middleware on every sensitive route |
| Category validation | Against `product_categories` table (not hardcoded) |
| Self-protection | Admin cannot disable or delete their own account |
| Stock protection | Sales blocked server-side if stock is insufficient |

---

## Copyright

© 2026 Shri Lakshmi Vigneswara Traders.
Developed by dvvshivaram · dvvshivaram@gmail.com · +91 70369 53734