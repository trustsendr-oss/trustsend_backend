import { randomBytes } from 'node:crypto'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import LikilibaInvitation from '#models/likiliba_invitation'
import LikilibaMember from '#models/likiliba_member'
import User from '#models/user'
import likilibaConfig from '#config/likiliba'
import { UserOnboardingService } from '#services/users/user_onboarding_service'
import { formatAmount } from '#services/notifications/transaction_notifier'
import { LikilibaJournal } from '#services/likiliba/journal'
import { LikilibaNotifier } from '#services/likiliba/notifier'
import { displayName, LikilibaService, membersOf } from '#services/likiliba/likiliba_service'
import {
  isKycApproved,
  LikilibaException,
  lockGroup,
  normalisePhone,
  sha256,
} from '#services/likiliba/shared'

export type InvitationTarget =
  | { channel: 'account'; userCode: string }
  | { channel: 'phone'; phone: string }
  | { channel: 'link' }

/**
 * Admission to a private group, in the order the rules require: the organiser invites, the person
 * accepts (or declines), the organiser admits (or rejects). Reemite never suggests anyone.
 *
 * One person can hold invitations to many groups at the same time; each is answered on its own.
 */
export class LikilibaInvitationService {
  static async invite(
    organiser: User,
    likilibaId: number,
    target: InvitationTarget,
    correlationId: string
  ): Promise<{ invitation: LikilibaInvitation; token: string | null }> {
    return db.transaction(async (trx) => {
      const likiliba = await lockGroup(likilibaId, trx)
      LikilibaService.assertOrganiser(likiliba, organiser.id)
      if (likiliba.status !== 'recruiting') {
        throw new LikilibaException(
          'Invitations are closed for this likiliba',
          'INVITATIONS_CLOSED',
          409
        )
      }

      const members = await membersOf(likiliba, trx)
      if (members.length >= likiliba.size) {
        throw new LikilibaException('The group is already complete', 'GROUP_FULL', 409)
      }
      const open = await LikilibaInvitation.query({ client: trx })
        .where('likilibaId', likiliba.id)
        .whereIn('status', ['pending', 'accepted'])
      // Enough to replace a few refusals, not enough to spray invitations around.
      if (open.length >= likiliba.size * 2) {
        throw new LikilibaException(
          'Too many invitations are still open for this group',
          'TOO_MANY_INVITATIONS',
          409
        )
      }

      const invitation = new LikilibaInvitation()
      invitation.likilibaId = likiliba.id
      invitation.invitedByUserId = organiser.id
      invitation.channel = target.channel
      invitation.status = 'pending'
      invitation.expiresAt = DateTime.now().plus({ days: likilibaConfig.invitationTtlDays })

      let token: string | null = null
      let invitee: User | null = null

      if (target.channel === 'account') {
        invitee = await User.findBy('code', target.userCode, { client: trx })
        if (!invitee)
          throw new LikilibaException('No account matches this code', 'USER_NOT_FOUND', 404)
      } else if (target.channel === 'phone') {
        const phone = normalisePhone(target.phone)
        if (!phone) throw new LikilibaException('This phone number is not valid', 'INVALID_PHONE')
        invitation.inviteePhone = phone
        invitee = await findUserByPhone(phone, trx)
      } else {
        token = randomBytes(24).toString('base64url')
        invitation.tokenHash = sha256(token)
      }

      if (invitee) {
        if (invitee.id === organiser.id) {
          throw new LikilibaException('You are already in this likiliba', 'ALREADY_MEMBER', 409)
        }
        if (members.some((m) => m.userId === invitee!.id)) {
          throw new LikilibaException('This person is already a member', 'ALREADY_MEMBER', 409)
        }
        if (open.some((i) => i.inviteeUserId === invitee!.id)) {
          throw new LikilibaException(
            'This person already has an open invitation to this group',
            'ALREADY_INVITED',
            409
          )
        }
        invitation.inviteeUserId = invitee.id
      }
      if (invitation.inviteePhone && open.some((i) => i.inviteePhone === invitation.inviteePhone)) {
        throw new LikilibaException(
          'This number already has an open invitation to this group',
          'ALREADY_INVITED',
          409
        )
      }

      await invitation.useTransaction(trx).save()

      await LikilibaJournal.record({
        likiliba,
        actor: { type: 'user', id: organiser.id },
        eventType: 'invitation_sent',
        payload: {
          invitation_id: invitation.id,
          channel: invitation.channel,
          invitee_user_id: invitation.inviteeUserId,
          expires_at: invitation.expiresAt.toISO(),
        },
        correlationId,
        trx,
      })

      if (invitee) {
        await LikilibaNotifier.notify(
          likiliba,
          {
            userIds: [invitee.id],
            type: 'invitation_received',
            title: 'Invitation à une likiliba',
            message: `${displayName(organiser)} vous invite dans « ${likiliba.name} » : ${formatAmount(likiliba.contributionAmount, likiliba.currencyCode)} par tour, ${likiliba.size} participants${likiliba.cautionRequired ? ', caution obligatoire' : ', sans caution'}. Lisez les règles avant de répondre.`,
            data: { invitation_id: invitation.id, expires_at: invitation.expiresAt.toISO() },
            correlationId,
          },
          trx
        )
      }
      return { invitation, token }
    })
  }

