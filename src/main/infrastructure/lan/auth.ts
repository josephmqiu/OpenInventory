import crypto from "crypto";
import type { IncomingMessage } from "http";

const MAX_FAILED_ATTEMPTS = 5;
const FAILED_WINDOW_MS = 60_000;
const LOCKOUT_DURATION_MS = 15 * 60_000;

interface FailedAttempt {
  count: number;
  recordedAt: number;
}

export class RateLimiter {
  private attempts = new Map<string, FailedAttempt>();

  /**
   * Check auth and record attempt.
   * Returns null on success, or an error message string on failure.
   */
  authorize(ip: string, providedKey: string, validKey: string): string | null {
    const now = Date.now();
    const entry = this.attempts.get(ip);

    // Check lockout
    if (entry) {
      if (
        entry.count >= MAX_FAILED_ATTEMPTS &&
        now - entry.recordedAt < LOCKOUT_DURATION_MS
      ) {
        return "Too many failed access key attempts from this device. Try again in 15 minutes.";
      }

      // Reset if window expired
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

    return "Invalid access key";
  }
}

function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const bufA = Buffer.from(a, "utf-8");
  const bufB = Buffer.from(b, "utf-8");
  return crypto.timingSafeEqual(bufA, bufB);
}

export function getClientIp(req: IncomingMessage): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") {
    return forwarded.split(",")[0].trim();
  }
  return req.socket.remoteAddress ?? "unknown";
}

export function generateAccessKey(): string {
  return crypto.randomBytes(18).toString("base64url").slice(0, 24);
}
