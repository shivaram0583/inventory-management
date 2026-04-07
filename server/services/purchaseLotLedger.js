const crypto = require('crypto');

const LOT_SOURCE_TYPES = {
  PURCHASE: 'purchase',
  OPENING: 'opening',
  ADJUSTMENT: 'adjustment'
};

const ROUND_PRECISION = 1000000;

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const roundQuantity = (value) => Math.round(toNumber(value) * ROUND_PRECISION) / ROUND_PRECISION;

const normalizeSupplierName = (value) => String(value || '').trim();

const supplierMatches = (existingLot, supplierId, supplierName) => {
  const normalizedIncomingId = Number.isInteger(Number(supplierId)) && Number(supplierId) > 0 ? Number(supplierId) : null;
  const normalizedExistingId = Number.isInteger(Number(existingLot?.supplier_id)) && Number(existingLot?.supplier_id) > 0
    ? Number(existingLot.supplier_id)
    : null;

  if (normalizedExistingId || normalizedIncomingId) {
    return normalizedExistingId === normalizedIncomingId;
  }

  return normalizeSupplierName(existingLot?.supplier_name).toLowerCase() === normalizeSupplierName(supplierName).toLowerCase();
};

const createHttpError = (status, message) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

function getDbOps(ops) {
  if (!ops || typeof ops.getRow !== 'function' || typeof ops.getAll !== 'function' || typeof ops.runQuery !== 'function') {
    throw new Error('Database helpers are required for purchase lot operations');
  }

  return ops;
}

async function getProduct(productId, ops) {
  const { getRow } = getDbOps(ops);
  const product = await getRow('SELECT * FROM products WHERE id = ?', [productId]);
  if (!product) {
    throw createHttpError(404, 'Product not found');
  }
  return product;
}

async function getPurchaseLotByPurchaseId(purchaseId, ops) {
  const { getRow } = getDbOps(ops);
  return getRow('SELECT * FROM purchase_lots WHERE purchase_id = ?', [purchaseId]);
}

async function createStandaloneLot({
  productId,
  supplierId,
  supplierName,
  quantity,
  pricePerUnit,
  gstPercent,
  purchaseDate,
  deliveryDate,
  sourceType = LOT_SOURCE_TYPES.OPENING,
  eventTimestamp
}, ops) {
  const { getRow, runQuery } = getDbOps(ops);
  const quantityValue = roundQuantity(quantity);

  if (quantityValue <= 0) {
    return null;
  }

  const normalizedSupplierName = normalizeSupplierName(supplierName) || null;
  const result = await runQuery(
    `INSERT INTO purchase_lots (
       purchase_id,
       product_id,
       supplier_id,
       supplier_name,
       source_type,
       quantity_received,
       quantity_sold,
       quantity_returned,
       quantity_adjusted,
       quantity_remaining,
       price_per_unit,
       gst_percent,
       purchase_date,
       delivery_date,
       created_at,
       updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?, ?, ?, ?, ?, ?)`,
    [
      null,
      productId,
      supplierId || null,
      normalizedSupplierName,
      sourceType,
      quantityValue,
      quantityValue,
      toNumber(pricePerUnit),
      toNumber(gstPercent),
      purchaseDate || eventTimestamp,
      deliveryDate || purchaseDate || eventTimestamp,
      eventTimestamp,
      eventTimestamp
    ]
  );

  return getRow('SELECT * FROM purchase_lots WHERE id = ?', [result.id]);
}

