import {
  amountBlock,
  codeBox,
  detailList,
  divider,
  emailDocument,
  escapeHtml,
  fineprint,
  lead,
  notice,
  p,
  plainText,
} from './email_layout.js'

/**
 * Renders the known email templates. No templating engine (Edge) is configured in this project,
 * so this stays a small inline renderer rather than pulling in a dependency for a handful of
 * short transactional messages. Add a case here for each `template` value passed to sendEmail().
 *
 * Every message is composed from the blocks in email_layout.ts and wrapped in the same document,
 * so the visual world matches the institution dashboard and a client cannot receive two mails
 * that look like they came from two companies.
 *
 * All templates are in French, like the applications they serve: an account holder who reads
 * "Transfert envoyé" in the app should not receive "Transfer sent" by e-mail. Template KEYS stay
 * in English — they are identifiers passed by the call sites, not text anyone reads.
 */

interface EmailContent {
  /** Heading inside the card. Says what happened, not what the product is called. */
  title: string
  /** The grey line the inbox shows beside the subject. */
  preheader: string
  /** Name to greet, when the message is about someone's own account. */
  greeting?: string
  body: string
  /** Plain-text alternative; see plainText() for why it is worth sending. */
  text: string
}

/**
 * The dispute status is a stored enum — 'resolved', 'rejected' — and dropping it raw into a
 * French sentence produces "a été traitée : resolved". Unknown values are returned as-is rather
 * than hidden: a status nobody translated is still information.
 */
function disputeStatusLabel(status: unknown): string {
  const labels: Record<string, string> = {
    opened: 'ouverte',
    investigating: "en cours d'examen",
    approved: 'acceptée',
    rejected: 'rejetée',
    resolved: 'résolue',
  }
  return labels[String(status)] ?? String(status ?? '')
}

/** Closing line on every message about a movement, where a reference is the thing support asks for. */
const movementFooter = (brand: string) =>
  `Vous recevez ce message parce qu'une opération a eu lieu sur votre compte ${brand}. En cas de doute, contactez le support en citant la référence ci-dessus.`

