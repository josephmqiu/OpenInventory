import { useEffect, useRef, useState } from "react";
import type { Language, PublicIssueContext, StockMutationInput } from "../../../shared/types";
import { i18n, localizeBackendMessage, setAppLanguage } from "../app/i18n";
import { i18nResources } from "../app/i18nResources";
import { loadPublicIssueContext, issueMaterialPublic, IssueGatewayError } from "./issueGateway";

export interface QuickIssueState {
  language: Language;
  issueContext: PublicIssueContext | null;
  loadError: string | null;
  notice: { message: string; tone: "success" | "error" } | null;
  busy: boolean;
  handleQuickIssueMaterial: (input: StockMutationInput) => Promise<string>;
  clearNotice: () => void;
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
  const [issueContext, setIssueContext] = useState<PublicIssueContext | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ message: string; tone: "success" | "error" } | null>(null);
  const [busy, setBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const inFlightIssueRef = useRef<Promise<string> | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    setIssueContext(null);

    loadPublicIssueContext(itemId)
      .then((ctx) => {
        if (!cancelled) {
          setLanguage(ctx.language);
          setIssueContext(ctx);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const msg = err instanceof IssueGatewayError && err.status === 404
            ? i18nResources[language].quickIssue.qrItemNotFound
            : localizeBackendMessage(
                err as Error & { messageId?: string; messageValues?: Record<string, string | number> },
                language,
                i18nResources[language].common.genericActionError,
              );
          setLoadError(msg);
        }
      });

    return () => { cancelled = true; };
  }, [itemId, reloadKey]);

  useEffect(() => {
    setAppLanguage(language);
  }, [language]);

  const handleQuickIssueMaterial = async (input: StockMutationInput): Promise<string> => {
    if (inFlightIssueRef.current) {
      return inFlightIssueRef.current;
    }

    const request = (async () => {
      try {
        setBusy(true);
        setNotice(null);
        const next = await issueMaterialPublic(input);
        setIssueContext(next);
        setLanguage(next.language);
        const tInventory = i18n.getFixedT(next.language, "inventory");
        setNotice({ message: tInventory("successIssueMaterial"), tone: "success" });
        return tInventory("successIssueMaterial");
      } catch (err) {
        const msg = localizeBackendMessage(
          err as Error & { messageId?: string; messageValues?: Record<string, string | number> },
          language,
          i18nResources[language].common.genericActionError,
        );
        setNotice({ message: msg, tone: "error" });
        throw new Error(msg);
      } finally {
        setBusy(false);
        if (inFlightIssueRef.current === request) {
          inFlightIssueRef.current = null;
        }
      }
    })();

    inFlightIssueRef.current = request;
    return request;
  };

  const clearNotice = () => setNotice(null);
  const retry = () => setReloadKey((k) => k + 1);

  return {
    language,
    issueContext,
    loadError,
    notice,
    busy,
    handleQuickIssueMaterial,
    clearNotice,
    retry,
  };
}
