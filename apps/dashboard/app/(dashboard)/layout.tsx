"use client"

import type { ReactNode } from "react"
import { AppSidebar } from "@/components/app-sidebar"
import { Header } from "@/components/header"
import { MobileSidebarTrigger } from "@/components/mobile-sidebar-trigger"
import { SidebarInset, SidebarProvider } from "@deqah/ui"
import { AuthGate } from "@/components/providers/auth-gate"
import { CommandPalette } from "@/components/features/command-palette"
import { BillingShell } from "@/components/billing-shell"
import { ImpersonationBanner } from "@/components/impersonation-banner"
import { TrialBanner } from "@/components/trial-banner"
import { ZohoReconnectBanner } from "@/components/zoho-reconnect-banner"
import { SubdomainRedirect } from "@/components/subdomain-redirect"

export default function DashboardLayout({
  children,
}: {
  children: ReactNode
}) {
  return (
    <AuthGate>
      <>
        <SubdomainRedirect />
        <BillingShell>
          <SidebarProvider>
            <AppSidebar />
            <SidebarInset className="min-h-0 relative z-[1]">
              <Header />
              <ImpersonationBanner />
              <TrialBanner />
              <ZohoReconnectBanner />
              <div className="flex-1 overflow-y-auto p-4 md:px-8 md:py-7">
                {children}
              </div>
              <CommandPalette />
            </SidebarInset>
            <MobileSidebarTrigger />
          </SidebarProvider>
        </BillingShell>
      </>
    </AuthGate>
  )
}
