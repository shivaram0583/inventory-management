const express = require('express');
const { authenticateToken, authorizeRole } = require('../middleware/auth');
const { getRow, getAll } = require('../database/db');
const moment = require('moment');

const router = express.Router();

// Admin dashboard data
router.get('/admin', [
  authenticateToken,
  authorizeRole(['admin'])
], async (req, res) => {
  try {
    const today = moment().utcOffset('+05:30').format('YYYY-MM-DD');
    
    // Total stock available
    const totalStock = await getRow(
      `SELECT 
        SUM(quantity_available) as total_quantity,
        SUM(quantity_available * selling_price) as total_value,
        COUNT(*) as total_products
       FROM products`
    );

    // Today's sales
    const todaySales = await getRow(
      `SELECT 
        COUNT(DISTINCT sale_id) as transactions,
        SUM(quantity_sold) as items_sold,
        SUM(total_amount) as revenue
       FROM sales
       WHERE DATE(sale_date) = ?`,
      [today]
    );

    // Low stock alerts
    const lowStockItems = await getAll(
      `SELECT id, product_name, variety, quantity_available, unit
       FROM products
       WHERE quantity_available <= 10
       ORDER BY quantity_available ASC
       LIMIT 10`
    );

    // Recent sales (last 5)
    const recentSales = await getAll(
      `SELECT s.sale_id, s.total_amount, s.sale_date, p.product_name
       FROM sales s
       JOIN products p ON s.product_id = p.id
       ORDER BY s.sale_date DESC
       LIMIT 5`
    );

    // Sales comparison (last 7 days)
    const weekComparison = await getAll(
      `SELECT 
        DATE(sale_date) as date,
        SUM(total_amount) as revenue,
        COUNT(DISTINCT sale_id) as transactions
       FROM sales
       WHERE DATE(sale_date) >= date('${today}', '-7 days')
       GROUP BY DATE(sale_date)
       ORDER BY date DESC`
    );

    // Category performance
    const categoryPerformance = await getAll(
      `SELECT 
        p.category,
        COUNT(p.id) as product_count,
        SUM(p.quantity_available) as total_stock,
        COALESCE(SUM(s.total_amount), 0) as revenue
       FROM products p
       LEFT JOIN sales s ON p.id = s.product_id AND DATE(s.sale_date) = ?
       GROUP BY p.category`,
      [today]
    );

    res.json({
      summary: {
        total_stock: {
          quantity: totalStock?.total_quantity || 0,
          value: totalStock?.total_value || 0,
          products: totalStock?.total_products || 0
        },
        today_sales: {
          transactions: todaySales?.transactions || 0,
          items_sold: todaySales?.items_sold || 0,
          revenue: todaySales?.revenue || 0
        },
        low_stock_count: lowStockItems.length
      },
      alerts: {
        low_stock_items: lowStockItems
      },
      recent_activity: {
        sales: recentSales
      },
      analytics: {
        week_comparison: weekComparison,
        category_performance: categoryPerformance
      }
    });
  } catch (error) {
    console.error('Admin dashboard error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Operator dashboard data
router.get('/operator', [
  authenticateToken,
  authorizeRole(['operator', 'admin'])
], async (req, res) => {
  try {
    const today = moment().utcOffset('+05:30').format('YYYY-MM-DD');
    
    // Available inventory
    const inventory = await getAll(
      `SELECT id, product_id, product_name, variety, quantity_available, unit, selling_price
       FROM products
       WHERE quantity_available > 0
       ORDER BY product_name
       LIMIT 50`
    );

    // Today's sales summary for this operator
    const todaySales = await getRow(
      `SELECT 
        COUNT(DISTINCT sale_id) as transactions,
        SUM(quantity_sold) as items_sold,
        SUM(total_amount) as revenue
       FROM sales
       WHERE DATE(sale_date) = ? AND operator_id = ?`,
      [today, req.user.id]
    );

    // Recent sales by this operator
    const recentSales = await getAll(
      `SELECT s.sale_id, s.total_amount, s.sale_date, p.product_name
       FROM sales s
       JOIN products p ON s.product_id = p.id
       WHERE s.operator_id = ?
       ORDER BY s.sale_date DESC
       LIMIT 5`,
      [req.user.id]
    );

    // Quick search popular items
    const popularItems = await getAll(
      `SELECT 
        p.id,
        p.product_name,
        p.variety,
        p.quantity_available,
        p.unit,
        p.selling_price,
        COUNT(s.id) as sales_count
       FROM products p
       LEFT JOIN sales s ON p.id = s.product_id AND DATE(s.sale_date) = ?
       WHERE p.quantity_available > 0
       GROUP BY p.id, p.product_name, p.variety, p.quantity_available, p.unit, p.selling_price
       ORDER BY sales_count DESC, p.product_name
       LIMIT 10`,
      [today]
    );

    res.json({
      inventory: inventory.slice(0, 20), // Limit to 20 items for dashboard
      today_summary: {
        transactions: todaySales?.transactions || 0,
        items_sold: todaySales?.items_sold || 0,
        revenue: todaySales?.revenue || 0
      },
      recent_sales: recentSales,
      popular_items: popularItems
    });
  } catch (error) {
    console.error('Operator dashboard error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Quick stats widget
router.get('/quick-stats', authenticateToken, async (req, res) => {
  try {
    const today = moment().utcOffset('+05:30').format('YYYY-MM-DD');
    const thisMonth = moment().utcOffset('+05:30').format('YYYY-MM');
    
    const stats = await getRow(
      `SELECT 
        (SELECT COUNT(*) FROM products) as total_products,
        (SELECT SUM(quantity_available) FROM products) as total_stock,
        (SELECT COUNT(DISTINCT sale_id) FROM sales WHERE DATE(sale_date) = ?) as today_transactions,
        (SELECT SUM(total_amount) FROM sales WHERE DATE(sale_date) = ?) as today_revenue,
        (SELECT COUNT(DISTINCT sale_id) FROM sales WHERE strftime('%Y-%m', sale_date) = ?) as month_transactions,
        (SELECT SUM(total_amount) FROM sales WHERE strftime('%Y-%m', sale_date) = ?) as month_revenue`,
      [today, today, thisMonth, thisMonth]
    );

    res.json({
      total_products: stats?.total_products || 0,
      total_stock: stats?.total_stock || 0,
      today_transactions: stats?.today_transactions || 0,
      today_revenue: stats?.today_revenue || 0,
      month_transactions: stats?.month_transactions || 0,
      month_revenue: stats?.month_revenue || 0
    });
  } catch (error) {
    console.error('Quick stats error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
