import type InternalUser from '#models/internal_user'

/**
 * Staff sessions come in two strengths, carried as access-token abilities:
 * - a full session (`['*']`), minted after the password AND, when enabled, the TOTP code;
 * - a pending session (`['mfa:pending']`), minted after the password only, which can do nothing
 *   but submit the second factor (internal_auth_controller.ts verifyMfa) or log out.
 */
export const INTERNAL_FULL_ABILITY = 'internal:full'
export const INTERNAL_MFA_PENDING_ABILITY = 'mfa:pending'

export function hasFullInternalSession(user: InternalUser): boolean {
  return user.currentAccessToken?.allows(INTERNAL_FULL_ABILITY) ?? false
}
