import crypto from "crypto";
import type { IncomingMessage } from "http";

const MAX_FAILED_ATTEMPTS = 5;
const FAILED_WINDOW_MS = 60_000;
const LOCKOUT_DURATION_MS = 15 * 60_000;

interface FailedAttempt {
  count: number;
  recordedAt: number;
}

export type AuthorizationFailure = "invalid_access_key" | "too_many_failed_attempts";

export class RateLimiter {
  private attempts = new Map<string, FailedAttempt>();

  /** Evict stale entries older than the lockout duration. */
  private evictStale(): void {
    const now = Date.now();
    for (const [ip, entry] of this.attempts) {
      if (now - entry.recordedAt >= LOCKOUT_DURATION_MS) {
        this.attempts.delete(ip);
      }
    }
  }

  /**
   * Check auth and record attempt.
   * Returns null on success, or a stable failure code on failure.
   */
  authorize(ip: string, providedKey: string, validKey: string): AuthorizationFailure | null {
    // Evict stale entries on every call so lockouts expire correctly
    this.evictStale();
    const now = Date.now();
    const entry = this.attempts.get(ip);

    if (entry) {
      const isLockedOut =
        entry.count >= MAX_FAILED_ATTEMPTS &&
        now - entry.recordedAt < LOCKOUT_DURATION_MS;

      if (isLockedOut) {
        return "too_many_failed_attempts";
      }

      // Only reset window if not locked out
      if (now - entry.recordedAt >= FAILED_WINDOW_MS) {
        this.attempts.delete(ip);
      }
    }

    // Validate key using constant-time comparison
    if (constantTimeCompare(providedKey, validKey)) {
      this.attempts.delete(ip);
      return null; // success
    }

    // Record failure
    const current = this.attempts.get(ip);
    if (current) {
      current.count++;
    } else {
      this.attempts.set(ip, { count: 1, recordedAt: now });
    }

    return "invalid_access_key";
  }
}

function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const bufA = Buffer.from(a, "utf-8");
  const bufB = Buffer.from(b, "utf-8");
  return crypto.timingSafeEqual(bufA, bufB);
}

export function getClientIp(req: IncomingMessage): string {
  // Use the direct socket address — this is a LAN server with no trusted
  // proxy, so x-forwarded-for is spoofable and must not be trusted.
  return req.socket.remoteAddress ?? "unknown";
}

export function generateAccessKey(): string {
  return crypto.randomBytes(18).toString("base64url").slice(0, 24);
}
