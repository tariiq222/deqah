import Link from 'next/link'
import { Button } from '@deqah/ui'

interface Props {
  searchParams: Promise<{ subdomain?: string }>
}

/**
 * Workspace-not-found page
 *
 * Rendered when middleware determines the requested subdomain does not map to
 * a registered tenant. Lives outside the (dashboard) route group so it bypasses
 * the auth/billing layout wrappers — intentional.
 */
export default async function WorkspaceNotFoundPage({ searchParams }: Props) {
  const { subdomain } = await searchParams
  const displaySubdomain = subdomain ? decodeURIComponent(subdomain) : null

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center gap-8 bg-background px-4"
      dir="rtl"
    >
      {/* Icon */}
      <div className="inline-flex size-20 items-center justify-center rounded-full bg-destructive/10">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-10 text-destructive"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>

      {/* Copy — Arabic primary, English secondary */}
      <div className="flex max-w-md flex-col items-center gap-3 text-center">
        <h1 className="text-2xl font-bold text-foreground">
          مساحة العمل غير موجودة
        </h1>
        {displaySubdomain && (
          <p className="text-sm font-medium text-muted-foreground">
            <span className="font-mono text-foreground">{displaySubdomain}</span>
          </p>
        )}
        <p className="text-sm text-muted-foreground">
          الرابط الذي تحاول فتحه لا يعود لأي عيادة مسجّلة على منصة دقة.
        </p>
        <p className="text-xs text-muted-foreground/70" dir="ltr">
          The workspace you are looking for does not exist or may have been
          removed.
        </p>
      </div>

      {/* CTAs */}
      <div className="flex flex-col items-center gap-3 sm:flex-row">
        <Button asChild>
          <a href="https://deqah.net">الذهاب إلى منصة دقة</a>
        </Button>
        <Button asChild variant="outline">
          <Link href="/register">إنشاء حساب جديد</Link>
        </Button>
      </div>
    </div>
  )
}
