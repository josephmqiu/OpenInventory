import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import type {
  AppSnapshot,
  BatchIssueMaterialInput,
  CreateInventoryItemInput,
  InventoryAlert,
  Language,
  LanAccessState,
  StockMutationInput,
  UpdateBackupPlanInput,
  UpdateInventoryItemInput,
  UpdateLanAccessInput,
} from "../domain/models";
import { dictionaries, localizeBackendMessage, type Dictionary } from "./i18n";
import { detectRuntime, isDevPreviewRuntime, type Runtime } from "./runtime";
import {
  addPersonnel,
  batchIssueMaterial,
  clearLanAccessKey,
  createInventoryItem,
  backupNow,
  isUnauthorizedError,
  issueMaterial,
  loadAppSnapshot,
  loadLanAccessState,
  persistLanAccessKey,
  readPersistedLanAccessKey,
  readPersistedLanguage,
  receiveStock,
  regenerateLanAccessKey,
  removeInventoryItem,
  removePersonnel,
  updateAppLanguage,
  selectBackupDirectory,
  selectRestoreSource,
  validateBackup,
  restoreFromBackup,
  updateBackupPlan,
  updateInventoryItem,
  updateLanAccess,
} from "../services/inventoryGateway";

type NoticeTone = "success" | "warning";

export interface InventoryNotice {
  message: string;
  tone: NoticeTone;
}

export interface InventoryState {
  runtime: Runtime;
  language: Language;
  snapshot: AppSnapshot | null;
  lanAccess: LanAccessState | null;
  loadError: string | null;
  actionError: string | null;
  notice: InventoryNotice | null;
  busy: boolean;
  accessKeyInput: string;
  setAccessKeyInput: Dispatch<SetStateAction<string>>;
  requiresBrowserAuth: boolean;
  connectBrowser: () => void;
  disconnectBrowser: () => void;
  clearFeedback: () => void;
  reportActionError: (message: string) => void;
  handleCreateItem: (input: CreateInventoryItemInput) => Promise<boolean>;
  handleUpdateItem: (input: UpdateInventoryItemInput) => Promise<boolean>;
  handleReceiveStock: (input: StockMutationInput) => Promise<boolean>;
  handleIssueMaterial: (input: StockMutationInput) => Promise<boolean>;
  handleBatchIssueMaterial: (input: BatchIssueMaterialInput) => Promise<boolean>;
  handleRemoveItem: (itemId: string) => Promise<boolean>;
  handleBackupPlanSave: (input: UpdateBackupPlanInput) => Promise<boolean>;
  handleBackupNow: () => Promise<boolean>;
  handleSelectBackupDirectory: () => Promise<string | null>;
  handleRestoreFromBackup: () => Promise<void>;
  handleAddPersonnel: (name: string) => Promise<boolean>;
  handleRemovePersonnel: (personnelId: string) => Promise<boolean>;
  handleLanguageChange: (nextLanguage: Language) => void;
  handleLanAccessSave: (input: UpdateLanAccessInput) => Promise<boolean>;
  handleLanAccessKeyRegenerate: () => Promise<void>;
}

function toErrorMessage(error: unknown, dictionary: Dictionary): string {
  return error instanceof Error ? localizeBackendMessage(error.message, dictionary) : dictionary.genericActionError;
}

function findNewOpenAlert(previous: AppSnapshot, next: AppSnapshot): InventoryAlert | null {
  const previousOpenIds = new Set(
    previous.alerts.filter((alert) => alert.status === "open").map((alert) => alert.id),
  );

  return next.alerts.find((alert) => alert.status === "open" && !previousOpenIds.has(alert.id)) ?? null;
}

function buildMutationNotice(
  previous: AppSnapshot,
  next: AppSnapshot,
  dictionary: Dictionary,
  successMessage: string,
): InventoryNotice {
  const newAlert = findNewOpenAlert(previous, next);
  if (!newAlert) {
    return { message: successMessage, tone: "success" };
  }

  return {
    message: `${successMessage} ${dictionary.lowStockAlertIssued(
      newAlert.itemName,
      newAlert.sku,
      newAlert.currentQuantity,
      newAlert.thresholdQuantity,
    )}`,
    tone: "warning",
  };
}