async function syncPurchaseLotForPurchase({
  purchaseId,
  productId,
  supplierId,
  supplierName,
  deliveredQuantity,
  pricePerUnit,
  gstPercent,
  purchaseDate,
  deliveryDate,
  eventTimestamp,
  sourceType = LOT_SOURCE_TYPES.PURCHASE
}, ops) {
  const { getRow, runQuery } = getDbOps(ops);
  const existingLot = await getPurchaseLotByPurchaseId(purchaseId, ops);
  const quantityReceived = roundQuantity(deliveredQuantity);
  const normalizedSupplierName = normalizeSupplierName(supplierName) || null;

  if (existingLot) {
    const committedQuantity = roundQuantity(
      toNumber(existingLot.quantity_sold) +
      toNumber(existingLot.quantity_returned) +
      toNumber(existingLot.quantity_adjusted)
    );

    if (!supplierMatches(existingLot, supplierId, normalizedSupplierName) && committedQuantity > 0) {
      throw createHttpError(400, 'Cannot change the supplier after stock from this purchase has already moved');
    }

    if (quantityReceived <= 0) {
      if (committedQuantity > 0) {
        throw createHttpError(400, 'Cannot remove a delivered purchase lot after stock has already moved');
      }

      await runQuery('DELETE FROM purchase_lots WHERE id = ?', [existingLot.id]);
      return null;
    }

    if (quantityReceived < committedQuantity) {
      throw createHttpError(400, 'Delivered quantity cannot be less than stock already sold, returned, or adjusted');
    }

    await runQuery(
      `UPDATE purchase_lots SET
         product_id = ?,
         supplier_id = ?,
         supplier_name = ?,
         source_type = ?,
         quantity_received = ?,
         quantity_remaining = ?,
         price_per_unit = ?,
         gst_percent = ?,
         purchase_date = ?,
         delivery_date = ?,
         updated_at = ?
       WHERE id = ?`,
      [
        productId,
        supplierId || null,
        normalizedSupplierName,
        sourceType,
        quantityReceived,
        roundQuantity(quantityReceived - committedQuantity),
        toNumber(pricePerUnit),
        toNumber(gstPercent),
        purchaseDate || existingLot.purchase_date || eventTimestamp,
        deliveryDate || purchaseDate || existingLot.delivery_date || eventTimestamp,
        eventTimestamp,
        existingLot.id
      ]
    );

    return getRow('SELECT * FROM purchase_lots WHERE id = ?', [existingLot.id]);
  }

  if (quantityReceived <= 0) {
    return null;
  }

  const result = await runQuery(
    `INSERT INTO purchase_lots (
       purchase_id,
       product_id,
       supplier_id,
       supplier_name,
       source_type,
       quantity_received,
       quantity_sold,
       quantity_returned,
       quantity_adjusted,
       quantity_remaining,
       price_per_unit,
       gst_percent,
       purchase_date,
       delivery_date,
       created_at,
       updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?, ?, ?, ?, ?, ?)`,
    [
      purchaseId,
      productId,
      supplierId || null,
      normalizedSupplierName,
      sourceType,
      quantityReceived,
      quantityReceived,
      toNumber(pricePerUnit),
      toNumber(gstPercent),
      purchaseDate || eventTimestamp,
      deliveryDate || purchaseDate || eventTimestamp,
      eventTimestamp,
      eventTimestamp
    ]
  );

  return getRow('SELECT * FROM purchase_lots WHERE id = ?', [result.id]);
}

async function ensureTrackedStockCoverage({ productId, fallbackDate, eventTimestamp }, ops) {
  const { getRow } = getDbOps(ops);
  const product = await getProduct(productId, ops);
  const trackedRow = await getRow(
    'SELECT COALESCE(SUM(quantity_remaining), 0) AS tracked_remaining FROM purchase_lots WHERE product_id = ?',
    [productId]
  );

  const quantityGap = roundQuantity(toNumber(product.quantity_available) - toNumber(trackedRow?.tracked_remaining));
  if (quantityGap > 0) {
    await createStandaloneLot({
      productId,
      supplierId: product.supplier_id,
      supplierName: product.supplier,
      quantity: quantityGap,
      pricePerUnit: product.purchase_price,
      gstPercent: product.gst_percent,
      purchaseDate: fallbackDate || product.created_at || eventTimestamp,
      deliveryDate: fallbackDate || product.created_at || eventTimestamp,
      sourceType: LOT_SOURCE_TYPES.OPENING,
      eventTimestamp
    }, ops);
  }
}

async function fetchOpenLotsForProduct(productId, ops) {
  const { getAll } = getDbOps(ops);
  return getAll(
    `SELECT *
     FROM purchase_lots
     WHERE product_id = ?
       AND quantity_remaining > 0
     ORDER BY COALESCE(delivery_date, purchase_date, created_at) ASC, id ASC`,
    [productId]
  );
}

