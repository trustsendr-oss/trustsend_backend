import {
  emailDocument,
  escapeHtml,
  notice,
  otpCode,
  plainRows,
  plainText,
  receipt,
  text,
  type ReceiptRow,
  type ReceiptStatus,
} from './email_layout.js'

/**
 * Renders the known email templates. No templating engine (Edge) is configured in this project,
 * so this stays a small inline renderer rather than pulling in a dependency for a handful of
 * short transactional messages. Add a case here for each `template` value passed to sendEmail().
 *
 * Every message is composed from the blocks in email_layout.ts and wrapped in the same document,
 * so a client cannot receive two mails that look like they came from two companies.
 *
 * All templates are in French, like the applications they serve: an account holder who reads
 * "Transfert envoyé" in the app should not receive "Transfer sent" by e-mail. Template KEYS stay
 * in English — they are identifiers passed by the call sites, not text anyone reads.
 */

interface EmailContent {
  /** The heading. Says what happened, not what the product is called. */
  title: string
  /** The grey line the inbox shows beside the subject. */
  preheader: string
  /** Name to greet, when the message is about someone's own account. */
  greeting?: string
  body: string
  /** Plain-text alternative; see plainText() for why it is worth sending. */
  text: string
  footerNote?: string
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

/** "Marie Dupont · 610468306": the name to recognise, the code to tell two Maries apart. */
function party(name: unknown, code: unknown): string | null {
  const parts = [name, code].map((value) => String(value ?? '').trim()).filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : null
}

/** "5 000 BIF" or nothing — a zero or absent fee is not worth a row. */
function feeRow(fee: unknown): string | null {
  const value = String(fee ?? '').trim()
  return value && !/^0([,.]0+)?(\s|$)/.test(value) ? value : null
}

const STATUS_TEXT: Record<ReceiptStatus, string> = {
  completed: 'Effectué',
  pending: 'En attente',
  failed: 'Échoué',
}

/**
 * Every movement e-mail has the same anatomy: greeting, one sentence that says what happened,
 * the receipt, an optional notice (what happened to the money when it failed, what happens next
 * when it is pending), and a closing line pointing support at the reference.
 */
function movement(
  brand: string,
  data: Record<string, any>,
  options: {
    title: string
    preheader: string
    sentence: string
    caption: string
    direction?: 'in' | 'out'
    status: ReceiptStatus
    rows: ReceiptRow[]
    notice?: { tone: 'success' | 'warning' | 'danger' | 'info'; text: string }
  }
): EmailContent {
  const rows: ReceiptRow[] = [...options.rows, ['Référence', data.reference], ['Date', data.date]]
  // The HTML receipt shows the status as a badge under the amount; plain text needs it spelled out.
  const textRows: ReceiptRow[] = [...rows, ['Statut', STATUS_TEXT[options.status]]]
  const support = `Une question sur cette opération ? Contactez le support ${brand} en indiquant la référence ${data.reference ?? ''}.`

  return {
    title: options.title,
    preheader: options.preheader,
    greeting: data.name,
    body:
      text(escapeHtml(options.sentence)) +
      receipt({
        caption: options.caption,
        amount: String(data.amount ?? ''),
        direction: options.direction,
        status: options.status,
        rows,
      }) +
      (options.notice ? notice(options.notice.tone, escapeHtml(options.notice.text)) : '') +
      text(escapeHtml(support), { muted: true, last: true }),
    text: plainText([
      data.name ? `Bonjour ${data.name},` : null,
      '',
      options.sentence,
      '',
      `${options.caption} : ${data.amount ?? ''}`,
      ...plainRows(textRows),
      options.notice ? '' : null,
      options.notice?.text ?? null,
      '',
      support,
    ]),
    footerNote: `Vous recevez ce message parce qu'une opération a eu lieu sur votre compte ${brand}.`,
  }
}

function buildEmail(template: string, data: Record<string, any>, brand: string): EmailContent {
  switch (template) {
    /* ------------------------------ Codes ------------------------------- */

    case 'user_signup_otp':
    case 'business_signup_otp': {
      const business = template === 'business_signup_otp'
      const what = business
        ? `la création de votre compte entreprise ${escapeHtml(brand)}`
        : `la création de votre compte`
      return {
        title: 'Confirmez votre adresse e-mail',
        preheader: `Votre code ${brand} : ${data.otp}. Il expire dans ${data.expires_in_minutes} minutes.`,
        body:
          text(
            business
              ? `Saisissez ce code pour confirmer votre adresse et terminer ${what}.`
              : `Saisissez ce code dans l'application ${escapeHtml(brand)} pour terminer ${what}.`
          ) +
          otpCode(data.otp) +
          text(`Il expire dans ${escapeHtml(data.expires_in_minutes)} minutes.`, { muted: true }) +
          text("Vous n'avez rien demandé ? Ignorez ce message : aucun compte ne sera créé.", {
            muted: true,
            last: true,
          }),
        text: plainText([
          'Confirmez votre adresse e-mail',
          '',
          `Code de vérification ${brand} : ${data.otp}`,
          `Il expire dans ${data.expires_in_minutes} minutes.`,
          "Vous n'avez rien demandé ? Ignorez ce message : aucun compte ne sera créé.",
        ]),
      }
    }

    case 'user_pin_reset_requested':
    case 'pin_reset_requested': {
      const where =
        template === 'user_pin_reset_requested'
          ? `dans l'application ${brand}`
          : 'sur votre espace entreprise'
      return {
        title: 'Réinitialisez votre code de paiement',
        preheader: `Code de vérification valable ${data.expires_in_minutes} minutes.`,
        body:
          text(
            `Copiez ce code de vérification ${escapeHtml(where)}, puis choisissez votre nouveau code de paiement.`
          ) +
          otpCode(data.token, { token: true }) +
          text(`Il expire dans ${escapeHtml(data.expires_in_minutes)} minutes.`, { muted: true }) +
          text(
            "Vous n'avez rien demandé ? Ignorez ce message : votre code de paiement reste inchangé.",
            { muted: true, last: true }
          ),
        text: plainText([
          'Réinitialisez votre code de paiement',
          '',
          `Copiez ce code de vérification ${where}, puis choisissez votre nouveau code de paiement :`,
          '',
          String(data.token),
          '',
          `Il expire dans ${data.expires_in_minutes} minutes.`,
          "Vous n'avez rien demandé ? Ignorez ce message : votre code de paiement reste inchangé.",
        ]),
      }
    }

    /* ---------------------------- Vérification --------------------------- */

    // Sent by KycNotifier at each step.
    case 'kyc_status_changed': {
      const status = String(data.status ?? '')
      const label = String(data.label ?? 'vérification')
      const reason = data.reason ? String(data.reason) : null

      if (status === 'approved') {
        return {
          title: 'Votre identité est vérifiée',
          preheader: `Votre vérification (${label}) a été validée.`,
          greeting: data.name,
          body:
            text(
              `Votre vérification (${escapeHtml(label)}) a été validée. Votre compte ${escapeHtml(brand)} est vérifié.`
            ) +
            text("Aucune autre action n'est nécessaire de votre part.", {
              muted: true,
              last: true,
            }),
          text: plainText([
            data.name ? `Bonjour ${data.name},` : null,
            '',
            `Votre vérification (${label}) a été validée. Votre compte ${brand} est vérifié.`,
            "Aucune autre action n'est nécessaire de votre part.",
          ]),
        }
      }

      if (status === 'rejected') {
        return {
          title: 'Vérification refusée',
          preheader: reason ? `Motif : ${reason}` : `Votre vérification (${label}) a été refusée.`,
          greeting: data.name,
          body:
            text(`Votre vérification (${escapeHtml(label)}) a été refusée.`) +
            (reason ? notice('danger', `Motif : ${escapeHtml(reason)}`) : '') +
            text(
              `Ouvrez l'application ${escapeHtml(brand)}, rubrique Profil › Identité, pour envoyer de nouveaux documents.`,
              { muted: true, last: true }
            ),
          text: plainText([
            data.name ? `Bonjour ${data.name},` : null,
            '',
            `Votre vérification (${label}) a été refusée.`,
            reason ? `Motif : ${reason}` : null,
            '',
            `Ouvrez l'application ${brand}, rubrique Profil › Identité, pour envoyer de nouveaux documents.`,
          ]),
        }
      }

      return {
        title: 'Documents reçus',
        preheader: `Votre vérification (${label}) est en cours d'examen.`,
        greeting: data.name,
        body:
          text(
            `Nous avons bien reçu vos documents (${escapeHtml(label)}). Ils sont en cours d'examen : vous serez prévenu dès qu'une décision sera prise.`
          ) +
          text("Vous n'êtes pas à l'origine de cet envoi ? Contactez le support.", {
            muted: true,
            last: true,
          }),
        text: plainText([
          data.name ? `Bonjour ${data.name},` : null,
          '',
          `Nous avons bien reçu vos documents (${label}). Ils sont en cours d'examen : vous serez prévenu dès qu'une décision sera prise.`,
          "Vous n'êtes pas à l'origine de cet envoi ? Contactez le support.",
        ]),
      }
    }

    case 'dispute_resolved':
      return {
        title: 'Votre réclamation a été traitée',
        preheader: `Dossier n° ${data.disputeId} — ${disputeStatusLabel(data.status)}.`,
        greeting: data.name,
        body:
          text(
            `Votre réclamation a été traitée : ${escapeHtml(disputeStatusLabel(data.status))}.`
          ) +
          (data.resolutionNotes ? notice('info', escapeHtml(data.resolutionNotes)) : '') +
          text(`Dossier n° ${escapeHtml(data.disputeId)}`, { muted: true, last: true }),
        text: plainText([
          `Votre réclamation (dossier n° ${data.disputeId}) a été traitée : ${disputeStatusLabel(data.status)}.`,
          data.resolutionNotes ? String(data.resolutionNotes) : null,
        ]),
      }

    /* ---------------------- Mouvements sur le compte ---------------------- */

    case 'transfer_sent':
      return movement(brand, data, {
        title: 'Transfert envoyé',
        preheader: `${data.amount} envoyés à ${data.counterparty}.`,
        sentence: `Votre transfert à ${data.counterparty ?? 'votre destinataire'} a bien été effectué. La somme est déjà disponible sur son compte.`,
        caption: 'Montant envoyé',
        direction: 'out',
        status: 'completed',
        rows: [
          ['Bénéficiaire', party(data.counterparty, data.counterparty_code)],
          ['Débité de', data.account],
          ['Frais', 'Gratuit'],
        ],
      })

    case 'transfer_received':
      return movement(brand, data, {
        title: 'Vous avez reçu un transfert',
        preheader: `${data.amount} reçus de ${data.counterparty}.`,
        sentence: `${data.counterparty ?? 'Un expéditeur'} vous a envoyé de l'argent. La somme est déjà disponible sur votre compte.`,
        caption: 'Montant reçu',
        direction: 'in',
        status: 'completed',
        rows: [
          ['Expéditeur', party(data.counterparty, data.counterparty_code)],
          ['Crédité sur', data.account],
        ],
      })

    // Legacy key, no caller left; kept so an old queued event still renders as a receipt.
    case 'transfer_completed':
      return movement(brand, data, {
        title: 'Transfert effectué',
        preheader: `${data.amount} — ${data.recipient ?? ''}`,
        sentence: 'Votre transfert a bien été effectué.',
        caption: 'Montant',
        status: 'completed',
        rows: [['Bénéficiaire', data.recipient]],
      })

    case 'deposit_completed':
      return movement(brand, data, {
        title: 'Recharge créditée',
        preheader: `${data.amount} crédités depuis ${data.channel ?? 'mobile money'}.`,
        sentence: `Votre recharge depuis ${data.channel ?? 'mobile money'} a bien été créditée sur votre compte.`,
        caption: 'Montant rechargé',
        direction: 'in',
        status: 'completed',
        rows: [
          ['Opérateur', data.channel],
          ['Numéro débité', data.phone],
          ['Frais', feeRow(data.fee)],
          // The fee is taken from the top-up: what lands on the account is the net.
          ['Montant crédité', feeRow(data.fee) ? data.net : null],
          ['Crédité sur', data.account],
          ['Réf. opérateur', data.provider_reference],
        ],
      })

    case 'deposit_failed':
      return movement(brand, data, {
        title: "Votre recharge n'a pas abouti",
        preheader: "Aucun montant n'a été débité.",
        sentence: `Votre recharge depuis ${data.channel ?? 'mobile money'} n'a pas abouti.`,
        caption: 'Montant demandé',
        status: 'failed',
        rows: [
          ['Opérateur', data.channel],
          ['Numéro', data.phone],
          ['Motif', data.reason],
        ],
        notice: {
          tone: 'info',
          text: "Aucun montant n'a été débité de votre compte. Vous pouvez réessayer depuis l'application.",
        },
      })

    case 'payout_completed':
      return movement(brand, data, {
        title: 'Envoi remis',
        preheader: `${data.amount} remis au ${data.phone ?? data.counterparty}.`,
        sentence: `Votre envoi vers ${data.channel ?? 'mobile money'} a bien été remis au bénéficiaire.`,
        caption: 'Montant envoyé',
        direction: 'out',
        status: 'completed',
        rows: [
          ['Numéro bénéficiaire', data.phone ?? data.counterparty],
          ['Opérateur', data.channel],
          ['Débité de', data.account],
          ['Frais', feeRow(data.fee)],
          // The fee is taken from the amount sent: the beneficiary receives the net.
          ['Montant remis', feeRow(data.fee) ? data.net : null],
          ['Réf. opérateur', data.provider_reference],
        ],
      })

    case 'payout_failed':
      return movement(brand, data, {
        title: "Votre envoi n'a pas abouti",
        preheader: 'Le montant a été recrédité sur votre compte.',
        sentence: `Votre envoi vers ${data.phone ?? data.counterparty ?? 'le numéro indiqué'} n'a pas pu être remis.`,
        caption: "Montant de l'envoi",
        status: 'failed',
        rows: [
          ['Numéro bénéficiaire', data.phone ?? data.counterparty],
          ['Opérateur', data.channel],
          ['Motif', data.reason],
        ],
        notice: { tone: 'success', text: 'Le montant a été recrédité sur votre compte.' },
      })

    case 'cash_in_pending':
      return movement(brand, data, {
        title: 'Dépôt en attente de confirmation',
        preheader: `${data.amount} enregistrés par ${data.agent ?? 'un agent'}.`,
        sentence: `${data.agent ?? 'Un agent'} a enregistré un dépôt d'espèces à votre nom.`,
        caption: 'Montant déposé',
        direction: 'in',
        status: 'pending',
        rows: [
          ['Agent', data.agent],
          ['À créditer sur', data.account],
        ],
        notice: {
          tone: 'warning',
          text: "La somme sera créditée dès que l'agent aura confirmé le dépôt. Ne remettez pas d'espèces sans reçu.",
        },
      })

    case 'cash_out_requested':
      return movement(brand, data, {
        title: 'Demande de retrait',
        preheader: `${data.amount} à remettre à ${data.counterparty ?? 'un client'}.`,
        sentence: `${data.counterparty ?? 'Un client'} demande un retrait d'espèces à votre guichet.`,
        caption: 'Montant à remettre',
        status: 'pending',
        rows: [['Client', party(data.counterparty, data.counterparty_code)]],
        notice: {
          tone: 'info',
          text: "Vérifiez l'identité du client et confirmez le retrait dans l'application au moment de remettre les espèces.",
        },
      })

    case 'cash_out_completed':
      return movement(brand, data, {
        title: 'Retrait effectué',
        preheader: `${data.amount} remis en espèces par ${data.counterparty}.`,
        sentence: `${data.counterparty ?? "L'agent"} vous a remis votre retrait en espèces.`,
        caption: 'Montant retiré',
        direction: 'out',
        status: 'completed',
        rows: [
          ['Agent', data.counterparty],
          ['Débité de', data.account],
          ['Frais', feeRow(data.fee)],
          ['Total débité', feeRow(data.fee) ? data.total : null],
        ],
      })

    // Legacy key, no caller left (see NotificationService.notifyAgentCashInRequest).
    case 'agent_cash_in_request':
      return movement(
        brand,
        { ...data, amount: `${data.amount} ${data.currency}`, reference: data.transactionId },
        {
          title: 'Nouvelle demande de dépôt',
          preheader: `${data.amount} ${data.currency} de la part de ${data.customerName}.`,
          sentence: `${data.customerName ?? 'Un client'} a enregistré une demande de dépôt.`,
          caption: 'Montant demandé',
          status: 'pending',
          rows: [['Client', data.customerName]],
        }
      )

    default:
      // An unknown template still has to deliver its payload rather than an empty shell: the
      // recipient may be the only person who can tell us a call site was never wired up here.
      return {
        title: 'Notification',
        preheader: `Notification ${brand}`,
        body: text(
          `<pre style="white-space:pre-wrap;margin:0;">${escapeHtml(JSON.stringify(data, null, 2))}</pre>`,
          { last: true }
        ),
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
    footerNote: content.footerNote,
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
  'user_pin_reset_requested',
  'business_signup_otp',
  'user_signup_otp',
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
  'cash_out_completed',
] as const
