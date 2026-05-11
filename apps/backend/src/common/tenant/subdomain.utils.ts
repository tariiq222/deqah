/**
 * Built-in reserved subdomains. Merged with optional env-supplied list
 * (RESERVED_SUBDOMAINS, comma-separated) at module bootstrap.
 */
export const DEFAULT_RESERVED_SUBDOMAINS: ReadonlySet<string> = new Set([
  'www',
  'api',
  'admin',
  'app',
  'assets',
  'auth',
  'billing',
  'blog',
  'cdn',
  'dashboard',
  'deqah',
  'dev',
  'docs',
  'errors',
  'files',
  'ftp',
  'grafana',
  'help',
  'login',
  'mail',
  'media',
  'metrics',
  'monitoring',
  'mx',
  '_next',
  'ns',
  'prod',
  'production',
  'prometheus',
  'public',
  'qa',
  'register',
  'root',
  'settings',
  'signup',
  'smtp',
  'socket',
  'staging',
  'static',
  'status',
  'support',
  'system',
  'test',
  'webhook',
  'webhooks',
  'ws',
]);

const IPV4_REGEX = /^(?:\d{1,3}\.){3}\d{1,3}$/;

/**
 * Normalize an inbound Host header: lowercase, strip port. Returns null when the
 * value is empty, undefined, or an IPv4 literal (which can never be a subdomain).
 */
export function normalizeHost(host: string | undefined | null): string | null {
  if (!host) return null;
  const trimmed = host.trim().toLowerCase();
  if (!trimmed) return null;
  const noPort = trimmed.replace(/:\d+$/, '');
  if (IPV4_REGEX.test(noPort)) return null;
  return noPort;
}

/**
 * Extract the subdomain prefix when host ends with the configured root domain.
 * Returns null when the host equals the root, when it does not match, or when
 * the host is not a usable name (IP, empty).
 */
export function extractSubdomain(
  host: string | undefined | null,
  rootDomain: string,
): string | null {
  const h = normalizeHost(host);
  if (!h) return null;
  const root = rootDomain.toLowerCase();
  if (h === root) return null;
  const suffix = `.${root}`;
  if (!h.endsWith(suffix)) return null;
  const sub = h.slice(0, -suffix.length);
  return sub.length === 0 ? null : sub;
}

/**
 * Reserved if the candidate appears in the built-in/extra set, OR if it
 * contains a dot (multi-label like `a.b` cannot map to a single org slug).
 */
export function isReservedSubdomain(
  subdomain: string,
  reserved: ReadonlySet<string>,
): boolean {
  const lower = subdomain.toLowerCase();
  if (lower.includes('.')) return true;
  return reserved.has(lower);
}
