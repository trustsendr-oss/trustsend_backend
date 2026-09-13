import type { HttpContext } from '@adonisjs/core/http'
import Agent from '#models/agent'
import User from '#models/user'
import Wallet from '#models/wallet'
import vine from '@vinejs/vine'
import { CurrencyService } from '#services/money/currency_service'

/**
 * Directory lookups — resolving a code someone gave you into a payee.
 *
 * These exist because the client apps had no way to address a transfer at all:
 * POST /transfers/p2p takes a `recipient_wallet_id` (a database id) and POST /cash-out takes a
 * 9-digit `agent_code`, neither of which a person can know or type. Without this, the only
 * usable flow was to already have the recipient's internal wallet id.
 *
 * Deliberately **exact-match only**, on the code the account holder chooses to share. There is
 * no partial/fuzzy search and no lookup by email or phone: those would turn this into a
 * directory-scraping and account-existence oracle over the whole user base. The responses carry
 * the minimum needed to confirm "yes, this is the right person" before sending money — name,
 * initials and the wallet id — and never an email, phone number or balance.
 *
 * Both are throttled on top of that, since a 9-digit code space is enumerable given enough
 * requests (see throttle_middleware.ts for the per-instance caveat).
 */

const lookupRecipientValidator = vine.create({
  code: vine.string().regex(/^\d{9}$/),
  // Which of the recipient's wallets to credit. Defaults to USD, matching the wallet every
  // account is created with (see UserOnboardingService.createDefaultWallet).
  currency_code: vine.string().fixedLength(3).optional(),
})

const lookupAgentValidator = vine.create({
  code: vine.string().regex(/^\d{9}$/),
})

export default class DirectoryController {
  /**
   * GET /api/v1/directory/recipients?code=123456789&currency_code=USD
   * Resolves a user's shareable code into the wallet id a P2P transfer must target.
   */
  async lookupRecipient({ auth, request, response }: HttpContext) {
    const caller = auth.user
    if (!caller) {
      return response.unauthorized({ message: 'Unauthenticated' })
    }

    const { code, currency_code: currencyCode } =
      await request.validateUsing(lookupRecipientValidator)
    const currency = (currencyCode ?? 'USD').toUpperCase()

    const recipient = await User.findBy('code', code)
    if (!recipient) {
      return response.notFound({ message: 'No account matches this code' })
    }

    // Caught here rather than at transfer time so the app can say so while the user is still
    // typing, instead of after they've entered an amount and their PIN.
    if (recipient.id === caller.id) {
      return response.unprocessableEntity({
        message: 'You cannot transfer money to yourself',
      })
    }

    const wallet = await Wallet.query()
      .where('user_id', recipient.id)
      .where('currency_code', currency)
      .where('status', 'active')
      .first()

    if (!wallet) {
      return response.notFound({
        message: `This account has no active ${currency} wallet`,
      })
    }

    const walletCurrency = (await CurrencyService.serializeMany([wallet.currencyCode])).get(wallet.currencyCode)!

    return response.ok({
      data: {
        user: {
          id: recipient.id,
          full_name: recipient.fullName,
          initials: recipient.initials,
          code: recipient.code,
        },
        wallet: {
          id: wallet.id,
          currency_code: wallet.currencyCode,
          logo_url: walletCurrency.logo_url,
          currency: walletCurrency,
        },
      },
    })
  }

  /**
   * GET /api/v1/directory/agents?code=123456789
   * Resolves the code displayed at an agent's counter, so a cash-out can name who it is for.
   */
  async lookupAgent({ auth, request, response }: HttpContext) {
    const caller = auth.user
    if (!caller) {
      return response.unauthorized({ message: 'Unauthenticated' })
    }

    const { code } = await request.validateUsing(lookupAgentValidator)

    const agent = await Agent.query().where('code', code).first()
    if (!agent) {
      return response.notFound({ message: 'No agent matches this code' })
    }

    // A suspended or terminated agent is reported as unusable rather than as missing: the code
    // on the shopfront is real, and "not found" would send the customer looking for a typo.
    if (agent.status !== 'active') {
      return response.unprocessableEntity({
        message: 'This agent is not currently accepting withdrawals',
      })
    }

    return response.ok({
      data: {
        id: agent.id,
        code: agent.code,
        name: agent.businessName ?? agent.fullName,
        city: agent.city,
        region: agent.region,
        tier: agent.tier,
      },
    })
  }
}
