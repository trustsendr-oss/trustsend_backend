import { DateTime } from 'luxon'
import type { HttpContext } from '@adonisjs/core/http'
import vine from '@vinejs/vine'
import Card from '#models/card'
import User from '#models/user'
import Business from '#models/business'
import type InternalUser from '#models/internal_user'
import { Money } from '#services/money/money'
import { PayscribeProvider } from '#services/cards/payscribe_provider'
import { AuditLoggerService } from '#services/audit/audit_logger_service'
import {
  CardService,
  CardNotFoundException,
  CardStatusException,
  CardWalletException,
  InsufficientWalletBalanceException,
  type CardOwnerType,
} from '#services/cards/card_service'

const provider = new PayscribeProvider()
const cardService = new CardService(provider)

const listValidator = vine.create({
  page: vine.number().positive().min(1).optional(),
  limit: vine.number().positive().min(1).max(100).optional(),
})

const VALID_STATUSES = ['pending', 'active', 'frozen', 'terminated', 'failed']
const reasonValidator = vine.create({ reason: vine.string().minLength(10).maxLength(255) })
// Smallest-unit, no zero, no leading zeros — mirrors cardAmountValidator in validators/cards.ts.
const topupValidator = vine.create({ amount: vine.string().regex(/^[1-9]\d*$/) })
const createValidator = vine.create({
  owner_type: vine.enum(['user', 'business']),
  owner_id: vine.number().positive(),
  wallet_id: vine.number().positive(),
  brand: vine.enum(['VISA', 'MASTERCARD']),
  amount: vine.string().regex(/^[1-9]\d*$/),
  // Only required when owner_type is 'user' — the User model has no phone column (see
  // validators/cards.ts); a business already has one on file.
  phone: vine.string().minLength(8).maxLength(20).optional(),
})
const transactionsValidator = vine.create({
  start_date: vine
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  end_date: vine
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  page: vine.number().positive().optional(),
  page_size: vine.number().positive().max(100).optional(),
})

/**
 * Platform-wide card visibility + moderation for admins. cards_controller.ts is scoped to
 * auth.user (a cardholder managing their own cards) and its freeze/unfreeze/terminate actions go
 * through CardService.requireOwnedCard(), which only matches the REAL owner. Rather than adding
 * an ownership bypass to CardService (used by money-moving code too — risky to loosen), this
 * resolves the card's actual owner_type/owner_id from the row first and passes those through, so
 * requireOwnedCard's check always matches and no service code changes.
 */
export default class AdminCardsController {
  /** GET /api/v1/admin/cards — filters: status, owner_type (user|business), brand, currency_code. */
  async index({ request, response }: HttpContext) {
    const { page: pageInput, limit: limitInput } = await request.validateUsing(listValidator)
    const page = pageInput || 1
    const limit = limitInput || 25

    const status = request.input('status') as string | undefined
    if (status && !VALID_STATUSES.includes(status)) {
      return response.badRequest({ message: `Invalid status filter: ${status}` })
    }

    const ownerType = request.input('owner_type') as string | undefined
    if (ownerType && !['user', 'business'].includes(ownerType)) {
      return response.badRequest({ message: `Invalid owner_type filter: ${ownerType}` })
    }

    const brand = request.input('brand') as string | undefined
    const currencyCode = request.input('currency_code') as string | undefined

    const query = Card.query().orderBy('created_at', 'desc')
    if (status) query.where('status', status)
    if (ownerType === 'user') query.whereNotNull('user_id')
    if (ownerType === 'business') query.whereNotNull('business_id')
    if (brand) query.where('brand', brand)
    if (currencyCode) query.where('currency_code', currencyCode)

    const paginated = await query.paginate(page, limit)

    return response.ok({
      data: paginated.all().map((c) => ({
        id: c.id,
        owner_type: c.userId ? 'user' : 'business',
        owner_id: c.userId ?? c.businessId,
        brand: c.brand,
        card_type: c.cardType,
        currency_code: c.currencyCode,
        status: c.status,
        masked: c.masked,
        balance: c.balanceCache.toString(),
        created_at: c.createdAt,
      })),
      meta: {
        total: paginated.total,
        page: paginated.currentPage,
        limit,
        last_page: paginated.lastPage,
      },
    })
  }

