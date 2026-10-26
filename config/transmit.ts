import app from '@adonisjs/core/services/app'
import { defineConfig } from '@adonisjs/transmit'
import { redis } from '@adonisjs/transmit/transports/redis'
import env from '#start/env'

/**
 * Server-Sent Events (see start/transmit.ts and app/services/realtime/realtime.ts).
 *
 * Redis carries every broadcast between processes: the worker credits deposits while the
 * connections are held by the API, and production may run several API instances. Tests keep the
 * broadcast in-process.
 */
export default defineConfig({
  // A comment frame every 20 s: proxies and Cloudflare (100 s) close a silent connection.
  pingInterval: '20s',
  transport: app.inTest
    ? null
    : {
        driver: redis({
          host: env.get('REDIS_HOST'),
          port: env.get('REDIS_PORT'),
          password: env.get('REDIS_PASSWORD') || undefined,
        }),
        channel: 'reemite::realtime',
      },
})
