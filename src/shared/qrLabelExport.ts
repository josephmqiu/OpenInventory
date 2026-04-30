import type { InventoryItem } from "./types";

// eslint-disable-next-line no-control-regex -- Windows filenames cannot contain ASCII control characters.
const INVALID_FILENAME_CHARS = /[<>:"/\\|?*\u0000-\u001F]/g;
const TRAILING_DOTS_AND_SPACES = /[. ]+$/g;
const MULTIPLE_SPACES = /\s+/g;
const WINDOWS_RESERVED_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

function sanitizeFileNameSegment(value: string): string {
  const sanitized = value
    .replace(INVALID_FILENAME_CHARS, " ")
    .replace(MULTIPLE_SPACES, " ")
    .trim()
    .replace(TRAILING_DOTS_AND_SPACES, "");

  if (!sanitized) {
    return "";
  }

  return WINDOWS_RESERVED_NAMES.test(sanitized) ? `_${sanitized}` : sanitized;
}

export function truncateQrLabelText(value: string, maxLength: number): string {
  const normalized = value.trim().replace(MULTIPLE_SPACES, " ");
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

export function buildQrLabelFileName(item: Pick<InventoryItem, "id" | "sku" | "name">): string {
  const sku = sanitizeFileNameSegment(item.sku);
  const name = sanitizeFileNameSegment(item.name);

  if (sku && name) {
    return `${sku} - ${name}.png`;
  }

  if (name) {
    return `NO-SKU - ${name}.png`;
  }

  if (sku) {
    return `${sku} - unnamed-item.png`;
  }

  const fallbackId = sanitizeFileNameSegment(item.id) || "qr-label";
  return `${fallbackId}.png`;
}

export function normalizeQrLabelFileName(fileName: string): string {
  const trimmed = fileName.trim();
  const withoutExtension = trimmed.toLowerCase().endsWith(".png")
    ? trimmed.slice(0, -4)
    : trimmed;
  const normalizedBase = sanitizeFileNameSegment(withoutExtension) || "qr-label";

  return `${normalizedBase}.png`;
}

export function makeUniqueQrLabelFileName(fileName: string, usedNames: Set<string>): string {
  const normalizedFileName = normalizeQrLabelFileName(fileName);
  const extensionIndex = normalizedFileName.toLowerCase().lastIndexOf(".png");
  const baseName = extensionIndex >= 0
    ? normalizedFileName.slice(0, extensionIndex)
    : normalizedFileName;

  let candidate = normalizedFileName;
  let suffix = 2;

  while (usedNames.has(candidate.toLowerCase())) {
    candidate = `${baseName} (${suffix}).png`;
    suffix += 1;
  }

  usedNames.add(candidate.toLowerCase());
  return candidate;
}

export function buildUniqueQrLabelFileNames(items: Array<Pick<InventoryItem, "id" | "sku" | "name">>): string[] {
  const usedNames = new Set<string>();
  return items.map((item) => makeUniqueQrLabelFileName(buildQrLabelFileName(item), usedNames));
}
