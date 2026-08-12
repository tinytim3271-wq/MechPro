/**
 * Triggers browser print for a given element ID.
 * Injects a scoped print stylesheet so only the target prints.
 */
export function printElement(elementId: string, title: string) {
  const el = document.getElementById(elementId);
  if (!el) return;

  const printWindow = window.open("", "_blank", "width=900,height=700");
  if (!printWindow) return;

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8" />
        <title>${title}</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            font-size: 13px;
            color: #111;
            background: #fff;
            padding: 24px;
          }
          h1, h2, h3 { margin-bottom: 8px; }
          h1 { font-size: 22px; }
          h2 { font-size: 16px; margin-top: 20px; }
          h3 { font-size: 14px; }
          p, li { margin-bottom: 4px; line-height: 1.5; }
          ul { padding-left: 18px; }
          .badge {
            display: inline-block;
            border: 1px solid #ccc;
            border-radius: 4px;
            padding: 1px 7px;
            font-size: 11px;
            font-weight: 600;
          }
          .badge-red { border-color: #f00; color: #c00; }
          .badge-yellow { border-color: #d97706; color: #92400e; }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 12px;
          }
          th, td {
            border: 1px solid #ddd;
            padding: 7px 10px;
            text-align: left;
            vertical-align: top;
          }
          th { background: #f5f5f5; font-weight: 600; font-size: 12px; }
          .total-row { font-weight: bold; background: #f9f9f9; }
          .parts-match { font-size: 11px; color: #15803d; margin-top: 2px; }
          .separator { border-top: 1px solid #ddd; margin: 16px 0; }
          .footer { margin-top: 24px; font-size: 11px; color: #888; }
          .warning { color: #b91c1c; font-size: 12px; margin-top: 4px; }
          .step-num {
            display: inline-block;
            width: 24px;
            height: 24px;
            border-radius: 50%;
            background: #eee;
            text-align: center;
            line-height: 24px;
            font-weight: bold;
            margin-right: 8px;
            flex-shrink: 0;
          }
          .step-row { display: flex; align-items: flex-start; margin-bottom: 14px; }
          .step-body { flex: 1; }
          @media print {
            body { padding: 0; }
            @page { margin: 20mm; }
          }
        </style>
      </head>
      <body>
        ${el.innerHTML}
        <div class="footer">
          Printed from MechPro &bull; ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
        </div>
      </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => {
    printWindow.print();
    printWindow.close();
  }, 400);
}
