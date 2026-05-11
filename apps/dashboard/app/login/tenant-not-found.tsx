export function TenantNotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="max-w-md text-center">
        <div className="mb-6 inline-flex size-16 items-center justify-center rounded-full bg-destructive/10">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-8 text-destructive">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <h1 className="mb-3 text-2xl font-bold text-foreground">هذه العيادة غير موجودة</h1>
        <p className="mb-8 text-muted-foreground">الرابط الذي تحاول فتحه لا يعود لأي عيادة مسجّلة على منصة دقة.</p>
        <a href="https://app.deqah.net" className="inline-flex items-center justify-center rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
          الذهاب إلى منصة دقة
        </a>
      </div>
    </div>
  )
}
