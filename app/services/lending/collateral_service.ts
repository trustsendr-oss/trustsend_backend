import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import Loan from '#models/loan'
import SavingsAccount from '#models/savings_account'
import Wallet from '#models/wallet'
import type BusinessStaff from '#models/business_staff'
import { AuditLoggerService } from '#services/audit/audit_logger_service'
import { LedgerService } from '#services/ledger/ledger_service'
import { Money } from '#services/money/money'

export class CollateralException extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CollateralException'
  }
}

export class CollateralService {
  /**
   * Lock/pledge cash collateral on a savings account for an active loan.
   */
  static async lockCollateral(
    loan: Loan,
    savingsAccount: SavingsAccount,
    amount: bigint,
    trx?: TransactionClientContract
  ): Promise<void> {
    const run = async (client: TransactionClientContract) => {
      const account = await SavingsAccount.query({ client })
        .where('id', savingsAccount.id)
        .firstOrFail()

      const wallet = await Wallet.query({ client })
        .where('id', account.walletId)
        .firstOrFail()

      if (wallet.balanceCache < amount) {
        throw new CollateralException(
          `Insufficient savings balance to pledge ${amount} ${account.currencyCode} (available: ${wallet.balanceCache})`
        )
      }

      account.lockedCollateralAmount = (account.lockedCollateralAmount || 0n) + amount
      await account.useTransaction(client).save()

      loan.mandatorySavingsLocked = amount
      loan.collateralSavingsAccountId = account.id
      loan.collateralStatus = 'locked'
      await loan.useTransaction(client).save()
    }

    if (trx) {
      await run(trx)
    } else {
      await db.transaction(run)
    }
  }

  /**
   * Release / unfreeze cash collateral once the loan is fully repaid.
   */
  static async releaseCollateral(loan: Loan, trx?: TransactionClientContract): Promise<void> {
    if (loan.collateralStatus !== 'locked' || !loan.collateralSavingsAccountId) {
      return
    }

    const run = async (client: TransactionClientContract) => {
      const account = await SavingsAccount.query({ client })
        .where('id', loan.collateralSavingsAccountId!)
        .first()

      if (account) {
        const locked = account.lockedCollateralAmount || 0n
        const newLocked = locked > loan.mandatorySavingsLocked ? locked - loan.mandatorySavingsLocked : 0n
        account.lockedCollateralAmount = newLocked
        await account.useTransaction(client).save()
      }

      loan.collateralStatus = 'released'
      await loan.useTransaction(client).save()
    }

    if (trx) {
      await run(trx)
    } else {
      await db.transaction(run)
    }
  }

  /**
   * Seize / forfeit collateral from borrower's savings to settle defaulted debt.
   */
  static async seizeCollateral(
    loan: Loan,
    staff: BusinessStaff,
    correlationId: string
  ): Promise<{ seizedAmount: bigint; loan: Loan }> {
    if (loan.collateralStatus !== 'locked' || !loan.collateralSavingsAccountId) {
      throw new CollateralException('No active locked collateral found for this loan')
    }

    return db.transaction(async (trx) => {
      const account = await SavingsAccount.query({ client: trx })
        .where('id', loan.collateralSavingsAccountId!)
        .firstOrFail()

      const savingsWallet = await Wallet.query({ client: trx })
        .where('id', account.walletId)
        .forUpdate()
        .firstOrFail()

      const lenderWallet = await Wallet.query({ client: trx })
        .withScopes((s) => s.primary())
        .where('business_id', loan.providerId)
        .where('currency_code', loan.currencyCode)
        .where('status', 'active')
        .forUpdate()
        .firstOrFail()

      const amountToSeize = loan.mandatorySavingsLocked > savingsWallet.balanceCache
        ? savingsWallet.balanceCache
        : loan.mandatorySavingsLocked

      if (amountToSeize <= 0n) {
        throw new CollateralException('No collateral funds available to seize')
      }

      // Ledger transfer: debit borrower savings wallet, credit lender wallet
      const savingsLedgerAccount = await LedgerService.getOrCreatePlatformAccount(
        `ESCROW_SAVINGS_${account.id}`,
        `Savings Escrow #${account.id}`,
        loan.currencyCode,
        trx,
        'liability'
      )

      const entries = [
        {
          accountId: savingsWallet.ledgerAccountId,
          direction: 'debit' as const,
          amount: new Money(amountToSeize, loan.currencyCode),
        },
        {
          accountId: lenderWallet.ledgerAccountId,
          direction: 'credit' as const,
          amount: new Money(amountToSeize, loan.currencyCode),
        },
      ]

      await LedgerService.postTransaction(
        'collateral_seizure',
        entries,
        'internal_user',
        staff.id,
        {
          correlationId,
          description: `Collateral seizure of ${amountToSeize} ${loan.currencyCode} for defaulted loan #${loan.id}`,
          amount: new Money(amountToSeize, loan.currencyCode),
          trx,
        }
      )

      // Unlock and mark collateral seized
      account.lockedCollateralAmount = account.lockedCollateralAmount > amountToSeize
        ? account.lockedCollateralAmount - amountToSeize
        : 0n
      await account.useTransaction(trx).save()

      loan.collateralStatus = 'seized'
      loan.principalOutstanding = loan.principalOutstanding > amountToSeize
        ? loan.principalOutstanding - amountToSeize
        : 0n
      await loan.useTransaction(trx).save()

      await AuditLoggerService.record({
        actorType: 'internal_user',
        actorId: staff.id,
        action: 'loan.collateral_seized',
        resourceType: 'loan',
        resourceId: loan.id,
        before: { collateral_status: 'locked' },
        after: { collateral_status: 'seized', amount_seized: amountToSeize.toString() },
        correlationId,
        trx,
      })

      return { seizedAmount: amountToSeize, loan }
    })
  }
}
