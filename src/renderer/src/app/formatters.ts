import type { Language } from "../domain/models";
import { localeByLanguage } from "./i18nResources";

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

