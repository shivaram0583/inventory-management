const request = require('supertest');
const { createTestDb, initializeTestSchema, seedTestUsers } = require('./setup/testDb');
const { createTestApp, loginUser, createTestBankAccount, completeDailySetup } = require('./setup/testHelpers');

let testDb, app, adminAuth, operatorAuth, bankAccount;

beforeAll(async () => {
  testDb = createTestDb();
  await initializeTestSchema(testDb);
  await seedTestUsers(testDb);
  app = createTestApp(testDb);
  adminAuth = await loginUser(testDb, 'admin', 'admin123');
  operatorAuth = await loginUser(testDb, 'operator', 'operator123');
  bankAccount = await createTestBankAccount(testDb, { balance: 50000 });
  await completeDailySetup(testDb, bankAccount.id, adminAuth.user.id);
});

afterAll(async () => {
  await testDb.close();
});

describe('Transactions', () => {
  // ─── BANK ACCOUNTS ─────────────────────────────────────────────────────
  describe('Bank Accounts', () => {
    describe('GET /api/transactions/bank-accounts', () => {
      test('should get all active bank accounts', async () => {
        const res = await request(app)
          .get('/api/transactions/bank-accounts')
          .set('Authorization', `Bearer ${adminAuth.token}`);

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body.length).toBeGreaterThanOrEqual(1);
      });
    });

    describe('POST /api/transactions/bank-accounts', () => {
      test('admin should create bank account', async () => {
        const res = await request(app)
          .post('/api/transactions/bank-accounts')
          .set('Authorization', `Bearer ${adminAuth.token}`)
          .send({
            account_name: 'Savings Account',
            bank_name: 'SBI',
            account_number: '9876543210',
            balance: 25000
          });

        expect(res.status).toBe(201);
        expect(res.body.account_name).toBe('Savings Account');
        expect(res.body.balance).toBe(25000);
      });

      test('operator cannot create bank account', async () => {
        const res = await request(app)
          .post('/api/transactions/bank-accounts')
          .set('Authorization', `Bearer ${operatorAuth.token}`)
          .send({
            account_name: 'Op Account',
            bank_name: 'HDFC'
          });

        expect(res.status).toBe(403);
      });

      test('should reject without account name', async () => {
        const res = await request(app)
          .post('/api/transactions/bank-accounts')
          .set('Authorization', `Bearer ${adminAuth.token}`)
          .send({ bank_name: 'SBI' });

        expect(res.status).toBe(400);
      });

      test('should reject without bank name', async () => {
        const res = await request(app)
          .post('/api/transactions/bank-accounts')
          .set('Authorization', `Bearer ${adminAuth.token}`)
          .send({ account_name: 'Test' });

        expect(res.status).toBe(400);
      });
    });

    describe('PUT /api/transactions/bank-accounts/:id', () => {
      test('should update bank account details', async () => {
        const res = await request(app)
          .put(`/api/transactions/bank-accounts/${bankAccount.id}`)
          .set('Authorization', `Bearer ${adminAuth.token}`)
          .send({ account_name: 'Updated Account' });

        expect(res.status).toBe(200);
        expect(res.body.account_name).toBe('Updated Account');
      });

      test('should return 404 for non-existent account', async () => {
        const res = await request(app)
          .put('/api/transactions/bank-accounts/99999')
          .set('Authorization', `Bearer ${adminAuth.token}`)
          .send({ account_name: 'Ghost Account' });

        expect(res.status).toBe(404);
      });
    });

    describe('DELETE /api/transactions/bank-accounts/:id', () => {
      test('should deactivate bank account', async () => {
        const account = await createTestBankAccount(testDb, {
          account_name: 'To Deactivate',
          bank_name: 'Delete Bank'
        });

        const res = await request(app)
          .delete(`/api/transactions/bank-accounts/${account.id}`)
          .set('Authorization', `Bearer ${adminAuth.token}`);

        expect(res.status).toBe(200);

        const deactivated = await testDb.getRow('SELECT is_active FROM bank_accounts WHERE id = ?', [account.id]);
        expect(deactivated.is_active).toBe(0);
      });
    });
  });

  // ─── BANK TRANSFERS ────────────────────────────────────────────────────
  describe('Bank Transfers', () => {
    describe('POST /api/transactions/bank-transfers', () => {
      test('should create bank deposit', async () => {
        const initialBalance = (await testDb.getRow('SELECT balance FROM bank_accounts WHERE id = ?', [bankAccount.id])).balance;

        const res = await request(app)
          .post('/api/transactions/bank-transfers')
          .set('Authorization', `Bearer ${adminAuth.token}`)
          .send({
            bank_account_id: bankAccount.id,
            amount: 5000,
            transfer_type: 'deposit',
            transfer_date: '2026-04-04',
            description: 'Cash deposit'
          });

        expect(res.status).toBe(201);
        expect(res.body.transfer_type).toBe('deposit');

        const newBalance = (await testDb.getRow('SELECT balance FROM bank_accounts WHERE id = ?', [bankAccount.id])).balance;
        expect(newBalance).toBe(initialBalance + 5000);
      });

      test('should create bank withdrawal', async () => {
        const initialBalance = (await testDb.getRow('SELECT balance FROM bank_accounts WHERE id = ?', [bankAccount.id])).balance;

        const res = await request(app)
          .post('/api/transactions/bank-transfers')
          .set('Authorization', `Bearer ${adminAuth.token}`)
          .send({
            bank_account_id: bankAccount.id,
            amount: 2000,
            transfer_type: 'withdrawal',
            transfer_date: '2026-04-04',
            description: 'Cash withdrawal'
          });

        expect(res.status).toBe(201);
        expect(res.body.transfer_type).toBe('withdrawal');

        const newBalance = (await testDb.getRow('SELECT balance FROM bank_accounts WHERE id = ?', [bankAccount.id])).balance;
        expect(newBalance).toBe(initialBalance - 2000);
      });

      test('should reject withdrawal exceeding balance', async () => {
        const res = await request(app)
          .post('/api/transactions/bank-transfers')
          .set('Authorization', `Bearer ${adminAuth.token}`)
          .send({
            bank_account_id: bankAccount.id,
            amount: 999999999,
            transfer_type: 'withdrawal',
            transfer_date: '2026-04-04'
          });

        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/Insufficient/);
      });

      test('should create expenditure for business_expense withdrawal', async () => {
        const res = await request(app)
          .post('/api/transactions/bank-transfers')
          .set('Authorization', `Bearer ${adminAuth.token}`)
          .send({
            bank_account_id: bankAccount.id,
            amount: 1000,
            transfer_type: 'withdrawal',
            transfer_date: '2026-04-04',
            description: 'Office supplies',
            withdrawal_purpose: 'business_expense'
          });

        expect(res.status).toBe(201);

        // Check expenditure was created
        const expenditure = await testDb.getRow(
          "SELECT * FROM expenditures WHERE category = 'bank_withdrawal' AND amount = 1000"
        );
        expect(expenditure).toBeDefined();
      });

      test('operator cannot create bank transfer', async () => {
        const res = await request(app)
          .post('/api/transactions/bank-transfers')
          .set('Authorization', `Bearer ${operatorAuth.token}`)
          .send({
            bank_account_id: bankAccount.id,
            amount: 100,
            transfer_type: 'deposit',
            transfer_date: '2026-04-04'
          });

        expect(res.status).toBe(403);
      });
    });

    describe('GET /api/transactions/bank-transfers', () => {
      test('should get bank transfers', async () => {
        const res = await request(app)
          .get('/api/transactions/bank-transfers')
          .set('Authorization', `Bearer ${adminAuth.token}`);

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body.length).toBeGreaterThan(0);
      });

      test('should filter by date', async () => {
        const res = await request(app)
          .get('/api/transactions/bank-transfers?date=2026-04-04')
          .set('Authorization', `Bearer ${adminAuth.token}`);

        expect(res.status).toBe(200);
      });
    });

    describe('DELETE /api/transactions/bank-transfers/:id', () => {
      test('should delete manual transfer and reverse balance', async () => {
        // Create a deposit
        const depositRes = await request(app)
          .post('/api/transactions/bank-transfers')
          .set('Authorization', `Bearer ${adminAuth.token}`)
          .send({
            bank_account_id: bankAccount.id,
            amount: 3000,
            transfer_type: 'deposit',
            transfer_date: '2026-04-04',
            description: 'To delete'
          });

        const balanceBefore = (await testDb.getRow('SELECT balance FROM bank_accounts WHERE id = ?', [bankAccount.id])).balance;

        const res = await request(app)
          .delete(`/api/transactions/bank-transfers/${depositRes.body.id}`)
          .set('Authorization', `Bearer ${adminAuth.token}`);

        expect(res.status).toBe(200);

        const balanceAfter = (await testDb.getRow('SELECT balance FROM bank_accounts WHERE id = ?', [bankAccount.id])).balance;
        expect(balanceAfter).toBe(balanceBefore - 3000);
      });

      test('should reject deleting non-manual transfer', async () => {
        // Create a transfer with non-manual source_type
        const result = await testDb.runQuery(
          `INSERT INTO bank_transfers (bank_account_id, amount, transfer_type, source_type, source_reference, transfer_date)
           VALUES (?, 100, 'deposit', 'sale', 'SALE123', '2026-04-04')`,
          [bankAccount.id]
        );

        const res = await request(app)
          .delete(`/api/transactions/bank-transfers/${result.id}`)
          .set('Authorization', `Bearer ${adminAuth.token}`);

        expect(res.status).toBe(400);
      });
    });
  });

  // ─── EXPENDITURES ──────────────────────────────────────────────────────
  describe('Expenditures', () => {
    describe('POST /api/transactions/expenditures', () => {
      test('should create expenditure', async () => {
        const res = await request(app)
          .post('/api/transactions/expenditures')
          .set('Authorization', `Bearer ${adminAuth.token}`)
          .send({
            amount: 500,
            description: 'Electricity bill',
            expense_date: '2026-04-04',
            category: 'utilities'
          });

        expect(res.status).toBe(201);
        expect(res.body.amount).toBe(500);
        expect(res.body.description).toBe('Electricity bill');
      });

      test('should reject zero amount', async () => {
        const res = await request(app)
          .post('/api/transactions/expenditures')
          .set('Authorization', `Bearer ${adminAuth.token}`)
          .send({
            amount: 0,
            description: 'Zero expense',
            expense_date: '2026-04-04'
          });

        expect(res.status).toBe(400);
      });

      test('should reject without description', async () => {
        const res = await request(app)
          .post('/api/transactions/expenditures')
          .set('Authorization', `Bearer ${adminAuth.token}`)
          .send({
            amount: 100,
            description: '',
            expense_date: '2026-04-04'
          });

        expect(res.status).toBe(400);
      });
    });

    describe('GET /api/transactions/expenditures', () => {
      test('should get expenditures', async () => {
        const res = await request(app)
          .get('/api/transactions/expenditures')
          .set('Authorization', `Bearer ${adminAuth.token}`);

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
      });

      test('should filter by date', async () => {
        const res = await request(app)
          .get('/api/transactions/expenditures?date=2026-04-04')
          .set('Authorization', `Bearer ${adminAuth.token}`);

        expect(res.status).toBe(200);
      });
    });

    describe('DELETE /api/transactions/expenditures/:id', () => {
      test('admin should delete expenditure', async () => {
        const expenditure = await testDb.getRow("SELECT id FROM expenditures WHERE description = 'Electricity bill'");

        const res = await request(app)
          .delete(`/api/transactions/expenditures/${expenditure.id}`)
          .set('Authorization', `Bearer ${adminAuth.token}`);

        expect(res.status).toBe(200);
      });

      test('should return 404 for non-existent expenditure', async () => {
        const res = await request(app)
          .delete('/api/transactions/expenditures/99999')
          .set('Authorization', `Bearer ${adminAuth.token}`);

        expect(res.status).toBe(404);
      });
    });
  });

  // ─── SUPPLIER PAYMENTS ─────────────────────────────────────────────────
  describe('Supplier Payments', () => {
    describe('POST /api/transactions/supplier-payments', () => {
      test('should create cash supplier payment (no bank effect)', async () => {
        const initialBalance = (await testDb.getRow('SELECT balance FROM bank_accounts WHERE id = ?', [bankAccount.id])).balance;

        const res = await request(app)
          .post('/api/transactions/supplier-payments')
          .set('Authorization', `Bearer ${adminAuth.token}`)
          .send({
            supplier_name: 'Cash Supplier',
            amount: 2000,
            payment_mode: 'cash',
            payment_date: '2026-04-04',
            description: 'Cash payment'
          });

        expect(res.status).toBe(201);
        expect(res.body.payment_mode).toBe('cash');

        const newBalance = (await testDb.getRow('SELECT balance FROM bank_accounts WHERE id = ?', [bankAccount.id])).balance;
        expect(newBalance).toBe(initialBalance); // No effect on bank
      });

      test('should create bank supplier payment (deducts from bank)', async () => {
        const initialBalance = (await testDb.getRow('SELECT balance FROM bank_accounts WHERE id = ?', [bankAccount.id])).balance;

        const res = await request(app)
          .post('/api/transactions/supplier-payments')
          .set('Authorization', `Bearer ${adminAuth.token}`)
          .send({
            supplier_name: 'Bank Supplier',
            amount: 3000,
            payment_mode: 'bank',
            bank_account_id: bankAccount.id,
            payment_date: '2026-04-04',
            description: 'Bank payment'
          });

        expect(res.status).toBe(201);

        const newBalance = (await testDb.getRow('SELECT balance FROM bank_accounts WHERE id = ?', [bankAccount.id])).balance;
        expect(newBalance).toBe(initialBalance - 3000);
      });

      test('should create UPI supplier payment (deducts from bank)', async () => {
        const initialBalance = (await testDb.getRow('SELECT balance FROM bank_accounts WHERE id = ?', [bankAccount.id])).balance;

        const res = await request(app)
          .post('/api/transactions/supplier-payments')
          .set('Authorization', `Bearer ${adminAuth.token}`)
          .send({
            supplier_name: 'UPI Supplier',
            amount: 1500,
            payment_mode: 'upi',
            bank_account_id: bankAccount.id,
            payment_date: '2026-04-04'
          });

        expect(res.status).toBe(201);

        const newBalance = (await testDb.getRow('SELECT balance FROM bank_accounts WHERE id = ?', [bankAccount.id])).balance;
        expect(newBalance).toBe(initialBalance - 1500);
      });

      test('should reject bank payment without bank account', async () => {
        const res = await request(app)
          .post('/api/transactions/supplier-payments')
          .set('Authorization', `Bearer ${adminAuth.token}`)
          .send({
            supplier_name: 'No Bank',
            amount: 1000,
            payment_mode: 'bank',
            payment_date: '2026-04-04'
          });

        expect(res.status).toBe(400);
      });

      test('should reject invalid payment mode', async () => {
        const res = await request(app)
          .post('/api/transactions/supplier-payments')
          .set('Authorization', `Bearer ${adminAuth.token}`)
          .send({
            supplier_name: 'Invalid Mode',
            amount: 1000,
            payment_mode: 'crypto',
            payment_date: '2026-04-04'
          });

        expect(res.status).toBe(400);
      });
    });

    describe('GET /api/transactions/supplier-payments', () => {
      test('should get supplier payments', async () => {
        const res = await request(app)
          .get('/api/transactions/supplier-payments')
          .set('Authorization', `Bearer ${adminAuth.token}`);

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body.length).toBeGreaterThan(0);
      });

      test('should filter by supplier name', async () => {
        const res = await request(app)
          .get('/api/transactions/supplier-payments?supplier_name=Cash Supplier')
          .set('Authorization', `Bearer ${adminAuth.token}`);

        expect(res.status).toBe(200);
        res.body.forEach(p => expect(p.supplier_name).toBe('Cash Supplier'));
      });
    });

    describe('DELETE /api/transactions/supplier-payments/:id', () => {
      test('should delete supplier payment', async () => {
        const payment = await testDb.getRow("SELECT id FROM supplier_payments WHERE supplier_name = 'Cash Supplier'");

        const res = await request(app)
          .delete(`/api/transactions/supplier-payments/${payment.id}`)
          .set('Authorization', `Bearer ${adminAuth.token}`);

        expect(res.status).toBe(200);
      });

      test('should return 404 for non-existent payment', async () => {
        const res = await request(app)
          .delete('/api/transactions/supplier-payments/99999')
          .set('Authorization', `Bearer ${adminAuth.token}`);

        expect(res.status).toBe(404);
      });
    });
  });

  // ─── SUPPLIER BALANCES ─────────────────────────────────────────────────
  describe('Supplier Balances', () => {
    test('should get supplier balances', async () => {
      const res = await request(app)
        .get('/api/transactions/supplier-balances')
        .set('Authorization', `Bearer ${adminAuth.token}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  // ─── DAILY SUMMARY ────────────────────────────────────────────────────
  describe('Daily Summary', () => {
    test('should get daily summary', async () => {
      const res = await request(app)
        .get('/api/transactions/daily-summary?start_date=2026-04-01&end_date=2026-04-30')
        .set('Authorization', `Bearer ${adminAuth.token}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    test('should require date range', async () => {
      const res = await request(app)
        .get('/api/transactions/daily-summary')
        .set('Authorization', `Bearer ${adminAuth.token}`);

      expect(res.status).toBe(400);
    });
  });

  // ─── BANK STATEMENT ────────────────────────────────────────────────────
  describe('Bank Statement', () => {
    test('should get bank statement for date range', async () => {
      const res = await request(app)
        .get(`/api/transactions/bank-accounts/${bankAccount.id}/statement?start_date=2026-04-01&end_date=2026-04-30`)
        .set('Authorization', `Bearer ${adminAuth.token}`);

      expect(res.status).toBe(200);
      expect(res.body.account).toBeDefined();
      expect(res.body.transactions).toBeDefined();
      expect(res.body).toHaveProperty('opening_balance');
      expect(res.body).toHaveProperty('closing_balance');
    });

    test('should reject invalid date range', async () => {
      const res = await request(app)
        .get(`/api/transactions/bank-accounts/${bankAccount.id}/statement?start_date=invalid&end_date=2026-04-30`)
        .set('Authorization', `Bearer ${adminAuth.token}`);

      expect(res.status).toBe(400);
    });

    test('should return 404 for non-existent bank account', async () => {
      const res = await request(app)
        .get('/api/transactions/bank-accounts/99999/statement?start_date=2026-04-01&end_date=2026-04-30')
        .set('Authorization', `Bearer ${adminAuth.token}`);

      expect(res.status).toBe(404);
    });
  });
});
