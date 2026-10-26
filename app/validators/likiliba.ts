import vine from '@vinejs/vine'

const amount = () => vine.string().regex(/^[1-9]\d*$/)
const pin = () => vine.string().regex(/^\d{4}$/)

const settings = {
  name: vine.string().trim().minLength(2).maxLength(120),
  description: vine.string().trim().maxLength(1000).optional(),
  contribution_amount: amount(),
  frequency: vine.enum(['weekly', 'biweekly', 'monthly'] as const),
  size: vine.number().withoutDecimals().min(2).max(30),
  starts_at: vine.string().trim().minLength(10).maxLength(40),
  caution_required: vine.boolean(),
  caution_multiplier: vine.number().withoutDecimals().min(1).max(2).optional(),
  grace_hours: vine.number().withoutDecimals().min(24).max(168).optional(),
  escalation_days: vine.number().withoutDecimals().min(3).max(30).optional(),
  penalty_mode: vine.enum(['none', 'fixed', 'percent'] as const),
  penalty_fixed_amount: amount().optional(),
  penalty_daily_bps: vine.number().withoutDecimals().min(1).max(200).optional(),
  penalty_cap_bps: vine.number().withoutDecimals().min(1).max(1000).optional(),
  ordering_mode: vine.enum(['draw', 'manual'] as const),
}

export const createLikilibaValidator = vine.compile(
  vine.object({
    ...settings,
    currency_code: vine.string().toUpperCase().in(['CDF', 'USD']),
  })
)

export const updateLikilibaValidator = vine.compile(
  vine.object({
    name: settings.name.optional(),
    description: settings.description,
    contribution_amount: amount().optional(),
    frequency: vine.enum(['weekly', 'biweekly', 'monthly'] as const).optional(),
    size: vine.number().withoutDecimals().min(2).max(30).optional(),
    starts_at: vine.string().trim().minLength(10).maxLength(40).optional(),
    caution_required: vine.boolean().optional(),
    caution_multiplier: settings.caution_multiplier,
    grace_hours: settings.grace_hours,
    escalation_days: settings.escalation_days,
    penalty_mode: vine.enum(['none', 'fixed', 'percent'] as const).optional(),
    penalty_fixed_amount: settings.penalty_fixed_amount,
    penalty_daily_bps: settings.penalty_daily_bps,
    penalty_cap_bps: settings.penalty_cap_bps,
    ordering_mode: vine.enum(['draw', 'manual'] as const).optional(),
  })
)

export const inviteValidator = vine.compile(
  vine.object({
    channel: vine.enum(['account', 'phone', 'link'] as const),
    user_code: vine
      .string()
      .regex(/^\d{9}$/)
      .optional()
      .requiredWhen('channel', '=', 'account'),
    phone: vine
      .string()
      .trim()
      .minLength(8)
      .maxLength(32)
      .optional()
      .requiredWhen('channel', '=', 'phone'),
  })
)

export const acceptLinkValidator = vine.compile(
  vine.object({ token: vine.string().trim().minLength(16).maxLength(128) })
)

export const pinValidator = vine.compile(vine.object({ pin: pin() }))

export const lockValidator = vine.compile(
  vine.object({
    pin: pin(),
    /** Member ids in rotation order; required when the group orders its rounds manually. */
    order: vine.array(vine.number().withoutDecimals().positive()).optional(),
  })
)

export const commitValidator = vine.compile(
  vine.object({
    pin: pin(),
    rules_hash: vine.string().fixedLength(64),
    auto_debit: vine.boolean(),
    idempotency_key: vine.string().uuid(),
  })
)

export const moneyActionValidator = vine.compile(
  vine.object({ pin: pin(), idempotency_key: vine.string().uuid() })
)

export const cancelValidator = vine.compile(
  vine.object({ pin: pin(), reason: vine.string().trim().minLength(3).maxLength(500) })
)

export const mandateValidator = vine.compile(vine.object({ pin: pin(), enabled: vine.boolean() }))

export const listValidator = vine.compile(
  vine.object({
    page: vine.number().withoutDecimals().min(1).optional(),
    limit: vine.number().withoutDecimals().min(1).max(100).optional(),
    mine: vine.boolean().optional(),
    status: vine.string().optional(),
  })
)

export const reasonValidator = vine.compile(
  vine.object({ reason: vine.string().trim().minLength(3).maxLength(500) })
)

export const noteValidator = vine.compile(
  vine.object({ note: vine.string().trim().minLength(3).maxLength(500) })
)

export const messageValidator = vine.compile(
  vine.object({ body: vine.string().trim().minLength(1).maxLength(1000) })
)

export const feedValidator = vine.compile(
  vine.object({ before: vine.string().trim().maxLength(40).optional() })
)

export const reactionValidator = vine.compile(
  vine.object({ emoji: vine.string().trim().minLength(1).maxLength(16) })
)

export const profileValidator = vine.compile(
  vine.object({
    name: vine.string().trim().minLength(2).maxLength(120).optional(),
    description: vine.string().trim().maxLength(500).nullable().optional(),
  })
)
