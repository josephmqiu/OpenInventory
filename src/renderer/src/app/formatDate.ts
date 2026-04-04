import type { Language } from "../domain/models";
import { formatDateTime } from "./formatters";

export function formatDate(value: string, language: Language): string {
  return formatDateTime(value, language);
}
