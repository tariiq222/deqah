"use client"

import Link from "next/link"
import { useZohoStatus } from "@/hooks/use-zoho-invoice"
import { useLocale } from "@/components/locale-provider"

/**
 * Proactive banner shown at the top of the dashboard when the Zoho Invoice
 * integration is configured but inactive (typically because the refresh
 * token was revoked or Zoho returned INVALID_TOKEN / code 57).
 *
 * Polling: useZohoStatus has a 30s staleTime, so the banner auto-clears
 * within ~30s of the tenant reconnecting.
 *
 * Render conditions:
 *   - isConfigured=true AND isActive=false → show
 *   - isConfigured=false → don't show (tenant never connected)
 *   - isConfigured=true AND isActive=true → don't show
 *   - query still loading → don't show (avoid flash)
 */
export function ZohoReconnectBanner() {
  const { data, isLoading } = useZohoStatus()
  const { t } = useLocale()

  // Don't render while loading or when the integration is healthy/unconfigured.
  if (isLoading || !data?.isConfigured || data.isActive) return null

  return (
    <div className="border-b border-warning/30 bg-warning/10 px-4 py-2 text-center text-sm text-warning">
      {t("zoho.banner.reconnect")}{" "}
      <Link
        href="/settings?tab=integrations"
        className="font-medium underline hover:no-underline"
      >
        {t("zoho.banner.reconnectLink")}
      </Link>
    </div>
  )
}
