"use client"

import { useEffect, useState, startTransition } from "react"
import { useLoginFlow } from "@/components/features/login/use-login-flow"
import { IdentifierStep } from "@/components/features/login/identifier-step"
import { MethodStep } from "@/components/features/login/method-step"
import { PasswordStep } from "@/components/features/login/password-step"
import { OtpStep } from "@/components/features/login/otp-step"
import { OrgSelectionStep } from "@/components/features/login/org-selection-step"
import { useLocale } from "@/components/locale-provider"

export function LoginForm() {
  const { t } = useLocale()
  const flow = useLoginFlow()
  const [notice, setNotice] = useState("")

  useEffect(() => {
    const reason = sessionStorage.getItem("deqah_auth_reason")
    if (reason === "ORG_SUSPENDED") {
      startTransition(() => setNotice(t("login.orgSuspended")))
      sessionStorage.removeItem("deqah_auth_reason")
    }
  }, [t])

  const stepTitles: Record<typeof flow.step, string> = {
    identifier: t("login.welcome"),
    method: t("login.chooseMethod"),
    password: t("login.welcome"),
    otp: t("login.otp.title"),
    "org-selection": t("login.chooseOrganization"),
  }

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-background p-4">
      <div className="login-card relative z-10 w-full max-w-[400px] overflow-hidden rounded-2xl border border-border bg-card">
        <div aria-hidden className="login-grid-pattern pointer-events-none absolute inset-x-0 top-0 h-72" />
        <div aria-hidden className="login-blob pointer-events-none absolute inset-x-0 top-0 h-72" />
        <div className="relative p-8">
          <h1 className="mb-1 text-center text-2xl font-semibold">{stepTitles[flow.step]}</h1>
          <p className="mb-6 text-center text-sm text-muted-foreground">{t("login.subtitle")}</p>

          {notice && (
            <div className="mb-4 rounded-lg bg-warning/10 px-4 py-3 text-sm text-warning">
              {notice}
            </div>
          )}

          {flow.step === "identifier" && (
            <IdentifierStep
              initial={flow.identifier}
              loading={flow.loading}
              onSubmit={flow.submitIdentifier}
            />
          )}
          {flow.step === "method" && (
            <MethodStep
              identifier={flow.identifier}
              loading={flow.loading}
              onPick={flow.chooseMethod}
              onBack={flow.back}
            />
          )}
          {flow.step === "password" && (
            <PasswordStep
              identifier={flow.identifier}
              loading={flow.loading}
              error={flow.error}
              onSubmit={flow.submitPassword}
              onBack={flow.back}
              onClearError={flow.clearError}
            />
          )}
          {flow.step === "otp" && (
            <OtpStep
              identifier={flow.identifier}
              loading={flow.loading}
              error={flow.error}
              otpSentAt={flow.otpSentAt}
              onSubmit={flow.submitOtp}
              onResend={flow.resendOtp}
              onBack={flow.back}
            />
          )}
          {flow.step === "org-selection" && flow.orgChoices && (
            <OrgSelectionStep
              memberships={flow.orgChoices}
              loading={flow.loading}
              error={flow.error}
              onSelect={flow.selectOrg}
              onBack={flow.back}
            />
          )}
        </div>
      </div>
    </div>
  )
}
