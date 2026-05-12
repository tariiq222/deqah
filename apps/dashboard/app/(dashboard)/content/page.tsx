"use client"

import Link from "next/link"
import { Breadcrumbs } from "@/components/features/breadcrumbs"
import { ListPageShell } from "@/components/features/list-page-shell"
import { PageHeader } from "@/components/features/page-header"
import { useLocale } from "@/components/locale-provider"

const SECTIONS: { href: string; titleKey: string; descKey: string }[] = [
  { href: "/content/home", titleKey: "content.landing.section.home.title", descKey: "content.landing.section.home.desc" },
]

export default function ContentLandingPage() {
  const { t } = useLocale()
  return (
    <ListPageShell>
      <Breadcrumbs />
      <PageHeader
        title={t("content.landing.title")}
        description={t("content.landing.description")}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SECTIONS.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="glass rounded-2xl p-6 transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <h3 className="text-base font-semibold mb-1">{t(s.titleKey)}</h3>
            <p className="text-sm text-muted-foreground">{t(s.descKey)}</p>
          </Link>
        ))}
      </div>
    </ListPageShell>
  )
}
