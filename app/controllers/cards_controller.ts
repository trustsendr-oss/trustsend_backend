import type { HttpContext } from '@adonisjs/core/http'
import type User from '#models/user'
import CardProduct from '#models/card_product'
import { Money } from '#services/money/money'
import { CardProductService, serializeCardProduct } from '#services/cards/card_product_service'
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
  createCardValidator,
  cardAmountValidator,
  cardActionValidator,
  listCardTransactionsValidator,
} from '#validators/cards'

const provider = new PayscribeProvider()
const cardService = new CardService(provider)

const CREATE_CARD_ENDPOINT = 'POST /api/v1/cards'
const TOPUP_ENDPOINT = 'PATCH /api/v1/cards/:id/topup'
const WITHDRAW_ENDPOINT = 'PATCH /api/v1/cards/:id/withdraw'
/**
 * La catégorie d'une carte, ou `null`.
 *
 * `null` couvre deux cas qu'il n'y a pas lieu de distinguer côté client : une carte émise avant
 * l'existence du catalogue, et une catégorie supprimée de la base. Dans les deux cas il n'y a
 * rien à afficher, et l'écran retombe sur son rendu par défaut.
 */
function productOf(
  products: Map<number, CardProduct>,
  id: number | null
): ReturnType<typeof serializeCardProduct> | null {
  if (id === null) return null
  const product = products.get(id)
  return product ? serializeCardProduct(product) : null
}

