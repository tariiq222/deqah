import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database';

const SENSITIVE_KEYS = /token|secret|password|key|authorization|ciphertext/i;
const MAX_BODY_SIZE = 4096;

/**
 * Fire-and-forget audit logger for outbound Zoho API mutations.
 *
 * Every POST/PUT/DELETE to Zoho is recorded with:
 *   - redacted request body (sensitive keys → '***')
 *   - truncated response body (first 4 KB)
 *   - wall-clock duration
 *
 * Uses fire-and-forget (catch-and-log) so an audit-log DB failure never
 * blocks the actual business flow.
 */
@Injectable()
export class ZohoAuditService {
  private readonly logger = new Logger(ZohoAuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Record a mutating Zoho API call. Call this AFTER the fetch completes
   * (success or failure). Non-blocking: returns immediately; persistence
   * happens asynchronously.
   */
  record(entry: {
    organizationId: string;
    method: 'POST' | 'PUT' | 'DELETE';
    path: string;
    statusCode: number;
    requestBody?: unknown;
    responseBody?: unknown;
    durationMs: number;
    error?: string;
  }): void {
    // Run outside the caller's async flow — never block.
    void this.persist(entry).catch((err) => {
      this.logger.warn(
        `Failed to persist audit log for ${entry.method} ${entry.path}: ${(err as Error).message}`,
      );
    });
  }

  private async persist(entry: {
    organizationId: string;
    method: string;
    path: string;
    statusCode: number;
    requestBody?: unknown;
    responseBody?: unknown;
    durationMs: number;
    error?: string;
  }): Promise<void> {
    await this.prisma.integrationAuditLog.create({
      data: {
        organizationId: entry.organizationId,
        provider: 'zoho-invoice',
        method: entry.method,
        path: entry.path,
        statusCode: entry.statusCode,
        requestBody: entry.requestBody
          ? (redact(entry.requestBody) as Prisma.InputJsonValue)
          : Prisma.DbNull,
        responseBody: entry.responseBody
          ? (truncateJson(redact(entry.responseBody), MAX_BODY_SIZE) as Prisma.InputJsonValue)
          : Prisma.DbNull,
        durationMs: entry.durationMs,
        error: entry.error ?? null,
      },
    });
  }
}

// ───────── Helpers ─────────

/**
 * Recursively replaces values of sensitive keys with '***'. Operates on
 * a JSON-safe clone — never mutates the input.
 */
function redact(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(redact);
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEYS.test(k) ? '***' : redact(v);
    }
    return out;
  }
  return value;
}

/**
 * JSON-serialise, truncate to `maxBytes`, then re-parse back to a
 * JSON-safe value for Prisma's Json column. If the truncated string is
 * not valid JSON (it was cut mid-value), wrap the raw string.
 */
function truncateJson(value: unknown, maxBytes: number): unknown {
  const str = JSON.stringify(value);
  if (str.length <= maxBytes) return value;
  const cut = str.slice(0, maxBytes);
  try {
    return JSON.parse(cut);
  } catch {
    return { __truncated: true, raw: cut };
  }
}
