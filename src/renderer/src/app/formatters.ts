import type { CurrencyCode, Language } from "../domain/models";
import { localeByLanguage } from "./i18nResources";

/** Number of minor units per major unit for a currency, derived from Intl
 *  (e.g. 100 for 2-decimal currencies). v1 currencies are all 2-decimal, so
 *  this is 100, but deriving it keeps the helpers correct if the set grows. */
export function minorUnitsPerMajor(currency: CurrencyCode): number {
  const digits =
    new Intl.NumberFormat("en", {
      style: "currency",
      currency,
    }).resolvedOptions().maximumFractionDigits ?? 2;
  return 10 ** digits;
}

/** Format an integer minor-unit price in the app currency, localized to the
 *  UI language (symbol, grouping, and decimal count come from Intl). */
export function formatPrice(
  minor: number,
  currency: CurrencyCode,
  language: Language,
): string {
  const major = minor / minorUnitsPerMajor(currency);
  return new Intl.NumberFormat(localeByLanguage[language], {
    style: "currency",
    currency,
  }).format(major);
}

/** Parse a user-entered major-unit price string into integer minor units.
 *  Returns null for blank input (= no price) and undefined for invalid input
 *  (caller should reject). Rejects negatives and sub-minor-unit precision. */
export function parsePriceToMinor(
  raw: string,
  currency: CurrencyCode,
): number | null | undefined {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return undefined;
  const major = Number(trimmed);
  if (!Number.isFinite(major) || major < 0) return undefined;
  const factor = minorUnitsPerMajor(currency);
  const minor = Math.round(major * factor);
  // Reject more precision than the currency allows (e.g. "1.234" for CNY).
  if (Math.abs(major * factor - minor) > 1e-6) return undefined;
  return minor;
}

/** Convert stored minor units back to a major-unit string for a form input
 *  (no currency symbol, no grouping), or "" when there is no price. */
export function minorToPriceInput(
  minor: number | null,
  currency: CurrencyCode,
): string {
  if (minor === null) return "";
  const digits = Math.log10(minorUnitsPerMajor(currency));
  return (minor / minorUnitsPerMajor(currency)).toFixed(digits);
}

export function formatDateTime(value: string, language: Language): string {
  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return value;
  }

  const parsedDate = new Date(trimmedValue);
  if (Number.isNaN(parsedDate.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(localeByLanguage[language], {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(parsedDate);
}

export function formatNumber(value: number, language: Language): string {
  return new Intl.NumberFormat(localeByLanguage[language]).format(value);
}

export function formatFileSize(bytes: number, language: Language): string {
  if (bytes === 0) return "";
  const nf = new Intl.NumberFormat(localeByLanguage[language], {
    maximumFractionDigits: 1,
    minimumFractionDigits: 0,
  });
  if (bytes < 1024) return `${formatNumber(bytes, language)} B`;
  if (bytes < 1024 * 1024) return `${nf.format(bytes / 1024)} KB`;
  return `${nf.format(bytes / (1024 * 1024))} MB`;
}

