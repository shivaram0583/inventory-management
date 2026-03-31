const { runQuery } = require('./database/db');

async function addSampleData() {
  try {
    await runQuery(`INSERT OR IGNORE INTO product_categories (name) VALUES ('tools')`);

    // Add sample products
    const products = [
      { product_id: 'SEED001', category: 'seeds', product_name: 'Paddy Seeds - Basmati', variety: 'Basmati 1121', quantity_available: 100, unit: 'kg', purchase_price: 40, selling_price: 50, supplier: 'Agri Seeds Corp' },
      { product_id: 'SEED002', category: 'seeds', product_name: 'Corn Seeds', variety: 'Sweet Corn', quantity_available: 50, unit: 'kg', purchase_price: 60, selling_price: 75, supplier: 'SeedMaster Ltd' },
      { product_id: 'SEED003', category: 'seeds', product_name: 'Cotton Seeds', variety: 'Bt Cotton', quantity_available: 25, unit: 'kg', purchase_price: 120, selling_price: 150, supplier: 'Cotton Seeds Co' },
      { product_id: 'FERT001', category: 'fertilizers', product_name: 'Urea', variety: '46% N', quantity_available: 200, unit: 'bag', purchase_price: 300, selling_price: 350, supplier: 'Fertilizer India' },
      { product_id: 'FERT002', category: 'fertilizers', product_name: 'DAP', variety: '18-46-0', quantity_available: 150, unit: 'bag', purchase_price: 1200, selling_price: 1400, supplier: 'Nutrient Supply' },
      { product_id: 'FERT003', category: 'fertilizers', product_name: 'Potash', variety: 'MOP', quantity_available: 8, unit: 'bag', purchase_price: 800, selling_price: 950, supplier: 'Fertilizer India' },
      { product_id: 'TOOL001', category: 'tools', product_name: 'Hand Sprayer', variety: '16 Liter Manual', quantity_available: 24, unit: 'pieces', purchase_price: 850, selling_price: 1100, supplier: 'Kisan Agri Tools' },
      { product_id: 'TOOL002', category: 'tools', product_name: 'Garden Hoe', variety: 'Forged Steel Blade', quantity_available: 18, unit: 'pieces', purchase_price: 320, selling_price: 450, supplier: 'GreenField Implements' },
      { product_id: 'TOOL003', category: 'tools', product_name: 'Pruning Shear', variety: 'Heavy Duty', quantity_available: 30, unit: 'pieces', purchase_price: 260, selling_price: 390, supplier: 'Falcon Farm Supplies' },
      { product_id: 'TOOL004', category: 'tools', product_name: 'PVC Watering Can', variety: '10 Liter', quantity_available: 20, unit: 'pieces', purchase_price: 210, selling_price: 320, supplier: 'AgroServe Traders' }
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
