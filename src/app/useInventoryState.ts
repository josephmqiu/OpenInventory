import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import type {
  AppSnapshot,
  CreateInventoryItemInput,
  InventoryAlert,
  Language,
  LanAccessState,
  PublicIssueContext,
  StockMutationInput,
  UpdateBackupPlanInput,
  UpdateInventoryItemInput,
  UpdateLanAccessInput,
} from "../domain/models";
import { dictionaries, type Dictionary } from "./i18n";
import { detectRuntime, readIssueRouteAccessKey, readIssueRouteItemId, type Runtime } from "./runtime";
import {
  addPersonnel,
  clearLanAccessKey,
  createInventoryItem,
  isUnauthorizedError,
  issueMaterial,
  issueMaterialPublic,
  loadAppSnapshot,
  loadLanAccessState,
  loadPublicIssueContext,
  persistLanAccessKey,
  readPersistedLanAccessKey,
  readPersistedLanguage,
  receiveStock,
  regenerateLanAccessKey,
  removeInventoryItem,
  removePersonnel,
  updateAppLanguage,
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
  issueRouteItemId: string | null;
  language: Language;
  snapshot: AppSnapshot | null;
  issueContext: PublicIssueContext | null;
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
  handleQuickIssueMaterial: (input: StockMutationInput) => Promise<string>;
  handleRemoveItem: (itemId: string) => Promise<boolean>;
  handleBackupPlanSave: (input: UpdateBackupPlanInput) => Promise<boolean>;
  handleAddPersonnel: (name: string) => Promise<boolean>;
  handleRemovePersonnel: (personnelId: string) => Promise<boolean>;
  handleLanguageChange: (nextLanguage: Language) => void;
  handleLanAccessSave: (input: UpdateLanAccessInput) => Promise<boolean>;
  handleLanAccessKeyRegenerate: () => Promise<void>;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unable to complete the requested action.";
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
  const issueRouteItemId = readIssueRouteItemId();
  const issueRouteAccessKey = readIssueRouteAccessKey();
  const [language, setLanguage] = useState<Language>(() => readPersistedLanguage());
  const [snapshot, setSnapshot] = useState<AppSnapshot | null>(null);
  const [issueContext, setIssueContext] = useState<PublicIssueContext | null>(null);
  const [lanAccess, setLanAccess] = useState<LanAccessState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<InventoryNotice | null>(null);
  const [busy, setBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [accessKeyInput, setAccessKeyInput] = useState(() => readPersistedLanAccessKey());
  const dictionary = dictionaries[language];
  const requiresBrowserAuth = runtime !== "desktop" && !issueRouteItemId && !readPersistedLanAccessKey().trim();

  useEffect(() => {
    let cancelled = false;

    if (runtime !== "desktop" && issueRouteAccessKey) {
      persistLanAccessKey(issueRouteAccessKey);
      setAccessKeyInput(issueRouteAccessKey);
    }

    setLoadError(null);

    if (runtime !== "desktop" && issueRouteItemId) {
      setSnapshot(null);
      loadPublicIssueContext(issueRouteItemId)
        .then((result) => {
          if (!cancelled) {
            setLanguage(result.language);
            setIssueContext(result);
          }
        })
        .catch((loadErrorValue: unknown) => {
          if (!cancelled) {
            setIssueContext(null);
            setLoadError(toErrorMessage(loadErrorValue));
          }
        });
    } else {
      setIssueContext(null);

      if (runtime !== "desktop" && !readPersistedLanAccessKey().trim()) {
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

          setLoadError(toErrorMessage(loadErrorValue));
        });
    }

    if (desktopRuntime) {
      loadLanAccessState()
        .then((result) => {
          if (!cancelled) {
            setLanAccess(result);
          }
        })
        .catch((error: unknown) => {
          if (!cancelled) {
            setActionError(toErrorMessage(error));
          }
        });
    } else {
      setLanAccess(null);
    }

    return () => {
      cancelled = true;
    };
  }, [desktopRuntime, issueRouteAccessKey, issueRouteItemId, reloadKey, runtime]);

  useEffect(() => {
    if (!desktopRuntime || issueRouteItemId || busy) {
      return;
    }

    const refreshInterval = window.setInterval(() => {
      loadAppSnapshot()
        .then((result) => {
          setLanguage(result.language);
          setSnapshot(result);
        })
        .catch(() => {
          // Keep the last successful desktop snapshot if a background refresh fails.
        });
    }, 2000);

    return () => {
      window.clearInterval(refreshInterval);
    };
  }, [busy, desktopRuntime, issueRouteItemId]);

  const handleGatewayError = (error: unknown) => {
    if (runtime !== "desktop" && !issueRouteItemId && isUnauthorizedError(error)) {
      clearLanAccessKey();
      setAccessKeyInput("");
      setSnapshot(null);
      setIssueContext(null);
      setLoadError(null);
      setActionError(null);
      return;
    }

    setActionError(toErrorMessage(error));
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

  const handleQuickIssueMaterial = async (input: StockMutationInput): Promise<string> => {
    try {
      setBusy(true);
      setActionError(null);
      const nextContext = await issueMaterialPublic(input);
      setIssueContext(nextContext);
      setLanguage(nextContext.language);
      setNotice({
        message: dictionary.successIssueMaterial,
        tone: "success",
      });
      return dictionary.successIssueMaterial;
    } catch (error) {
      handleGatewayError(error);
      throw new Error(toErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const handleRemoveItem = async (itemId: string) =>
    executeMutation(() => removeInventoryItem(itemId), dictionary.successRemoveItem);

  const handleBackupPlanSave = async (input: UpdateBackupPlanInput) =>
    executeMutation(() => updateBackupPlan(input), dictionary.successUpdateBackupPlan);

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
    try {
      setBusy(true);
      setActionError(null);
      const nextState = await updateLanAccess(input);
      const nextSnapshot = await loadAppSnapshot();
      setLanAccess(nextState);
      setSnapshot(nextSnapshot);
      setNotice({
        message: nextState.enabled ? "LAN access settings updated." : "LAN access disabled.",
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
    try {
      setBusy(true);
      setActionError(null);
      const nextState = await regenerateLanAccessKey();
      setLanAccess(nextState);
      setNotice({
        message: "LAN access key regenerated.",
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
      setLoadError("Enter the LAN access key shown in the desktop app.");
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
    setIssueContext(null);
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
    issueRouteItemId,
    language,
    snapshot,
    issueContext,
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
    handleQuickIssueMaterial,
    handleRemoveItem,
    handleBackupPlanSave,
    handleAddPersonnel,
    handleRemovePersonnel,
    handleLanguageChange,
    handleLanAccessSave,
    handleLanAccessKeyRegenerate,
  };
}
