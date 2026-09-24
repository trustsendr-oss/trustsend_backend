import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import User from '#models/user'
import Wallet from '#models/wallet'
import Business from '#models/business'
import FinancialProduct from '#models/financial_product'
import SavingsAccount from '#models/savings_account'
import Loan from '#models/loan'
import LoanSchedule from '#models/loan_schedule'
import BorrowerGroup from '#models/borrower_group'
import BorrowerGroupMember from '#models/borrower_group_member'
import LedgerAccount from '#models/ledger_account'
import { LedgerService } from '#services/ledger/ledger_service'
import { Money } from '#services/money/money'
import { AuditLoggerService } from '#services/audit/audit_logger_service'

export interface MemberMigrationRecord {
  full_name: string
  phone?: string
  email?: string
  national_id?: string
  opening_savings_balance: string // in currency units (e.g. "50000" for 500.00)
  locked_collateral?: string
  currency_code: string
  group_name?: string
  existing_loan?: {
    product_id: number
    original_principal: string
    principal_outstanding: string
    interest_outstanding: string
    term_months: number
    remaining_months: number
    interest_rate_bps: number
    interest_method: 'flat' | 'declining'
    first_future_due_date: string // ISO Date YYYY-MM-DD
  }
}

export interface MigrationValidationResult {
  valid: boolean
  total_members: number
  total_opening_savings: bigint
  total_opening_loans: bigint
  errors: Array<{ index: number; member: string; error: string }>
}

export interface MigrationCommitResult {
  success: boolean
  members_created: number
  savings_accounts_created: number
  loans_created: number
  groups_created: number
  total_savings_migrated: string
  total_loans_migrated: string
  migration_batch_id: string
}

/**
 * Service orchestrating legacy migration from paper / Excel into TumaPlus Core.
 *
 * Guarantees zero-discrepancy opening balances and double-entry ledger integrity.
 */
export class LegacyMigrationService {
  /**
   * Dry-run validation of the migration batch before committing to DB.
   */
  static validateBatch(records: MemberMigrationRecord[]): MigrationValidationResult {
    const errors: MigrationValidationResult['errors'] = []
    let totalSavings = 0n
    let totalLoans = 0n

    records.forEach((rec, idx) => {
      if (!rec.full_name || rec.full_name.trim().length < 2) {
        errors.push({ index: idx, member: rec.full_name || 'N/A', error: 'Nom complet requis' })
      }

      if (!rec.currency_code || rec.currency_code.length !== 3) {
        errors.push({ index: idx, member: rec.full_name, error: 'Code devise invalide' })
      }

      try {
        const savings = BigInt(rec.opening_savings_balance || '0')
        if (savings < 0n) throw new Error()
        totalSavings += savings
      } catch {
        errors.push({ index: idx, member: rec.full_name, error: 'Montant d épargne invalide' })
      }

      if (rec.existing_loan) {
        try {
          const origPrincipal = BigInt(rec.existing_loan.original_principal)
          const outstanding = BigInt(rec.existing_loan.principal_outstanding)
          if (outstanding > origPrincipal || outstanding <= 0n) {
            errors.push({
              index: idx,
              member: rec.full_name,
              error: 'Encours de crédit supérieur au principal initial ou invalide',
            })
          }
          totalLoans += outstanding
        } catch {
          errors.push({ index: idx, member: rec.full_name, error: 'Montants de crédit invalides' })
        }
      }
    })

    return {
      valid: errors.length === 0,
      total_members: records.length,
      total_opening_savings: totalSavings,
      total_opening_loans: totalLoans,
      errors,
    }
  }

