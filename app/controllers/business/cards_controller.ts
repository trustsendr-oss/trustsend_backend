import type { HttpContext } from '@adonisjs/core/http'
import { Money } from '#services/money/money'
import { PinService } from '#services/security/pin_service'
import { IdempotencyService } from '#services/security/idempotency_service'
import { PayscribeProvider } from '#services/cards/payscribe_provider'
import {
  CardService,
  CardNotFoundException,
  CardOwnershipException,
  CardWalletException,
  CardStatusException,
  InsufficientWalletBalanceException,
} from '#services/cards/card_service'
import {
  createBusinessCardValidator,
  businessCardAmountValidator,
  businessCardActionValidator,
  listBusinessCardTransactionsValidator,
} from '#validators/business_cards'

const provider = new PayscribeProvider()
const cardService = new CardService(provider)

const CREATE_CARD_ENDPOINT = 'POST /api/v1/business/cards'
const TOPUP_ENDPOINT = 'PATCH /api/v1/business/cards/:id/topup'
const WITHDRAW_ENDPOINT = 'PATCH /api/v1/business/cards/:id/withdraw'

/**
 * Business card issuing — shared by both business access paths (see routes.ts): server-to-server
 * via API key, and the dashboard session. Gated on the `cards.issuing` plan feature
 * (middleware.businessPlan('cards.issuing') in routes.ts) — an admin decides per-plan whether a
 * business may issue virtual cards at all. Mirrors business/deposits_controller.ts's structure:
 * the API-key call has no PIN prompt (the key itself is the credential), a dashboard session
 * requires the business's PIN, gated below on `businessAuthMethod`.
 */
export default class BusinessCardsController {
  /** GET /business/cards — list this business's cards */
  async index({ business, response }: HttpContext) {
    const cards = await cardService.listForOwner('business', business.id)
    return response.ok({
      data: cards.map((c) => ({
        id: c.id,
        provider_card_id: c.providerCardId,
        brand: c.brand,
        card_type: c.cardType,
        currency_code: c.currencyCode,
        status: c.status,
        first_six: c.firstSix,
        last_four: c.lastFour,
        masked: c.masked,
        balance: c.balanceCache.toString(),
        created_at: c.createdAt,
      })),
    })
  }

  /** POST /business/cards — create and fund a new card from one of the business's own wallets */
  async store({ business, businessAuthMethod, request, correlationId, response }: HttpContext) {
    const payload = await request.validateUsing(createBusinessCardValidator)
    const currencyCode = payload.currency_code || 'USD'

    const identity = {
      key: payload.idempotency_key,
      actorType: 'business' as const,
      actorId: business.id,
      endpoint: CREATE_CARD_ENDPOINT,
    }

    try {
      const outcome = await IdempotencyService.begin({ ...identity, requestHash: IdempotencyService.hashPayload(payload) })
      if (outcome.replay) return response.status(outcome.status).send(outcome.body)
    } catch (error) {
      const err = error as any
      if (err.name === 'IdempotencyConflictException') return response.conflict({ message: err.message })
      throw error
    }

    try {
      if (businessAuthMethod === 'dashboard') {
        if (!payload.pin) {
          await IdempotencyService.fail(identity)
          return response.badRequest({ message: 'PIN is required to create a card' })
        }
        const pinVerification = await PinService.verifyPin(business, payload.pin)
        if (!pinVerification.valid) {
          await IdempotencyService.fail(identity)
          return response.unauthorized({
            message: pinVerification.message,
            code: pinVerification.code,
          })
        }
      }

      const { card, details } = await cardService.createCard({
        owner: { ownerType: 'business', ownerId: business.id, fullName: business.name, email: business.email, phone: business.phone },
        walletId: payload.wallet_id,
        brand: payload.brand,
        amount: new Money(BigInt(payload.amount), currencyCode),
        correlationId,
      })

      const body = {
        data: {
          id: card.id,
          brand: card.brand,
          card_type: card.cardType,
          currency_code: card.currencyCode,
          status: card.status,
          first_six: card.firstSix,
          last_four: card.lastFour,
          masked: card.masked,
          balance: card.balanceCache.toString(),
          details,
        },
      }
      await IdempotencyService.complete(identity, 201, body)
      return response.created(body)
    } catch (error) {
      await IdempotencyService.fail(identity)
      const err = error as any
      if (err.name === 'CardWalletException' || err instanceof CardWalletException) {
        return response.badRequest({ message: err.message })
      }
      if (err.name === 'InsufficientWalletBalanceException' || err instanceof InsufficientWalletBalanceException) {
        return response.paymentRequired({ message: err.message })
      }
      if (err.name === 'CardProviderException') {
        return response.serviceUnavailable({ message: 'Card provider unavailable, try again' })
      }
      return response.internalServerError({ message: err.message || 'Card creation failed' })
    }
  }

