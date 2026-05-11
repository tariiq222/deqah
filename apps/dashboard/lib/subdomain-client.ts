const RESERVED = new Set(["app", "admin", "api", "www", "dashboard"])

export function computeExpectedTenantUrl(
  hostname: string,
  userSlug: string,
  pathname: string,
): string | null {
  if (!hostname || !userSlug) return null
  const lower = hostname.toLowerCase()
  if (lower === "localhost" || lower === "127.0.0.1") return null
  const parts = lower.split(".")
  if (parts.length < 3) return null
  const leftmost = parts[0]
  const root = parts.slice(1).join(".")
  if (leftmost === userSlug) return null
  return `https://${userSlug}.${root}${pathname || "/"}`
}

export { RESERVED }
