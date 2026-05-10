/**
 * useSwitchOrganization — unit tests (SaaS-06)
 *
 * Covers:
 *  1. POSTs to /auth/switch-org with { organizationId }
 *  2. On success: replaces access token, flushes the query cache, and
 *     calls router.refresh(). Refresh token is NOT stored in localStorage
 *     (CR-9: it is delivered by the backend as httpOnly cookie ck_refresh).
 *  3. Propagates errors (mutation.error path)
 */

import { renderHook, waitFor, act } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { describe, it, expect, vi, beforeEach } from "vitest"
import type { ReactNode } from "react"
import React from "react"

const mockApiPost = vi.hoisted(() => vi.fn())
const mockSetAccessToken = vi.hoisted(() => vi.fn())
vi.mock("@/lib/api", () => ({
  api: { post: mockApiPost },
  setAccessToken: mockSetAccessToken,
}))

const mockRouterRefresh = vi.hoisted(() => vi.fn())
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRouterRefresh }),
}))

import { useSwitchOrganization } from "@/hooks/use-switch-organization"

function setup() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const clearSpy = vi.spyOn(qc, "clear")
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  }
  Wrapper.displayName = "Wrapper"
  return { qc, clearSpy, Wrapper }
}

describe("useSwitchOrganization", () => {
  beforeEach(() => {
    mockApiPost.mockReset()
    mockSetAccessToken.mockReset()
    mockRouterRefresh.mockReset()
    localStorage.clear()
  })

  it("on success, swaps access token, clears cache, and refreshes router", async () => {
    mockApiPost.mockResolvedValueOnce({
      accessToken: "new-acc",
      expiresIn: 900,
    })

    const { clearSpy, Wrapper } = setup()
    const { result } = renderHook(() => useSwitchOrganization(), {
      wrapper: Wrapper,
    })

    await act(async () => {
      result.current.mutate("org-target")
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockApiPost).toHaveBeenCalledWith("/auth/switch-org", {
      organizationId: "org-target",
    })
    expect(mockSetAccessToken).toHaveBeenCalledWith("new-acc")
    // CR-9: refresh token is NOT stored in localStorage — backend sets ck_refresh httpOnly cookie
    expect(localStorage.getItem("deqah_refresh_token")).toBeNull()
    expect(clearSpy).toHaveBeenCalled()
    expect(mockRouterRefresh).toHaveBeenCalled()
  })

  it("surfaces errors without touching tokens or cache", async () => {
    const boom = new Error("forbidden")
    mockApiPost.mockRejectedValueOnce(boom)

    const { clearSpy, Wrapper } = setup()
    const { result } = renderHook(() => useSwitchOrganization(), {
      wrapper: Wrapper,
    })

    await act(async () => {
      result.current.mutate("org-nope")
    })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toBe(boom)
    expect(mockSetAccessToken).not.toHaveBeenCalled()
    expect(localStorage.getItem("deqah_refresh_token")).toBeNull()
    expect(clearSpy).not.toHaveBeenCalled()
    expect(mockRouterRefresh).not.toHaveBeenCalled()
  })
})
