# Comprehensive Test Strategy — SLVT Inventory Management System

## 1. Executive Summary

This document defines the test strategy for the **Shri Lakshmi Vigneswara Traders (SLVT) Inventory Management System** — a full-stack Node.js/Express + React application with SQLite database, JWT authentication, role-based access control, and complex multi-step business workflows for managing agricultural product inventory, sales, purchases, banking, and reporting.

---

## 2. Scope

### 2.1 In-Scope

| Layer | Area | Coverage |
|-------|------|----------|
| **API / Backend** | Authentication & Session Management | Login, logout, token validation, idle timeout, role-based access |
| **API / Backend** | User Management | CRUD for admin/operator users, status toggling, self-action prevention |
| **API / Backend** | Inventory Management | Product CRUD, category management, stock add, auto-ID generation, soft delete, dual creation modes (inventory/order) |
| **API / Backend** | Sales Flow | Multi-item cart, stock deduction, receipt generation, payment modes (cash/card/UPI), auto bank deposit |
| **API / Backend** | Purchase Management | Order lifecycle (ordered → delivered), advance payments, stock updates on delivery |
| **API / Backend** | Transactions | Bank accounts CRUD, bank transfers (deposit/withdrawal), expenditures, supplier payments, daily balance tracking |
| **API / Backend** | Daily Setup Workflow | Admin setup gate, bank selection, balance review, operator blocking |
| **API / Backend** | Dashboard | Admin/operator role-specific dashboards, quick stats |
| **API / Backend** | Reports | All 9 report types with date filtering |
| **API / Backend** | Notifications | In-memory review notifications (operator actions for admin review) |
| **API / Backend** | Data Integrity | Transaction atomicity, foreign key constraints, balance consistency |
| **Frontend** | Component rendering | Login, Dashboard, Inventory, Sales, Purchases, Transactions, Reports, Users |
| **Frontend** | Auth context | Token management, session polling, idle timeout |
| **E2E** | Critical workflows | Login → daily setup → sale → receipt, full purchase lifecycle |

### 2.2 Out-of-Scope
- Performance/load testing
- Security penetration testing
- Mobile responsiveness testing
- Third-party service integration testing
- Deployment pipeline testing

---

## 3. Test Architecture

```
tests/
├── server/                          # Backend API tests
│   ├── setup/
│   │   ├── testDb.js               # In-memory SQLite test database
│   │   └── testHelpers.js          # Auth helpers, factories
│   ├── auth.test.js                # Authentication & user management
│   ├── inventory.test.js           # Product/category CRUD, stock
│   ├── sales.test.js               # Sales, receipts, payment flows
│   ├── purchases.test.js           # Purchase orders, delivery, advance
│   ├── transactions.test.js        # Bank, expenditures, supplier payments
│   ├── dashboard.test.js           # Dashboard endpoints
│   ├── reports.test.js             # Report generation
│   ├── notifications.test.js       # Review notifications
│   ├── dailySetup.test.js          # Daily setup workflow
│   └── middleware.test.js          # Auth & daily setup middleware
├── client/                          # Frontend component tests
│   ├── components/
│   │   ├── Login.test.js
│   │   ├── Dashboard.test.js
│   │   ├── Inventory.test.js
│   │   ├── Sales.test.js
│   │   └── Layout.test.js
│   └── contexts/
│       └── AuthContext.test.js
└── e2e/                             # End-to-end integration tests
    ├── setup/
    │   └── e2eHelpers.js
    ├── salesWorkflow.e2e.test.js
    ├── purchaseWorkflow.e2e.test.js
    └── dailySetupWorkflow.e2e.test.js
```

---

## 4. Test Types & Tools

| Test Type | Tool | Purpose |
|-----------|------|---------|
| Unit / Integration (API) | **Jest** + **Supertest** | HTTP endpoint testing against in-memory SQLite |
| Component (Frontend) | **Jest** + **React Testing Library** | React component rendering & interaction |
| E2E (Full-stack) | **Jest** + **Supertest** | Multi-step business workflow validation |

