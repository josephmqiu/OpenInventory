import i18n from "i18next";
import ICU from "i18next-icu";
import { initReactI18next } from "react-i18next";
import type { AlertStatus, Language, StockStatus } from "../domain/models";
import { i18nResources, localeByLanguage } from "./i18nResources";


if (!i18n.isInitialized) {
  void i18n
    .use(ICU)
    .use(initReactI18next)
    .init({
      lng: "en",
      fallbackLng: "en",
      initImmediate: false,
      defaultNS: "common",
      ns: ["common", "inventory", "backup", "audit", "quickIssue", "errors"],
      resources: i18nResources,
      interpolation: {
        escapeValue: false,
      },
      react: {
        useSuspense: false,
      },
    });
}

const CATEGORY_KEY_BY_VALUE = {
  "Raw Material": "rawMaterial",
  Parts: "parts",
  Chemical: "chemical",
  Packaging: "packaging",
  Consumable: "consumable",
  "Finished Goods": "finishedGoods",
  原材料: "rawMaterial",
  零件: "parts",
  化学品: "chemical",
  包装: "packaging",
  消耗品: "consumable",
  成品: "finishedGoods",
} as const satisfies Record<string, keyof typeof i18nResources.en.inventory.categories>;

const UNIT_KEY_BY_VALUE = {
  pcs: "pcs",
  件: "pcs",
  kg: "kg",
  千克: "kg",
  g: "g",
  克: "g",
  liters: "liters",
  升: "liters",
  meters: "meters",
  米: "meters",
  boxes: "boxes",
  箱: "boxes",
  packs: "packs",
  包: "packs",
  rolls: "rolls",
  卷: "rolls",
  sheets: "sheets",
  张: "sheets",
} as const satisfies Record<string, keyof typeof i18nResources.en.inventory.units>;

const STOCK_STATUS_KEY_BY_VALUE: Record<StockStatus, keyof typeof i18nResources.en.inventory.stockStatus> = {
  in_stock: "in_stock",
  low_stock: "low_stock",
  out_of_stock: "out_of_stock",
};

const ALERT_STATUS_KEY_BY_VALUE: Record<AlertStatus, keyof typeof i18nResources.en.inventory.alertStatus> = {
  open: "open",
  resolved: "resolved",
};

const LANGUAGE_NAME_KEY_BY_VALUE: Record<Language, keyof typeof i18nResources.en.common.languageNames> = {
  en: "en",
  "zh-CN": "zhCN",
};

type TransportErrorLike = {
  message?: string;
  messageId?: string;
  messageValues?: Record<string, string | number>;
  debugMessage?: string;
};

function normalizedLanguage(language: string): Language {
  return language === "zh-CN" ? "zh-CN" : "en";
}

function defaultErrorFallback(language: Language): string {
  return i18n.getFixedT(language, "common")("genericActionError");
}

export { i18n };

export function setAppLanguage(language: Language): void {
  if (normalizedLanguage(i18n.language) !== language) {
    void i18n.changeLanguage(language);
  }
}

export function translateErrorMessage(
  error: string | TransportErrorLike,
  language: Language = normalizedLanguage(i18n.language),
  fallback = defaultErrorFallback(language),
): string {
  if (typeof error !== "string" && error.messageId) {
    return i18n.getFixedT(language, "errors")(error.messageId, {
      ...error.messageValues,
      defaultValue: error.debugMessage?.trim() || fallback,
    });
  }

  // For generic Error objects, use the fallback
  if (error instanceof Error) {
    return fallback;
  }

  const rawMessage = typeof error === "string" ? error : error.debugMessage?.trim() || error.message?.trim() || "";
  if (!rawMessage) {
    return fallback;
  }

  const translated = i18n.getFixedT(language, "errors")(rawMessage, { defaultValue: "" });
  return translated || rawMessage;
}

export function localizeBackendMessage(
  message: string | TransportErrorLike,
  language: Language = normalizedLanguage(i18n.language),
  fallback = defaultErrorFallback(language),
): string {
  return translateErrorMessage(message, language, fallback);
}

export function localizeCategory(value: string, language: Language): string {
  const key = CATEGORY_KEY_BY_VALUE[value as keyof typeof CATEGORY_KEY_BY_VALUE];
  return key ? i18n.getFixedT(language, "inventory")(`categories.${key}`) : value;
}

export function localizeUnit(value: string, language: Language): string {
  const key = UNIT_KEY_BY_VALUE[value as keyof typeof UNIT_KEY_BY_VALUE];
  return key ? i18n.getFixedT(language, "inventory")(`units.${key}`) : value;
}

export function localizeStockStatus(value: StockStatus, language: Language): string {
  return i18n.getFixedT(language, "inventory")(`stockStatus.${STOCK_STATUS_KEY_BY_VALUE[value]}`);
}

export function stockStatusSeverity(status: StockStatus): "danger" | "warning" | "ok" {
  if (status === "out_of_stock") return "danger";
  if (status === "low_stock") return "warning";
  return "ok";
}

export function localizeAlertStatus(value: AlertStatus, language: Language): string {
  return i18n.getFixedT(language, "inventory")(`alertStatus.${ALERT_STATUS_KEY_BY_VALUE[value]}`);
}

export function localizeLanguageName(value: Language): string {
  return i18n.getFixedT(normalizedLanguage(i18n.language), "common")(`languageNames.${LANGUAGE_NAME_KEY_BY_VALUE[value]}`);
}

export { localeByLanguage };
