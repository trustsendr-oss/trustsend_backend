import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import { createP2pTransferValidator, listTransfersValidator } from '#validators/transfers'
import { P2pTransferService } from '#services/transactions/p2p_transfer_service'
import { Money } from '#services/money/money'
import { PinService } from '#services/security/pin_service'
import { IdempotencyService } from '#services/security/idempotency_service'
import Wallet from '#models/wallet'

const P2P_TRANSFER_ENDPOINT = 'POST /api/v1/transfers/p2p'

/**
 * P2P Transfers Controller
 *
 * Handles HTTP endpoints for peer-to-peer money transfers
 * - POST /api/v1/transfers (initiate transfer)
 * - GET /api/v1/transfers/:uuid (get transfer status)
 * - GET /api/v1/transfers (list transfers for authenticated wallet)
 */
export default class P2pTransfersController {
  /**
   * POST /api/v1/transfers
   * Initiate a P2P transfer from authenticated user's wallet to recipient
   */
  async create(ctx: HttpContext) {
    const { auth, request, response } = ctx
    // Verify authenticated user
    const user = auth.user
    if (!user) {
      return response.unauthorized({ message: 'Unauthenticated' })
    }

    // Validate request payload
    const payload = await request.validateUsing(createP2pTransferValidator)

    // Default to USD if not specified
    const currencyCode = payload.currency_code || 'USD'

    // Load sender's wallet
    const senderWallet = await Wallet.query()
      .where('user_id', user.id)
      .where('currency_code', currencyCode)
      .where('status', 'active')
      .first()

    if (!senderWallet) {
      return response.notFound({
        message: `Active wallet not found for currency ${currencyCode}`
      })
    }

    // Load recipient's wallet
    let recipientWallet: Wallet | null = null
    try {
      recipientWallet = await Wallet.findOrFail(payload.recipient_wallet_id)
    } catch {
      return response.notFound({ message: 'Recipient wallet not found' })
    }

    if (recipientWallet.status !== 'active') {
      return response.badRequest({ message: 'Recipient wallet is not active' })
    }

    // Validate both wallets use same currency
    if (senderWallet.currencyCode !== currencyCode) {
      return response.badRequest({
        message: `Sender wallet uses ${senderWallet.currencyCode}, not ${currencyCode}`
      })
    }

    if (recipientWallet.currencyCode !== currencyCode) {
      return response.badRequest({
        message: `Recipient wallet uses ${recipientWallet.currencyCode}, not ${currencyCode}`
      })
    }

    const identity = {
      key: payload.idempotency_key,
      actorType: 'user' as const,
      actorId: user.id,
      endpoint: P2P_TRANSFER_ENDPOINT,
    }

    try {
      const outcome = await IdempotencyService.begin({
        ...identity,
        requestHash: IdempotencyService.hashPayload(payload),
      })
      if (outcome.replay) {
        return response.status(outcome.status).send(outcome.body)
      }
    } catch (error) {
      const err = error as any
      if (err.name === 'IdempotencyConflictException') {
        return response.conflict({ message: err.message })
      }
      throw error
    }

    try {
      // Verify PIN before moving any money
      const pinVerification = await PinService.verifyPin(user, payload.pin)
      if (!pinVerification.valid) {
        await IdempotencyService.fail(identity)
        return response.unauthorized({
          message: pinVerification.message,
          code: pinVerification.code,
        })
      }

      // Create Money value object (validates currency code, etc.)
      const amount = new Money(BigInt(payload.amount), currencyCode) // payload.amount is already string

      // Initiate transfer via service
      const result = await P2pTransferService.initiate({
        senderWalletId: senderWallet.id,
        recipientWalletId: recipientWallet.id,
        amount,
        description: payload.description,
        metadata: payload.metadata,
        correlationId: (ctx as any).correlationId || 'unknown',
        initiatedByType: 'user',
        initiatedById: user.id,
        idempotencyKey: payload.idempotency_key,
      })

      const body = {
        data: {
          transaction_uuid: result.transactionUuid,
          status: result.status,
          sender_wallet_id: result.senderWalletId,
          recipient_wallet_id: result.recipientWalletId,
          amount: {
            amount: result.amount.amount.toString(), // serialize bigint
            currency_code: result.amount.currencyCode,
          },
          created_at: result.createdAt,
        },
      }
      await IdempotencyService.complete(identity, 201, body)
      return response.created(body)
    } catch (error) {
      await IdempotencyService.fail(identity)
      const err = error as any

      if (err.name === 'InsufficientBalanceException') {
        return response.paymentRequired({ message: err.message })
      }
      if (err.name === 'TransactionLimitExceededException') {
        return response.badRequest({ message: err.message })
      }
      if (err.name === 'P2pTransferNotFoundException') {
        return response.notFound({ message: err.message })
      }
      if (err.name === 'ValidationException') {
        return response.unprocessableEntity({ message: err.message })
      }

      ctx.logger?.error({ error: err, correlationId: (ctx as any).correlationId }, 'P2P transfer failed')
      return response.internalServerError({ message: 'Transfer processing failed' })
    }
  }

