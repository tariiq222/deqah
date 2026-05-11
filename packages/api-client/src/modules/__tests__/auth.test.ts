import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { initClient } from '../../client'
import * as authApi from '../auth'
import type { AuthResponse, UserPayload } from '../../types/auth'

const fakeAccess = 'access.jwt'
const fakeRefresh = 'refresh.jwt'

const fakeUser: UserPayload = {
  id: 'usr_1',
  email: 'admin@deqah.app',
  name: 'Admin Owner',
  firstName: 'Admin',
  lastName: 'Owner',
  phone: null,
  gender: null,
  avatarUrl: null,
  isActive: true,
  role: 'OWNER',
  customRoleId: null,
  isSuperAdmin: false,
  permissions: ['booking:read'],
  organizationId: 'org_1',
  verticalSlug: null,
  onboardingCompletedAt: null,
  activeMembership: null,
}

const fakeAuth: AuthResponse = {
  accessToken: fakeAccess,
  refreshToken: fakeRefresh,
  expiresIn: 900,
  user: fakeUser,
}

let storedAccess: string | null = null
let onAuthFailure = vi.fn()

beforeEach(() => {
  storedAccess = null
  onAuthFailure = vi.fn()
  initClient({
    baseUrl: 'http://api.test',
    getAccessToken: () => storedAccess,
    // CR-9: getRefreshToken is deprecated; refresh token is now httpOnly cookie
    onTokenRefreshed: (a) => {
      storedAccess = a
    },
    onAuthFailure,
  })
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function mockJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('authApi.login', () => {
  it('POSTs /auth/login with email+password and unwraps {success,data} envelope', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      mockJsonResponse({ success: true, data: fakeAuth }),
    )

    const result = await authApi.login({
      email: 'admin@deqah.app',
      password: 'pw',
      hCaptchaToken: 'tok',
    })

    expect(result).toEqual(fakeAuth)

    const [url, init] = vi.mocked(fetch).mock.calls[0]!
    expect(url).toBe('http://api.test/auth/login')
    expect(init?.method).toBe('POST')
    expect(JSON.parse(init?.body as string)).toEqual({
      email: 'admin@deqah.app',
      password: 'pw',
      hCaptchaToken: 'tok',
    })
  })

  it('also accepts a flat (non-enveloped) response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockJsonResponse(fakeAuth))

    const result = await authApi.login({
      email: 'a@b.c',
      password: 'pw',
      hCaptchaToken: 'tok',
    })

    expect(result).toEqual(fakeAuth)
  })

  it('throws ApiError with status + message on failure', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      mockJsonResponse({ message: 'Bad credentials' }, 401),
    )

    await expect(
      authApi.login({ email: 'a@b.c', password: 'wrong', hCaptchaToken: 'tok' }),
    ).rejects.toMatchObject({ status: 401, message: 'Bad credentials' })
  })
})

describe('authApi.refreshToken', () => {
  it('POSTs /auth/refresh with empty body (CR-9: token is httpOnly cookie) and returns a TokenPair', async () => {
    const fakeTokenPair = {
      accessToken: 'new.access',
      expiresIn: 900,
    }
    vi.mocked(fetch).mockResolvedValueOnce(
      mockJsonResponse({ success: true, data: fakeTokenPair }),
    )

    const result = await authApi.refreshToken()

    expect(result.accessToken).toBe('new.access')
    expect(result.expiresIn).toBe(900)
    const [, init] = vi.mocked(fetch).mock.calls[0]!
    expect(init?.credentials).toBe('include')
    // CR-9: no refresh token in body — it's sent automatically as httpOnly cookie
    expect(JSON.parse(init?.body as string)).toEqual({})
  })
})

describe('authApi.getMe', () => {
  it('GETs /auth/me with bearer token from getAccessToken()', async () => {
    storedAccess = fakeAccess
    vi.mocked(fetch).mockResolvedValueOnce(
      mockJsonResponse({ success: true, data: fakeUser }),
    )

    const me = await authApi.getMe()

    expect(me).toEqual(fakeUser)
    const [, init] = vi.mocked(fetch).mock.calls[0]!
    const headers = init?.headers as Record<string, string>
    expect(headers.Authorization).toBe(`Bearer ${fakeAccess}`)
  })
})

describe('authApi.logout', () => {
  it('POSTs /auth/logout (no body required)', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 204 }))

    await authApi.logout()

    const [url, init] = vi.mocked(fetch).mock.calls[0]!
    expect(url).toBe('http://api.test/auth/logout')
    expect(init?.method).toBe('POST')
  })
})

describe('authApi.changePassword', () => {
  it('PATCHes /auth/password/change with current+new password', async () => {
    storedAccess = fakeAccess
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 204 }))

    await authApi.changePassword({
      currentPassword: 'old',
      newPassword: 'new',
    })

    const [url, init] = vi.mocked(fetch).mock.calls[0]!
    expect(url).toBe('http://api.test/auth/password/change')
    expect(init?.method).toBe('PATCH')
    expect(JSON.parse(init?.body as string)).toEqual({
      currentPassword: 'old',
      newPassword: 'new',
    })
  })
})
