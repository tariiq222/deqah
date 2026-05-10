import { getRefreshMutex, setRefreshMutex } from './refresh-mutex'

// Backend signals tenant suspension via 401 + this code in the error body.
// When detected, callers should clear local auth and redirect to root —
// the refresh-token loop is intentionally skipped (refreshing a suspended
// tenant just bounces back the same 401).
export const ORG_SUSPENDED_CODE = 'ORG_SUSPENDED'

export interface ClientConfig {
  baseUrl: string
  getAccessToken: () => string | null
  /** @deprecated CR-9: refresh token is now an httpOnly cookie; this callback is no longer invoked */
  getRefreshToken?: () => string | null
  onTokenRefreshed: (accessToken: string) => void
  onAuthFailure: () => void
  // Optional callback fired when the backend returns 401 + ORG_SUSPENDED.
  // Hosts (dashboard) typically clear local auth state and full-reload to
  // surface a banner. Admin app passes a no-op since suspension UX differs.
  onOrgSuspended?: () => void
}

let config: ClientConfig | null = null

export function initClient(cfg: ClientConfig): void {
  config = cfg
}

async function doRefresh(): Promise<string> {
  if (!config) throw new Error('api-client not initialized')
  // CR-9: refresh token is an httpOnly cookie (ck_refresh); credentials: 'include'
  // sends it automatically. No token in body — empty object for compatibility.
  const res = await fetch(`${config.baseUrl}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({}),
  })
  if (!res.ok) {
    config.onAuthFailure()
    throw new Error('Refresh failed')
  }
  const raw = (await res.json()) as unknown
  const data =
    raw && typeof raw === 'object' && 'success' in raw && 'data' in raw
      ? ((raw as { data: { accessToken: string } }).data)
      : (raw as { accessToken: string })
  config.onTokenRefreshed(data.accessToken)
  return data.accessToken
}

// Auth endpoints must NEVER trigger the 401-refresh flow:
// - /auth/login: a 401 means bad credentials, not an expired session
// - /auth/refresh: refresh failure should surface directly, not loop
// - /auth/logout: 401 here is meaningless and would mask the original error
const AUTH_ENDPOINTS_NO_RETRY = ['/auth/login', '/auth/refresh', '/auth/logout']

function isAuthEndpoint(path: string): boolean {
  return AUTH_ENDPOINTS_NO_RETRY.some((suffix) => path.endsWith(suffix))
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
  retried = false,
): Promise<T> {
  if (!config) throw new Error('api-client not initialized')

  const token = config.getAccessToken()
  // FormData (multipart) MUST set its own Content-Type with the boundary —
  // omit the JSON CT we'd otherwise default to.
  const isMultipart =
    typeof FormData !== 'undefined' && options.body instanceof FormData
  const headers: Record<string, string> = isMultipart
    ? { ...(options.headers as Record<string, string>) }
    : {
        'Content-Type': 'application/json',
        ...(options.headers as Record<string, string>),
      }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${config.baseUrl}${path}`, { ...options, headers })

  if (res.status === 401 && !retried && !isAuthEndpoint(path)) {
    // Tenant-suspended responses must NOT trigger the refresh loop —
    // the refresh would just produce another 401. Surface immediately
    // and let the host (dashboard) clear local state + redirect.
    const peek = await peekErrorBody(res)
    if (peek.code === ORG_SUSPENDED_CODE) {
      config.onOrgSuspended?.()
      throw new ApiError(401, peek.message, peek.body, ORG_SUSPENDED_CODE)
    }

    let mutex = getRefreshMutex()
    if (!mutex) {
      mutex = doRefresh()
      // setRefreshMutex attaches the unhandled-rejection sentinel — see
      // refresh-mutex.ts. Awaiters of `mutex` below still observe the
      // original rejection.
      setRefreshMutex(mutex)
    }
    await mutex
    return apiRequest<T>(path, options, true)
  }

  if (!res.ok) {
    const peek = await peekErrorBody(res)
    throw new ApiError(res.status, peek.message, peek.body, peek.code)
  }

  if (res.status === 204) return undefined as T
  const json = (await res.json()) as unknown
  // Backend wraps every response as { success: true, data: T }.
  // Unwrap transparently so callers receive the raw T.
  if (
    json &&
    typeof json === 'object' &&
    'success' in json &&
    'data' in json
  ) {
    return (json as { data: T }).data
  }
  return json as T
}

interface PeekedError {
  body: unknown
  code: string
  message: string
}

// Mirror dashboard's parseErrorBody — handle the four NestJS shapes:
//   { statusCode, message, error: string }              ← default
//   { statusCode, message: string[], error }            ← validation
//   { statusCode, message: { error, message }, error }  ← custom conflict
//   { error: { code, message } }                        ← legacy envelope
async function peekErrorBody(res: Response): Promise<PeekedError> {
  const body = (await res
    .clone()
    .json()
    .catch(() => ({}))) as Record<string, unknown>
  const nestedMessage =
    body && typeof body.message === 'object' && body.message !== null && !Array.isArray(body.message)
      ? (body.message as { error?: string; message?: string })
      : null
  const errorObj =
    body && typeof body.error === 'object' && body.error !== null
      ? (body.error as { code?: string; message?: string })
      : null
  const code: string =
    nestedMessage?.error ??
    errorObj?.code ??
    (typeof body.error === 'string' ? (body.error as string) : undefined) ??
    (typeof body.message === 'string' ? (body.message as string) : undefined) ??
    'UNKNOWN'
  const rawMessage =
    nestedMessage?.message ??
    errorObj?.message ??
    (Array.isArray(body.message) ? (body.message as string[]).join(', ') : (body.message as string | undefined))
  const message = rawMessage ?? res.statusText
  return { body, code, message }
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body: unknown,
    public readonly code: string = 'UNKNOWN',
  ) {
    super(message)
    this.name = 'ApiError'
  }
}
