import type { HttpContext } from '@adonisjs/core/http'
import vine from '@vinejs/vine'
import Remittance from '#models/remittance'
import type InternalUser from '#models/internal_user'
import WatchlistEntry from '#models/watchlist_entry'
import { remittanceErrorResponse } from '#controllers/remittances_controller'
import { RemittancePresenter } from '#services/remittances/remittance_presenter'
import { RemittanceService } from '#services/remittances/remittance_service'
import { normalizeName } from '#services/remittances/screening_service'
import { PawaPayProvider } from '#services/mobile_money/pawapay_provider'

const provider = new PawaPayProvider()

const listValidator = vine.create({
  status: vine
    .enum([
      'held',
      'awaiting_payout',
      'processing',
      'paid',
      'cancelled',
      'expired',
      'rejected',
      'failed',
    ])
    .optional(),
})
const rejectValidator = vine.create({ reason: vine.string().trim().minLength(10).maxLength(255) })
const watchlistValidator = vine.create({
  full_name: vine.string().trim().minLength(3).maxLength(200),
  source: vine.string().trim().minLength(2).maxLength(40),
  reference: vine.string().trim().maxLength(100).optional(),
})

/**
 * Compliance oversight of international transfers (internal users only): the hold queue fed by
 * watchlist screening, and the watchlist itself.
 */
export default class AdminRemittancesController {
  /** GET /api/v1/admin/remittances?status= */
  async index({ request, response }: HttpContext) {
    const { status } = await request.validateUsing(listValidator, { data: request.qs() })
    const query = Remittance.query().orderBy('created_at', 'desc').limit(500)
    if (status) query.where('status', status)
    const rows = await query
    return response.ok({ data: rows.map((r) => RemittancePresenter.forAdmin(r)) })
  }

  /** GET /api/v1/admin/remittances/:id */
  async show({ params, response }: HttpContext) {
    const remittance = await Remittance.findOrFail(params.id)
    return response.ok({ data: RemittancePresenter.forAdmin(remittance) })
  }

  /** POST /api/v1/admin/remittances/:id/release — clear a compliance hold. */
  async release({ auth, params, correlationId, response }: HttpContext) {
    const reviewer = auth.getUserOrFail() as InternalUser
    try {
      const remittance = await RemittanceService.release(
        params.id,
        reviewer.id,
        correlationId,
        provider
      )
      return response.ok({ data: RemittancePresenter.forAdmin(remittance) })
    } catch (error) {
      return remittanceErrorResponse(error, response)
    }
  }

  /** POST /api/v1/admin/remittances/:id/reject — refuse and refund the sender in full. */
  async reject({ auth, params, request, correlationId, response }: HttpContext) {
    const reviewer = auth.getUserOrFail() as InternalUser
    const { reason } = await request.validateUsing(rejectValidator)
    try {
      const remittance = await RemittanceService.reject(
        params.id,
        reviewer.id,
        reason,
        correlationId
      )
      return response.ok({ data: RemittancePresenter.forAdmin(remittance) })
    } catch (error) {
      return remittanceErrorResponse(error, response)
    }
  }

  /** GET /api/v1/admin/watchlist */
  async watchlist({ response }: HttpContext) {
    const entries = await WatchlistEntry.query().orderBy('full_name', 'asc')
    return response.ok({
      data: entries.map((e) => ({
        id: e.id,
        full_name: e.fullName,
        source: e.source,
        reference: e.reference,
        created_at: e.createdAt,
      })),
    })
  }

  /** POST /api/v1/admin/watchlist */
  async addToWatchlist({ request, response }: HttpContext) {
    const payload = await request.validateUsing(watchlistValidator)
    const entry = await WatchlistEntry.create({
      fullName: payload.full_name,
      normalizedName: normalizeName(payload.full_name),
      source: payload.source,
      reference: payload.reference ?? null,
    })
    return response.created({
      data: {
        id: entry.id,
        full_name: entry.fullName,
        source: entry.source,
        reference: entry.reference,
      },
    })
  }

  /** DELETE /api/v1/admin/watchlist/:id */
  async removeFromWatchlist({ params, response }: HttpContext) {
    const entry = await WatchlistEntry.findOrFail(params.id)
    await entry.delete()
    return response.ok({ data: { id: entry.id } })
  }
}
