import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import LedgerTransaction from '#models/ledger_transaction'
import OutboxEvent from '#models/outbox_event'
import { AuditLoggerService } from '#services/audit/audit_logger_service'
import { formatAmount, TransactionNotifier } from '#services/notifications/transaction_notifier'

/**
 * Outbox Relay Job
 *
 * Implements the outbox pattern: a service writes its ledger entries and an `outbox_events` row
 * in the SAME database transaction, and this job delivers the event afterwards. That is what
 * makes a notification impossible to lose — if the process dies between the money moving and the
 * e-mail going out, the event is still sitting in the table waiting to be picked up — and equally
 * impossible to send for a movement that was rolled back.
 *
 * The job is enqueued on a repeating schedule; see app/queue/workers.ts. A BullMQ worker only
 * runs when something is added to its queue, so without that scheduler the queue and the worker
 * both exist and nothing ever happens — which is exactly how every event written between
 * 2026-08-30 and 2026-09-07 ended up still `pending`.
 *
 * Delivery is at-least-once. E-mail is the only side effect that can be duplicated by a retry,
 * and a duplicate receipt is a far smaller problem than a missing one.
 */

/**
 * Events older than this are published without being delivered.
 *
 * A backlog means the relay was down, not that anyone still needs the news: mailing someone about
 * a transfer from last week is at best confusing, and at worst reads like a fraud alert. The
 * events are still marked handled so the backlog drains instead of being retried forever.
 */
const MAX_DELIVERY_AGE_HOURS = 24

export async function handleOutboxRelay(): Promise<void> {
  // FOR UPDATE SKIP LOCKED prevents two workers from picking up the same event.
  const pendingEvents = await db
    .query()
    .from('outbox_events')
    .where('status', 'pending')
    .orderBy('created_at', 'asc')
    .limit(100)
    .forUpdate()
    .skipLocked()

  for (const eventRow of pendingEvents) {
    const event = await OutboxEvent.query().where('id', eventRow.id).first()
    if (!event) continue

    try {
      // Marked before the external call, so a crash mid-delivery does not look like a fresh event.
      event.status = 'processing'
      event.attempts = (event.attempts || 0) + 1
      await event.save()

      if (isStale(event)) {
        await publish(event, { delivered: false })
        continue
      }

      // These cases must match the eventType strings the services actually write (grep for
      // `event_type:` before renaming either side): cash_in_service.ts and cash_out_service.ts
      // write '.initiated', not '.completed'.
      switch (event.eventType) {
        case 'p2p_transfer.completed':
          await handleP2pTransferCompleted(event)
          break
        case 'cash_in.initiated':
          await handleCashInInitiated(event)
          break
        case 'cash_out.initiated':
          await handleCashOutInitiated(event)
          break
        case 'cash_out.completed':
          await handleCashOutCompleted(event)
          break
        case 'mobile_money_deposit.completed':
        case 'mobile_money_deposit.failed':
        case 'mobile_money_payout.completed':
        case 'mobile_money_payout.failed':
          await handleMobileMoneyTerminal(event)
          break
        case 'mobile_money_deposit.initiated':
        case 'mobile_money_payout.initiated':
          // Nothing to announce yet: the money has not moved, and the terminal event that
          // follows is the one worth an e-mail. Recorded as handled so it stops being retried.
          break
        default:
          // Not retried: an unknown type will still be unknown on the fifth attempt. Marking it
          // failed leaves it visible, where marking it published would bury it.
          console.warn(`Outbox relay: unknown event type ${event.eventType} (event ${event.id})`)
          event.status = 'failed'
          await event.save()
          continue
      }

      await publish(event, { delivered: true })
    } catch (error) {
      console.error(`Outbox relay failed for event ${event.id}:`, error)

      // `attempts` was already incremented above; a fifth failure stops the retries.
      if (event.attempts >= 5) {
        event.status = 'failed'
      } else {
        event.status = 'pending'
      }

      await event.save()
    }
  }
}

/* -------------------------------------------------------------------------- */
/*                                  Outillage                                 */
/* -------------------------------------------------------------------------- */

function isStale(event: OutboxEvent): boolean {
  if (!event.createdAt) return false
  return event.createdAt.diffNow('hours').hours < -MAX_DELIVERY_AGE_HOURS
}

