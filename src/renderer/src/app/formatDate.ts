import type { Language } from "../domain/models";

const localeByLanguage: Record<Language, string> = {
  en: "en-US",
  "zh-CN": "zh-CN",
};

export function formatDate(value: string, language: Language): string {
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
