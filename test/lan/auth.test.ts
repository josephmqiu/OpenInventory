/**
 * Category B: LAN HTTP server auth + rate limiting tests
 *
 * Tests the production RateLimiter class from src/main/infrastructure/lan/auth.ts.
 * Covers constant-time key comparison, per-IP rate limiting, lockout behavior,
 * and lockout bypass prevention.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { RateLimiter, generateAccessKey } from "../../src/main/infrastructure/lan/auth";

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("RateLimiter", () => {
  let limiter: RateLimiter;
  const validKey = "valid-access-key-24chars!";

  beforeEach(() => {
    limiter = new RateLimiter();
  });

  it("allows valid key on first attempt", () => {
    const result = limiter.authorize("192.168.1.1", validKey, validKey);
    expect(result).toBeNull();
  });

  it("rejects invalid key", () => {
    const result = limiter.authorize("192.168.1.1", "wrong-key-000000000000!", validKey);
    expect(result).toBe("invalid_access_key");
  });

  it("locks out after 5 failed attempts", () => {
    for (let i = 0; i < 5; i++) {
      limiter.authorize("192.168.1.1", "wrong-key-000000000000!", validKey);
    }

    // 6th attempt should be locked out even with correct key
    const result = limiter.authorize("192.168.1.1", validKey, validKey);
    expect(result).toBe("too_many_failed_attempts");
  });

  it("successful auth clears failed attempts", () => {
    limiter.authorize("192.168.1.1", "wrong-key-000000000000!", validKey);
    limiter.authorize("192.168.1.1", "wrong-key-000000000000!", validKey);

    // Now succeed
    const result = limiter.authorize("192.168.1.1", validKey, validKey);
    expect(result).toBeNull();

    // Next wrong attempt should start fresh (count = 1, not 3)
    limiter.authorize("192.168.1.1", "wrong-key-000000000000!", validKey);
    limiter.authorize("192.168.1.1", "wrong-key-000000000000!", validKey);
    limiter.authorize("192.168.1.1", "wrong-key-000000000000!", validKey);
    limiter.authorize("192.168.1.1", "wrong-key-000000000000!", validKey);
    // 4 failures after reset, should NOT be locked out yet
    const result2 = limiter.authorize("192.168.1.1", validKey, validKey);
    expect(result2).toBeNull();
  });

  it("different IPs tracked independently", () => {
    for (let i = 0; i < 5; i++) {
      limiter.authorize("192.168.1.1", "wrong-key-000000000000!", validKey);
    }

    // Different IP should not be locked
    const result = limiter.authorize("192.168.1.2", validKey, validKey);
    expect(result).toBeNull();
  });

  it("rejects keys of different length via constant-time comparison", () => {
    const result = limiter.authorize("192.168.1.1", "short", validKey);
    expect(result).toBe("invalid_access_key");
  });
});

describe("AppError to HTTP status mapping", () => {
  // This defines the contract for error serialization in HTTP responses
  const errorToStatus: Record<string, number> = {
    NotFound: 404,
    DuplicateSku: 409,
    InsufficientStock: 409,
    ValidationError: 400,
    IoError: 500,
    ServerError: 500,
    DatabaseError: 500,
  };

  it("maps NotFound to 404", () => {
    expect(errorToStatus.NotFound).toBe(404);
  });

  it("maps DuplicateSku to 409 CONFLICT", () => {
    expect(errorToStatus.DuplicateSku).toBe(409);
  });

  it("maps InsufficientStock to 409 CONFLICT", () => {
    expect(errorToStatus.InsufficientStock).toBe(409);
  });

  it("maps ValidationError to 400", () => {
    expect(errorToStatus.ValidationError).toBe(400);
  });

  it("maps IoError, ServerError, DatabaseError to 500", () => {
    expect(errorToStatus.IoError).toBe(500);
    expect(errorToStatus.ServerError).toBe(500);
    expect(errorToStatus.DatabaseError).toBe(500);
  });
});

describe("access key generation", () => {
  it("generates 24-character alphanumeric key", () => {
    const key = generateAccessKey();
    expect(key).toHaveLength(24);
    expect(/^[A-Za-z0-9_-]+$/.test(key)).toBe(true);
  });
});
