"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  PencilEdit01Icon,
  ArrowLeft01Icon,
  Delete02Icon,
} from "@hugeicons/core-free-icons"

import { ListPageShell } from "@/components/features/list-page-shell"
import { Breadcrumbs } from "@/components/features/breadcrumbs"
import { DetailSection, DetailRow } from "@/components/features/detail-sheet-parts"
import { ErrorBanner } from "@/components/features/error-banner"
import { ClientPageSkeleton } from "@/components/features/clients/client-page-skeleton"
import { DeleteClientDialog } from "@/components/features/clients/delete-client-dialog"
import { Button } from "@deqah/ui"
import { Badge } from "@deqah/ui"
import { Avatar, AvatarFallback } from "@deqah/ui"
import { Card, CardContent } from "@deqah/ui"
import { Separator } from "@deqah/ui"
import { Skeleton } from "@deqah/ui"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@deqah/ui"
import { useLocale } from "@/components/locale-provider"
import { useOrganizationConfig } from "@/hooks/use-organization-config"
import { useClient } from "@/hooks/use-clients"
import { ClientAccountToggle } from "@/components/features/clients/client-account-toggle"
import { BLOOD_LABELS, type BloodType } from "@/lib/schemas/client.schema"
import { ZohoPaymentMirrorTable } from "@/components/features/zoho/zoho-payment-mirror-table"
import { useZohoStatus } from "@/hooks/use-zoho-invoice"

/* ─── Props ─── */

interface Props {
  clientId: string
}

/* ─── Component ─── */

