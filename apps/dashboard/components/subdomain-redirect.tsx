"use client"

import { useEffect } from "react"
import { useAuth } from "@/components/providers/auth-provider"
import { useMemberships } from "@/hooks/use-memberships"
import { computeExpectedTenantUrl } from "@/lib/subdomain-client"
import type { Membership } from "@/hooks/use-memberships"

/**
 * After a user is authenticated, ensure they are on their tenant's canonical
 * subdomain (<slug>.deqah.net). If they logged in from app.deqah.net or from
 * a different tenant's subdomain, redirect to the correct one.
 *
 * Mounted inside the (dashboard) layout — runs only for authenticated users.
 */
export function SubdomainRedirect() {
  const { user, loading } = useAuth()
  const { data: memberships } = useMemberships()

  useEffect(() => {
    if (loading || !user || !memberships) return
    if (typeof window === "undefined") return

    // Pick the user's active membership — match by organizationId on user
    const active = memberships.find((m: Membership) => m.organizationId === user.organizationId)
    const slug = active?.organization.slug
    if (!slug) return

    const target = computeExpectedTenantUrl(
      window.location.hostname,
      slug,
      window.location.pathname,
    )
    if (target && target !== window.location.href) {
      window.location.replace(target)
    }
  }, [user, loading, memberships])

  return null
}