function buildEmail(template: string, data: Record<string, any>, brand: string): EmailContent {
  const MOVEMENT_FOOTER = movementFooter(brand)
  switch (template) {
    case 'pin_reset_requested':
      return {
        title: 'Réinitialisation de votre code de paiement',
        preheader: `Code de vérification valable ${data.expires_in_minutes} minutes.`,
        body:
          p(`Vous avez demandé à réinitialiser votre code de paiement ${escapeHtml(brand)}.`) +
          codeBox(data.token, `Valable ${data.expires_in_minutes} minutes`) +
          fineprint(
            "Si vous n'êtes pas à l'origine de cette demande, ignorez ce message : votre code reste inchangé."
          ),
        text: plainText([
          `Vous avez demandé à réinitialiser votre code de paiement ${brand}.`,
          '',
          `Code de vérification : ${data.token}`,
          `Valable ${data.expires_in_minutes} minutes.`,
          '',
          "Si vous n'êtes pas à l'origine de cette demande, ignorez ce message : votre code reste inchangé.",
        ]),
      }

    case 'business_signup_otp':
      return {
        title: 'Vérifiez votre adresse e-mail',
        preheader: `Votre code expire dans ${data.expires_in_minutes} minutes.`,
        body:
          p(
            `Voici votre code de vérification pour la création d'un compte entreprise ${escapeHtml(brand)}.`
          ) +
          codeBox(data.otp, `Expire dans ${data.expires_in_minutes} minutes`) +
          fineprint(
            "Si vous n'êtes pas à l'origine de cette demande, ignorez ce message."
          ),
        text: plainText([
          `Code de vérification ${brand} : ${data.otp}`,
          `Ce code expire dans ${data.expires_in_minutes} minutes.`,
          '',
          "Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.",
        ]),
      }

    case 'transfer_completed':
      return {
        title: 'Transfert effectué',
        preheader: `${data.amount} ${data.currency} à ${data.recipient}.`,
        body:
          lead(
            `Votre transfert de ${escapeHtml(data.amount)} ${escapeHtml(data.currency)} à ${escapeHtml(data.recipient)} a bien été effectué.`
          ) +
          detailList([
            ['Référence', String(data.uuid ?? '')],
            ['Date', String(data.timestamp ?? '')],
          ]),
        text: plainText([
          `Votre transfert de ${data.amount} ${data.currency} à ${data.recipient} a bien été effectué.`,
          `Référence : ${data.uuid}`,
          `Date : ${data.timestamp}`,
        ]),
      }

    case 'kyc_status_changed': {
      // The tone follows the outcome: an approval reassures, a refusal must be findable at a
      // glance among a dozen other notifications.
      const status = String(data.status ?? '')
      const tone = status === 'approved' ? 'success' : status === 'rejected' ? 'danger' : 'info'
      return {
        title: "Vérification d'identité",
        preheader: String(data.message ?? ''),
        body: notice(tone, escapeHtml(data.message)),
        text: String(data.message ?? ''),
      }
    }

    case 'agent_cash_in_request':
      return {
        title: 'Nouvelle demande de dépôt',
        preheader: `${data.amount} ${data.currency} de la part de ${data.customerName}.`,
        body:
          amountBlock(`${data.amount} ${data.currency}`, 'Montant demandé') +
          p(`Demande enregistrée par ${escapeHtml(data.customerName)}.`) +
          detailList([['Opération n°', String(data.transactionId ?? '')]]),
        text: plainText([
          `Nouvelle demande de dépôt : ${data.amount} ${data.currency} de la part de ${data.customerName}.`,
          `Opération n° ${data.transactionId}`,
        ]),
      }

    case 'dispute_resolved':
      return {
        title: 'Votre réclamation a été traitée',
        preheader: `Dossier n° ${data.disputeId} — ${disputeStatusLabel(data.status)}.`,
        body:
          lead(
            `Votre réclamation a été traitée : ${escapeHtml(disputeStatusLabel(data.status))}.`
          ) +
          detailList([['Dossier n°', String(data.disputeId ?? '')]]) +
          p(escapeHtml(data.resolutionNotes)),
        text: plainText([
          `Votre réclamation (dossier n° ${data.disputeId}) a été traitée : ${disputeStatusLabel(data.status)}.`,
          String(data.resolutionNotes ?? ''),
        ]),
      }

    /* ---------------------- Mouvements sur le compte ---------------------- */

    case 'transfer_sent':
      return {
        title: 'Transfert envoyé',
        preheader: `${data.amount} à ${data.counterparty}.`,
        greeting: data.name,
        body:
          amountBlock(String(data.amount ?? ''), `Envoyé à ${escapeHtml(data.counterparty)}`) +
          detailList([
            ['Référence', String(data.reference ?? '')],
            ['Date', String(data.date ?? '')],
          ]) +
          divider() +
          fineprint(MOVEMENT_FOOTER),
        text: plainText([
          `Bonjour ${data.name},`,
          '',
          `Votre transfert de ${data.amount} à ${data.counterparty} a bien été effectué.`,
          `Référence : ${data.reference}`,
          `Date : ${data.date}`,
        ]),
      }

    case 'transfer_received':
      return {
        title: 'Vous avez reçu un transfert',
        preheader: `${data.amount} de la part de ${data.counterparty}.`,
        greeting: data.name,
        body:
          amountBlock(String(data.amount ?? ''), `Reçu de ${escapeHtml(data.counterparty)}`) +
          notice('success', 'La somme est déjà disponible sur votre compte.') +
          detailList([
            ['Référence', String(data.reference ?? '')],
            ['Date', String(data.date ?? '')],
          ]) +
          divider() +
          fineprint(MOVEMENT_FOOTER),
        text: plainText([
          `Bonjour ${data.name},`,
          '',
          `Vous avez reçu ${data.amount} de la part de ${data.counterparty}.`,
          'La somme est déjà disponible sur votre compte.',
          `Référence : ${data.reference}`,
          `Date : ${data.date}`,
        ]),
      }

    case 'deposit_completed':
      return {
        title: 'Recharge créditée',
        preheader: `${data.amount} crédités sur votre compte.`,
        greeting: data.name,
        body:
          amountBlock(String(data.amount ?? ''), 'Crédité sur votre compte') +
          detailList([
            ['Référence', String(data.reference ?? '')],
            ['Date', String(data.date ?? '')],
          ]) +
          divider() +
          fineprint(MOVEMENT_FOOTER),
        text: plainText([
          `Bonjour ${data.name},`,
          '',
          `Votre recharge de ${data.amount} a été créditée sur votre compte.`,
          `Référence : ${data.reference}`,
          `Date : ${data.date}`,
        ]),
      }

    case 'deposit_failed':
      return {
        title: "Votre recharge n'a pas abouti",
        preheader: 'Aucun montant n’a été débité.',
        greeting: data.name,
        body:
          amountBlock(String(data.amount ?? ''), 'Recharge tentée') +
          // Stated before the reason: "nothing was taken" is what the recipient needs first.
          notice('warning', "Aucun montant n'a été débité.") +
          (data.reason ? p(`Motif : ${escapeHtml(data.reason)}`) : '') +
          detailList([
            ['Référence', String(data.reference ?? '')],
            ['Date', String(data.date ?? '')],
          ]) +
          divider() +
          fineprint(MOVEMENT_FOOTER),
        text: plainText([
          `Bonjour ${data.name},`,
          '',
          `Votre recharge de ${data.amount} n'a pas abouti. Aucun montant n'a été débité.`,
          data.reason ? `Motif : ${data.reason}` : null,
          `Référence : ${data.reference}`,
          `Date : ${data.date}`,
        ]),
      }

    case 'payout_completed':
      return {
        title: 'Envoi remis',
        preheader: `${data.amount} remis à ${data.counterparty}.`,
        greeting: data.name,
        body:
          amountBlock(String(data.amount ?? ''), `Remis à ${escapeHtml(data.counterparty)}`) +
          detailList([
            ['Référence', String(data.reference ?? '')],
            ['Date', String(data.date ?? '')],
          ]) +
          divider() +
          fineprint(MOVEMENT_FOOTER),
        text: plainText([
          `Bonjour ${data.name},`,
          '',
          `Votre envoi de ${data.amount} vers ${data.counterparty} a bien été remis.`,
          `Référence : ${data.reference}`,
          `Date : ${data.date}`,
        ]),
      }

    case 'payout_failed':
      return {
        title: "Votre envoi n'a pas abouti",
        preheader: 'Le montant a été recrédité sur votre compte.',
        greeting: data.name,
        body:
          amountBlock(String(data.amount ?? ''), `Envoi vers ${escapeHtml(data.counterparty)}`) +
          notice('warning', 'Le montant a été recrédité sur votre compte.') +
          (data.reason ? p(`Motif : ${escapeHtml(data.reason)}`) : '') +
          detailList([
            ['Référence', String(data.reference ?? '')],
            ['Date', String(data.date ?? '')],
          ]) +
          divider() +
          fineprint(MOVEMENT_FOOTER),
        text: plainText([
          `Bonjour ${data.name},`,
          '',
          `Votre envoi de ${data.amount} vers ${data.counterparty} n'a pas abouti. Le montant a été recrédité sur votre compte.`,
          data.reason ? `Motif : ${data.reason}` : null,
          `Référence : ${data.reference}`,
          `Date : ${data.date}`,
        ]),
      }

    case 'cash_in_pending':
      return {
        title: 'Dépôt en attente de confirmation',
        preheader: `${data.amount} enregistrés par un agent.`,
        greeting: data.name,
        body:
          amountBlock(String(data.amount ?? ''), 'Déposé par un agent') +
          notice('info', "Il sera crédité dès que l'agent l'aura confirmé.") +
          detailList([['Référence', String(data.reference ?? '')]]) +
          divider() +
          fineprint(MOVEMENT_FOOTER),
        text: plainText([
          `Bonjour ${data.name},`,
          '',
          `Un agent a enregistré un dépôt de ${data.amount} à votre nom.`,
          "Il sera crédité dès que l'agent l'aura confirmé.",
          `Référence : ${data.reference}`,
        ]),
      }

    case 'cash_out_requested':
      return {
        title: 'Demande de retrait',
        preheader: `${data.amount} à remettre au client.`,
        greeting: data.name,
        body:
          amountBlock(String(data.amount ?? ''), 'Montant à remettre') +
          p('Le client se présentera pour retirer la somme.') +
          detailList([['Référence', String(data.reference ?? '')]]) +
          divider() +
          fineprint(MOVEMENT_FOOTER),
        text: plainText([
          `Bonjour ${data.name},`,
          '',
          `Une demande de retrait de ${data.amount} vous a été adressée.`,
          'Le client se présentera pour retirer la somme.',
          `Référence : ${data.reference}`,
        ]),
      }

    default:
      // An unknown template still has to deliver its payload rather than an empty shell: the
      // recipient may be the only person who can tell us a call site was never wired up here.
      return {
        title: 'Notification',
        preheader: `Notification ${brand}`,
        body: p(`<pre style="white-space:pre-wrap;margin:0;">${escapeHtml(JSON.stringify(data, null, 2))}</pre>`),
        text: JSON.stringify(data, null, 2),
      }
  }
}

export function renderEmailHtml(
  template: string,
  data: Record<string, any>,
  brand: string
): string {
  const content = buildEmail(template, data, brand)
  return emailDocument({
    brand,
    title: content.title,
    preheader: content.preheader,
    greeting: content.greeting,
    body: content.body,
  })
}

export function renderEmailText(
  template: string,
  data: Record<string, any>,
  brand: string
): string {
  return buildEmail(template, data, brand).text
}

/** Every template key this module renders — used by the preview command so a new template
 * cannot be added without showing up there. */
export const EMAIL_TEMPLATES = [
  'pin_reset_requested',
  'business_signup_otp',
  'transfer_completed',
  'kyc_status_changed',
  'agent_cash_in_request',
  'dispute_resolved',
  'transfer_sent',
  'transfer_received',
  'deposit_completed',
  'deposit_failed',
  'payout_completed',
  'payout_failed',
  'cash_in_pending',
  'cash_out_requested',
] as const
