import { headers } from "next/headers"
import { LoginFormClient } from "./login-form-client"
import { TenantNotFound } from "./tenant-not-found"
import { BrandingStyle } from "./branding-style"
import { parseHost } from "@/lib/subdomain"
import { checkTenantExistsSSR } from "@/lib/api/tenant-exists"
import { fetchPublicBrandingSSR } from "@/lib/api/branding-ssr"

export default async function LoginPage() {
  const headersList = await headers()
  const host = headersList.get("x-forwarded-host") ?? headersList.get("host") ?? ""
  const parsed = parseHost(host)

  if (parsed.isReserved || !parsed.subdomain) {
    return <LoginFormClient />
  }
  if (!parsed.isTenantCandidate) {
    return <TenantNotFound />
  }

  const [existsResult, branding] = await Promise.all([
    checkTenantExistsSSR(host),
    fetchPublicBrandingSSR(host),
  ])

  if (!existsResult.exists) {
    return <TenantNotFound />
  }

  return (
    <>
      <BrandingStyle branding={branding} />
      <LoginFormClient />
    </>
  )
}
