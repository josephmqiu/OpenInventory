import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { QuickIssueMobile } from "./QuickIssueMobile";
import { QuickItemList } from "./QuickItemList";
import { usePublicCatalog } from "./usePublicCatalog";
import { useQuickIssueState } from "./useQuickIssueState";
import { useTheme } from "../app/useTheme";
import type { InventoryStatusFilter } from "../domain/itemFilter";
import { Moon, Sun, SunMoon } from "lucide-react";

function readItemIdFromUrl(): string | null {
  const match = window.location.pathname.match(/^\/issue\/([^/]+)\/?$/i);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    // Malformed percent-encoding in the URL — treat as no item rather than
    // throwing a URIError during render.
    return null;
  }
}

export function QuickIssueApp() {
  const { theme, cycleTheme } = useTheme();
  const [initialItemId] = useState(readItemIdFromUrl);

  // Lifted, persistent UI state (Design review): search + filter survive
  // list↔detail navigation so a worker doesn't lose their place on every tap.
  const [view, setView] = useState<"list" | "detail">(initialItemId ? "detail" : "list");
  const [activeItemId, setActiveItemId] = useState<string>(initialItemId ?? "");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<InventoryStatusFilter>("all");

  const { items, language, currency, loadError, retry } = usePublicCatalog();

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const goToItem = (itemId: string) => {
    setActiveItemId(itemId);
    setView("detail");
  };
  const goToList = () => setView("list");

  return (
    <>
      <TopBar theme={theme} cycleTheme={cycleTheme} />
      <QuickIssueBody
        view={view}
        activeItemId={activeItemId}
        search={search}
        filter={filter}
        items={items}
        language={language}
        currency={currency}
        loadError={loadError}
        onRetry={retry}
        onSearchChange={setSearch}
        onFilterChange={setFilter}
        onSelectItem={goToItem}
        onViewAll={goToList}
      />
      <div className="qi-bottom-spacer" />
    </>
  );
}

interface QuickIssueBodyProps {
  view: "list" | "detail";
  activeItemId: string;
  search: string;
  filter: InventoryStatusFilter;
  items: ReturnType<typeof usePublicCatalog>["items"];
  language: ReturnType<typeof usePublicCatalog>["language"];
  currency: ReturnType<typeof usePublicCatalog>["currency"];
  loadError: string | null;
  onRetry: () => void;
  onSearchChange: (search: string) => void;
  onFilterChange: (filter: InventoryStatusFilter) => void;
  onSelectItem: (itemId: string) => void;
  onViewAll: () => void;
}

function QuickIssueBody({
  view,
  activeItemId,
  search,
  filter,
  items,
  language,
  currency,
  loadError,
  onRetry,
  onSearchChange,
  onFilterChange,
  onSelectItem,
  onViewAll,
}: QuickIssueBodyProps) {
  const { t } = useTranslation(["common", "inventory", "quickIssue"]);

  // Catalog hard-failed. For a scanned item we still try the single-item
  // endpoint as a fallback (QuickIssueApp owns this precedence, not the hook).
  if (loadError) {
    if (view === "detail" && activeItemId) {
      return <ScannedItemFallback itemId={activeItemId} onViewAll={onViewAll} />;
    }
    return (
      <StateScreen
        message={t("unableToLoadInventory", { ns: "quickIssue" })}
        action={{ label: t("retry", { ns: "common" }), onClick: onRetry }}
      />
    );
  }

  // Catalog still loading.
  if (items === null) {
    return <StateScreen message={t("loadingInventory", { ns: "quickIssue" })} />;
  }

  if (view === "detail") {
    const item = items.find((i) => i.id === activeItemId);
    if (!item) {
      // Catalog loaded but the scanned id isn't in it (deleted/stale): do NOT
      // fire a second request — just offer the list.
      return (
        <StateScreen
          message={t("qrItemNotFound", { ns: "quickIssue" })}
          action={{ label: t("viewAllItems", { ns: "quickIssue" }), onClick: onViewAll }}
        />
      );
    }
    return (
      <QuickIssueMobile
        item={item}
        language={language}
        currency={currency}
        onRefresh={onRetry}
        onViewAll={onViewAll}
      />
    );
  }

  return (
    <QuickItemList
      items={items}
      language={language}
      search={search}
      filter={filter}
      onSearchChange={onSearchChange}
      onFilterChange={onFilterChange}
      onSelectItem={onSelectItem}
      onRefresh={onRetry}
    />
  );
}

/**
 * Single-item fallback, mounted only when the catalog hard-fails but a scanned
 * item id is present. Isolating it here keeps `useQuickIssueState` out of the
 * happy path (one fetch, not two) while still degrading gracefully.
 */
function ScannedItemFallback({ itemId, onViewAll }: { itemId: string; onViewAll: () => void }) {
  const { t } = useTranslation(["common", "inventory", "quickIssue"]);
  const { language, itemContext, loadError, retry } = useQuickIssueState(itemId);

  if (loadError) {
    return (
      <StateScreen message={loadError} action={{ label: t("retry", { ns: "common" }), onClick: retry }} />
    );
  }
  if (!itemContext) {
    return <StateScreen message={t("loadingWorkspace", { ns: "common" })} />;
  }
  if (!itemContext.item) {
    return (
      <StateScreen
        message={t("qrItemNotFound", { ns: "quickIssue" })}
        action={{ label: t("viewAllItems", { ns: "quickIssue" }), onClick: onViewAll }}
      />
    );
  }
  return (
    <QuickIssueMobile
      item={itemContext.item}
      language={language}
      currency={itemContext.currency}
      onRefresh={retry}
      onViewAll={onViewAll}
    />
  );
}

function StateScreen({
  message,
  action,
}: {
  message: string;
  action?: { label: string; onClick: () => void };
}) {
  const { t } = useTranslation("common");
  return (
    <div className="qi-state-screen">
      <h2>{t("appName")}</h2>
      <p>{message}</p>
      {action && (
        <button type="button" onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  );
}

function TopBar({
  theme,
  cycleTheme,
}: {
  theme: ThemeMode;
  cycleTheme: () => void;
}) {
  const { t } = useTranslation("common");
  return (
    <div className="qi-topbar">
      <span className="qi-topbar__brand">OpenInventory</span>
      <div className="qi-topbar__controls">
        <button
          type="button"
          onClick={cycleTheme}
          title={theme === "auto" ? t("autoMode") : theme === "light" ? t("lightMode") : t("darkMode")}
        >
          {theme === "auto" && <SunMoon size={12} strokeWidth={1.5} />}
          {theme === "light" && <Sun size={12} strokeWidth={1.5} />}
          {theme === "dark" && <Moon size={12} strokeWidth={1.5} />}
        </button>
      </div>
    </div>
  );
}
