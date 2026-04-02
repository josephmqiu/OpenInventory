import { useEffect, useState } from "react";
import { buildDashboardMetrics } from "../domain/inventory";
import type { ActionKind } from "../domain/models";
import { dictionaries } from "./i18n";
import { AlertsPanel } from "../ui/components/AlertsPanel";
import { BackupPanel } from "../ui/components/BackupPanel";
import { InventoryTable } from "../ui/components/InventoryTable";
import { ItemManagementTable } from "../ui/components/ItemManagementTable";
import { MetricCard } from "../ui/components/MetricCard";
import { PersonnelPanel } from "../ui/components/PersonnelPanel";
import { ActionPanel } from "../ui/components/ActionPanel";
import { BatchIssuePanel } from "../ui/components/BatchIssuePanel";
import { LanAccessPanel } from "../ui/components/LanAccessPanel";
import { AuditPanel } from "../ui/components/AuditPanel";
import { RestoreDialog } from "../ui/components/RestoreDialog";
import { WelcomeScreen } from "../ui/components/WelcomeScreen";
import type { Dictionary } from "./i18n";
import { useInventoryState } from "./useInventoryState";
import { useAutoUpdate } from "./useAutoUpdate";
import { UpdateBanner } from "../ui/components/UpdateBanner";
import {
  Bell,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Moon,
  Package,
  PanelLeft,
  Settings,
  Sun,
  SunMoon,
  Users,
  Warehouse,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

type Section = "dashboard" | "inventory" | "itemManagement" | "alerts" | "audit" | "personnel" | "settings";

const navOrder: Section[] = ["dashboard", "inventory", "itemManagement", "alerts", "audit", "personnel", "settings"];

const sectionIcons: Record<Section, LucideIcon> = {
  dashboard: LayoutDashboard,
  inventory: Warehouse,
  itemManagement: Package,
  alerts: Bell,
  audit: ClipboardList,
  personnel: Users,
  settings: Settings,
};

function sectionSubtitle(section: Section, dictionary: Dictionary): string {
  switch (section) {
    case "inventory":
      return dictionary.inventoryOperationsHint;
    case "itemManagement":
      return dictionary.manageItemsHint;
    case "alerts":
      return dictionary.noAlertsHint;
    case "audit":
      return dictionary.auditHint;
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [action, setAction] = useState<ActionKind | null>(null);
  const [activeItemId, setActiveItemId] = useState<string>("");
  const [batchIssueItemIds, setBatchIssueItemIds] = useState<string[]>([]);
  const {
    runtime,
    language,
    snapshot,
    lanAccess,
    loadError,
    actionError,
    notice,
    busy,
    pendingRestoreComparison,
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
    startRestoreFromBackup,
    confirmRestoreFromBackup,
    cancelRestoreFromBackup,
    handleAddPersonnel,
    handleRemovePersonnel,
    handleLanguageChange,
    handleLanAccessSave,
    handleLanAccessKeyRegenerate,
  } = useInventoryState();
  const { updateStatus, downloadUpdate, installUpdate, dismissUpdate } = useAutoUpdate();
  type ThemeMode = "dark" | "light" | "auto";
  const [theme, setTheme] = useState<ThemeMode>(() => {
    if (typeof localStorage !== "undefined") {
      return (localStorage.getItem("oi-theme") as ThemeMode) || "auto";
    }
    return "auto";
  });
  const [systemDark, setSystemDark] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(prefers-color-scheme: dark)").matches : true,
  );
  const [welcomeDismissed, setWelcomeDismissed] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  const resolvedTheme = theme === "auto" ? (systemDark ? "dark" : "light") : theme;

  useEffect(() => {
    if (resolvedTheme === "light") {
      document.documentElement.setAttribute("data-theme", "light");
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
    localStorage.setItem("oi-theme", theme);
  }, [resolvedTheme, theme]);

  const cycleTheme = () => setTheme(theme === "auto" ? "light" : theme === "light" ? "dark" : "auto");

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

  if (!snapshot) {
    return (
      <main className="state-screen">
        <h1>{dictionary.appName}</h1>
        <p>{dictionary.loadingWorkspace}</p>
      </main>
    );
  }

  const metrics = snapshot ? buildDashboardMetrics(snapshot.items, snapshot.alerts) : null;
  const selectedBatchItems =
    snapshot?.items.filter((item) => batchIssueItemIds.includes(item.id)) ?? [];
  const headerTitle = dictionary[section];
  const headerSubtitle = sectionSubtitle(section, dictionary);
  const isFirstLaunch = snapshot.items.length === 0
    && snapshot.personnel.length === 0
    && !snapshot.backupPlan.targetPath
    && !welcomeDismissed;

  return (
    <div className={`app-shell${sidebarCollapsed ? " app-shell--collapsed" : ""}`}>
      {isFirstLaunch && (
        <WelcomeScreen
          appVersion={process.env.npm_package_version ?? "0.0.0"}
          onStartFresh={() => setWelcomeDismissed(true)}
          onRestore={() => {
            setWelcomeDismissed(true);
            void startRestoreFromBackup();
          }}
        />
      )}
      <aside className={`sidebar${sidebarCollapsed ? " sidebar--collapsed" : ""}`}>
        {!sidebarCollapsed && (
          <div className="sidebar__brand">
            <span className="sidebar__eyebrow">{browserRuntime ? dictionary.inventoryLan : dictionary.inventoryDesktop}</span>
            <h1>{dictionary.appName}</h1>
            <p>{dictionary.tagline}</p>
          </div>
        )}
        <nav className="sidebar__nav">
          {navOrder.map((item) => {
            const Icon = sectionIcons[item];
            return (
              <button
                key={item}
                data-testid={`nav-${item}`}
                className={section === item ? "nav-item nav-item--active" : "nav-item"}
                onClick={() => { closeAction(); closeBatchIssue(); setSection(item); }}
                type="button"
                title={sidebarCollapsed ? dictionary[item] : undefined}
              >
                <Icon size={16} strokeWidth={1.5} />
                {!sidebarCollapsed && <span>{dictionary[item]}</span>}
              </button>
            );
          })}
        </nav>
        <div className="sidebar__footer">
          <button
            className="button-secondary button-icon-only"
            onClick={() => setSidebarCollapsed((prev) => !prev)}
            type="button"
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <PanelLeft size={16} strokeWidth={1.5} />
          </button>
        </div>
      </aside>
      <main className="content">
        <header className="topbar">
          <div>
            <h2>{headerTitle}</h2>
            <p>{headerSubtitle}</p>
          </div>
          <div className="topbar__controls">
            {browserRuntime && (
              <button
                className="button-secondary button-icon-only"
                onClick={disconnectBrowser}
                type="button"
                title={dictionary.disconnect}
                aria-label={dictionary.disconnect}
              >
                <LogOut size={16} strokeWidth={1.5} />
              </button>
            )}
            <button
              data-testid="theme-toggle"
              className="button-secondary button-icon-only"
              onClick={cycleTheme}
              type="button"
              title={theme === "auto" ? dictionary.autoMode : theme === "light" ? dictionary.lightMode : dictionary.darkMode}
              aria-label={theme === "auto" ? dictionary.autoMode : theme === "light" ? dictionary.lightMode : dictionary.darkMode}
            >
              {theme === "auto" && <SunMoon size={16} strokeWidth={1.5} />}
              {theme === "light" && <Sun size={16} strokeWidth={1.5} />}
              {theme === "dark" && <Moon size={16} strokeWidth={1.5} />}
            </button>
            <button
              data-testid="lang-toggle"
              className="button-secondary button-icon-only"
              onClick={() => handleLanguageChange(language === "en" ? "zh-CN" : "en")}
              type="button"
              title={language === "en" ? "切换到中文" : "Switch to English"}
              aria-label={language === "en" ? "切换到中文" : "Switch to English"}
            >
              <span style={{ fontSize: 12, fontWeight: 600, fontFamily: "var(--font-sans)", letterSpacing: "0.02em" }}>
                {language === "en" ? "中" : "EN"}
              </span>
            </button>
          </div>
        </header>

        {runtime === "desktop" && (
          <UpdateBanner
            status={updateStatus}
            dictionary={dictionary}
            onDownload={downloadUpdate}
            onInstall={installUpdate}
            onDismiss={dismissUpdate}
          />
        )}

        {notice && (
          <div data-testid="feedback-banner" className={`feedback-banner feedback-banner--${notice.tone}`}>
            <span>{notice.message}</span>
            <button data-testid="feedback-dismiss" className="button-inline button-secondary feedback-banner__dismiss" onClick={clearFeedback} type="button" aria-label={dictionary.dismiss}>&times;</button>
          </div>
        )}
        {actionError && (
          <div data-testid="feedback-banner" className="feedback-banner feedback-banner--error">
            <span>{actionError}</span>
            <button data-testid="feedback-dismiss" className="button-inline button-secondary feedback-banner__dismiss" onClick={clearFeedback} type="button" aria-label={dictionary.dismiss}>&times;</button>
          </div>
        )}

        {snapshot && (
          <>
            {pendingRestoreComparison && (
              <RestoreDialog
                comparison={pendingRestoreComparison}
                language={language}
                onCancel={cancelRestoreFromBackup}
                onConfirm={() => void confirmRestoreFromBackup()}
              />
            )}
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
              {section === "audit" && (
                <AuditPanel
                  dictionary={dictionary}
                  language={language}
                  personnel={snapshot.personnel}
                />
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
                    onBrowse={handleSelectBackupDirectory}
                    onRestore={() => void startRestoreFromBackup()}
                  />
                  {lanAccess && (
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
        )}
      </main>
    </div>
  );
}
