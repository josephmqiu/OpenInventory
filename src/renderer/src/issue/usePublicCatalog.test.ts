import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import i18n from "i18next";

const gatewayMocks = vi.hoisted(() => ({
  loadPublicCatalog: vi.fn(),
  // usePublicCatalog only imports loadPublicCatalog, but the module also exports
  // these — provide stubs so the mock is a faithful module replacement.
  loadPublicItemContext: vi.fn(),
  IssueGatewayError: class extends Error {
    status?: number;
    constructor(message: string, status?: number) {
      super(message);
      this.status = status;
    }
  },
}));

vi.mock("./issueGateway", () => gatewayMocks);

const store: Record<string, string> = {};
Object.defineProperty(globalThis, "localStorage", {
  value: {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, val: string) => { store[key] = val; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { for (const k of Object.keys(store)) delete store[k]; },
  },
  writable: true,
});

import { usePublicCatalog } from "./usePublicCatalog";
import type { PublicItemCatalog } from "../../../shared/types";

const mockCatalog: PublicItemCatalog = {
  items: [
    {
      id: "item-1",
      sku: "SKU-001",
      name: "Test Item",
      category: "chemicals",
      location: "B-12",
      unit: "pieces",
      supplier: "ACME",
      currentQuantity: 100,
      reorderQuantity: 10,
      unitPriceMinor: null,
      status: "in_stock",
      lastUpdated: "2026-03-31",
    },
  ],
  language: "en",
  currency: "CNY",
};

beforeEach(async () => {
  vi.clearAllMocks();
  localStorage.clear();
  await i18n.changeLanguage("en");
});

describe("usePublicCatalog", () => {
  it("loads the catalog on mount and sets items/language/currency", async () => {
    gatewayMocks.loadPublicCatalog.mockResolvedValue(mockCatalog);

    const { result } = renderHook(() => usePublicCatalog());
    expect(result.current.items).toBeNull();

    await waitFor(() => expect(result.current.items).not.toBeNull());

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items?.[0].name).toBe("Test Item");
    expect(result.current.language).toBe("en");
    expect(result.current.currency).toBe("CNY");
    expect(result.current.loadError).toBeNull();
    expect(gatewayMocks.loadPublicCatalog).toHaveBeenCalledOnce();
  });

  it("sets loadError on failure and leaves items null", async () => {
    gatewayMocks.loadPublicCatalog.mockRejectedValue(new Error("Failed to fetch"));

    const { result } = renderHook(() => usePublicCatalog());

    await waitFor(() => expect(result.current.loadError).not.toBeNull());
    expect(result.current.items).toBeNull();
  });

  it("adopts the catalog's language (server-controlled)", async () => {
    gatewayMocks.loadPublicCatalog.mockResolvedValue({ ...mockCatalog, language: "zh-CN" });

    const { result } = renderHook(() => usePublicCatalog());
    await waitFor(() => expect(result.current.items).not.toBeNull());

    expect(result.current.language).toBe("zh-CN");
  });

  it("re-fetches when retry is called", async () => {
    gatewayMocks.loadPublicCatalog.mockResolvedValue(mockCatalog);
    const { result } = renderHook(() => usePublicCatalog());
    await waitFor(() => expect(result.current.items).not.toBeNull());

    result.current.retry();
    await waitFor(() => expect(gatewayMocks.loadPublicCatalog).toHaveBeenCalledTimes(2));
  });
});
