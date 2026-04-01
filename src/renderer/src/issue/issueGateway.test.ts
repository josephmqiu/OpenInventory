import { describe, it, expect, vi, beforeEach } from "vitest";
import { loadPublicIssueContext, issueMaterialPublic, IssueGatewayError } from "./issueGateway";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  };
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe("loadPublicIssueContext", () => {
  it("fetches from /public/items/{id}/context with GET", async () => {
    const ctx = { item: { id: "item-1" }, personnel: [], language: "en" };
    mockFetch.mockResolvedValue(jsonResponse(200, ctx));

    const result = await loadPublicIssueContext("item-1");
    expect(result).toEqual(ctx);
    expect(mockFetch).toHaveBeenCalledOnce();

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("/public/items/item-1/context");
    expect(init.method).toBe("GET");
  });

  it("does not send X-Inventory-Key header", async () => {
    mockFetch.mockResolvedValue(jsonResponse(200, { item: {}, personnel: [], language: "en" }));

    await loadPublicIssueContext("item-1");
    const headers = mockFetch.mock.calls[0][1].headers as Headers;
    expect(headers.has("x-inventory-key")).toBe(false);
  });

  it("throws IssueGatewayError with status on 404", async () => {
    mockFetch.mockResolvedValue(jsonResponse(404, { message: "Item not found" }));

    await expect(loadPublicIssueContext("nonexistent")).rejects.toThrow(IssueGatewayError);
    try {
      await loadPublicIssueContext("nonexistent");
    } catch (err) {
      expect((err as IssueGatewayError).status).toBe(404);
      expect((err as IssueGatewayError).message).toBe("Item not found");
    }
  });

  it("encodes special characters in item ID", async () => {
    mockFetch.mockResolvedValue(jsonResponse(200, { item: {}, personnel: [], language: "en" }));

    await loadPublicIssueContext("item/with spaces");
    const url = mockFetch.mock.calls[0][0];
    expect(url).toBe("/public/items/item%2Fwith%20spaces/context");
  });
});

describe("issueMaterialPublic", () => {
  it("POSTs to /public/items/{id}/issue with body", async () => {
    const input = { itemId: "item-1", quantity: 5, performedBy: "Chen Jun", reason: "QR issue" };
    const ctx = { item: { id: "item-1", currentQuantity: 95 }, personnel: [], language: "en" };
    mockFetch.mockResolvedValue(jsonResponse(200, ctx));

    const result = await issueMaterialPublic(input);
    expect(result).toEqual(ctx);

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("/public/items/item-1/issue");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual(input);
  });

  it("throws on 400 validation error", async () => {
    mockFetch.mockResolvedValue(jsonResponse(400, { message: "Insufficient stock" }));

    const input = { itemId: "item-1", quantity: 9999, performedBy: "Chen Jun", reason: "QR" };
    await expect(issueMaterialPublic(input)).rejects.toThrow("Insufficient stock");
  });
});
