import { useCallback, useEffect, useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Stack from '@mui/material/Stack'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'
import { Show, TopToolbar, useRecordContext } from 'react-admin'
import PauseIcon from '@mui/icons-material/PauseCircleOutlineOutlined'
import PlayIcon from '@mui/icons-material/PlayCircleOutlineOutlined'
import ClearIcon from '@mui/icons-material/RemoveCircleOutlineOutlined'
import HideIcon from '@mui/icons-material/VisibilityOffOutlined'
import { StatusChip } from '../../components/StatusChip'
import { ReasonActionButton } from '../../components/ActionButtons'
import {
  adminActions,
  type LikilibaEvent,
  type LikilibaMessageRow,
  type LikilibaPenaltyRow,
} from '../../providers/dataProvider'
import { formatAmount } from '../remittances/format'

/**
 * A likiliba in full: its signed rules, the pot, the rotation, every penalty and every action.
 *
 * Support can suspend a running group, resume a suspended one, and waive a penalty still owed.
 * There is deliberately no button that moves money: payouts, covers and refunds follow the rules
 * the members signed, and only the system executes them.
 */
function LikilibaActions() {
  const record = useRecordContext()
  if (!record) return null
  return (
    <TopToolbar sx={{ gap: 1 }}>
      {record.status === 'active' && (
        <ReasonActionButton
          label="Suspend"
          icon={PauseIcon}
          color="error"
          helperText="No payout happens while the group is suspended; members can still pay what they owe. Every member is notified with this reason."
          onConfirm={(reason) => adminActions.likilibaSuspend(record.id, reason)}
        />
      )}
      {record.status === 'suspended' && (
        <ReasonActionButton
          label="Resume"
          icon={PlayIcon}
          color="success"
          helperText="An escalated round goes back to waiting, with a fresh escalation delay, and is paid as soon as it is complete. This note is sent to every member."
          onConfirm={(note) => adminActions.likilibaResume(record.id, note)}
        />
      )}
    </TopToolbar>
  )
}

export function LikilibaShow() {
  return (
    <Show actions={<LikilibaActions />}>
      <LikilibaContent />
    </Show>
  )
}

const money = (amount: string | null | undefined, currency: string) =>
  amount === null || amount === undefined ? '—' : formatAmount(amount, currency)

const date = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '—'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card sx={{ mb: 2 }}>
      <CardContent>
        <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
          {title}
        </Typography>
        {children}
      </CardContent>
    </Card>
  )
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        {value}
      </Typography>
    </Box>
  )
}

