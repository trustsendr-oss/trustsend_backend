import type { HttpContext } from '@adonisjs/core/http'
import { DateTime } from 'luxon'
import { ImfReportingService } from '#services/lending/imf_reporting_service'
import { ProvisioningService } from '#services/lending/provisioning_service'
import { PortfolioQualityService } from '#services/lending/portfolio_quality_service'

export default class BusinessDashboardImfController {
  /** GET /api/v1/business/dashboard/imf/regulatory-report */
  async regulatoryReport({ business, request, response }: HttpContext) {
    const currency = (request.input('currency') as string) || 'USD'
    const asOfInput = request.input('as_of') as string | undefined
    const asOf = asOfInput ? DateTime.fromISO(asOfInput) : DateTime.now()

    const report = await ImfReportingService.generateRegulatoryReport(
      business.id,
      currency,
      asOf
    )

    return response.ok({
      data: {
        ...report,
        portfolioOverview: {
          ...report.portfolioOverview,
          grossLoanPortfolio: report.portfolioOverview.grossLoanPortfolio.toString(),
          restructuredPrincipal: report.portfolioOverview.restructuredPrincipal.toString(),
          defaultedPrincipal: report.portfolioOverview.defaultedPrincipal.toString(),
        },
        riskMetrics: {
          ...report.riskMetrics,
          par1Amount: report.riskMetrics.par1Amount.toString(),
          par30Amount: report.riskMetrics.par30Amount.toString(),
          par60Amount: report.riskMetrics.par60Amount.toString(),
          par90Amount: report.riskMetrics.par90Amount.toString(),
        },
        provisioningMetrics: {
          ...report.provisioningMetrics,
          totalProvisionsRequired: report.provisioningMetrics.totalProvisionsRequired.toString(),
          netLoanPortfolio: report.provisioningMetrics.netLoanPortfolio.toString(),
        },
        collateralAndSavings: {
          ...report.collateralAndSavings,
          totalLockedCollateral: report.collateralAndSavings.totalLockedCollateral.toString(),
        },
        lendingMethodology: {
          ...report.lendingMethodology,
          individualPrincipal: report.lendingMethodology.individualPrincipal.toString(),
          groupPrincipal: report.lendingMethodology.groupPrincipal.toString(),
        },
      },
    })
  }

  /** GET /api/v1/business/dashboard/imf/provisioning */
  async provisioning({ business, request, response }: HttpContext) {
    const currency = (request.input('currency') as string) || 'USD'
    const asOfInput = request.input('as_of') as string | undefined
    const asOf = asOfInput ? DateTime.fromISO(asOfInput) : DateTime.now()

    const report = await ProvisioningService.calculateReport(
      business.id,
      currency,
      asOf
    )

    return response.ok({
      data: {
        ...report,
        totalGrossPrincipal: report.totalGrossPrincipal.toString(),
        totalCollateralDeducted: report.totalCollateralDeducted.toString(),
        totalNetExposure: report.totalNetExposure.toString(),
        totalProvisionRequired: report.totalProvisionRequired.toString(),
        categories: report.categories.map((cat) => ({
          ...cat,
          grossPrincipal: cat.grossPrincipal.toString(),
          collateralDeducted: cat.collateralDeducted.toString(),
          netExposure: cat.netExposure.toString(),
          provisionRequired: cat.provisionRequired.toString(),
        })),
        loansDetail: report.loansDetail.map((item) => ({
          ...item,
          grossPrincipal: item.grossPrincipal.toString(),
          collateralLocked: item.collateralLocked.toString(),
          netExposure: item.netExposure.toString(),
          provisionRequired: item.provisionRequired.toString(),
        })),
      },
    })
  }

  /** GET /api/v1/business/dashboard/imf/arrears */
  async arrears({ business, request, response }: HttpContext) {
    const asOfInput = request.input('as_of') as string | undefined
    const asOf = asOfInput ? DateTime.fromISO(asOfInput) : DateTime.now()

    const arrears = await PortfolioQualityService.arrearsFor(business.id, asOf)

    return response.ok({
      data: arrears.map((item) => ({
        loan_id: item.loanId,
        days_overdue: item.daysOverdue,
        amount_overdue: item.amountOverdue.toString(),
        principal_outstanding: item.principalOutstanding.toString(),
      })),
    })
  }
}
