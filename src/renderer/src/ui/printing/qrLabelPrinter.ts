import QRCode from "qrcode";
import type { Dictionary } from "../../app/i18n";
import type { InventoryItem } from "../../domain/models";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function printQrLabels(items: InventoryItem[], dictionary: Dictionary): Promise<void> {
  if (items.length === 0) {
    return;
  }

  // Pre-generate QR data URLs from the plain URL strings.
  const qrImages = await Promise.all(
    items.map(async (item) => {
      if (!item.qrCodeDataUrl) return "";
      return QRCode.toDataURL(item.qrCodeDataUrl, {
        errorCorrectionLevel: "M",
        margin: 4,
        width: 300,
      });
    }),
  );

  const printWindow = window.open("", "_blank", "width=1100,height=900");
  if (!printWindow) {
    throw new Error(dictionary.qrCodeUnavailable);
  }

  const labelMarkup = items
    .map(
      (item, i) => `
        <article class="label-card">
          <img class="label-card__qr" src="${qrImages[i]}" alt="${escapeHtml(item.sku)}" />
          <div class="label-card__text">
            <strong>${escapeHtml(item.name)}</strong>
            <span>${escapeHtml(item.sku)}</span>
            <small>${escapeHtml(dictionary.printLocation)}: ${escapeHtml(item.location || dictionary.notAvailable)}</small>
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
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
        <style>
          @page { margin: 12mm; }
          * {
            box-sizing: border-box;
          }
          body {
            margin: 0;
            font-family: "IBM Plex Sans", -apple-system, sans-serif;
            color: #1A1A1E;
            background: #fff;
          }
          .label-grid {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 10px;
            align-items: start;
          }
          .label-card {
            page-break-inside: avoid;
            break-inside: avoid;
            min-height: 88mm;
            border: 1px solid #E2E0DC;
            border-radius: 3px;
            padding: 12px;
            display: grid;
            gap: 10px;
            justify-items: center;
            align-content: start;
          }
          .label-card__qr {
            width: min(100%, 46mm);
            height: auto;
            aspect-ratio: 1;
            object-fit: contain;
          }
          .label-card__text {
            display: grid;
            gap: 4px;
            text-align: center;
          }
          .label-card__text strong {
            font-size: 14px;
            line-height: 1.25;
          }
          .label-card__text span,
          .label-card__text small {
            color: #6B6966;
            line-height: 1.3;
          }
          @media (max-width: 900px) {
            .label-grid {
              grid-template-columns: repeat(2, minmax(0, 1fr));
            }
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
