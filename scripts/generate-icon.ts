/**
 * Generate a 1024x1024 app icon as PNG using pure Node.js (no native deps).
 *
 * Dark charcoal rounded square with amber "OI" monogram,
 * matching the DESIGN.md color palette.
 *
 * Usage: npx tsx scripts/generate-icon.ts
 * Output: build/icon.png
 */
import { writeFileSync } from "fs";
import { join } from "path";
import zlib from "zlib";

const SIZE = 1024;
const R = 200; // corner radius

// DESIGN.md colors
const BG: RGB = [0x11, 0x11, 0x14];
const ACCENT: RGB = [0xD4, 0x91, 0x2A];
const MUTED: RGB = [0x9B, 0x9A, 0x97];

type RGB = [number, number, number];
type RGBA = [number, number, number, number];

/** Distance from point to nearest edge of a rounded rect (negative = inside). */
function roundedRectSDF(px: number, py: number, w: number, h: number, r: number): number {
  // Center the coordinate system
  const cx = px - w / 2;
  const cy = py - h / 2;
  const hw = w / 2 - r;
  const hh = h / 2 - r;
  const dx = Math.max(Math.abs(cx) - hw, 0);
  const dy = Math.max(Math.abs(cy) - hh, 0);
  return Math.sqrt(dx * dx + dy * dy) - r;
}

function dist(x1: number, y1: number, x2: number, y2: number): number {
  return Math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2);
}

function getPixel(x: number, y: number): RGBA {
  const sdf = roundedRectSDF(x, y, SIZE, SIZE, R);

  // Outside → transparent
  if (sdf > 0.5) return [0, 0, 0, 0];

  // Border: 12px amber band at the edge
  if (sdf > -12) return [ACCENT[0], ACCENT[1], ACCENT[2], 255];

  // ── "O" letter — ring centered at (370, 440) ──
  const oD = dist(x, y, 370, 440);
  if (oD <= 165 && oD >= 110) return [ACCENT[0], ACCENT[1], ACCENT[2], 255];

  // ── "I" letter — centered at x=654, y=440 ──
  const iCx = 654, iCy = 440;
  const iTop = iCy - 160, iBot = iCy + 160;
  const serifW = 82, stemW = 28, serifH = 48;

  // Top serif
  if (y >= iTop && y < iTop + serifH && x >= iCx - serifW && x <= iCx + serifW) {
    return [ACCENT[0], ACCENT[1], ACCENT[2], 255];
  }
  // Bottom serif
  if (y > iBot - serifH && y <= iBot && x >= iCx - serifW && x <= iCx + serifW) {
    return [ACCENT[0], ACCENT[1], ACCENT[2], 255];
  }
  // Vertical stem
  if (y >= iTop && y <= iBot && x >= iCx - stemW && x <= iCx + stemW) {
    return [ACCENT[0], ACCENT[1], ACCENT[2], 255];
  }

  // ── Decorative accent line under letters ──
  if (y >= 650 && y < 654 && x >= 260 && x <= 764) {
    return [ACCENT[0], ACCENT[1], ACCENT[2], 100];
  }

  // ── Three abstract bars suggesting "INVENTORY" ──
  if (y >= 700 && y < 710) {
    if ((x >= 350 && x <= 510) || (x >= 520 && x <= 630) || (x >= 640 && x <= 680)) {
      return [MUTED[0], MUTED[1], MUTED[2], 140];
    }
  }

  // Background fill
  return [BG[0], BG[1], BG[2], 255];
}

function createPixelBuffer(): Buffer {
  const buf = Buffer.alloc(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const idx = (y * SIZE + x) * 4;
      const [r, g, b, a] = getPixel(x, y);
      buf[idx] = r;
      buf[idx + 1] = g;
      buf[idx + 2] = b;
      buf[idx + 3] = a;
    }
  }
  return buf;
}

// ── Minimal PNG encoder ──

function crc32(buf: Buffer): number {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
    }
  }
  return crc ^ 0xFFFFFFFF;
}

function makeChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBytes = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])) >>> 0, 0);
  return Buffer.concat([len, typeBytes, data, crc]);
}

function encodePNG(width: number, height: number, rgba: Buffer): Buffer {
  const rowSize = 1 + width * 4;
  const rawData = Buffer.alloc(height * rowSize);
  for (let y = 0; y < height; y++) {
    rawData[y * rowSize] = 0; // filter: None
    rgba.copy(rawData, y * rowSize + 1, y * width * 4, (y + 1) * width * 4);
  }

  const compressed = zlib.deflateSync(rawData, { level: 9 });
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), // PNG signature
    makeChunk("IHDR", ihdr),
    makeChunk("IDAT", compressed),
    makeChunk("IEND", Buffer.alloc(0)),
  ]);
}

// ── Main ──

const pixels = createPixelBuffer();
const png = encodePNG(SIZE, SIZE, pixels);
const outPath = join(import.meta.dirname, "..", "build", "icon.png");
writeFileSync(outPath, png);
console.log(`Created ${outPath} (${png.length} bytes, ${SIZE}x${SIZE})`);