/** Closes an event out. `published_at` was never set before, leaving no delivery timestamp. */
async function publish(event: OutboxEvent, options: { delivered: boolean }): Promise<void> {
  event.status = 'published'
  event.publishedAt = DateTime.now()
  await event.save()

  await AuditLoggerService.record({
    actorType: 'system',
    actorId: 0,
    action: options.delivered
      ? `outbox_event.${event.eventType}.published`
      : `outbox_event.${event.eventType}.skipped_stale`,
    resourceType: 'outbox_event',
    resourceId: String(event.id),
    before: undefined,
    after: { event_type: event.eventType, aggregate_id: event.aggregateId },
    correlationId: (event.payload as any)?.correlation_id || 'unknown',
  })
}

/** Human date for the e-mail body — the same wording the receipt screen uses. */
function formatDate(value: DateTime | null | undefined): string {
  return (value ?? DateTime.now()).setLocale('fr').toFormat("d LLLL yyyy 'à' HH:mm")
}

/** "Compte USD": the wallet a movement touched, as the app names it. */
function accountLabel(currency: string | null | undefined): string | null {
  return currency ? `Compte ${currency}` : null
}

/** "+250 788 123 456" from the stored digits; the stored value as-is when it is not digits. */
function phoneLabel(raw: string | null | undefined): string | null {
  if (!raw) return null
  const digits = raw.replace(/\D/g, '')
  if (!digits) return raw
  return `+${digits.replace(/^(\d{3})(\d{3})(\d{3})(\d+)$/, '$1 $2 $3 $4')}`
}

/**
 * The operator behind a provider code ("MTN_MOMO_RWA" → "MTN Mobile Money"). Unknown codes are
 * shown as stored: a raw code is still more useful on a receipt than nothing.
 */
function operatorLabel(code: string | null | undefined): string | null {
  if (!code) return null
  const c = code.toUpperCase()
  const known: Array<[string, string]> = [
    ['MPESA', 'M-Pesa'],
    ['VODACOM', 'M-Pesa'],
    ['AIRTEL', 'Airtel Money'],
    ['MTN', 'MTN Mobile Money'],
    ['ORANGE', 'Orange Money'],
    ['ECOCASH', 'EcoCash'],
    ['WAVE', 'Wave'],
    ['TIGO', 'Tigo Pesa'],
    ['MIXX', 'Mixx by Yas'],
    ['HALOTEL', 'HaloPesa'],
    ['LUMICASH', 'Lumicash'],
    ['MOOV', 'Moov Money'],
    ['FREE', 'Free Money'],
  ]
  return known.find(([key]) => c.includes(key))?.[1] ?? code
}

/** Sum of two minor-unit amounts, formatted. */
function formatSum(a: unknown, b: unknown, currency: string): string {
  return formatAmount(BigInt(String(a ?? 0)) + BigInt(String(b ?? 0)), currency)
}

/** Difference of two minor-unit amounts, formatted. */
function formatDifference(a: unknown, b: unknown, currency: string): string {
  return formatAmount(BigInt(String(a ?? 0)) - BigInt(String(b ?? 0)), currency)
}

/* -------------------------------------------------------------------------- */
/*                                 Gestionnaires                              */
/* -------------------------------------------------------------------------- */

/**
 * A completed P2P transfer concerns TWO people, and neither was told anything before: the sender
 * had no confirmation, and the recipient had no idea money had arrived.
 */
