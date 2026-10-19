import type KycVerification from '#models/kyc_verification'
import { InAppNotificationService } from '#services/notifications/in_app_notification_service'
import { TransactionNotifier } from '#services/notifications/transaction_notifier'

/** What was checked, as it reads in a French sentence. */
const VERIFICATION_LABEL: Record<string, string> = {
  identity: "pièce d'identité",
  address: 'justificatif de domicile',
  liveness: 'photo de vérification',
  document: 'document',
  pep_screening: 'contrôle de conformité',
}

/** The reviewer's reason, without the final full stop the sentence around it adds back. */
function reasonText(reason: string | null): string {
  return (reason ?? 'motif non précisé').trim().replace(/[.!\s]+$/, '')
}

function labelFor(kyc: KycVerification): string {
  return VERIFICATION_LABEL[kyc.verificationType] ?? 'vérification'
}

/**
 * Tells the account holder where their identity verification stands: on submission, and when a
 * reviewer decides. Each step writes the in-app row (which also pushes, see
 * InAppNotificationService) and sends an e-mail.
 *
 * The e-mail is fired without being awaited: no money moves here, so there is no transaction to
 * keep it out of, but the reviewer's or the holder's request should not wait on SMTP either.
 * TransactionNotifier.email() throws on failure; the catch keeps that from becoming an
 * unhandled rejection. A subject with no address (counter-enrolled holder) is skipped by it.
 */
export class KycNotifier {
  static async submitted(kyc: KycVerification): Promise<void> {
    const label = labelFor(kyc)

    await InAppNotificationService.notify({
      recipientType: kyc.subjectType as 'user' | 'agent' | 'business',
      recipientId: kyc.subjectId,
      type: 'kyc.submitted',
      title: 'Documents reçus',
      message: `Votre vérification (${label}) est en cours d'examen. Vous serez prévenu dès qu'une décision sera prise.`,
      data: { kyc_id: kyc.id },
    })

    void this.email(kyc, 'Documents reçus', { status: 'submitted', label })
  }

  static async decided(kyc: KycVerification): Promise<void> {
    const label = labelFor(kyc)
    const approved = kyc.status === 'approved'

    await InAppNotificationService.notify({
      recipientType: kyc.subjectType as 'user' | 'agent' | 'business',
      recipientId: kyc.subjectId,
      type: approved ? 'kyc.approved' : 'kyc.rejected',
      title: approved ? 'Identité vérifiée' : 'Vérification refusée',
      message: approved
        ? `Votre vérification (${label}) a été validée.`
        : `Votre vérification (${label}) a été refusée : ${reasonText(kyc.decisionReason)}. Vous pouvez envoyer de nouveaux documents.`,
      data: approved ? { kyc_id: kyc.id } : { kyc_id: kyc.id, reason: kyc.decisionReason },
    })

    void this.email(kyc, approved ? 'Votre identité est vérifiée' : 'Vérification refusée', {
      status: approved ? 'approved' : 'rejected',
      label,
      reason: kyc.decisionReason,
    })
  }

  private static async email(
    kyc: KycVerification,
    subject: string,
    data: Record<string, unknown>
  ): Promise<void> {
    try {
      const recipient = await TransactionNotifier.recipientForActor(kyc.subjectType, kyc.subjectId)
      if (recipient) await TransactionNotifier.email(recipient, subject, 'kyc_status_changed', data)
    } catch (error) {
      console.error(`KYC e-mail failed for verification ${kyc.id}:`, error)
    }
  }
}
