/*
|--------------------------------------------------------------------------
| Environment variables service
|--------------------------------------------------------------------------
|
| The `Env.create` method creates an instance of the Env service. The
| service validates the environment variables and also cast values
| to JavaScript data types.
|
*/

import { Env } from '@adonisjs/core/env'

const env = await Env.create(new URL('../', import.meta.url), {
  // Node
  NODE_ENV: Env.schema.enum(['development', 'production', 'test'] as const),
  PORT: Env.schema.number(),
  HOST: Env.schema.string({ format: 'host' }),
  LOG_LEVEL: Env.schema.string(),

  // Which platform this deployment IS — distinct from NODE_ENV (a sandbox runs with
  // NODE_ENV=production too). 'sandbox' is the public integration environment for business
  // clients' developers: self-service signup is auto-approved and plan gating is lifted (see
  // app/services/sandbox/sandbox_mode.ts). Defaults to 'production' so a deployment that forgets
  // to set it fails closed — no auto-approval — rather than open.
  APP_MODE: Env.schema.enum.optional(['sandbox', 'production'] as const),

  // App
  APP_KEY: Env.schema.secret(),
  APP_URL: Env.schema.string({ format: 'url', tld: false }),

  // Session
  SESSION_DRIVER: Env.schema.enum(['cookie', 'memory', 'database'] as const),

  // CORS — comma-separated exact origins allowed to make credentialed cross-origin requests
  // (admin panel, business dashboard). Required in production once cookie-based sessions are in
  // use (config/cors.ts) — cookies + credentials never work with a wildcard origin.
  CORS_ALLOWED_ORIGINS: Env.schema.string.optional(),

  // Database
  DB_CONNECTION: Env.schema.enum(['sqlite', 'pg'] as const),
  DB_HOST: Env.schema.string.optional({ format: 'host' }),
  DB_PORT: Env.schema.number.optional(),
  DB_USER: Env.schema.string.optional(),
  DB_PASSWORD: Env.schema.string.optional(),
  DB_DATABASE: Env.schema.string.optional(),

  // Redis
  REDIS_HOST: Env.schema.string.optional({ format: 'host' }),
  REDIS_PORT: Env.schema.number.optional(),
  REDIS_PASSWORD: Env.schema.string.optional(),

  // Encryption
  VAULT_ENABLED: Env.schema.boolean.optional(),
  VAULT_ADDR: Env.schema.string.optional(),
  VAULT_TOKEN: Env.schema.string.optional(),
  // Required at boot, not just at first use: CryptoService (KYC documents, PII fields) throws
  // otherwise only when a request first needs it — i.e. in production, on someone's real KYC
  // submission. Fail fast on startup instead.
  ENCRYPTION_KEY: Env.schema.string(),

  // Mobile Money (PawaPay)
  PAWAPAY_ENV: Env.schema.enum.optional(['sandbox', 'production'] as const),
  PAWAPAY_API_TOKEN: Env.schema.string.optional(),

  // Card issuing (Payscribe)
  PAYSCRIBE_ENV: Env.schema.enum.optional(['sandbox', 'production'] as const),
  PAYSCRIBE_API_TOKEN: Env.schema.string.optional(),
  // 64-char hex — decrypts secure_details on card create/get/replace responses (AES-256-GCM).
  // Separate keys per environment on Payscribe's side; only one is active here at a time.
  PAYSCRIBE_MERCHANT_HASH_KEY: Env.schema.string.optional(),
  // Verifies X-Payscribe-Signature on inbound card webhooks (HMAC-SHA256 of the raw body).
  PAYSCRIBE_WEBHOOK_SECRET: Env.schema.string.optional(),
  CARD_ISSUANCE_FEE_PERCENT: Env.schema.string.optional(),
  CARD_TOPUP_FEE_PERCENT: Env.schema.string.optional(),

  // Exchange rates for currency swaps (defaults to ExchangeRate-API open access, USD base)
  FX_RATES_URL: Env.schema.string.optional(),

  // Mail (Namecheap Private Email via SMTP — see config/mail.ts). Required, not optional: like
  // ENCRYPTION_KEY above, fail fast at boot if these are missing rather than only discovering it
  // when the first PIN-reset/notification email silently fails to send in production.
  SMTP_HOST: Env.schema.string({ format: 'host' }),
  SMTP_PORT: Env.schema.number(),
  SMTP_USERNAME: Env.schema.string(),
  SMTP_PASSWORD: Env.schema.secret(),
  MAIL_FROM_ADDRESS: Env.schema.string(),
  MAIL_FROM_NAME: Env.schema.string(),
})

// A sandbox hands out auto-approved accounts to anyone who signs up — pointed at a production
// provider, that would be real mobile money and real cards for unvetted strangers. Refuse to boot
// rather than trust every deployment's env to be right. (Unset provider envs default to sandbox,
// see config/mobile_money.ts and config/cards.ts.) The reverse — production mode on sandbox
// providers — is just a local dev setup, so it stays allowed.
if (env.get('APP_MODE') === 'sandbox') {
  const productionProviders = (['PAWAPAY_ENV', 'PAYSCRIBE_ENV'] as const).filter(
    (key) => env.get(key) === 'production'
  )
  if (productionProviders.length > 0) {
    throw new Error(
      `APP_MODE=sandbox cannot run against production providers (${productionProviders.join(', ')}=production)`
    )
  }
}

export default env