function LikilibaContent() {
  const record = useRecordContext()
  const [penalties, setPenalties] = useState<LikilibaPenaltyRow[]>([])
  const [events, setEvents] = useState<LikilibaEvent[]>([])
  const [messages, setMessages] = useState<LikilibaMessageRow[]>([])
  const id = record?.id
  const status = record?.status

  const load = useCallback(async () => {
    if (!id) return
    // Side panels: an unreadable one must not stop support from reading the group itself.
    try {
      setPenalties(await adminActions.likilibaPenalties(id))
    } catch {
      setPenalties([])
    }
    try {
      setEvents(await adminActions.likilibaHistory(id))
    } catch {
      setEvents([])
    }
    try {
      setMessages(await adminActions.likilibaMessages(id))
    } catch {
      setMessages([])
    }
  }, [id])

  // Reloaded when the status changes, so a suspension or resumption shows in the history at once.
  useEffect(() => {
    void load()
  }, [load, status])

  if (!record) return null
  const cur: string = record.currency_code
  const memberName = new Map<number, string>(record.members.map((m: any) => [m.member_id, m.name]))
  const penaltyTotals = penalties.reduce(
    (acc, p) => {
      acc[p.status] += BigInt(p.amount)
      return acc
    },
    { paid: 0n, in_debt: 0n, waived: 0n } as Record<LikilibaPenaltyRow['status'], bigint>
  )

  return (
    <Box sx={{ p: 2 }}>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center', mb: 2 }}>
        <Typography variant="h5" sx={{ fontWeight: 800 }}>
          {record.name}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {record.code} · {cur}
        </Typography>
        <StatusChip status={record.status} />
      </Stack>

      {record.status === 'suspended' && (
        <Alert severity="error" sx={{ mb: 2 }}>
          Suspended {date(record.suspended_at)} — {record.suspension_reason ?? 'no reason recorded'}
        </Alert>
      )}
      {record.status === 'cancelled' && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Cancelled by the organiser before the start — {record.cancel_reason}
        </Alert>
      )}
      {record.description && (
        <Typography variant="body2" sx={{ mb: 2 }}>
          {record.description}
        </Typography>
      )}

      <Section title="Terms (as signed)">
        <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 4 }}>
          <Fact label="Contribution" value={`${money(record.contribution_amount, cur)} · ${record.frequency}`} />
          <Fact label="Members" value={record.size} />
          <Fact label="Round gross" value={money(record.round_gross_amount, cur)} />
          <Fact
            label={`Commission (${(record.commission_bps / 100).toFixed(2)} %)`}
            value={money(record.round_commission_amount, cur)}
          />
          <Fact label="Round net" value={money(record.round_net_amount, cur)} />
          <Fact
            label="Caution"
            value={
              record.caution.required
                ? `${money(record.caution.amount, cur)} (${record.caution.multiplier}× contribution)`
                : 'None'
            }
          />
          <Fact label="Grace" value={`${record.grace_hours} h`} />
          <Fact label="Escalation" value={`${record.escalation_days} days waiting`} />
          <Fact
            label="Penalty"
            value={
              record.penalty.mode === 'none'
                ? 'None'
                : `${money(record.penalty.daily_amount, cur)} / day, cap ${money(record.penalty.cap_amount, cur)}`
            }
          />
          <Fact label="First round" value={date(record.starts_at)} />
          <Fact label="Started" value={date(record.started_at)} />
          <Fact label="Completed" value={date(record.completed_at)} />
        </Stack>
        <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 4, mt: 2 }}>
          <Fact label="Ordering" value={record.ordering.mode === 'draw' ? 'Verifiable draw' : 'Manual, signed by all'} />
          {record.ordering.draw_seed_hash && (
            <Fact label="Draw commitment (SHA-256)" value={<code>{record.ordering.draw_seed_hash}</code>} />
          )}
          {record.ordering.draw_seed && <Fact label="Revealed seed" value={<code>{record.ordering.draw_seed}</code>} />}
        </Stack>
      </Section>

      <Section title="Pot">
        <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 4 }}>
          <Fact label="Ledger balance" value={money(record.pot.balance, cur)} />
          <Fact label="Collected this round" value={money(record.pot.collected, cur)} />
          <Fact label="Round amount" value={money(record.pot.expected, cur)} />
          <Fact
            label="Shares"
            value={`${record.pot.confirmed_count} paid · ${record.pot.covered_count} covered · ${record.pot.missing_count} missing`}
          />
          <Fact label="Commissions taken" value={money(record.commissions_total, cur)} />
        </Stack>
        {record.pot.balance !== record.pot.collected && record.status !== 'completed' && (
          <Alert severity="error" sx={{ mt: 2 }}>
            The pot balance differs from the contributions recorded for the open round. Run{' '}
            <code>node ace ledger:reconcile</code> and investigate before resuming anything.
          </Alert>
        )}
      </Section>

      <Section title="Members">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Turn</TableCell>
              <TableCell>Name</TableCell>
              <TableCell>Code</TableCell>
              <TableCell>Role</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Signed</TableCell>
              <TableCell>Received</TableCell>
              <TableCell>Current round</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {record.members.map((m: any) => (
              <TableRow key={m.member_id}>
                <TableCell>{m.position ?? '—'}</TableCell>
                <TableCell>{m.name}</TableCell>
                <TableCell>{m.code ?? '—'}</TableCell>
                <TableCell>{m.role}</TableCell>
                <TableCell>
                  <StatusChip status={m.status} />
                </TableCell>
                <TableCell>{m.signed ? 'Yes' : 'No'}</TableCell>
                <TableCell>{m.has_received ? 'Yes' : 'No'}</TableCell>
                <TableCell>{m.current_contribution_status ? <StatusChip status={m.current_contribution_status} /> : '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>

      <Section title="Rounds">
        {record.rounds.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            The calendar is fixed when the cycle starts.
          </Typography>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>#</TableCell>
                <TableCell>Beneficiary</TableCell>
                <TableCell>Due</TableCell>
                <TableCell>Grace ends</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Gross</TableCell>
                <TableCell align="right">Commission</TableCell>
                <TableCell align="right">Withheld (debts)</TableCell>
                <TableCell align="right">Net</TableCell>
                <TableCell>Paid</TableCell>
                <TableCell>Transaction</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {record.rounds.map((r: any) => (
                <TableRow key={r.number} selected={r.number === record.current_round}>
                  <TableCell>{r.number}</TableCell>
                  <TableCell>{r.beneficiary.name}</TableCell>
                  <TableCell>{date(r.due_at)}</TableCell>
                  <TableCell>{date(r.grace_ends_at)}</TableCell>
                  <TableCell>
                    <StatusChip status={r.status} />
                  </TableCell>
                  <TableCell align="right">{money(r.gross_amount, cur)}</TableCell>
                  <TableCell align="right">{money(r.commission_amount, cur)}</TableCell>
                  <TableCell align="right">{money(r.withheld_amount, cur)}</TableCell>
                  <TableCell align="right">{money(r.net_amount, cur)}</TableCell>
                  <TableCell>{date(r.paid_out_at)}</TableCell>
                  <TableCell>{r.payout_transaction_id ?? '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Section>

      <Section title={`Penalties (${penalties.length})`}>
        <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 4, mb: 2 }}>
          <Fact label="Paid to beneficiaries" value={money(penaltyTotals.paid.toString(), cur)} />
          <Fact label="Still owed" value={money(penaltyTotals.in_debt.toString(), cur)} />
          <Fact label="Waived" value={money(penaltyTotals.waived.toString(), cur)} />
        </Stack>
        {penalties.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No penalty charged.
          </Typography>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Reference</TableCell>
                <TableCell>Late member</TableCell>
                <TableCell>Round</TableCell>
                <TableCell>Contribution</TableCell>
                <TableCell>Day</TableCell>
                <TableCell align="right">Amount</TableCell>
                <TableCell align="right">Cumulative / cap</TableCell>
                <TableCell>Reason</TableCell>
                <TableCell>Paid to</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Charged</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {penalties.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>{p.reference}</TableCell>
                  <TableCell>{p.member.name}</TableCell>
                  <TableCell>{p.round}</TableCell>
                  <TableCell>{p.contribution_reference}</TableCell>
                  <TableCell>{p.day_number}</TableCell>
                  <TableCell align="right">{money(p.amount, cur)}</TableCell>
                  <TableCell align="right">
                    {money(p.cumulative_on_contribution, cur)} / {money(p.cap_on_contribution, cur)}
                  </TableCell>
                  <TableCell>{p.waive_reason ? `${p.reason} — waived: ${p.waive_reason}` : p.reason}</TableCell>
                  <TableCell>{p.beneficiary.name}</TableCell>
                  <TableCell>
                    <StatusChip status={p.status} />
                  </TableCell>
                  <TableCell>{date(p.assessed_at)}</TableCell>
                  <TableCell>
                    {p.status === 'in_debt' && (
                      <ReasonActionButton
                        label="Waive"
                        icon={ClearIcon}
                        color="warning"
                        helperText={`Cancels ${p.reference} (${money(p.amount, cur)}) and the debt it created. A paid penalty cannot be waived: that money belongs to the beneficiary. Both members are notified with this reason.`}
                        onConfirm={async (reason) => {
                          await adminActions.likilibaWaivePenalty(p.id, reason)
                          await load()
                        }}
                      />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Section>

      {record.invitations && (
        <Section title="Invitations">
          {record.invitations.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No invitation sent.
            </Typography>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Channel</TableCell>
                  <TableCell>Invitee</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Sent</TableCell>
                  <TableCell>Answered</TableCell>
                  <TableCell>Decided</TableCell>
                  <TableCell>Expires</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {record.invitations.map((i: any) => (
                  <TableRow key={i.id}>
                    <TableCell>{i.channel}</TableCell>
                    <TableCell>{i.invitee ? `${i.invitee.name} (${i.invitee.code ?? '—'})` : (i.invitee_phone ?? 'Link')}</TableCell>
                    <TableCell>
                      <StatusChip status={i.status} />
                    </TableCell>
                    <TableCell>{date(i.created_at)}</TableCell>
                    <TableCell>{date(i.responded_at)}</TableCell>
                    <TableCell>{date(i.decided_at)}</TableCell>
                    <TableCell>{date(i.expires_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Section>
      )}

      {record.rules && (
        <Section title={`Rules — version ${record.rules.version}`}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
            Hash signed by members: <code>{record.rules.hash}</code>
          </Typography>
          <Box component="ol" sx={{ m: 0, pl: 3 }}>
            {record.rules.clauses.map((clause: string, index: number) => (
              <Typography component="li" variant="body2" key={index} sx={{ mb: 0.5 }}>
                {clause}
              </Typography>
            ))}
          </Box>
        </Section>
      )}

      <Section
        title={`Conversation (${messages.length} messages, ${messages.filter((m) => m.open_reports > 0).length} reported)`}
      >
        {messages.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No message written in this group.
          </Typography>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>When</TableCell>
                <TableCell>Author</TableCell>
                <TableCell>Message</TableCell>
                <TableCell>State</TableCell>
                <TableCell>Reports</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {messages.map((m) => (
                <TableRow key={m.id} selected={m.open_reports > 0}>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{date(m.created_at)}</TableCell>
                  <TableCell>{m.author.name}</TableCell>
                  <TableCell sx={{ maxWidth: 420, whiteSpace: 'pre-wrap' }}>{m.body}</TableCell>
                  <TableCell>
                    {m.hidden_at
                      ? `Hidden — ${m.hide_reason ?? ''}`
                      : m.deleted_at
                        ? 'Deleted by author'
                        : 'Visible'}
                  </TableCell>
                  <TableCell>
                    {m.reports.length === 0
                      ? '—'
                      : m.reports.map((r) => `${r.reason}${r.resolved_at ? ' (resolved)' : ''}`).join(' · ')}
                  </TableCell>
                  <TableCell>
                    {!m.hidden_at && (
                      <ReasonActionButton
                        label="Hide"
                        icon={HideIcon}
                        color="warning"
                        helperText="The message disappears for every member, replaced by “Message hidden by support”. Its text stays on record here and in the audit log, and its reports are resolved."
                        onConfirm={async (reason) => {
                          await adminActions.likilibaHideMessage(m.id, reason)
                          await load()
                        }}
                      />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Section>

      <Section title="History">
        {events.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            Nothing recorded yet.
          </Typography>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>When</TableCell>
                <TableCell>Event</TableCell>
                <TableCell>By</TableCell>
                <TableCell>Member</TableCell>
                <TableCell>Details</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {events.map((e) => (
                <TableRow key={e.id}>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{date(e.created_at)}</TableCell>
                  <TableCell>{e.event_type.replace(/_/g, ' ')}</TableCell>
                  <TableCell>{e.actor_type === 'internal_user' ? 'Support' : e.actor_type}</TableCell>
                  <TableCell>{e.member_id ? (memberName.get(e.member_id) ?? `#${e.member_id}`) : '—'}</TableCell>
                  <TableCell>
                    <Box
                      component="pre"
                      sx={{ m: 0, fontSize: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxWidth: 520 }}
                    >
                      {e.payload ? JSON.stringify(e.payload, null, 1) : ''}
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Section>
    </Box>
  )
}
