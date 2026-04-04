import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type {
  AppSnapshot,
  BatchIssueMaterialInput,
  CreateInventoryItemInput,
  InventoryAlert,
  Language,
  LanAccessState,
  RestoreComparisonData,
  StockMutationInput,
  UpdateBackupPlanInput,
  UpdateInventoryItemInput,
  UpdateLanAccessInput,
} from "../domain/models";
import { i18n, localizeBackendMessage, setAppLanguage } from "./i18n";
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
  pendingRestoreComparison: RestoreComparisonData | null;
  accessKeyInput: string;
  setAccessKeyInput: Dispatch<SetStateAction<string>>;
  requiresBrowserAuth: boolean;
  connectBrowser: () => void;
  disconnectBrowser: () => void;
  clearFeedback: () => void;
  reportActionError: (message: string) => void;
  reportNotice: (message: string, tone?: NoticeTone) => void;
  handleCreateItem: (input: CreateInventoryItemInput) => Promise<boolean>;
  handleUpdateItem: (input: UpdateInventoryItemInput) => Promise<boolean>;
  handleReceiveStock: (input: StockMutationInput) => Promise<boolean>;
  handleIssueMaterial: (input: StockMutationInput) => Promise<boolean>;
  handleBatchIssueMaterial: (input: BatchIssueMaterialInput) => Promise<boolean>;
  handleRemoveItem: (itemId: string) => Promise<boolean>;
  handleBackupPlanSave: (input: UpdateBackupPlanInput) => Promise<boolean>;
  handleBackupNow: () => Promise<boolean>;
  handleSelectBackupDirectory: () => Promise<string | null>;
  startRestoreFromBackup: () => Promise<void>;
  confirmRestoreFromBackup: () => Promise<void>;
  cancelRestoreFromBackup: () => void;
  handleAddPersonnel: (name: string) => Promise<boolean>;
  handleRemovePersonnel: (personnelId: string) => Promise<boolean>;
  handleLanguageChange: (nextLanguage: Language) => void;
  handleLanAccessSave: (input: UpdateLanAccessInput) => Promise<boolean>;
  handleLanAccessKeyRegenerate: () => Promise<void>;
  pollError: boolean;
}

function toErrorMessage(error: unknown, language: Language, fallback: string): string {
  return error instanceof Error
    ? localizeBackendMessage(
        error as Error & { messageId?: string; messageValues?: Record<string, string | number> },
        language,
        fallback,
      )
    : fallback;
}

/**
 * Field-level comparison of two snapshots. Returns true if they represent the
 * same data, allowing the polling loop to skip setState and avoid unnecessary
 * re-renders across the entire component tree.
 */
function snapshotEquals(a: AppSnapshot, b: AppSnapshot): boolean {
  if (a.language !== b.language) return false;
  if (a.items.length !== b.items.length) return false;
  if (a.personnel.length !== b.personnel.length) return false;
  if (a.alerts.length !== b.alerts.length) return false;

  for (let i = 0; i < a.items.length; i++) {
    const ai = a.items[i], bi = b.items[i];
    if (ai.id !== bi.id || ai.currentQuantity !== bi.currentQuantity ||
        ai.status !== bi.status || ai.name !== bi.name || ai.sku !== bi.sku ||
        ai.lastUpdated !== bi.lastUpdated || ai.reorderQuantity !== bi.reorderQuantity ||
        ai.location !== bi.location || ai.category !== bi.category ||
        ai.unit !== bi.unit || ai.supplier !== bi.supplier) return false;
  }

  for (let i = 0; i < a.personnel.length; i++) {
    if (a.personnel[i].id !== b.personnel[i].id ||
        a.personnel[i].name !== b.personnel[i].name) return false;
  }

  for (let i = 0; i < a.alerts.length; i++) {
    const aa = a.alerts[i], ba = b.alerts[i];
    if (aa.id !== ba.id || aa.status !== ba.status ||
        aa.currentQuantity !== ba.currentQuantity) return false;
  }

  if (a.backupPlan.targetPath !== b.backupPlan.targetPath ||
      a.backupPlan.lastSuccessfulBackup !== b.backupPlan.lastSuccessfulBackup ||
      a.backupPlan.status !== b.backupPlan.status ||
      a.backupPlan.schedule.intervalValue !== b.backupPlan.schedule.intervalValue ||
      a.backupPlan.schedule.intervalUnit !== b.backupPlan.schedule.intervalUnit ||
      a.backupPlan.schedule.onStartup !== b.backupPlan.schedule.onStartup) return false;

  return true;
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
  language: Language,
  successMessage: string,
): InventoryNotice {
  const newAlert = findNewOpenAlert(previous, next);
  if (!newAlert) {
    return { message: successMessage, tone: "success" };
  }

  const tInventory = i18n.getFixedT(language, "inventory");
  return {
    message: `${successMessage} ${tInventory("lowStockAlertIssued", {
      itemName: newAlert.itemName,
      sku: newAlert.sku,
      currentQuantity: newAlert.currentQuantity,
      thresholdQuantity: newAlert.thresholdQuantity,
    })}`,
    tone: "warning",
  };
}

