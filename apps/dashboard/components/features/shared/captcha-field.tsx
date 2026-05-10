"use client"

import { forwardRef, useEffect } from "react"
import HCaptcha from "@hcaptcha/react-hcaptcha"
import { useLocale } from "@/components/locale-provider"

if (process.env.NODE_ENV === 'production' && !process.env.NEXT_PUBLIC_HCAPTCHA_SITE_KEY) {
  throw new Error('NEXT_PUBLIC_HCAPTCHA_SITE_KEY is required in production');
}

const TEST_SITE_KEY = "10000000-ffff-ffff-ffff-000000000001"
const SITE_KEY = process.env.NEXT_PUBLIC_HCAPTCHA_SITE_KEY ?? TEST_SITE_KEY

export const isCaptchaConfigured = SITE_KEY !== TEST_SITE_KEY

interface CaptchaFieldProps {
  onVerify: (token: string) => void
  onExpire?: () => void
  theme?: "light" | "dark"
}

/**
 * Wraps the hCaptcha widget. When no real sitekey is configured
 * (NEXT_PUBLIC_HCAPTCHA_SITE_KEY missing), we replace the cross-origin
 * iframe — which renders an unstyled red "for testing only" warning that
 * collides with our card layout — with a clean dev-mode placeholder
 * that auto-issues a token. Production behaviour is unchanged.
 */
export const CaptchaField = forwardRef<HCaptcha, CaptchaFieldProps>(
  function CaptchaField({ onVerify, onExpire, theme = "light" }, ref) {
    const { t } = useLocale()

    useEffect(() => {
      if (!isCaptchaConfigured) onVerify("dev-bypass")
    }, [onVerify])

    if (!isCaptchaConfigured) {
      return (
        <div className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
          <span className="inline-block size-2 rounded-full bg-success" aria-hidden />
          <span>{t("login.captchaDevMode")}</span>
        </div>
      )
    }

    return (
      <HCaptcha
        ref={ref}
        sitekey={SITE_KEY}
        onVerify={onVerify}
        onExpire={onExpire}
        theme={theme}
      />
    )
  },
)