async function allocateSaleToLots({
  saleLineId,
  saleId,
  productId,
  quantity,
  saleDate,
  eventTimestamp
}, ops) {
  const { getRow, runQuery } = getDbOps(ops);
  const requestedQuantity = roundQuantity(quantity);

  if (requestedQuantity <= 0) {
    return [];
  }

  await ensureTrackedStockCoverage({ productId, fallbackDate: saleDate, eventTimestamp }, ops);

  let lots = await fetchOpenLotsForProduct(productId, ops);
  let totalAvailable = roundQuantity(lots.reduce((sum, lot) => sum + toNumber(lot.quantity_remaining), 0));

  if (totalAvailable < requestedQuantity) {
    const shortfall = roundQuantity(requestedQuantity - totalAvailable);
    const product = await getProduct(productId, ops);
    await createStandaloneLot({
      productId,
      supplierId: product.supplier_id,
      supplierName: product.supplier,
      quantity: shortfall,
      pricePerUnit: product.purchase_price,
      gstPercent: product.gst_percent,
      purchaseDate: saleDate || eventTimestamp,
      deliveryDate: saleDate || eventTimestamp,
      sourceType: LOT_SOURCE_TYPES.OPENING,
      eventTimestamp
    }, ops);

    lots = await fetchOpenLotsForProduct(productId, ops);
    totalAvailable = roundQuantity(lots.reduce((sum, lot) => sum + toNumber(lot.quantity_remaining), 0));
  }

  if (totalAvailable < requestedQuantity) {
    throw createHttpError(400, 'Tracked supplier lots are insufficient for this sale');
  }

  let remainingQuantity = requestedQuantity;
  const allocations = [];

  for (const lot of lots) {
    if (remainingQuantity <= 0) {
      break;
    }

    const availableInLot = roundQuantity(lot.quantity_remaining);
    if (availableInLot <= 0) {
      continue;
    }

    const allocatedQuantity = roundQuantity(Math.min(remainingQuantity, availableInLot));
    await runQuery(
      `UPDATE purchase_lots SET
         quantity_sold = quantity_sold + ?,
         quantity_remaining = quantity_remaining - ?,
         updated_at = ?
       WHERE id = ?`,
      [allocatedQuantity, allocatedQuantity, eventTimestamp, lot.id]
    );

    const result = await runQuery(
      `INSERT INTO sale_allocations (
         sale_line_id,
         sale_id,
         product_id,
         purchase_lot_id,
         quantity_allocated,
         quantity_returned,
         unit_cost,
         created_at,
         updated_at
       ) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)`,
      [saleLineId, saleId, productId, lot.id, allocatedQuantity, toNumber(lot.price_per_unit), eventTimestamp, eventTimestamp]
    );

    allocations.push({
      id: result.id,
      purchase_lot_id: lot.id,
      supplier_id: lot.supplier_id || null,
      supplier_name: lot.supplier_name || null,
      quantity_allocated: allocatedQuantity,
      unit_cost: toNumber(lot.price_per_unit)
    });

    remainingQuantity = roundQuantity(remainingQuantity - allocatedQuantity);
  }

  if (remainingQuantity > 0) {
    throw createHttpError(400, 'Tracked supplier lots are insufficient for this sale');
  }

  return allocations;
}

async function reverseSaleFromLots({ saleId, productId, quantity, eventTimestamp }, ops) {
  const { getAll, runQuery } = getDbOps(ops);
  const requestedQuantity = roundQuantity(quantity);

  if (requestedQuantity <= 0) {
    return [];
  }

  const allocations = await getAll(
    `SELECT
       sa.*,
       pl.supplier_id,
       pl.supplier_name,
       pl.price_per_unit
     FROM sale_allocations sa
     JOIN purchase_lots pl ON pl.id = sa.purchase_lot_id
     WHERE sa.sale_id = ?
       AND sa.product_id = ?
       AND sa.quantity_allocated > COALESCE(sa.quantity_returned, 0)
     ORDER BY sa.id ASC`,
    [saleId, productId]
  );

  const totalReturnable = roundQuantity(
    allocations.reduce((sum, allocation) => sum + (toNumber(allocation.quantity_allocated) - toNumber(allocation.quantity_returned)), 0)
  );

  if (totalReturnable < requestedQuantity) {
    throw createHttpError(400, 'Return quantity exceeds the supplier lot allocations for this sale');
  }

  let remainingQuantity = requestedQuantity;
  const reversedLots = [];

  for (const allocation of allocations) {
    if (remainingQuantity <= 0) {
      break;
    }

    const availableToReverse = roundQuantity(toNumber(allocation.quantity_allocated) - toNumber(allocation.quantity_returned));
    if (availableToReverse <= 0) {
      continue;
    }

    const reversedQuantity = roundQuantity(Math.min(remainingQuantity, availableToReverse));

    await runQuery(
      `UPDATE sale_allocations SET
         quantity_returned = quantity_returned + ?,
         updated_at = ?
       WHERE id = ?`,
      [reversedQuantity, eventTimestamp, allocation.id]
    );

    await runQuery(
      `UPDATE purchase_lots SET
         quantity_sold = quantity_sold - ?,
         quantity_remaining = quantity_remaining + ?,
         updated_at = ?
       WHERE id = ?`,
      [reversedQuantity, reversedQuantity, eventTimestamp, allocation.purchase_lot_id]
    );

    reversedLots.push({
      purchase_lot_id: allocation.purchase_lot_id,
      supplier_id: allocation.supplier_id || null,
      supplier_name: allocation.supplier_name || null,
      quantity_reversed: reversedQuantity,
      unit_cost: toNumber(allocation.unit_cost || allocation.price_per_unit)
    });

    remainingQuantity = roundQuantity(remainingQuantity - reversedQuantity);
  }

  return reversedLots;
}

