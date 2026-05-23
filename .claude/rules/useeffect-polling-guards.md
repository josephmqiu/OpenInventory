This app polls the backend every 2-3 seconds via `useInventoryState`. The polling
layer uses `snapshotEquals()` to compare incoming data field-by-field. If nothing
changed, the previous snapshot reference is kept — React skips re-render entirely.

This means props like `items`, `personnel`, and `backupPlan` are **stable references**
when data hasn't changed. Component-level polling guards are no longer needed for
most cases.

**When guards are still useful:**

- **useRef "read latest" pattern** (see ActionPanel.tsx): When an effect should only
  fire on user-initiated changes (e.g., `action`, `activeItemId`) but needs to read
  the latest items/personnel, store polled data in refs and read `ref.current`.

- **ID-set comparison** (see BatchIssuePanel.tsx, UnifiedInventoryTable.tsx): When you
  need to distinguish "item added/removed" from "item data changed" (e.g., quantity
  update should not reset the batch form). Derive a key from IDs only and compare.

**snapshotEquals fields:** language, currency, items (id + all display fields +
updatedAt), personnel (id + name), alerts (id + status + quantity), backupPlan (all
fields). If you add a new field to AppSnapshot, add it to `snapshotEquals` in
`useInventoryState.ts` or components won't see changes to that field. (`currency` is
compared so an app-currency switch re-formats prices live — see the optimistic update
in `useInventoryState.ts`.)
