"use client"

import { useState } from "react"
import { Button, Input, Label } from "@deqah/ui"
import { useLocale } from "@/components/locale-provider"
import { HugeiconsIcon } from "@hugeicons/react"
import { EyeIcon, ScanEyeIcon } from "@hugeicons/core-free-icons"
import { LoginErrorAlert } from "@/components/features/login/login-error-alert"

interface Props {
  identifier: string
  loading: boolean
  error: unknown
  onSubmit: (password: string) => void
  onBack: () => void
  onClearError: () => void
}

export function PasswordStep({
  identifier,
  loading,
  error,
  onSubmit,
  onBack,
  onClearError,
}: Props) {
  const { t } = useLocale()
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)

  const handle = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit(password)
  }

  return (
    <form onSubmit={handle} className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground break-all" dir="ltr">
        {identifier}
      </p>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">{t("login.passwordLabel")}</Label>
        <div className="relative">
          <Input
            id="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value)
              if (error) onClearError()
            }}
            disabled={loading}
            className="pe-10"
          />
          <button
            type="button"
            className="absolute inset-y-0 end-0 flex items-center pe-3 text-muted-foreground"
            onClick={() => setShowPassword((p) => !p)}
            tabIndex={-1}
          >
            <HugeiconsIcon icon={showPassword ? ScanEyeIcon : EyeIcon} size={18} />
          </button>
        </div>
      </div>
      <LoginErrorAlert error={error} />
      <Button type="submit" disabled={loading || !password} className="w-full">
        {loading ? t("login.signingIn") : t("login.signIn")}
      </Button>
      <Button type="button" variant="ghost" className="w-full" onClick={onBack} disabled={loading}>
        {t("common.back")}
      </Button>
    </form>
  )
}
