import { useEffect, useRef, useState } from "react";
import type { Language, PublicItemContext } from "../../../shared/types";
import { localizeBackendMessage, setAppLanguage } from "../app/i18n";
import { i18nResources } from "../app/i18nResources";
import { loadPublicItemContext, IssueGatewayError } from "./issueGateway";

export interface QuickIssueState {
  language: Language;
  itemContext: PublicItemContext | null;
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

export function useQuickIssueState(itemId: string): QuickIssueState {
  const [language, setLanguage] = useState<Language>(readPersistedLanguage);
  const [itemContext, setItemContext] = useState<PublicItemContext | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const languageRef = useRef(language);

  useEffect(() => {
    languageRef.current = language;
  }, [language]);

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    setItemContext(null);

    loadPublicItemContext(itemId)
      .then((ctx) => {
        if (!cancelled) {
          setLanguage(ctx.language);
          setItemContext(ctx);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const currentLanguage = languageRef.current;
          const msg = err instanceof IssueGatewayError && err.status === 404
            ? i18nResources[currentLanguage].quickIssue.qrItemNotFound
            : localizeBackendMessage(
                err as Error & { messageId?: string; messageValues?: Record<string, string | number> },
                currentLanguage,
                i18nResources[currentLanguage].common.genericActionError,
              );
          setLoadError(msg);
        }
      });

    return () => { cancelled = true; };
  }, [itemId, reloadKey]);

  useEffect(() => {
    setAppLanguage(language);
  }, [language]);

  const retry = () => setReloadKey((k) => k + 1);

  return {
    language,
    itemContext,
    loadError,
    retry,
  };
}
