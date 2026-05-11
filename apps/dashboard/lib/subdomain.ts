import "server-only"

const RESERVED_FRONTEND_PREFIXES = new Set([
  "app", "admin", "api", "www", "dashboard", "localhost",
])

const TENANT_SUBDOMAIN_REGEX = /^[a-z0-9]([a-z0-9-]{1,28}[a-z0-9])?$/

export interface SubdomainParse {
  host: string
  subdomain: string | null
  isReserved: boolean
  isTenantCandidate: boolean
}

export function parseHost(host: string | undefined | null): SubdomainParse {
  if (!host) return { host: "", subdomain: null, isReserved: false, isTenantCandidate: false }
  const lower = host.toLowerCase().split(":")[0]
  const parts = lower.split(".")
  if (parts.length < 3) {
    return { host: lower, subdomain: null, isReserved: false, isTenantCandidate: false }
  }
  const leftmost = parts[0]
  const isReserved = RESERVED_FRONTEND_PREFIXES.has(leftmost)
  const isTenantCandidate = !isReserved && TENANT_SUBDOMAIN_REGEX.test(leftmost)
  return { host: lower, subdomain: leftmost, isReserved, isTenantCandidate }
}
