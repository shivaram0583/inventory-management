export const downloadPDF = (rows, columns, filename) => {
  if (!rows || rows.length === 0) return;

  const title = filename.replace(/\.pdf$/i, '').replace(/[_-]/g, ' ');

  const styles = `
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: 'Segoe UI', Arial, sans-serif; padding: 24px; color: #1a1a1a; }
      h1 { font-size: 16px; margin-bottom: 4px; color: #111827; }
      .meta { font-size: 10px; color: #6b7280; margin-bottom: 16px; }
      table { width: 100%; border-collapse: collapse; font-size: 10px; }
      th { background: #f1f5f9; color: #334155; font-weight: 600; text-align: left;
           padding: 6px 8px; border: 1px solid #e2e8f0; white-space: nowrap; }
      td { padding: 5px 8px; border: 1px solid #e2e8f0; }
      tr:nth-child(even) { background: #f8fafc; }
      .total-row { font-weight: 700; background: #e2e8f0 !important; }
      @media print { body { padding: 0; } }
    </style>`;

  const headerRow = columns.map(c => `<th>${esc(c.label)}</th>`).join('');
  const bodyRows = rows.map(row =>
    '<tr>' + columns.map(c => {
      const val = row[c.key] !== null && row[c.key] !== undefined ? row[c.key] : '';
      return `<td>${esc(String(val))}</td>`;
    }).join('') + '</tr>'
  ).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(title)}</title>${styles}</head><body>
    <h1>${esc(title)}</h1>
    <div class="meta">Generated on ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })} &bull; ${rows.length} record${rows.length !== 1 ? 's' : ''}</div>
    <table><thead><tr>${headerRow}</tr></thead><tbody>${bodyRows}</tbody></table>
  </body></html>`;

  const printWindow = window.open('', '_blank');
  if (!printWindow) return;
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.onload = () => {
    printWindow.print();
  };
};

function esc(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
