import { useTranslation } from "react-i18next";

/**
 * Convenience hook wrapping useTranslation with a `tt()` helper
 * that accepts an inline fallback string (ICU defaultValue pattern).
 *
 * Use this for components that rely on the current i18n locale.
 * Audit components that need language-controlled translation via
 * getFixedT(language, ...) should NOT use this hook.
 */
export function useTT(namespaces: string | string[] = ["common", "inventory"]) {
  const { t } = useTranslation(namespaces);

  const tt = (key: string, fallback: string, options?: Record<string, unknown>) =>
    t(key, { defaultValue: fallback, ...options });

  return tt;
}
