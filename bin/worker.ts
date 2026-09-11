/**
 * AdonisJS Worker Entry Point
 *
 * Boots the application without an HTTP listener and starts the BullMQ job processors:
 * notifications, webhooks, reconciliation, the outbox relay.
 *
 * Run with: npm run worker
 *
 * The Ignitor exposes `start()` on what it builds — `httpServer()`, `ace()`, `testRunner()` — not
 * on itself. A process that is none of those builds the application directly with `createApp()`
 * and drives the lifecycle itself, which is what the three phases below do.
 */

await import('reflect-metadata')
const { Ignitor, prettyPrintError } = await import('@adonisjs/core')

const APP_ROOT = new URL('../', import.meta.url)

const IMPORTER = (filePath: string) => {
  if (filePath.startsWith('./') || filePath.startsWith('../')) {
    return import(new URL(filePath, APP_ROOT).href)
  }
  return import(filePath)
}

const app = new Ignitor(APP_ROOT, { importer: IMPORTER })
  .tap((instance) => {
    instance.booting(async () => {
      await import('#start/env')
    })
    instance.listen('SIGTERM', () => instance.terminate())
    instance.listenIf(instance.managedByPm2, 'SIGINT', () => instance.terminate())
  })
  .createApp('console')

try {
  await app.init()
  await app.boot()

  const { assertRedisReachable, registerWorkers } = await import('#queue/workers')

  // Checked before anything is registered. BullMQ is configured with
  // `maxRetriesPerRequest: null`, so with Redis down every command queues up silently instead of
  // failing: the process would sit there looking healthy and process nothing at all.
  await assertRedisReachable()

  const workers = await registerWorkers()

  // Lets in-flight jobs finish on SIGTERM rather than being cut mid-delivery.
  app.terminating(async () => {
    await Promise.all(workers.map((worker) => worker.close()))
  })

  await app.start(async () => {
    console.log('✓ Worker process started — job processors registered and listening')
  })
} catch (error) {
  process.exitCode = 1
  prettyPrintError(error)
}