  /** GET /business/cards/:id — decrypted card details, straight from the provider, never persisted */
  async show({ business, params, response }: HttpContext) {
    try {
      const { card, details } = await cardService.getDetails(Number(params.id), 'business', business.id)
      return response.ok({
        data: {
          id: card.id,
          brand: card.brand,
          card_type: card.cardType,
          currency_code: card.currencyCode,
          status: card.status,
          masked: card.masked,
          balance: card.balanceCache.toString(),
          details,
        },
      })
    } catch (error) {
      return this.handleLookupError(error, response)
    }
  }

  /** PATCH /business/cards/:id/topup */
  async topup({ business, businessAuthMethod, params, request, correlationId, response }: HttpContext) {
    const payload = await request.validateUsing(businessCardAmountValidator)
    const identity = {
      key: payload.idempotency_key,
      actorType: 'business' as const,
      actorId: business.id,
      endpoint: TOPUP_ENDPOINT,
    }

    try {
      const outcome = await IdempotencyService.begin({ ...identity, requestHash: IdempotencyService.hashPayload(payload) })
      if (outcome.replay) return response.status(outcome.status).send(outcome.body)
    } catch (error) {
      const err = error as any
      if (err.name === 'IdempotencyConflictException') return response.conflict({ message: err.message })
      throw error
    }

    try {
      if (businessAuthMethod === 'dashboard') {
        if (!payload.pin) {
          await IdempotencyService.fail(identity)
          return response.badRequest({ message: 'PIN is required to top up a card' })
        }
        const pinVerification = await PinService.verifyPin(business, payload.pin)
        if (!pinVerification.valid) {
          await IdempotencyService.fail(identity)
          return response.unauthorized({
            message: pinVerification.message,
            code: pinVerification.code,
          })
        }
      }

      const card = await cardService.topup({
        cardId: Number(params.id),
        ownerType: 'business',
        ownerId: business.id,
        amount: new Money(BigInt(payload.amount), 'USD'),
        correlationId,
      })

      const body = { data: { id: card.id, balance: card.balanceCache.toString(), status: card.status } }
      await IdempotencyService.complete(identity, 200, body)
      return response.ok(body)
    } catch (error) {
      await IdempotencyService.fail(identity)
      return this.handleMoneyActionError(error, response)
    }
  }