async function applyStockAdjustmentToLots({ productId, quantity, eventTimestamp }, ops) {
  const { runQuery } = getDbOps(ops);
  const adjustmentQuantity = roundQuantity(quantity);

  if (adjustmentQuantity === 0) {
    return [];
  }

  if (adjustmentQuantity > 0) {
    const product = await getProduct(productId, ops);
    const lot = await createStandaloneLot({
      productId,
      supplierId: product.supplier_id,
      supplierName: product.supplier,
      quantity: adjustmentQuantity,
      pricePerUnit: product.purchase_price,
      gstPercent: product.gst_percent,
      purchaseDate: eventTimestamp,
      deliveryDate: eventTimestamp,
      sourceType: LOT_SOURCE_TYPES.ADJUSTMENT,
      eventTimestamp
    }, ops);

    return lot ? [{ purchase_lot_id: lot.id, quantity_adjusted: adjustmentQuantity }] : [];
  }

  const reductionQuantity = Math.abs(adjustmentQuantity);
  await ensureTrackedStockCoverage({ productId, fallbackDate: eventTimestamp, eventTimestamp }, ops);

  const lots = await fetchOpenLotsForProduct(productId, ops);
  const totalAvailable = roundQuantity(lots.reduce((sum, lot) => sum + toNumber(lot.quantity_remaining), 0));
  if (totalAvailable < reductionQuantity) {
    throw createHttpError(400, 'Tracked supplier lots are insufficient for this stock reduction');
  }

  let remainingQuantity = reductionQuantity;
  const affectedLots = [];

  for (const lot of lots) {
    if (remainingQuantity <= 0) {
      break;
    }

    const availableInLot = roundQuantity(lot.quantity_remaining);
    if (availableInLot <= 0) {
      continue;
    }

    const adjustedQuantity = roundQuantity(Math.min(remainingQuantity, availableInLot));
    await runQuery(
      `UPDATE purchase_lots SET
         quantity_adjusted = quantity_adjusted + ?,
         quantity_remaining = quantity_remaining - ?,
         updated_at = ?
       WHERE id = ?`,
      [adjustedQuantity, adjustedQuantity, eventTimestamp, lot.id]
    );

    affectedLots.push({
      purchase_lot_id: lot.id,
      supplier_id: lot.supplier_id || null,
      supplier_name: lot.supplier_name || null,
      quantity_adjusted: adjustedQuantity
    });

    remainingQuantity = roundQuantity(remainingQuantity - adjustedQuantity);
  }

  return affectedLots;
}

