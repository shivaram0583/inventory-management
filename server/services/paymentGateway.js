const crypto = require('crypto');
const Razorpay = require('razorpay');

function hasRealValue(value) {
  const normalized = String(value || '').trim();
  return Boolean(normalized) && !/^your[_-]/i.test(normalized);
}

function getGatewayProvider() {
  return (process.env.PAYMENT_GATEWAY_PROVIDER || 'razorpay').toLowerCase();
}

function getRazorpayCredentials() {
  return {
    keyId: process.env.RAZORPAY_KEY_ID || '',
    keySecret: process.env.RAZORPAY_KEY_SECRET || ''
  };
}

function isGatewayEnabled() {
  const provider = getGatewayProvider();
  if (provider !== 'razorpay') {
    return false;
  }

  const credentials = getRazorpayCredentials();
  return hasRealValue(credentials.keyId) && hasRealValue(credentials.keySecret);
}

function getGatewayPublicConfig() {
  const provider = getGatewayProvider();
  const { keyId } = getRazorpayCredentials();

  return {
    provider,
    enabled: isGatewayEnabled(),
    currency: 'INR',
    keyId: isGatewayEnabled() ? keyId : null
  };
}

function getRazorpayClient() {
  if (!isGatewayEnabled()) {
    throw new Error('Payment gateway is not configured');
  }

  const { keyId, keySecret } = getRazorpayCredentials();
  return new Razorpay({ key_id: keyId, key_secret: keySecret });
}

async function createGatewayOrder({ amount, reference, notes }) {
  const normalizedAmount = Number(amount || 0);
  if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
    throw new Error('Amount must be greater than zero');
  }

  const amountInPaise = Math.round(normalizedAmount * 100);
  const client = getRazorpayClient();
  const order = await client.orders.create({
    amount: amountInPaise,
    currency: 'INR',
    receipt: String(reference || `sale-${Date.now()}`).slice(0, 40),
    notes: notes || {}
  });

  return {
    provider: 'razorpay',
    keyId: getGatewayPublicConfig().keyId,
    orderId: order.id,
    amount: normalizedAmount,
    amountInPaise,
    currency: order.currency
  };
}

function verifyGatewayPayment({ payment_gateway, gateway_order_id, gateway_payment_id, gateway_signature }) {
  if (payment_gateway !== 'razorpay') {
    throw new Error('Unsupported payment gateway');
  }

  const { keySecret } = getRazorpayCredentials();
  if (!keySecret) {
    throw new Error('Payment gateway is not configured');
  }

  const expectedSignature = crypto
    .createHmac('sha256', keySecret)
    .update(`${gateway_order_id}|${gateway_payment_id}`)
    .digest('hex');

  const providedSignature = String(gateway_signature || '');
  if (providedSignature.length !== expectedSignature.length) {
    return false;
  }

  return crypto.timingSafeEqual(
    Buffer.from(expectedSignature),
    Buffer.from(providedSignature)
  );
}

module.exports = {
  isGatewayEnabled,
  getGatewayPublicConfig,
  createGatewayOrder,
  verifyGatewayPayment
};