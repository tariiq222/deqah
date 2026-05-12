"use client"

import { useRouter } from "next/navigation"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Add01Icon,
  DocumentValidationIcon,
  CheckmarkCircle01Icon,
  FileEditIcon,
} from "@hugeicons/core-free-icons"
import { toast } from "sonner"
import { ListPageShell } from "@/components/features/list-page-shell"
import { Breadcrumbs } from "@/components/features/breadcrumbs"
import { PageHeader } from "@/components/features/page-header"
import { StatsGrid } from "@/components/features/stats-grid"
import { StatCard } from "@/components/features/stat-card"
import { DataTable } from "@/components/features/data-table"
import { FilterBar } from "@/components/features/filter-bar"
import { Button } from "@deqah/ui"
import { useLocale } from "@/components/locale-provider"
import { FeatureGate } from "@/components/feature-gate"
import { FeatureKey } from "@deqah/shared/constants"
import { FeatureDisabledState } from "@/components/features/feature-disabled-state"
import { getIntakeFormsColumns } from "@/components/features/intake-forms/intake-forms-columns"
import { useIntakeForms, useIntakeFormMutations } from "@/hooks/use-intake-forms"
import { mapApiForm } from "@/lib/mappers/intake-form"
import type { IntakeForm } from "@/lib/types/intake-form"

export default function IntakeFormsPage() {
  const { locale, t } = useLocale()
  const isAr = locale === "ar"
  const router = useRouter()

  const {
    forms: rawForms,
    search,
    setSearch,
    isActive,
    setIsActive,
    hasFilters,
    resetFilters,
  } = useIntakeForms()
  const { update, delete: deleteFn } = useIntakeFormMutations()

  const forms = rawForms.map(mapApiForm)

  const totalForms = forms.length
  const activeForms = forms.filter((f) => f.isActive).length
  const totalSubmissions = forms.reduce((sum, f) => sum + f.submissionsCount, 0)

  const columns = getIntakeFormsColumns({
    isAr,
    t,
    onEdit: (form: IntakeForm) => router.push(`/intake-forms/${form.id}/edit`),
    onDelete: (form: IntakeForm) =>
      deleteFn(form.id, {
        onSuccess: () => toast.success(t("intakeForms.deleteSuccess")),
        onError: () => toast.error(t("intakeForms.deleteError")),
      }),
    onPreview: (_form: IntakeForm) => router.push(`/intake-forms/${_form.id}/edit`),
    onToggleActive: (form: IntakeForm, value: boolean) =>
      update(
        { formId: form.id, payload: { isActive: value } },
        {
          onSuccess: () =>
            toast.success(
              value
                ? t("intakeForms.activateSuccess")
                : t("intakeForms.deactivateSuccess")
            ),
          onError: () => toast.error(t("intakeForms.updateError")),
        }
      ),
  })

  return (
    <FeatureGate
      feature={FeatureKey.INTAKE_FORMS}
      fallback={
        <FeatureDisabledState
          title={t("intakeForms.title")}
          description={t("intakeForms.featureDisabled")}
        />
      }
    >
    <ListPageShell>
      <Breadcrumbs />
      <PageHeader
        title={t("intakeForms.title")}
        description={t("intakeForms.description")}
      >
        <Button
          className="gap-2 rounded-full px-5"
          onClick={() => router.push("/intake-forms/create")}
        >
          <HugeiconsIcon icon={Add01Icon} size={16} />
          {t("intakeForms.newForm")}
        </Button>
      </PageHeader>

      <FilterBar
        search={{
          value: search,
          onChange: setSearch,
          placeholder: t("intakeForms.searchPlaceholder"),
        }}
        selects={[
          {
            key: "isActive",
            value: isActive === undefined ? "all" : String(isActive),
            placeholder: t("intakeForms.filter.status"),
            options: [
              { value: "all", label: t("intakeForms.filter.allStatuses") },
              { value: "true", label: t("intakeForms.filter.active") },
              { value: "false", label: t("intakeForms.filter.inactive") },
            ],
            onValueChange: (v) =>
              setIsActive(v === "all" ? undefined : v === "true"),
          },
        ]}
        hasFilters={hasFilters}
        onReset={resetFilters}
      />

      <StatsGrid>
        <StatCard
          title={t("intakeForms.stats.total")}
          value={totalForms}
          icon={DocumentValidationIcon}
          iconColor="primary"
        />
        <StatCard
          title={t("intakeForms.stats.active")}
          value={activeForms}
          icon={CheckmarkCircle01Icon}
          iconColor="success"
        />
        <StatCard
          title={t("intakeForms.stats.submissions")}
          value={totalSubmissions.toLocaleString("en-US")}
          icon={FileEditIcon}
          iconColor="accent"
        />
      </StatsGrid>

      <DataTable
        columns={columns}
        data={forms}
        emptyTitle={t("intakeForms.empty.title")}
        emptyDescription={t("intakeForms.empty.description")}
      />
    </ListPageShell>
    </FeatureGate>
  )
}
