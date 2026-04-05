const { getRow, getAll, runQuery, runTransaction, nowIST } = require('../database/db');

const RULE_TYPE_PRIORITY = {
  customer: 1,
  promotion: 2,
  tier: 3,
  base: 4,
  manual: 0,
  quotation: 0
};

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeDate(value = nowIST()) {
  return String(value).trim().slice(0, 10);
}

function normalizeRuleLabel(type, label) {
  if (label) {
    return String(label).trim();
  }

  if (type === 'customer') return 'Customer-specific pricing';
  if (type === 'promotion') return 'Promotional pricing';
  if (type === 'tier') return 'Tier pricing';
  return 'Base price';
}

function pickWinningCandidate(candidates) {
  return [...candidates].sort((left, right) => {
    if (left.price_per_unit !== right.price_per_unit) {
      return left.price_per_unit - right.price_per_unit;
    }

    return (RULE_TYPE_PRIORITY[left.type] || 99) - (RULE_TYPE_PRIORITY[right.type] || 99);
  })[0];
}

function formatAppliedRule(candidate) {
  if (!candidate || candidate.type === 'base') {
    return null;
  }

  return {
    id: candidate.id || null,
    type: candidate.type,
    label: candidate.label,
    price_per_unit: candidate.price_per_unit,
    minimum_quantity: candidate.minimum_quantity || null,
    starts_on: candidate.starts_on || null,
    ends_on: candidate.ends_on || null
  };
}

async function getProductPricingRules(productId) {
  const [tierPricing, promotions] = await Promise.all([
    getAll(
      `SELECT id, product_id, min_quantity, price_per_unit, label, created_at, updated_at
       FROM price_tiers
       WHERE product_id = ?
       ORDER BY min_quantity ASC, price_per_unit ASC`,
      [productId]
    ),
    getAll(
      `SELECT id, product_id, promotional_price, start_date, end_date, label, is_active, created_at, updated_at
       FROM product_promotions
       WHERE product_id = ?
       ORDER BY is_active DESC, start_date DESC, promotional_price ASC`,
      [productId]
    )
  ]);

  return { tierPricing, promotions };
}

async function getCustomerPricingRules(customerId) {
  return getAll(
    `SELECT cp.id, cp.customer_id, cp.product_id, cp.price_per_unit, cp.start_date, cp.end_date, cp.notes,
            cp.created_at, cp.updated_at, p.product_name, p.product_id as product_code, p.unit
     FROM customer_pricing cp
     JOIN products p ON p.id = cp.product_id
     WHERE cp.customer_id = ?
     ORDER BY p.product_name ASC, cp.start_date DESC`,
    [customerId]
  );
}

async function resolveEffectivePrice({ productId, customerId, quantity = 1, pricingDate }) {
  const normalizedQuantity = Math.max(1, toNumber(quantity, 1));
  const normalizedDate = normalizeDate(pricingDate);
  const product = await getRow('SELECT * FROM products WHERE id = ? AND COALESCE(is_deleted, 0) = 0', [productId]);

  if (!product) {
    return null;
  }

  const basePrice = toNumber(product.selling_price);
  const candidates = [
    {
      type: 'base',
      id: null,
      label: 'Base price',
      price_per_unit: basePrice
    }
  ];

  const tierRule = await getRow(
    `SELECT id, min_quantity, price_per_unit, label
     FROM price_tiers
     WHERE product_id = ? AND min_quantity <= ?
     ORDER BY min_quantity DESC, price_per_unit ASC
     LIMIT 1`,
    [productId, normalizedQuantity]
  );

  if (tierRule) {
    candidates.push({
      type: 'tier',
      id: tierRule.id,
      label: normalizeRuleLabel('tier', tierRule.label),
      price_per_unit: toNumber(tierRule.price_per_unit, basePrice),
      minimum_quantity: toNumber(tierRule.min_quantity)
    });
  }

  const promotionRule = await getRow(
    `SELECT id, promotional_price, start_date, end_date, label
     FROM product_promotions
     WHERE product_id = ?
       AND COALESCE(is_active, 1) = 1
       AND (? >= COALESCE(start_date, ?) AND ? <= COALESCE(end_date, ?))
     ORDER BY promotional_price ASC, start_date DESC
     LIMIT 1`,
    [productId, normalizedDate, normalizedDate, normalizedDate, normalizedDate]
  );

  if (promotionRule) {
    candidates.push({
      type: 'promotion',
      id: promotionRule.id,
      label: normalizeRuleLabel('promotion', promotionRule.label),
      price_per_unit: toNumber(promotionRule.promotional_price, basePrice),
      starts_on: promotionRule.start_date || null,
      ends_on: promotionRule.end_date || null
    });
  }

  if (customerId) {
    const customerRule = await getRow(
      `SELECT id, price_per_unit, start_date, end_date, notes
       FROM customer_pricing
       WHERE customer_id = ?
         AND product_id = ?
         AND (? >= COALESCE(start_date, ?) AND ? <= COALESCE(end_date, ?))
       ORDER BY start_date DESC, price_per_unit ASC
       LIMIT 1`,
      [customerId, productId, normalizedDate, normalizedDate, normalizedDate, normalizedDate]
    );

    if (customerRule) {
      candidates.push({
        type: 'customer',
        id: customerRule.id,
        label: normalizeRuleLabel('customer', customerRule.notes),
        price_per_unit: toNumber(customerRule.price_per_unit, basePrice),
        starts_on: customerRule.start_date || null,
        ends_on: customerRule.end_date || null
      });
    }
  }

  const winningCandidate = pickWinningCandidate(candidates);
  const effectivePrice = toNumber(winningCandidate?.price_per_unit, basePrice);

  return {
    product_id: product.id,
    product_name: product.product_name,
    unit: product.unit,
    quantity: normalizedQuantity,
    pricing_date: normalizedDate,
    base_price: basePrice,
    effective_price: effectivePrice,
    savings_per_unit: Math.max(basePrice - effectivePrice, 0),
    applied_rule: formatAppliedRule(winningCandidate),
    candidates: candidates
      .filter((candidate) => candidate.type !== 'base')
      .map((candidate) => ({
        type: candidate.type,
        label: candidate.label,
        price_per_unit: candidate.price_per_unit,
        minimum_quantity: candidate.minimum_quantity || null,
        starts_on: candidate.starts_on || null,
        ends_on: candidate.ends_on || null
      }))
  };
}

