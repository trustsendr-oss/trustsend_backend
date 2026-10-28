import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import type Likiliba from '#models/likiliba'
import LikilibaEvent from '#models/likiliba_event'
import LikilibaMember from '#models/likiliba_member'
import LikilibaMessage, { type LikilibaMessageKind } from '#models/likiliba_message'
import LikilibaPollOption from '#models/likiliba_poll_option'
import LikilibaPollVote from '#models/likiliba_poll_vote'
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

export const POLL_MIN_OPTIONS = 2
export const POLL_MAX_OPTIONS = 10

/** The stored file of an image or file message, as LikilibaAttachmentStorageService saved it. */
export type StoredAttachment = {
  ref: string
  mimeType: string
  size: number
  name: string
  /** Voice messages only. */
  durationMs?: number | null
}

export type AttachmentKind = 'image' | 'file' | 'audio'

export type FeedAttachment = {
  kind: AttachmentKind
  /** Served to the group's members only, with the session token. */
  url: string
  name: string | null
  mime_type: string
  size: number
  /** Voice messages: their length. */
  duration_ms: number | null
}

export type FeedPoll = {
  options: { id: number; label: string; votes: number; mine: boolean }[]
  total_votes: number
  closed: boolean
}

/**
 * The message a reply answers, as shown above it. Its text is cut short, and gone once the
 * quoted message was deleted or hidden — a reply never keeps alive what was taken back.
 */
export type FeedQuote = {
  id: string
  member_id: number
  author_name: string | null
  message_kind: LikilibaMessageKind
  body: string | null
  attachment_name: string | null
  state: 'visible' | 'deleted' | 'hidden'
}

/** What a member posts: text, a photo or file with an optional caption, or a poll. */
type Content = (
  | { kind: 'text'; body: string }
  | { kind: AttachmentKind; body: string; attachment: StoredAttachment }
  | { kind: 'poll'; body: string; options: string[] }
) & { replyToId?: number | null }

const QUOTE_LENGTH = 200