export function useInventoryState(): InventoryState {
  const runtime = detectRuntime();
  const desktopRuntime = runtime === "desktop";
  const [language, setLanguage] = useState<Language>(() => readPersistedLanguage());
  const [snapshot, setSnapshot] = useState<AppSnapshot | null>(null);
  const [lanAccess, setLanAccess] = useState<LanAccessState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<InventoryNotice | null>(null);
  const [busy, setBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [accessKeyInput, setAccessKeyInput] = useState(() => readPersistedLanAccessKey());
  const dictionary = dictionaries[language];
  const isDev = isDevPreviewRuntime();
  const requiresBrowserAuth = runtime !== "desktop" && !isDev && !readPersistedLanAccessKey().trim();

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = language;
    }
  }, [language]);

  useEffect(() => {
    let cancelled = false;

    setLoadError(null);

    if (runtime !== "desktop" && !isDev && !readPersistedLanAccessKey().trim()) {
      setSnapshot(null);
      return () => {
        cancelled = true;
      };
    }

    loadAppSnapshot()
      .then((result) => {
        if (!cancelled) {
          setLanguage(result.language);
          setSnapshot(result);
        }
      })
      .catch((loadErrorValue: unknown) => {
        if (cancelled) {
          return;
        }

        if (runtime !== "desktop" && isUnauthorizedError(loadErrorValue)) {
          clearLanAccessKey();
          setAccessKeyInput("");
          setSnapshot(null);
          setLoadError(null);
          return;
        }

        setLoadError(toErrorMessage(loadErrorValue, dictionary));
      });

    if (desktopRuntime) {
      loadLanAccessState()
        .then((result) => {
          if (!cancelled) {
            setLanAccess(result);
          }
        })
        .catch((error: unknown) => {
          if (!cancelled) {
            setActionError(toErrorMessage(error, dictionary));
          }
        });
    } else if (isDev) {
      // Dev preview: show the LAN panel with stub data so it's visible in the browser.
      setLanAccess({
        enabled: false,
        port: 4123,
        accessKey: "dev-preview-stub-key-0000",
        urls: [],
        status: "stopped",
        statusMessage: "Dev preview - LAN server runs only in Electron.",
      });
    } else {
      setLanAccess(null);
    }

    return () => {
      cancelled = true;
    };
  }, [desktopRuntime, dictionary, isDev, reloadKey, runtime]);

  useEffect(() => {
    if (!desktopRuntime || busy || typeof window === "undefined" || typeof document === "undefined") {
      return;
    }

    let cancelled = false;
    let refreshTimeout: number | undefined;
    let refreshInFlight = false;

    const clearRefreshTimeout = () => {
      if (refreshTimeout !== undefined) {
        window.clearTimeout(refreshTimeout);
        refreshTimeout = undefined;
      }
    };

    const scheduleRefresh = (delayMs: number) => {
      clearRefreshTimeout();

      if (cancelled || document.visibilityState !== "visible") {
        return;
      }

      refreshTimeout = window.setTimeout(() => {
        refreshTimeout = undefined;
        void refreshSnapshot();
      }, delayMs);
    };

    const refreshSnapshot = async () => {
      if (cancelled || refreshInFlight || document.visibilityState !== "visible") {
        return;
      }

      refreshInFlight = true;

      try {
        const result = await loadAppSnapshot();
        if (cancelled) {
          return;
        }

        setLanguage(result.language);
        setSnapshot(result);
      } catch {
        // Keep the last successful desktop snapshot if a background refresh fails.
      } finally {
        refreshInFlight = false;
        if (!cancelled) {
          scheduleRefresh(2000 + Math.floor(Math.random() * 501));
        }
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") {
        clearRefreshTimeout();
        return;
      }

      if (!refreshInFlight) {
        void refreshSnapshot();
      }
    };

    if (document.visibilityState === "visible") {
      scheduleRefresh(2000 + Math.floor(Math.random() * 501));
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      clearRefreshTimeout();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [busy, desktopRuntime]);

  const handleGatewayError = (error: unknown) => {
    if (runtime !== "desktop" && isUnauthorizedError(error)) {
      clearLanAccessKey();
      setAccessKeyInput("");
      setSnapshot(null);
      setLoadError(null);
      setActionError(null);
      return;
    }

    setActionError(toErrorMessage(error, dictionary));
  };

  const executeMutation = async (work: () => Promise<AppSnapshot>, successMessage: string): Promise<boolean> => {
    if (!snapshot) {
      return false;
    }

    try {
      setBusy(true);
      setActionError(null);
      const previousSnapshot = snapshot;
      const nextSnapshot = await work();
      setSnapshot(nextSnapshot);
      setNotice(buildMutationNotice(previousSnapshot, nextSnapshot, dictionary, successMessage));
      return true;
    } catch (error) {
      handleGatewayError(error);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const handleCreateItem = async (input: CreateInventoryItemInput) =>
    executeMutation(() => createInventoryItem(input), dictionary.successCreateItem);

  const handleUpdateItem = async (input: UpdateInventoryItemInput) =>
    executeMutation(() => updateInventoryItem(input), dictionary.successUpdateItem);

  const handleReceiveStock = async (input: StockMutationInput) =>
    executeMutation(() => receiveStock(input), dictionary.successReceiveStock);

  const handleIssueMaterial = async (input: StockMutationInput) =>
    executeMutation(() => issueMaterial(input), dictionary.successIssueMaterial);

  const handleBatchIssueMaterial = async (input: BatchIssueMaterialInput) =>
    executeMutation(() => batchIssueMaterial(input), dictionary.successBatchIssueMaterial);

  const handleRemoveItem = async (itemId: string) =>
    executeMutation(() => removeInventoryItem(itemId), dictionary.successRemoveItem);

  const handleBackupPlanSave = async (input: UpdateBackupPlanInput) =>
    executeMutation(() => updateBackupPlan(input), dictionary.successUpdateBackupPlan);

  const handleBackupNow = async (): Promise<boolean> => {
    try {
      setBusy(true);
      setActionError(null);
      const nextSnapshot = await backupNow();
      setLanguage(nextSnapshot.language);
      setSnapshot(nextSnapshot);
      setNotice({
        message: dictionary.backupCompleted,
        tone: "success",
      });
      return true;
    } catch (error) {
      handleGatewayError(error);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const handleSelectBackupDirectory = async (): Promise<string | null> => {
    try {
      return await selectBackupDirectory();
    } catch {
      return null;
    }
  };

  const handleRestoreFromBackup = async (): Promise<void> => {
    try {
      const dirPath = await selectRestoreSource();
      if (!dirPath) return;

      const { validation, comparison } = await validateBackup(dirPath);
      if (!validation.valid) {
        setActionError(validation.error ?? "Invalid backup");
        return;
      }

      // Store comparison data for the RestoreDialog (would be managed by App.tsx state)
      // For now, proceed directly with restore if user confirms via the UI
      await restoreFromBackup(dirPath);
      // Won't reach here — app relaunches during restore
    } catch (error) {
      handleGatewayError(error);
    }
  };

  const handleAddPersonnel = async (name: string) =>
    executeMutation(() => addPersonnel({ name }), dictionary.successAddPersonnel);

  const handleRemovePersonnel = async (personnelId: string) =>
    executeMutation(() => removePersonnel(personnelId), dictionary.successRemovePersonnel);

  const handleLanguageChange = (nextLanguage: Language) => {
    setLanguage(nextLanguage);
    void updateAppLanguage(nextLanguage).catch((error: unknown) => {
      handleGatewayError(error);
    });
  };

  const handleLanAccessSave = async (input: UpdateLanAccessInput): Promise<boolean> => {
    if (!desktopRuntime) {
      setNotice({ message: dictionary.lanDesktopOnly, tone: "warning" });
      return false;
    }
    try {
      setBusy(true);
      setActionError(null);
      const nextState = await updateLanAccess(input);
      const nextSnapshot = await loadAppSnapshot();
      setLanAccess(nextState);
      setSnapshot(nextSnapshot);
      setNotice({
        message: nextState.enabled ? dictionary.lanAccessUpdated : dictionary.lanAccessDisabled,
        tone: nextState.status === "error" ? "warning" : "success",
      });
      return true;
    } catch (error) {
      handleGatewayError(error);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const handleLanAccessKeyRegenerate = async () => {
    if (!desktopRuntime) {
      setNotice({ message: dictionary.lanDesktopOnly, tone: "warning" });
      return;
    }
    try {
      setBusy(true);
      setActionError(null);
      const nextState = await regenerateLanAccessKey();
      setLanAccess(nextState);
      setNotice({
        message: dictionary.lanAccessKeyRegenerated,
        tone: "success",
      });
    } catch (error) {
      handleGatewayError(error);
    } finally {
      setBusy(false);
    }
  };

  const connectBrowser = () => {
    const trimmedKey = accessKeyInput.trim();
    if (!trimmedKey) {
      setLoadError(dictionary.enterLanAccessKey);
      return;
    }

    persistLanAccessKey(trimmedKey);
    setLoadError(null);
    setReloadKey((current) => current + 1);
  };

  const disconnectBrowser = () => {
    clearLanAccessKey();
    setAccessKeyInput("");
    setSnapshot(null);
    setLoadError(null);
    setActionError(null);
    setNotice(null);
  };

  const clearFeedback = () => {
    setActionError(null);
    setNotice(null);
  };

  const reportActionError = (message: string) => {
    setNotice(null);
    setActionError(message);
  };

  return {
    runtime,
    language,
    snapshot,
    lanAccess,
    loadError,
    actionError,
    notice,
    busy,
    accessKeyInput,
    setAccessKeyInput,
    requiresBrowserAuth,
    connectBrowser,
    disconnectBrowser,
    clearFeedback,
    reportActionError,
    handleCreateItem,
    handleUpdateItem,
    handleReceiveStock,
    handleIssueMaterial,
    handleBatchIssueMaterial,
    handleRemoveItem,
    handleBackupPlanSave,
    handleBackupNow,
    handleSelectBackupDirectory,
    handleRestoreFromBackup,
    handleAddPersonnel,
    handleRemovePersonnel,
    handleLanguageChange,
    handleLanAccessSave,
    handleLanAccessKeyRegenerate,
  };
}
