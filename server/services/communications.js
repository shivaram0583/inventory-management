const nodemailer = require('nodemailer');

function hasRealValue(value) {
  const normalized = String(value || '').trim();
  return Boolean(normalized) && !/^your[_-]/i.test(normalized);
}

function getFrontendBaseUrl() {
  return (process.env.FRONTEND_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
}

function getPublicApiBaseUrl() {
  return (process.env.PUBLIC_API_BASE_URL || `http://localhost:${process.env.PORT || 5000}`).replace(/\/$/, '');
}

function hasEmailDelivery() {
  return Boolean(
    hasRealValue(process.env.SMTP_HOST) &&
    hasRealValue(process.env.SMTP_PORT) &&
    hasRealValue(process.env.SMTP_USER) &&
    hasRealValue(process.env.SMTP_PASS) &&
    hasRealValue(process.env.SMTP_FROM)
  );
}

function getCommunicationCapabilities() {
  return {
    emailEnabled: hasEmailDelivery(),
    frontendBaseUrl: getFrontendBaseUrl(),
    publicApiBaseUrl: getPublicApiBaseUrl()
  };
}

function getEmailTransport() {
  if (!hasEmailDelivery()) {
    throw new Error('Email delivery is not configured');
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: String(process.env.SMTP_SECURE || 'false') === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
}

async function sendEmail({ to, subject, text, html }) {
  const transport = getEmailTransport();
  return transport.sendMail({
    from: process.env.SMTP_FROM,
    to,
    subject,
    text,
    html
  });
}

function buildReceiptVerificationLink(receiptNumber) {
  return `${getPublicApiBaseUrl()}/receipts/${encodeURIComponent(receiptNumber)}`;
}

function buildQuotationShareLink(quotationNumber) {
  return `${getPublicApiBaseUrl()}/quotes/${encodeURIComponent(quotationNumber)}`;
}

module.exports = {
  getCommunicationCapabilities,
  sendEmail,
  buildReceiptVerificationLink,
  buildQuotationShareLink,
  getFrontendBaseUrl,
  getPublicApiBaseUrl
};