export default class CardsController {
  /** GET /api/v1/cards — list the authenticated user's cards */
  async index({ auth, response }: HttpContext) {
    const user = auth.user
    if (!user) return response.unauthorized({ message: 'Unauthenticated' })

    const cards = await cardService.listForOwner('user', user.id)
    // Chargées en une fois : résoudre la catégorie carte par carte ferait autant de requêtes
    // que de cartes affichées.
    const products = await CardProductService.mapByIds(cards.map((c) => c.cardProductId))

    return response.ok({
      data: cards.map((c) => ({
        id: c.id,
        provider_card_id: c.providerCardId,
        card_product_id: c.cardProductId,
        // La catégorie complète, et pas seulement son identifiant : sans elle le client devait
        // aller la rechercher dans le catalogue pour afficher un nom ou un visuel.
        card_product: productOf(products, c.cardProductId),
        // The funding wallet: a top-up debits it and a withdrawal credits it back, so a client
        // cannot check either move against a balance without knowing which wallet it is.
        wallet_id: c.walletId,
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

  /** POST /api/v1/cards — create and fund a new card from one of the user's own wallets */
  async store({ auth, request, correlationId, response }: HttpContext) {
    const user = auth.user as User
    if (!user) return response.unauthorized({ message: 'Unauthenticated' })

    const payload = await request.validateUsing(createCardValidator)
    const currencyCode = payload.currency_code || 'USD'

    const identity = {
      key: payload.idempotency_key,
      actorType: 'user' as const,
      actorId: user.id,
      endpoint: CREATE_CARD_ENDPOINT,
    }

    try {
      const outcome = await IdempotencyService.begin({
        ...identity,
        requestHash: IdempotencyService.hashPayload(payload),
      })
      if (outcome.replay) return response.status(outcome.status).send(outcome.body)
    } catch (error) {
      const err = error as any
      if (err.name === 'IdempotencyConflictException')
        return response.conflict({ message: err.message })
      throw error
    }

    try {
      const pinVerification = await PinService.verifyPin(user, payload.pin)
      if (!pinVerification.valid) {
        await IdempotencyService.fail(identity)
        return response.unauthorized({
          message: pinVerification.message,
          code: pinVerification.code,
        })
      }

      const { card, details } = await cardService.createCard({
        owner: {
          ownerType: 'user',
          ownerId: user.id,
          fullName: user.fullName || user.email,
          email: user.email,
          phone: payload.phone,
        },
        walletId: payload.wallet_id,
        brand: payload.brand,
        amount: new Money(BigInt(payload.amount), currencyCode),
        cardProductId: payload.card_product_id ?? null,
        correlationId,
      })

      const cardProduct = card.cardProductId ? await CardProduct.find(card.cardProductId) : null

      const body = {
        data: {
          id: card.id,
          wallet_id: card.walletId,
          card_product_id: card.cardProductId,
          card_product: cardProduct ? serializeCardProduct(cardProduct) : null,
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
      if (
        err.name === 'InsufficientWalletBalanceException' ||
        err instanceof InsufficientWalletBalanceException
      ) {
        return response.paymentRequired({ message: err.message })
      }
      if (err.name === 'CardProviderException') {
        return response.serviceUnavailable({ message: 'Card provider unavailable, try again' })
      }
      return response.internalServerError({ message: err.message || 'Card creation failed' })
    }
  }

  /** GET /api/v1/cards/:id — decrypted card details, straight from the provider, never persisted */
  async show({ auth, params, response }: HttpContext) {
    const user = auth.user
    if (!user) return response.unauthorized({ message: 'Unauthenticated' })

    try {
      const { card, details } = await cardService.getDetails(Number(params.id), 'user', user.id)
      const cardProduct = card.cardProductId ? await CardProduct.find(card.cardProductId) : null

      return response.ok({
        data: {
          id: card.id,
          wallet_id: card.walletId,
          card_product_id: card.cardProductId,
          card_product: cardProduct ? serializeCardProduct(cardProduct) : null,
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

  /** PATCH /api/v1/cards/:id/topup */
  async topup({ auth, params, request, correlationId, response }: HttpContext) {
    const user = auth.user as User
    if (!user) return response.unauthorized({ message: 'Unauthenticated' })

    const payload = await request.validateUsing(cardAmountValidator)
    const identity = {
      key: payload.idempotency_key,
      actorType: 'user' as const,
      actorId: user.id,
      endpoint: TOPUP_ENDPOINT,
    }

    try {
      const outcome = await IdempotencyService.begin({
        ...identity,
        requestHash: IdempotencyService.hashPayload(payload),
      })
      if (outcome.replay) return response.status(outcome.status).send(outcome.body)
    } catch (error) {
      const err = error as any
      if (err.name === 'IdempotencyConflictException')
        return response.conflict({ message: err.message })
      throw error
    }

    try {
      const pinVerification = await PinService.verifyPin(user, payload.pin)
      if (!pinVerification.valid) {
        await IdempotencyService.fail(identity)
        return response.unauthorized({
          message: pinVerification.message,
          code: pinVerification.code,
        })
      }

      const card = await cardService.topup({
        cardId: Number(params.id),
        ownerType: 'user',
        ownerId: user.id,
        amount: new Money(BigInt(payload.amount), 'USD'),
        correlationId,
      })

      const body = {
        data: { id: card.id, balance: card.balanceCache.toString(), status: card.status },
      }
      await IdempotencyService.complete(identity, 200, body)
      return response.ok(body)
    } catch (error) {
      await IdempotencyService.fail(identity)
      return this.handleMoneyActionError(error, response)
    }
  }

  /** PATCH /api/v1/cards/:id/withdraw — moves money back from the card to its funding wallet */
  async withdraw({ auth, params, request, correlationId, response }: HttpContext) {
    const user = auth.user as User
    if (!user) return response.unauthorized({ message: 'Unauthenticated' })

    const payload = await request.validateUsing(cardAmountValidator)
    const identity = {
      key: payload.idempotency_key,
      actorType: 'user' as const,
      actorId: user.id,
      endpoint: WITHDRAW_ENDPOINT,
    }

    try {
      const outcome = await IdempotencyService.begin({
        ...identity,
        requestHash: IdempotencyService.hashPayload(payload),
      })
      if (outcome.replay) return response.status(outcome.status).send(outcome.body)
    } catch (error) {
      const err = error as any
      if (err.name === 'IdempotencyConflictException')
        return response.conflict({ message: err.message })
      throw error
    }

    try {
      const pinVerification = await PinService.verifyPin(user, payload.pin)
      if (!pinVerification.valid) {
        await IdempotencyService.fail(identity)
        return response.unauthorized({
          message: pinVerification.message,
          code: pinVerification.code,
        })
      }

      const card = await cardService.withdraw({
        cardId: Number(params.id),
        ownerType: 'user',
        ownerId: user.id,
        amount: new Money(BigInt(payload.amount), 'USD'),
        correlationId,
      })

      const body = {
        data: { id: card.id, balance: card.balanceCache.toString(), status: card.status },
      }
      await IdempotencyService.complete(identity, 200, body)
      return response.ok(body)
    } catch (error) {
      await IdempotencyService.fail(identity)
      return this.handleMoneyActionError(error, response)
    }
  }

  /** PATCH /api/v1/cards/:id/freeze */
  async freeze({ auth, params, request, correlationId, response }: HttpContext) {
    const user = auth.user
    if (!user) return response.unauthorized({ message: 'Unauthenticated' })
    await request.validateUsing(cardActionValidator)

    try {
      const card = await cardService.freeze(Number(params.id), 'user', user.id, correlationId)
      return response.ok({ data: { id: card.id, status: card.status } })
    } catch (error) {
      return this.handleLookupError(error, response)
    }
  }

  /** PATCH /api/v1/cards/:id/unfreeze */
  async unfreeze({ auth, params, request, correlationId, response }: HttpContext) {
    const user = auth.user
    if (!user) return response.unauthorized({ message: 'Unauthenticated' })
    await request.validateUsing(cardActionValidator)

    try {
      const card = await cardService.unfreeze(Number(params.id), 'user', user.id, correlationId)
      return response.ok({ data: { id: card.id, status: card.status } })
    } catch (error) {
      return this.handleLookupError(error, response)
    }
  }

  /** POST /api/v1/cards/:id/terminate — irreversible; withdraws any remaining balance first */
  async terminate({ auth, params, request, correlationId, response }: HttpContext) {
    const user = auth.user
    if (!user) return response.unauthorized({ message: 'Unauthenticated' })
    await request.validateUsing(cardActionValidator)

    try {
      const card = await cardService.terminate(Number(params.id), 'user', user.id, correlationId)
      return response.ok({ data: { id: card.id, status: card.status } })
    } catch (error) {
      return this.handleLookupError(error, response)
    }
  }

  /** GET /api/v1/cards/:id/transactions */
  async transactions({ auth, params, request, response }: HttpContext) {
    const user = auth.user
    if (!user) return response.unauthorized({ message: 'Unauthenticated' })

    const payload = await request.validateUsing(listCardTransactionsValidator)

    try {
      const page = await cardService.getTransactions(Number(params.id), 'user', user.id, {
        startDate: payload.start_date,
        endDate: payload.end_date,
        page: payload.page,
        pageSize: payload.page_size,
      })

      return response.ok({
        data: page.transactions.map((t) => ({
          id: t.transactionId,
          kind: t.kind,
          status: t.status,
          amount: t.amount,
          currency_code: t.currencyCode,
          balance_after: t.balanceAfter,
          description: t.description,
          created_at: t.createdAt,
        })),
        // Dropped until now, which left every client unable to page: the provider reports the
        // full count while returning one page of it.
        meta: { total: page.total, page: page.page, limit: page.pageSize },
      })
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
    // Plafond de catégorie atteint ou catégorie retirée de la vente : le message est rédigé
    // pour le porteur, il doit lui parvenir tel quel plutôt que sous un 500 muet.
    if (err.name === 'CardProductLimitException') {
      return response.badRequest({ message: err.message })
    }
    if (err.name === 'CardProductUnavailableException') {
      return response.conflict({ message: err.message })
    }
    if (err.name === 'CardProductNotFoundException') {
      return response.notFound({ message: err.message })
    }
    return response.internalServerError({ message: err.message || 'Request failed' })
  }

  private handleMoneyActionError(error: unknown, response: HttpContext['response']) {
    const err = error as any
    if (
      err instanceof InsufficientWalletBalanceException ||
      err.name === 'InsufficientWalletBalanceException'
    ) {
      return response.paymentRequired({ message: err.message })
    }
    return this.handleLookupError(error, response)
  }
}
