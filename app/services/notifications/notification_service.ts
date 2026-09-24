import mail from '@adonisjs/mail/services/main'
import env from '#start/env'
import { renderEmailHtml, renderEmailText } from './email_templates.js'

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
          .html(renderEmailHtml(email.template, email.data, BRAND))
          .text(renderEmailText(email.template, email.data, BRAND))
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
