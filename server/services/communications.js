const nodemailer = require('nodemailer');
const twilio = require('twilio');

function getFrontendBaseUrl() {
  return (process.env.FRONTEND_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
}

function getPublicApiBaseUrl() {
  return (process.env.PUBLIC_API_BASE_URL || `http://localhost:${process.env.PORT || 5000}`).replace(/\/$/, '');
}

function hasEmailDelivery() {
  return Boolean(
    process.env.SMTP_HOST &&
    process.env.SMTP_PORT &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASS &&
    process.env.SMTP_FROM
  );
}

function hasSmsDelivery() {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_FROM_NUMBER
  );
}

function getCommunicationCapabilities() {
  return {
    emailEnabled: hasEmailDelivery(),
    smsEnabled: hasSmsDelivery(),
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

function getSmsClient() {
  if (!hasSmsDelivery()) {
    throw new Error('SMS delivery is not configured');
  }

  return twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
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

async function sendSms({ to, body }) {
  const client = getSmsClient();
  return client.messages.create({
    from: process.env.TWILIO_FROM_NUMBER,
    to,
    body
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
  sendSms,
  buildReceiptVerificationLink,
  buildQuotationShareLink,
  getFrontendBaseUrl,
  getPublicApiBaseUrl
};