"use client"

import { useState, useCallback } from "react"
import { login as apiLogin, requestDashboardOtp, verifyDashboardOtp } from "@/lib/api/auth"
import type { OrgSelectionMembership } from "@/lib/api/auth"
import { useAuth } from "@/components/providers/auth-provider"
import type { LoginStep, LoginMethod } from "@/lib/schemas/auth-login.schema"

export function useLoginFlow() {
  const { loginWithTokens } = useAuth()
  const [step, setStep] = useState<LoginStep>("identifier")
  const [identifier, setIdentifier] = useState("")
  const [password, setPasswordState] = useState("")
  const [method, setMethod] = useState<LoginMethod | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [loading, setLoading] = useState(false)
  const [otpSentAt, setOtpSentAt] = useState<number | null>(null)
  const [orgChoices, setOrgChoices] = useState<OrgSelectionMembership[] | null>(null)

  const clearError = useCallback(() => setError(null), [])

  const submitIdentifier = useCallback((value: string) => {
    setIdentifier(value)
    setError(null)
    setStep("method")
  }, [])

  const chooseMethod = useCallback(
    async (m: LoginMethod) => {
      setMethod(m)
      setError(null)
      if (m === "otp") {
        setLoading(true)
        try {
          await requestDashboardOtp(identifier)
          setOtpSentAt(Date.now())
          setStep("otp")
        } catch (e) {
          setError(e)
        } finally {
          setLoading(false)
        }
      } else {
        setStep("password")
      }
    },
    [identifier],
  )

  const submitPassword = useCallback(
    async (pwd: string) => {
      setLoading(true)
      setError(null)
      try {
        const res = await apiLogin(identifier, pwd)
        if ('requires_org_selection' in res) {
          setPasswordState(pwd)
          setOrgChoices(res.memberships)
          setStep("org-selection")
          return
        }
        loginWithTokens(res)
      } catch (e) {
        setError(e)
      } finally {
        setLoading(false)
      }
    },
    [identifier, loginWithTokens],
  )

  const selectOrg = useCallback(
    async (organizationId: string) => {
      setLoading(true)
      setError(null)
      try {
        const res = await apiLogin(identifier, password, organizationId)
        if ('requires_org_selection' in res) {
          // Should not happen when organizationId is supplied; treat as error.
          setError(new Error("Unexpected org selection response"))
          return
        }
        loginWithTokens(res)
      } catch (e) {
        setError(e)
      } finally {
        setLoading(false)
      }
    },
    [identifier, password, loginWithTokens],
  )

  const submitOtp = useCallback(
    async (code: string) => {
      setLoading(true)
      setError(null)
      try {
        const res = await verifyDashboardOtp(identifier, code)
        loginWithTokens(res)
      } catch (e) {
        setError(e)
      } finally {
        setLoading(false)
      }
    },
    [identifier, loginWithTokens],
  )

  const resendOtp = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      await requestDashboardOtp(identifier)
      setOtpSentAt(Date.now())
    } catch (e) {
      setError(e)
    } finally {
      setLoading(false)
    }
  }, [identifier])

  const back = useCallback(() => {
    setError(null)
    if (step === "method") setStep("identifier")
    else if (step === "password" || step === "otp") setStep("method")
    else if (step === "org-selection") setStep("password")
  }, [step])

  return {
    step, identifier, method, error, loading, otpSentAt, orgChoices,
    submitIdentifier, chooseMethod, submitPassword, selectOrg, submitOtp, resendOtp, back, clearError,
  }
}
