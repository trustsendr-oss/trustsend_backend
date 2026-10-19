import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import type LedgerTransaction from '#models/ledger_transaction'
import Agent from '#models/agent'
import Wallet from '#models/wallet'
import { type Money } from '#services/money/money'
import { CashOutHoldService } from '#services/transactions/cash_out_hold_service'
import { LedgerService } from '#services/ledger/ledger_service'
import { AuditLoggerService } from '#services/audit/audit_logger_service'
import { AgentFloatService } from '#services/agents/agent_float_service'

export class FloatTransferService {
  /**
   * Transfer float (agent funds) from parent to child agent
   * Used for: parent provides float to child for operations
   */
  static async initiate(request: {
    fromAgentId: number
    toAgentId: number
    amount: Money
    description?: string
    correlationId: string
  }): Promise<LedgerTransaction> {
    return db.transaction(async (trx) => {
      const fromAgent = await Agent.findOrFail(request.fromAgentId, { client: trx })
      const toAgent = await Agent.findOrFail(request.toAgentId, { client: trx })

      if (fromAgent.status !== 'active') {
        throw new Error(`Sender agent is not active (status: ${fromAgent.status})`)
      }

      if (toAgent.status !== 'active') {
        throw new Error(`Recipient agent is not active (status: ${toAgent.status})`)
      }

      // Both floats in the transfer's currency; the child's is opened on first receipt.
      const fromFloat = await AgentFloatService.requireFloatWallet(
        fromAgent,
        request.amount.currencyCode,
        trx
      )
      const toFloat = await AgentFloatService.ensureFloatWallet(
        toAgent,
        request.amount.currencyCode,
        trx
      )

      const [fromWallet, toWallet] = await this.lockPair(fromFloat.id, toFloat.id, trx)

      if (fromWallet.status !== 'active') {
        throw new Error(`Sender wallet is not active (status: ${fromWallet.status})`)
      }

      if (toWallet.status !== 'active') {
        throw new Error(`Recipient wallet is not active (status: ${toWallet.status})`)
      }

      if (fromWallet.balanceCache < request.amount.amount) {
        throw new Error('Insufficient float balance')
      }

      const txn = await LedgerService.postTransaction(
        'agent_float_transfer',
        [
          {
            accountId: await AgentFloatService.ledgerAccountId(fromWallet.id, 'agent_wallet', trx),
            direction: 'debit',
            amount: request.amount,
          },
          {
            accountId: await AgentFloatService.ledgerAccountId(toWallet.id, 'agent_wallet', trx),
            direction: 'credit',
            amount: request.amount,
          },
        ],
        'agent',
        fromAgent.id,
        {
          correlationId: request.correlationId,
          description:
            request.description ||
            `Float transfer from agent ${request.fromAgentId} to ${request.toAgentId}`,
          metadata: {
            from_agent_id: request.fromAgentId,
            to_agent_id: request.toAgentId,
          },
          amount: request.amount,
          paymentMethod: 'float_transfer',
          trx,
        }
      )

      await AuditLoggerService.record({
        actorType: 'agent',
        actorId: fromAgent.id,
        action: 'transaction.float_transfer.initiated',
        resourceType: 'ledger_transaction',
        resourceId: txn.id,
        before: undefined,
        after: {
          from_agent_id: request.fromAgentId,
          to_agent_id: request.toAgentId,
          amount: request.amount.amount.toString(),
          currency_code: request.amount.currencyCode,
        },
        correlationId: request.correlationId,
        trx,
      })

      return txn
    })
  }

  /**
   * An agent moves money from their OWN personal wallet (the account they log in as, per
   * Agent.userId) into their own float wallet. Unlike initiate() above there's no hierarchy or
   * counterparty to validate — it's the same person funding their own operational float from
   * money they already hold on the platform, e.g. after a mobile money deposit into their
   * personal wallet.
   */
  static async convertFromPersonalWallet(request: {
    agentId: number
    amount: Money
    correlationId: string
  }): Promise<LedgerTransaction> {
    return db.transaction(async (trx) => {
      const agent = await Agent.findOrFail(request.agentId, { client: trx })

      if (agent.status !== 'active') {
        throw new Error(`Agent is not active (status: ${agent.status})`)
      }

      const personalWalletRow = await this.personalWallet(agent, request.amount.currencyCode, trx)
      const floatRow = await AgentFloatService.ensureFloatWallet(
        agent,
        request.amount.currencyCode,
        trx
      )
      const [personalWallet, floatWallet] = await this.lockPair(
        personalWalletRow.id,
        floatRow.id,
        trx
      )

      if (personalWallet.status !== 'active') {
        throw new Error(`Personal wallet is not active (status: ${personalWallet.status})`)
      }
      if (floatWallet.status !== 'active') {
        throw new Error(`Float wallet is not active (status: ${floatWallet.status})`)
      }
      if (personalWallet.balanceCache < request.amount.amount) {
        throw new Error('Insufficient personal wallet balance')
      }
      await CashOutHoldService.assertAvailable(personalWallet, request.amount.amount, trx)

      const txn = await LedgerService.postTransaction(
        'agent_float_conversion',
        [
          {
            accountId: await AgentFloatService.ledgerAccountId(
              personalWallet.id,
              'user_wallet',
              trx
            ),
            direction: 'debit',
            amount: request.amount,
          },
          {
            accountId: await AgentFloatService.ledgerAccountId(floatWallet.id, 'agent_wallet', trx),
            direction: 'credit',
            amount: request.amount,
          },
        ],
        'agent',
        agent.id,
        {
          correlationId: request.correlationId,
          description: `Agent ${agent.id} converted personal funds into float`,
          metadata: { agent_id: agent.id },
          amount: request.amount,
          paymentMethod: 'float_transfer',
          trx,
        }
      )

      await AuditLoggerService.record({
        actorType: 'agent',
        actorId: agent.id,
        action: 'agent.float_converted',
        resourceType: 'ledger_transaction',
        resourceId: txn.id,
        after: {
          amount: request.amount.amount.toString(),
          currency_code: request.amount.currencyCode,
        },
        correlationId: request.correlationId,
        trx,
      })

      return txn
    })
  }

