import { HttpContext } from '@adonisjs/core/http'
import { randomUUID } from 'node:crypto'

/**
 * Correlation ID middleware: generates and propagates a unique request ID
 * across the entire request/response cycle and into async jobs (BullMQ, etc.)
 * for end-to-end request tracing.
 *
 * Usage: Add to router middleware stack in start/kernel.ts
 */
export default class CorrelationIdMiddleware {
  async handle(ctx: HttpContext, next: () => Promise<void>) {
    // Get or generate correlation ID from request headers
    const correlationId = ctx.request.header('x-correlation-id') || randomUUID()

    // Set on response header so client can track it
    ctx.response.header('x-correlation-id', correlationId)

    // Create a logger child with correlation ID for this request
    // All logs from this request will include the correlation ID
    const logger = ctx.logger.child({ correlationId })

    // Attach to context for easy access in handlers and services
    ctx.correlationId = correlationId
    ctx.logger = logger

    // Attach to ctx for propagation to async jobs
    ctx.queueJobData = ctx.queueJobData || {}
    ctx.queueJobData.correlationId = correlationId

    await next()
  }
}

/**
 * Module augmentation to add correlation ID to HttpContext
 */
declare module '@adonisjs/core/http' {
  export interface HttpContext {
    correlationId: string
    queueJobData?: Record<string, any>
  }
}
