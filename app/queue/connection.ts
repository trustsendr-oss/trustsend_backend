import env from '#start/env'
import { Queue } from 'bullmq'
import type { ConnectionOptions } from 'bullmq'
import type { RedisOptions } from 'ioredis'

/**
 * Redis connection settings, exported under two types.
 *
 * BullMQ 6 declares its OWN `RedisOptions` interface instead of reusing ioredis's, and the two
 * are not structurally compatible — passing an ioredis `RedisOptions` straight to a `Queue` is a
 * type error on every single queue below. The settings are therefore written once against
 * ioredis's type, which is what `new Redis()` accepts, and re-exported under BullMQ's, which is
 * what queues and workers accept.
 *
 * `maxRetriesPerRequest: null` is deliberate and required by BullMQ: a worker must ride out a
 * Redis blip rather than crash. The cost is that a command issued while Redis is down waits
 * forever instead of failing — see assertRedisReachable() in workers.ts.
 */
export const redisConnection: RedisOptions = {
  host: env.get('REDIS_HOST'),
  port: env.get('REDIS_PORT'),
  password: env.get('REDIS_PASSWORD') || undefined,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
}

/** The same settings, typed for BullMQ queues and workers. */
export const redisOptions = redisConnection as ConnectionOptions

/**
 * Register all queues used by the application
 * Each queue has its own buffer of jobs waiting to be processed
 */
export function createQueues() {
  return {
    // Notification dispatch queue (SMS, Push, Email)
    notificationDispatch: new Queue('notification_dispatch', { connection: redisOptions }),
    notificationDispatchDlq: new Queue('notification_dispatch_dlq', {
      connection: redisOptions,
    }),

    // Webhook delivery queue (outgoing webhooks to partners)
    webhookDelivery: new Queue('webhook_delivery', { connection: redisOptions }),

    // Outbox relay queue (processing outbox events → external calls)
    outboxRelay: new Queue('outbox_relay', { connection: redisOptions }),

    // Ledger reconciliation (hourly/periodic balance verification)
    ledgerReconciliation: new Queue('ledger_reconciliation', { connection: redisOptions }),

    // KYC reverification (checking for expired KYC verifications)
    kycReverification: new Queue('kyc_reverification', { connection: redisOptions }),
  }
}

export type Queues = ReturnType<typeof createQueues>