  /** Every open invitation addressed to this person, across all groups. */
  static async listFor(user: User) {
    const phone = normalisePhone(user.phone)
    await this.expireLapsed()
    return LikilibaInvitation.query()
      .where((q) => {
        q.where('inviteeUserId', user.id)
        if (phone) q.orWhere((p) => p.whereNull('inviteeUserId').where('inviteePhone', phone))
      })
      .whereIn('status', ['pending', 'accepted'])
      .preload('likiliba')
      .preload('invitedBy')
      .orderBy('createdAt', 'desc')
  }

  static async accept(user: User, invitationId: number, correlationId: string) {
    return this.respond(user, { id: invitationId }, 'accept', correlationId)
  }

  static async acceptLink(user: User, token: string, correlationId: string) {
    return this.respond(user, { tokenHash: sha256(token) }, 'accept', correlationId)
  }

  static async decline(user: User, invitationId: number, correlationId: string) {
    return this.respond(user, { id: invitationId }, 'decline', correlationId)
  }

  private static async respond(
    user: User,
    lookup: { id?: number; tokenHash?: string },
    answer: 'accept' | 'decline',
    correlationId: string
  ) {
    return db.transaction(async (trx) => {
      const query = LikilibaInvitation.query({ client: trx })
      const found = await (
        lookup.id
          ? query.where('id', lookup.id)
          : query.where('tokenHash', lookup.tokenHash!).where('channel', 'link')
      ).first()
      if (!found)
        throw new LikilibaException('This invitation does not exist', 'INVITATION_NOT_FOUND', 404)

      const likiliba = await lockGroup(found.likilibaId, trx)
      const invitation = await LikilibaInvitation.query({ client: trx })
        .where('id', found.id)
        .forUpdate()
        .firstOrFail()

      if (!this.isAddressedTo(invitation, user)) {
        throw new LikilibaException(
          'This invitation is not addressed to you',
          'INVITATION_NOT_FOUND',
          404
        )
      }
      if (invitation.status !== 'pending') {
        throw new LikilibaException(
          'This invitation has already been answered',
          'INVITATION_CLOSED',
          409
        )
      }
      if (invitation.isExpired) {
        invitation.status = 'expired'
        await invitation.useTransaction(trx).save()
        throw new LikilibaException('This invitation has expired', 'INVITATION_EXPIRED', 410)
      }
      if (likiliba.status !== 'recruiting') {
        throw new LikilibaException(
          'This likiliba is no longer taking members',
          'INVITATIONS_CLOSED',
          409
        )
      }

      if (answer === 'accept') {
        const already = await LikilibaMember.query({ client: trx })
          .where('likilibaId', likiliba.id)
          .where('userId', user.id)
          .whereNotIn('status', ['left', 'removed'])
          .first()
        if (already) throw new LikilibaException('You are already a member', 'ALREADY_MEMBER', 409)

        const duplicate = await LikilibaInvitation.query({ client: trx })
          .where('likilibaId', likiliba.id)
          .where('inviteeUserId', user.id)
          .whereIn('status', ['pending', 'accepted'])
          .whereNot('id', invitation.id)
          .first()
        if (duplicate) {
          throw new LikilibaException(
            'You already have an open invitation to this group',
            'ALREADY_INVITED',
            409
          )
        }

        if (
          !likiliba.cautionRequired &&
          likilibaConfig.requireKycWithoutCaution &&
          !(await isKycApproved(user.id, trx))
        ) {
          throw new LikilibaException(
            'Your identity must be verified to join a likiliba without caution',
            'KYC_REQUIRED',
            403
          )
        }
        // The account that contributions leave from and payouts land in.
        await UserOnboardingService.createDefaultWallet(
          user.id,
          likiliba.currencyCode,
          correlationId,
          trx
        )
      }

      invitation.inviteeUserId = user.id
      invitation.status = answer === 'accept' ? 'accepted' : 'declined'
      invitation.respondedAt = DateTime.now()
      await invitation.useTransaction(trx).save()

      await LikilibaJournal.record({
        likiliba,
        actor: { type: 'user', id: user.id },
        eventType: answer === 'accept' ? 'invitation_accepted' : 'invitation_declined',
        payload: { invitation_id: invitation.id, user_id: user.id },
        correlationId,
        trx,
      })
      await LikilibaNotifier.notify(
        likiliba,
        {
          userIds: [likiliba.creatorUserId],
          type: answer === 'accept' ? 'invitation_accepted' : 'invitation_declined',
          title: answer === 'accept' ? 'Invitation acceptée' : 'Invitation refusée',
          message:
            answer === 'accept'
              ? `${displayName(user)} a accepté de rejoindre « ${likiliba.name} ». Admettez-le pour confirmer sa place.`
              : `${displayName(user)} a refusé l'invitation à « ${likiliba.name} ».`,
          data: { invitation_id: invitation.id },
          correlationId,
        },
        trx
      )
      return invitation
    })
  }

