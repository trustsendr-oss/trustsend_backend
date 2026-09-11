import type { AuthProvider } from 'react-admin'
import { apiFetch, clearSession, getStoredUser, setSession } from './httpClient'

interface LoginResponse {
  user: { id: number; email: string; full_name: string }
  csrf_token: string
  expires_in: number
  must_change_password: boolean
}

/**
 * Talks to POST /api/v1/internal/auth/login — the only guard that can reach agents, businesses,
 * users, plans, kyc, disputes and internal-users admin endpoints (see start/routes.ts,
 * middleware.auth({ guards: ['internal'] })). The access token itself lives in an httpOnly cookie
 * set by the backend (auth_cookie_service.ts), never in anything this code can read — checkAuth
 * asks the server (GET /internal/auth/me) instead of checking local state, since there's no
 * token here to check locally anymore.
 */
export const authProvider: AuthProvider = {
  async login({ username, password }) {
    const result = await apiFetch<LoginResponse>('/internal/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: username, password }),
    })
    setSession(result.user)
    return Promise.resolve()
  },

  async logout() {
    try {
      await apiFetch('/internal/auth/logout', { method: 'POST' })
    } catch {
      // cookie already invalid/expired — nothing more to do server-side
    } finally {
      clearSession()
    }
  },

  async checkError(error) {
    const status = error?.status
    if (status === 401 || status === 403) {
      clearSession()
      throw new Error('Session expired')
    }
  },

  async checkAuth() {
    try {
      const user = await apiFetch<{ id: number; email: string; full_name: string }>('/internal/auth/me')
      setSession(user)
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
