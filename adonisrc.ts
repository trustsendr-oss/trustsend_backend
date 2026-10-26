import { indexEntities } from '@adonisjs/core'
import { defineConfig } from '@adonisjs/core/app'
import { ListLoader } from '@adonisjs/core/ace'
import { generateRegistry } from '@tuyau/core/hooks'

export default defineConfig({
  /*
  |--------------------------------------------------------------------------
  | Experimental flags
  |--------------------------------------------------------------------------
  |
  | The following features will be enabled by default in the next major release
  | of AdonisJS. You can opt into them today to avoid any breaking changes
  | during upgrade.
  |
  */
  experimental: {},

  /*
  |--------------------------------------------------------------------------
  | Commands
  |--------------------------------------------------------------------------
  |
  | List of ace commands to register from packages. The application commands
  | will be scanned automatically from the "./commands" directory.
  |
  */
  commands: [
    () => import('@adonisjs/core/commands'),
    () => import('@adonisjs/lucid/commands'),
    () => import('@adonisjs/session/commands'),
    () =>
      Promise.all([
        import('#commands/reconcile_mobile_money'),
        import('#commands/deliver_pending_webhooks'),
        import('#commands/expire_cash_outs'),
        import('#commands/expire_remittances'),
        import('#commands/import_crypto_deposit'),
        import('#commands/reconcile_crypto_deposits'),
      ]).then(
        ([reconcile, deliver, expireCashOuts, expireRemittances, importCryptoDeposit, reconcileCrypto]) =>
          new ListLoader([
            reconcile.default,
            deliver.default,
            expireCashOuts.default,
            expireRemittances.default,
            importCryptoDeposit.default,
            reconcileCrypto.default,
          ])
      ),
  ],

  /*
  |--------------------------------------------------------------------------
  | Service providers
  |--------------------------------------------------------------------------
  |
  | List of service providers to import and register when booting the
  | application
  |
  */
  providers: [
    () => import('@adonisjs/core/providers/app_provider'),
    () => import('@adonisjs/core/providers/hash_provider'),
    {
      file: () => import('@adonisjs/core/providers/repl_provider'),
      environment: ['repl', 'test'],
    },
    () => import('@adonisjs/core/providers/vinejs_provider'),
    () => import('@adonisjs/session/session_provider'),
    () => import('@adonisjs/shield/shield_provider'),
    () => import('@adonisjs/lucid/database_provider'),
    () => import('@adonisjs/cors/cors_provider'),
    () => import('@adonisjs/auth/auth_provider'),
    () => import('@adonisjs/mail/mail_provider'),
    () => import('@adonisjs/transmit/transmit_provider'),
    () => import('#providers/api_provider'),
  ],

  /*
  |--------------------------------------------------------------------------
  | Preloads
  |--------------------------------------------------------------------------
  |
  | List of modules to import before starting the application.
  |
  */
  preloads: [
    () => import('#start/pg_types'),
    () => import('#start/routes'),
    () => import('#start/kernel'),
    () => import('#start/validator'),
    () => import('#start/transmit'),
  ],

  /*
  |--------------------------------------------------------------------------
  | Tests
  |--------------------------------------------------------------------------
  |
  | List of test suites to organize tests by their type. Feel free to remove
  | and add additional suites.
  |
  */
  tests: {
    suites: [
      {
        files: ['tests/unit/**/*.spec.{ts,js}'],
        name: 'unit',
        timeout: 2000,
      },
      {
        files: ['tests/functional/**/*.spec.{ts,js}'],
        name: 'functional',
        timeout: 30000,
      },
    ],
    forceExit: false,
  },

  /*
  |--------------------------------------------------------------------------
  | Metafiles
  |--------------------------------------------------------------------------
  |
  | A collection of files you want to copy to the build folder when creating
  | the production build.
  |
  */
  metaFiles: [
    // Wallet logos read from disk at runtime (assets_controller.ts, currency_logo_service.ts)
    { pattern: 'resources/flags/**', reloadServer: false },
    // App icon embedded in account-holder emails (email_layout.ts, BRAND_ICON_PATH)
    { pattern: 'resources/brand/**', reloadServer: false },
  ],

  hooks: {
    init: [
      indexEntities({
        transformers: { enabled: true },
      }),
      generateRegistry(),
    ],
  },
})
