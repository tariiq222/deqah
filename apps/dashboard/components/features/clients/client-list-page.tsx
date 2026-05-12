"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Add01Icon,
  UserMultiple02Icon,
  CheckmarkCircle02Icon,
  Cancel01Icon,
  CalendarAdd02Icon,
} from "@hugeicons/core-free-icons"

import { ListPageShell } from "@/components/features/list-page-shell"
import { DataTable } from "@/components/features/data-table"
import { Breadcrumbs } from "@/components/features/breadcrumbs"
import { PageHeader } from "@/components/features/page-header"
import { ErrorBanner } from "@/components/features/error-banner"
import { FilterBar } from "@/components/features/filter-bar"
import { StatsGrid } from "@/components/features/stats-grid"
import { StatCard } from "@/components/features/stat-card"
import { getClientColumns } from "@/components/features/clients/client-columns"
import { DeleteClientDialog } from "@/components/features/clients/delete-client-dialog"
import { Button } from "@deqah/ui"
import { Skeleton } from "@deqah/ui"
import { useClients, useClientMutations, useClientStats } from "@/hooks/use-clients"
import { useLocale } from "@/components/locale-provider"
import { useAuth } from "@/components/providers/auth-provider"
import { useTerminology } from "@/hooks/use-terminology"
import type { Client } from "@/lib/types/client"

export function ClientListPage() {
  const router = useRouter()
  const { t, locale } = useLocale()
  const { user, canDo } = useAuth()
  // Vertical-aware label: "العملاء"/"Clients" for clinic verticals,
  // "المرضى"/"Patients" for medical, "المتدربون"/"Members" for fitness, …
  const { t: term } = useTerminology(user?.verticalSlug ?? undefined)
  const titleLabel = term("client.plural", t("nav.clients"))
  const { clients, meta, isLoading, error, search, setSearch, isActive, setIsActive, resetSearch, page, setPage } = useClients()
  const { toggleActiveMut } = useClientMutations()
  const stats = useClientStats()

  const [pendingDelete, setPendingDelete] = useState<Client | null>(null)

  const hasFilters = isActive !== undefined || search.length > 0

  const columns = getClientColumns({
    onRowClick: (p) => router.push(`/clients/${p.id}`),
    onViewClick: (p) => router.push(`/clients/${p.id}`),
    onEditClick: (p) => router.push(`/clients/${p.id}/edit`),
    onToggleActive: (p) => {
      toggleActiveMut.mutate(
        { id: p.id, isActive: !p.isActive },
        {
          onSuccess: () =>
            toast.success(p.isActive ? t("clients.deactivated") : t("clients.activated")),
          onError: () =>
            toast.error(p.isActive ? t("clients.deactivateError") : t("clients.activateError")),
        },
      )
    },
    onDeleteClick: (p) => setPendingDelete(p),
    t,
    locale,
  })

  return (
    <ListPageShell>
      <Breadcrumbs />

      <PageHeader
        title={titleLabel}
        description={t("clients.description")}
      >
        {canDo("Client", "create") && (
          <Button className="gap-2 rounded-full px-5" onClick={() => router.push("/clients/create")}>
            <HugeiconsIcon icon={Add01Icon} size={16} />
            {t("clients.addClient")}
          </Button>
        )}
      </PageHeader>

      {stats.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={`skeleton-${i}`} className="h-[100px] rounded-lg" />)}
        </div>
      ) : (
        <StatsGrid className="sm:grid-cols-2 lg:grid-cols-4">
          <StatCard title={t("clients.stats.total")} value={stats.total} icon={UserMultiple02Icon} iconColor="primary" />
          <StatCard title={t("clients.stats.active")} value={stats.active} icon={CheckmarkCircle02Icon} iconColor="success" />
          <StatCard title={t("clients.stats.inactive")} value={stats.inactive} icon={Cancel01Icon} iconColor="warning" />
          <StatCard title={t("clients.stats.newThisMonth")} value={stats.newThisMonth} icon={CalendarAdd02Icon} iconColor="accent" />
        </StatsGrid>
      )}

      {error && <ErrorBanner message={error} />}

      <FilterBar
        search={{ value: search, onChange: setSearch, placeholder: t("clients.searchPlaceholder") }}
        hasFilters={hasFilters}
        onReset={() => { resetSearch(); setIsActive(undefined) }}
        resultCount={meta && !isLoading ? `${meta.total} ${t("clients.stats.total")}` : undefined}
        selects={[
          {
            key: "status",
            value: isActive === undefined ? "all" : isActive ? "active" : "inactive",
            placeholder: t("clients.filter.allStatuses"),
            options: [
              { value: "all", label: t("clients.filter.allStatuses") },
              { value: "active", label: t("clients.status.active") },
              { value: "inactive", label: t("clients.status.inactive") },
            ],
            onValueChange: (v) => setIsActive(v === "all" ? undefined : v === "active"),
          },
        ]}
      />

      {isLoading && clients.length === 0 ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={`row-${i}`} className="h-12 rounded-lg" />
          ))}
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={clients}
          emptyTitle={hasFilters ? t("clients.empty.noMatches.title") : t("clients.empty.title")}
          emptyDescription={hasFilters ? t("clients.empty.noMatches.description") : t("clients.empty.description")}
          emptyAction={
            hasFilters
              ? { label: t("clients.filters.reset"), onClick: () => { resetSearch(); setIsActive(undefined) } }
              : canDo("Client", "create")
                ? { label: t("clients.addClient"), onClick: () => router.push("/clients/create") }
                : undefined
          }
          serverPaginated
          page={meta?.page ?? page}
          totalPages={meta?.totalPages ?? 1}
          hasPreviousPage={meta?.hasPreviousPage ?? false}
          hasNextPage={meta?.hasNextPage ?? false}
          onPageChange={setPage}
        />
      )}

      <DeleteClientDialog
        client={pendingDelete}
        open={!!pendingDelete}
        onOpenChange={(open) => { if (!open) setPendingDelete(null) }}
      />
    </ListPageShell>
  )
}