---

## 5. Test Categories & Coverage Matrix

### 5.1 Authentication (15 test cases)
- ✅ Login with valid credentials → token + session
- ✅ Login with invalid username → 401
- ✅ Login with wrong password → 401
- ✅ Login with disabled account → 403
- ✅ Login with empty fields → 400 validation
- ✅ Logout → session destroyed
- ✅ Access protected route without token → 401
- ✅ Access protected route with invalid token → 403
- ✅ Session idle timeout (>5 min) → 401
- ✅ Get current user (/me) → user info
- ✅ Login logging (IP, user-agent) → audit trail

### 5.2 User Management (10 test cases)
- ✅ Admin creates user → 201
- ✅ Admin creates duplicate username → 400
- ✅ Admin creates user with short password → 400
- ✅ Admin gets all users → user list
- ✅ Admin toggles user status → updated
- ✅ Admin cannot change own status → 400
- ✅ Admin deletes user → 200
- ✅ Admin cannot delete self → 400
- ✅ Operator cannot create user → 403
- ✅ Operator cannot access user list → 403

### 5.3 Inventory Management (20 test cases)
- ✅ Get all products → product list
- ✅ Get products with category filter
- ✅ Get products with search filter
- ✅ Get single product by ID
- ✅ Get product not found → 404
- ✅ Generate next product ID by category
- ✅ Create product in inventory mode → stock added + purchase created
- ✅ Create product in order mode → zero stock + ordered purchase
- ✅ Create product with advance payment → bank deducted
- ✅ Create product with auto-generated ID
- ✅ Create product with duplicate ID → 400
- ✅ Create product with invalid category → 400
- ✅ Create product with invalid unit → 400
- ✅ Update product selling price
- ✅ Delete product (no sales) → hard delete
- ✅ Delete product (with purchases) → soft delete
- ✅ Delete product (with sales) → 400 blocked
- ✅ Add stock to existing product
- ✅ Only admin can delete product
- ✅ Category CRUD (create, list, delete)

### 5.4 Sales Flow (18 test cases)
- ✅ Create single-item sale (cash) → receipt + stock deducted
- ✅ Create multi-item sale → shared receipt
- ✅ Sale with card payment → auto bank deposit
- ✅ Sale with UPI payment → auto bank deposit
- ✅ Sale with insufficient stock → 400
- ✅ Sale with non-existent product → 404
- ✅ Sale with empty items → 400
- ✅ Sale with UPI but no bank selected → 400
- ✅ Sale with UPI but no bank accounts → 400
- ✅ Get sales with date range filter
- ✅ Get single sale details → items + receipt
- ✅ Get all receipts
- ✅ Mark receipt as printed
- ✅ Receipt number format validation (R-YYYYMMDD-name-XX)
- ✅ Customer sales archive created on sale
- ✅ Stock quantity correctly after multiple sales
- ✅ Sale blocked for operator without daily setup → 403
- ✅ Review notification created for operator sale

### 5.5 Purchase Management (15 test cases)
- ✅ Record delivered purchase → stock updated
- ✅ Record ordered purchase → stock unchanged
- ✅ Record purchase with advance → bank deducted
- ✅ Advance exceeds total → 400
- ✅ Advance without supplier → 400
- ✅ Advance without bank account → 400
- ✅ Mark ordered purchase as delivered → stock updated
- ✅ Mark already-delivered purchase → 400
- ✅ Edit purchase quantity (delivered) → stock adjusted
- ✅ Delete purchase (admin only)
- ✅ Get purchases with filters
- ✅ Purchase creates review notification
- ✅ Category CRUD (create, get, delete)
- ✅ Cannot delete category in use → 400
- ✅ Duplicate category → 400

