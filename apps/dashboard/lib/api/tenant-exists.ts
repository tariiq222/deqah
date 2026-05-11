import "server-only"

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5100/api/v1"

export interface TenantExistsResult {
  exists: boolean
  organizationId?: string
}

export async function checkTenantExistsSSR(host: string): Promise<TenantExistsResult> {
  try {
    const res = await fetch(`${API_BASE}/public/tenants/exists`, {
      headers: { "x-forwarded-host": host },
      cache: "no-store",
    })
    if (!res.ok) return { exists: false }
    return (await res.json()) as TenantExistsResult
  } catch {
    return { exists: false }
  }
}
