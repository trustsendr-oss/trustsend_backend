import type { AuthProvider } from 'react-admin'
import {
  ApiError,
  apiFetch,
  clearSession,
  getStoredUser,
  setCsrfToken,
  setSession,
} from './httpClient'

interface SessionUser {
  id: number
  email: string
  full_name: string
}

interface FullSessionResponse {
  user: SessionUser
  csrf_token: string
  expires_in: number
  must_change_password: boolean
  mfa_enabled: boolean
  mfa_required: false
}

interface PendingSessionResponse {
  mfa_required: true
  csrf_token: string
  expires_in: number
}

export interface InternalSessionState extends SessionUser {
  must_change_password: boolean
  mfa_enabled: boolean
  mfa_pending: boolean
}

export type SignInResult =
  | { status: 'mfa_required' }
  | { status: 'authenticated'; mustChangePassword: boolean; mfaEnabled: boolean }

/** Backend refusal codes meaning "this session is not a complete, usable admin session". */
const INCOMPLETE_SESSION_CODES = new Set([
  'MFA_REQUIRED',
  'PASSWORD_CHANGE_REQUIRED',
  'MFA_ENROLLMENT_REQUIRED',
  'ACCOUNT_INACTIVE',
])

export function isSessionReady(state: InternalSessionState): boolean {
  return !state.mfa_pending && !state.must_change_password && state.mfa_enabled
}

/**
 * Each step of the staff sign-in, driven by LoginPage: password, then the TOTP code when 2FA is
 * enabled, then — for a new or reset account — a password change and authenticator enrolment.
 * The access token itself lives in an httpOnly cookie set by the backend (auth_cookie_service.ts).
 */
export const internalAuth = {
  async signIn(email: string, password: string): Promise<SignInResult> {
    const result = await apiFetch<FullSessionResponse | PendingSessionResponse>(
      '/internal/auth/login',
      {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }
    )

    setCsrfToken(result.csrf_token)

    if (!('user' in result)) {
      return { status: 'mfa_required' }
    }

    setSession(result.user)
    return {
      status: 'authenticated',
      mustChangePassword: result.must_change_password,
      mfaEnabled: result.mfa_enabled,
    }
  },

  async verifyMfa(code: string): Promise<{ mustChangePassword: boolean }> {
    const result = await apiFetch<FullSessionResponse>('/internal/auth/mfa/verify', {
      method: 'POST',
      body: JSON.stringify({ code }),
    })
    // Full session = new cookies, new CSRF token
    setCsrfToken(result.csrf_token)
    setSession(result.user)
    return { mustChangePassword: result.must_change_password }
  },

  changePassword(currentPassword: string, newPassword: string) {
    return apiFetch('/internal/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
    })
  },

  setupMfa() {
    return apiFetch<{ secret: string; otpauth_url: string }>('/internal/auth/mfa/setup', {
      method: 'POST',
    })
  },

  enableMfa(code: string) {
    return apiFetch('/internal/auth/mfa/enable', { method: 'POST', body: JSON.stringify({ code }) })
  },

  me() {
    return apiFetch<InternalSessionState>('/internal/auth/me')
  },

  async cancel() {
    try {
      await apiFetch('/internal/auth/logout', { method: 'POST' })
    } catch {
      // session already gone — nothing more to do server-side
    } finally {
      clearSession()
    }
  },
}

export const authProvider: AuthProvider = {
  /** Called by LoginPage once every sign-in step is done — only confirms the session is complete. */
  async login() {
    const state = await internalAuth.me()
    if (!isSessionReady(state)) {
      throw new Error('Sign-in is not complete')
    }
    setSession({ id: state.id, email: state.email, full_name: state.full_name })
  },

  async logout() {
    await internalAuth.cancel()
  },

  async checkError(error) {
    const status = error?.status
    const code =
      error instanceof ApiError ? (error.body as { code?: string } | null)?.code : undefined

    if (status === 401 || (status === 403 && code && INCOMPLETE_SESSION_CODES.has(code))) {
      clearSession()
      throw new Error('Session expired')
    }
  },

  async checkAuth() {
    try {
      const state = await internalAuth.me()
      if (!isSessionReady(state)) {
        throw new Error('Sign-in is not complete')
      }
      setSession({ id: state.id, email: state.email, full_name: state.full_name })
    } catch {
      clearSession()
      throw new Error('Not authenticated')
    }
  },

  async getPermissions() {
    return Promise.resolve()
  },

  async getIdentity() {
    const user = getStoredUser()
    if (!user) throw new Error('Not authenticated')
    return {
      id: user.id,
      fullName: user.full_name,
      avatar: undefined,
    }
  },
}
