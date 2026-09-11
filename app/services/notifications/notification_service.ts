import mail from '@adonisjs/mail/services/main'
import env from '#start/env'

/**
 * Brand name used in the message bodies.
 *
 * Read from the mail config rather than written in each template: the recipient sees this name
 * as the sender, and a body that signs off with a different one reads like a phishing attempt.
 */
const BRAND = env.get('MAIL_FROM_NAME') || 'TumaPlus'

/**
 * Notification Service - Send emails and SMS
 *
 * Email is sent via @adonisjs/mail (config/mail.ts — SMTP transport, configured for Namecheap
 * Private Email). SMS remains a placeholder: wire a real provider (Twilio/AWS SNS) into
 * sendSms() the same way sendEmail() now uses the mail service, when one is chosen.
 */

export interface EmailNotification {
  to: string
  subject: string
  template: string
  data: Record<string, any>
}

export interface SmsNotification {
  phone: string
  message: string
}

/**
 * Renders known email templates to plain HTML — no templating engine (Edge) is configured in
 * this project, so this is a minimal inline renderer rather than pulling in a new dependency for
 * a handful of short transactional emails. Add a case here for each `template` value passed to
 * sendEmail() (see pin_controller.ts, business_dashboard/pin_controller.ts, and the methods
 * below for the ones actually in use).
 *
 * All templates are in French, like the applications they serve: an account holder who reads
 * "Transfert envoyé" in the app should not receive "Transfer sent" by e-mail. Template KEYS stay
 * in English — they are identifiers passed by the call sites, not text anyone reads.
 */

