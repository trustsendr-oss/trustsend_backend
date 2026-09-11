import db from '@adonisjs/lucid/services/db'
import LedgerTransaction from '#models/ledger_transaction'
import Wallet from '#models/wallet'
import { Money } from '#services/money/money'
import { LedgerService } from '#services/ledger/ledger_service'
import { AuditLoggerService } from '#services/audit/audit_logger_service'

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
      // Import Agent model to check status
      const Agent = (await import('#models/agent')).default

      // Load agents and verify status
      const fromAgent = await Agent.findOrFail(request.fromAgentId, { client: trx })
      const toAgent = await Agent.findOrFail(request.toAgentId, { client: trx })

      if (fromAgent.status !== 'active') {
        throw new Error(`Sender agent is not active (status: ${fromAgent.status})`)
      }

      if (toAgent.status !== 'active') {
        throw new Error(`Recipient agent is not active (status: ${toAgent.status})`)
      }

      // Load both wallets
      const fromAgentData = await db.query()
        .from('agents')
        .where('id', request.fromAgentId)
        .select('wallet_id')
        .useTransaction(trx)
        .first()

      const toAgentData = await db.query()
        .from('agents')
        .where('id', request.toAgentId)
        .select('wallet_id')
        .useTransaction(trx)
        .first()

      if (!fromAgentData || !toAgentData) {
        throw new Error('Agent wallet not found')
      }

      // Lock both wallets in deterministic (ascending id) order to avoid cross-transaction
      // deadlocks with other operations touching the same two wallets.
      const walletIds = [fromAgentData.wallet_id, toAgentData.wallet_id].sort((a, b) => a - b)
      const lockedWallets = await Wallet.query({ client: trx })
        .whereIn('id', walletIds)
        .orderBy('id', 'asc')
        .forUpdate()

      const fromWallet = lockedWallets.find((w) => w.id === fromAgentData.wallet_id)
      const toWallet = lockedWallets.find((w) => w.id === toAgentData.wallet_id)

      if (!fromWallet || !toWallet) {
        throw new Error('Agent wallet not found')
      }

      // Validate both wallets are active
      if (fromWallet.status !== 'active') {
        throw new Error(`Sender wallet is not active (status: ${fromWallet.status})`)
      }

      if (toWallet.status !== 'active') {
        throw new Error(`Recipient wallet is not active (status: ${toWallet.status})`)
      }

      // Validate same currency
      if (fromWallet.currencyCode !== toWallet.currencyCode) {
        throw new Error(
          `Cannot transfer ${fromWallet.currencyCode} to ${toWallet.currencyCode} wallet`
        )
      }

      if (fromWallet.balanceCache < request.amount.amount) {
        throw new Error('Insufficient float balance')
      }

      // Create double-entry
      const txn = await LedgerService.postTransaction(
        'agent_float_transfer',
        [
          {
            accountId: (await db.query().from('ledger_accounts').where('owner_id', fromWallet.id).select('id').first())?.id || 0,
            direction: 'debit',
            amount: request.amount,
          },
          {
            accountId: (await db.query().from('ledger_accounts').where('owner_id', toWallet.id).select('id').first())?.id || 0,
            direction: 'credit',
            amount: request.amount,
          },
        ],
        'system',
        0,
        {
          correlationId: request.correlationId,
          description: request.description || `Float transfer from agent ${request.fromAgentId} to ${request.toAgentId}`,
          metadata: {
            from_agent_id: request.fromAgentId,
            to_agent_id: request.toAgentId,
          },
          amount: request.amount,
          paymentMethod: 'float_transfer',
          trx,
        }
      )

      // Audit
      await AuditLoggerService.record({
        actorType: 'system',
        actorId: 0,
        action: 'transaction.float_transfer.initiated',
        resourceType: 'ledger_transaction',
        resourceId: txn.id,
        before: undefined,
        after: {
          from_agent_id: request.fromAgentId,
          to_agent_id: request.toAgentId,
          amount: request.amount.amount.toString(),
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
      const Agent = (await import('#models/agent')).default
      const agent = await Agent.findOrFail(request.agentId, { client: trx })

      if (agent.status !== 'active') {
        throw new Error(`Agent is not active (status: ${agent.status})`)
      }
      if (!agent.userId) {
        throw new Error('Agent has no linked personal account to convert funds from')
      }
      if (!agent.walletId) {
        throw new Error('Agent has no float wallet configured')
      }

      // Lock both wallets in deterministic (ascending id) order — same reasoning as initiate().
      const personalWalletRow = await Wallet.query({ client: trx })
        .where('user_id', agent.userId)
        .where('currency_code', request.amount.currencyCode)
        .first()
      if (!personalWalletRow) {
        throw new Error(`No ${request.amount.currencyCode} personal wallet found for this agent`)
      }

      const walletIds = [personalWalletRow.id, agent.walletId].sort((a, b) => a - b)
      const lockedWallets = await Wallet.query({ client: trx })
        .whereIn('id', walletIds)
        .orderBy('id', 'asc')
        .forUpdate()

      const personalWallet = lockedWallets.find((w) => w.id === personalWalletRow.id)!
      const floatWallet = lockedWallets.find((w) => w.id === agent.walletId)!

      if (personalWallet.status !== 'active') {
        throw new Error(`Personal wallet is not active (status: ${personalWallet.status})`)
      }
      if (floatWallet.status !== 'active') {
        throw new Error(`Float wallet is not active (status: ${floatWallet.status})`)
      }
      if (personalWallet.balanceCache < request.amount.amount) {
        throw new Error('Insufficient personal wallet balance')
      }

      const personalAccount = await db
        .query()
        .from('ledger_accounts')
        .where('owner_id', personalWallet.id)
        .select('id')
        .useTransaction(trx)
        .first()
      const floatAccount = await db
        .query()
        .from('ledger_accounts')
        .where('owner_id', floatWallet.id)
        .select('id')
        .useTransaction(trx)
        .first()
      if (!personalAccount || !floatAccount) {
        throw new Error('Ledger account not found for wallet')
      }

      const txn = await LedgerService.postTransaction(
        'agent_float_conversion',
        [
          { accountId: personalAccount.id, direction: 'debit', amount: request.amount },
          { accountId: floatAccount.id, direction: 'credit', amount: request.amount },
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
        after: { amount: request.amount.amount.toString() },
        correlationId: request.correlationId,
        trx,
      })

      return txn
    })
  }
}
