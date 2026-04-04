import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ActionKind } from "../domain/models";
import { BackupPanel } from "../ui/components/BackupPanel";
import { DashboardView } from "../ui/components/DashboardView";
import { UnifiedInventoryTable } from "../ui/components/UnifiedInventoryTable";
import { PersonnelPanel } from "../ui/components/PersonnelPanel";
import { ActionPanel } from "../ui/components/ActionPanel";
import { BatchIssuePanel } from "../ui/components/BatchIssuePanel";
import { LanAccessPanel } from "../ui/components/LanAccessPanel";
import { AuditPanel } from "../ui/components/AuditPanel";
import { RestoreDialog } from "../ui/components/RestoreDialog";
import { useInventoryState } from "./useInventoryState";
import { useAutoUpdate } from "./useAutoUpdate";
import { useTheme } from "./useTheme";
import { UpdateBanner } from "../ui/components/UpdateBanner";
import {
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Moon,
  PanelLeft,
  Settings,
  Sun,
  SunMoon,
  Warehouse,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

type Section = "dashboard" | "inventory" | "activity" | "settings";
type SettingsTab = "personnel" | "backup" | "lan";

const navOrder: Section[] = ["dashboard", "inventory", "activity", "settings"];

const sectionIcons: Record<Section, LucideIcon> = {
  dashboard: LayoutDashboard,
  inventory: Warehouse,
  activity: ClipboardList,
  settings: Settings,
};

function sectionTitle(section: Section, t: ReturnType<typeof useTranslation>["t"]): string {
  if (section === "activity") return t("activity");
  return t(section);
}

function sectionSubtitle(section: Section, t: ReturnType<typeof useTranslation>["t"]): string {
  switch (section) {
    case "dashboard":
      return t("dashboardHint");
    case "inventory":
      return t("inventoryHint");
    case "activity":
      return t("auditHint", { ns: "audit" });
    case "settings":
      return t("settingsHint");
    default:
      return "";
  }
}

export function App() {
  const { t } = useTranslation(["common", "inventory", "backup", "audit"]);
  const [section, setSection] = useState<Section>("dashboard");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [action, setAction] = useState<ActionKind | null>(null);
  const [activeItemId, setActiveItemId] = useState<string>("");
  const [batchIssueItemIds, setBatchIssueItemIds] = useState<string[]>([]);
  const [inventoryFilter, setInventoryFilter] = useState<"all" | "low_stock" | "out_of_stock">("all");
  const [inventorySearch, setInventorySearch] = useState("");
  const [inventoryDetailItemId, setInventoryDetailItemId] = useState("");
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("personnel");
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
  } = useInventoryState();
  const { updateStatus, downloadUpdate, installUpdate, dismissUpdate } = useAutoUpdate();
  const { theme, resolvedTheme, cycleTheme } = useTheme();

  const browserRuntime = runtime !== "desktop";
  const themeLabel = theme === "auto" ? t("autoMode") : theme === "light" ? t("lightMode") : t("darkMode");

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

  const navigateToInventory = (filter: "all" | "low_stock" | "out_of_stock") => {
    setInventoryFilter(filter);
    setInventoryDetailItemId("");
    closeAction();
    closeBatchIssue();
    setSection("inventory");
  };

  const navigateToItem = (itemId: string) => {
    setInventoryFilter("all");
    setInventoryDetailItemId(itemId);
    closeAction();
    closeBatchIssue();
    setSection("inventory");
  };

  const navigateToPersonnel = () => {
    setSettingsTab("personnel");
    closeAction();
    closeBatchIssue();
    setSection("settings");
  };

  const withClose = <A extends unknown[]>(handler: (...args: A) => Promise<boolean>) =>
    async (...args: A) => {
      if (await handler(...args)) closeAction();
    };

  const onCreateItem = withClose(handleCreateItem);
  const onUpdateItem = withClose(handleUpdateItem);
  const onReceiveStock = withClose(handleReceiveStock);
  const onIssueMaterial = withClose(handleIssueMaterial);
  const onRemoveItem = withClose(handleRemoveItem);

  if (requiresBrowserAuth) {
    return (
      <main className="state-screen state-screen--auth">
        <div className="auth-card">
          <span className="sidebar__eyebrow">{t("authTitle")}</span>
          <h1>{t("appName")}</h1>
          <p>{t("authDescription")}</p>
          <label className="auth-card__field">
            <span>{t("authAccessKeyLabel")}</span>
            <input
              autoFocus
              type="password"
              value={accessKeyInput}
              onChange={(event) => setAccessKeyInput(event.target.value)}
            />
          </label>
          {loadError && <div className="feedback-banner feedback-banner--error">{loadError}</div>}
          <button onClick={connectBrowser} type="button">
            {t("authConnect")}
          </button>
        </div>
      </main>
    );
  }

  if (loadError) {
    return (
      <main className="state-screen">
        <h1>{t("appName")}</h1>
        <p>{loadError}</p>
      </main>
    );
  }

  if (!snapshot) {
    return (
      <main className="state-screen">
        <h1>{t("appName")}</h1>
        <p>{t("loadingWorkspace")}</p>
      </main>
    );
  }

  const selectedBatchItems =
    snapshot?.items.filter((item) => batchIssueItemIds.includes(item.id)) ?? [];
  const headerTitle = sectionTitle(section, t);
  const headerSubtitle = sectionSubtitle(section, t);
  return (
    <div className={`app-shell${sidebarCollapsed ? " app-shell--collapsed" : ""}`}>
      <aside className={`sidebar${sidebarCollapsed ? " sidebar--collapsed" : ""}`}>
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
                title={sidebarCollapsed ? sectionTitle(item, t) : undefined}
              >
                <Icon size={16} strokeWidth={1.5} />
                {!sidebarCollapsed && <span>{sectionTitle(item, t)}</span>}
              </button>
            );
          })}
        </nav>
        <div className="sidebar__footer">
          <button
            className="button-secondary button-icon-only"
            onClick={() => setSidebarCollapsed((prev) => !prev)}
            type="button"
            title={sidebarCollapsed ? t("expandSidebar") : t("collapseSidebar")}
            aria-label={sidebarCollapsed ? t("expandSidebar") : t("collapseSidebar")}
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
                title={t("disconnect")}
                aria-label={t("disconnect")}
              >
                <LogOut size={16} strokeWidth={1.5} />
              </button>
            )}
            <button
              data-testid="theme-toggle"
              className="button-secondary button-icon-only"
              onClick={cycleTheme}
              type="button"
              title={themeLabel}
              aria-label={themeLabel}
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
              title={language === "en" ? t("switchToChinese") : t("switchToEnglish")}
              aria-label={language === "en" ? t("switchToChinese") : t("switchToEnglish")}
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
            onDownload={downloadUpdate}
            onInstall={installUpdate}
            onDismiss={dismissUpdate}
          />
        )}

        {notice && (
          <div data-testid="feedback-banner" className={`feedback-banner feedback-banner--${notice.tone}`}>
            <span>{notice.message}</span>
            <button data-testid="feedback-dismiss" className="button-inline button-secondary feedback-banner__dismiss" onClick={clearFeedback} type="button" aria-label={t("dismiss")}>&times;</button>
          </div>
        )}
        {actionError && (
          <div data-testid="feedback-banner" className="feedback-banner feedback-banner--error">
            <span>{actionError}</span>
            <button data-testid="feedback-dismiss" className="button-inline button-secondary feedback-banner__dismiss" onClick={clearFeedback} type="button" aria-label={t("dismiss")}>&times;</button>
          </div>
        )}
        {pollError && (
          <div className="feedback-banner feedback-banner--warning" role="alert">
            {t("pollError")}
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

            {section === "inventory" && (
              <>
                <ActionPanel
                  action={action}
                  activeItemId={activeItemId}
                  busy={busy}
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
                  onNavigateToPersonnel={navigateToPersonnel}
                />
                {batchIssueItemIds.length > 0 && (
                  <BatchIssuePanel
                    busy={busy}
                    errorMessage={actionError}
                    items={selectedBatchItems}
                    language={language}
                    personnel={snapshot.personnel}
                    onClose={closeBatchIssue}
                    onSubmit={handleBatchIssueMaterial}
                  />
                )}
                <UnifiedInventoryTable
                  busy={busy}
                  language={language}
                  items={snapshot.items}
                  filter={inventoryFilter}
                  onFilterChange={setInventoryFilter}
                  search={inventorySearch}
                  onSearchChange={setInventorySearch}
                  detailItemId={inventoryDetailItemId}
                  onDetailItemIdChange={setInventoryDetailItemId}
                  onAction={openAction}
                  onBatchIssue={openBatchIssue}
                  onError={reportActionError}
                  onNotice={reportNotice}
                />
              </>
            )}

            {section === "dashboard" && (
              <DashboardView
                items={snapshot.items}
                alerts={snapshot.alerts}
                language={language}
                onNavigateToInventory={navigateToInventory}
                onNavigateToItem={navigateToItem}
              />
            )}

            {section === "activity" && (
              <AuditPanel
                language={language}
                personnel={snapshot.personnel}
              />
            )}

            {section === "settings" && (
              <>
                <div className="filter-tabs settings-tabs" role="tablist">
                  <button
                    className={`filter-tab${settingsTab === "personnel" ? " filter-tab--active" : ""}`}
                    onClick={() => setSettingsTab("personnel")}
                    type="button"
                    role="tab"
                    aria-selected={settingsTab === "personnel"}
                  >
                    {t("personnelSettings")}
                  </button>
                  <button
                    className={`filter-tab${settingsTab === "backup" ? " filter-tab--active" : ""}`}
                    onClick={() => setSettingsTab("backup")}
                    type="button"
                    role="tab"
                    aria-selected={settingsTab === "backup"}
                  >
                    {t("backupSettings")}
                  </button>
                  {lanAccess && (
                    <button
                      className={`filter-tab${settingsTab === "lan" ? " filter-tab--active" : ""}`}
                      onClick={() => setSettingsTab("lan")}
                      type="button"
                      role="tab"
                      aria-selected={settingsTab === "lan"}
                    >
                      {t("lanSettings")}
                    </button>
                  )}
                </div>
                {settingsTab === "personnel" && (
                  <PersonnelPanel
                    busy={busy}
                    personnel={snapshot.personnel}
                    onAddPersonnel={handleAddPersonnel}
                    onRemovePersonnel={handleRemovePersonnel}
                  />
                )}
                {settingsTab === "backup" && (
                  <BackupPanel
                    busy={busy}
                    backupPlan={snapshot.backupPlan}
                    language={language}
                    onBackupNow={handleBackupNow}
                    onSave={handleBackupPlanSave}
                    onBrowse={handleSelectBackupDirectory}
                    onRestore={() => void startRestoreFromBackup()}
                  />
                )}
                {settingsTab === "lan" && lanAccess && (
                  <LanAccessPanel
                    busy={busy}
                    lanAccess={lanAccess}
                    onRegenerateKey={handleLanAccessKeyRegenerate}
                    onSave={handleLanAccessSave}
                  />
                )}
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