/** Shared frame: a greeting, the body, and the same sign-off on every movement e-mail. */
function frame(name: string, body: string): string {
  return `<p>Bonjour ${escapeHtml(name)},</p>
${body}
<p style="color:#5A6072;font-size:13px">Vous recevez ce message parce qu'une opération a eu lieu sur votre compte ${escapeHtml(BRAND)}. En cas de doute, contactez le support en citant la référence ci-dessus.</p>`
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

/**
 * Values interpolated below come from user-controlled fields — a full name, a description. They
 * are escaped so a name containing `<` cannot break, or inject into, the message body.
 */
function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
function renderEmailHtml(template: string, data: Record<string, any>): string {
  switch (template) {
    case 'pin_reset_requested':
      return `<p>Vous avez demandé à réinitialiser votre code de paiement ${escapeHtml(BRAND)}.</p>
<p>Code de vérification (valable ${escapeHtml(data.expires_in_minutes)} minutes) :</p>
<p style="font-size: 20px; font-weight: bold; letter-spacing: 2px;">${escapeHtml(data.token)}</p>
<p>Si vous n'êtes pas à l'origine de cette demande, ignorez ce message : votre code reste inchangé.</p>`

    case 'business_signup_otp':
      return `<p>Votre code de vérification pour la création d'un compte entreprise ${escapeHtml(BRAND)} :</p>
<p style="font-size: 24px; font-weight: bold; letter-spacing: 4px;">${escapeHtml(data.otp)}</p>
<p>Ce code expire dans ${escapeHtml(data.expires_in_minutes)} minutes. Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.</p>`

    case 'transfer_completed':
      return `<p>Votre transfert de ${escapeHtml(data.amount)} ${escapeHtml(data.currency)} à ${escapeHtml(data.recipient)} a bien été effectué.</p>
<p>Référence : <strong>${escapeHtml(data.uuid)}</strong><br>Date : ${escapeHtml(data.timestamp)}</p>`

    case 'kyc_status_changed':
      return `<p>${escapeHtml(data.message)}</p>`

    case 'agent_cash_in_request':
      return `<p>Nouvelle demande de dépôt : ${escapeHtml(data.amount)} ${escapeHtml(data.currency)} de la part de ${escapeHtml(data.customerName)}.</p>
<p>Opération n° <strong>${escapeHtml(data.transactionId)}</strong></p>`

    case 'dispute_resolved':
      return `<p>Votre réclamation (dossier n° ${escapeHtml(data.disputeId)}) a été traitée : ${escapeHtml(disputeStatusLabel(data.status))}.</p>
<p>${escapeHtml(data.resolutionNotes)}</p>`

    /* ---------------------- Mouvements sur le compte ---------------------- */

    case 'transfer_sent':
      return frame(
        data.name,
        `<p>Votre transfert de <strong>${escapeHtml(data.amount)}</strong> à ${escapeHtml(data.counterparty)} a bien été effectué.</p>
<p>Référence : <strong>${escapeHtml(data.reference)}</strong><br>Date : ${escapeHtml(data.date)}</p>`
      )

    case 'transfer_received':
      return frame(
        data.name,
        `<p>Vous avez reçu <strong>${escapeHtml(data.amount)}</strong> de la part de ${escapeHtml(data.counterparty)}.</p>
<p>La somme est déjà disponible sur votre compte.</p>
<p>Référence : <strong>${escapeHtml(data.reference)}</strong><br>Date : ${escapeHtml(data.date)}</p>`
      )

    case 'deposit_completed':
      return frame(
        data.name,
        `<p>Votre recharge de <strong>${escapeHtml(data.amount)}</strong> a été créditée sur votre compte.</p>
<p>Référence : <strong>${escapeHtml(data.reference)}</strong><br>Date : ${escapeHtml(data.date)}</p>`
      )

    case 'deposit_failed':
      return frame(
        data.name,
        `<p>Votre recharge de <strong>${escapeHtml(data.amount)}</strong> n'a pas abouti. Aucun montant n'a été débité.</p>
${data.reason ? `<p>Motif : ${escapeHtml(data.reason)}</p>` : ''}
<p>Référence : <strong>${escapeHtml(data.reference)}</strong><br>Date : ${escapeHtml(data.date)}</p>`
      )

    case 'payout_completed':
      return frame(
        data.name,
        `<p>Votre envoi de <strong>${escapeHtml(data.amount)}</strong> vers ${escapeHtml(data.counterparty)} a bien été remis.</p>
<p>Référence : <strong>${escapeHtml(data.reference)}</strong><br>Date : ${escapeHtml(data.date)}</p>`
      )

    case 'payout_failed':
      return frame(
        data.name,
        `<p>Votre envoi de <strong>${escapeHtml(data.amount)}</strong> vers ${escapeHtml(data.counterparty)} n'a pas abouti. Le montant a été recrédité sur votre compte.</p>
${data.reason ? `<p>Motif : ${escapeHtml(data.reason)}</p>` : ''}
<p>Référence : <strong>${escapeHtml(data.reference)}</strong><br>Date : ${escapeHtml(data.date)}</p>`
      )

    case 'cash_in_pending':
      return frame(
        data.name,
        `<p>Un agent a enregistré un dépôt de <strong>${escapeHtml(data.amount)}</strong> à votre nom.</p>
<p>Il sera crédité dès que l'agent l'aura confirmé.</p>
<p>Référence : <strong>${escapeHtml(data.reference)}</strong></p>`
      )

    case 'cash_out_requested':
      return frame(
        data.name,
        `<p>Une demande de retrait de <strong>${escapeHtml(data.amount)}</strong> vous a été adressée.</p>
<p>Le client se présentera pour retirer la somme.</p>
<p>Référence : <strong>${escapeHtml(data.reference)}</strong></p>`
      )

    default:
      return `<pre>${JSON.stringify(data, null, 2)}</pre>`
  }
}

export class NotificationService {
  /**
   * Send email notification via the configured SMTP mailer.
   */
  static async sendEmail(email: EmailNotification): Promise<boolean> {
    try {
      await mail.send((message) => {
        message
          .to(email.to)
          .subject(email.subject)
          .html(renderEmailHtml(email.template, email.data))
      })

      return true
    } catch (error) {
      console.error(`Email failed for ${email.to}:`, error)
      return false
    }
  }

  /**
   * Send SMS notification
   * TODO: Integrate with Twilio/AWS SNS
   */
  static async sendSms(sms: SmsNotification): Promise<boolean> {
    try {
      // Placeholder implementation
      console.log(`[SMS] To: ${sms.phone}`)
      console.log(`[SMS] Message: ${sms.message}`)

      // In production, integrate with SMS service
      // const client = twilio || sns
      // await client.messages.create({
      //   to: sms.phone,
      //   body: sms.message,
      // })

      return true
    } catch (error) {
      console.error(`SMS failed for ${sms.phone}:`, error)
      return false
    }
  }

  /**
   * Notify user of transaction completion.
   *
   * SUPERSEDED, and currently called from nowhere. Completed transfers are announced by the
   * outbox relay (`transfer_sent` / `transfer_received`), which knows both parties and retries a
   * failed send. Wiring this in as well would send the sender two e-mails for one transfer.
   */
  static async notifyTransactionCompleted(
    userEmail: string,
    userPhone: string | null,
    transactionData: {
      uuid: string
      amount: string
      currency: string
      recipient: string
      timestamp: string
    }
  ): Promise<void> {
    await this.sendEmail({
      to: userEmail,
      subject: `Transfert confirmé — ${transactionData.amount} ${transactionData.currency}`,
      template: 'transfer_completed',
      data: transactionData,
    })

    if (userPhone) {
      await this.sendSms({
        phone: userPhone,
        message: `Votre transfert de ${transactionData.amount} ${transactionData.currency} à ${transactionData.recipient} a bien été effectué.`,
      })
    }
  }

  /**
   * Notify user of KYC status change
   */
  static async notifyKycStatusChanged(
    userEmail: string,
    status: 'approved' | 'rejected' | 'pending',
    reason?: string
  ): Promise<void> {
    const messages: Record<string, string> = {
      approved: 'Votre identité a été vérifiée. Les plafonds de votre compte sont désormais levés.',
      rejected: `Votre vérification d'identité a été refusée. Motif : ${reason || 'contactez le support'}`,
      pending: "Votre vérification d'identité est en cours d'examen. Comptez 24 à 48 heures.",
    }

    // The subject carries the outcome in plain French: `status.toUpperCase()` put a raw English
    // enum value — "APPROVED" — in front of the recipient.
    const subjects: Record<string, string> = {
      approved: 'Identité vérifiée',
      rejected: "Vérification d'identité refusée",
      pending: "Vérification d'identité en cours",
    }

    await this.sendEmail({
      to: userEmail,
      subject: subjects[status] ?? "Vérification d'identité",
      template: 'kyc_status_changed',
      data: { status, message: messages[status] },
    })
  }

  /**
   * Notify agent of cash-in request
   */
  static async notifyAgentCashInRequest(
    agentEmail: string,
    agentPhone: string | null,
    cashInData: {
      transactionId: number
      amount: string
      currency: string
      customerName: string
    }
  ): Promise<void> {
    await this.sendEmail({
      to: agentEmail,
      subject: `Nouvelle demande de dépôt — ${cashInData.amount} ${cashInData.currency}`,
      template: 'agent_cash_in_request',
      data: cashInData,
    })

    if (agentPhone) {
      await this.sendSms({
        phone: agentPhone,
        message: `Nouvelle demande de dépôt : ${cashInData.amount} ${cashInData.currency} de la part de ${cashInData.customerName}. Opération n° ${cashInData.transactionId}`,
      })
    }
  }

  /**
   * Notify user of dispute resolution
   */
  static async notifyDisputeResolved(
    userEmail: string,
    disputeData: {
      disputeId: number
      status: string
      resolutionNotes: string
    }
  ): Promise<void> {
    await this.sendEmail({
      to: userEmail,
      subject: `Réclamation traitée — dossier n° ${disputeData.disputeId}`,
      template: 'dispute_resolved',
      data: disputeData,
    })
  }
}
