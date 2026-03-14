const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { getRow, getAll } = require('../database/db');
const moment = require('moment');

const router = express.Router();

// Daily sales report
router.get('/daily-sales', authenticateToken, async (req, res) => {
  try {
    const { date = moment().format('YYYY-MM-DD') } = req.query;
    
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

    res.json({
      date,
      sales,
      summary: {
        total_transactions: summary?.total_transactions || 0,
        total_items_sold: summary?.total_items_sold || 0,
        total_revenue: summary?.total_revenue || 0
      }
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
      dateFilter = 'WHERE DATE(s.sale_date) BETWEEN ? AND ?';
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
       WHERE sale_date >= date('now', '-${months} months')
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

module.exports = router;
