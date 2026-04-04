import type { PublicIssueContext, StockMutationInput } from "../../../shared/types";

type TransportMessageValues = Record<string, string | number>;

interface IssueGatewayErrorInit {
  message?: string;
  status?: number;
  errorTag?: string;
  messageId?: string;
  messageValues?: TransportMessageValues;
  debugMessage?: string;
}

export class IssueGatewayError extends Error {
  status?: number;
  errorTag?: string;
  messageId?: string;
  messageValues?: TransportMessageValues;
  debugMessage?: string;

  constructor(messageOrInit: string | IssueGatewayErrorInit, status?: number, errorTag?: string) {
    const init = typeof messageOrInit === "string"
      ? { message: messageOrInit, status, errorTag }
      : messageOrInit;

    super(init.debugMessage ?? init.message ?? init.messageId ?? "Issue gateway error");
    this.name = "IssueGatewayError";
    this.status = init.status;
    this.errorTag = init.errorTag;
    this.messageId = init.messageId;
    this.messageValues = init.messageValues;
    this.debugMessage = init.debugMessage;
  }
}

let pendingPublicIssueRequest: Promise<PublicIssueContext> | null = null;
let activePublicIssueKey: string | null = null;

function createPublicIssueKey(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `qi-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");

  const response = await fetch(path, { ...init, headers });

  if (!response.ok) {
    let message = `Request failed with status ${response.status}.`;
    let errorTag: string | undefined;
    let messageId: string | undefined;
    let messageValues: TransportMessageValues | undefined;
    let debugMessage: string | undefined;
    try {
      const body = (await response.json()) as {
        message?: string;
        _tag?: string;
        messageId?: string;
        messageValues?: TransportMessageValues;
        debugMessage?: string;
      };
      if (typeof body.message === "string" && body.message.trim()) {
        message = body.message;
      }
      if (typeof body.messageId === "string" && body.messageId.trim()) {
        messageId = body.messageId;
      }
      if (body.messageValues && typeof body.messageValues === "object") {
        messageValues = body.messageValues;
      }
      if (typeof body.debugMessage === "string" && body.debugMessage.trim()) {
        debugMessage = body.debugMessage;
      }
      if (typeof body._tag === "string") {
        errorTag = body._tag;
      }
    } catch {
      // Keep the default message.
    }
    throw new IssueGatewayError({
      message,
      status: response.status,
      errorTag,
      messageId,
      messageValues,
      debugMessage,
    });
  }

  return (await response.json()) as T;
}

export async function loadPublicIssueContext(itemId: string): Promise<PublicIssueContext> {
  return fetchJson<PublicIssueContext>(`/public/items/${encodeURIComponent(itemId)}/context`, {
    method: "GET",
  });
}

export async function issueMaterialPublic(input: StockMutationInput): Promise<PublicIssueContext> {
  if (pendingPublicIssueRequest) {
    return pendingPublicIssueRequest;
  }

  const issueKey = activePublicIssueKey ?? createPublicIssueKey();
  activePublicIssueKey = issueKey;
  const request = fetchJson<PublicIssueContext>(`/public/items/${encodeURIComponent(input.itemId)}/issue`, {
    method: "POST",
    headers: {
      "X-Idempotency-Key": issueKey,
    },
    body: JSON.stringify(input),
  }).finally(() => {
    if (pendingPublicIssueRequest === request) {
      pendingPublicIssueRequest = null;
    }
    if (activePublicIssueKey === issueKey) {
      activePublicIssueKey = null;
    }
  });

  pendingPublicIssueRequest = request;
  return request;
}
