import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import type Likiliba from '#models/likiliba'
import LikilibaEvent from '#models/likiliba_event'
import LikilibaMember from '#models/likiliba_member'
import LikilibaMessage from '#models/likiliba_message'
import { LikilibaRealtime } from '#services/likiliba/likiliba_realtime'
import LikilibaMessageReport from '#models/likiliba_message_report'
import LikilibaMessageReaction from '#models/likiliba_message_reaction'
import OutboxEvent from '#models/outbox_event'
import type User from '#models/user'
import { AuditLoggerService } from '#services/audit/audit_logger_service'
import { displayName } from '#services/likiliba/likiliba_service'
import { memberAvatarUrl } from '#services/likiliba/presenter'
import { LikilibaException } from '#services/likiliba/shared'

export const LIKILIBA_MESSAGE_EVENT = 'likiliba.message'

/**
 * Group events members see in their conversation. The rest stays in the full history: private
 * matters (a member's failed debit, their mandate, their repayment) and noise (each day of a
 * penalty — those have their own detailed list).
 */
const FEED_EVENTS = [
  'created',
  'rules_updated',
  'profile_updated',
  'photo_updated',
  'member_admitted',
  'member_left',
  'member_removed',
  'locked',
  'rules_signed',
  'started',
  'round_opened',
  'contribution_confirmed',
  'contribution_late',
  'contribution_covered',
  'round_waiting',
  'payout_completed',
  'escalated',
  'suspended_by_support',
  'resumed_by_support',
  'completed',
  'cancelled',
] as const

const PAGE_SIZE = 40

/** The reactions a member can leave on a message. */
export const REACTIONS = ['👍', '❤️', '😂', '🙏', '👏', '😮'] as const

export type FeedItem = {
  id: string
  kind: 'message' | 'event'
  created_at: string
  member_id: number | null
  author_name: string | null
  author_avatar_url: string | null
  mine: boolean
  /** Messages only; null once deleted or hidden. */
  body: string | null
  state: 'visible' | 'deleted' | 'hidden'
  event_type: string | null
  data: Record<string, string | number | boolean | null> | null
  /** Messages only: each emoji, how many chose it, and whether the viewer did. */
  reactions: { emoji: string; count: number; mine: boolean }[]
  /** The viewer's own messages: every other member has opened the conversation since. */
  read_by_all: boolean
}

/**
 * The group's conversation: what members write, interleaved with what happens to the group's
 * money. Written messages are the members' own; events come from likiliba_events, the same
 * journal support reads, so the conversation never tells a different story from the ledger.
 */
