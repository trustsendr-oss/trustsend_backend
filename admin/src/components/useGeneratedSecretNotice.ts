import { useNotify } from 'react-admin'

/**
 * Several admin create/reset endpoints (agents, businesses, internal-users) return a
 * one-time-only generated password in the response body when the caller didn't supply one — it
 * can never be fetched again afterwards. This surfaces it as a long-lived notification instead
 * of letting it silently disappear once the create/redirect happens.
 */
export function useGeneratedSecretNotice() {
  const notify = useNotify()
  return (data: { generated_password?: string; new_password?: string; message?: string }) => {
    const secret = data.generated_password || data.new_password
    if (secret) {
      notify(`Generated password: ${secret} — store it now, it cannot be shown again.`, {
        type: 'warning',
        autoHideDuration: 30000,
      })
    }
  }
}
