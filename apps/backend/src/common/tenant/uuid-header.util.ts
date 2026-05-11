/**
 * Shared UUID header parser used by:
 *   - `TenantResolverMiddleware` — validating X-Org-Id on unauthenticated
 *     public routes (mobile tenant-lock, subdomain consistency check).
 *   - `JwtGuard` — validating the super-admin X-Org-Id override after
 *     Passport has populated `req.user`.
 *
 * Kept as a plain function (no Nest decorators / no imports from other
 * common modules) so both `tenant/` and `guards/` can depend on it
 * without creating a module cycle.
 */

// RFC 4122 UUID (any version, including the all-zero placeholder used as
// DEFAULT_ORGANIZATION_ID).
export const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validates a header value as a well-formed UUID. Returns the trimmed
 * value when valid, `undefined` otherwise. Non-string values (including
 * Express multi-value `string[]`) are rejected.
 */
export function parseUuidHeader(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return UUID_REGEX.test(trimmed) ? trimmed : undefined;
}
