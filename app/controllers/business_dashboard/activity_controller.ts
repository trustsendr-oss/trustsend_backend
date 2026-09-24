import type { HttpContext } from '@adonisjs/core/http'
import TellerSession from '#models/teller_session'
import { serializeSession } from '#controllers/counter/serialize_session'

/**
 * What happens at the institution's windows: every shift, who worked it, what was counted and the
 * variance — the same rows counter/sessions_controller.ts serves a branch manager, read here by the
 * institution's management. Reading only: signing off a shift (reconcile) stays with a manager on
 * staff, because it records a named person as having checked the count.
 */
export default class BusinessDashboardActivityController {
  /** GET /api/v1/business/dashboard/teller-sessions?agent_id=&status= */
  async sessions({ business, request, response }: HttpContext) {
    const status = request.input('status')
    const agentId = request.input('agent_id')

    const query = TellerSession.query()
      .where('business_id', business.id)
      .preload('balances')
      .preload('counter')
      .preload('teller', (teller) => teller.preload('user'))
    if (status) query.where('status', String(status))
    if (agentId) query.where('agent_id', Number(agentId))

    const sessions = await query.orderBy('opened_at', 'desc').limit(200)

    return response.ok({
      data: sessions.map((session) => ({
        ...serializeSession(session),
        counter: session.counter
          ? {
              id: session.counter.id,
              code: session.counter.code,
              full_name: session.counter.fullName,
            }
          : null,
        teller: session.teller
          ? {
              id: session.teller.id,
              role: session.teller.role,
              full_name: session.teller.user?.fullName ?? null,
              code: session.teller.user?.code ?? null,
            }
          : null,
      })),
    })
  }
}
