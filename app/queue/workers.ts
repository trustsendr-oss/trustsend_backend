/**
 * Worker Registration
 *
 * Registers the job processors that consume the queues declared in app/queue/connection.ts, and
 * — just as importantly — the schedules that FEED them.
 *
 * A BullMQ `Worker` only ever runs when something is added to its queue. Registering a worker
 * without ever enqueueing a job leaves a process that polls Redis forever and does nothing, which
 * is precisely what happened to the outbox relay: the queue existed, the worker existed, and
 * every event written between 2026-08-30 and 2026-09-07 stayed `pending`. `upsertJobScheduler`
 * below is what closes that gap.
 */

import { Queue, Worker } from 'bullmq'
import { Redis } from 'ioredis'
import { redisConnection, redisOptions } from '#queue/connection'

/** How often the outbox is drained. Short enough that a receipt feels immediate. */
const OUTBOX_RELAY_INTERVAL_MS = 15_000

/**
 * Fails loudly when Redis is unreachable.
 *
 * The queue connection sets `maxRetriesPerRequest: null` — the right setting for a worker, which
 * must survive a Redis blip rather than crash, but it also means a command issued while Redis is
 * down waits forever instead of throwing. Without this check, starting the worker against a
 * stopped Redis prints its success banner and then does nothing, which looks exactly like a
 * working system.
 */
export async function assertRedisReachable(): Promise<void> {
  const probe = new Redis({
    ...redisConnection,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
    connectTimeout: 5_000,
  })

  try {
    await probe.connect()
    await probe.ping()
  } catch (error) {
    const where = `${redisConnection.host}:${redisConnection.port}`
    throw new Error(
      `Redis is unreachable at ${where} — the job workers cannot run without it. ` +
        `Start Redis (systemctl start redis, or docker run -d -p 6379:6379 redis) and check ` +
        `REDIS_HOST / REDIS_PORT / REDIS_PASSWORD in .env. Cause: ${(error as Error).message}`
    )
  } finally {
    probe.disconnect()
  }
}

export async function registerWorkers() {
  const workers: Worker[] = []

  // Outbox Relay Worker — delivers pending outbox events (notifications, webhooks).
  const outboxRelayWorker = new Worker(
    'outbox_relay',
    async () => {
      const { handleOutboxRelay } = await import('#jobs/outbox_relay_job')
      return handleOutboxRelay()
    },
    { connection: redisOptions, concurrency: 1 }
  )
  workers.push(outboxRelayWorker)

  // A worker that dies silently is worse than one that crashes: the outbox stops draining and
  // nothing says so.
  outboxRelayWorker.on('failed', (job, error) => {
    console.error(`[queue] outbox_relay job ${job?.id} failed:`, error)
  })

  const outboxRelayQueue = new Queue('outbox_relay', { connection: redisOptions })

  // Upsert, not add: restarting the worker must not stack a second schedule on top of the first.
  // Keyed by name, so the interval can be changed here and the old schedule is replaced.
  await outboxRelayQueue.upsertJobScheduler(
    'outbox-relay-tick',
    { every: OUTBOX_RELAY_INTERVAL_MS },
    {
      name: 'relay',
      opts: { removeOnComplete: true, removeOnFail: 50 },
    }
  )

  console.log(`✓ Outbox relay scheduled every ${OUTBOX_RELAY_INTERVAL_MS / 1000}s`)

  // TODO: Add workers as they're implemented (Phase 3+)
  // - ledger_reconciliation_job
  // - kyc_reverification_job
  // - webhook_delivery_job

  return workers
}
