import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'

/**
 * Per-route throttle, stricter than the blanket 100 req/min in rate_limit_middleware.ts —
 * intended for credential-guessing surfaces (login, signup, internal staff login) that shouldn't
 * share their budget with ordinary API traffic. Usage: middleware.throttle({ maxRequests: 10,
 * windowMinutes: 15, name: 'login' }) — `name` keys the counter so different routes using this
 * middleware don't share a bucket.
 *
 * Same known limitation as rate_limit_middleware.ts: in-process memory, not shared across
 * instances behind a load balancer, and resets on restart. A proper fix needs a shared store
 * (e.g. Redis via @adonisjs/limiter, already a project dependency but not wired up). This still
 * closes the gap of these endpoints having no dedicated limit at all on a single instance.
 */
export default class ThrottleMiddleware {
  private static hits = new Map<string, number[]>()
  private static cleanupTimer: NodeJS.Timeout | null = null

  private static ensureCleanupScheduled() {
    if (this.cleanupTimer) return
    this.cleanupTimer = setInterval(() => {
      const now = Date.now()
      for (const [key, timestamps] of this.hits) {
        const recent = timestamps.filter((t) => now - t < 60 * 60000)
        if (recent.length === 0) {
          this.hits.delete(key)
        } else if (recent.length !== timestamps.length) {
          this.hits.set(key, recent)
        }
      }
    }, 5 * 60000)
    this.cleanupTimer.unref?.()
  }

  async handle(
    ctx: HttpContext,
    next: NextFn,
    options: { maxRequests: number; windowMinutes: number; name: string }
  ) {
    ThrottleMiddleware.ensureCleanupScheduled()

    const windowMs = options.windowMinutes * 60000
    const ip = ctx.request.ip() || 'unknown'
    const key = `${options.name}:${ip}`
    const now = Date.now()

    const hits = ThrottleMiddleware.hits.get(key) || []
    const recentHits = hits.filter((timestamp) => now - timestamp < windowMs)

    if (recentHits.length >= options.maxRequests) {
      const retryAfterSeconds = Math.ceil((recentHits[0] + windowMs - now) / 1000)
      return ctx.response.tooManyRequests({
        message: 'Too many requests. Please try again later.',
        retryAfter: retryAfterSeconds,
      })
    }

    recentHits.push(now)
    ThrottleMiddleware.hits.set(key, recentHits)

    return next()
  }
}
