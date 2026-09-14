import type { HttpContext } from '@adonisjs/core/http'
import { fundSandboxWalletValidator } from '#validators/sandbox'
import { IdempotencyService } from '#services/security/idempotency_service'
import { SandboxFundingService } from '#services/sandbox/sandbox_funding_service'

const SANDBOX_FUND_ENDPOINT = 'POST /api/v1/business/sandbox/fund'

/**
 * Sandbox-only tooling for integrators. Shared by the API key and dashboard route groups, both
 * behind sandbox_only_middleware.ts. No PIN, even for a dashboard session: nothing real moves.
 */
export default class BusinessSandboxController {
  /** POST /api/v1/business/sandbox/fund */
  async fund({ business, request, response, correlationId }: HttpContext) {
    const payload = await request.validateUsing(fundSandboxWalletValidator)

    const identity = {
      key: payload.idempotency_key,
      actorType: 'business' as const,
      actorId: business.id,
      endpoint: SANDBOX_FUND_ENDPOINT,
    }
    try {
      const outcome = await IdempotencyService.begin({
        ...identity,
        requestHash: IdempotencyService.hashPayload({
          currency_code: payload.currency_code,
          amount: payload.amount,
        }),
      })
      if (outcome.replay) return response.status(outcome.status).send(outcome.body)
    } catch (error) {
      if ((error as Error).name === 'IdempotencyConflictException') {
        return response.conflict({ message: (error as Error).message })
      }
      throw error
    }

    try {
      const { transaction, wallet } = await SandboxFundingService.fund(business.id, {
        currencyCode: payload.currency_code,
        amount: BigInt(payload.amount),
        idempotencyKey: payload.idempotency_key,
        correlationId,
      })
      const body = {
        data: {
          transaction_id: transaction.id,
          transaction_uuid: transaction.uuid,
          status: transaction.status,
          wallet_id: wallet.id,
          currency_code: wallet.currencyCode,
          amount: payload.amount,
          balance: wallet.balanceCache.toString(),
          created_at: transaction.createdAt,
        },
      }
      await IdempotencyService.complete(identity, 201, body)
      return response.created(body)
    } catch (error) {
      await IdempotencyService.fail(identity)
      const err = error as Error
      switch (err.name) {
        case 'CurrencyNotSupportedException':
        case 'SandboxFundingAmountTooLargeException':
          return response.unprocessableEntity({ message: err.message })
        case 'SandboxWalletNotFoundException':
        case 'SandboxDisabledException':
          return response.notFound({ message: err.message })
      }
      throw error
    }
  }
}
