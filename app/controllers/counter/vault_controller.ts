import type { HttpContext } from '@adonisjs/core/http'
import vine from '@vinejs/vine'
import BusinessVault from '#models/business_vault'
import VaultTransfer from '#models/vault_transfer'
import TellerSession from '#models/teller_session'
import {
  VaultManagementService,
  VaultException,
} from '#services/treasury/vault_management_service'

const requestTransferValidator = vine.compile(
  vine.object({
    vault_id: vine.number().positive(),
    session_id: vine.number().positive(),
    amount: vine.string().regex(/^\d+$/),
    notes: vine.string().trim().maxLength(500).optional(),
  })
)

const rejectTransferValidator = vine.compile(
  vine.object({
    notes: vine.string().trim().minLength(3).maxLength(500),
  })
)

const VAULT_MANAGERS = new Set(['branch_manager', 'admin'])

export default class VaultController {
  /** GET /api/v1/counter/vaults */
  async index({ business, response }: HttpContext) {
    const vaults = await BusinessVault.query()
      .where('business_id', business.id)
      .orderBy('currency_code', 'asc')

    return response.ok({
      data: vaults.map((v) => ({
        id: v.id,
        name: v.name,
        currency_code: v.currencyCode,
        balance: v.balanceCache.toString(),
        max_capacity: v.maxCapacity ? v.maxCapacity.toString() : null,
        status: v.status,
      })),
    })
  }

  /** POST /api/v1/counter/vaults/replenish — Teller requests cash from vault */
  async replenish({ business, businessStaff, request, response }: HttpContext) {
    const { vault_id, session_id, amount, notes } = await request.validateUsing(
      requestTransferValidator
    )

    const session = await TellerSession.query()
      .where('id', session_id)
      .where('business_id', business.id)
      .first()

    if (!session) return response.notFound({ message: 'Teller session not found' })

    try {
      const transfer = await VaultManagementService.requestReplenishment(
        vault_id,
        session,
        BigInt(amount),
        businessStaff,
        notes
      )

      return response.created({
        data: {
          id: transfer.id,
          vault_id: transfer.vaultId,
          session_id: transfer.tellerSessionId,
          type: transfer.transferType,
          amount: transfer.amount.toString(),
          currency: transfer.currencyCode,
          status: transfer.status,
        },
      })
    } catch (error) {
      if (error instanceof VaultException) {
        return response.conflict({ message: error.message, code: 'E_VAULT_ERROR' })
      }
      throw error
    }
  }

  /** POST /api/v1/counter/vaults/sweep — Teller returns cash to vault */
  async sweep({ business, businessStaff, request, response }: HttpContext) {
    const { vault_id, session_id, amount, notes } = await request.validateUsing(
      requestTransferValidator
    )

    const session = await TellerSession.query()
      .where('id', session_id)
      .where('business_id', business.id)
      .first()

    if (!session) return response.notFound({ message: 'Teller session not found' })

    try {
      const transfer = await VaultManagementService.requestSweep(
        vault_id,
        session,
        BigInt(amount),
        businessStaff,
        notes
      )

      return response.created({
        data: {
          id: transfer.id,
          vault_id: transfer.vaultId,
          session_id: transfer.tellerSessionId,
          type: transfer.transferType,
          amount: transfer.amount.toString(),
          currency: transfer.currencyCode,
          status: transfer.status,
        },
      })
    } catch (error) {
      if (error instanceof VaultException) {
        return response.conflict({ message: error.message, code: 'E_VAULT_ERROR' })
      }
      throw error
    }
  }

  /** GET /api/v1/counter/vaults/transfers */
  async transfers({ business, request, response }: HttpContext) {
    const status = request.input('status') as string | undefined
    const query = VaultTransfer.query()
      .whereHas('vault', (q) => q.where('business_id', business.id))
      .preload('initiator')
      .preload('approver')
      .orderBy('created_at', 'desc')
      .limit(100)

    if (status) query.where('status', status)

    const transfers = await query

    return response.ok({
      data: transfers.map((t) => ({
        id: t.id,
        vault_id: t.vaultId,
        session_id: t.tellerSessionId,
        type: t.transferType,
        amount: t.amount.toString(),
        currency: t.currencyCode,
        status: t.status,
        initiated_by: t.initiator ? { id: t.initiator.id, role: t.initiator.role } : null,
        approved_by: t.approver ? { id: t.approver.id, role: t.approver.role } : null,
        notes: t.notes,
        created_at: t.createdAt,
        decided_at: t.decidedAt,
      })),
    })
  }

  /** POST /api/v1/counter/vaults/transfers/:id/approve */
  async approve({ business, businessStaff, params, correlationId, response }: HttpContext) {
    if (!VAULT_MANAGERS.has(businessStaff.role)) {
      return response.forbidden({
        message: 'Only a branch manager or admin can approve vault transfers.',
        code: 'E_NOT_A_VAULT_MANAGER',
      })
    }

    const transfer = await VaultTransfer.query()
      .where('id', Number(params.id))
      .whereHas('vault', (q) => q.where('business_id', business.id))
      .first()

    if (!transfer) return response.notFound({ message: 'Transfer not found' })

    try {
      await VaultManagementService.approveTransfer(transfer, businessStaff, correlationId)
      return response.ok({
        data: {
          id: transfer.id,
          status: transfer.status,
          decided_at: transfer.decidedAt,
        },
      })
    } catch (error) {
      if (error instanceof VaultException) {
        return response.conflict({ message: error.message, code: 'E_VAULT_ERROR' })
      }
      throw error
    }
  }

  /** POST /api/v1/counter/vaults/transfers/:id/reject */
  async reject({ business, businessStaff, params, request, correlationId, response }: HttpContext) {
    if (!VAULT_MANAGERS.has(businessStaff.role)) {
      return response.forbidden({
        message: 'Only a branch manager or admin can reject vault transfers.',
        code: 'E_NOT_A_VAULT_MANAGER',
      })
    }

    const { notes } = await request.validateUsing(rejectTransferValidator)
    const transfer = await VaultTransfer.query()
      .where('id', Number(params.id))
      .whereHas('vault', (q) => q.where('business_id', business.id))
      .first()

    if (!transfer) return response.notFound({ message: 'Transfer not found' })

    try {
      await VaultManagementService.rejectTransfer(transfer, businessStaff, notes, correlationId)
      return response.ok({
        data: {
          id: transfer.id,
          status: transfer.status,
          decided_at: transfer.decidedAt,
        },
      })
    } catch (error) {
      if (error instanceof VaultException) {
        return response.conflict({ message: error.message, code: 'E_VAULT_ERROR' })
      }
      throw error
    }
  }
}