export function useInventoryState(): InventoryState {
  const [runtime] = useState(detectRuntime);
  const desktopRuntime = runtime === "desktop";
  const [language, setLanguage] = useState<Language>(() => readPersistedLanguage());
  const [snapshot, setSnapshot] = useState<AppSnapshot | null>(null);
  const [lanAccess, setLanAccess] = useState<LanAccessState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<InventoryNotice | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingRestore, setPendingRestore] = useState<{
    dirPath: string;
    comparison: RestoreComparisonData;
  } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [accessKeyInput, setAccessKeyInput] = useState(() => readPersistedLanAccessKey());
  const [isDev] = useState(isDevPreviewRuntime);
  const [pollError, setPollError] = useState(false);
  const consecutiveFailuresRef = useRef(0);
  const requiresBrowserAuth = runtime !== "desktop" && !isDev && !readPersistedLanAccessKey().trim();
  const tCommon = i18n.getFixedT(language, "common");
  const tInventory = i18n.getFixedT(language, "inventory");
  const tBackup = i18n.getFixedT(language, "backup");

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = language;
    }
    setAppLanguage(language);
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

        setLoadError(toErrorMessage(loadErrorValue, language, tCommon("genericActionError")));
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
            setActionError(toErrorMessage(error, language, tCommon("genericActionError")));
          }
        });
    } else if (isDev) {
      // Dev preview: show the LAN panel with stub data so it's visible in the browser.
      setLanAccess({
        enabled: false,
        port: 47123,
        accessKey: "dev-preview-stub-key-0000",
        urls: [],
        status: "stopped",
        statusMessage: tCommon("devPreviewLanStatus"),
      });
    } else {
      setLanAccess(null);
    }

    return () => {
      cancelled = true;
    };
  }, [desktopRuntime, isDev, reloadKey, runtime]);

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
        setSnapshot(prev => {
          if (prev && snapshotEquals(prev, result)) return prev;
          return result;
        });
        consecutiveFailuresRef.current = 0;
        setPollError(false);
      } catch {
        consecutiveFailuresRef.current += 1;
        if (consecutiveFailuresRef.current >= 3) {
          setPollError(true);
        }
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

    setActionError(toErrorMessage(error, language, tCommon("genericActionError")));
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
      setNotice(buildMutationNotice(previousSnapshot, nextSnapshot, language, successMessage));
      return true;
    } catch (error) {
      handleGatewayError(error);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const handleCreateItem = async (input: CreateInventoryItemInput) =>
    executeMutation(() => createInventoryItem(input), tInventory("successCreateItem"));

  const handleUpdateItem = async (input: UpdateInventoryItemInput) =>
    executeMutation(() => updateInventoryItem(input), tInventory("successUpdateItem"));

  const handleReceiveStock = async (input: StockMutationInput) =>
    executeMutation(() => receiveStock(input), tInventory("successReceiveStock"));

  const handleIssueMaterial = async (input: StockMutationInput) =>
    executeMutation(() => issueMaterial(input), tInventory("successIssueMaterial"));

  const handleBatchIssueMaterial = async (input: BatchIssueMaterialInput) =>
    executeMutation(() => batchIssueMaterial(input), tInventory("successBatchIssueMaterial"));

  const handleRemoveItem = async (itemId: string) =>
    executeMutation(() => removeInventoryItem(itemId), tInventory("successRemoveItem"));

  const handleBackupPlanSave = async (input: UpdateBackupPlanInput) =>
    executeMutation(() => updateBackupPlan(input), tBackup("successUpdateBackupPlan"));

  const handleBackupNow = async (): Promise<boolean> => {
    try {
      setBusy(true);
      setActionError(null);
      const nextSnapshot = await backupNow();
      setLanguage(nextSnapshot.language);
      setSnapshot(nextSnapshot);
      setNotice({
        message: tBackup("backupCompleted"),
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

  const startRestoreFromBackup = async (): Promise<void> => {
    try {
      setBusy(true);
      setActionError(null);
      const dirPath = await selectRestoreSource();
      if (!dirPath) return;

      const { validation, comparison } = await validateBackup(dirPath);
      if (!validation.valid) {
        setPendingRestore(null);
        setActionError(validation.error ?? tBackup("invalidBackupSelection"));
        return;
      }
      if (!comparison) {
        setPendingRestore(null);
        setActionError(tBackup("backupComparisonFailed"));
        return;
      }
      setPendingRestore({ dirPath, comparison });
    } catch (error) {
      setPendingRestore(null);
      handleGatewayError(error);
    } finally {
      setBusy(false);
    }
  };

  const confirmRestoreFromBackup = async (): Promise<void> => {
    if (!pendingRestore) return;

    try {
      setBusy(true);
      setActionError(null);
      await restoreFromBackup(pendingRestore.dirPath);
      setPendingRestore(null);
    } catch (error) {
      setPendingRestore(null);
      handleGatewayError(error);
    } finally {
      setBusy(false);
    }
  };

  const cancelRestoreFromBackup = () => {
    setPendingRestore(null);
  };

  const handleAddPersonnel = async (name: string) =>
    executeMutation(() => addPersonnel({ name }), tInventory("successAddPersonnel"));

  const handleRemovePersonnel = async (personnelId: string) =>
    executeMutation(() => removePersonnel(personnelId), tInventory("successRemovePersonnel"));

  const handleLanguageChange = (nextLanguage: Language) => {
    setLanguage(nextLanguage);
    void updateAppLanguage(nextLanguage).catch((error: unknown) => {
      handleGatewayError(error);
    });
  };

  const handleLanAccessSave = async (input: UpdateLanAccessInput): Promise<boolean> => {
    if (!desktopRuntime) {
      setNotice({ message: tCommon("lanDesktopOnly"), tone: "warning" });
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
        message: nextState.enabled ? tCommon("lanAccessUpdated") : tCommon("lanAccessDisabled"),
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
      setNotice({ message: tCommon("lanDesktopOnly"), tone: "warning" });
      return;
    }
    try {
      setBusy(true);
      setActionError(null);
      const nextState = await regenerateLanAccessKey();
      setLanAccess(nextState);
      setNotice({
        message: tCommon("lanAccessKeyRegenerated"),
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
      setLoadError(tCommon("enterLanAccessKey"));
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

  const reportNotice = (message: string, tone: NoticeTone = "success") => {
    setActionError(null);
    setNotice({ message, tone });
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
    pendingRestoreComparison: pendingRestore?.comparison ?? null,
    accessKeyInput,
    setAccessKeyInput,
    requiresBrowserAuth,
    connectBrowser,
    disconnectBrowser,
    clearFeedback,
    reportActionError,
    reportNotice,
    handleCreateItem,
    handleUpdateItem,
    handleReceiveStock,
    handleIssueMaterial,
    handleBatchIssueMaterial,
    handleRemoveItem,
    handleBackupPlanSave,
    handleBackupNow,
    handleSelectBackupDirectory,
    startRestoreFromBackup,
    confirmRestoreFromBackup,
    cancelRestoreFromBackup,
    handleAddPersonnel,
    handleRemovePersonnel,
    handleLanguageChange,
    handleLanAccessSave,
    handleLanAccessKeyRegenerate,
    pollError,
  };
}
