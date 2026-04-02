const express = require('express');
const { authenticateToken, authorizeRole } = require('../middleware/auth');
const { getRow, getAll, runQuery, nowIST } = require('../database/db');
const moment = require('moment');
const { getDailyBalanceSnapshot, getDailySetupRecord, getISTDateString } = require('../services/dailySetup');

const router = express.Router();

async function getCustomerSalesSelect() {
  const columns = await getAll('PRAGMA table_info(customer_sales)');
  const columnNames = new Set((columns || []).map((column) => column.name));
  const hasAmount = columnNames.has('amount');
  const hasPaymentMode = columnNames.has('payment_mode');

  const amountExpression = hasAmount
    ? `COALESCE(
         NULLIF(cs.amount, 0),
         (
           SELECT s.total_amount
           FROM sales s
           JOIN products p ON p.id = s.product_id
           WHERE s.sale_id = cs.sale_id
             AND p.product_name = cs.product_name
             AND COALESCE(s.quantity_sold, 0) = COALESCE(cs.quantity, 0)
           LIMIT 1
         ),
         (
           SELECT s.total_amount
           FROM sales s
           JOIN products p ON p.id = s.product_id
           WHERE s.sale_id = cs.sale_id
             AND p.product_name = cs.product_name
           ORDER BY s.id DESC
           LIMIT 1
         ),
         0
       )`
    : `COALESCE(
         (
           SELECT s.total_amount
           FROM sales s
           JOIN products p ON p.id = s.product_id
           WHERE s.sale_id = cs.sale_id
             AND p.product_name = cs.product_name
             AND COALESCE(s.quantity_sold, 0) = COALESCE(cs.quantity, 0)
           LIMIT 1
         ),
         (
           SELECT s.total_amount
           FROM sales s
           JOIN products p ON p.id = s.product_id
           WHERE s.sale_id = cs.sale_id
             AND p.product_name = cs.product_name
           ORDER BY s.id DESC
           LIMIT 1
         ),
         0
       )`;

  const paymentModeExpression = hasPaymentMode ? 'cs.payment_mode' : `'cash'`;

  return `
    SELECT
      cs.id,
      cs.sale_id,
      cs.receipt_id,
      cs.customer_name,
      cs.customer_mobile,
      cs.customer_address,
      cs.product_name,
      cs.quantity,
      ${amountExpression} AS amount,
      ${paymentModeExpression} AS payment_mode,
      cs.sale_date,
      cs.created_at
    FROM customer_sales cs
  `;
}

