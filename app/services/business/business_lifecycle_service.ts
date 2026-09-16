import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import Business from '#models/business'
import KycVerification from '#models/kyc_verification'
import { AuditLoggerService } from '#services/audit/audit_logger_service'
import { InAppNotificationService } from '#services/notifications/in_app_notification_service'

export class BusinessLifecycleService {
  /**
   * pending_approval → active
   * Requires an approved KYC (KYB) verification for this business — submitted via
   * POST /business/dashboard/kyc/submit, reviewed via the generic POST /kyc/:kyc_id/approve
   * (kyc_controller.ts, unchanged — it never branches on subject_type). This is a hard gate:
   * an admin cannot approve the business itself before its KYC has been approved.
   */
  static async approve(
    businessId: number,
    approvedBy: number,
    correlationId: string
  ): Promise<Business> {
    const business = await db.transaction(async (trx) => {
      const business = await Business.findOrFail(businessId, { client: trx })

      if (business.status !== 'pending_approval') {
        throw new Error('Business must be in pending_approval status')
      }

      const approvedKyc = await KycVerification.query({ client: trx })
        .where('subject_type', 'business')
        .where('subject_id', businessId)
        .where('status', 'approved')
        .first()

      if (!approvedKyc) {
        throw new Error('Business KYC must be approved before the business itself can be approved')
      }

      business.status = 'active'
      business.approvedAt = DateTime.now()
      business.approvedBy = approvedBy
      await business.useTransaction(trx).save()

      await AuditLoggerService.record({
        actorType: 'internal_user',
        actorId: approvedBy,
        action: 'business.approved',
        resourceType: 'business',
        resourceId: business.id,
        before: { status: 'pending_approval' },
        after: { status: 'active' },
        correlationId,
        trx,
      })

      return business
    })

    await InAppNotificationService.notify({
      recipientType: 'business',
      recipientId: business.id,
      type: 'business.approved',
      title: 'Account approved',
      message: 'Your business account has been approved. You can now log in to the dashboard.',
      data: { business_id: business.id },
    })

    return business
  }

  /** active → suspended */
  static async suspend(
    businessId: number,
    suspendedBy: number,
    reason: string,
    correlationId: string
  ): Promise<Business> {
    const business = await db.transaction(async (trx) => {
      const business = await Business.findOrFail(businessId, { client: trx })

      if (business.status !== 'active') {
        throw new Error('Only active businesses can be suspended')
      }

      business.status = 'suspended'
      business.suspendedAt = DateTime.now()
      business.suspensionReason = reason
      await business.useTransaction(trx).save()

      await AuditLoggerService.record({
        actorType: 'internal_user',
        actorId: suspendedBy,
        action: 'business.suspended',
        resourceType: 'business',
        resourceId: business.id,
        before: { status: 'active' },
        after: { status: 'suspended', reason },
        correlationId,
        trx,
      })

      return business
    })

    await InAppNotificationService.notify({
      recipientType: 'business',
      recipientId: business.id,
      type: 'business.suspended',
      title: 'Account suspended',
      message: `Your business account has been suspended: ${reason}`,
      data: { business_id: business.id, reason },
    })

    return business
  }

  /** suspended → active */
  static async activate(
    businessId: number,
    reactivatedBy: number,
    correlationId: string
  ): Promise<Business> {
    const business = await db.transaction(async (trx) => {
      const business = await Business.findOrFail(businessId, { client: trx })

      if (business.status !== 'suspended') {
        throw new Error('Only suspended businesses can be reactivated')
      }

      business.status = 'active'
      business.suspendedAt = null
      business.suspensionReason = null
      await business.useTransaction(trx).save()

      await AuditLoggerService.record({
        actorType: 'internal_user',
        actorId: reactivatedBy,
        action: 'business.reactivated',
        resourceType: 'business',
        resourceId: business.id,
        before: { status: 'suspended' },
        after: { status: 'active' },
        correlationId,
        trx,
      })

      return business
    })

    await InAppNotificationService.notify({
      recipientType: 'business',
      recipientId: business.id,
      type: 'business.reactivated',
      title: 'Account reactivated',
      message: 'Your business account has been reactivated. You can log in again.',
      data: { business_id: business.id },
    })

    return business
  }

  /** any non-terminated status → terminated (revokes access permanently) */
  static async deactivate(
    businessId: number,
    terminatedBy: number,
    reason: string,
    correlationId: string
  ): Promise<Business> {
    const business = await db.transaction(async (trx) => {
      const business = await Business.findOrFail(businessId, { client: trx })

      if (business.status === 'terminated') {
        throw new Error('Business is already terminated')
      }

      const beforeStatus = business.status
      business.status = 'terminated'
      business.terminatedAt = DateTime.now()
      business.terminationReason = reason
      await business.useTransaction(trx).save()

      await AuditLoggerService.record({
        actorType: 'internal_user',
        actorId: terminatedBy,
        action: 'business.terminated',
        resourceType: 'business',
        resourceId: business.id,
        before: { status: beforeStatus },
        after: { status: 'terminated', reason },
        correlationId,
        trx,
      })

      return business
    })

    // Note: a terminated business can never log in again (login requires status='active'), so
    // this row is purely a record — there's no dashboard session left to ever read it.
    await InAppNotificationService.notify({
      recipientType: 'business',
      recipientId: business.id,
      type: 'business.terminated',
      title: 'Account terminated',
      message: `Your business account has been terminated: ${reason}`,
      data: { business_id: business.id, reason },
    })

    return business
  }
}