async function handleP2pTransferCompleted(event: OutboxEvent): Promise<void> {
  const payload = event.payload as any
  const currency = payload.amount?.currencyCode ?? ''
  const amount = formatAmount(payload.amount?.amount ?? '0', currency)
  const reference = payload.transaction_uuid ?? event.aggregateId
  const date = formatDate(event.createdAt)
  const account = accountLabel(currency)

  const [sender, recipient] = await Promise.all([
    TransactionNotifier.recipientForWallet(payload.sender_wallet_id),
    TransactionNotifier.recipientForWallet(payload.recipient_wallet_id),
  ])

  if (sender) {
    await TransactionNotifier.inApp(sender, {
      type: 'p2p_transfer.sent',
      title: 'Transfert envoyé',
      message: `Votre transfert de ${amount} à ${recipient?.name ?? 'un destinataire'} a été effectué.`,
      data: { transaction_uuid: reference },
    })
    await TransactionNotifier.email(sender, `Transfert envoyé — ${amount}`, 'transfer_sent', {
      amount,
      counterparty: recipient?.name ?? 'un destinataire',
      counterparty_code: recipient?.code,
      fee: payload.fee ? formatAmount(payload.fee, currency) : null,
      total: payload.fee ? formatSum(payload.amount?.amount, payload.fee, currency) : null,
      account,
      reference,
      date,
    })
  }

  if (recipient) {
    await TransactionNotifier.inApp(recipient, {
      type: 'p2p_transfer.received',
      title: 'Transfert reçu',
      message: `Vous avez reçu ${amount} de la part de ${sender?.name ?? 'un expéditeur'}.`,
      data: { transaction_uuid: reference },
    })
    await TransactionNotifier.email(recipient, `Vous avez reçu ${amount}`, 'transfer_received', {
      amount,
      counterparty: sender?.name ?? 'un expéditeur',
      counterparty_code: sender?.code,
      account,
      reference,
      date,
    })
  }
}

/**
 * Cash-in initiation: an agent has recorded that they are about to hand cash to a user. Notifies
 * the wallet's owner that a deposit is pending the agent's confirmation — see AGENT_DEPOSIT_FLOW.md.
 */
async function handleCashInInitiated(event: OutboxEvent): Promise<void> {
  const payload = event.payload as any
  const recipient = await TransactionNotifier.recipientForWallet(payload.user_wallet_id)
  if (!recipient) return

  const amount = formatAmount(payload.amount ?? '0', payload.currency_code ?? '')
  const reference = payload.transaction_id ?? event.aggregateId

  await TransactionNotifier.inApp(recipient, {
    type: 'cash_in.initiated',
    title: 'Dépôt en attente',
    message: `Un agent a enregistré un dépôt de ${amount} à votre nom, en attente de sa confirmation.`,
    data: { transaction_id: reference, agent_id: payload.agent_id },
  })

  const agent = payload.agent_id
    ? await TransactionNotifier.recipientForActor('agent', Number(payload.agent_id))
    : null
  await TransactionNotifier.email(recipient, `Dépôt en attente — ${amount}`, 'cash_in_pending', {
    amount,
    agent: agent ? [agent.name, agent.code].filter(Boolean).join(' · ') : null,
    account: accountLabel(payload.currency_code),
    reference,
    date: formatDate(event.createdAt),
  })
}

/**
 * Cash-out request: a user wants to withdraw through a specific agent. Notifies that agent — see
 * AGENT_CHECKOUT_FLOW.md ("Notification envoyée à l'agent").
 */
async function handleCashOutInitiated(event: OutboxEvent): Promise<void> {
  const payload = event.payload as any
  const agent = await TransactionNotifier.recipientForActor('agent', payload.agent_id)
  if (!agent) return

  const amount = formatAmount(payload.amount ?? '0', payload.currency_code ?? '')
  const reference = payload.transaction_id ?? event.aggregateId

  await TransactionNotifier.inApp(agent, {
    type: 'cash_out.initiated',
    title: 'Demande de retrait',
    message: `Un client demande un retrait de ${amount} et se présente pour le récupérer.`,
    data: { transaction_id: reference, user_wallet_id: payload.user_wallet_id },
  })

  // The customer made the request in the app a moment ago: an in-app row (and its push) is
  // enough to confirm it went through. The e-mail waits for the money to actually change hands.
  const customer = await TransactionNotifier.recipientForWallet(payload.user_wallet_id)

  await TransactionNotifier.email(agent, `Demande de retrait — ${amount}`, 'cash_out_requested', {
    amount,
    counterparty: customer?.name,
    counterparty_code: customer?.code,
    reference,
    date: formatDate(event.createdAt),
  })

  if (customer) {
    await TransactionNotifier.inApp(customer, {
      type: 'cash_out.initiated',
      title: 'Retrait demandé',
      message: `Votre demande de retrait de ${amount} est transmise à l'agent. Présentez-vous à son guichet pour récupérer les espèces.`,
      data: { transaction_id: reference, agent_id: payload.agent_id },
    })
  }
}