export function ClientDetailPage({ clientId }: Props) {
  const router = useRouter()
  const { locale, t } = useLocale()
  const { formatDate } = useOrganizationConfig()
  const [deleteOpen, setDeleteOpen] = useState(false)

  const { data: client, isLoading, error } = useClient(clientId)

  if (isLoading) return <ClientPageSkeleton />

  if (error || !client) {
    return (
      <ListPageShell>
        <Breadcrumbs />
        <ErrorBanner message={t("clients.detail.notFound")} />
        <Button variant="outline" onClick={() => router.push("/clients")}>
          <HugeiconsIcon icon={ArrowLeft01Icon} size={16} />
          {t("clients.detail.backToClients")}
        </Button>
      </ListPageShell>
    )
  }

  const fullName = [client.firstName, client.middleName, client.lastName].filter(Boolean).join(" ")

  return (
    <ListPageShell>
      <Breadcrumbs items={[
        { label: t("nav.dashboard"), href: "/" },
        { label: t("nav.clients"), href: "/clients" },
        { label: fullName },
      ]} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Avatar className="size-12 shrink-0">
            <AvatarFallback className="bg-primary/10 text-primary font-semibold">
              {client.firstName?.[0] ?? ""}{client.lastName?.[0] ?? ""}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold tracking-tight text-foreground">{fullName}</h1>
              {(client.accountType === "walk_in" || client.accountType === "WALK_IN") && (
                <Badge variant="outline" className="border-warning/30 bg-warning/10 text-warning">
                  {t("clients.detail.walkIn")}
                </Badge>
              )}
              {client.accountType === "FULL" && (
                <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
                  {t("clients.detail.hasAccount")}
                </Badge>
              )}
              <Badge
                variant="outline"
                className={
                  client.isActive
                    ? "border-success/30 bg-success/10 text-success"
                    : "border-muted-foreground/30 bg-muted text-muted-foreground"
                }
              >
                {client.isActive ? t("clients.detail.active") : t("clients.detail.inactive")}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">{client.email}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            className="gap-2 rounded-full px-5"
            onClick={() => router.push(`/clients/${clientId}/edit`)}
          >
            <HugeiconsIcon icon={PencilEdit01Icon} size={16} />
            {t("clients.detail.edit")}
          </Button>
          <Button
            variant="outline"
            className="gap-2 rounded-full px-5 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => setDeleteOpen(true)}
          >
            <HugeiconsIcon icon={Delete02Icon} size={16} />
            {t("clients.actions.delete")}
          </Button>
        </div>
      </div>

      <Tabs defaultValue="info" dir={locale === "ar" ? "rtl" : "ltr"}>
        <TabsList variant="line">
          <TabsTrigger value="info">{t("clients.dialog.tabs.contact")}</TabsTrigger>
          <TabsTrigger value="bookings">{t("clients.dialog.tabs.bookings")}</TabsTrigger>
          <TabsTrigger value="invoices">{t("clients.dialog.tabs.invoices")}</TabsTrigger>
          <TabsTrigger value="stats">{t("clients.dialog.tabs.stats")}</TabsTrigger>
        </TabsList>

        {/* ── Tab 1: التواصل والبيانات ── */}
        <TabsContent value="info" className="pt-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardContent className="pt-6">
                <DetailSection title={t("clients.detail.personalInfo")}>
                  <DetailRow label={t("clients.detail.fullName")} value={fullName} />
                  <DetailRow
                    label={t("clients.detail.gender")}
                    value={client.gender
                      ? t(client.gender === "male" ? "clients.detail.male" : "clients.detail.female")
                      : "—"}
                  />
                  <DetailRow
                    label={t("clients.detail.dateOfBirth")}
                    value={client.dateOfBirth
                      ? formatDate(client.dateOfBirth)
                      : "—"}
                    numeric
                  />
                  <DetailRow label={t("clients.detail.nationality")} value={client.nationality ?? "—"} />
                  <DetailRow label={t("clients.detail.nationalId")} value={client.nationalId ?? "—"} numeric />
                </DetailSection>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <DetailSection title={t("clients.detail.contactInfo")}>
                  <DetailRow label={t("clients.detail.email")} value={client.email ? <span dir="ltr">{client.email}</span> : "—"} />
                  <DetailRow label={t("clients.detail.phone")} value={<span dir="ltr">{client.phone ?? "—"}</span>} />
                </DetailSection>
                <Separator className="my-4" />
                <DetailSection title={t("clients.detail.emergencyContact")}>
                  <DetailRow label={t("clients.detail.name")} value={client.emergencyName ?? "—"} />
                  <DetailRow label={t("clients.detail.phone")} value={<span dir="ltr">{client.emergencyPhone ?? "—"}</span>} />
                </DetailSection>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <DetailSection title={t("clients.detail.medicalInfo")}>
                  <DetailRow
                    label={t("clients.detail.bloodType")}
                    value={client.bloodType ? (BLOOD_LABELS[client.bloodType as BloodType] ?? client.bloodType) : "—"}
                  />
                  <DetailRow label={t("clients.detail.allergies")} value={client.allergies ?? "—"} />
                  <DetailRow label={t("clients.detail.chronicConditions")} value={client.chronicConditions ?? "—"} />
                </DetailSection>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <DetailSection title={t("clients.detail.accountInfo")}>
                  <DetailRow
                    label={t("clients.detail.registeredDate")}
                    value={formatDate(client.createdAt)}
                    numeric
                  />
                  <DetailRow
                    label={t("clients.detail.lastUpdated")}
                    value={formatDate(client.updatedAt)}
                    numeric
                  />
                  {(client.accountType === "walk_in" || client.accountType === "WALK_IN") && (
                    <>
                      <DetailRow
                        label={t("clients.detail.accountType")}
                        value={
                          <span className="rounded-sm bg-warning/10 px-1.5 py-0.5 text-xs font-medium text-warning">
                            {t("clients.detail.walkIn")}
                          </span>
                        }
                      />
                      <DetailRow
                        label={t("clients.detail.claimedAt")}
                        value={client.claimedAt
                          ? formatDate(client.claimedAt)
                          : t("clients.detail.notClaimed")}
                        numeric={!!client.claimedAt}
                      />
                    </>
                  )}
                </DetailSection>
                <div className="mt-4">
                  <ClientAccountToggle client={client} />
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Tab 2: المواعيد ── */}
        <TabsContent value="bookings" className="pt-4">
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground text-center py-8">
                {t("clients.dialog.noBookings")}
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab 3: الفواتير ── */}
        <TabsContent value="invoices" className="pt-4">
          <ClientInvoicesPanel clientId={clientId} t={t} />
        </TabsContent>

        {/* ── Tab 4: الإحصائيات ── */}
        <TabsContent value="stats" className="pt-4">
          <div className="py-8 text-center text-sm text-muted-foreground">
            {t("clients.dialog.noBookings")}
          </div>
        </TabsContent>
      </Tabs>

      <DeleteClientDialog
        client={client}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onDeleted={() => router.push("/clients")}
      />
    </ListPageShell>
  )
}

/**
 * Renders the per-client invoices section. When the tenant has Zoho Invoice
 * configured, it shows the Zoho-mirror table locked to this client. When not
 * configured, it falls back to the existing empty-state copy so non-Zoho
 * tenants don't see a Zoho-branded surface they have nothing to interact with.
 */
function ClientInvoicesPanel({
  clientId,
  t,
}: {
  clientId: string
  t: (key: string) => string
}) {
  const { data: zohoStatus, isLoading } = useZohoStatus()
  const showZoho = zohoStatus?.isConfigured && zohoStatus.isActive

  if (isLoading) {
    return <Skeleton className="h-32 w-full" />
  }

  if (!showZoho) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground text-center py-8">
            {t("clients.dialog.noInvoices")}
          </p>
        </CardContent>
      </Card>
    )
  }

  return <ZohoPaymentMirrorTable lockedClientId={clientId} />
}
