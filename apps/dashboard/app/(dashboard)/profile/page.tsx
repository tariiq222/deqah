"use client"

import { Breadcrumbs } from "@/components/features/breadcrumbs"
import { ListPageShell } from "@/components/features/list-page-shell"
import { PageHeader } from "@/components/features/page-header"
import { useLocale } from "@/components/locale-provider"
import { AccountTab } from "@/components/features/profile/account-tab"

/**
 * Profile page — displays the global User account fields and security settings.
 */
export default function ProfilePage() {
  const { t } = useLocale()
  return (
    <ListPageShell>
      <Breadcrumbs />
      <PageHeader title={t("profile.title")} description={t("profile.description")} />
      <AccountTab />
    </ListPageShell>
  )
}