  /**
   * GET /api/v1/transfers/:uuid
   * Retrieve a transfer by its UUID (only sender or recipient can view)
   */
  async show(ctx: HttpContext) {
    const { auth, params, response } = ctx
    const user = auth.user
    if (!user) {
      return response.unauthorized({ message: 'Unauthenticated' })
    }

    const transfer = await P2pTransferService.getByUuid(params.uuid)

    if (!transfer) {
      return response.notFound({ message: 'Transfer not found' })
    }

    // Verify user has access (sender or recipient)
    const userWallet = await Wallet.query()
      .where('user_id', user.id)
      .where('status', 'active')
      .first()

    if (!userWallet) {
      return response.notFound({ message: 'User wallet not found' })
    }

    // Check if user is sender or recipient
    const ledgerEntries = await db
      .query()
      .from('ledger_entries as le')
      .join('ledger_accounts as la', 'la.id', 'le.ledger_account_id')
      .where('le.ledger_transaction_id', transfer.id)
      .where('la.owner_id', userWallet.id)
      .first()

    if (!ledgerEntries) {
      return response.forbidden({ message: 'Access denied to this transfer' })
    }

    return response.ok({
      data: {
        uuid: transfer.uuid,
        type: transfer.type,
        status: transfer.status,
        initiated_by_type: transfer.initiatedByType,
        initiated_by_id: transfer.initiatedById,
        description: transfer.description,
        created_at: transfer.createdAt,
        completed_at: transfer.completedAt,
      },
    })
  }

  /**
   * GET /api/v1/transfers
   * List transfers for authenticated user's wallet (sender or recipient)
   */
  async index({ auth, request, response }: HttpContext) {
    const user = auth.user
    if (!user) {
      return response.unauthorized({ message: 'Unauthenticated' })
    }

    const queryParams = await request.validateUsing(listTransfersValidator)
    const page = queryParams.page || 1
    const limit = queryParams.limit || 20

    // Load user's wallet
    const wallet = await Wallet.query()
      .where('user_id', user.id)
      .where('status', 'active')
      .first()

    if (!wallet) {
      return response.notFound({ message: 'Wallet not found' })
    }

    const { data, total } = await P2pTransferService.listForWallet(
      wallet.id,
      limit,
      page
    )

    return response.ok({
      data: data.map((transfer) => ({
        uuid: transfer.uuid,
        type: transfer.type,
        status: transfer.status,
        initiated_by_type: transfer.initiatedByType,
        initiated_by_id: transfer.initiatedById,
        description: transfer.description,
        created_at: transfer.createdAt,
        completed_at: transfer.completedAt,
      })),
      meta: {
        total,
        page,
        limit,
      },
    })
  }
}