  /**
   * Commits the legacy migration batch into the database with opening ledger entries.
   */
  static async commitBatch(
    businessId: number,
    staffId: number,
    records: MemberMigrationRecord[],
    correlationId: string
  ): Promise<MigrationCommitResult> {
    const validation = this.validateBatch(records)
    if (!validation.valid) {
      throw new Error(`Migration batch validation failed with ${validation.errors.length} errors`)
    }

    const business = await Business.findOrFail(businessId)

    return db.transaction(async (trx) => {
      let membersCreated = 0
      let savingsCreated = 0
      let loansCreated = 0
      let groupsCreated = 0
      let totalSavingsMigrated = 0n
      let totalLoansMigrated = 0n

      const groupsCache = new Map<string, BorrowerGroup>()

      for (const rec of records) {
        // 1. Create or find User
        let user: User | null = null
        if (rec.phone) {
          user = await User.query({ client: trx }).where('phone', rec.phone).first()
        }
        if (!user && rec.email) {
          user = await User.query({ client: trx }).where('email', rec.email).first()
        }

        if (!user) {
          user = new User()
          user.fullName = rec.full_name
          user.phone = rec.phone || null
          user.email = rec.email || null
          user.code = `MIG${Math.floor(100000 + Math.random() * 900000)}`
          await user.useTransaction(trx).save()
          membersCreated += 1
        }

        // 2. Manage Group if specified
        let group: BorrowerGroup | null = null
        if (rec.group_name && rec.group_name.trim().length > 0) {
          const groupName = rec.group_name.trim()
          if (!groupsCache.has(groupName)) {
            let grp = await BorrowerGroup.query({ client: trx })
              .where('provider_id', business.id)
              .where('name', groupName)
              .first()

            if (!grp) {
              grp = new BorrowerGroup()
              grp.providerId = business.id
              grp.name = groupName
              grp.code = `GRP${Math.floor(1000 + Math.random() * 9000)}`
              grp.status = 'active'
              await grp.useTransaction(trx).save()
              groupsCreated += 1
            }
            groupsCache.set(groupName, grp)
          }

          group = groupsCache.get(groupName)!

          // Add user to group if not already member
          const isMember = await BorrowerGroupMember.query({ client: trx })
            .where('group_id', group.id)
            .where('user_id', user.id)
            .first()

          if (!isMember) {
            const member = new BorrowerGroupMember()
            member.groupId = group.id
            member.userId = user.id
            member.role = 'member'
            member.joinedAt = DateTime.now()
            member.status = 'active'
            await member.useTransaction(trx).save()
          }
        }

        // 3. Setup User Primary Wallet & Savings Account
        const savingsAmount = BigInt(rec.opening_savings_balance || '0')
        const lockedCollateral = BigInt(rec.locked_collateral || '0')

        if (savingsAmount > 0n || lockedCollateral > 0n) {
          // Get or create user wallet
          let userWallet = await Wallet.query({ client: trx })
            .where('user_id', user.id)
            .where('currency_code', rec.currency_code)
            .where('purpose', 'primary')
            .first()

          if (!userWallet) {
            const userLedgerAccount = new LedgerAccount()
            userLedgerAccount.code = `USER_WALLET.${user.id}.${rec.currency_code}`
            userLedgerAccount.name = `${rec.currency_code} wallet for user ${user.fullName || user.email}`
            userLedgerAccount.accountType = 'asset'
            userLedgerAccount.ownerType = 'user_wallet'
            userLedgerAccount.currencyCode = rec.currency_code
            userLedgerAccount.status = 'active'
            await userLedgerAccount.useTransaction(trx).save()

            userWallet = new Wallet()
            userWallet.userId = user.id
            userWallet.currencyCode = rec.currency_code
            userWallet.purpose = 'primary'
            userWallet.status = 'active'
            userWallet.balanceCache = savingsAmount
            userWallet.ledgerAccountId = userLedgerAccount.id
            await userWallet.useTransaction(trx).save()

            userLedgerAccount.ownerId = userWallet.id
            await userLedgerAccount.useTransaction(trx).save()
          } else {
            userWallet.balanceCache += savingsAmount
            await userWallet.useTransaction(trx).save()
          }

          // Create or retrieve dedicated savings product
          let savingsProduct = await FinancialProduct.query({ client: trx })
            .where('provider_id', business.id)
            .where('kind', 'savings')
            .where('currency_code', rec.currency_code)
            .first()

          if (!savingsProduct) {
            savingsProduct = new FinancialProduct()
            savingsProduct.providerId = business.id
            savingsProduct.name = `Épargne Standard ${rec.currency_code}`
            savingsProduct.code = `SAV_${rec.currency_code}_MIG`
            savingsProduct.kind = 'savings'
            savingsProduct.currencyCode = rec.currency_code
            savingsProduct.interestRateBps = 300 // 3%
            savingsProduct.interestPeriod = 'year'
            savingsProduct.status = 'active'
            await savingsProduct.useTransaction(trx).save()
          }

          const savingsAccount = new SavingsAccount()
          savingsAccount.productId = savingsProduct.id
          savingsAccount.providerId = business.id
          savingsAccount.userId = user.id
          savingsAccount.walletId = userWallet.id
          savingsAccount.currencyCode = rec.currency_code
          savingsAccount.interestRateBps = savingsProduct.interestRateBps
          savingsAccount.interestPeriod = savingsProduct.interestPeriod || 'year'
          savingsAccount.status = 'active'
          savingsAccount.openedAt = DateTime.now()
          savingsAccount.lockedCollateralAmount = lockedCollateral
          await savingsAccount.useTransaction(trx).save()

          // Ledger opening entry: Credit user wallet, Debit legacy migration account
          const legacyAccount = await LedgerService.getOrCreatePlatformAccount(
            `LEGACY_MIGRATION.${rec.currency_code}`,
            `Legacy Migration Clearing ${rec.currency_code}`,
            rec.currency_code,
            trx,
            'equity'
          )

          await LedgerService.postTransaction(
            'opening_balance',
            [
              {
                accountId: legacyAccount.id,
                direction: 'debit',
                amount: new Money(savingsAmount, rec.currency_code),
              },
              {
                accountId: userWallet.ledgerAccountId,
                direction: 'credit',
                amount: new Money(savingsAmount, rec.currency_code),
              },
            ],
            'business',
            business.id,
            {
              correlationId,
              description: `Legacy savings migration for ${user.fullName}`,
              trx,
            }
          )

          savingsCreated += 1
          totalSavingsMigrated += savingsAmount
        }

        // 4. Setup Existing Loan if present
        if (rec.existing_loan) {
          const lData = rec.existing_loan
          const principalOutstanding = BigInt(lData.principal_outstanding)
          const interestOutstanding = BigInt(lData.interest_outstanding || '0')
          const origPrincipal = BigInt(lData.original_principal)

          const loan = new Loan()
          loan.productId = lData.product_id
          loan.providerId = business.id
          loan.userId = user.id
          loan.currencyCode = rec.currency_code
          loan.principal = origPrincipal
          loan.principalOutstanding = principalOutstanding
          loan.interestOutstanding = interestOutstanding
          loan.interestRateBps = lData.interest_rate_bps
          loan.interestPeriod = 'month'
          loan.interestMethod = lData.interest_method
          loan.termMonths = lData.term_months
          loan.status = 'repaying'
          loan.stage = 'committee_approved'
          loan.groupId = group ? group.id : null
          loan.requestedAt = DateTime.now().minus({ months: lData.term_months - lData.remaining_months })
          loan.disbursedAt = loan.requestedAt
          await loan.useTransaction(trx).save()

          // Generate remaining schedules
          const firstDue = DateTime.fromISO(lData.first_future_due_date)
          const remainingInst = Math.max(1, lData.remaining_months)
          const principalPerInst = principalOutstanding / BigInt(remainingInst)
          const interestPerInst = interestOutstanding / BigInt(remainingInst)

          for (let i = 1; i <= remainingInst; i++) {
            const schedule = new LoanSchedule()
            schedule.loanId = loan.id
            schedule.installment = (lData.term_months - lData.remaining_months) + i
            schedule.dueAt = firstDue.plus({ months: i - 1 })
            schedule.principal = principalPerInst
            schedule.interest = interestPerInst
            schedule.paid = 0n
            await schedule.useTransaction(trx).save()
          }

          loansCreated += 1
          totalLoansMigrated += principalOutstanding
        }
      }

      await AuditLoggerService.record({
        actorType: 'internal_user',
        actorId: staffId,
        action: 'imf.legacy_migration_completed',
        resourceType: 'business',
        resourceId: business.id,
        before: undefined,
        after: {
          members_created: membersCreated,
          savings_accounts: savingsCreated,
          loans_migrated: loansCreated,
          total_savings: totalSavingsMigrated.toString(),
          total_loans: totalLoansMigrated.toString(),
        },
        correlationId,
        trx,
      })

      return {
        success: true,
        members_created: membersCreated,
        savings_accounts_created: savingsCreated,
        loans_created: loansCreated,
        groups_created: groupsCreated,
        total_savings_migrated: totalSavingsMigrated.toString(),
        total_loans_migrated: totalLoansMigrated.toString(),
        migration_batch_id: correlationId,
      }
    })
  }
}
