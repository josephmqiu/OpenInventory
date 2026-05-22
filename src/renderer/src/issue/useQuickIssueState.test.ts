import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import i18n from "i18next";

const gatewayMocks = vi.hoisted(() => ({
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

// Provide a minimal localStorage stub
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

import { useQuickIssueState } from "./useQuickIssueState";
import type { PublicItemContext } from "../../../shared/types";

const mockContext: PublicItemContext = {
  item: {
    id: "item-1",
    sku: "SKU-001",
    qrCodeDataUrl: "",
    name: "Test Item",
    category: "chemicals",
    location: "B-12",
    unit: "pieces",
    supplier: "",
    currentQuantity: 100,
    reorderQuantity: 10,
    status: "in_stock",
    lastUpdated: "2026-03-31",
  },
  language: "en",
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

beforeEach(async () => {
  await i18n.changeLanguage("en");
});

describe("useQuickIssueState (read-only lookup)", () => {
  it("loads context on mount and sets language from response", async () => {
    gatewayMocks.loadPublicItemContext.mockResolvedValue(mockContext);

    const { result } = renderHook(() => useQuickIssueState("item-1"));

    expect(result.current.itemContext).toBeNull();

    await waitFor(() => expect(result.current.itemContext).not.toBeNull());

    expect(result.current.itemContext?.item?.name).toBe("Test Item");
    expect(result.current.language).toBe("en");
    expect(result.current.loadError).toBeNull();
    expect(gatewayMocks.loadPublicItemContext).toHaveBeenCalledWith("item-1");
  });

  it("sets loadError on 404", async () => {
    gatewayMocks.loadPublicItemContext.mockRejectedValue(
      new gatewayMocks.IssueGatewayError("Not found", 404),
    );

    const { result } = renderHook(() => useQuickIssueState("nonexistent"));

    await waitFor(() => expect(result.current.loadError).not.toBeNull());

    expect(result.current.itemContext).toBeNull();
    expect(result.current.loadError).toBe(
      "This QR code points to an item that is not available in the current inventory database.",
    );
  });

  it("sets loadError on network failure", async () => {
    gatewayMocks.loadPublicItemContext.mockRejectedValue(new Error("Failed to fetch"));

    const { result } = renderHook(() => useQuickIssueState("item-1"));

    await waitFor(() => expect(result.current.loadError).not.toBeNull());
  });

  it("language is set from server response, not user-changeable", async () => {
    const zhContext = { ...mockContext, language: "zh-CN" as const };
    gatewayMocks.loadPublicItemContext.mockResolvedValue(zhContext);

    const { result } = renderHook(() => useQuickIssueState("item-1"));
    await waitFor(() => expect(result.current.itemContext).not.toBeNull());

    expect(result.current.language).toBe("zh-CN");
  });
});
