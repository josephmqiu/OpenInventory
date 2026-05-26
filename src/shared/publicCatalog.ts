import type { InventoryItem, PublicCatalogItem } from "./types";

/**
 * Projects an InventoryItem into the shape served to anonymous LAN clients.
 *
 * Listing fields explicitly (rather than omitting one) is deliberate: a NEW
 * InventoryItem field becomes a compile error here instead of silently leaking
 * to unauthenticated LAN clients. Drops `qrCodeDataUrl` (heavy base64 the mobile
 * UI never renders). Used by the production LAN router and the dev preview server
 * so both expose the identical public shape.
 */
export function toPublicCatalogItem(item: InventoryItem): PublicCatalogItem {
  return {
    id: item.id,
    sku: item.sku,
    name: item.name,
    category: item.category,
    location: item.location,
    unit: item.unit,
    supplier: item.supplier,
    currentQuantity: item.currentQuantity,
    reorderQuantity: item.reorderQuantity,
    unitPriceMinor: item.unitPriceMinor,
    status: item.status,
    lastUpdated: item.lastUpdated,
  };
}
