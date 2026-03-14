const { runQuery, getRow } = require('./database/db');
const moment = require('moment');

async function addSampleSales() {
  try {
    // Get product IDs and admin user ID
    const admin = await getRow('SELECT id FROM users WHERE username = ?', ['admin']);
    const products = await getRow('SELECT id, selling_price FROM products WHERE product_id = ?', ['SEED001']);
    const product2 = await getRow('SELECT id, selling_price FROM products WHERE product_id = ?', ['FERT001']);
    
    if (!admin || !products || !product2) {
      console.log('Required data not found');
      return;
    }

    // Add sample sales
    const sales = [
      {
        sale_id: 'SALE' + moment().format('YYYYMMDDHHmmss') + '001',
        product_id: products.id,
        quantity_sold: 5,
        price_per_unit: products.selling_price,
        total_amount: 5 * products.selling_price,
        operator_id: admin.id
      },
      {
        sale_id: 'SALE' + moment().format('YYYYMMDDHHmmss') + '002',
        product_id: product2.id,
        quantity_sold: 2,
        price_per_unit: product2.selling_price,
        total_amount: 2 * product2.selling_price,
        operator_id: admin.id
      }
    ];

    for (const sale of sales) {
      // Add sale record
      const saleResult = await runQuery(
        `INSERT INTO sales (sale_id, product_id, quantity_sold, price_per_unit, total_amount, operator_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [sale.sale_id, sale.product_id, sale.quantity_sold, sale.price_per_unit, sale.total_amount, sale.operator_id]
      );

      // Add receipt with unique number
      await runQuery(
        `INSERT INTO receipts (receipt_number, sale_id, customer_name, payment_mode, total_amount)
         VALUES (?, ?, ?, ?, ?)`,
        ['R' + moment().format('YYYYMMDDHHmmss') + Math.random().toString(36).substr(2, 6).toUpperCase(), saleResult.id, 'Sample Customer', 'cash', sale.total_amount]
      );

      // Update product stock
      await runQuery(
        'UPDATE products SET quantity_available = quantity_available - ? WHERE id = ?',
        [sale.quantity_sold, sale.product_id]
      );
    }

    console.log('Sample sales added successfully');
    process.exit(0);
  } catch (error) {
    console.error('Error adding sample sales:', error);
    process.exit(1);
  }
}

addSampleSales();
