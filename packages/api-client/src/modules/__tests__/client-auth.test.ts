import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  setClientBaseUrl,
  initClientAuth,
  clientLogin,
  clientRegister,
  clientRefresh,
  clientLogout,
  clientResetPassword,
} from '../client-auth'

const fakeAuth = {
  accessToken: 'a.t',
  refreshToken: 'r.t',
  clientId: 'cl_1',
}

let storedRefresh: string | null = null

beforeEach(() => {
  storedRefresh = null
  setClientBaseUrl('http://api.test')
  initClientAuth({ getRefreshToken: () => storedRefresh })
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('clientLogin', () => {
  it('POSTs /public/auth/login and unwraps the envelope', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ success: true, data: fakeAuth }),
    )

    const result = await clientLogin({
      email: 'a@b.c',
      password: 'pw',
      hCaptchaToken: 'tok',
    })

    expect(result).toEqual(fakeAuth)
    const [url, init] = vi.mocked(fetch).mock.calls[0]!
    expect(url).toBe('http://api.test/public/auth/login')
    expect(init?.method).toBe('POST')
    expect(JSON.parse(init?.body as string)).toEqual({
      email: 'a@b.c',
      password: 'pw',
      hCaptchaToken: 'tok',
    })
    expect((init as RequestInit).credentials).toBe('include')
  })

  it('throws an Error with backend message on failure', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ message: 'Bad creds' }, 401),
    )
    await expect(
      clientLogin({ email: 'a@b.c', password: 'wrong', hCaptchaToken: 'tok' }),
    ).rejects.toThrow('Bad creds')
  })
})

describe('clientRegister', () => {
  it('POSTs /public/auth/register with otpSessionToken bearer + password+name body', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ success: true, data: fakeAuth }),
    )

    await clientRegister({
      otpSessionToken: 'otp.session',
      password: 'pw',
      name: 'Alice',
      hCaptchaToken: 'tok',
    })

    const [url, init] = vi.mocked(fetch).mock.calls[0]!
    expect(url).toBe('http://api.test/public/auth/register')
    const headers = init?.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer otp.session')
    expect(JSON.parse(init?.body as string)).toEqual({
      password: 'pw',
      name: 'Alice',
      hCaptchaToken: 'tok',
    })
  })
})

describe('clientRefresh', () => {
  it('POSTs /public/auth/refresh with refresh token from initClientAuth getter', async () => {
    storedRefresh = 'stored.rt'
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({
        success: true,
        data: { accessToken: 'new.a', refreshToken: 'new.r' },
      }),
    )

    const result = await clientRefresh()

    expect(result).toEqual({ accessToken: 'new.a', refreshToken: 'new.r' })
    const [url, init] = vi.mocked(fetch).mock.calls[0]!
    expect(url).toBe('http://api.test/public/auth/refresh')
    expect(JSON.parse(init?.body as string)).toEqual({ refreshToken: 'stored.rt' })
  })
})

describe('clientLogout', () => {
  it('POSTs /public/auth/logout with refresh token', async () => {
    storedRefresh = 'stored.rt'
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 204 }))

    await clientLogout()

    const [url, init] = vi.mocked(fetch).mock.calls[0]!
    expect(url).toBe('http://api.test/public/auth/logout')
    expect(JSON.parse(init?.body as string)).toEqual({ refreshToken: 'stored.rt' })
  })
})

describe('clientResetPassword', () => {
  it('POSTs /public/auth/reset-password with sessionToken + newPassword', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 204 }))

    await clientResetPassword({
      sessionToken: 'reset.tok',
      newPassword: 'newPw',
      hCaptchaToken: 'tok',
    })

    const [url, init] = vi.mocked(fetch).mock.calls[0]!
    expect(url).toBe('http://api.test/public/auth/reset-password')
    expect(JSON.parse(init?.body as string)).toEqual({
      sessionToken: 'reset.tok',
      newPassword: 'newPw',
      hCaptchaToken: 'tok',
    })
  })
})
