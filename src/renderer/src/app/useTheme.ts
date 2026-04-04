import { useCallback, useEffect, useState } from "react";

type ThemeMode = "dark" | "light" | "auto";

const validThemes = new Set<string>(["dark", "light", "auto"]);

function readStoredTheme(): ThemeMode {
  try {
    const raw = localStorage.getItem("oi-theme");
    return raw && validThemes.has(raw) ? (raw as ThemeMode) : "auto";
  } catch {
    return "auto";
  }
}

export function useTheme() {
  const [theme, setTheme] = useState<ThemeMode>(readStoredTheme);
  const [systemDark, setSystemDark] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(prefers-color-scheme: dark)").matches : true,
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
    try {
      localStorage.setItem("oi-theme", theme);
    } catch {
      /* ignore — incognito or disabled localStorage */
    }
  }, [resolvedTheme, theme]);

  const cycleTheme = useCallback(
    () => setTheme((prev) => (prev === "auto" ? "light" : prev === "light" ? "dark" : "auto")),
    [],
  );

  return { theme, resolvedTheme, cycleTheme } as const;
}
