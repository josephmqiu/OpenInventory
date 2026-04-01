import { useEffect, useState } from "react";
import type { Language, PublicIssueContext, StockMutationInput } from "../../../shared/types";
import { dictionaries, localizeBackendMessage, type Dictionary } from "../app/i18n";
import { loadPublicIssueContext, issueMaterialPublic, IssueGatewayError } from "./issueGateway";

export interface QuickIssueState {
  language: Language;
  dictionary: Dictionary;
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
  const dictionary = dictionaries[language];

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
            ? dictionary.qrItemNotFound
            : err instanceof Error
              ? localizeBackendMessage(err.message, dictionary)
              : dictionary.genericActionError;
          setLoadError(msg);
        }
      });

    return () => { cancelled = true; };
  }, [itemId, reloadKey, dictionary]);

  const handleQuickIssueMaterial = async (input: StockMutationInput): Promise<string> => {
    try {
      setBusy(true);
      setNotice(null);
      const next = await issueMaterialPublic(input);
      setIssueContext(next);
      setLanguage(next.language);
      setNotice({ message: dictionary.successIssueMaterial, tone: "success" });
      return dictionary.successIssueMaterial;
    } catch (err) {
      const msg = err instanceof Error ? localizeBackendMessage(err.message, dictionary) : dictionary.genericActionError;
      setNotice({ message: msg, tone: "error" });
      throw new Error(msg);
    } finally {
      setBusy(false);
    }
  };

  const clearNotice = () => setNotice(null);
  const retry = () => setReloadKey((k) => k + 1);

  return {
    language,
    dictionary,
    issueContext,
    loadError,
    notice,
    busy,
    handleQuickIssueMaterial,
    clearNotice,
    retry,
  };
}
