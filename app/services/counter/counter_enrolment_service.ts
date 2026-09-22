import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import type { KycDocumentType } from '#models/kyc_document'
import KycDocument from '#models/kyc_document'
import KycVerification from '#models/kyc_verification'
import User from '#models/user'
import type BusinessStaff from '#models/business_staff'
import type Wallet from '#models/wallet'
import { AuditLoggerService } from '#services/audit/audit_logger_service'
import { IdGenerator } from '#services/security/id_generator'
import { KycDocumentStorageService } from '#services/security/kyc_document_storage_service'
import { PinService } from '#services/security/pin_service'
import { UserOnboardingService } from '#services/users/user_onboarding_service'

const MAX_CODE_ATTEMPTS = 5

export class PhoneAlreadyEnrolledException extends Error {
  constructor(phone: string) {
    super(`Someone is already enrolled with the number ${phone}`)
    this.name = 'PhoneAlreadyEnrolledException'
  }
}

export interface CounterEnrolment {
  fullName: string
  phone?: string
  pin: string
  currencyCode: string
  documents: Array<{ type: KycDocumentType; buffer: Buffer; mimeType: string }>
  verificationType: 'identity' | 'address' | 'liveness' | 'document' | 'pep_screening'
}

/**
 * Enrolling someone at a counter.
 *
 * This is how the clientele an IMF actually serves gets an account: no smartphone, no e-mail
 * address, papers handed across the counter. They end up an ordinary `users` row — there is no
 * separate "counter customer" — identified by the 9-digit code they will quote at the window and
 * authorised by the PIN they choose. The day they get a phone, they claim that same account and
 * their history is already there.
 *
 * ## Who the customer belongs to
 *
 * Nobody. The row carries no institution: the person is a TumaPlus account holder that an
 * institution happens to serve, not an asset of the institution that enrolled them. The link comes
 * later and per product, through what they subscribe to. This is deliberate — it is what stops one
 * institution's customer list from becoming its property, and what lets someone bank with two.
 *
 * ## The PIN
 *
 * Chosen by the customer at the window and never seen by the teller — it is the only thing that
 * will authorise a withdrawal from their account, including a withdrawal the teller themselves
 * processes. It is taken here rather than assigned because an account whose PIN was set by someone
 * else is an account that person can empty.
 *
 * ## The papers
 *
 * Recorded as a pending verification, never as an approved one. A teller collects evidence; they
 * do not decide that it is sufficient. Review stays where it already is, on the generic
 * POST /kyc/:id/approve, which never branched on subject type.
 */
export class CounterEnrolmentService {
  static async enrol(
    staff: BusinessStaff,
    counterId: number,
    enrolment: CounterEnrolment,
    correlationId: string
  ): Promise<{ user: User; wallet: Wallet; kycId: string }> {
    if (enrolment.phone) {
      const existing = await User.findBy('phone', enrolment.phone)
      if (existing) {
        throw new PhoneAlreadyEnrolledException(enrolment.phone)
      }
    }

    const code = await this.generateUniqueCode()

    const user = await db.transaction(async (trx) => {
      const created = new User()
      created.fullName = enrolment.fullName
      created.phone = enrolment.phone ?? null
      created.code = code
      // No address and no password: the account is worked at the window, by code and PIN. See
      // migration 1800000000003 for why both columns are nullable, and User.verifyPassword for
      // why an account without one can never be signed into.
      created.email = null
      created.password = null
      await created.useTransaction(trx).save()
      return created
    })

    await PinService.setPin(user, enrolment.pin)

    const wallet = await UserOnboardingService.createDefaultWallet(
      user.id,
      enrolment.currencyCode,
      correlationId
    )

    const kyc = new KycVerification()
    kyc.subjectType = 'user'
    kyc.subjectId = user.id
    kyc.verificationType = enrolment.verificationType
    kyc.status = 'pending'
    kyc.submittedAt = DateTime.now()
    await kyc.save()

    for (const file of enrolment.documents) {
      const rawPayloadRef = await KycDocumentStorageService.store(file.buffer)
      const document = new KycDocument()
      document.kycVerificationId = kyc.id
      document.documentType = file.type
      document.rawPayloadRef = rawPayloadRef
      document.mimeType = file.mimeType
      await document.save()
    }

    await AuditLoggerService.record({
      actorType: 'agent',
      actorId: counterId,
      action: 'counter.customer_enrolled',
      resourceType: 'user',
      resourceId: user.id,
      before: undefined,
      after: {
        code: user.code,
        enrolled_by_staff_id: staff.id,
        business_id: staff.businessId,
        kyc_id: kyc.id,
        documents: enrolment.documents.map((d) => d.type),
      },
      correlationId,
    })

    return { user, wallet, kycId: kyc.id }
  }

  /**
   * Retries on the rare collision against the unique `users.code` column rather than letting a
   * raw constraint error surface — same reasoning as NewAccountController's own generator.
   */
  private static async generateUniqueCode(): Promise<string> {
    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
      const candidate = IdGenerator.generateNumericCode()
      if (!(await User.findBy('code', candidate))) {
        return candidate
      }
    }
    throw new Error('Unable to generate a unique customer code after several attempts')
  }
}
