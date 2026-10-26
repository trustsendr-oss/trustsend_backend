import type { HttpContext } from '@adonisjs/core/http'
import vine from '@vinejs/vine'
import LedgerTransaction from '#models/ledger_transaction'
import type InternalUser from '#models/internal_user'
import { CryptoPayoutService } from '#services/crypto/crypto_payout_service'
import { CryptoTreasuryService } from '#services/crypto/crypto_treasury_service'

const listValidator = vine.create({
  status: vine.enum(['pending', 'processing', 'completed', 'failed', 'attention']).optional(),
})
const sentValidator = vine.create({
  tx_hash: vine
    .string()
    .trim()
    .regex(/^0x[0-9a-fA-F]{64}$/),
})
const rejectValidator = vine.create({ reason: vine.string().trim().minLength(10).maxLength(255) })

function errorResponse(error: unknown, response: HttpContext['response']) {
  const err = error as any
  if (err?.name === 'CryptoPayoutException') {
    return response.status(err.status).send({ code: err.code, message: err.message })
  }
  if (err?.name === 'CryptoPayoutNotFoundException') {
    return response.notFound({ message: err.message })
  }
  throw error
}

/**
 * Review queue of crypto withdrawals (internal users only) — phase 1, where staff send every
 * withdrawal themselves from the treasury. See crypto_payout_service.ts.
 */
export default class AdminCryptoPayoutsController {
  /**
   * GET /api/v1/admin/crypto-payouts?status=
   * `attention`: sent withdrawals whose hash the chain contradicts, waiting for staff.
   */
  async index({ request, response }: HttpContext) {
    const { status } = await request.validateUsing(listValidator, { data: request.qs() })
    const query = LedgerTransaction.query()
      .where('type', 'crypto_payout')
      .orderBy('created_at', 'desc')
      .limit(500)
    if (status === 'attention') {
      query.where('status', 'processing').whereRaw("metadata->>'verification_issue' IS NOT NULL")
    } else if (status) {
      query.where('status', status)
    }
    const rows = await query
    return response.ok({ data: rows.map((txn) => CryptoPayoutService.present(txn)) })
  }

  /**
   * GET /api/v1/admin/crypto-treasury
   * The treasury's balances on each withdrawal network, against the withdrawals waiting.
   */
  async treasury({ response }: HttpContext) {
    return response.ok({ data: await CryptoTreasuryService.overview() })
  }

  /** GET /api/v1/admin/crypto-payouts/:id */
  async show({ params, response }: HttpContext) {
    const txn = await LedgerTransaction.query()
      .where('id', params.id)
      .where('type', 'crypto_payout')
      .first()
    if (!txn) return response.notFound({ message: 'Crypto payout transaction not found' })
    return response.ok({ data: CryptoPayoutService.present(txn) })
  }

  /** POST /api/v1/admin/crypto-payouts/:id/sent — the tokens left the treasury: record the hash. */
  async sent({ auth, params, request, correlationId, response }: HttpContext) {
    const reviewer = auth.getUserOrFail() as InternalUser
    const { tx_hash: txHash } = await request.validateUsing(sentValidator)
    try {
      const txn = await CryptoPayoutService.markSent(params.id, txHash, reviewer.id, correlationId)
      return response.ok({ data: CryptoPayoutService.present(txn) })
    } catch (error) {
      return errorResponse(error, response)
    }
  }

  /** POST /api/v1/admin/crypto-payouts/:id/reject — refuse and refund in full, fees included. */
  async reject({ auth, params, request, correlationId, response }: HttpContext) {
    const reviewer = auth.getUserOrFail() as InternalUser
    const { reason } = await request.validateUsing(rejectValidator)
    try {
      const txn = await CryptoPayoutService.reject(params.id, reason, reviewer.id, correlationId)
      return response.ok({ data: CryptoPayoutService.present(txn) })
    } catch (error) {
      return errorResponse(error, response)
    }
  }
}
