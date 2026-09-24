import { DateTime } from 'luxon'
import Loan from '#models/loan'
import LoanSchedule from '#models/loan_schedule'
import SavingsAccount from '#models/savings_account'

export interface ProvisionCategory {
  category: 'performing' | 'watch' | 'substandard' | 'doubtful' | 'loss'
  stage: 1 | 2 | 3
  minDays: number
  maxDays: number | null
  rateBps: number
  loansCount: number
  grossPrincipal: bigint
  collateralDeducted: bigint
  netExposure: bigint
  provisionRequired: bigint
}

export interface ProvisioningReport {
  providerId: number
  currencyCode: string
  asOf: string
  totalLoansCount: number
  totalGrossPrincipal: bigint
  totalCollateralDeducted: bigint
  totalNetExposure: bigint
  totalProvisionRequired: bigint
  overallCoverageRatioBps: number
  categories: ProvisionCategory[]
  loansDetail: Array<{
    loanId: number
    borrowerId: number
    daysOverdue: number
    status: string
    isRestructured: boolean
    category: string
    stage: 1 | 2 | 3
    grossPrincipal: bigint
    collateralLocked: bigint
    netExposure: bigint
    provisionRequired: bigint
  }>
}

/**
 * Provisioning calculation service following IFRS 9 / Central Bank microfinance prudential norms.
 *
 * Classifies loan assets into 5 risk buckets and computes required expected credit loss (ECL) provisions:
 *  - Stage 1 (Performing): 0 days overdue -> 1% (100 bps)
 *  - Stage 2 (Watch): 1-30 days overdue -> 5% (500 bps)
 *  - Stage 2 (Substandard): 31-90 days overdue -> 20% (2000 bps)
 *  - Stage 3 (Doubtful): 91-180 days overdue -> 50% (5000 bps)
 *  - Stage 3 (Loss): >180 days overdue or defaulted -> 100% (10000 bps)
 *
 * Deducts locked cash collateral (mandatory savings) from the gross exposure before applying provisioning rates.
 */
export class ProvisioningService {
  static readonly BUCKET_DEFINITIONS = [
    { category: 'performing' as const, stage: 1 as const, minDays: 0, maxDays: 0, rateBps: 100 },
    { category: 'watch' as const, stage: 2 as const, minDays: 1, maxDays: 30, rateBps: 500 },
    { category: 'substandard' as const, stage: 2 as const, minDays: 31, maxDays: 90, rateBps: 2000 },
    { category: 'doubtful' as const, stage: 3 as const, minDays: 91, maxDays: 180, rateBps: 5000 },
    { category: 'loss' as const, stage: 3 as const, minDays: 181, maxDays: null, rateBps: 10000 },
  ]

  /**
   * Generates a full portfolio provisioning report for an institution.
   */
  static async calculateReport(
    providerId: number,
    currencyCode = 'USD',
    asOf: DateTime = DateTime.now()
  ): Promise<ProvisioningReport> {
    const loans = await Loan.query()
      .where('provider_id', providerId)
      .where('currency_code', currencyCode)
      .whereIn('status', ['disbursed', 'repaying', 'defaulted'])
      .preload('collateralSavingsAccount')

    const loansDetail: ProvisioningReport['loansDetail'] = []

    // Category aggregators
    const catMap = new Map<string, {
      loansCount: number
      grossPrincipal: bigint
      collateralDeducted: bigint
      netExposure: bigint
      provisionRequired: bigint
    }>()

    for (const b of this.BUCKET_DEFINITIONS) {
      catMap.set(b.category, {
        loansCount: 0,
        grossPrincipal: 0n,
        collateralDeducted: 0n,
        netExposure: 0n,
        provisionRequired: 0n,
      })
    }

    let totalGross = 0n
    let totalCollateral = 0n
    let totalNet = 0n
    let totalProv = 0n

    for (const loan of loans) {
      const daysOverdue = await this.getDaysOverdue(loan, asOf)
      const bucket = this.determineBucket(daysOverdue, loan.status === 'defaulted')

      // Get locked collateral on savings account if present
      let lockedCollateral = 0n
      if (loan.collateralStatus === 'locked' && loan.collateralSavingsAccount) {
        lockedCollateral = loan.collateralSavingsAccount.lockedCollateralAmount
      }

      const grossPrincipal = loan.principalOutstanding
      const collateralDeducted = lockedCollateral < grossPrincipal ? lockedCollateral : grossPrincipal
      const netExposure = grossPrincipal > collateralDeducted ? grossPrincipal - collateralDeducted : 0n
      const provisionRequired = (netExposure * BigInt(bucket.rateBps) + 5000n) / 10000n

      loansDetail.push({
        loanId: loan.id,
        borrowerId: loan.userId,
        daysOverdue,
        status: loan.status,
        isRestructured: loan.isRestructured,
        category: bucket.category,
        stage: bucket.stage,
        grossPrincipal,
        collateralLocked: collateralDeducted,
        netExposure,
        provisionRequired,
      })

      const agg = catMap.get(bucket.category)!
      agg.loansCount += 1
      agg.grossPrincipal += grossPrincipal
      agg.collateralDeducted += collateralDeducted
      agg.netExposure += netExposure
      agg.provisionRequired += provisionRequired

      totalGross += grossPrincipal
      totalCollateral += collateralDeducted
      totalNet += netExposure
      totalProv += provisionRequired
    }

    const categories: ProvisionCategory[] = this.BUCKET_DEFINITIONS.map((def) => {
      const agg = catMap.get(def.category)!
      return {
        category: def.category,
        stage: def.stage,
        minDays: def.minDays,
        maxDays: def.maxDays,
        rateBps: def.rateBps,
        loansCount: agg.loansCount,
        grossPrincipal: agg.grossPrincipal,
        collateralDeducted: agg.collateralDeducted,
        netExposure: agg.netExposure,
        provisionRequired: agg.provisionRequired,
      }
    })

    const overallCoverageRatioBps = totalGross > 0n
      ? Number((totalProv * 10000n) / totalGross)
      : 0

    return {
      providerId,
      currencyCode,
      asOf: asOf.toISO() ?? DateTime.now().toISO()!,
      totalLoansCount: loans.length,
      totalGrossPrincipal: totalGross,
      totalCollateralDeducted: totalCollateral,
      totalNetExposure: totalNet,
      totalProvisionRequired: totalProv,
      overallCoverageRatioBps,
      categories,
      loansDetail,
    }
  }

  private static determineBucket(daysOverdue: number, isDefaulted: boolean) {
    if (isDefaulted || daysOverdue > 180) {
      return this.BUCKET_DEFINITIONS[4] // loss
    }
    if (daysOverdue > 90) {
      return this.BUCKET_DEFINITIONS[3] // doubtful
    }
    if (daysOverdue > 30) {
      return this.BUCKET_DEFINITIONS[2] // substandard
    }
    if (daysOverdue > 0) {
      return this.BUCKET_DEFINITIONS[1] // watch
    }
    return this.BUCKET_DEFINITIONS[0] // performing
  }

  private static async getDaysOverdue(loan: Loan, asOf: DateTime): Promise<number> {
    const overdueSchedule = await LoanSchedule.query()
      .where('loan_id', loan.id)
      .where('due_at', '<', asOf.toSQL()!)
      .orderBy('due_at', 'asc')

    let oldest: DateTime | null = null
    for (const line of overdueSchedule) {
      const remaining = line.total - line.paid
      if (remaining > 0n) {
        if (!oldest) oldest = line.dueAt
      }
    }

    return oldest ? Math.max(0, Math.floor(asOf.diff(oldest, 'days').days)) : 0
  }
}
