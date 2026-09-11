import type { HttpContext } from '@adonisjs/core/http'

/**
 * Rate limit middleware - 100 requests per minute per IP
 * Can be configured via limiter service in production
 *
 * Known limitation: this counter is in-process memory, so it resets on restart and isn't
 * shared across instances behind a load balancer (each instance enforces its own 100 req/min,
 * not a global one). Fixing that requires a shared store (e.g. Redis via @adonisjs/limiter,
 * already a project dependency but not wired up) — out of scope for this pass; the fix here
 * only prevents the Map from growing unbounded (memory leak) as new IPs are seen over time.
 */
export default class RateLimitMiddleware {
  private static requestCounts = new Map<string, number[]>()
  private static readonly MAX_REQUESTS = 100
  private static readonly WINDOW_MS = 60000
  private static readonly CLEANUP_INTERVAL_MS = 5 * 60000
  private static cleanupTimer: NodeJS.Timeout | null = null

  private static ensureCleanupScheduled() {
    if (this.cleanupTimer) return
    this.cleanupTimer = setInterval(() => {
      const now = Date.now()
      for (const [ip, timestamps] of this.requestCounts) {
        const recent = timestamps.filter((t) => now - t < this.WINDOW_MS)
        if (recent.length === 0) {
          this.requestCounts.delete(ip)
        } else if (recent.length !== timestamps.length) {
          this.requestCounts.set(ip, recent)
        }
      }
    }, this.CLEANUP_INTERVAL_MS)
    this.cleanupTimer.unref?.()
  }

  async handle(ctx: HttpContext, next: () => Promise<void>) {
    RateLimitMiddleware.ensureCleanupScheduled()

    // Skip rate limiting for health checks
    if (ctx.request.url() === '/') {
      return next()
    }

    const ip = ctx.request.ip() || 'unknown'
    const now = Date.now()
    const counts = RateLimitMiddleware.requestCounts.get(ip) || []

    // Remove old requests outside the window
    const recentCounts = counts.filter((timestamp) => now - timestamp < RateLimitMiddleware.WINDOW_MS)

    if (recentCounts.length >= RateLimitMiddleware.MAX_REQUESTS) {
      return ctx.response.status(429).json({
        message: 'Too many requests. Please try again later.',
        retryAfter: 60,
      })
    }

    // Add current request
    recentCounts.push(now)
    RateLimitMiddleware.requestCounts.set(ip, recentCounts)

    return next()
  }
}
