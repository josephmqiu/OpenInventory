import { useEffect, useState } from "react";
import { buildDashboardMetrics } from "../domain/inventory";
import type {
  ActionKind,
  AppSnapshot,
  CreateInventoryItemInput,
  InventoryAlert,
  Language,
  LanAccessState,
  PublicIssueContext,
  StockMutationInput,
  UpdateInventoryItemInput,
  UpdateLanAccessInput,
} from "../domain/models";
import { dictionaries, localizeLanguageName, localizeUnit } from "./i18n";
import { AlertsPanel } from "../ui/components/AlertsPanel";
import { InventoryTable } from "../ui/components/InventoryTable";
import { ItemManagementTable } from "../ui/components/ItemManagementTable";
import { MetricCard } from "../ui/components/MetricCard";
import { PersonnelPanel } from "../ui/components/PersonnelPanel";
import { ActionPanel } from "../ui/components/ActionPanel";
import { LanAccessPanel } from "../ui/components/LanAccessPanel";
import { QuickIssuePage } from "../ui/components/QuickIssuePage";
import {
  addPersonnel,
  clearLanAccessKey,
  createInventoryItem,
  isBrowserRuntime,
  isDesktopRuntime,
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
  updateInventoryItem,
  updateLanAccess,
} from "../services/inventoryGateway";
import type { Dictionary } from "./i18n";

type Section = "dashboard" | "inventory" | "itemManagement" | "alerts" | "personnel" | "settings";
type NoticeTone = "success" | "warning";

const navOrder: Section[] = ["dashboard", "inventory", "itemManagement", "alerts", "personnel", "settings"];

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unable to complete the requested action.";
}

function readIssueRouteItemId(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  const match = /^\/issue\/([^/]+)\/?$/i.exec(window.location.pathname);
  return match ? decodeURIComponent(match[1]) : null;
}