  /**
   * POST /api/v1/admin/cards — admin-initiated card issuance on behalf of a user or business.
   * Self-service creation (cards_controller.ts store()) requires the cardholder's PIN because
   * it's money-moving; here the caller is an authenticated internal admin, so there's no PIN to
   * check — same bypass reasoning as topup()/freeze()/unfreeze()/terminate() above.
   */
  async store({ auth, request, correlationId, response }: HttpContext) {
    const actor = (await auth.authenticateUsing(['internal'])) as InternalUser
    const payload = await request.validateUsing(createValidator)

    const owner =
      payload.owner_type === 'user'
        ? await User.findOrFail(payload.owner_id)
        : await Business.findOrFail(payload.owner_id)

    if (payload.owner_type === 'user' && !payload.phone) {
      return response.badRequest({ message: 'phone is required when owner_type is user' })
    }

    const fullName =
      payload.owner_type === 'user'
        ? (owner as User).fullName || (owner as User).email
        : (owner as Business).name
    const phone = payload.owner_type === 'user' ? payload.phone! : (owner as Business).phone

    try {
      const { card } = await cardService.createCard({
        owner: {
          ownerType: payload.owner_type,
          ownerId: payload.owner_id,
          fullName,
          email: owner.email,
          phone,
        },
        walletId: payload.wallet_id,
        brand: payload.brand,
        amount: new Money(BigInt(payload.amount), 'USD'),
        correlationId,
      })

      await AuditLoggerService.record({
        actorType: 'internal_user',
        actorId: actor.id,
        action: 'card.admin_created',
        resourceType: 'card',
        resourceId: card.id,
        after: {
          owner_type: payload.owner_type,
          owner_id: payload.owner_id,
          amount: payload.amount,
        },
        correlationId,
      })

      return response.created({
        data: {
          id: card.id,
          owner_type: payload.owner_type,
          owner_id: payload.owner_id,
          brand: card.brand,
          card_type: card.cardType,
          currency_code: card.currencyCode,
          status: card.status,
          masked: card.masked,
          balance: card.balanceCache.toString(),
          created_at: card.createdAt,
        },
      })
    } catch (error) {
      if (error instanceof CardWalletException)
        return response.badRequest({ message: error.message })
      if (error instanceof InsufficientWalletBalanceException)
        return response.paymentRequired({ message: error.message })
      const err = error as any
      if (err.name === 'CardProviderException') {
        return response.serviceUnavailable({ message: 'Card provider unavailable, try again' })
      }
      throw error
    }
  }

  /** Full owner profile for the card show page — an admin reviewing a card needs to see who it
   * belongs to without a separate lookup. User has no phone/status column (see validators/cards.ts). */
  private async loadOwner(userId: number | null, businessId: number | null) {
    if (userId) {
      const user = await User.findOrFail(userId)
      return {
        type: 'user' as const,
        id: user.id,
        code: user.code,
        full_name: user.fullName,
        email: user.email,
        created_at: user.createdAt,
      }
    }
    const business = await Business.findOrFail(businessId!)
    return {
      type: 'business' as const,
      id: business.id,
      code: business.code,
      name: business.name,
      email: business.email,
      phone: business.phone,
      status: business.status,
      created_at: business.createdAt,
    }
  }

  /** GET /api/v1/admin/cards/:id */
  async show({ params, response }: HttpContext) {
    const c = await Card.findOrFail(params.id)
    const owner = await this.loadOwner(c.userId, c.businessId)
    return response.ok({
      data: {
        id: c.id,
        owner_type: c.userId ? 'user' : 'business',
        owner_id: c.userId ?? c.businessId,
        owner,
        wallet_id: c.walletId,
        provider: c.provider,
        brand: c.brand,
        card_type: c.cardType,
        currency_code: c.currencyCode,
        status: c.status,
        first_six: c.firstSix,
        last_four: c.lastFour,
        masked: c.masked,
        balance: c.balanceCache.toString(),
        failure_reason: c.failureReason,
        created_at: c.createdAt,
        updated_at: c.updatedAt,
      },
    })
  }

  private async resolveOwner(
    cardId: number
  ): Promise<{ card: Card; ownerType: CardOwnerType; ownerId: number }> {
    const card = await Card.findOrFail(cardId)
    const ownerType: CardOwnerType = card.userId ? 'user' : 'business'
    const ownerId = (card.userId ?? card.businessId)!
    return { card, ownerType, ownerId }
  }

  /**
   * CardService.freeze/unfreeze/terminate already call AuditLoggerService.record() themselves,
   * but attribute the action to the card's owner (ownerType/ownerId) since that's who the
   * service assumes is calling it self-service. For an admin override that would misattribute
   * the action to the cardholder in the trail, so each admin action additionally records its
   * own entry with the real actor (the internal user).
   */
  private async recordAdminAction(
    action: string,
    cardId: number,
    actorId: number,
    correlationId: string
  ) {
    await AuditLoggerService.record({
      actorType: 'internal_user',
      actorId,
      action,
      resourceType: 'card',
      resourceId: cardId,
      correlationId,
    })
  }

