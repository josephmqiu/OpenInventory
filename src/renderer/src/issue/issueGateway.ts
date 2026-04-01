import type { PublicIssueContext, StockMutationInput } from "../../../shared/types";

export class IssueGatewayError extends Error {
  status?: number;
  errorTag?: string;

  constructor(message: string, status?: number, errorTag?: string) {
    super(message);
    this.name = "IssueGatewayError";
    this.status = status;
    this.errorTag = errorTag;
  }
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");

  const response = await fetch(path, { ...init, headers });

  if (!response.ok) {
    let message = `Request failed with status ${response.status}.`;
    let errorTag: string | undefined;
    try {
      const body = (await response.json()) as { message?: string; _tag?: string };
      if (typeof body.message === "string" && body.message.trim()) {
        message = body.message;
      }
      if (typeof body._tag === "string") {
        errorTag = body._tag;
      }
    } catch {
      // Keep the default message.
    }
    throw new IssueGatewayError(message, response.status, errorTag);
  }

  return (await response.json()) as T;
}

export async function loadPublicIssueContext(itemId: string): Promise<PublicIssueContext> {
  return fetchJson<PublicIssueContext>(`/public/items/${encodeURIComponent(itemId)}/context`, {
    method: "GET",
  });
}

export async function issueMaterialPublic(input: StockMutationInput): Promise<PublicIssueContext> {
  return fetchJson<PublicIssueContext>(`/public/items/${encodeURIComponent(input.itemId)}/issue`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}