function readIssueRouteAccessKey(): string {
  if (typeof window === "undefined") {
    return "";
  }

  return new URLSearchParams(window.location.search).get("key")?.trim() ?? "";
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
): { message: string; tone: NoticeTone } {
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

function sectionSubtitle(section: Section, dictionary: Dictionary): string {
  switch (section) {
    case "inventory":
      return dictionary.inventoryOperationsHint;
    case "itemManagement":
      return dictionary.manageItemsHint;
    case "alerts":
      return dictionary.noAlertsHint;
    case "personnel":
      return dictionary.managePersonnelHint;
    case "settings":
      return dictionary.backupStorageHint;
    default:
      return dictionary.currentInventoryLevels;
  }
}

export function App() {
  const desktopRuntime = isDesktopRuntime();
  const browserRuntime = isBrowserRuntime();
  const issueRouteItemId = browserRuntime ? readIssueRouteItemId() : null;
  const issueRouteAccessKey = browserRuntime ? readIssueRouteAccessKey() : "";
  const [language, setLanguage] = useState<Language>(() => readPersistedLanguage());
  const [section, setSection] = useState<Section>("dashboard");
  const [snapshot, setSnapshot] = useState<AppSnapshot | null>(null);
  const [issueContext, setIssueContext] = useState<PublicIssueContext | null>(null);
  const [lanAccess, setLanAccess] = useState<LanAccessState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ message: string; tone: NoticeTone } | null>(null);
  const [busy, setBusy] = useState(false);
  const [action, setAction] = useState<ActionKind | null>(null);
  const [activeItemId, setActiveItemId] = useState<string>("");
  const [reloadKey, setReloadKey] = useState(0);
  const [accessKeyInput, setAccessKeyInput] = useState(() => readPersistedLanAccessKey());
  const dictionary = dictionaries[language];

  useEffect(() => {
    let cancelled = false;

    if (browserRuntime && issueRouteAccessKey) {
      persistLanAccessKey(issueRouteAccessKey);
      setAccessKeyInput(issueRouteAccessKey);
    }

    setLoadError(null);

    if (browserRuntime && issueRouteItemId) {
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

      if (browserRuntime && !readPersistedLanAccessKey().trim()) {
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

          if (browserRuntime && isUnauthorizedError(loadErrorValue)) {
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
    }

    return () => {
      cancelled = true;
    };
  }, [browserRuntime, desktopRuntime, issueRouteAccessKey, issueRouteItemId, reloadKey]);

  useEffect(() => {
    if (!desktopRuntime || issueRouteItemId || action || busy) {
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
  }, [action, busy, desktopRuntime, issueRouteItemId]);

  const openAction = (nextAction: ActionKind, itemId?: string) => {
    setAction(nextAction);
    setActiveItemId(itemId ?? "");
    setActionError(null);
    setNotice(null);
  };

  const closeAction = () => {
    setAction(null);
    setActiveItemId("");
  };

  const handleGatewayError = (error: unknown) => {
    if (browserRuntime && !issueRouteItemId && isUnauthorizedError(error)) {
      clearLanAccessKey();
      setAccessKeyInput("");
      setSnapshot(null);
      setAction(null);
      setLoadError(null);
      setActionError(null);
      return;
    }

    setActionError(toErrorMessage(error));
  };

  const runMutation = async (work: () => Promise<AppSnapshot>, successMessage: string) => {
    if (!snapshot) {
      return;
    }

    try {
      setBusy(true);
      setActionError(null);
      const previousSnapshot = snapshot;
      const nextSnapshot = await work();
      setSnapshot(nextSnapshot);
      closeAction();
      setNotice(buildMutationNotice(previousSnapshot, nextSnapshot, dictionary, successMessage));
    } catch (error) {
      handleGatewayError(error);
    } finally {
      setBusy(false);
    }
  };

  const handleCreateItem = async (input: CreateInventoryItemInput) =>
    runMutation(() => createInventoryItem(input), dictionary.successCreateItem);

  const handleUpdateItem = async (input: UpdateInventoryItemInput) =>
    runMutation(() => updateInventoryItem(input), dictionary.successUpdateItem);

  const handleReceiveStock = async (input: StockMutationInput) =>
    runMutation(() => receiveStock(input), dictionary.successReceiveStock);

  const handleIssueMaterial = async (input: StockMutationInput) =>
    runMutation(() => issueMaterial(input), dictionary.successIssueMaterial);

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
    runMutation(() => removeInventoryItem(itemId), dictionary.successRemoveItem);

  const handleAddPersonnel = async (name: string) =>
    runMutation(() => addPersonnel({ name }), dictionary.successAddPersonnel);

  const handleRemovePersonnel = async (personnelId: string) =>
    runMutation(() => removePersonnel(personnelId), dictionary.successRemovePersonnel);

  const handleLanguageChange = (nextLanguage: Language) => {
    setLanguage(nextLanguage);
    void updateAppLanguage(nextLanguage).catch((error: unknown) => {
      handleGatewayError(error);
    });
  };

  const handleLanAccessSave = async (input: UpdateLanAccessInput) => {
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
    } catch (error) {
      handleGatewayError(error);
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

  const handleBrowserSignIn = () => {
    const trimmedKey = accessKeyInput.trim();
    if (!trimmedKey) {
      setLoadError("Enter the LAN access key shown in the desktop app.");
      return;
    }

    persistLanAccessKey(trimmedKey);
    setLoadError(null);
    setReloadKey((current) => current + 1);
  };

  if (browserRuntime && !issueRouteItemId && !readPersistedLanAccessKey().trim()) {
    return (
      <main className="state-screen state-screen--auth">
        <div className="auth-card">
          <span className="sidebar__eyebrow">LAN Inventory Access</span>
          <h1>{dictionary.appName}</h1>
          <p>Enter the access key from the desktop app to open the inventory workspace on this device.</p>
          <label className="auth-card__field">
            <span>Access Key</span>
            <input
              autoFocus
              type="password"
              value={accessKeyInput}
              onChange={(event) => setAccessKeyInput(event.target.value)}
            />
          </label>
          {loadError && <div className="feedback-banner feedback-banner--error">{loadError}</div>}
          <button onClick={handleBrowserSignIn} type="button">
            Connect
          </button>
        </div>
      </main>
    );
  }

  if (loadError) {
    return (
      <main className="state-screen">
        <h1>{dictionary.appName}</h1>
        <p>{loadError}</p>
      </main>
    );
  }

  if (issueRouteItemId && !issueContext) {
    return (
      <main className="state-screen">
        <h1>{dictionary.appName}</h1>
        <p>{dictionary.loadingWorkspace}</p>
      </main>
    );
  }

  if (!issueRouteItemId && !snapshot) {
    return (
      <main className="state-screen">
        <h1>{dictionary.appName}</h1>
        <p>{dictionary.loadingWorkspace}</p>
      </main>
    );
  }

  const issueRouteItem = issueContext?.item ?? null;
  const metrics = snapshot ? buildDashboardMetrics(snapshot.items, snapshot.alerts) : null;
  const headerTitle = issueRouteItem
    ? `${dictionary.issueMaterial}: ${issueRouteItem.name}`
    : issueRouteItemId
      ? dictionary.issueMaterial
      : dictionary[section];
  const headerSubtitle = issueRouteItem
    ? `${dictionary.currentQuantity}: ${issueRouteItem.currentQuantity} ${localizeUnit(issueRouteItem.unit, language)}`
    : issueRouteItemId
      ? dictionary.actionPanelHint.issueMaterial
      : sectionSubtitle(section, dictionary);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar__brand">
          <span className="sidebar__eyebrow">{browserRuntime ? "Inventory LAN" : "Inventory Desktop"}</span>
          <h1>{dictionary.appName}</h1>
          <p>{dictionary.tagline}</p>
        </div>
        {!issueRouteItemId && (
          <nav className="sidebar__nav">
            {navOrder.map((item) => (
              <button
                key={item}
                className={section === item ? "nav-item nav-item--active" : "nav-item"}
                onClick={() => setSection(item)}
                type="button"
              >
                {dictionary[item]}
              </button>
            ))}
          </nav>
        )}
      </aside>
      <main className="content">
        <header className="topbar">
          <div>
            <h2>{headerTitle}</h2>
            <p>{headerSubtitle}</p>
          </div>
          <div className="topbar__controls">
            {browserRuntime && !issueRouteItemId && (
              <button
                className="button-secondary button-inline"
                onClick={() => {
                  clearLanAccessKey();
                  setAccessKeyInput("");
                  setSnapshot(null);
                }}
                type="button"
              >
                Disconnect
              </button>
            )}
            <label className="language-switch">
              <span>{dictionary.language}</span>
              <select value={language} onChange={(event) => handleLanguageChange(event.target.value as Language)}>
                <option value="en">{localizeLanguageName("en")}</option>
                <option value="zh-CN">{localizeLanguageName("zh-CN")}</option>
              </select>
            </label>
          </div>
        </header>

        {notice && <div className={`feedback-banner feedback-banner--${notice.tone}`}>{notice.message}</div>}
        {actionError && <div className="feedback-banner feedback-banner--error">{actionError}</div>}

        {!issueRouteItemId && snapshot && (
          <ActionPanel
            action={action}
            activeItemId={activeItemId}
            busy={busy}
            dictionary={dictionary}
            language={language}
            items={snapshot.items}
            personnel={snapshot.personnel}
            onClose={closeAction}
            onCreateItem={handleCreateItem}
            onUpdateItem={handleUpdateItem}
            onReceiveStock={handleReceiveStock}
            onIssueMaterial={handleIssueMaterial}
            onRemoveItem={handleRemoveItem}
            onError={(message) => {
              setNotice(null);
              setActionError(message);
            }}
          />
        )}

        {issueRouteItemId ? (
          issueRouteItem && issueContext ? (
            <QuickIssuePage
              busy={busy}
              dictionary={dictionary}
              item={issueRouteItem}
              language={language}
              personnel={issueContext.personnel}
              onIssue={handleQuickIssueMaterial}
            />
          ) : (
            <section className="panel">
              <div className="empty-state">
                <h3>{dictionary.issueMaterial}</h3>
                <p>This QR code points to an item that is not available in the current inventory database.</p>
              </div>
            </section>
          )
        ) : (
          snapshot && (
            <>
              {section === "dashboard" && metrics && (
                <section className="metrics-grid">
                  <MetricCard label={dictionary.totalItems} value={metrics.totalItems} />
                  <MetricCard label={dictionary.totalUnits} value={metrics.totalUnits} />
                  <MetricCard label={dictionary.lowStock} value={metrics.lowStockCount} tone="warning" />
                  <MetricCard label={dictionary.outOfStock} value={metrics.outOfStockCount} tone="danger" />
                  <MetricCard label={dictionary.openAlerts} value={metrics.openAlertCount} tone="warning" />
                </section>
              )}

              <section className="content-stack">
                {(section === "dashboard" || section === "inventory") && (
                  <InventoryTable
                    busy={busy}
                    dictionary={dictionary}
                    language={language}
                    items={snapshot.items}
                    onIssueMaterial={() => openAction("issueMaterial")}
                    onReceiveStock={() => openAction("receiveStock")}
                  />
                )}
                {section === "itemManagement" && (
                  <ItemManagementTable
                    busy={busy}
                    dictionary={dictionary}
                    language={language}
                    items={snapshot.items}
                    onCreateItem={() => openAction("createItem")}
                    onModifyItem={(itemId) => openAction("modifyItem", itemId)}
                    onRemoveItem={(itemId) => openAction("removeItem", itemId)}
                  />
                )}
                {section === "alerts" && <AlertsPanel dictionary={dictionary} alerts={snapshot.alerts} />}
                {section === "personnel" && (
                  <PersonnelPanel
                    busy={busy}
                    dictionary={dictionary}
                    personnel={snapshot.personnel}
                    onAddPersonnel={handleAddPersonnel}
                    onRemovePersonnel={handleRemovePersonnel}
                  />
                )}
                {section === "settings" && (
                  <>
                    {desktopRuntime && lanAccess && (
                      <LanAccessPanel
                        busy={busy}
                        lanAccess={lanAccess}
                        onRegenerateKey={handleLanAccessKeyRegenerate}
                        onSave={handleLanAccessSave}
                      />
                    )}
                  </>
                )}
              </section>
            </>
          )
        )}
      </main>
    </div>
  );
}

