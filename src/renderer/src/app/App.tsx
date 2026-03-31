import { useEffect, useState } from "react";
import { buildDashboardMetrics } from "../domain/inventory";
import type { ActionKind, Language } from "../domain/models";
import { dictionaries, localizeLanguageName, localizeUnit } from "./i18n";
import { AlertsPanel } from "../ui/components/AlertsPanel";
import { BackupPanel } from "../ui/components/BackupPanel";
import { InventoryTable } from "../ui/components/InventoryTable";
import { ItemManagementTable } from "../ui/components/ItemManagementTable";
import { MetricCard } from "../ui/components/MetricCard";
import { PersonnelPanel } from "../ui/components/PersonnelPanel";
import { ActionPanel } from "../ui/components/ActionPanel";
import { BatchIssuePanel } from "../ui/components/BatchIssuePanel";
import { LanAccessPanel } from "../ui/components/LanAccessPanel";
import { QuickIssuePage } from "../ui/components/QuickIssuePage";
import type { Dictionary } from "./i18n";
import { useInventoryState } from "./useInventoryState";

type Section = "dashboard" | "inventory" | "itemManagement" | "alerts" | "personnel" | "settings";

const navOrder: Section[] = ["dashboard", "inventory", "itemManagement", "alerts", "personnel", "settings"];

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
  const [section, setSection] = useState<Section>("dashboard");
  const [action, setAction] = useState<ActionKind | null>(null);
  const [activeItemId, setActiveItemId] = useState<string>("");
  const [batchIssueItemIds, setBatchIssueItemIds] = useState<string[]>([]);
  const {
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
    handleBatchIssueMaterial,
    handleQuickIssueMaterial,
    handleRemoveItem,
    handleBackupPlanSave,
    handleBackupNow,
    handleAddPersonnel,
    handleRemovePersonnel,
    handleLanguageChange,
    handleLanAccessSave,
    handleLanAccessKeyRegenerate,
  } = useInventoryState();
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    if (typeof localStorage !== "undefined") {
      return (localStorage.getItem("oi-theme") as "dark" | "light") || "dark";
    }
    return "dark";
  });

  useEffect(() => {
    if (theme === "light") {
      document.documentElement.setAttribute("data-theme", "light");
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
    localStorage.setItem("oi-theme", theme);
  }, [theme]);

  const desktopRuntime = runtime === "desktop";
  const browserRuntime = runtime !== "desktop";
  const dictionary = dictionaries[language];

  const openAction = (nextAction: ActionKind, itemId?: string) => {
    setAction(nextAction);
    setActiveItemId(itemId ?? "");
    setBatchIssueItemIds([]);
    clearFeedback();
  };

  const closeAction = () => {
    setAction(null);
    setActiveItemId("");
  };

  const openBatchIssue = (itemIds: string[]) => {
    setAction(null);
    setActiveItemId("");
    setBatchIssueItemIds(itemIds);
    clearFeedback();
  };

  const closeBatchIssue = () => {
    setBatchIssueItemIds([]);
  };

  const onCreateItem = async (input: Parameters<typeof handleCreateItem>[0]) => {
    if (await handleCreateItem(input)) {
      closeAction();
    }
  };

  const onUpdateItem = async (input: Parameters<typeof handleUpdateItem>[0]) => {
    if (await handleUpdateItem(input)) {
      closeAction();
    }
  };

  const onReceiveStock = async (input: Parameters<typeof handleReceiveStock>[0]) => {
    if (await handleReceiveStock(input)) {
      closeAction();
    }
  };

  const onIssueMaterial = async (input: Parameters<typeof handleIssueMaterial>[0]) => {
    if (await handleIssueMaterial(input)) {
      closeAction();
    }
  };

  const onBatchIssueMaterial = async (input: Parameters<typeof handleBatchIssueMaterial>[0]) =>
    handleBatchIssueMaterial(input);

  const onRemoveItem = async (itemId: string) => {
    if (await handleRemoveItem(itemId)) {
      closeAction();
    }
  };

  const onBackupPlanSave = async (input: Parameters<typeof handleBackupPlanSave>[0]) => {
    await handleBackupPlanSave(input);
  };

  const onBackupNow = async () => {
    await handleBackupNow();
  };

  const onAddPersonnel = async (name: string) => {
    await handleAddPersonnel(name);
  };

  const onRemovePersonnel = async (personnelId: string) => {
    await handleRemovePersonnel(personnelId);
  };

  const onLanAccessSave = async (input: Parameters<typeof handleLanAccessSave>[0]) => {
    await handleLanAccessSave(input);
  };

  if (requiresBrowserAuth) {
    return (
      <main className="state-screen state-screen--auth">
        <div className="auth-card">
          <span className="sidebar__eyebrow">{dictionary.authTitle}</span>
          <h1>{dictionary.appName}</h1>
          <p>{dictionary.authDescription}</p>
          <label className="auth-card__field">
            <span>{dictionary.authAccessKeyLabel}</span>
            <input
              autoFocus
              type="password"
              value={accessKeyInput}
              onChange={(event) => setAccessKeyInput(event.target.value)}
            />
          </label>
          {loadError && <div className="feedback-banner feedback-banner--error">{loadError}</div>}
          <button onClick={connectBrowser} type="button">
            {dictionary.authConnect}
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
  const selectedBatchItems =
    snapshot?.items.filter((item) => batchIssueItemIds.includes(item.id)) ?? [];
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
          <span className="sidebar__eyebrow">{browserRuntime ? dictionary.inventoryLan : dictionary.inventoryDesktop}</span>
          <h1>{dictionary.appName}</h1>
          <p>{dictionary.tagline}</p>
        </div>
        {!issueRouteItemId && (
          <nav className="sidebar__nav">
            {navOrder.map((item) => (
              <button
                key={item}
                className={section === item ? "nav-item nav-item--active" : "nav-item"}
                onClick={() => { closeAction(); closeBatchIssue(); setSection(item); }}
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
                onClick={disconnectBrowser}
                type="button"
              >
                {dictionary.disconnect}
              </button>
            )}
            <button
              className="button-secondary button-inline"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              type="button"
            >
              {theme === "dark" ? dictionary.lightMode : dictionary.darkMode}
            </button>
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
          <>
            {batchIssueItemIds.length > 0 && (
              <BatchIssuePanel
                busy={busy}
                dictionary={dictionary}
                errorMessage={actionError}
                items={selectedBatchItems}
                language={language}
                personnel={snapshot.personnel}
                onClose={closeBatchIssue}
                onSubmit={onBatchIssueMaterial}
              />
            )}
            <ActionPanel
              action={action}
              activeItemId={activeItemId}
              preSelectedItemId={activeItemId || undefined}
              busy={busy}
              dictionary={dictionary}
              language={language}
              items={snapshot.items}
              personnel={snapshot.personnel}
              onClose={closeAction}
              onCreateItem={onCreateItem}
              onUpdateItem={onUpdateItem}
              onReceiveStock={onReceiveStock}
              onIssueMaterial={onIssueMaterial}
              onRemoveItem={onRemoveItem}
              onError={reportActionError}
            />
          </>
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
                <p>{dictionary.qrItemNotFound}</p>
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
                    onIssueMaterial={(itemId) => openAction("issueMaterial", itemId)}
                    onReceiveStock={(itemId) => openAction("receiveStock", itemId)}
                  />
                )}
                {section === "itemManagement" && (
                  <ItemManagementTable
                    busy={busy}
                    dictionary={dictionary}
                    language={language}
                    items={snapshot.items}
                    onBatchIssue={openBatchIssue}
                    onCreateItem={() => openAction("createItem")}
                    onError={reportActionError}
                    onModifyItem={(itemId) => openAction("modifyItem", itemId)}
                    onRemoveItem={(itemId) => openAction("removeItem", itemId)}
                  />
                )}
                {section === "alerts" && (
                  <AlertsPanel dictionary={dictionary} alerts={snapshot.alerts} language={language} />
                )}
                {section === "personnel" && (
                  <PersonnelPanel
                    busy={busy}
                    dictionary={dictionary}
                    personnel={snapshot.personnel}
                    onAddPersonnel={onAddPersonnel}
                    onRemovePersonnel={onRemovePersonnel}
                  />
                )}
                {section === "settings" && (
                  <>
                    <BackupPanel
                      busy={busy}
                      backupPlan={snapshot.backupPlan}
                      dictionary={dictionary}
                      language={language}
                      onBackupNow={onBackupNow}
                      onSave={onBackupPlanSave}
                    />
                    {desktopRuntime && lanAccess && (
                      <LanAccessPanel
                        busy={busy}
                        dictionary={dictionary}
                        lanAccess={lanAccess}
                        onRegenerateKey={handleLanAccessKeyRegenerate}
                        onSave={onLanAccessSave}
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