// Daily sales report
router.get('/daily-sales', authenticateToken, async (req, res) => {
  try {
    const { date = moment().utcOffset('+05:30').format('YYYY-MM-DD') } = req.query;
    
    const sales = await getAll(
      `SELECT 
        s.product_id,
        p.product_name,
        p.variety,
        p.unit,
        SUM(s.quantity_sold) as total_quantity,
        SUM(s.total_amount) as total_amount,
        COUNT(s.id) as transaction_count
       FROM sales s
       JOIN products p ON s.product_id = p.id
       WHERE DATE(s.sale_date) = ?
       GROUP BY s.product_id, p.product_name, p.variety, p.unit
       ORDER BY total_amount DESC`,
      [date]
    );

    const summary = await getRow(
      `SELECT 
        COUNT(DISTINCT sale_id) as total_transactions,
        SUM(quantity_sold) as total_items_sold,
        SUM(total_amount) as total_revenue
       FROM sales
       WHERE DATE(sale_date) = ?`,
      [date]
    );

    const customerSalesSelect = await getCustomerSalesSelect();
    const customerSales = await getAll(
      `${customerSalesSelect}
       WHERE DATE(cs.sale_date) = ?
       ORDER BY cs.sale_date DESC, cs.id DESC`,
      [date]
    );

    res.json({
      date,
      sales,
      summary: {
        total_transactions: summary?.total_transactions || 0,
        total_items_sold: summary?.total_items_sold || 0,
        total_revenue: summary?.total_revenue || 0
      },
      customerSales
    });
  } catch (error) {
    console.error('Daily sales report error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Sales report for date range
router.get('/sales-range', authenticateToken, async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    
    if (!start_date || !end_date) {
      return res.status(400).json({ message: 'Start date and end date are required' });
    }

    const sales = await getAll(
      `SELECT 
        DATE(s.sale_date) as sale_date,
        s.product_id,
        p.product_name,
        p.variety,
        p.unit,
        SUM(s.quantity_sold) as total_quantity,
        SUM(s.total_amount) as total_amount,
        COUNT(s.id) as transaction_count
       FROM sales s
       JOIN products p ON s.product_id = p.id
       WHERE DATE(s.sale_date) BETWEEN ? AND ?
       GROUP BY DATE(s.sale_date), s.product_id, p.product_name, p.variety, p.unit
       ORDER BY sale_date DESC, total_amount DESC`,
      [start_date, end_date]
    );

    const summary = await getRow(
      `SELECT 
        COUNT(DISTINCT sale_id) as total_transactions,
        SUM(quantity_sold) as total_items_sold,
        SUM(total_amount) as total_revenue
       FROM sales
       WHERE DATE(sale_date) BETWEEN ? AND ?`,
      [start_date, end_date]
    );

    // Group by date for better visualization
    const groupedByDate = {};
    sales.forEach(sale => {
      if (!groupedByDate[sale.sale_date]) {
        groupedByDate[sale.sale_date] = {
          date: sale.sale_date,
          items: [],
          daily_total: 0,
          daily_transactions: 0
        };
      }
      groupedByDate[sale.sale_date].items.push(sale);
      groupedByDate[sale.sale_date].daily_total += sale.total_amount;
      groupedByDate[sale.sale_date].daily_transactions += sale.transaction_count;
    });

    res.json({
      start_date,
      end_date,
      sales: Object.values(groupedByDate),
      summary: {
        total_transactions: summary?.total_transactions || 0,
        total_items_sold: summary?.total_items_sold || 0,
        total_revenue: summary?.total_revenue || 0
      }
    });
  } catch (error) {
    console.error('Sales range report error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Inventory status report
router.get('/inventory-status', authenticateToken, async (req, res) => {
  try {
    const { category } = req.query;
    
    let query = 'SELECT * FROM products WHERE 1=1';
    const params = [];

    if (category && category !== 'all') {
      query += ' AND category = ?';
      params.push(category);
    }

    query += ' ORDER BY category, product_name';

    const products = await getAll(query, params);

    // Calculate inventory statistics
    const stats = await getRow(
      `SELECT 
        COUNT(*) as total_products,
        SUM(quantity_available) as total_stock,
        SUM(quantity_available * selling_price) as total_value,
        COUNT(CASE WHEN quantity_available <= 10 THEN 1 END) as low_stock_count
       FROM products
       ${category && category !== 'all' ? 'WHERE category = ?' : ''}`,
      category && category !== 'all' ? [category] : []
    );

    // Group by category
    const categoryStats = await getAll(
      `SELECT 
        category,
        COUNT(*) as product_count,
        SUM(quantity_available) as total_quantity,
        SUM(quantity_available * selling_price) as total_value
       FROM products
       GROUP BY category
       ORDER BY category`
    );

    res.json({
      products,
      stats: {
        total_products: stats?.total_products || 0,
        total_stock: stats?.total_stock || 0,
        total_value: stats?.total_value || 0,
        low_stock_count: stats?.low_stock_count || 0
      },
      categoryStats
    });
  } catch (error) {
    console.error('Inventory status report error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Product performance report
router.get('/product-performance', authenticateToken, async (req, res) => {
  try {
    const { start_date, end_date, limit = 10 } = req.query;
    
    let dateFilter = '';
    const params = [];

    if (start_date && end_date) {
      dateFilter = "WHERE DATE(s.sale_date) BETWEEN ? AND ?";
      params.push(start_date, end_date);
    }

    const topProducts = await getAll(
      `SELECT 
        p.id,
        p.product_name,
        p.variety,
        p.category,
        p.unit,
        SUM(s.quantity_sold) as total_sold,
        SUM(s.total_amount) as total_revenue,
        COUNT(s.id) as transaction_count,
        AVG(s.price_per_unit) as avg_price
       FROM sales s
       JOIN products p ON s.product_id = p.id
       ${dateFilter}
       GROUP BY p.id, p.product_name, p.variety, p.category, p.unit
       ORDER BY total_revenue DESC
       LIMIT ?`,
      [...params, parseInt(limit)]
    );

    const leastSelling = await getAll(
      `SELECT 
        p.id,
        p.product_name,
        p.variety,
        p.category,
        p.unit,
        COALESCE(SUM(s.quantity_sold), 0) as total_sold,
        COALESCE(SUM(s.total_amount), 0) as total_revenue,
        COALESCE(COUNT(s.id), 0) as transaction_count
       FROM products p
       LEFT JOIN sales s ON p.id = s.product_id
       ${dateFilter ? `AND DATE(s.sale_date) BETWEEN ? AND ?` : ''}
       GROUP BY p.id, p.product_name, p.variety, p.category, p.unit
       ORDER BY total_revenue ASC
       LIMIT ?`,
      dateFilter ? [...params, parseInt(limit)] : [parseInt(limit)]
    );

    res.json({
      topProducts,
      leastSelling,
      period: { start_date, end_date }
    });
  } catch (error) {
    console.error('Product performance report error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Monthly sales trend
router.get('/monthly-trend', authenticateToken, async (req, res) => {
  try {
    const { months = 12 } = req.query;
    
    const trend = await getAll(
      `SELECT 
        strftime('%Y-%m', sale_date) as month,
        COUNT(DISTINCT sale_id) as transactions,
        SUM(quantity_sold) as items_sold,
        SUM(total_amount) as revenue
       FROM sales
       WHERE sale_date >= date('${moment().utcOffset('+05:30').format('YYYY-MM-DD')}', '-${months} months')
       GROUP BY strftime('%Y-%m', sale_date)
       ORDER BY month DESC`,
      []
    );

    res.json({
      trend,
      months: parseInt(months)
    });
  } catch (error) {
    console.error('Monthly trend report error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Purchase report
router.get('/purchases', authenticateToken, async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    let dateFilter = '';
    const params = [];

    if (start_date && end_date) {
      dateFilter = "WHERE DATE(pu.purchase_date) BETWEEN ? AND ?";
      params.push(start_date, end_date);
    }

    const purchases = await getAll(
      `SELECT 
        pu.id,
        pu.purchase_id,
        p.product_id AS product_code,
        p.product_name,
        p.variety,
        p.unit,
        p.category,
        pu.quantity,
        pu.price_per_unit,
        pu.total_amount,
        pu.supplier,
        pu.purchase_date,
        u.username AS added_by
       FROM purchases pu
       JOIN products p ON pu.product_id = p.id
       LEFT JOIN users u ON pu.added_by = u.id
       ${dateFilter}
       ORDER BY pu.purchase_date DESC`,
      params
    );

    const summary = await getRow(
      `SELECT 
        COUNT(*) as total_purchases,
        SUM(quantity) as total_items,
        SUM(total_amount) as total_cost
       FROM purchases
       ${start_date && end_date ? "WHERE DATE(purchase_date) BETWEEN ? AND ?" : ''}`,
      
      start_date && end_date ? [start_date, end_date] : []
    );

    res.json({
      purchases,
      summary: {
        total_purchases: summary?.total_purchases || 0,
        total_items: summary?.total_items || 0,
        total_cost: summary?.total_cost || 0
      }
    });
  } catch (error) {
    console.error('Purchase report error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Supplier report — all suppliers with items supplied, with optional date range
router.get('/suppliers', authenticateToken, async (req, res) => {
  try {
    const { start_date, end_date, supplier } = req.query;
    let dateFilter = '';
    const params = [];

    if (start_date && end_date) {
      dateFilter = "AND DATE(pu.purchase_date) BETWEEN ? AND ?";
      params.push(start_date, end_date);
    }

    let supplierFilter = '';
    if (supplier) {
      supplierFilter = 'AND pu.supplier = ?';
      params.push(supplier);
    }

    // Summary per supplier
    const suppliers = await getAll(`
      SELECT
        pu.supplier,
        COUNT(pu.id) AS total_purchases,
        SUM(pu.quantity) AS total_quantity,
        SUM(pu.total_amount) AS total_spent,
        COUNT(DISTINCT pu.product_id) AS products_supplied,
        MIN(pu.purchase_date) AS first_purchase,
        MAX(pu.purchase_date) AS last_purchase
      FROM purchases pu
      WHERE pu.supplier IS NOT NULL AND pu.supplier != ''
        ${dateFilter} ${supplierFilter}
      GROUP BY pu.supplier
      ORDER BY total_spent DESC
    `, params);

    // Detail rows per supplier-product
    const detailParams = [];
    let detailDateFilter = '';
    let detailSupplierFilter = '';
    if (start_date && end_date) {
      detailDateFilter = "AND DATE(pu.purchase_date) BETWEEN ? AND ?";
      detailParams.push(start_date, end_date);
    }
    if (supplier) {
      detailSupplierFilter = 'AND pu.supplier = ?';
      detailParams.push(supplier);
    }

    const details = await getAll(`
      SELECT
        pu.supplier,
        p.product_id AS product_code,
        p.product_name,
        p.variety,
        p.category,
        p.unit,
        SUM(pu.quantity) AS total_quantity,
        SUM(pu.total_amount) AS total_spent,
        COUNT(pu.id) AS purchase_count,
        MAX(pu.purchase_date) AS last_purchase
      FROM purchases pu
      JOIN products p ON pu.product_id = p.id
      WHERE pu.supplier IS NOT NULL AND pu.supplier != ''
        ${detailDateFilter} ${detailSupplierFilter}
      GROUP BY pu.supplier, p.id, p.product_id, p.product_name, p.variety, p.category, p.unit
      ORDER BY pu.supplier, total_spent DESC
    `, detailParams);

    const overallSummary = await getRow(`
      SELECT
        COUNT(DISTINCT supplier) AS total_suppliers,
        COUNT(*) AS total_purchases,
        SUM(total_amount) AS total_cost
      FROM purchases
      WHERE supplier IS NOT NULL AND supplier != ''
        ${start_date && end_date ? "AND DATE(purchase_date) BETWEEN ? AND ?" : ''}
        ${supplier ? 'AND supplier = ?' : ''}
    `, [...(start_date && end_date ? [start_date, end_date] : []), ...(supplier ? [supplier] : [])]);

    res.json({
      suppliers,
      details,
      summary: {
        total_suppliers: overallSummary?.total_suppliers || 0,
        total_purchases: overallSummary?.total_purchases || 0,
        total_cost: overallSummary?.total_cost || 0
      },
      range: { start_date, end_date }
    });
  } catch (error) {
    console.error('Supplier report error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Customer sales archive
router.get('/customer-sales', authenticateToken, async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    let dateFilter = '';
    const params = [];

    if (start_date && end_date) {
      dateFilter = "WHERE DATE(sale_date) BETWEEN ? AND ?";
      params.push(start_date, end_date);
    }

    const filterClause = dateFilter
      ? dateFilter.replace(/sale_date/g, 'cs.sale_date')
      : '';

    const customerSalesSelect = await getCustomerSalesSelect();
    const records = await getAll(
      `${customerSalesSelect}
       ${filterClause}
       ORDER BY cs.sale_date DESC, cs.id DESC`,
      params
    );

    res.json({
      records,
      range: { start_date, end_date }
    });
  } catch (error) {
    console.error('Customer sales archive error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/transactions', authenticateToken, async (req, res) => {
  try {
    const { start_date, end_date } = req.query;

    if (!start_date || !end_date) {
      return res.status(400).json({ message: 'Start date and end date are required' });
    }

    const dailyRows = [];
    const start = new Date(`${start_date}T00:00:00+05:30`);
    const end = new Date(`${end_date}T00:00:00+05:30`);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
      return res.status(400).json({ message: 'Invalid date range' });
    }

    for (let cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
      const businessDate = getISTDateString(cursor);
      const [balance, setup] = await Promise.all([
        getDailyBalanceSnapshot(businessDate),
        getDailySetupRecord(businessDate)
      ]);

      dailyRows.push({
        business_date: businessDate,
        opening_balance: balance.openingBalance,
        sales: balance.sales,
        expenditure: balance.expenditure,
        bank_deposits: balance.bankDeposits,
        bank_withdrawals: balance.bankWithdrawals,
        supplier_payments_cash: balance.supplierPaymentsCash,
        closing_balance: balance.closingBalance,
        selected_bank_account_id: setup?.selected_bank_account_id || null,
        selected_bank_account_name: setup?.selected_bank_account_name || null,
        selected_bank_name: setup?.selected_bank_name || null,
        bank_selected_at: setup?.bank_selected_at || null,
        balance_reviewed_at: setup?.balance_reviewed_at || null,
        balance_reviewed_by_name: setup?.balance_reviewed_by_name || null,
        opening_balance_snapshot: setup?.opening_balance_snapshot ?? null,
        closing_balance_snapshot: setup?.closing_balance_snapshot ?? null
      });
    }

    const [expenditures, bankTransfers, supplierPayments] = await Promise.all([
      getAll(`
        SELECT e.*, u.username as created_by_name
        FROM expenditures e
        LEFT JOIN users u ON u.id = e.created_by
        WHERE e.expense_date BETWEEN ? AND ?
        ORDER BY e.expense_date ASC, e.created_at ASC
      `, [start_date, end_date]),
      getAll(`
        SELECT bt.*, ba.account_name, ba.bank_name, u.username as created_by_name
        FROM bank_transfers bt
        JOIN bank_accounts ba ON ba.id = bt.bank_account_id
        LEFT JOIN users u ON u.id = bt.created_by
        WHERE bt.transfer_date BETWEEN ? AND ?
        ORDER BY bt.transfer_date ASC, bt.created_at ASC
      `, [start_date, end_date]),
      getAll(`
        SELECT sp.*, ba.account_name, ba.bank_name, u.username as created_by_name
        FROM supplier_payments sp
        LEFT JOIN bank_accounts ba ON ba.id = sp.bank_account_id
        LEFT JOIN users u ON u.id = sp.created_by
        WHERE sp.payment_date BETWEEN ? AND ?
        ORDER BY sp.payment_date ASC, sp.created_at ASC
      `, [start_date, end_date])
    ]);

    const summary = dailyRows.reduce((acc, row) => ({
      total_days: acc.total_days + 1,
      total_sales: acc.total_sales + Number(row.sales || 0),
      total_expenditure: acc.total_expenditure + Number(row.expenditure || 0),
      total_bank_deposits: acc.total_bank_deposits + Number(row.bank_deposits || 0),
      total_bank_withdrawals: acc.total_bank_withdrawals + Number(row.bank_withdrawals || 0),
      total_supplier_cash: acc.total_supplier_cash + Number(row.supplier_payments_cash || 0)
    }), {
      total_days: 0,
      total_sales: 0,
      total_expenditure: 0,
      total_bank_deposits: 0,
      total_bank_withdrawals: 0,
      total_supplier_cash: 0
    });

    res.json({
      range: { start_date, end_date },
      summary,
      dailyRows,
      expenditures,
      bankTransfers,
      supplierPayments
    });
  } catch (error) {
    console.error('Transactions report error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete customer sales record (admin only)
router.delete('/customer-sales/:id', authenticateToken, authorizeRole(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const record = await getRow('SELECT id FROM customer_sales WHERE id = ?', [id]);
    if (!record) {
      return res.status(404).json({ message: 'Record not found' });
    }
    await runQuery('DELETE FROM customer_sales WHERE id = ?', [id]);
    res.json({ message: 'Record deleted successfully' });
  } catch (error) {
    console.error('Delete customer sale error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