  /** The organiser confirms an accepted invitation: the person becomes a member. */
  static async admit(organiser: User, invitationId: number, correlationId: string) {
    return this.decide(organiser, invitationId, 'admit', correlationId)
  }

  static async reject(organiser: User, invitationId: number, correlationId: string) {
    return this.decide(organiser, invitationId, 'reject', correlationId)
  }

  private static async decide(
    organiser: User,
    invitationId: number,
    decision: 'admit' | 'reject',
    correlationId: string
  ) {
    return db.transaction(async (trx) => {
      const found = await LikilibaInvitation.find(invitationId, { client: trx })
      if (!found)
        throw new LikilibaException('This invitation does not exist', 'INVITATION_NOT_FOUND', 404)
      const likiliba = await lockGroup(found.likilibaId, trx)
      LikilibaService.assertOrganiser(likiliba, organiser.id)
      const invitation = await LikilibaInvitation.query({ client: trx })
        .where('id', found.id)
        .forUpdate()
        .firstOrFail()

      if (invitation.status !== 'accepted' || !invitation.inviteeUserId) {
        throw new LikilibaException(
          'Only an accepted invitation can be decided on',
          'INVITATION_NOT_ACCEPTED',
          409
        )
      }
      if (likiliba.status !== 'recruiting') {
        throw new LikilibaException(
          'This likiliba is no longer taking members',
          'INVITATIONS_CLOSED',
          409
        )
      }

      let member: LikilibaMember | null = null
      if (decision === 'admit') {
        const members = await membersOf(likiliba, trx)
        if (members.length >= likiliba.size) {
          throw new LikilibaException('The group is already complete', 'GROUP_FULL', 409)
        }
        const wallet = await UserOnboardingService.createDefaultWallet(
          invitation.inviteeUserId,
          likiliba.currencyCode,
          correlationId,
          trx
        )
        // Someone who left before may be invited back: their old row is reused.
        member =
          (await LikilibaMember.query({ client: trx })
            .where('likilibaId', likiliba.id)
            .where('userId', invitation.inviteeUserId)
            .first()) ?? new LikilibaMember()
        member.likilibaId = likiliba.id
        member.userId = invitation.inviteeUserId
        member.role = 'member'
        member.status = 'admitted'
        member.invitationId = invitation.id
        member.walletId = wallet.id
        member.position = null
        member.leftAt = null
        member.autoDebit = false
        member.acceptedRuleVersionId = null
        member.rulesAcceptedAt = null
        await member.useTransaction(trx).save()
      }

      invitation.status = decision === 'admit' ? 'admitted' : 'rejected'
      invitation.decidedAt = DateTime.now()
      await invitation.useTransaction(trx).save()

      const invitee = await User.findOrFail(invitation.inviteeUserId, { client: trx })
      await LikilibaJournal.record({
        likiliba,
        actor: { type: 'user', id: organiser.id },
        eventType: decision === 'admit' ? 'member_admitted' : 'invitation_rejected',
        memberId: member?.id ?? null,
        payload: { invitation_id: invitation.id, user_id: invitee.id },
        correlationId,
        trx,
      })

      await LikilibaNotifier.notify(
        likiliba,
        {
          userIds: [invitee.id],
          type: decision === 'admit' ? 'admitted' : 'rejected',
          title: decision === 'admit' ? 'Vous êtes admis' : 'Demande non retenue',
          message:
            decision === 'admit'
              ? `Vous faites partie de « ${likiliba.name} ». Vous signerez les règles quand le groupe sera complet.`
              : `L'organisateur n'a pas retenu votre participation à « ${likiliba.name} ».`,
          correlationId,
        },
        trx
      )
      if (member) {
        const members = await membersOf(likiliba, trx)
        await LikilibaNotifier.notify(
          likiliba,
          {
            userIds: members.map((m) => m.userId).filter((id) => id !== invitee.id),
            type: 'member_joined',
            title: 'Nouveau membre',
            message: `${displayName(invitee)} a rejoint « ${likiliba.name} » (${members.length}/${likiliba.size}).`,
            correlationId,
          },
          trx
        )
      }
      return invitation
    })
  }