export class LikilibaChatService {
  /** Newest first, `PAGE_SIZE` at a time, before `before` when given. */
  static async feed(likiliba: Likiliba, viewer: LikilibaMember, before?: DateTime) {
    const names = await this.namesOf(likiliba)
    const take = PAGE_SIZE + 1

    const messagesQuery = LikilibaMessage.query()
      .where('likilibaId', likiliba.id)
      .orderBy('createdAt', 'desc')
      .orderBy('id', 'desc')
      .limit(take)
    const eventsQuery = LikilibaEvent.query()
      .where('likilibaId', likiliba.id)
      .whereIn('eventType', [...FEED_EVENTS])
      .orderBy('createdAt', 'desc')
      .orderBy('id', 'desc')
      .limit(take)
    if (before) {
      messagesQuery.where('createdAt', '<', before.toJSDate())
      eventsQuery.where('createdAt', '<', before.toJSDate())
    }
    const [messages, events] = await Promise.all([messagesQuery, eventsQuery])

    const items = [
      ...messages.map((m) => this.messageItem(m, viewer, names)),
      ...events.map((e) => this.eventItem(e, viewer, names)),
    ].sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0))

    // Everything one transaction wrote shares its timestamp: a page never ends halfway through
    // such a burst, or the next page (strictly older) would skip the rest of it.
    let page = items.slice(0, PAGE_SIZE)
    const last = page.at(-1)
    if (last && items.length > PAGE_SIZE) {
      page = items.filter((item, index) => index < PAGE_SIZE || item.created_at === last.created_at)
    }
    const hasMore = messages.length === take || events.length === take || items.length > page.length

    await this.decorate(likiliba, viewer, page)
    return { data: page, meta: { has_more: hasMore, before: page.at(-1)?.created_at ?? null } }
  }

  static async send(
    user: User,
    likiliba: Likiliba,
    member: LikilibaMember,
    text: string,
    correlationId: string
  ) {
    const body = text.trim()
    if (body.length === 0 || body.length > 1000) {
      throw new LikilibaException('A message is 1 to 1000 characters long', 'INVALID_MESSAGE')
    }
    if (likiliba.status === 'cancelled') {
      throw new LikilibaException('This likiliba was cancelled', 'GROUP_CLOSED', 409)
    }

    return db.transaction(async (trx) => {
      const message = new LikilibaMessage()
      message.likilibaId = likiliba.id
      message.memberId = member.id
      message.body = body
      await message.useTransaction(trx).save()

      member.lastReadAt = DateTime.now()
      await member.useTransaction(trx).save()

      await AuditLoggerService.record({
        actorType: 'user',
        actorId: user.id,
        action: 'likiliba.message.sent',
        resourceType: 'likiliba_message',
        resourceId: message.id,
        after: { likiliba_id: likiliba.id, member_id: member.id, length: body.length },
        correlationId,
        trx,
      })

      const recipients = await LikilibaMember.query({ client: trx })
        .where('likilibaId', likiliba.id)
        .whereNotIn('status', ['left', 'removed'])
        .whereNot('id', member.id)
        .select('userId')

      const event = new OutboxEvent()
      event.aggregateType = 'likiliba'
      event.aggregateId = likiliba.code
      event.eventType = LIKILIBA_MESSAGE_EVENT
      event.payload = {
        user_ids: recipients.map((r) => r.userId),
        title: likiliba.name,
        body: `${displayName(user)} : ${body.length > 140 ? `${body.slice(0, 139)}…` : body}`,
        data: { likiliba_id: likiliba.id, type: LIKILIBA_MESSAGE_EVENT },
        correlation_id: correlationId,
      }
      event.status = 'pending'
      await event.useTransaction(trx).save()

      // The push above reaches phones in the background; the open chats update live.
      await LikilibaRealtime.changed(likiliba.id, trx)

      const names = new Map([
        [
          member.id,
          {
            name: displayName(user),
            avatar: memberAvatarUrl(likiliba.id, member.id, user.avatarRef),
          },
        ],
      ])
      return this.messageItem(message, member, names)
    })
  }

  /**
   * Sets the member's reaction: a new emoji replaces theirs, the same one again removes it.
   * Returns the message's reactions afterwards.
   */
  static async react(member: LikilibaMember, messageId: number, emoji: string) {
    if (!(REACTIONS as readonly string[]).includes(emoji)) {
      throw new LikilibaException('This reaction is not available', 'INVALID_REACTION')
    }
    const message = await this.messageOf(member, messageId)
    if (!message.isVisible) {
      throw new LikilibaException('This message is no longer shown', 'MESSAGE_REMOVED', 409)
    }

    const existing = await LikilibaMessageReaction.query()
      .where('messageId', message.id)
      .where('memberId', member.id)
      .first()
    if (existing && existing.emoji === emoji) {
      await existing.delete()
    } else if (existing) {
      existing.emoji = emoji
      await existing.save()
    } else {
      await LikilibaMessageReaction.create({ messageId: message.id, memberId: member.id, emoji })
    }
    await LikilibaRealtime.changed(message.likilibaId)
    const reactions = await this.reactionsFor([message.id], member)
    return reactions.get(message.id) ?? []
  }

  /** The author takes their message back. The text stays on record for support. */
  static async remove(
    user: User,
    member: LikilibaMember,
    messageId: number,
    correlationId: string
  ) {
    const message = await this.messageOf(member, messageId)
    if (message.memberId !== member.id) {
      throw new LikilibaException('You can only delete your own messages', 'NOT_AUTHOR', 403)
    }
    if (message.deletedAt) return message

    message.deletedAt = DateTime.now()
    await message.save()
    await LikilibaRealtime.changed(message.likilibaId)
    await AuditLoggerService.record({
      actorType: 'user',
      actorId: user.id,
      action: 'likiliba.message.deleted',
      resourceType: 'likiliba_message',
      resourceId: message.id,
      after: { likiliba_id: message.likilibaId },
      correlationId,
    })
    return message
  }

  static async report(
    user: User,
    member: LikilibaMember,
    messageId: number,
    reason: string,
    correlationId: string
  ) {
    const message = await this.messageOf(member, messageId)
    if (message.memberId === member.id) {
      throw new LikilibaException('You cannot report your own message', 'OWN_MESSAGE', 409)
    }
    const existing = await LikilibaMessageReport.query()
      .where('messageId', message.id)
      .where('reporterMemberId', member.id)
      .first()
    if (existing) return existing

    const report = await LikilibaMessageReport.create({
      messageId: message.id,
      reporterMemberId: member.id,
      reason: reason.trim(),
    })
    await AuditLoggerService.record({
      actorType: 'user',
      actorId: user.id,
      action: 'likiliba.message.reported',
      resourceType: 'likiliba_message',
      resourceId: message.id,
      after: { likiliba_id: message.likilibaId, report_id: report.id, reason: report.reason },
      correlationId,
    })
    return report
  }

  /** Support hides a reported message from every member. */
  static async hide(
    internalUserId: number,
    messageId: number,
    reason: string,
    correlationId: string
  ) {
    const message = await LikilibaMessage.find(messageId)
    if (!message) throw new LikilibaException('This message does not exist', 'NOT_FOUND', 404)
    if (!message.hiddenAt) {
      message.hiddenAt = DateTime.now()
      message.hiddenByInternalUserId = internalUserId
      message.hideReason = reason
      await message.save()
      await LikilibaRealtime.changed(message.likilibaId)
    }
    await LikilibaMessageReport.query()
      .where('messageId', message.id)
      .whereNull('resolvedAt')
      .update({ resolved_at: new Date() })
    await AuditLoggerService.record({
      actorType: 'internal_user',
      actorId: internalUserId,
      action: 'likiliba.message.hidden',
      resourceType: 'likiliba_message',
      resourceId: message.id,
      after: { likiliba_id: message.likilibaId, reason },
      correlationId,
    })
    return message
  }

  /**
   * Deliberately silent in realtime: the app marks the feed read on every refresh, so telling
   * the others would make each member refresh, mark read, and tell the others again — forever.
   */
  static async markRead(member: LikilibaMember) {
    member.lastReadAt = DateTime.now()
    await member.save()
  }

  /** Messages and conversation events by others since the member last read. */
  static async unreadCount(member: LikilibaMember): Promise<number> {
    const since = member.lastReadAt?.toJSDate() ?? new Date(0)
    const [messages, events] = await Promise.all([
      db
        .from('likiliba_messages')
        .where('likiliba_id', member.likilibaId)
        .whereNot('member_id', member.id)
        .whereNull('deleted_at')
        .whereNull('hidden_at')
        .where('created_at', '>', since)
        .count('* as total')
        .first(),
      db
        .from('likiliba_events')
        .where('likiliba_id', member.likilibaId)
        .whereIn('event_type', [...FEED_EVENTS])
        .where((q) => q.whereNull('member_id').orWhereNot('member_id', member.id))
        .where('created_at', '>', since)
        .count('* as total')
        .first(),
    ])
    return Number(messages?.total ?? 0) + Number(events?.total ?? 0)
  }

  /** The newest conversation item, for the group list. */
  static async lastActivity(likiliba: Likiliba, viewer: LikilibaMember): Promise<FeedItem | null> {
    const names = await this.namesOf(likiliba)
    const [message, event] = await Promise.all([
      LikilibaMessage.query()
        .where('likilibaId', likiliba.id)
        .orderBy('createdAt', 'desc')
        .orderBy('id', 'desc')
        .first(),
      LikilibaEvent.query()
        .where('likilibaId', likiliba.id)
        .whereIn('eventType', [...FEED_EVENTS])
        .orderBy('createdAt', 'desc')
        .orderBy('id', 'desc')
        .first(),
    ])
    const items = [
      message ? this.messageItem(message, viewer, names) : null,
      event ? this.eventItem(event, viewer, names) : null,
    ].filter((item): item is FeedItem => !!item)
    items.sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    return items[0] ?? null
  }

  /* -------------------------------- Helpers ------------------------------- */

  /** Adds reactions to every message, and read receipts to the viewer's own. */
  private static async decorate(likiliba: Likiliba, viewer: LikilibaMember, items: FeedItem[]) {
    const ids = items.filter((i) => i.kind === 'message').map((i) => Number(i.id.slice(2)))
    if (ids.length === 0) return
    const reactions = await this.reactionsFor(ids, viewer)

    const others = await LikilibaMember.query()
      .where('likilibaId', likiliba.id)
      .whereNotIn('status', ['left', 'removed'])
      .whereNot('id', viewer.id)
      .select('lastReadAt')
    const reads = others.map((m) => m.lastReadAt?.toUTC().toISO() ?? '')
    const everyoneReadUpTo = reads.length > 0 ? reads.reduce((a, b) => (a < b ? a : b)) : ''

    for (const item of items) {
      if (item.kind !== 'message') continue
      item.reactions =
        item.state === 'visible' ? (reactions.get(Number(item.id.slice(2))) ?? []) : []
      item.read_by_all = item.mine && everyoneReadUpTo !== '' && everyoneReadUpTo >= item.created_at
    }
  }

  private static async reactionsFor(messageIds: number[], viewer: LikilibaMember) {
    const rows = await LikilibaMessageReaction.query().whereIn('messageId', messageIds)
    const result = new Map<number, { emoji: string; count: number; mine: boolean }[]>()
    for (const row of rows) {
      const list = result.get(row.messageId) ?? []
      const entry = list.find((r) => r.emoji === row.emoji)
      if (entry) {
        entry.count += 1
        entry.mine ||= row.memberId === viewer.id
      } else {
        list.push({ emoji: row.emoji, count: 1, mine: row.memberId === viewer.id })
      }
      result.set(row.messageId, list)
    }
    for (const list of result.values()) list.sort((a, b) => b.count - a.count)
    return result
  }

  private static async messageOf(member: LikilibaMember, messageId: number) {
    const message = await LikilibaMessage.query()
      .where('id', messageId)
      .where('likilibaId', member.likilibaId)
      .first()
    if (!message) throw new LikilibaException('This message does not exist', 'NOT_FOUND', 404)
    return message
  }

  /** Every member who ever joined, so a departed member's messages keep a name. */
  private static async namesOf(likiliba: Likiliba) {
    const members = await LikilibaMember.query().where('likilibaId', likiliba.id).preload('user')
    return new Map(
      members.map((m) => [
        m.id,
        { name: displayName(m.user), avatar: memberAvatarUrl(likiliba.id, m.id, m.user.avatarRef) },
      ])
    )
  }

  private static messageItem(
    m: LikilibaMessage,
    viewer: LikilibaMember,
    names: Map<number, { name: string; avatar: string | null }>
  ): FeedItem {
    const state = m.hiddenAt ? 'hidden' : m.deletedAt ? 'deleted' : 'visible'
    return {
      id: `m:${m.id}`,
      kind: 'message',
      created_at: m.createdAt.toUTC().toISO()!,
      member_id: m.memberId,
      author_name: names.get(m.memberId)?.name ?? null,
      author_avatar_url: names.get(m.memberId)?.avatar ?? null,
      mine: m.memberId === viewer.id,
      body: state === 'visible' ? m.body : null,
      state,
      event_type: null,
      data: null,
      reactions: [],
      read_by_all: false,
    }
  }

  private static eventItem(
    e: LikilibaEvent,
    viewer: LikilibaMember,
    names: Map<number, { name: string; avatar: string | null }>
  ): FeedItem {
    const p = (e.payload ?? {}) as Record<string, unknown>
    const pick = (key: string) => {
      const value = p[key]
      return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
        ? value
        : null
    }
    const beneficiary =
      typeof p.beneficiary_member_id === 'number' ? names.get(p.beneficiary_member_id)?.name : null
    return {
      id: `e:${e.id}`,
      kind: 'event',
      created_at: e.createdAt.toUTC().toISO()!,
      member_id: e.memberId,
      author_name: e.memberId ? (names.get(e.memberId)?.name ?? null) : null,
      author_avatar_url: e.memberId ? (names.get(e.memberId)?.avatar ?? null) : null,
      mine: !!e.memberId && e.memberId === viewer.id,
      body: null,
      state: 'visible',
      event_type: e.eventType,
      data: {
        round: pick('round'),
        amount: pick('amount'),
        gross: pick('gross'),
        net: pick('net'),
        late: pick('late'),
        reason: pick('reason') ?? pick('note'),
        rule_version: pick('rule_version'),
        name: pick('name'),
        previous_name: pick('previous_name'),
        renamed: pick('renamed'),
        removed: pick('removed'),
        beneficiary_name: beneficiary ?? null,
      },
      reactions: [],
      read_by_all: false,
    }
  }
}
