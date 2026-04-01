import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const gatewayMocks = vi.hoisted(() => ({
  loadPublicIssueContext: vi.fn(),
  issueMaterialPublic: vi.fn(),
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
import type { PublicIssueContext } from "../../../shared/types";

const mockContext: PublicIssueContext = {
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
  personnel: [{ id: "p1", name: "Chen Jun" }],
  language: "en",
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe("useQuickIssueState", () => {
  it("loads context on mount and sets language from response", async () => {
    gatewayMocks.loadPublicIssueContext.mockResolvedValue(mockContext);

    const { result } = renderHook(() => useQuickIssueState("item-1"));

    expect(result.current.issueContext).toBeNull();

    await waitFor(() => expect(result.current.issueContext).not.toBeNull());

    expect(result.current.issueContext?.item?.name).toBe("Test Item");
    expect(result.current.language).toBe("en");
    expect(result.current.loadError).toBeNull();
    expect(gatewayMocks.loadPublicIssueContext).toHaveBeenCalledWith("item-1");
  });

  it("sets loadError on 404", async () => {
    gatewayMocks.loadPublicIssueContext.mockRejectedValue(
      new gatewayMocks.IssueGatewayError("Not found", 404),
    );

    const { result } = renderHook(() => useQuickIssueState("nonexistent"));

    await waitFor(() => expect(result.current.loadError).not.toBeNull());

    expect(result.current.issueContext).toBeNull();
  });

  it("sets loadError on network failure", async () => {
    gatewayMocks.loadPublicIssueContext.mockRejectedValue(new Error("Failed to fetch"));

    const { result } = renderHook(() => useQuickIssueState("item-1"));

    await waitFor(() => expect(result.current.loadError).not.toBeNull());
  });

  it("handleQuickIssueMaterial updates context on success", async () => {
    gatewayMocks.loadPublicIssueContext.mockResolvedValue(mockContext);

    const updatedContext: PublicIssueContext = {
      ...mockContext,
      item: { ...mockContext.item!, currentQuantity: 95 },
    };
    gatewayMocks.issueMaterialPublic.mockResolvedValue(updatedContext);

    const { result } = renderHook(() => useQuickIssueState("item-1"));
    await waitFor(() => expect(result.current.issueContext).not.toBeNull());

    await act(async () => {
      await result.current.handleQuickIssueMaterial({
        itemId: "item-1",
        quantity: 5,
        performedBy: "Chen Jun",
        reason: "QR issue",
      });
    });

    expect(result.current.issueContext?.item?.currentQuantity).toBe(95);
    expect(result.current.notice?.tone).toBe("success");
  });

  it("handleQuickIssueMaterial sets error notice on failure", async () => {
    gatewayMocks.loadPublicIssueContext.mockResolvedValue(mockContext);
    gatewayMocks.issueMaterialPublic.mockRejectedValue(new Error("Insufficient stock"));

    const { result } = renderHook(() => useQuickIssueState("item-1"));
    await waitFor(() => expect(result.current.issueContext).not.toBeNull());

    // Call the handler and catch the expected re-throw
    let threw = false;
    await act(async () => {
      try {
        await result.current.handleQuickIssueMaterial({
          itemId: "item-1",
          quantity: 999,
          performedBy: "Chen Jun",
          reason: "QR issue",
        });
      } catch {
        threw = true;
      }
    });

    expect(threw).toBe(true);
    expect(result.current.notice?.tone).toBe("error");
    expect(result.current.busy).toBe(false);
  });

  it("language is set from server response, not user-changeable", async () => {
    const zhContext = { ...mockContext, language: "zh-CN" as const };
    gatewayMocks.loadPublicIssueContext.mockResolvedValue(zhContext);

    const { result } = renderHook(() => useQuickIssueState("item-1"));
    await waitFor(() => expect(result.current.issueContext).not.toBeNull());

    expect(result.current.language).toBe("zh-CN");
  });
});
