import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import type Agent from '#models/agent'
import Wallet from '#models/wallet'
import LedgerAccount from '#models/ledger_account'
import { LedgerService } from '#services/ledger/ledger_service'

export class NoFloatInCurrencyException extends Error {
  constructor(public currencyCode: string) {
    super(`This agent holds no ${currencyCode} float`)
    this.name = 'NoFloatInCurrencyException'
  }
}

/**
 * An agent's float, one wallet per currency.
 *
 * Onboarding opens a USD float (agents.wallet_id). A counter in the DRC pays out in USD and CDF
 * at the same window, and LedgerService does not check that an entry's currency matches its
 * account's — so resolving "the" float from agents.wallet_id alone would book a CDF amount on a
 * USD wallet. Every money path resolves the float for the currency it moves instead.
 *
 * ## Commission on cash
 *
 * A deposit is free for the customer: they are credited the full amount, and TumaPlus pays the
 * agent `commission_rate` % of it out of AGENT_CASH_COMMISSION (an expense). A withdrawal costs
 * the customer `commission_rate` % on top of the amount, credited to the agent's float with the
 * amount itself. Either way the agent's float ends up ahead by the commission, never behind.
 *
 * An institution's counter earns nothing from TumaPlus and charges nothing through it: it is the
 * institution's own window (see institution_outlet_service.ts), not an agent TumaPlus pays.
 */
export class AgentFloatService {
  static async floatWallet(
    agent: Agent,
    currencyCode: string,
    trx?: TransactionClientContract
  ): Promise<Wallet | null> {
    return Wallet.query(trx ? { client: trx } : {})
      .withScopes((s) => s.primary())
      .where('agent_id', agent.id)
      .where('currency_code', currencyCode)
      .first()
  }

  /** @throws NoFloatInCurrencyException when the agent never held this currency. */
  static async requireFloatWallet(
    agent: Agent,
    currencyCode: string,
    trx?: TransactionClientContract
  ): Promise<Wallet> {
    const wallet = await this.floatWallet(agent, currencyCode, trx)
    if (!wallet) throw new NoFloatInCurrencyException(currencyCode)
    return wallet
  }

  /**
   * The float for a currency, opened empty on first use — for paths that only ever CREDIT it
   * (a withdrawal paid out, a remittance paid, float received), where an empty wallet is fine.
   */
  static async ensureFloatWallet(
    agent: Agent,
    currencyCode: string,
    trx: TransactionClientContract
  ): Promise<Wallet> {
    const existing = await this.floatWallet(agent, currencyCode, trx)
    if (existing) return existing

    // Same shape as AgentOnboardingService.create(); the USD float keeps its historical code.
    const account = new LedgerAccount()
    account.code = `AGENT_WALLET.${agent.code}.${currencyCode}`
    account.name = `${currencyCode} float for agent ${agent.fullName}`
    account.accountType = 'asset'
    account.ownerType = 'agent_wallet'
    account.ownerId = agent.id
    account.currencyCode = currencyCode
    account.status = 'active'
    await account.useTransaction(trx).save()

    const wallet = new Wallet()
    wallet.agentId = agent.id
    wallet.ledgerAccountId = account.id
    wallet.currencyCode = currencyCode
    wallet.balanceCache = 0n
    wallet.purpose = 'primary'
    wallet.status = 'active'
    await wallet.useTransaction(trx).save()

    account.ownerId = wallet.id
    await account.useTransaction(trx).save()

    return wallet
  }

  static async allFloatWallets(agent: Agent, trx?: TransactionClientContract): Promise<Wallet[]> {
    return Wallet.query(trx ? { client: trx } : {})
      .where('agent_id', agent.id)
      .orderBy('id', 'asc')
  }

  static async ledgerAccountId(
    walletId: number,
    ownerType: 'agent_wallet' | 'user_wallet',
    trx: TransactionClientContract
  ): Promise<number> {
    const account = await db
      .from('ledger_accounts')
      .where('owner_id', walletId)
      .where('owner_type', ownerType)
      .select('id')
      .useTransaction(trx)
      .first()
    if (!account) throw new Error(`Ledger account not found for wallet ${walletId}`)
    return account.id
  }

  /** The agent's cash commission rate in percent; 0 for an institution's counter. */
  static commissionRate(agent: Agent): number {
    return agent.businessId ? 0 : Number(agent.commissionRate)
  }

  /** `rate` % of `amount`, rounded half up to the smallest unit. */
  static commissionOn(amount: bigint, rate: number): bigint {
    const bps = BigInt(Math.round(rate * 100)) // 2.5 % → 250
    return (amount * bps + 5000n) / 10000n
  }

  static async commissionExpenseAccount(currencyCode: string, trx: TransactionClientContract) {
    return LedgerService.getOrCreatePlatformAccount(
      `AGENT_CASH_COMMISSION.${currencyCode}`,
      `Agent cash commissions (${currencyCode})`,
      currencyCode,
      trx,
      'expense'
    )
  }
}
