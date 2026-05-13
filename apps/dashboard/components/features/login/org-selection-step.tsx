"use client"

import { Button } from "@deqah/ui"
import { useLocale } from "@/components/locale-provider"
import type { OrgSelectionMembership } from "@/lib/api/auth"

interface Props {
  memberships: OrgSelectionMembership[]
  loading: boolean
  error: unknown
  onSelect: (organizationId: string) => void
  onBack: () => void
}

export function OrgSelectionStep({ memberships, loading, error, onSelect, onBack }: Props) {
  const { t, locale } = useLocale()

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">{t("login.chooseOrganization")}</p>
        <p className="text-xs text-muted-foreground">{t("login.chooseOrganizationDescription")}</p>
      </div>

      <ul className="flex flex-col gap-2">
        {memberships.map((m) => {
          const displayName =
            locale === "ar"
              ? m.organizationNameAr
              : (m.organizationNameEn ?? m.organizationNameAr)
          return (
            <li key={m.organizationId}>
              <button
                type="button"
                disabled={loading}
                onClick={() => onSelect(m.organizationId)}
                className="flex w-full items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-start transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              >
                {m.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={m.logoUrl}
                    alt=""
                    aria-hidden
                    className="size-9 shrink-0 rounded-lg object-cover"
                  />
                ) : (
                  <span
                    aria-hidden
                    className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm font-semibold text-primary"
                  >
                    {displayName.charAt(0)}
                  </span>
                )}
                <span className="flex flex-col gap-0.5 overflow-hidden">
                  <span className="truncate text-sm font-medium">{displayName}</span>
                  <span className="text-xs text-muted-foreground">
                    {t(`login.role.${m.role}`)}
                  </span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      {error ? (
        <p className="text-xs text-destructive">{t("login.error.invalidCredentials.description")}</p>
      ) : null}

      <Button type="button" variant="ghost" className="w-full" onClick={onBack} disabled={loading}>
        {t("common.back")}
      </Button>
    </div>
  )
}
