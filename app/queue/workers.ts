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

/** How often lapsed cash-out reservations are closed. See expire_cash_outs_job.ts. */
const CASH_OUT_EXPIRY_INTERVAL_MS = 60_000

/** How often uncollected international transfers are refunded. See expire_remittances_job.ts. */
const REMITTANCE_EXPIRY_INTERVAL_MS = 60 * 60_000
const AGENT_COMMISSION_INTERVAL_MS = 60 * 60 * 1000

/** How often the likiliba calendar is run. See likiliba_cycle_job.ts. */
const LIKILIBA_CYCLE_INTERVAL_MS = 5 * 60_000

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

  // Cash-out expiry — closes withdrawals reserved at an agent but never paid out.
  const cashOutExpiryWorker = new Worker(
    'cash_out_expiry',
    async () => {
      const { handleExpireCashOuts } = await import('#jobs/expire_cash_outs_job')
      return handleExpireCashOuts()
    },
    { connection: redisOptions, concurrency: 1 }
  )
  workers.push(cashOutExpiryWorker)

  cashOutExpiryWorker.on('failed', (job, error) => {
    console.error(`[queue] cash_out_expiry job ${job?.id} failed:`, error)
  })

  const cashOutExpiryQueue = new Queue('cash_out_expiry', { connection: redisOptions })
  await cashOutExpiryQueue.upsertJobScheduler(
    'cash-out-expiry-tick',
    { every: CASH_OUT_EXPIRY_INTERVAL_MS },
    {
      name: 'expire',
      opts: { removeOnComplete: true, removeOnFail: 50 },
    }
  )

  console.log(`✓ Cash-out expiry scheduled every ${CASH_OUT_EXPIRY_INTERVAL_MS / 1000}s`)

  // Remittance expiry — refunds transfers nobody collected in time.
  const remittanceExpiryWorker = new Worker(
    'remittance_expiry',
    async () => {
      const { handleExpireRemittances } = await import('#jobs/expire_remittances_job')
      return handleExpireRemittances()
    },
    { connection: redisOptions, concurrency: 1 }
  )
  workers.push(remittanceExpiryWorker)

  remittanceExpiryWorker.on('failed', (job, error) => {
    console.error(`[queue] remittance_expiry job ${job?.id} failed:`, error)
  })

  const remittanceExpiryQueue = new Queue('remittance_expiry', { connection: redisOptions })
  await remittanceExpiryQueue.upsertJobScheduler(
    'remittance-expiry-tick',
    { every: REMITTANCE_EXPIRY_INTERVAL_MS },
    {
      name: 'expire',
      opts: { removeOnComplete: true, removeOnFail: 50 },
    }
  )

  console.log(`✓ Remittance expiry scheduled every ${REMITTANCE_EXPIRY_INTERVAL_MS / 60_000} min`)

  // Agent commissions — pays each agent once a day on the cash volume they handled.
  const agentCommissionWorker = new Worker(
    'agent_commission',
    async () => {
      const { handleAgentCommissions } = await import('#jobs/agent_commission_job')
      return handleAgentCommissions()
    },
    { connection: redisOptions, concurrency: 1 }
  )
  workers.push(agentCommissionWorker)

  agentCommissionWorker.on('failed', (job, error) => {
    console.error(`[queue] agent_commission job ${job?.id} failed:`, error)
  })

  const agentCommissionQueue = new Queue('agent_commission', { connection: redisOptions })
  // Hourly, not daily: each run pays only the days that are due and skips those already paid,
  // so a worker that was down at the usual hour catches up on its next tick.
  await agentCommissionQueue.upsertJobScheduler(
    'agent-commission-tick',
    { every: AGENT_COMMISSION_INTERVAL_MS },
    {
      name: 'pay',
      opts: { removeOnComplete: true, removeOnFail: 50 },
    }
  )

  console.log(`✓ Agent commissions scheduled every ${AGENT_COMMISSION_INTERVAL_MS / 60_000} min`)

  // Likiliba — reminders, automatic debits, caution covers, penalties and payouts.
  const likilibaCycleWorker = new Worker(
    'likiliba_cycle',
    async () => {
      const { handleLikilibaCycle } = await import('#jobs/likiliba_cycle_job')
      return handleLikilibaCycle()
    },
    { connection: redisOptions, concurrency: 1 }
  )
  workers.push(likilibaCycleWorker)

  likilibaCycleWorker.on('failed', (job, error) => {
    console.error(`[queue] likiliba_cycle job ${job?.id} failed:`, error)
  })

  const likilibaCycleQueue = new Queue('likiliba_cycle', { connection: redisOptions })
  await likilibaCycleQueue.upsertJobScheduler(
    'likiliba-cycle-tick',
    { every: LIKILIBA_CYCLE_INTERVAL_MS },
    {
      name: 'tick',
      opts: { removeOnComplete: true, removeOnFail: 50 },
    }
  )

  console.log(`✓ Likiliba cycle scheduled every ${LIKILIBA_CYCLE_INTERVAL_MS / 60_000} min`)

  // TODO: Add workers as they're implemented (Phase 3+)
  // - ledger_reconciliation_job
  // - kyc_reverification_job
  // - webhook_delivery_job

  return workers
}
