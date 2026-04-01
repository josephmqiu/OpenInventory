import { useEffect, useState } from "react";
import { QuickIssueMobile } from "./QuickIssueMobile";
import { useQuickIssueState } from "./useQuickIssueState";
import { Moon, Sun, SunMoon } from "lucide-react";

function readItemIdFromUrl(): string | null {
  const match = /^\/issue\/([^/]+)\/?$/i.exec(window.location.pathname);
  return match ? decodeURIComponent(match[1]) : null;
}

type ThemeMode = "dark" | "light" | "auto";

export function QuickIssueApp() {
  const itemId = readItemIdFromUrl();

  const [theme, setTheme] = useState<ThemeMode>(() => {
    try { return (localStorage.getItem("oi-theme") as ThemeMode) || "auto"; }
    catch { return "auto"; }
  });
  const [systemDark, setSystemDark] = useState(() =>
    window.matchMedia("(prefers-color-scheme: dark)").matches,
  );

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
    try { localStorage.setItem("oi-theme", theme); } catch { /* ignore */ }
  }, [resolvedTheme, theme]);

  const cycleTheme = () => setTheme(theme === "auto" ? "light" : theme === "light" ? "dark" : "auto");

  if (!itemId) {
    return (
      <>
        <TopBar theme={theme} cycleTheme={cycleTheme} />
        <div className="qi-state-screen">
          <h2>OpenInventory</h2>
          <p>No item specified. Scan a QR code to issue material.</p>
        </div>
      </>
    );
  }

  return <QuickIssueAppInner itemId={itemId} theme={theme} cycleTheme={cycleTheme} />;
}

function QuickIssueAppInner({ itemId, theme, cycleTheme }: { itemId: string; theme: ThemeMode; cycleTheme: () => void }) {
  const {
    language,
    dictionary,
    issueContext,
    loadError,
    notice,
    busy,
    handleQuickIssueMaterial,
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
          <h2>{dictionary.appName}</h2>
          <p>{loadError}</p>
          <button type="button" onClick={retry}>{dictionary.retry ?? "Retry"}</button>
        </div>
      </>
    );
  }

  if (!issueContext) {
    return (
      <>
        <TopBar theme={theme} cycleTheme={cycleTheme} />
        <div className="qi-state-screen">
          <h2>{dictionary.appName}</h2>
          <p>{dictionary.loadingWorkspace}</p>
        </div>
      </>
    );
  }

  return (
    <>
      <TopBar theme={theme} cycleTheme={cycleTheme} />
      {notice && (
        <div className={`qi-feedback qi-feedback--${notice.tone}`} style={{ margin: "0 12px 8px" }}>
          <span>{notice.message}</span>
        </div>
      )}
      <QuickIssueMobile
        busy={busy}
        dictionary={dictionary}
        item={issueContext.item}
        language={language}
        personnel={issueContext.personnel}
        onIssue={handleQuickIssueMaterial}
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
  return (
    <div className="qi-topbar">
      <span className="qi-topbar__brand">OpenInventory</span>
      <div className="qi-topbar__controls">
        <button
          type="button"
          onClick={cycleTheme}
          title={theme === "auto" ? "Auto" : theme === "light" ? "Light" : "Dark"}
        >
          {theme === "auto" && <SunMoon size={12} strokeWidth={1.5} />}
          {theme === "light" && <Sun size={12} strokeWidth={1.5} />}
          {theme === "dark" && <Moon size={12} strokeWidth={1.5} />}
        </button>
      </div>
    </div>
  );
}
