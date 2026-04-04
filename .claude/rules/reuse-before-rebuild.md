Before building any new component, function, script, or pattern, search the codebase
for existing implementations that do something similar. Extend or refactor what exists
rather than creating a parallel version.

Specifically:

- **UI components**: Before writing new table markup, card layouts, form fields, status
  badges, empty states, or modal/dialog structures, grep for existing components that
  render similar UI. If the structure is close, refactor the existing component to accept
  the new use case (e.g., via props) instead of duplicating it.

- **Backend handlers**: `src/main/ipc.ts` has a `handleMutation()` helper for IPC
  handlers. Use it. If a new handler doesn't fit the helper, extend the helper rather
  than writing raw try-catch-decode-run boilerplate.

- **Scripts and pipelines**: Before writing a new script, check `scripts/` and
  `.github/workflows/` for existing scripts that share logic. Extract shared logic
  into a helper instead of copy-pasting.

- **CSS classes**: Before adding a new CSS class, check `app.css` and `tokens.css` for
  existing classes that do the same thing (e.g., `.alert-card` and `.personnel-card`
  are identical layouts). Reuse the existing class or extract a shared one.

If you find yourself writing something structurally similar to existing code, stop and
consolidate first. Three similar implementations is a pattern that should be a shared
abstraction.
