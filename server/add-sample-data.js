const { runQuery } = require('./database/db');

async function addSampleData() {
  try {
    // Add sample products
    const products = [
      { product_id: 'SEED001', category: 'seeds', product_name: 'Paddy Seeds - Basmati', variety: 'Basmati 1121', quantity_available: 100, unit: 'kg', purchase_price: 40, selling_price: 50, supplier: 'Agri Seeds Corp' },
      { product_id: 'SEED002', category: 'seeds', product_name: 'Corn Seeds', variety: 'Sweet Corn', quantity_available: 50, unit: 'kg', purchase_price: 60, selling_price: 75, supplier: 'SeedMaster Ltd' },
      { product_id: 'SEED003', category: 'seeds', product_name: 'Cotton Seeds', variety: 'Bt Cotton', quantity_available: 25, unit: 'kg', purchase_price: 120, selling_price: 150, supplier: 'Cotton Seeds Co' },
      { product_id: 'FERT001', category: 'fertilizers', product_name: 'Urea', variety: '46% N', quantity_available: 200, unit: 'bag', purchase_price: 300, selling_price: 350, supplier: 'Fertilizer India' },
      { product_id: 'FERT002', category: 'fertilizers', product_name: 'DAP', variety: '18-46-0', quantity_available: 150, unit: 'bag', purchase_price: 1200, selling_price: 1400, supplier: 'Nutrient Supply' },
      { product_id: 'FERT003', category: 'fertilizers', product_name: 'Potash', variety: 'MOP', quantity_available: 8, unit: 'bag', purchase_price: 800, selling_price: 950, supplier: 'Fertilizer India' }
    ];

    for (const product of products) {
      await runQuery(
        `INSERT INTO products (product_id, category, product_name, variety, quantity_available, unit, purchase_price, selling_price, supplier)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [product.product_id, product.category, product.product_name, product.variety, product.quantity_available, product.unit, product.purchase_price, product.selling_price, product.supplier]
      );
    }

    console.log('Sample data added successfully');
    process.exit(0);
  } catch (error) {
    console.error('Error adding sample data:', error);
    process.exit(1);
  }
}

addSampleData();