  /** PATCH /business/cards/:id/withdraw — moves money back from the card to its funding wallet */
  async withdraw({ business, businessAuthMethod, params, request, correlationId, response }: HttpContext) {
    const payload = await request.validateUsing(businessCardAmountValidator)
    const identity = {
      key: payload.idempotency_key,
      actorType: 'business' as const,
      actorId: business.id,
      endpoint: WITHDRAW_ENDPOINT,
    }

    try {
      const outcome = await IdempotencyService.begin({ ...identity, requestHash: IdempotencyService.hashPayload(payload) })
      if (outcome.replay) return response.status(outcome.status).send(outcome.body)
    } catch (error) {
      const err = error as any
      if (err.name === 'IdempotencyConflictException') return response.conflict({ message: err.message })
      throw error
    }

    try {
      if (businessAuthMethod === 'dashboard') {
        if (!payload.pin) {
          await IdempotencyService.fail(identity)
          return response.badRequest({ message: 'PIN is required to withdraw from a card' })
        }
        const pinVerification = await PinService.verifyPin(business, payload.pin)
        if (!pinVerification.valid) {
          await IdempotencyService.fail(identity)
          return response.unauthorized({
            message: pinVerification.message,
            code: pinVerification.code,
          })
        }
      }

      const card = await cardService.withdraw({
        cardId: Number(params.id),
        ownerType: 'business',
        ownerId: business.id,
        amount: new Money(BigInt(payload.amount), 'USD'),
        correlationId,
      })

      const body = { data: { id: card.id, balance: card.balanceCache.toString(), status: card.status } }
      await IdempotencyService.complete(identity, 200, body)
      return response.ok(body)
    } catch (error) {
      await IdempotencyService.fail(identity)
      return this.handleMoneyActionError(error, response)
    }
  }

  /** PATCH /business/cards/:id/freeze */
  async freeze({ business, params, request, correlationId, response }: HttpContext) {
    await request.validateUsing(businessCardActionValidator)
    try {
      const card = await cardService.freeze(Number(params.id), 'business', business.id, correlationId)
      return response.ok({ data: { id: card.id, status: card.status } })
    } catch (error) {
      return this.handleLookupError(error, response)
    }
  }

  /** PATCH /business/cards/:id/unfreeze */
  async unfreeze({ business, params, request, correlationId, response }: HttpContext) {
    await request.validateUsing(businessCardActionValidator)
    try {
      const card = await cardService.unfreeze(Number(params.id), 'business', business.id, correlationId)
      return response.ok({ data: { id: card.id, status: card.status } })
    } catch (error) {
      return this.handleLookupError(error, response)
    }
  }

  /** POST /business/cards/:id/terminate — irreversible; withdraws any remaining balance first */
  async terminate({ business, params, request, correlationId, response }: HttpContext) {
    await request.validateUsing(businessCardActionValidator)
    try {
      const card = await cardService.terminate(Number(params.id), 'business', business.id, correlationId)
      return response.ok({ data: { id: card.id, status: card.status } })
    } catch (error) {
      return this.handleLookupError(error, response)
    }
  }

  /** GET /business/cards/:id/transactions */
  async transactions({ business, params, request, response }: HttpContext) {
    const payload = await request.validateUsing(listBusinessCardTransactionsValidator)
    try {
      const transactions = await cardService.getTransactions(Number(params.id), 'business', business.id, {
        startDate: payload.start_date,
        endDate: payload.end_date,
        page: payload.page,
        pageSize: payload.page_size,
      })
      return response.ok({ data: transactions })
    } catch (error) {
      return this.handleLookupError(error, response)
    }
  }

  private handleLookupError(error: unknown, response: HttpContext['response']) {
    const err = error as any
    if (err instanceof CardNotFoundException || err.name === 'CardNotFoundException') {
      return response.notFound({ message: err.message })
    }
    if (err instanceof CardOwnershipException || err.name === 'CardOwnershipException') {
      return response.forbidden({ message: err.message })
    }
    if (err instanceof CardStatusException || err.name === 'CardStatusException') {
      return response.badRequest({ message: err.message })
    }
    if (err.name === 'CardProviderException') {
      return response.serviceUnavailable({ message: 'Card provider unavailable, try again' })
    }
    return response.internalServerError({ message: err.message || 'Request failed' })
  }

  private handleMoneyActionError(error: unknown, response: HttpContext['response']) {
    const err = error as any
    if (err instanceof InsufficientWalletBalanceException || err.name === 'InsufficientWalletBalanceException') {
      return response.paymentRequired({ message: err.message })
    }
    return this.handleLookupError(error, response)
  }
}
