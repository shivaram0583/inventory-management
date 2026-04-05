const express = require('express');
const { getRow, getAll } = require('../database/db');
const { buildQuotationShareLink, buildReceiptVerificationLink } = require('../services/communications');

const router = express.Router();

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatCurrency(value) {
  return `₹${Number(value || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

function formatDate(value) {
  if (!value) {
    return '-';
  }

  return new Date(value).toLocaleDateString('en-IN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

function renderDocumentShell({ title, eyebrow, heading, subheading, chips = [], heroAmount, sections = [], footerNote }) {
  const chipMarkup = chips
    .filter(Boolean)
    .map((chip) => `<span class="chip">${escapeHtml(chip)}</span>`)
    .join('');

  const sectionsMarkup = sections.join('');

  return `<!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>${escapeHtml(title)}</title>
      <style>
        :root {
          --bg: #f4f7f3;
          --card: rgba(255,255,255,0.92);
          --ink: #0f172a;
          --muted: #475569;
          --line: rgba(15,23,42,0.08);
          --accent: #0f766e;
          --accent-soft: #ccfbf1;
          --accent-strong: #115e59;
          --glow: rgba(20, 184, 166, 0.18);
        }

        * { box-sizing: border-box; }
        body {
          margin: 0;
          font-family: "Segoe UI", "Trebuchet MS", sans-serif;
          color: var(--ink);
          background:
            radial-gradient(circle at top right, rgba(45, 212, 191, 0.18), transparent 28%),
            radial-gradient(circle at 0% 20%, rgba(16, 185, 129, 0.12), transparent 22%),
            linear-gradient(160deg, #f8fafc 0%, var(--bg) 55%, #edfdf7 100%);
          min-height: 100vh;
          padding: 32px 16px;
        }

        .wrap {
          max-width: 980px;
          margin: 0 auto;
        }

        .card {
          background: var(--card);
          backdrop-filter: blur(10px);
          border: 1px solid var(--line);
          border-radius: 28px;
          overflow: hidden;
          box-shadow: 0 24px 80px var(--glow);
        }

        .hero {
          position: relative;
          padding: 32px;
          background: linear-gradient(140deg, #0f172a 0%, #134e4a 58%, #0f766e 100%);
          color: white;
        }

        .hero::after {
          content: "";
          position: absolute;
          inset: 0;
          background: radial-gradient(circle at 85% 20%, rgba(204, 251, 241, 0.26), transparent 28%);
          pointer-events: none;
        }

        .eyebrow {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 7px 12px;
          border-radius: 999px;
          background: rgba(255,255,255,0.12);
          border: 1px solid rgba(255,255,255,0.16);
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .hero-grid {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 20px;
          align-items: end;
          margin-top: 18px;
          position: relative;
          z-index: 1;
        }

        h1 {
          margin: 0;
          font-size: clamp(28px, 5vw, 46px);
          line-height: 1.02;
        }

        .subheading {
          margin: 10px 0 0;
          color: rgba(255,255,255,0.82);
          max-width: 42rem;
          line-height: 1.6;
        }

        .amount-box {
          min-width: 190px;
          padding: 18px 20px;
          border-radius: 20px;
          background: rgba(255,255,255,0.1);
          border: 1px solid rgba(255,255,255,0.14);
          text-align: right;
        }

        .amount-label {
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: rgba(255,255,255,0.72);
        }

        .amount-value {
          display: block;
          margin-top: 8px;
          font-size: clamp(28px, 4vw, 40px);
          font-weight: 800;
          letter-spacing: -0.03em;
        }

        .body {
          padding: 26px;
        }

        .chip-row {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          margin-bottom: 18px;
        }

        .chip {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          border-radius: 999px;
          background: var(--accent-soft);
          color: var(--accent-strong);
          font-size: 13px;
          font-weight: 700;
        }

        .grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 16px;
          margin-bottom: 18px;
        }

        .panel {
          border: 1px solid var(--line);
          border-radius: 22px;
          padding: 18px;
          background: linear-gradient(180deg, rgba(255,255,255,0.98), rgba(248,250,252,0.92));
        }

        .panel h2 {
          margin: 0 0 14px;
          font-size: 14px;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--muted);
        }

        .meta-list {
          display: grid;
          gap: 10px;
        }

        .meta-row {
          display: flex;
          justify-content: space-between;
          gap: 18px;
          border-bottom: 1px dashed rgba(15,23,42,0.08);
          padding-bottom: 10px;
        }

        .meta-row:last-child {
          border-bottom: 0;
          padding-bottom: 0;
        }

        .meta-row span:first-child {
          color: var(--muted);
        }

        .meta-row span:last-child {
          font-weight: 700;
          text-align: right;
        }

        table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 6px;
        }

        thead th {
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--muted);
          text-align: left;
          padding: 0 0 12px;
        }

        tbody td {
          padding: 14px 0;
          border-top: 1px solid rgba(15,23,42,0.08);
          vertical-align: top;
          font-size: 15px;
        }

        .text-right { text-align: right; }
        .muted { color: var(--muted); }
        .rule {
          margin-top: 6px;
          display: inline-flex;
          padding: 5px 9px;
          border-radius: 999px;
          background: rgba(15, 118, 110, 0.12);
          color: var(--accent-strong);
          font-size: 12px;
          font-weight: 700;
        }

        .totals {
          margin-top: 22px;
          margin-left: auto;
          max-width: 320px;
          border-radius: 22px;
          padding: 18px;
          background: linear-gradient(180deg, #f8fafc, #ecfdf5);
          border: 1px solid rgba(15, 118, 110, 0.12);
        }

        .totals .meta-row:last-child span:last-child {
          color: var(--accent-strong);
          font-size: 20px;
        }

        .footer {
          margin-top: 26px;
          padding-top: 16px;
          border-top: 1px solid var(--line);
          display: flex;
          justify-content: space-between;
          gap: 16px;
          align-items: center;
          color: var(--muted);
          font-size: 13px;
        }

        a { color: var(--accent-strong); }

        @media (max-width: 760px) {
          .hero, .body { padding: 22px; }
          .hero-grid, .grid, .footer { grid-template-columns: 1fr; display: grid; }
          .amount-box { text-align: left; }
          .footer { gap: 8px; }
        }
      </style>
    </head>
    <body>
      <div class="wrap">
        <article class="card">
          <header class="hero">
            <div class="eyebrow">${escapeHtml(eyebrow)}</div>
            <div class="hero-grid">
              <div>
                <h1>${escapeHtml(heading)}</h1>
                <p class="subheading">${escapeHtml(subheading)}</p>
              </div>
              <div class="amount-box">
                <span class="amount-label">Total</span>
                <span class="amount-value">${escapeHtml(heroAmount)}</span>
              </div>
            </div>
          </header>
          <div class="body">
            ${chipMarkup ? `<div class="chip-row">${chipMarkup}</div>` : ''}
            ${sectionsMarkup}
            <div class="footer">
              <div>Sri Venkata Lakshmi Vigneswara Traders</div>
              <div>${escapeHtml(footerNote || 'Computer-generated document')}</div>
            </div>
          </div>
        </article>
      </div>
    </body>
  </html>`;
}

function renderMetaPanel(title, rows) {
  return `<section class="panel">
    <h2>${escapeHtml(title)}</h2>
    <div class="meta-list">
      ${rows
        .filter((row) => row && row.value !== undefined && row.value !== null && row.value !== '')
        .map((row) => `<div class="meta-row"><span>${escapeHtml(row.label)}</span><span>${escapeHtml(row.value)}</span></div>`)
        .join('')}
    </div>
  </section>`;
}

function renderItemsTable(title, items) {
  return `<section class="panel">
    <h2>${escapeHtml(title)}</h2>
    <table>
      <thead>
        <tr>
          <th>Item</th>
          <th class="text-right">Qty</th>
          <th class="text-right">Rate</th>
          <th class="text-right">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${items
          .map(
            (item) => `<tr>
              <td>
                <div>${escapeHtml(item.product_name)}</div>
                ${item.pricing_rule_label ? `<div class="rule">${escapeHtml(item.pricing_rule_label)}</div>` : ''}
              </td>
              <td class="text-right">${escapeHtml(item.quantity)}</td>
              <td class="text-right">${escapeHtml(formatCurrency(item.price_per_unit))}</td>
              <td class="text-right">${escapeHtml(formatCurrency(item.total_amount))}</td>
            </tr>`
          )
          .join('')}
      </tbody>
    </table>
  </section>`;
}

router.get('/quotes/:quotationNumber', async (req, res) => {
  try {
    const quotation = await getRow(
      `SELECT quotation_number, customer_name, customer_mobile, customer_address, total_amount, discount_amount,
              tax_amount, net_amount, valid_until, status, notes, created_at
       FROM quotations
       WHERE quotation_number = ?`,
      [req.params.quotationNumber]
    );

    if (!quotation) {
      return res.status(404).type('html').send(renderDocumentShell({
        title: 'Quotation not found',
        eyebrow: 'Public Quote',
        heading: 'Quotation not found',
        subheading: 'The quotation link may be expired, replaced, or typed incorrectly.',
        heroAmount: formatCurrency(0),
        sections: [renderMetaPanel('Status', [{ label: 'Lookup', value: 'Not found' }])],
        footerNote: 'Please contact the business for a fresh quotation.'
      }));
    }

    const items = await getAll(
      `SELECT p.product_name, qi.quantity, qi.price_per_unit, qi.total_amount,
              qi.pricing_rule_label, p.unit
       FROM quotation_items qi
       JOIN products p ON p.id = qi.product_id
       JOIN quotations q ON q.id = qi.quotation_id
       WHERE q.quotation_number = ?`,
      [req.params.quotationNumber]
    );

    res.type('html').send(
      renderDocumentShell({
        title: `Quotation ${quotation.quotation_number}`,
        eyebrow: 'Public Quote',
        heading: quotation.quotation_number,
        subheading: quotation.notes || 'Review the items, rates, and validity below before confirming your order.',
        chips: [
          `Status: ${quotation.status}`,
          quotation.valid_until ? `Valid until ${formatDate(quotation.valid_until)}` : null,
          quotation.customer_mobile ? `Mobile ${quotation.customer_mobile}` : null
        ],
        heroAmount: formatCurrency(quotation.net_amount),
        sections: [
          `<div class="grid">${renderMetaPanel('Quotation Details', [
            { label: 'Quotation No', value: quotation.quotation_number },
            { label: 'Created', value: formatDate(quotation.created_at) },
            { label: 'Valid Until', value: formatDate(quotation.valid_until) },
            { label: 'Share Link', value: buildQuotationShareLink(quotation.quotation_number) }
          ])}${renderMetaPanel('Customer', [
            { label: 'Name', value: quotation.customer_name || 'Valued Customer' },
            { label: 'Mobile', value: quotation.customer_mobile || '-' },
            { label: 'Address', value: quotation.customer_address || '-' }
          ])}</div>`,
          renderItemsTable('Quoted Items', items.map((item) => ({
            ...item,
            quantity: `${item.quantity} ${item.unit}`
          }))),
          `<div class="totals"><div class="meta-list">
             <div class="meta-row"><span>Subtotal</span><span>${escapeHtml(formatCurrency(quotation.total_amount))}</span></div>
             <div class="meta-row"><span>Discount</span><span>${escapeHtml(formatCurrency(quotation.discount_amount))}</span></div>
             <div class="meta-row"><span>Tax</span><span>${escapeHtml(formatCurrency(quotation.tax_amount))}</span></div>
             <div class="meta-row"><span>Net Amount</span><span>${escapeHtml(formatCurrency(quotation.net_amount))}</span></div>
           </div></div>`
        ],
        footerNote: 'Rates are subject to stock availability and quote validity.'
      })
    );
  } catch (error) {
    console.error('Render public quotation page error:', error);
    res.status(500).type('html').send('Public quotation page is unavailable right now.');
  }
});

router.get('/receipts/:receiptNumber', async (req, res) => {
  try {
    const receipt = await getRow(
      `SELECT receipt_number, sale_id, customer_name, customer_mobile, customer_address, payment_mode,
              payment_gateway, payment_reference, total_amount, receipt_date
       FROM receipts
       WHERE receipt_number = ?`,
      [req.params.receiptNumber]
    );

    if (!receipt) {
      return res.status(404).type('html').send(renderDocumentShell({
        title: 'Receipt not found',
        eyebrow: 'Receipt Verification',
        heading: 'Receipt not found',
        subheading: 'The receipt reference could not be verified.',
        heroAmount: formatCurrency(0),
        sections: [renderMetaPanel('Verification', [{ label: 'Status', value: 'Not verified' }])],
        footerNote: 'Contact the business if you need a reissued copy.'
      }));
    }

    const items = await getAll(
      `SELECT p.product_name, s.quantity_sold, s.price_per_unit, s.total_amount, s.pricing_rule_label, p.unit
       FROM sales s
       JOIN products p ON p.id = s.product_id
       WHERE s.sale_id = ?`,
      [receipt.sale_id]
    );

    res.type('html').send(
      renderDocumentShell({
        title: `Receipt ${receipt.receipt_number}`,
        eyebrow: 'Receipt Verification',
        heading: receipt.receipt_number,
        subheading: 'This receipt was issued by Sri Venkata Lakshmi Vigneswara Traders and can be verified from the details below.',
        chips: [
          'Verified Sale',
          `Payment: ${receipt.payment_mode}`,
          receipt.payment_gateway ? `Gateway: ${receipt.payment_gateway}` : null
        ],
        heroAmount: formatCurrency(receipt.total_amount),
        sections: [
          `<div class="grid">${renderMetaPanel('Receipt Details', [
            { label: 'Receipt No', value: receipt.receipt_number },
            { label: 'Sale ID', value: receipt.sale_id },
            { label: 'Receipt Date', value: formatDate(receipt.receipt_date) },
            { label: 'Verification Link', value: buildReceiptVerificationLink(receipt.receipt_number) }
          ])}${renderMetaPanel('Customer', [
            { label: 'Name', value: receipt.customer_name || 'Walk-in Customer' },
            { label: 'Mobile', value: receipt.customer_mobile || '-' },
            { label: 'Address', value: receipt.customer_address || '-' },
            { label: 'Reference', value: receipt.payment_reference || '-' }
          ])}</div>`,
          renderItemsTable('Items', items.map((item) => ({
            ...item,
            quantity: `${item.quantity_sold} ${item.unit}`
          }))),
          `<div class="totals"><div class="meta-list">
             <div class="meta-row"><span>Items</span><span>${escapeHtml(String(items.length))}</span></div>
             <div class="meta-row"><span>Total Quantity</span><span>${escapeHtml(String(items.reduce((sum, item) => sum + Number(item.quantity_sold || 0), 0)))}</span></div>
             <div class="meta-row"><span>Receipt Total</span><span>${escapeHtml(formatCurrency(receipt.total_amount))}</span></div>
           </div></div>`
        ],
        footerNote: 'This public page confirms the receipt reference and billed items.'
      })
    );
  } catch (error) {
    console.error('Render public receipt page error:', error);
    res.status(500).type('html').send('Public receipt page is unavailable right now.');
  }
});

module.exports = router;