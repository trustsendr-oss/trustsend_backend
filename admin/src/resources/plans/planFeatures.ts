/**
 * Plan.features as stored by the API (app/models/plan.ts): each key is either `true` (included,
 * unrestricted) or restricted to a list of currencies and/or countries (ISO alpha-3). A key that
 * is absent means the feature is not included.
 */
export type FeatureRestriction = true | { currencies?: string[]; countries?: string[] }
export type PlanFeatures = Record<string, FeatureRestriction>

export interface PlanFeatureDefinition {
  key: string
  label: string
  description: string
  /**
   * Whether the gated endpoints send `currency_code`. business_plan_middleware.ts can only enforce
   * a currency restriction on requests that carry one, so the editor only offers it where it works.
   */
  currencies: boolean
  /** Same, for `country_code`. */
  countries: boolean
  note?: string
}

/** Every key gated with middleware.businessPlan(...) in start/routes.ts. */
export const PLAN_FEATURES: PlanFeatureDefinition[] = [
  {
    key: 'mobile_money.deposits',
    label: 'Mobile money deposits',
    description: "Collect payments from a customer's mobile money wallet.",
    currencies: true,
    countries: true,
  },
  {
    key: 'mobile_money.payouts',
    label: 'Mobile money payouts',
    description: 'Send money to a mobile money wallet.',
    currencies: true,
    countries: true,
  },
  {
    key: 'mobile_money.toolkit',
    label: 'Mobile money payment methods',
    description: 'List available operators, limits and fees per currency.',
    currencies: true,
    countries: false,
  },
  {
    key: 'wallet.multi_currency',
    label: 'Multi-currency wallets & swaps',
    description: 'Open wallets in other currencies and swap between them.',
    currencies: true,
    countries: false,
    note: 'The currency list limits which wallets can be opened. Swaps between wallets the business already has are not restricted by it.',
  },
  {
    key: 'cards.issuing',
    label: 'Virtual cards',
    description: 'Issue, top up, freeze and terminate virtual cards.',
    currencies: false,
    countries: false,
    note: 'Cards are issued in USD only.',
  },
  {
    key: 'webhooks',
    label: 'Webhooks',
    description: 'Receive real-time notifications for deposits, payouts and cards.',
    currencies: false,
    countries: false,
  },
]

export const KNOWN_FEATURE_KEYS = new Set(PLAN_FEATURES.map((f) => f.key))

export function asPlanFeatures(value: unknown): PlanFeatures {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as PlanFeatures) : {}
}

/**
 * Builds the stored value from the editor's state: no restriction at all collapses back to `true`,
 * which is what the API and the rest of the codebase treat as "included everywhere".
 */
export function buildRestriction(currencies?: string[], countries?: string[]): FeatureRestriction {
  if (currencies === undefined && countries === undefined) return true
  return {
    ...(currencies !== undefined ? { currencies } : {}),
    ...(countries !== undefined ? { countries } : {}),
  }
}

/**
 * An empty list is valid for the API (it soft-disables the feature) but in this editor it only
 * ever means "restricted, nothing picked yet" — block saving instead of silently disabling.
 */
export function validatePlanFeatures(value: unknown): string | undefined {
  for (const [key, restriction] of Object.entries(asPlanFeatures(value))) {
    if (restriction === true) continue
    const label = PLAN_FEATURES.find((f) => f.key === key)?.label ?? key
    if (restriction.currencies && restriction.currencies.length === 0) {
      return `${label}: pick at least one currency, or allow all currencies`
    }
    if (restriction.countries && restriction.countries.length === 0) {
      return `${label}: pick at least one country, or allow all countries`
    }
  }
  return undefined
}
