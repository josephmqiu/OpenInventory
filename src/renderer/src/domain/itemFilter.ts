import type { StockStatus } from "../../../shared/types";

export type InventoryStatusFilter = "all" | "low_stock" | "out_of_stock";

/**
 * Minimum item shape needed to filter — satisfied by both `InventoryItem`
 * (desktop table) and `PublicCatalogItem` (mobile LAN lookup).
 */
export interface FilterableInventoryItem {
  name: string;
  sku: string;
  location: string;
  status: StockStatus;
}

/**
 * Shared text + status filter for the inventory list. Used by both the desktop
 * `UnifiedInventoryTable` and the mobile `QuickItemList` so search semantics
 * (match name / SKU / location, plus the All/Low/Out status filter) stay in
 * lockstep. Extracted from the formerly-inline predicate in
 * `UnifiedInventoryTable` (reuse-before-rebuild).
 */
export function filterInventoryItems<T extends FilterableInventoryItem>(
  items: readonly T[],
  options: { search: string; filter: InventoryStatusFilter },
): T[] {
  const { search, filter } = options;
  const searchLower = search.toLowerCase();
  return items.filter((item) => {
    if (filter === "low_stock" && item.status !== "low_stock") return false;
    if (filter === "out_of_stock" && item.status !== "out_of_stock") return false;
    if (
      search &&
      !item.name.toLowerCase().includes(searchLower) &&
      !item.sku.toLowerCase().includes(searchLower) &&
      !item.location.toLowerCase().includes(searchLower)
    ) {
      return false;
    }
    return true;
  });
}
