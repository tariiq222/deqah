import "server-only"
import type { PublicBranding } from "@/lib/types/branding"

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5100/api/v1"

export async function fetchPublicBrandingSSR(host: string): Promise<PublicBranding | null> {
  try {
    const res = await fetch(`${API_BASE}/public/branding`, {
      headers: { "x-forwarded-host": host },
      cache: "no-store",
    })
    if (!res.ok) return null
    return (await res.json()) as PublicBranding
  } catch {
    return null
  }
}
