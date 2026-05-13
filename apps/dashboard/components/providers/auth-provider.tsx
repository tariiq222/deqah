"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react"
import type { ReactNode } from "react"
import {
  acceptImpersonationToken,
  clearImpersonationMarker,
  login as apiLogin,
  logoutApi,
  fetchMe,
  refreshToken,
} from "@/lib/api/auth"
import type { AuthUser, AuthResponse } from "@/lib/api/auth"
import { setAccessToken } from "@/lib/api"

/* ─── Context Shape ─── */

interface AuthContextValue {
  user: AuthUser | null
  loading: boolean
  permissions: string[]
  login: (identifier: string, password: string) => Promise<void>
  loginWithTokens: (res: AuthResponse) => void
  logout: () => Promise<void>
  isAuthenticated: boolean
  canDo: (module: string, action: string) => boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

function consumeImpersonationTokenFromUrl(): string | null {
  if (typeof window === "undefined") return null

  const url = new URL(window.location.href)
  const token = url.searchParams.get("_impersonation")
  if (!token) return null

  url.searchParams.delete("_impersonation")
  const nextUrl = `${url.pathname}${url.search}${url.hash}`
  window.history.replaceState(window.history.state, "", nextUrl || "/")
  return token
}

/* ─── Provider ─── */

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [permissions, setPermissions] = useState<string[]>([])
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const scheduleRefreshRef = useRef<((expiresIn: number) => void) | null>(null)

  const scheduleRefresh = useCallback((expiresIn: number) => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
    const delay = Math.max((expiresIn - 120) * 1000, 10_000)
    refreshTimerRef.current = setTimeout(async () => {
      try {
        const data = await refreshToken()
        setAccessToken(data.accessToken)
        scheduleRefreshRef.current?.(data.expiresIn)
      } catch {
        setUser(null)
        setPermissions([])
      }
    }, delay)
  }, [])

  useEffect(() => {
    scheduleRefreshRef.current = scheduleRefresh

    const impersonationToken = consumeImpersonationTokenFromUrl()
    if (impersonationToken) {
      acceptImpersonationToken(impersonationToken)
      fetchMe()
        .then((u) => {
          setUser(u)
          setPermissions(u.permissions ?? [])
        })
        .catch(() => {
          setAccessToken(null)
          clearImpersonationMarker()
          setUser(null)
          setPermissions([])
          localStorage.removeItem("deqah_user")
        })
        .finally(() => setLoading(false))

      return () => {
        if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
      }
    }

    refreshToken()
      .then((res) => {
        scheduleRefresh(res.expiresIn)
        return fetchMe()
      })
      .then((u) => {
        setUser(u)
        setPermissions(u.permissions ?? [])
      })
      .catch(() => {
        setUser(null)
        setPermissions([])
        localStorage.removeItem("deqah_user")
      })
      .finally(() => setLoading(false))

    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
    }
  }, [scheduleRefresh])

  const login = useCallback(async (identifier: string, password: string) => {
    const res = await apiLogin(identifier, password)
    if ('requires_org_selection' in res) {
      // Multi-org flow: caller must handle org selection via the login page step.
      // This direct login path does not support it; ignore (the login form uses loginWithTokens).
      return
    }
    setUser(res.user)
    setPermissions(res.user.permissions ?? [])
    scheduleRefresh(res.expiresIn)
  }, [scheduleRefresh])

  const loginWithTokens = useCallback((res: AuthResponse) => {
    setUser(res.user)
    setPermissions(res.user.permissions ?? [])
    scheduleRefresh(res.expiresIn)
  }, [scheduleRefresh])

  const logout = useCallback(async () => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
    await logoutApi()
    setUser(null)
    setPermissions([])
  }, [])

  const canDo = useCallback(
    (module: string, action: string): boolean => {
      return (
        permissions.includes(`${module}:${action}`) ||
        permissions.includes(`${module}:*`) ||
        permissions.includes("*")
      )
    },
    [permissions],
  )

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        permissions,
        login,
        loginWithTokens,
        logout,
        isAuthenticated: !!user,
        canDo,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

/* ─── Hook ─── */

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within AuthProvider")
  return ctx
}
