/**
 * Likiliba — the private rotating savings group (tontine) members run among themselves.
 *
 * Every bound below is a rule the members sign: they are copied into the group's rules when it
 * is created, so changing a value here never rewrites the rules of a group that already exists.
 * Amounts are in minor units (centimes): CDF and USD both carry two decimals.
 */

export type LikilibaCurrency = 'CDF' | 'USD'

export const LIKILIBA_CURRENCIES = ['CDF', 'USD'] as const

const likilibaConfig = {
  /** Contribution bounds per currency. Without a caution nobody can advance a missing share, so
   *  the amount at stake is kept lower. */
  amounts: {
    CDF: { min: 1_000_00n, max: 10_000_000_00n, maxWithoutCaution: 1_000_000_00n },
    USD: { min: 1_00n, max: 5_000_00n, maxWithoutCaution: 500_00n },
  } satisfies Record<LikilibaCurrency, { min: bigint; max: bigint; maxWithoutCaution: bigint }>,

  /** Number of participants, the organiser included. */
  size: { min: 2, max: 30 },

  /** How many contributions each member locks as caution, when the organiser requires one. */
  cautionMultiplier: { min: 1, max: 2, default: 1 },

  /** Time left after the due date to pay before the default procedure starts. */
  graceHours: { min: 24, max: 168, default: 48 },

  /** Days a round may wait for a missing share (group without caution) before it is escalated. */
  escalationDays: { min: 3, max: 30, default: 7 },

  /** Penalty per day of lateness, capped per contribution. */
  penalty: {
    /** Highest daily rate an organiser may set, in basis points of the contribution. */
    maxDailyBps: 200,
    /** Absolute ceiling of all penalties on one contribution: 10 % of it. */
    maxCapBps: 1_000,
    defaultDailyBps: 100,
    defaultCapBps: 1_000,
  },

  /** An invitation nobody answered lapses after this many days. */
  invitationTtlDays: 7,

  /** The first due date must leave members time to sign and lock their caution. */
  minLeadHours: 24,

  /** Reminder sent this long before a due date. */
  reminderLeadHours: 48,

  /** Automatic debits retried this often until the grace period ends. */
  autoDebitRetryHours: 24,

  /** Identity checks. The organiser holds the group's trust; without caution, so does everyone. */
  requireKycForOrganiser: true,
  requireKycWithoutCaution: true,
}

export default likilibaConfig