/** Cash-out paid out by the agent: the customer gets the record of it, in-app and by e-mail. */
async function handleCashOutCompleted(event: OutboxEvent): Promise<void> {
  const payload = event.payload as any
  const transaction = await LedgerTransaction.find(payload.transaction_id ?? event.aggregateId)
  if (!transaction) return

  const customer = await TransactionNotifier.recipientForActor(
    transaction.initiatedByType,
    transaction.initiatedById
  )
  if (!customer) return

  const metadata = (transaction.metadata ?? {}) as Record<string, any>
  const currency = transaction.currencyCode ?? metadata.currency_code ?? ''
  const amount = formatAmount(transaction.amount ?? metadata.amount ?? '0', currency)
  const fee = transaction.fee ? formatAmount(transaction.fee, currency) : ''
  const agent = metadata.agent_id
    ? await TransactionNotifier.recipientForActor('agent', Number(metadata.agent_id))
    : null
  const counterparty = agent?.name ?? "l'agent"

  await TransactionNotifier.inApp(customer, {
    type: 'cash_out.completed',
    title: 'Retrait effectué',
    message: `${amount} vous ont été remis en espèces par ${counterparty}.`,
    data: { transaction_id: transaction.id },
  })

  await TransactionNotifier.email(customer, `Retrait effectué — ${amount}`, 'cash_out_completed', {
    amount,
    fee,
    // The fee is paid on top of the cash handed over (cash_out_service.ts).
    total: formatSum(transaction.amount ?? metadata.amount, transaction.fee, currency),
    counterparty: [agent?.name ?? counterparty, agent?.code].filter(Boolean).join(' · '),
    account: accountLabel(currency),
    reference: transaction.id,
    date: formatDate(transaction.completedAt ?? event.createdAt),
  })
}

/**
 * Mobile money reaching a terminal state.
 *
 * Only the e-mail is sent here: the deposit and payout services already write their in-app row
 * inline, inside the transaction that settles the money. Writing a second one would show the
 * user the same event twice.
 */
async function handleMobileMoneyTerminal(event: OutboxEvent): Promise<void> {
  const payload = event.payload as any
  const transaction = await LedgerTransaction.find(payload.transaction_id ?? event.aggregateId)
  if (!transaction) return

  const recipient = await TransactionNotifier.recipientForActor(
    transaction.initiatedByType,
    transaction.initiatedById
  )
  if (!recipient) return

  const currency = transaction.currencyCode ?? payload.currency_code ?? ''
  const gross = transaction.amount ?? payload.amount ?? '0'
  const amount = formatAmount(gross, currency)
  const metadata = (transaction.metadata ?? {}) as Record<string, any>
  const feeMinor = transaction.fee ?? metadata.fee ?? null
  const date = formatDate(transaction.completedAt ?? event.createdAt)
  const reason = (transaction.metadata as any)?.failure_reason?.message ?? transaction.failureReason

  const templates: Record<string, { subject: string; template: string }> = {
    'mobile_money_deposit.completed': {
      subject: `Recharge créditée — ${amount}`,
      template: 'deposit_completed',
    },
    'mobile_money_deposit.failed': {
      subject: `Recharge échouée — ${amount}`,
      template: 'deposit_failed',
    },
    'mobile_money_payout.completed': {
      subject: `Envoi remis — ${amount}`,
      template: 'payout_completed',
    },
    'mobile_money_payout.failed': {
      subject: `Envoi échoué — ${amount}`,
      template: 'payout_failed',
    },
  }

  const chosen = templates[event.eventType]
  if (!chosen) return

  await TransactionNotifier.email(recipient, chosen.subject, chosen.template, {
    amount,
    fee: feeMinor !== null ? formatAmount(feeMinor, currency) : null,
    // Both directions take the fee out of the gross: credited on a top-up, delivered on a send.
    net: feeMinor !== null ? formatDifference(gross, feeMinor, currency) : null,
    phone: phoneLabel(transaction.counterpartyPhone ?? metadata.phone_number),
    counterparty: phoneLabel(transaction.counterpartyPhone) ?? 'le numéro indiqué',
    channel: operatorLabel(transaction.paymentChannel ?? metadata.provider_code),
    account: accountLabel(currency),
    provider_reference: metadata.provider_transaction_id ?? transaction.providerReferenceId,
    reference: transaction.uuid,
    date,
    reason,
  })
}
