import env from '#start/env'

const LIVE_KEY_PREFIXES = ['ts_live_', 'biz_live_']
const SANDBOX_KEY_PREFIXES = ['ts_sandbox_', 'biz_sandbox_']

/**
 * Whether this deployment is the public sandbox (APP_MODE=sandbox, see start/env.ts) — the
 * integration environment business clients' developers sign up to on their own, separate from
 * production (own database, PawaPay/Payscribe sandbox accounts). start/env.ts refuses to boot a
 * sandbox wired to a production provider, so nothing gated on isEnabled() can reach real money.
 *
 * Read from env on every call rather than cached at import, so tests can flip it with env.set().
 */
export class SandboxMode {
  static isEnabled(): boolean {
    return env.get('APP_MODE', 'production') === 'sandbox'
  }

  /** Prefix for newly issued business API keys — tells a developer at a glance which environment a key belongs to. */
  static apiKeyPrefix(): string {
    return this.isEnabled() ? 'ts_sandbox_' : 'ts_live_'
  }

  /**
   * Whether `presentedKey` visibly belongs to the OTHER environment (a sandbox key sent to
   * production, or the reverse). Such a key can never verify here — each environment has its own
   * database — so this only exists to give the caller a useful error instead of a bare 401. The
   * legacy biz_ prefixes are recognised too, since keys issued before the ts_ rename still exist.
   */
  static isKeyForOtherEnvironment(presentedKey: string): boolean {
    const otherPrefixes = this.isEnabled() ? LIVE_KEY_PREFIXES : SANDBOX_KEY_PREFIXES
    return otherPrefixes.some((prefix) => presentedKey.startsWith(prefix))
  }
}
