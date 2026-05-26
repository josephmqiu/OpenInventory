import { useEffect, useRef, useState } from "react";
import { DEFAULT_CURRENCY, type CurrencyCode, type Language, type PublicCatalogItem } from "../../../shared/types";
import { localizeBackendMessage, setAppLanguage } from "../app/i18n";
import { i18nResources } from "../app/i18nResources";
import { loadPublicCatalog } from "./issueGateway";

export interface PublicCatalogState {
  language: Language;
  currency: CurrencyCode;
  /** null while loading or after a hard failure; an array (possibly empty) once loaded. */
  items: PublicCatalogItem[] | null;
  loadError: string | null;
  retry: () => void;
}

const LANGUAGE_KEY = "inventory-monitor.language";

function readPersistedLanguage(): Language {
  try {
    const v = localStorage.getItem(LANGUAGE_KEY);
    return v === "en" || v === "zh-CN" ? v : "en";
  } catch {
    return "en";
  }
}

/**
 * Loads the full read-only inventory catalog for the mobile LAN lookup page.
 *
 * Catalog-only by design: it knows nothing about scanned-item URLs or fallbacks.
 * `QuickIssueApp` owns the precedence (catalog → derive detail; catalog hard-fail
 * + an itemId → single-item fallback via `useQuickIssueState`). A refresh
 * re-fetches and re-syncs the document language.
 */
export function usePublicCatalog(): PublicCatalogState {
  const [language, setLanguage] = useState<Language>(readPersistedLanguage);
  const [currency, setCurrency] = useState<CurrencyCode>(DEFAULT_CURRENCY);
  const [items, setItems] = useState<PublicCatalogItem[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const languageRef = useRef(language);

  useEffect(() => {
    languageRef.current = language;
  }, [language]);

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    setItems(null);

    loadPublicCatalog()
      .then((catalog) => {
        if (cancelled) return;
        setLanguage(catalog.language);
        setCurrency(catalog.currency);
        setItems(catalog.items);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const currentLanguage = languageRef.current;
        setLoadError(
          localizeBackendMessage(
            err as Error & { messageId?: string; messageValues?: Record<string, string | number> },
            currentLanguage,
            i18nResources[currentLanguage].common.genericActionError,
          ),
        );
      });

    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  useEffect(() => {
    setAppLanguage(language);
  }, [language]);

  const retry = () => setReloadKey((k) => k + 1);

  return { language, currency, items, loadError, retry };
}
