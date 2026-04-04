This app uses i18next with the ICU plugin. All interpolation uses ICU single-brace
format. Never use i18next double-brace `{{var}}` syntax anywhere.

Correct:   `{count} selected`  or  `{count, plural, one {# item} other {# items}}`
Wrong:     `{{count}} selected`

There are exactly 6 namespaces: `common`, `inventory`, `backup`, `audit`,
`quickIssue`, `errors`. Do not invent new namespaces.

Before using any translation key:

1. Open `src/renderer/src/app/i18nResources.ts` and verify the key exists.
2. Note which namespace object it lives under in `baseI18nResources` — that is the
   correct namespace to use with `getFixedT()` or `useTranslation()`.
3. Backend error messages live ONLY in the `errors` namespace. Never look up error
   keys in `common` or `inventory`. The `translateErrorMessage()` function in
   `i18n.ts` always uses `getFixedT(language, "errors")`.
4. The property path must match the actual nesting. For example,
   `i18nResources[lang].common.genericActionError` is the correct path — not
   `i18nResources[lang].errors.genericActionError`.

When adding new translation keys, add them to both `en` and `zh-CN` in the same
namespace, maintaining key parity. Use the existing localization helpers
(`localizeCategory`, `localizeUnit`, `localizeStockStatus`, etc.) for enum values
rather than manual translation lookups.