  /** POST /api/v1/admin/cards/:id/freeze */
  async freeze({ auth, params, correlationId, response }: HttpContext) {
    const actor = (await auth.authenticateUsing(['internal'])) as InternalUser
    try {
      const { ownerType, ownerId } = await this.resolveOwner(Number(params.id))
      const card = await cardService.freeze(Number(params.id), ownerType, ownerId, correlationId)
      await this.recordAdminAction('card.admin_frozen', card.id, actor.id, correlationId)
      return response.ok({ data: { id: card.id, status: card.status } })
    } catch (error) {
      if (error instanceof CardNotFoundException)
        return response.notFound({ message: error.message })
      if (error instanceof CardStatusException)
        return response.badRequest({ message: error.message })
      throw error
    }
  }

  /** POST /api/v1/admin/cards/:id/unfreeze */
  async unfreeze({ auth, params, correlationId, response }: HttpContext) {
    const actor = (await auth.authenticateUsing(['internal'])) as InternalUser
    try {
      const { ownerType, ownerId } = await this.resolveOwner(Number(params.id))
      const card = await cardService.unfreeze(Number(params.id), ownerType, ownerId, correlationId)
      await this.recordAdminAction('card.admin_unfrozen', card.id, actor.id, correlationId)
      return response.ok({ data: { id: card.id, status: card.status } })
    } catch (error) {
      if (error instanceof CardNotFoundException)
        return response.notFound({ message: error.message })
      if (error instanceof CardStatusException)
        return response.badRequest({ message: error.message })
      throw error
    }
  }

  /** GET /api/v1/admin/cards/:id/transactions — proxies to the provider; defaults to the last 90 days. */
  async transactions({ params, request, response }: HttpContext) {
    const payload = await request.validateUsing(transactionsValidator)
    try {
      const { card, ownerType, ownerId } = await this.resolveOwner(Number(params.id))
      const transactions = await cardService.getTransactions(card.id, ownerType, ownerId, {
        startDate: payload.start_date || DateTime.now().minus({ days: 90 }).toISODate()!,
        endDate: payload.end_date || DateTime.now().toISODate()!,
        page: payload.page,
        pageSize: payload.page_size,
      })
      return response.ok({ data: transactions })
    } catch (error) {
      if (error instanceof CardNotFoundException)
        return response.notFound({ message: error.message })
      throw error
    }
  }

  /**
   * POST /api/v1/admin/cards/:id/topup — admin-initiated top-up. Self-service topup
   * (cards_controller.ts) requires the cardholder's PIN because it's money-moving; here the
   * caller is an authenticated internal admin instead of the cardholder, so there's no PIN to
   * check — this route's own internal-auth guard is the authorization, same bypass reasoning as
   * freeze/unfreeze/terminate above.
   */
  async topup({ auth, params, request, correlationId, response }: HttpContext) {
    const actor = (await auth.authenticateUsing(['internal'])) as InternalUser
    const { amount } = await request.validateUsing(topupValidator)
    try {
      const { card, ownerType, ownerId } = await this.resolveOwner(Number(params.id))
      const updated = await cardService.topup({
        cardId: card.id,
        ownerType,
        ownerId,
        amount: new Money(BigInt(amount), card.currencyCode),
        correlationId,
      })
      await AuditLoggerService.record({
        actorType: 'internal_user',
        actorId: actor.id,
        action: 'card.admin_topped_up',
        resourceType: 'card',
        resourceId: updated.id,
        after: { amount },
        correlationId,
      })
      return response.ok({
        data: { id: updated.id, balance: updated.balanceCache.toString(), status: updated.status },
      })
    } catch (error) {
      if (error instanceof CardNotFoundException)
        return response.notFound({ message: error.message })
      if (error instanceof CardStatusException)
        return response.badRequest({ message: error.message })
      if (error instanceof InsufficientWalletBalanceException)
        return response.paymentRequired({ message: error.message })
      throw error
    }
  }

  /** POST /api/v1/admin/cards/:id/terminate — requires a reason (mirrors agents/businesses suspend). */
  async terminate({ auth, params, request, correlationId, response }: HttpContext) {
    const actor = (await auth.authenticateUsing(['internal'])) as InternalUser
    const { reason } = await request.validateUsing(reasonValidator)
    try {
      const { ownerType, ownerId } = await this.resolveOwner(Number(params.id))
      const card = await cardService.terminate(Number(params.id), ownerType, ownerId, correlationId)
      await AuditLoggerService.record({
        actorType: 'internal_user',
        actorId: actor.id,
        action: 'card.admin_terminated',
        resourceType: 'card',
        resourceId: card.id,
        after: { reason },
        correlationId,
      })
      return response.ok({ data: { id: card.id, status: card.status } })
    } catch (error) {
      if (error instanceof CardNotFoundException)
        return response.notFound({ message: error.message })
      if (error instanceof CardStatusException)
        return response.badRequest({ message: error.message })
      throw error
    }
  }
}
