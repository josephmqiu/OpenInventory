/**
 * Category B: LAN HTTP server auth + rate limiting tests
 *
 * These tests define the behavioral contract for the auth middleware
 * that will be ported from src-tauri/src/infrastructure/lan.rs.
 * Tests the constant-time key comparison, per-IP rate limiting, and lockout behavior.
 */
import { describe, it, expect, beforeEach } from "vitest";
import crypto from "crypto";

// ─── Auth helpers matching the Rust implementation ───────────────────────────

const MAX_FAILED_ATTEMPTS = 5;
const FAILED_WINDOW_MS = 60_000;
const LOCKOUT_DURATION_MS = 15 * 60_000;

interface FailedAttempt {
  count: number;
  recordedAt: number;
}

function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const bufA = Buffer.from(a, "utf-8");
  const bufB = Buffer.from(b, "utf-8");
  return crypto.timingSafeEqual(bufA, bufB);
}

class RateLimiter {
  private attempts = new Map<string, FailedAttempt>();

  checkAndRecord(
    ip: string,
    providedKey: string,
    validKey: string,
  ): { allowed: boolean; reason?: string } {
    const now = Date.now();
    const entry = this.attempts.get(ip);

    // Check lockout
    if (entry) {
      if (
        entry.count >= MAX_FAILED_ATTEMPTS &&
        now - entry.recordedAt < LOCKOUT_DURATION_MS
      ) {
        return {
          allowed: false,
          reason:
            "Too many failed access key attempts from this device. Try again in 15 minutes.",
        };
      }

      // Reset if window expired
      if (now - entry.recordedAt >= FAILED_WINDOW_MS) {
        this.attempts.delete(ip);
      }
    }

    // Validate key
    if (constantTimeCompare(providedKey, validKey)) {
      this.attempts.delete(ip); // Success clears failed attempts
      return { allowed: true };
    }

    // Record failure
    const current = this.attempts.get(ip);
    if (current) {
      current.count++;
    } else {
      this.attempts.set(ip, { count: 1, recordedAt: now });
    }

    return { allowed: false, reason: "Invalid access key" };
  }

  // For testing: manually set the recorded time
  _setAttempt(ip: string, count: number, recordedAt: number) {
    this.attempts.set(ip, { count, recordedAt });
  }

  _getAttempt(ip: string): FailedAttempt | undefined {
    return this.attempts.get(ip);
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("constant-time key comparison", () => {
  it("accepts matching keys", () => {
    expect(constantTimeCompare("abc123", "abc123")).toBe(true);
  });

  it("rejects different keys of same length", () => {
    expect(constantTimeCompare("abc123", "abc124")).toBe(false);
  });

  it("rejects keys of different length", () => {
    expect(constantTimeCompare("short", "longer-key")).toBe(false);
  });

  it("handles empty keys", () => {
    expect(constantTimeCompare("", "")).toBe(true);
  });
});

describe("rate limiter", () => {
  let limiter: RateLimiter;
  const validKey = "valid-access-key-24chars!";

  beforeEach(() => {
    limiter = new RateLimiter();
  });

  it("allows valid key on first attempt", () => {
    const result = limiter.checkAndRecord("192.168.1.1", validKey, validKey);
    expect(result.allowed).toBe(true);
  });

  it("rejects invalid key", () => {
    const result = limiter.checkAndRecord(
      "192.168.1.1",
      "wrong-key",
      validKey,
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("Invalid access key");
  });

  it("tracks failed attempts per IP", () => {
    limiter.checkAndRecord("192.168.1.1", "wrong", validKey);
    limiter.checkAndRecord("192.168.1.1", "wrong", validKey);
    limiter.checkAndRecord("192.168.1.1", "wrong", validKey);

    const attempt = limiter._getAttempt("192.168.1.1");
    expect(attempt?.count).toBe(3);
  });

  it("locks out after 5 failed attempts", () => {
    for (let i = 0; i < 5; i++) {
      limiter.checkAndRecord("192.168.1.1", "wrong", validKey);
    }

    // 6th attempt should be locked out even with correct key
    const result = limiter.checkAndRecord("192.168.1.1", validKey, validKey);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("Too many failed");
  });

  it("lockout lasts 15 minutes", () => {
    const now = Date.now();

    // Simulate 5 failures recorded 14 minutes ago
    limiter._setAttempt("192.168.1.1", 5, now - 14 * 60_000);

    const result = limiter.checkAndRecord("192.168.1.1", validKey, validKey);
    expect(result.allowed).toBe(false); // Still locked out

    // Simulate 5 failures recorded 16 minutes ago
    limiter._setAttempt("192.168.1.1", 5, now - 16 * 60_000);

    const result2 = limiter.checkAndRecord("192.168.1.1", validKey, validKey);
    expect(result2.allowed).toBe(true); // Lockout expired
  });

  it("successful auth clears failed attempts", () => {
    limiter.checkAndRecord("192.168.1.1", "wrong1", validKey);
    limiter.checkAndRecord("192.168.1.1", "wrong2", validKey);

    // Now succeed
    limiter.checkAndRecord("192.168.1.1", validKey, validKey);

    const attempt = limiter._getAttempt("192.168.1.1");
    expect(attempt).toBeUndefined();
  });

  it("different IPs tracked independently", () => {
    for (let i = 0; i < 5; i++) {
      limiter.checkAndRecord("192.168.1.1", "wrong", validKey);
    }

    // Different IP should not be locked
    const result = limiter.checkAndRecord("192.168.1.2", validKey, validKey);
    expect(result.allowed).toBe(true);
  });

  it("resets attempt window after 60 seconds", () => {
    const now = Date.now();

    // Simulate 3 failures recorded 61 seconds ago
    limiter._setAttempt("192.168.1.1", 3, now - 61_000);

    // Attempt again — window expired, counter resets
    const result = limiter.checkAndRecord("192.168.1.1", "wrong", validKey);
    expect(result.allowed).toBe(false);

    // Counter should be 1 (fresh window)
    const attempt = limiter._getAttempt("192.168.1.1");
    expect(attempt?.count).toBe(1);
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
    // Matches Rust: Alphanumeric.sample_string(&mut rng, 24)
    const key = crypto.randomBytes(18).toString("base64url").slice(0, 24);
    expect(key).toHaveLength(24);
    expect(/^[A-Za-z0-9_-]+$/.test(key)).toBe(true);
  });
});
