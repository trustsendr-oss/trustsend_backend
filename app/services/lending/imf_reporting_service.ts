import { DateTime } from 'luxon'
import Loan from '#models/loan'
import BorrowerGroup from '#models/borrower_group'
import SavingsAccount from '#models/savings_account'
import { PortfolioQualityService } from '#services/lending/portfolio_quality_service'
import { ProvisioningService } from '#services/lending/provisioning_service'

export interface ImfRegulatoryReport {
  institution: {
    id: number
    currencyCode: string
    generatedAt: string
    asOf: string
  }
  portfolioOverview: {
    grossLoanPortfolio: bigint
    activeBorrowersCount: number
    activeLoansCount: number
    restructuredLoansCount: number
    restructuredPrincipal: bigint
    restructuredShareBps: number
    defaultedLoansCount: number
    defaultedPrincipal: bigint
  }
  riskMetrics: {
    par1Amount: bigint
    par1Bps: number
    par30Amount: bigint
    par30Bps: number
    par60Amount: bigint
    par60Bps: number
    par90Amount: bigint
    par90Bps: number
    nplRatioBps: number // Non-Performing Loans (PAR90) as share of GLP
  }
  provisioningMetrics: {
    totalProvisionsRequired: bigint
    provisionCoverageRatioBps: number // Provisions / PAR90
    netLoanPortfolio: bigint // GLP - Total Provisions
  }
  collateralAndSavings: {
    totalLockedCollateral: bigint
    collateralizationRatioBps: number // Total locked collateral / GLP
  }
  lendingMethodology: {
    individualLoansCount: number
    individualPrincipal: bigint
    groupLoansCount: number
    groupPrincipal: bigint
    activeGroupsCount: number
  }
}

/**
 * Regulatory and Prudential Reporting Service for Microfinance Institutions (P4).
 *
 * Provides a standardized prudential report conformant with central banking standards (BCC, BCEAO, COBAC).
 */
export class ImfReportingService {
  static async generateRegulatoryReport(
    providerId: number,
    currencyCode = 'USD',
    asOf: DateTime = DateTime.now()
  ): Promise<ImfRegulatoryReport> {
    const loans = await Loan.query()
      .where('provider_id', providerId)
      .where('currency_code', currencyCode)
      .whereIn('status', ['disbursed', 'repaying', 'defaulted'])

    const qualityReport = await PortfolioQualityService.reportFor(providerId, currencyCode, asOf)
    const provReport = await ProvisioningService.calculateReport(providerId, currencyCode, asOf)

    // Gross loan portfolio
    const grossLoanPortfolio = qualityReport.grossPortfolio
    const activeBorrowersSet = new Set<number>()

    let restructuredLoansCount = 0
    let restructuredPrincipal = 0n
    let defaultedLoansCount = 0
    let defaultedPrincipal = 0n
    let individualLoansCount = 0
    let individualPrincipal = 0n
    let groupLoansCount = 0
    let groupPrincipal = 0n

    for (const loan of loans) {
      activeBorrowersSet.add(loan.userId)

      if (loan.isRestructured) {
        restructuredLoansCount += 1
        restructuredPrincipal += loan.principalOutstanding
      }

      if (loan.status === 'defaulted') {
        defaultedLoansCount += 1
        defaultedPrincipal += loan.principalOutstanding
      }

      if (loan.groupId) {
        groupLoansCount += 1
        groupPrincipal += loan.principalOutstanding
      } else {
        individualLoansCount += 1
        individualPrincipal += loan.principalOutstanding
      }
    }

    // Active groups count
    const activeGroupsCount = await BorrowerGroup.query()
      .where('provider_id', providerId)
      .where('status', 'active')
      .count('* as total')
      .first()

    // PAR values from quality report
    const parMap = new Map(qualityReport.par.map((p) => [p.days, p]))
    const par1 = parMap.get(1) ?? { amount: 0n, ratioBps: 0 }
    const par30 = parMap.get(30) ?? { amount: 0n, ratioBps: 0 }
    const par60 = parMap.get(60) ?? { amount: 0n, ratioBps: 0 }
    const par90 = parMap.get(90) ?? { amount: 0n, ratioBps: 0 }

    // Total locked collateral in savings
    const savingsAccounts = await SavingsAccount.query()
      .where('provider_id', providerId)
      .where('status', 'active')

    const totalLockedCollateral = savingsAccounts.reduce(
      (sum, acc) => sum + acc.lockedCollateralAmount,
      0n
    )

    const restructuredShareBps = grossLoanPortfolio > 0n
      ? Number((restructuredPrincipal * 10000n) / grossLoanPortfolio)
      : 0

    const collateralizationRatioBps = grossLoanPortfolio > 0n
      ? Number((totalLockedCollateral * 10000n) / grossLoanPortfolio)
      : 0

    const provisionCoverageRatioBps = par90.amount > 0n
      ? Number((provReport.totalProvisionRequired * 10000n) / par90.amount)
      : 10000 // 100% covered if no PAR90

    const netLoanPortfolio = grossLoanPortfolio > provReport.totalProvisionRequired
      ? grossLoanPortfolio - provReport.totalProvisionRequired
      : 0n

    return {
      institution: {
        id: providerId,
        currencyCode,
        generatedAt: DateTime.now().toISO()!,
        asOf: asOf.toISO() ?? DateTime.now().toISO()!,
      },
      portfolioOverview: {
        grossLoanPortfolio,
        activeBorrowersCount: activeBorrowersSet.size,
        activeLoansCount: loans.length,
        restructuredLoansCount,
        restructuredPrincipal,
        restructuredShareBps,
        defaultedLoansCount,
        defaultedPrincipal,
      },
      riskMetrics: {
        par1Amount: par1.amount,
        par1Bps: par1.ratioBps,
        par30Amount: par30.amount,
        par30Bps: par30.ratioBps,
        par60Amount: par60.amount,
        par60Bps: par60.ratioBps,
        par90Amount: par90.amount,
        par90Bps: par90.ratioBps,
        nplRatioBps: par90.ratioBps,
      },
      provisioningMetrics: {
        totalProvisionsRequired: provReport.totalProvisionRequired,
        provisionCoverageRatioBps,
        netLoanPortfolio,
      },
      collateralAndSavings: {
        totalLockedCollateral,
        collateralizationRatioBps,
      },
      lendingMethodology: {
        individualLoansCount,
        individualPrincipal,
        groupLoansCount,
        groupPrincipal,
        activeGroupsCount: Number(activeGroupsCount?.$extras.total ?? 0),
      },
    }
  }
}
