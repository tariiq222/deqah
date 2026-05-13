import { beforeEach, describe, expect, it, vi } from "vitest"

const {
  loginMock,
  refreshTokenMock,
  getMeMock,
  logoutMock,
  changePasswordMock,
  setAccessTokenMock,
} = vi.hoisted(() => ({
  loginMock: vi.fn(),
  refreshTokenMock: vi.fn(),
  getMeMock: vi.fn(),
  logoutMock: vi.fn(),
  changePasswordMock: vi.fn(),
  setAccessTokenMock: vi.fn(),
}))

vi.mock("@deqah/api-client", () => ({
  authApi: {
    login: loginMock,
    refreshToken: refreshTokenMock,
    getMe: getMeMock,
    logout: logoutMock,
    changePassword: changePasswordMock,
  },
  initClient: vi.fn(),
}))

vi.mock("@/lib/api", () => ({
  setAccessToken: setAccessTokenMock,
  getAccessToken: vi.fn(() => null),
}))

import {
  login,
  fetchMe,
  refreshToken,
  logoutApi,
  logout,
  changePassword,
  getStoredUser,
} from "@/lib/api/auth"

const fakeUser = {
  id: "1",
  email: "a@b.com",
  name: "A B",
  firstName: "A",
  lastName: "B",
  phone: null,
  gender: null,
  avatarUrl: null,
  isActive: true,
  role: "OWNER",
  customRoleId: null,
  isSuperAdmin: false,
  permissions: [],
  organizationId: "org_test",
}

describe("auth api", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it("login delegates to authApi.login and persists access token + user", async () => {
    // Refresh tokens are managed as HttpOnly cookies by @deqah/api-client; the
    // dashboard wrapper only persists the access token + user payload locally.
    loginMock.mockResolvedValueOnce({
      accessToken: "token123",
      refreshToken: "rt123",
      expiresIn: 900,
      user: fakeUser,
    })

    const result = await login("a@b.com", "pass")

    expect(loginMock).toHaveBeenCalledWith({ email: "a@b.com", password: "pass", hCaptchaToken: "" })
    expect(setAccessTokenMock).toHaveBeenCalledWith("token123")
    expect(localStorage.getItem("deqah_user")).toContain("a@b.com")
    expect(result.accessToken).toBe("token123")
  })

  it("fetchMe delegates to authApi.getMe and stores user", async () => {
    getMeMock.mockResolvedValueOnce(fakeUser)

    const result = await fetchMe()

    expect(getMeMock).toHaveBeenCalledOnce()
    expect(localStorage.getItem("deqah_user")).toContain("a@b.com")
    expect(result.email).toBe("a@b.com")
  })

  it("refreshToken delegates to authApi.refreshToken and updates access token", async () => {
    // The api-client owns refresh-token retrieval (HttpOnly cookie); the
    // dashboard wrapper only forwards the call and re-persists the new
    // access token returned by the server.
    refreshTokenMock.mockResolvedValueOnce({
      accessToken: "newToken",
      refreshToken: "newRt",
      expiresIn: 900,
    })

    const result = await refreshToken()

    expect(refreshTokenMock).toHaveBeenCalledOnce()
    expect(setAccessTokenMock).toHaveBeenCalledWith("newToken")
    expect(result.accessToken).toBe("newToken")
  })

  it("refreshToken propagates errors from the api-client", async () => {
    refreshTokenMock.mockRejectedValueOnce(new Error("Refresh failed"))
    await expect(refreshToken()).rejects.toThrow("Refresh failed")
    expect(setAccessTokenMock).not.toHaveBeenCalled()
  })

  it("logoutApi delegates to authApi.logout and clears state", async () => {
    logoutMock.mockResolvedValueOnce(undefined)
    localStorage.setItem("deqah_user", "{}")

    await logoutApi()

    expect(logoutMock).toHaveBeenCalledOnce()
    expect(localStorage.getItem("deqah_user")).toBeNull()
    expect(setAccessTokenMock).toHaveBeenCalledWith(null)
  })

  it("logoutApi still clears state when API call fails", async () => {
    logoutMock.mockRejectedValueOnce(new Error("fail"))
    localStorage.setItem("deqah_user", "{}")

    await logoutApi()

    expect(localStorage.getItem("deqah_user")).toBeNull()
    expect(setAccessTokenMock).toHaveBeenCalledWith(null)
  })

  it("logout clears state without API call", () => {
    localStorage.setItem("deqah_user", "{}")
    logout()
    expect(localStorage.getItem("deqah_user")).toBeNull()
    expect(setAccessTokenMock).toHaveBeenCalledWith(null)
    expect(logoutMock).not.toHaveBeenCalled()
  })

  it("changePassword delegates to authApi.changePassword", async () => {
    changePasswordMock.mockResolvedValueOnce(undefined)
    await changePassword("oldPass", "newPass")
    expect(changePasswordMock).toHaveBeenCalledWith({
      currentPassword: "oldPass",
      newPassword: "newPass",
    })
  })

  it("getStoredUser returns null when no user stored", () => {
    expect(getStoredUser()).toBeNull()
  })

  it("getStoredUser returns parsed user when stored", () => {
    localStorage.setItem("deqah_user", JSON.stringify(fakeUser))
    expect(getStoredUser()).toEqual(fakeUser)
  })

  it("getStoredUser returns null for invalid JSON", () => {
    localStorage.setItem("deqah_user", "not-json")
    expect(getStoredUser()).toBeNull()
  })
})
