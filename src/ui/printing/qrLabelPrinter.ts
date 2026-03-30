import type { Dictionary } from "../../app/i18n";
import type { InventoryItem } from "../../domain/models";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function printQrLabels(items: InventoryItem[], dictionary: Dictionary): void {
  if (items.length === 0) {
    return;
  }

  const printWindow = window.open("", "_blank", "width=1100,height=900");
  if (!printWindow) {
    throw new Error(dictionary.qrCodeUnavailable);
  }

  const labelMarkup = items
    .map(
      (item) => `
        <article class="label-card">
          <img class="label-card__qr" src="${item.qrCodeDataUrl}" alt="${escapeHtml(item.sku)}" />
          <div class="label-card__text">
            <strong>${escapeHtml(item.sku)}</strong>
            <span>${escapeHtml(item.name)}</span>
          </div>
        </article>
      `,
    )
    .join("");

  printWindow.document.open();
  printWindow.document.write(`
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(dictionary.printSelectedQrs)}</title>
        <style>
          @page { margin: 12mm; }
          body {
            margin: 0;
            font-family: "Segoe UI", sans-serif;
            color: #12233a;
            background: #fff;
          }
          .label-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
            gap: 16px;
          }
          .label-card {
            break-inside: avoid;
            border: 1px solid #d7e2ee;
            border-radius: 14px;
            padding: 16px;
            display: grid;
            gap: 12px;
            justify-items: center;
          }
          .label-card__qr {
            width: 180px;
            height: 180px;
            object-fit: contain;
          }
          .label-card__text {
            display: grid;
            gap: 4px;
            text-align: center;
          }
          .label-card__text span {
            color: #5c6e82;
          }
        </style>
      </head>
      <body>
        <section class="label-grid">${labelMarkup}</section>
        <script>
          window.addEventListener('load', () => {
            window.print();
            window.addEventListener('afterprint', () => window.close(), { once: true });
          });
        </script>
      </body>
    </html>
  `);
  printWindow.document.close();
}