  /**
   * The reverse of convertFromPersonalWallet(): an agent takes float — commissions earned, or
   * float they no longer need — back into their own personal wallet, from where it can be spent
   * or withdrawn like any other money. This is also how a float is brought to zero before
   * AgentTerminationService will close it.
   *
   * Allowed while suspended too: suspension stops an agent serving customers, it does not
   * confiscate their float, and the personal wallet stays under the platform's usual controls.
   */
  static async withdrawToPersonalWallet(request: {
    agentId: number
    amount: Money
    correlationId: string
  }): Promise<LedgerTransaction> {
    return db.transaction(async (trx) => {
      const agent = await Agent.findOrFail(request.agentId, { client: trx })

      if (agent.status !== 'active' && agent.status !== 'suspended') {
        throw new Error(`Agent cannot withdraw float (status: ${agent.status})`)
      }

      const personalWalletRow = await this.personalWallet(agent, request.amount.currencyCode, trx)
      const floatRow = await AgentFloatService.requireFloatWallet(
        agent,
        request.amount.currencyCode,
        trx
      )
      const [floatWallet, personalWallet] = await this.lockPair(
        floatRow.id,
        personalWalletRow.id,
        trx
      )

      if (floatWallet.status !== 'active') {
        throw new Error(`Float wallet is not active (status: ${floatWallet.status})`)
      }
      if (personalWallet.status !== 'active') {
        throw new Error(`Personal wallet is not active (status: ${personalWallet.status})`)
      }
      if (floatWallet.balanceCache < request.amount.amount) {
        throw new Error('Insufficient float balance')
      }

      const txn = await LedgerService.postTransaction(
        'agent_float_withdrawal',
        [
          {
            accountId: await AgentFloatService.ledgerAccountId(floatWallet.id, 'agent_wallet', trx),
            direction: 'debit',
            amount: request.amount,
          },
          {
            accountId: await AgentFloatService.ledgerAccountId(
              personalWallet.id,
              'user_wallet',
              trx
            ),
            direction: 'credit',
            amount: request.amount,
          },
        ],
        'agent',
        agent.id,
        {
          correlationId: request.correlationId,
          description: `Agent ${agent.id} withdrew float to personal wallet`,
          metadata: { agent_id: agent.id },
          amount: request.amount,
          paymentMethod: 'float_transfer',
          trx,
        }
      )

      await AuditLoggerService.record({
        actorType: 'agent',
        actorId: agent.id,
        action: 'agent.float_withdrawn',
        resourceType: 'ledger_transaction',
        resourceId: txn.id,
        after: {
          amount: request.amount.amount.toString(),
          currency_code: request.amount.currencyCode,
        },
        correlationId: request.correlationId,
        trx,
      })

      return txn
    })
  }

  /** The agent's own spendable wallet in a currency — never a savings escrow. */
  private static async personalWallet(
    agent: Agent,
    currencyCode: string,
    trx: TransactionClientContract
  ): Promise<Wallet> {
    if (!agent.userId) {
      throw new Error('Agent has no linked personal account')
    }
    const wallet = await Wallet.query({ client: trx })
      .withScopes((s) => s.primary())
      .where('user_id', agent.userId)
      .where('currency_code', currencyCode)
      .first()
    if (!wallet) {
      throw new Error(`No ${currencyCode} personal wallet found for this agent`)
    }
    return wallet
  }

  /**
   * Locks two wallets in ascending id order — the order every money path uses, so two
   * transactions touching the same pair can never deadlock — and returns them as asked.
   */
  private static async lockPair(
    firstId: number,
    secondId: number,
    trx: TransactionClientContract
  ): Promise<[Wallet, Wallet]> {
    const locked = await Wallet.query({ client: trx })
      .whereIn('id', [firstId, secondId])
      .orderBy('id', 'asc')
      .forUpdate()
    const first = locked.find((w) => w.id === firstId)
    const second = locked.find((w) => w.id === secondId)
    if (!first || !second) throw new Error('Wallet not found')
    return [first, second]
  }
}