async function resolveEffectivePrices({ items = [], customerId, pricingDate }) {
  const resolutions = await Promise.all(
    items.map((item) =>
      resolveEffectivePrice({
        productId: item.product_id,
        customerId,
        quantity: item.quantity,
        pricingDate
      })
    )
  );

  return resolutions.filter(Boolean);
}

async function replaceProductPricingRules(productId, { tierPricing = [], promotions = [] }) {
  await runTransaction(async ({ runQuery: txRunQuery }) => {
    await txRunQuery('DELETE FROM price_tiers WHERE product_id = ?', [productId]);
    await txRunQuery('DELETE FROM product_promotions WHERE product_id = ?', [productId]);

    for (const tier of tierPricing) {
      const minQuantity = Math.max(1, toNumber(tier.min_quantity, 0));
      const pricePerUnit = toNumber(tier.price_per_unit, -1);
      if (pricePerUnit < 0) {
        continue;
      }

      await txRunQuery(
        `INSERT INTO price_tiers (product_id, min_quantity, price_per_unit, label, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [productId, minQuantity, pricePerUnit, String(tier.label || '').trim() || null, nowIST(), nowIST()]
      );
    }

    for (const promotion of promotions) {
      const promotionalPrice = toNumber(promotion.promotional_price, -1);
      if (promotionalPrice < 0) {
        continue;
      }

      await txRunQuery(
        `INSERT INTO product_promotions (
           product_id, promotional_price, start_date, end_date, label, is_active, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          productId,
          promotionalPrice,
          promotion.start_date || null,
          promotion.end_date || null,
          String(promotion.label || '').trim() || null,
          promotion.is_active === false ? 0 : 1,
          nowIST(),
          nowIST()
        ]
      );
    }
  });

  return getProductPricingRules(productId);
}

async function replaceCustomerPricingRules(customerId, rules = []) {
  await runTransaction(async ({ runQuery: txRunQuery }) => {
    await txRunQuery('DELETE FROM customer_pricing WHERE customer_id = ?', [customerId]);

    for (const rule of rules) {
      const productId = toNumber(rule.product_id, 0);
      const pricePerUnit = toNumber(rule.price_per_unit, -1);
      if (!productId || pricePerUnit < 0) {
        continue;
      }

      await txRunQuery(
        `INSERT INTO customer_pricing (
           customer_id, product_id, price_per_unit, start_date, end_date, notes, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          customerId,
          productId,
          pricePerUnit,
          rule.start_date || null,
          rule.end_date || null,
          String(rule.notes || '').trim() || null,
          nowIST(),
          nowIST()
        ]
      );
    }
  });

  return getCustomerPricingRules(customerId);
}

module.exports = {
  getProductPricingRules,
  getCustomerPricingRules,
  resolveEffectivePrice,
  resolveEffectivePrices,
  replaceProductPricingRules,
  replaceCustomerPricingRules
};