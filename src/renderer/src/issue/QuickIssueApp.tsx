import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { QuickIssueMobile } from "./QuickIssueMobile";
import { useQuickIssueState } from "./useQuickIssueState";
import { useTheme } from "../app/useTheme";
import { Moon, Sun, SunMoon } from "lucide-react";

function readItemIdFromUrl(): string | null {
  const match = /^\/issue\/([^/]+)\/?$/i.exec(window.location.pathname);
  return match ? decodeURIComponent(match[1]) : null;
}

export function QuickIssueApp() {
  const itemId = readItemIdFromUrl();
  const { t } = useTranslation(["common", "inventory", "quickIssue"]);
  const { theme, cycleTheme } = useTheme();

  if (!itemId) {
    return (
      <>
        <TopBar theme={theme} cycleTheme={cycleTheme} />
        <div className="qi-state-screen">
          <h2>{t("appName")}</h2>
          <p>{t("noItemSpecified", { ns: "quickIssue" })}</p>
        </div>
      </>
    );
  }

  return <QuickIssueAppInner itemId={itemId} theme={theme} cycleTheme={cycleTheme} />;
}

function QuickIssueAppInner({ itemId, theme, cycleTheme }: { itemId: string; theme: ThemeMode; cycleTheme: () => void }) {
  const { t } = useTranslation(["common", "inventory", "quickIssue"]);
  const {
    language,
    issueContext,
    loadError,
    notice,
    busy,
    handleQuickIssueMaterial,
    clearNotice,
    retry,
  } = useQuickIssueState(itemId);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  if (loadError) {
    return (
      <>
        <TopBar theme={theme} cycleTheme={cycleTheme} />
        <div className="qi-state-screen">
          <h2>{t("appName")}</h2>
          <p>{loadError}</p>
          <button type="button" onClick={retry}>{t("retry")}</button>
        </div>
      </>
    );
  }

  if (!issueContext) {
    return (
      <>
        <TopBar theme={theme} cycleTheme={cycleTheme} />
        <div className="qi-state-screen">
          <h2>{t("appName")}</h2>
          <p>{t("loadingWorkspace")}</p>
        </div>
      </>
    );
  }

  if (!issueContext.item) {
    return (
      <>
        <TopBar theme={theme} cycleTheme={cycleTheme} />
        <div className="qi-state-screen">
          <h2>{t("appName")}</h2>
          <p>{t("qrItemNotFound", { ns: "quickIssue" })}</p>
        </div>
      </>
    );
  }

  return (
    <>
      <TopBar theme={theme} cycleTheme={cycleTheme} />
      <QuickIssueMobile
        busy={busy}
        item={issueContext.item}
        language={language}
        notice={notice}
        personnel={issueContext.personnel}
        clearNotice={clearNotice}
        onIssue={handleQuickIssueMaterial}
        onRefresh={retry}
      />
      <div className="qi-bottom-spacer" />
    </>
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
