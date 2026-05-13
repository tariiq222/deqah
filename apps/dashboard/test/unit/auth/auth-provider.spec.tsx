/**
 * AuthProvider — unit tests
 *
 * Covers:
 *  - Login: sets user + schedules refresh + persists to localStorage
 *  - Logout: clears user + localStorage + cancels refresh timer
 *  - Session restore on mount: refreshToken → fetchMe → user state
 *  - Session expired on mount: refresh fails → user null
 *  - canDo() permission checking
 *  - isAuthenticated flag
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { AuthProvider, useAuth } from '@/components/providers/auth-provider'

// ---------------------------------------------------------------------------
// Mock lib/api/auth so no real network calls are made
// ---------------------------------------------------------------------------

const mockLogin = vi.fn()
const mockLogoutApi = vi.fn()
const mockFetchMe = vi.fn()
const mockRefreshToken = vi.fn()

vi.mock('@/lib/api/auth', () => ({
  login: (...args: unknown[]) => mockLogin(...args),
  logoutApi: (...args: unknown[]) => mockLogoutApi(...args),
  fetchMe: (...args: unknown[]) => mockFetchMe(...args),
  refreshToken: (...args: unknown[]) => mockRefreshToken(...args),
}))

vi.mock('@/lib/api', () => ({
  setAccessToken: vi.fn(),
  getAccessToken: vi.fn(() => null),
}))

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockUser = {
  id: 'user-1',
  email: 'admin@deqah-test.com',
  firstName: 'Admin',
  lastName: 'User',
  phone: null,
  gender: null,
  roles: [{ id: 'r1', name: 'Admin', slug: 'admin' }],
  permissions: ['bookings:read', 'bookings:write', 'clients:*'],
  // SaaS-06 — backend resolves these from the user's active membership.
  organizationId: 'org-1',
  verticalSlug: 'clinic',
}

const mockAuthResponse = {
  user: mockUser,
  accessToken: 'mock-access-token',
  expiresIn: 900,
}

// ---------------------------------------------------------------------------
// Helper: render a consumer component inside AuthProvider
// ---------------------------------------------------------------------------

function TestConsumer() {
  const { user, loading, isAuthenticated, canDo, login, logout } = useAuth()
  return (
    <div>
      <div data-testid="loading">{loading ? 'loading' : 'ready'}</div>
      <div data-testid="user">{user ? user.email : 'none'}</div>
      <div data-testid="authenticated">{isAuthenticated ? 'yes' : 'no'}</div>
      <div data-testid="can-bookings-read">{canDo('bookings', 'read') ? 'yes' : 'no'}</div>
      <div data-testid="can-invoices-delete">{canDo('invoices', 'delete') ? 'yes' : 'no'}</div>
      <div data-testid="can-clients-anything">{canDo('clients', 'anything') ? 'yes' : 'no'}</div>
      <button onClick={() => login('test@test.com', 'Pass123!')}>Login</button>
      <button onClick={() => logout()}>Logout</button>
    </div>
  )
}

function renderWithProvider() {
  return render(
    <AuthProvider>
      <TestConsumer />
    </AuthProvider>,
  )
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AuthProvider', () => {
  beforeEach(() => {
    mockLogin.mockReset()
    mockLogoutApi.mockReset()
    mockFetchMe.mockReset()
    mockRefreshToken.mockReset()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  // =========================================================================
  // Session restore on mount
  // =========================================================================

  describe('session restore on mount', () => {
    it('should set user when refresh + fetchMe succeed', async () => {
      mockRefreshToken.mockResolvedValue(mockAuthResponse)
      mockFetchMe.mockResolvedValue(mockUser)

      renderWithProvider()

      expect(screen.getByTestId('loading').textContent).toBe('loading')

      await waitFor(() =>
        expect(screen.getByTestId('loading').textContent).toBe('ready'),
      )

      expect(screen.getByTestId('user').textContent).toBe(mockUser.email)
      expect(screen.getByTestId('authenticated').textContent).toBe('yes')
    })

    it('should set user null when refresh fails (expired session)', async () => {
      mockRefreshToken.mockRejectedValue(new Error('Session expired'))

      renderWithProvider()

      await waitFor(() =>
        expect(screen.getByTestId('loading').textContent).toBe('ready'),
      )

      expect(screen.getByTestId('user').textContent).toBe('none')
      expect(screen.getByTestId('authenticated').textContent).toBe('no')
    })

    it('should remove deqah_user from localStorage on failed restore', async () => {
      localStorage.setItem('deqah_user', JSON.stringify(mockUser))
      mockRefreshToken.mockRejectedValue(new Error('expired'))

      renderWithProvider()

      await waitFor(() =>
        expect(screen.getByTestId('loading').textContent).toBe('ready'),
      )

      expect(localStorage.getItem('deqah_user')).toBeNull()
    })
  })

  // =========================================================================
  // Login
  // =========================================================================

  describe('login()', () => {
    it('should set user and isAuthenticated after successful login', async () => {
      // Start with no session
      mockRefreshToken.mockRejectedValue(new Error('no session'))
      mockLogin.mockResolvedValue(mockAuthResponse)

      renderWithProvider()
      await waitFor(() =>
        expect(screen.getByTestId('loading').textContent).toBe('ready'),
      )

      await act(async () => {
        await userEvent.click(screen.getByText('Login'))
      })

      expect(screen.getByTestId('user').textContent).toBe(mockUser.email)
      expect(screen.getByTestId('authenticated').textContent).toBe('yes')
    })

    it('should call apiLogin with correct credentials', async () => {
      mockRefreshToken.mockRejectedValue(new Error('no session'))
      mockLogin.mockResolvedValue(mockAuthResponse)

      renderWithProvider()
      await waitFor(() =>
        expect(screen.getByTestId('loading').textContent).toBe('ready'),
      )

      await act(async () => {
        await userEvent.click(screen.getByText('Login'))
      })

      expect(mockLogin).toHaveBeenCalledWith('test@test.com', 'Pass123!')
    })
  })

  // =========================================================================
  // Logout
  // =========================================================================

  describe('logout()', () => {
    it('should clear user and isAuthenticated after logout', async () => {
      mockRefreshToken.mockResolvedValue(mockAuthResponse)
      mockFetchMe.mockResolvedValue(mockUser)
      mockLogoutApi.mockResolvedValue(undefined)

      renderWithProvider()
      await waitFor(() =>
        expect(screen.getByTestId('user').textContent).toBe(mockUser.email),
      )

      await act(async () => {
        await userEvent.click(screen.getByText('Logout'))
      })

      expect(screen.getByTestId('user').textContent).toBe('none')
      expect(screen.getByTestId('authenticated').textContent).toBe('no')
    })

    it('should call logoutApi on logout', async () => {
      mockRefreshToken.mockResolvedValue(mockAuthResponse)
      mockFetchMe.mockResolvedValue(mockUser)
      mockLogoutApi.mockResolvedValue(undefined)

      renderWithProvider()
      await waitFor(() =>
        expect(screen.getByTestId('user').textContent).toBe(mockUser.email),
      )

      await act(async () => {
        await userEvent.click(screen.getByText('Logout'))
      })

      expect(mockLogoutApi).toHaveBeenCalledOnce()
    })
  })

  // =========================================================================
  // canDo() permission checking
  // =========================================================================

  describe('canDo()', () => {
    beforeEach(async () => {
      mockRefreshToken.mockResolvedValue(mockAuthResponse)
      mockFetchMe.mockResolvedValue(mockUser)
    })

    it('should return true for exact permission match', async () => {
      renderWithProvider()
      await waitFor(() =>
        expect(screen.getByTestId('can-bookings-read').textContent).toBe('yes'),
      )
    })

    it('should return false for permission not in list', async () => {
      renderWithProvider()
      await waitFor(() =>
        expect(screen.getByTestId('can-invoices-delete').textContent).toBe('no'),
      )
    })

    it('should return true for wildcard module permission (clients:*)', async () => {
      renderWithProvider()
      await waitFor(() =>
        expect(screen.getByTestId('can-clients-anything').textContent).toBe('yes'),
      )
    })
  })

  // =========================================================================
  // Auto-refresh scheduling
  // =========================================================================

  describe('scheduleRefresh()', () => {
    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true })
    })
    afterEach(() => {
      vi.useRealTimers()
    })

    it('should call refreshToken again after timer fires', async () => {
      mockRefreshToken
        .mockResolvedValueOnce(mockAuthResponse) // mount restore
        .mockResolvedValueOnce(mockAuthResponse) // scheduled refresh
      mockFetchMe.mockResolvedValue(mockUser)

      renderWithProvider()
      await waitFor(() =>
        expect(screen.getByTestId('loading').textContent).toBe('ready'),
      )

      // expiresIn=900 → delay = (900-120)*1000 = 780000ms
      await act(async () => {
        vi.advanceTimersByTime(780_000)
        await Promise.resolve()
      })

      expect(mockRefreshToken).toHaveBeenCalledTimes(2)
    })

    it('should clear user when scheduled refresh fails', async () => {
      mockRefreshToken
        .mockResolvedValueOnce(mockAuthResponse) // mount restore
        .mockRejectedValueOnce(new Error('expired')) // scheduled refresh
      mockFetchMe.mockResolvedValue(mockUser)

      renderWithProvider()
      await waitFor(() =>
        expect(screen.getByTestId('user').textContent).toBe(mockUser.email),
      )

      await act(async () => {
        vi.advanceTimersByTime(780_000)
        await Promise.resolve()
      })

      await waitFor(() =>
        expect(screen.getByTestId('user').textContent).toBe('none'),
      )
    })
  })
})