  static async revoke(organiser: User, invitationId: number, correlationId: string) {
    return db.transaction(async (trx) => {
      const found = await LikilibaInvitation.find(invitationId, { client: trx })
      if (!found)
        throw new LikilibaException('This invitation does not exist', 'INVITATION_NOT_FOUND', 404)
      const likiliba = await lockGroup(found.likilibaId, trx)
      LikilibaService.assertOrganiser(likiliba, organiser.id)
      const invitation = await LikilibaInvitation.query({ client: trx })
        .where('id', found.id)
        .forUpdate()
        .firstOrFail()
      if (invitation.status !== 'pending' && invitation.status !== 'accepted') {
        throw new LikilibaException('This invitation is already closed', 'INVITATION_CLOSED', 409)
      }

      invitation.status = 'revoked'
      invitation.decidedAt = DateTime.now()
      await invitation.useTransaction(trx).save()

      await LikilibaJournal.record({
        likiliba,
        actor: { type: 'user', id: organiser.id },
        eventType: 'invitation_revoked',
        payload: { invitation_id: invitation.id, invitee_user_id: invitation.inviteeUserId },
        correlationId,
        trx,
      })
      if (invitation.inviteeUserId) {
        await LikilibaNotifier.notify(
          likiliba,
          {
            userIds: [invitation.inviteeUserId],
            type: 'invitation_revoked',
            title: 'Invitation retirée',
            message: `L'organisateur a retiré votre invitation à « ${likiliba.name} ».`,
            correlationId,
          },
          trx
        )
      }
      return invitation
    })
  }

  /** Invitations nobody answered in time. Called by the scheduler and before listing. */
  static async expireLapsed(now = DateTime.now()): Promise<number> {
    const lapsed = await LikilibaInvitation.query()
      .where('status', 'pending')
      .where('expiresAt', '<=', now.toJSDate())
      .limit(500)
    for (const invitation of lapsed) {
      await db.transaction(async (trx) => {
        const likiliba = await lockGroup(invitation.likilibaId, trx)
        const fresh = await LikilibaInvitation.query({ client: trx })
          .where('id', invitation.id)
          .forUpdate()
          .first()
        if (!fresh || fresh.status !== 'pending') return
        fresh.status = 'expired'
        await fresh.useTransaction(trx).save()
        await LikilibaJournal.record({
          likiliba,
          actor: { type: 'system', id: 0 },
          eventType: 'invitation_expired',
          payload: { invitation_id: fresh.id, invitee_user_id: fresh.inviteeUserId },
          correlationId: `likiliba-expiry-${fresh.id}`,
          trx,
        })
        await LikilibaNotifier.notify(
          likiliba,
          {
            userIds: [likiliba.creatorUserId],
            type: 'invitation_expired',
            title: 'Invitation expirée',
            message: `Une invitation à « ${likiliba.name} » a expiré sans réponse.`,
            data: { invitation_id: fresh.id },
            correlationId: `likiliba-expiry-${fresh.id}`,
          },
          trx
        )
      })
    }
    return lapsed.length
  }

  private static isAddressedTo(invitation: LikilibaInvitation, user: User): boolean {
    if (invitation.channel === 'link') {
      return invitation.inviteeUserId === null || invitation.inviteeUserId === user.id
    }
    if (invitation.inviteeUserId) return invitation.inviteeUserId === user.id
    const phone = normalisePhone(user.phone)
    return !!phone && phone === invitation.inviteePhone
  }
}

async function findUserByPhone(
  digits: string,
  trx: TransactionClientContract
): Promise<User | null> {
  return User.query({ client: trx })
    .whereRaw(`regexp_replace(phone, '[^0-9]', '', 'g') = ?`, [digits])
    .first()
}
