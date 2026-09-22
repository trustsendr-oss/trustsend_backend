import type { HttpContext } from '@adonisjs/core/http'
import TellerSession from '#models/teller_session'
import {
  TellerSessionService,
  MissingCountException,
  SelfReconciliationException,
  SessionAlreadyOpenException,
  SessionStateException,
  UnknownCurrencyException,
} from '#services/counter/teller_session_service'
import {
  StaffNotPostedException,
  CounterNotActiveException,
} from '#services/business/business_staff_identity_service'
import {
  openTellerSessionValidator,
  closeTellerSessionValidator,
  reconcileTellerSessionValidator,
} from '#validators/teller_sessions'
import { serializeSession } from '#controllers/counter/serialize_session'

/**
 * A teller working their drawer.
 *
 * Runs behind middleware.businessStaff(), so ctx.business and ctx.businessStaff are already
 * resolved from the signed-in person's posting — never from anything the request carries. Every
 * query below is scoped to ctx.business.id for that reason: a teller reaching another
 * institution's shifts would be a leak between direct competitors.
 */
export default class CounterSessionsController {
  /** GET /api/v1/counter/sessions — this institution's shifts, newest first. */
  async index({ business, request, response }: HttpContext) {
    const status = request.input('status')
    const agentId = request.input('agent_id')

    const query = TellerSession.query().where('business_id', business.id).preload('balances')
    if (status) query.where('status', String(status))
    if (agentId) query.where('agent_id', Number(agentId))

    const sessions = await query.orderBy('opened_at', 'desc').limit(200)
    return response.ok({ data: sessions.map(serializeSession) })
  }

  /** GET /api/v1/counter/sessions/current — the drawer this teller has open, if any. */
  async current({ businessStaff, response }: HttpContext) {
    if (!businessStaff.agentId) {
      return response.ok({ data: null })
    }

    const session = await TellerSessionService.openSessionFor(businessStaff.agentId)
    return response.ok({ data: session ? serializeSession(session) : null })
  }

  /** POST /api/v1/counter/sessions — open the drawer with what is physically in it. */
  async store({ businessStaff, request, correlationId, response }: HttpContext) {
    const payload = await request.validateUsing(openTellerSessionValidator)

    try {
      const session = await TellerSessionService.open(
        businessStaff,
        payload.opening_cash.map((line) => ({
          currencyCode: line.currency_code.toUpperCase(),
          amount: BigInt(line.amount),
        })),
        correlationId
      )
      return response.created({ data: serializeSession(session) })
    } catch (error) {
      return this.handle(error, response)
    }
  }

  /** POST /api/v1/counter/sessions/:id/close — count the drawer and hand it over. */
  async close({ business, businessStaff, params, request, correlationId, response }: HttpContext) {
    const payload = await request.validateUsing(closeTellerSessionValidator)
    const session = await this.ownedSession(business.id, params.id)

    if (!session) {
      return response.notFound({ message: 'Session not found' })
    }
    // Only the teller who worked the shift declares its count: a drawer counted by anyone else is
    // not a statement about what that person had.
    if (session.staffId !== businessStaff.id) {
      return response.forbidden({
        message: 'Only the teller who worked this session can close it.',
        code: 'E_NOT_YOUR_SESSION',
      })
    }

    try {
      const closed = await TellerSessionService.close(
        session,
        payload.counted_cash.map((line) => ({
          currencyCode: line.currency_code.toUpperCase(),
          amount: BigInt(line.amount),
        })),
        { notes: payload.notes, correlationId }
      )
      return response.ok({ data: serializeSession(closed) })
    } catch (error) {
      return this.handle(error, response)
    }
  }

  /** POST /api/v1/counter/sessions/:id/reconcile — a second person signs it off. */
  async reconcile({
    business,
    businessStaff,
    params,
    request,
    correlationId,
    response,
  }: HttpContext) {
    const payload = await request.validateUsing(reconcileTellerSessionValidator)
    const session = await this.ownedSession(business.id, params.id)

    if (!session) {
      return response.notFound({ message: 'Session not found' })
    }
    // A teller cannot sign off a variance at all — theirs or anyone else's. The service refuses
    // their own; the role is what keeps them out of everyone else's.
    if (businessStaff.role !== 'branch_manager' && businessStaff.role !== 'admin') {
      return response.forbidden({
        message: 'Only a branch manager or an institution admin can sign off a session.',
        code: 'E_NOT_A_SUPERVISOR',
      })
    }

    try {
      const reconciled = await TellerSessionService.reconcile(session, businessStaff, {
        notes: payload.notes,
        correlationId,
      })
      return response.ok({ data: serializeSession(reconciled) })
    } catch (error) {
      return this.handle(error, response)
    }
  }

  /** Scoped by institution, so an id from another one simply does not exist here. */
  private ownedSession(businessId: number, id: string) {
    return TellerSession.query()
      .where('id', Number(id))
      .where('business_id', businessId)
      .preload('balances')
      .first()
  }

  private handle(error: unknown, response: HttpContext['response']) {
    if (error instanceof StaffNotPostedException || error instanceof CounterNotActiveException) {
      return response.forbidden({ message: (error as Error).message })
    }
    if (error instanceof SessionAlreadyOpenException || error instanceof SessionStateException) {
      return response.conflict({ message: (error as Error).message, code: 'E_SESSION_STATE' })
    }
    if (
      error instanceof UnknownCurrencyException ||
      error instanceof MissingCountException ||
      error instanceof SelfReconciliationException
    ) {
      return response.badRequest({ message: (error as Error).message })
    }
    throw error
  }
}