export type FeedItem = {
  id: string
  kind: 'message' | 'event'
  created_at: string
  member_id: number | null
  author_name: string | null
  author_avatar_url: string | null
  mine: boolean
  /** Messages only; null once deleted or hidden. The caption of a photo, the question of a poll. */
  body: string | null
  /** Messages only: what the member posted. Null for events. */
  message_kind: LikilibaMessageKind | null
  /** Photo and file messages, while shown. */
  attachment: FeedAttachment | null
  /** Poll messages, while shown. */
  poll: FeedPoll | null
  /** Messages answering another one: that message, quoted. */
  reply_to: FeedQuote | null
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
    await this.quote(page, names)
    return { data: page, meta: { has_more: hasMore, before: page.at(-1)?.created_at ?? null } }
  }

  static async send(
    user: User,
    likiliba: Likiliba,
    member: LikilibaMember,
    text: string,
    correlationId: string,
    replyToId?: number | null
  ) {
    const body = text.trim()
    if (body.length === 0 || body.length > 1000) {
      throw new LikilibaException('A message is 1 to 1000 characters long', 'INVALID_MESSAGE')
    }
    return this.post(user, likiliba, member, { kind: 'text', body, replyToId }, correlationId)
  }

  /** A photo or a file, already stored, with an optional caption. */
  static async sendAttachment(
    user: User,
    likiliba: Likiliba,
    member: LikilibaMember,
    kind: AttachmentKind,
    attachment: StoredAttachment,
    caption: string | null | undefined,
    correlationId: string,
    replyToId?: number | null
  ) {
    const body = (caption ?? '').trim()
    if (body.length > 1000) {
      throw new LikilibaException('A caption is at most 1000 characters long', 'INVALID_MESSAGE')
    }
    return this.post(user, likiliba, member, { kind, body, attachment, replyToId }, correlationId)
  }

  /** A question and its 2 to 10 distinct choices; each member then votes for one. */
  static async createPoll(
    user: User,
    likiliba: Likiliba,
    member: LikilibaMember,
    question: string,
    choices: string[],
    correlationId: string
  ) {
    const body = question.trim()
    const options = choices.map((c) => c.trim()).filter((c) => c.length > 0)
    if (body.length === 0 || body.length > 300) {
      throw new LikilibaException('A poll question is 1 to 300 characters long', 'INVALID_POLL')
    }
    if (options.length < POLL_MIN_OPTIONS || options.length > POLL_MAX_OPTIONS) {
      throw new LikilibaException('A poll has 2 to 10 choices', 'INVALID_POLL')
    }
    if (new Set(options.map((o) => o.toLocaleLowerCase())).size !== options.length) {
      throw new LikilibaException('Two choices of a poll are the same', 'INVALID_POLL')
    }
    if (options.some((o) => o.length > 100)) {
      throw new LikilibaException('A poll choice is at most 100 characters long', 'INVALID_POLL')
    }
    return this.post(user, likiliba, member, { kind: 'poll', body, options }, correlationId)
  }

  /**
   * Sets the member's vote: another choice replaces theirs, the same one again withdraws it.
   * Returns the poll afterwards.
   */
  static async vote(member: LikilibaMember, messageId: number, optionId: number) {
    const message = await this.pollOf(member, messageId)
    if (message.pollClosedAt) {
      throw new LikilibaException('This poll is closed', 'POLL_CLOSED', 409)
    }
    const option = await LikilibaPollOption.query()
      .where('id', optionId)
      .where('messageId', message.id)
      .first()
    if (!option) throw new LikilibaException('This choice does not exist', 'INVALID_CHOICE')

    const existing = await LikilibaPollVote.query()
      .where('messageId', message.id)
      .where('memberId', member.id)
      .first()
    if (existing && existing.optionId === option.id) {
      await existing.delete()
    } else if (existing) {
      existing.optionId = option.id
      await existing.save()
    } else {
      await LikilibaPollVote.create({
        messageId: message.id,
        optionId: option.id,
        memberId: member.id,
      })
    }
    await LikilibaRealtime.changed(message.likilibaId)
    const polls = await this.pollsFor([message.id], member)
    return polls.get(message.id)!
  }

  /** The author ends the vote; the results stay shown. */
  static async closePoll(member: LikilibaMember, messageId: number) {
    const message = await this.pollOf(member, messageId)
    if (message.memberId !== member.id) {
      throw new LikilibaException('Only its author can close a poll', 'NOT_AUTHOR', 403)
    }
    if (!message.pollClosedAt) {
      message.pollClosedAt = DateTime.now()
      await message.save()
      await LikilibaRealtime.changed(message.likilibaId)
    }
    const polls = await this.pollsFor([message.id], member)
    return polls.get(message.id)!
  }

  /** The photo or file of a message, for a member of its group, while the message is shown. */
  static async attachmentOf(member: LikilibaMember, messageId: number) {
    const message = await this.messageOf(member, messageId)
    if (!message.attachmentRef || !message.isVisible) {
      throw new LikilibaException('This message has no file', 'NOT_FOUND', 404)
    }
    return message
  }

  private static async post(
    user: User,
    likiliba: Likiliba,
    member: LikilibaMember,
    content: Content,
    correlationId: string
  ) {
    if (likiliba.status === 'cancelled') {
      throw new LikilibaException('This likiliba was cancelled', 'GROUP_CLOSED', 409)
    }
    if (content.replyToId) {
      const quoted = await this.messageOf(member, content.replyToId)
      if (!quoted.isVisible) {
        throw new LikilibaException('This message is no longer shown', 'MESSAGE_REMOVED', 409)
      }
    }

    const posted = await db.transaction(async (trx) => {
      const message = new LikilibaMessage()
      message.likilibaId = likiliba.id
      message.memberId = member.id
      message.kind = content.kind
      message.body = content.body
      message.replyToId = content.replyToId ?? null
      if (content.kind === 'image' || content.kind === 'file' || content.kind === 'audio') {
        message.attachmentRef = content.attachment.ref
        message.attachmentMimeType = content.attachment.mimeType
        message.attachmentName = content.attachment.name.slice(0, 255)
        message.attachmentSize = content.attachment.size
        message.attachmentDurationMs = content.attachment.durationMs ?? null
      }
      await message.useTransaction(trx).save()
      if (content.kind === 'poll') {
        await LikilibaPollOption.createMany(
          content.options.map((label, position) => ({ messageId: message.id, label, position })),
          { client: trx }
        )
      }

      member.lastReadAt = DateTime.now()
      await member.useTransaction(trx).save()

      await AuditLoggerService.record({
        actorType: 'user',
        actorId: user.id,
        action: 'likiliba.message.sent',
        resourceType: 'likiliba_message',
        resourceId: message.id,
        after: {
          likiliba_id: likiliba.id,
          member_id: member.id,
          kind: content.kind,
          length: content.body.length,
        },
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
        body: `${displayName(user)} : ${pushText(content)}`,
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
      const item = this.messageItem(message, member, names)
      if (content.kind === 'poll') {
        const options = await LikilibaPollOption.query({ client: trx })
          .where('messageId', message.id)
          .orderBy('position')
        item.poll = {
          options: options.map((o) => ({ id: o.id, label: o.label, votes: 0, mine: false })),
          total_votes: 0,
          closed: false,
        }
      }
      return item
    })
    if (posted.reply_to) await this.quote([posted], await this.namesOf(likiliba))
    return posted
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
    const pollIds = items
      .filter((i) => i.message_kind === 'poll' && i.state === 'visible')
      .map((i) => Number(i.id.slice(2)))
    const polls = await this.pollsFor(pollIds, viewer)

    const others = await LikilibaMember.query()
      .where('likilibaId', likiliba.id)
      .whereNotIn('status', ['left', 'removed'])
      .whereNot('id', viewer.id)
      .select('lastReadAt')
    const reads = others.map((m) => m.lastReadAt?.toUTC().toISO() ?? '')
    const everyoneReadUpTo = reads.length > 0 ? reads.reduce((a, b) => (a < b ? a : b)) : ''

    for (const item of items) {
      if (item.kind !== 'message') continue
      const messageId = Number(item.id.slice(2))
      item.reactions = item.state === 'visible' ? (reactions.get(messageId) ?? []) : []
      item.poll = polls.get(messageId) ?? null
      item.read_by_all = item.mine && everyoneReadUpTo !== '' && everyoneReadUpTo >= item.created_at
    }
  }

  /** Fills the quote of every reply, from the quoted messages as they are now. */
  private static async quote(
    items: FeedItem[],
    names: Map<number, { name: string; avatar: string | null }>
  ) {
    const ids = items.filter((i) => i.reply_to).map((i) => Number(i.reply_to!.id.slice(2)))
    if (ids.length === 0) return
    const rows = await LikilibaMessage.query().whereIn('id', ids)
    const quoted = new Map(rows.map((m) => [m.id, m]))
    for (const item of items) {
      if (!item.reply_to) continue
      const m = quoted.get(Number(item.reply_to.id.slice(2)))
      if (!m) {
        item.reply_to = null
        continue
      }
      const state = m.hiddenAt ? 'hidden' : m.deletedAt ? 'deleted' : 'visible'
      const visible = state === 'visible'
      item.reply_to = {
        id: `m:${m.id}`,
        member_id: m.memberId,
        author_name: names.get(m.memberId)?.name ?? null,
        message_kind: m.kind,
        body: visible
          ? m.body.length > QUOTE_LENGTH
            ? `${m.body.slice(0, QUOTE_LENGTH - 1)}…`
            : m.body
          : null,
        attachment_name: visible ? m.attachmentName : null,
        state,
      }
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

  /** Each poll's choices in order, their votes, and the viewer's own. */
  private static async pollsFor(messageIds: number[], viewer: LikilibaMember) {
    const result = new Map<number, FeedPoll>()
    if (messageIds.length === 0) return result
    const [messages, options, votes] = await Promise.all([
      LikilibaMessage.query().whereIn('id', messageIds).select('id', 'pollClosedAt'),
      LikilibaPollOption.query().whereIn('messageId', messageIds).orderBy('position'),
      LikilibaPollVote.query().whereIn('messageId', messageIds),
    ])
    for (const message of messages) {
      const mine = votes.find((v) => v.messageId === message.id && v.memberId === viewer.id)
      const own = votes.filter((v) => v.messageId === message.id)
      result.set(message.id, {
        options: options
          .filter((o) => o.messageId === message.id)
          .map((o) => ({
            id: o.id,
            label: o.label,
            votes: own.filter((v) => v.optionId === o.id).length,
            mine: mine?.optionId === o.id,
          })),
        total_votes: own.length,
        closed: !!message.pollClosedAt,
      })
    }
    return result
  }

  private static async pollOf(member: LikilibaMember, messageId: number) {
    const message = await this.messageOf(member, messageId)
    if (message.kind !== 'poll') {
      throw new LikilibaException('This message is not a poll', 'NOT_A_POLL', 409)
    }
    if (!message.isVisible) {
      throw new LikilibaException('This message is no longer shown', 'MESSAGE_REMOVED', 409)
    }
    return message
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
      message_kind: m.kind,
      attachment:
        state === 'visible' &&
        m.attachmentRef &&
        (m.kind === 'image' || m.kind === 'file' || m.kind === 'audio')
          ? {
              kind: m.kind,
              url: `/api/v1/likilibas/${m.likilibaId}/messages/${m.id}/attachment`,
              name: m.attachmentName,
              mime_type: m.attachmentMimeType ?? 'application/octet-stream',
              size: m.attachmentSize ?? 0,
              duration_ms: m.attachmentDurationMs,
            }
          : null,
      poll: null,
      // Only the link here; `quote` fills it from the quoted message.
      reply_to: m.replyToId
        ? {
            id: `m:${m.replyToId}`,
            member_id: 0,
            author_name: null,
            message_kind: 'text',
            body: null,
            attachment_name: null,
            state: 'visible',
          }
        : null,
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
      message_kind: null,
      attachment: null,
      poll: null,
      reply_to: null,
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

/** The line a push notification shows for a new message. */
function pushText(content: Content): string {
  const clip = (text: string, max = 140) =>
    text.length > max ? `${text.slice(0, max - 1)}…` : text
  switch (content.kind) {
    case 'image':
      return content.body ? `📷 ${clip(content.body, 120)}` : '📷 Photo'
    case 'file':
      return `📎 ${clip(content.attachment.name, 120)}`
    case 'audio':
      return '🎤 Message vocal'
    case 'poll':
      return `📊 ${clip(content.body, 120)}`
    default:
      return clip(content.body)
  }
}
