import env from '#start/env'
import app from '@adonisjs/core/services/app'
import { defineConfig, syncDestination, targets } from '@adonisjs/core/logger'

const loggerConfig = defineConfig({
  /**
   * Default logger name used by ctx.logger and app logger calls.
   */
  default: 'app',

  loggers: {
    app: {
      /**
       * Toggle this logger on/off.
       */
      enabled: true,

      /**
       * Logger name shown in log records.
       */
      name: env.get('APP_NAME'),

      /**
       * Minimum level to output (trace, debug, info, warn, error, fatal).
       */
      level: env.get('LOG_LEVEL'),

      /**
       * Redact sensitive fields wherever a full request/body/user object is logged, so a PIN,
       * password, or bearer token never lands in log output even if some future call site logs
       * more context than intended.
       */
      redact: {
        paths: [
          'password',
          'pin',
          'current_pin',
          'new_pin',
          'pinHash',
          'pin_hash',
          '*.password',
          '*.pin',
          '*.pinHash',
          '*.pin_hash',
          'req.headers.authorization',
          'req.headers.cookie',
          'headers.authorization',
          'headers.cookie',
        ],
        censor: '[REDACTED]',
      },

      /**
       * Use sync destination in non-production for immediate flush.
       */
      destination: !app.inProduction ? await syncDestination() : undefined,

      /**
       * Configure where logs are written.
       */
      transport: {
        targets: [targets.file({ destination: 1 })],
      },
    },
  },
})

export default loggerConfig

/**
 * Inferring types for the list of loggers you have configured
 * in your application.
 */
declare module '@adonisjs/core/types' {
  export interface LoggersList extends InferLoggers<typeof loggerConfig> {}
}