function generateSupplierReturnId(eventTimestamp) {
  const compactTimestamp = String(eventTimestamp || '')
    .replace(/[-:\s]/g, '')
    .slice(0, 14);

  return `SRET${compactTimestamp || Date.now()}${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
}

async function createSupplierReturn({
  supplierId,
  supplierName,
  items,
  returnDate,
  notes,
  userId,
  eventTimestamp,
  returnId
}, ops) {
  const { getRow, runQuery } = getDbOps(ops);

  if (!Array.isArray(items) || items.length === 0) {
    throw createHttpError(400, 'At least one supplier return item is required');
  }

  const normalizedSupplierName = normalizeSupplierName(supplierName);
  const validatedItems = [];
  let totalQuantity = 0;
  let totalAmount = 0;

  for (const item of items) {
    const purchaseLotId = Number(item.purchase_lot_id || item.purchaseLotId);
    const quantityReturned = roundQuantity(item.quantity_returned || item.quantityReturned || item.quantity);

    if (!Number.isInteger(purchaseLotId) || purchaseLotId <= 0) {
      throw createHttpError(400, 'Each supplier return item requires a valid purchase lot');
    }

    if (quantityReturned <= 0) {
      throw createHttpError(400, 'Returned quantity must be positive');
    }

    const lot = await getRow(
      `SELECT
         pl.*,
         p.product_name,
         p.unit,
         pur.purchase_id AS purchase_reference
       FROM purchase_lots pl
       JOIN products p ON p.id = pl.product_id
       LEFT JOIN purchases pur ON pur.id = pl.purchase_id
       WHERE pl.id = ?`,
      [purchaseLotId]
    );

    if (!lot) {
      throw createHttpError(404, 'Purchase lot not found');
    }

    if (!supplierMatches(lot, supplierId, normalizedSupplierName)) {
      throw createHttpError(400, 'All returned lots must belong to the selected supplier');
    }

    if (quantityReturned > roundQuantity(lot.quantity_remaining)) {
      throw createHttpError(400, `Cannot return ${quantityReturned} ${lot.unit} from ${lot.product_name}. Only ${lot.quantity_remaining} ${lot.unit} remains in this lot.`);
    }

    const lineAmount = roundQuantity(quantityReturned * toNumber(lot.price_per_unit));
    totalQuantity = roundQuantity(totalQuantity + quantityReturned);
    totalAmount = roundQuantity(totalAmount + lineAmount);
    validatedItems.push({
      lot,
      quantityReturned,
      lineAmount
    });
  }

  const resolvedSupplierId = supplierId || validatedItems[0]?.lot?.supplier_id || null;
  const resolvedSupplierName = normalizedSupplierName || normalizeSupplierName(validatedItems[0]?.lot?.supplier_name);
  const effectiveReturnId = returnId || generateSupplierReturnId(eventTimestamp);

  const returnRecord = await runQuery(
    `INSERT INTO supplier_returns (
       return_id,
       supplier_id,
       supplier_name,
       total_quantity,
       total_amount,
       notes,
       return_date,
       created_by,
       created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      effectiveReturnId,
      resolvedSupplierId,
      resolvedSupplierName || null,
      totalQuantity,
      totalAmount,
      notes || null,
      returnDate,
      userId,
      eventTimestamp
    ]
  );

  for (const item of validatedItems) {
    await runQuery(
      `UPDATE purchase_lots SET
         quantity_returned = quantity_returned + ?,
         quantity_remaining = quantity_remaining - ?,
         updated_at = ?
       WHERE id = ?`,
      [item.quantityReturned, item.quantityReturned, eventTimestamp, item.lot.id]
    );

    await runQuery(
      'UPDATE products SET quantity_available = quantity_available - ?, updated_at = ? WHERE id = ?',
      [item.quantityReturned, eventTimestamp, item.lot.product_id]
    );

    await runQuery(
      `INSERT INTO supplier_return_items (
         supplier_return_id,
         purchase_lot_id,
         purchase_id,
         product_id,
         quantity_returned,
         price_per_unit,
         total_amount,
         created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        returnRecord.id,
        item.lot.id,
        item.lot.purchase_id || null,
        item.lot.product_id,
        item.quantityReturned,
        toNumber(item.lot.price_per_unit),
        item.lineAmount,
        eventTimestamp
      ]
    );
  }

  return {
    id: returnRecord.id,
    return_id: effectiveReturnId,
    supplier_id: resolvedSupplierId,
    supplier_name: resolvedSupplierName || null,
    total_quantity: totalQuantity,
    total_amount: totalAmount,
    items: validatedItems.map((item) => ({
      purchase_lot_id: item.lot.id,
      purchase_id: item.lot.purchase_id || null,
      purchase_reference: item.lot.purchase_reference || null,
      product_id: item.lot.product_id,
      product_name: item.lot.product_name,
      unit: item.lot.unit,
      quantity_returned: item.quantityReturned,
      price_per_unit: toNumber(item.lot.price_per_unit),
      total_amount: item.lineAmount
    }))
  };
}

async function reconcileProductLotBalances(ops, eventTimestamp) {
  const { getAll, getRow } = getDbOps(ops);
  const products = await getAll('SELECT * FROM products');

  for (const product of products) {
    const trackedRow = await getRow(
      'SELECT COALESCE(SUM(quantity_remaining), 0) AS tracked_remaining FROM purchase_lots WHERE product_id = ?',
      [product.id]
    );
    const diff = roundQuantity(toNumber(product.quantity_available) - toNumber(trackedRow?.tracked_remaining));

    if (diff > 0) {
      await createStandaloneLot({
        productId: product.id,
        supplierId: product.supplier_id,
        supplierName: product.supplier,
        quantity: diff,
        pricePerUnit: product.purchase_price,
        gstPercent: product.gst_percent,
        purchaseDate: product.created_at || eventTimestamp,
        deliveryDate: product.created_at || eventTimestamp,
        sourceType: LOT_SOURCE_TYPES.OPENING,
        eventTimestamp
      }, ops);
    } else if (diff < 0) {
      await applyStockAdjustmentToLots({
        productId: product.id,
        quantity: diff,
        eventTimestamp
      }, ops);
    }
  }
}

async function backfillPurchaseLotLedger(ops) {
  const { getAll } = getDbOps(ops);
  const eventTimestamp = typeof ops.nowIST === 'function' ? ops.nowIST() : new Date().toISOString().slice(0, 19).replace('T', ' ');

  const deliveredPurchases = await getAll(
    `SELECT pur.*, p.gst_percent
     FROM purchases pur
     JOIN products p ON p.id = pur.product_id
     WHERE COALESCE(pur.purchase_status, 'delivered') = 'delivered'
     ORDER BY COALESCE(pur.delivery_date, pur.purchase_date, pur.created_at) ASC, pur.id ASC`
  );

  for (const purchase of deliveredPurchases) {
    const deliveredQuantity = toNumber(purchase.quantity_delivered) > 0
      ? toNumber(purchase.quantity_delivered)
      : toNumber(purchase.quantity);

    await syncPurchaseLotForPurchase({
      purchaseId: purchase.id,
      productId: purchase.product_id,
      supplierId: purchase.supplier_id,
      supplierName: purchase.supplier,
      deliveredQuantity,
      pricePerUnit: purchase.price_per_unit,
      gstPercent: purchase.gst_percent,
      purchaseDate: purchase.purchase_date || purchase.created_at || eventTimestamp,
      deliveryDate: purchase.delivery_date || purchase.purchase_date || purchase.created_at || eventTimestamp,
      eventTimestamp: purchase.updated_at || purchase.created_at || eventTimestamp
    }, ops);
  }

  const sales = await getAll(
    'SELECT * FROM sales ORDER BY COALESCE(sale_date, created_at) ASC, id ASC'
  );
  for (const sale of sales) {
    await allocateSaleToLots({
      saleLineId: sale.id,
      saleId: sale.sale_id,
      productId: sale.product_id,
      quantity: sale.quantity_sold,
      saleDate: sale.sale_date || sale.created_at || eventTimestamp,
      eventTimestamp: sale.created_at || sale.sale_date || eventTimestamp
    }, ops);
  }

  const salesReturns = await getAll(
    'SELECT * FROM sales_returns ORDER BY COALESCE(return_date, created_at) ASC, id ASC'
  );
  for (const salesReturn of salesReturns) {
    await reverseSaleFromLots({
      saleId: salesReturn.sale_id,
      productId: salesReturn.product_id,
      quantity: salesReturn.quantity_returned,
      eventTimestamp: salesReturn.created_at || salesReturn.return_date || eventTimestamp
    }, ops);
  }

  const stockAdjustments = await getAll(
    'SELECT * FROM stock_adjustments ORDER BY COALESCE(adjustment_date, created_at) ASC, id ASC'
  );
  for (const adjustment of stockAdjustments) {
    await applyStockAdjustmentToLots({
      productId: adjustment.product_id,
      quantity: adjustment.quantity_adjusted,
      eventTimestamp: adjustment.created_at || adjustment.adjustment_date || eventTimestamp
    }, ops);
  }

  await reconcileProductLotBalances(ops, eventTimestamp);
}

module.exports = {
  LOT_SOURCE_TYPES,
  normalizeSupplierName,
  toNumber,
  roundQuantity,
  getPurchaseLotByPurchaseId,
  syncPurchaseLotForPurchase,
  createStandaloneLot,
  ensureTrackedStockCoverage,
  allocateSaleToLots,
  reverseSaleFromLots,
  applyStockAdjustmentToLots,
  createSupplierReturn,
  generateSupplierReturnId,
  backfillPurchaseLotLedger
};