### 5.6 Transactions (22 test cases)
- ✅ Create bank account (admin only)
- ✅ Update bank account details
- ✅ Delete (deactivate) bank account
- ✅ Get all active bank accounts
- ✅ Get bank statement with date range
- ✅ Create bank deposit → balance increased
- ✅ Create bank withdrawal → balance decreased
- ✅ Withdrawal exceeding balance → 400
- ✅ Withdrawal with business_expense purpose → creates expenditure
- ✅ Delete bank transfer → balance reversed
- ✅ Cannot delete non-manual transfer → 400
- ✅ Create expenditure
- ✅ Delete expenditure (admin only)
- ✅ Get expenditures with date filter
- ✅ Create supplier payment (cash) → no bank effect
- ✅ Create supplier payment (bank) → balance deducted + transfer created
- ✅ Create supplier payment (UPI) → balance deducted
- ✅ Supplier payment insufficient funds → 400
- ✅ Delete supplier payment → balance reversed
- ✅ Get supplier balances → purchased vs paid
- ✅ Get daily summary → aggregated financials
- ✅ Daily balance snapshot calculation

### 5.7 Daily Setup Workflow (10 test cases)
- ✅ Get daily setup status
- ✅ Admin selects bank for today
- ✅ Admin reviews daily balance
- ✅ Review before bank selection → 400
- ✅ Operator blocked when setup incomplete → 403
- ✅ Operator unblocked after setup complete
- ✅ Daily setup status reflects bank accounts
- ✅ Bank deactivation clears daily selection
- ✅ Admin not blocked by setup gate
- ✅ Setup persists for business date

### 5.8 Dashboard (8 test cases)
- ✅ Admin dashboard → summary, alerts, analytics
- ✅ Operator dashboard → inventory, sales summary, popular items
- ✅ Quick stats → today + monthly aggregates
- ✅ Admin sees low stock alerts
- ✅ Admin sees pending orders
- ✅ Admin sees weekly comparison
- ✅ Operator cannot access admin dashboard → 403
- ✅ Operator sees own sales only

### 5.9 Notifications (5 test cases)
- ✅ Admin lists notifications
- ✅ Admin deletes single notification
- ✅ Admin clears all notifications
- ✅ Operator actions generate notifications
- ✅ Operator cannot access notifications → 403

### 5.10 Data Integrity (8 test cases)
- ✅ Transaction rollback on error
- ✅ Concurrent stock modification handling
- ✅ Balance consistency after complex operations
- ✅ Soft delete preserves relational data
- ✅ Foreign key constraints enforced
- ✅ Auto-generated IDs are sequential
- ✅ IST timezone consistency
- ✅ Receipt number uniqueness

---

## 6. Environment Strategy

| Environment | Database | Purpose |
|-------------|----------|---------|
| Test (API) | In-memory SQLite (`:memory:`) | Fast, isolated per test suite |
| Test (E2E) | In-memory SQLite (`:memory:`) | Full workflow validation |
| Test (Frontend) | Mocked API (Jest mocks) | Component behavior testing |

---

## 7. Risk-Based Priority

| Priority | Area | Risk |
|----------|------|------|
| **P0 — Critical** | Authentication, Sales flow, Stock integrity | Revenue loss, data corruption |
| **P1 — High** | Purchase lifecycle, Bank transactions, Daily setup gate | Financial accuracy |
| **P2 — Medium** | Reports, Dashboard, Notifications | Operational visibility |
| **P3 — Low** | User management, Category management | Administrative convenience |

---

## 8. Entry / Exit Criteria

**Entry Criteria:**
- All dependencies installed
- Test database initializes without errors
- Application server starts successfully

**Exit Criteria:**
- All P0/P1 tests pass (100%)
- P2 tests pass (>95%)
- No critical/high severity defects open
- Code coverage >80% for server routes

---

## 9. Execution

```bash
# Run all server tests
cd server && npm test

# Run all client tests
cd client && npm test

# Run specific test suite
npm test -- --testPathPattern=auth

# Run with coverage
npm test -- --coverage
```
