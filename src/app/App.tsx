import { useEffect, useState } from "react";
import { buildDashboardMetrics } from "../domain/inventory";
import type {
  ActionKind,
  AppSnapshot,
  CreateInventoryItemInput,
  CreateRefillOrderInput,
  InventoryAlert,
  Language,
  StockMutationInput,
} from "../domain/models";
import { dictionaries } from "./i18n";
import { AlertsPanel } from "../ui/components/AlertsPanel";
import { BackupPanel } from "../ui/components/BackupPanel";
import { InventoryTable } from "../ui/components/InventoryTable";
import { MetricCard } from "../ui/components/MetricCard";
import { PersonnelPanel } from "../ui/components/PersonnelPanel";
import { RefillOrdersTable } from "../ui/components/RefillOrdersTable";
import { ActionPanel } from "../ui/components/ActionPanel";
import {
  addPersonnel,
  createInventoryItem,
  createRefillOrder,
  issueMaterial,
  loadAppSnapshot,
  receiveStock,
  removeInventoryItem,
  removePersonnel,
} from "../services/inventoryGateway";
import type { Dictionary } from "./i18n";

type Section = "dashboard" | "inventory" | "refillOrders" | "alerts" | "personnel" | "settings";
type NoticeTone = "success" | "warning";

const navOrder: Section[] = ["dashboard", "inventory", "refillOrders", "alerts", "personnel", "settings"];

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

export function App() {
  const [language, setLanguage] = useState<Language>("en");
  const [section, setSection] = useState<Section>("dashboard");
  const [snapshot, setSnapshot] = useState<AppSnapshot | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ message: string; tone: NoticeTone } | null>(null);
  const [busy, setBusy] = useState(false);
  const [action, setAction] = useState<ActionKind | null>(null);
  const [activeItemId, setActiveItemId] = useState<string>("");
  const dictionary = dictionaries[language];

  useEffect(() => {
    let cancelled = false;

    loadAppSnapshot()
      .then((result) => {
        if (!cancelled) {
          setSnapshot(result);
        }
      })
      .catch((loadErrorValue: unknown) => {
        if (!cancelled) {
          setLoadError(toErrorMessage(loadErrorValue));
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

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
      setActionError(toErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const handleCreateItem = async (input: CreateInventoryItemInput) =>
    runMutation(() => createInventoryItem(input), dictionary.successCreateItem);

  const handleReceiveStock = async (input: StockMutationInput) =>
    runMutation(() => receiveStock(input), dictionary.successReceiveStock);

  const handleIssueMaterial = async (input: StockMutationInput) =>
    runMutation(() => issueMaterial(input), dictionary.successIssueMaterial);

  const handleCreateRefillOrder = async (input: CreateRefillOrderInput) =>
    runMutation(() => createRefillOrder(input), dictionary.successCreateRefillOrder);

  const handleRemoveItem = async (itemId: string) =>
    runMutation(() => removeInventoryItem(itemId), dictionary.successRemoveItem);

  const handleAddPersonnel = async (name: string) =>
    runMutation(() => addPersonnel({ name }), dictionary.successAddPersonnel);

  const handleRemovePersonnel = async (personnelId: string) =>
    runMutation(() => removePersonnel(personnelId), dictionary.successRemovePersonnel);

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

  const metrics = buildDashboardMetrics(snapshot.items, snapshot.alerts, snapshot.refillOrders);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar__brand">
          <span className="sidebar__eyebrow">Inventory Desktop</span>
          <h1>{dictionary.appName}</h1>
          <p>{dictionary.tagline}</p>
        </div>
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
      </aside>
      <main className="content">
        <header className="topbar">
          <div>
            <h2>{dictionary[section]}</h2>
            <p>{dictionary.currentInventoryLevels}</p>
          </div>
          <label className="language-switch">
            <span>{dictionary.language}</span>
            <select value={language} onChange={(event) => setLanguage(event.target.value as Language)}>
              <option value="en">English</option>
              <option value="zh-CN">{"\u7b80\u4f53\u4e2d\u6587"}</option>
            </select>
          </label>
        </header>

        {notice && <div className={`feedback-banner feedback-banner--${notice.tone}`}>{notice.message}</div>}
        {actionError && <div className="feedback-banner feedback-banner--error">{actionError}</div>}

        <ActionPanel
          action={action}
          activeItemId={activeItemId}
          busy={busy}
          dictionary={dictionary}
          items={snapshot.items}
          personnel={snapshot.personnel}
          onClose={closeAction}
          onCreateItem={handleCreateItem}
          onReceiveStock={handleReceiveStock}
          onIssueMaterial={handleIssueMaterial}
          onCreateRefillOrder={handleCreateRefillOrder}
          onRemoveItem={handleRemoveItem}
          onError={(message) => {
            setNotice(null);
            setActionError(message);
          }}
        />

        {section === "dashboard" && (
          <section className="metrics-grid">
            <MetricCard label={dictionary.totalItems} value={metrics.totalItems} />
            <MetricCard label={dictionary.totalUnits} value={metrics.totalUnits} />
            <MetricCard label={dictionary.lowStock} value={metrics.lowStockCount} tone="warning" />
            <MetricCard label={dictionary.outOfStock} value={metrics.outOfStockCount} tone="danger" />
            <MetricCard label={dictionary.openAlerts} value={metrics.openAlertCount} tone="warning" />
            <MetricCard label={dictionary.pendingRefillOrders} value={metrics.pendingRefillOrderCount} />
          </section>
        )}

        <section className="content-stack">
          {(section === "dashboard" || section === "inventory") && (
            <InventoryTable
              busy={busy}
              dictionary={dictionary}
              items={snapshot.items}
              onCreateItem={() => openAction("createItem")}
              onIssueMaterial={() => openAction("issueMaterial")}
              onReceiveStock={() => openAction("receiveStock")}
              onRemoveItem={(itemId) => openAction("removeItem", itemId)}
            />
          )}
          {(section === "dashboard" || section === "refillOrders") && (
            <RefillOrdersTable
              busy={busy}
              dictionary={dictionary}
              onCreateRefillOrder={() => openAction("createRefillOrder")}
              orders={snapshot.refillOrders}
            />
          )}
          {(section === "dashboard" || section === "alerts") && (
            <AlertsPanel dictionary={dictionary} alerts={snapshot.alerts} />
          )}
          {(section === "dashboard" || section === "personnel") && (
            <PersonnelPanel
              busy={busy}
              dictionary={dictionary}
              personnel={snapshot.personnel}
              onAddPersonnel={handleAddPersonnel}
              onRemovePersonnel={handleRemovePersonnel}
            />
          )}
          {(section === "dashboard" || section === "settings") && (
            <BackupPanel dictionary={dictionary} backupPlan={snapshot.backupPlan} />
          )}
        </section>
      </main>
    </div>
  );
}
