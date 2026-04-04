import QRCode from "qrcode";
import type { InventoryItem, QrLabelExportPayload } from "../../domain/models";
import {
  buildUniqueQrLabelFileNames,
  truncateQrLabelText,
} from "../../../../shared/qrLabelExport";

const LABEL_WIDTH = 1200;
const LABEL_HEIGHT = 800;
const QR_SIZE = 420;
const QR_X = (LABEL_WIDTH - QR_SIZE) / 2;
const QR_Y = 104;
const TITLE_Y = 610;
const SKU_Y = 664;
const TITLE_MAX_LENGTH = 44;
const SKU_MAX_LENGTH = 40;

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function getCanvasContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Unable to export QR labels.");
  }
  return context;
}

async function renderQrCodeCanvas(text: string): Promise<HTMLCanvasElement> {
  const qrCanvas = createCanvas(QR_SIZE, QR_SIZE);
  await QRCode.toCanvas(qrCanvas, text, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: QR_SIZE,
    color: {
      dark: "#111111",
      light: "#FFFFFF",
    },
  });
  return qrCanvas;
}

export async function renderQrLabelPng(item: Pick<InventoryItem, "sku" | "name" | "qrCodeDataUrl">): Promise<string> {
  if (!item.qrCodeDataUrl) {
    throw new Error("QR code unavailable.");
  }

  const canvas = createCanvas(LABEL_WIDTH, LABEL_HEIGHT);
  const context = getCanvasContext(canvas);
  const qrCanvas = await renderQrCodeCanvas(item.qrCodeDataUrl);
  const itemName = truncateQrLabelText(item.name || "unnamed-item", TITLE_MAX_LENGTH);
  const sku = truncateQrLabelText(item.sku || "NO-SKU", SKU_MAX_LENGTH);

  context.fillStyle = "#FFFFFF";
  context.fillRect(0, 0, LABEL_WIDTH, LABEL_HEIGHT);

  context.strokeStyle = "#E2E0DC";
  context.lineWidth = 4;
  context.strokeRect(2, 2, LABEL_WIDTH - 4, LABEL_HEIGHT - 4);

  context.drawImage(qrCanvas, QR_X, QR_Y, QR_SIZE, QR_SIZE);

  context.textAlign = "center";
  context.textBaseline = "middle";

  context.fillStyle = "#171717";
  context.font = '600 36px "IBM Plex Sans", "Segoe UI", sans-serif';
  context.fillText(itemName, LABEL_WIDTH / 2, TITLE_Y);

  context.fillStyle = "#5B5752";
  context.font = '500 28px "IBM Plex Sans", "Segoe UI", sans-serif';
  context.fillText(sku, LABEL_WIDTH / 2, SKU_Y);

  return canvas.toDataURL("image/png");
}

export async function buildQrLabelExportPayload(
  item: Pick<InventoryItem, "id" | "sku" | "name" | "qrCodeDataUrl">,
): Promise<QrLabelExportPayload> {
  return {
    suggestedFileName: buildUniqueQrLabelFileNames([item])[0],
    pngDataUrl: await renderQrLabelPng(item),
  };
}

export async function buildQrLabelExportPayloads(
  items: Array<Pick<InventoryItem, "id" | "sku" | "name" | "qrCodeDataUrl">>,
): Promise<QrLabelExportPayload[]> {
  const fileNames = buildUniqueQrLabelFileNames(items);

  return Promise.all(items.map(async (item, index) => ({
    suggestedFileName: fileNames[index],
    pngDataUrl: await renderQrLabelPng(item),
  })));
}
