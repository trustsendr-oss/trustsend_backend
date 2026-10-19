import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Typography from '@mui/material/Typography'
import { Link, useCreatePath, useRecordContext } from 'react-admin'

const TYPE_LABEL: Record<string, string> = {
  user: 'Customer',
  agent: 'Agent',
  business: 'Business',
}

/** react-admin resource that holds each kind of KYC subject. */
const RESOURCE: Record<string, string> = {
  user: 'users',
  agent: 'agents',
  business: 'businesses',
}

/**
 * Who a KYC file is about: name, e-mail and code, with a link to their record. Falls back to
 * "user #id" only when the subject no longer resolves.
 */
export function KycSubjectField({ link = false }: { link?: boolean; label?: string }) {
  const record = useRecordContext()
  const createPath = useCreatePath()
  if (!record) return null

  const subject = record.subject ?? {}
  const type: string = record.subject_type
  const name: string = subject.name || `${TYPE_LABEL[type] ?? type} #${record.subject_id}`
  const meta = [subject.email, subject.code].filter(Boolean).join(' · ')

  const title = (
    <Typography variant="body2" sx={{ fontWeight: 600 }}>
      {name}
    </Typography>
  )

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
      <Chip label={TYPE_LABEL[type] ?? type} size="small" variant="outlined" />
      <Box sx={{ minWidth: 0 }}>
        {link && RESOURCE[type] ? (
          <Link
            to={createPath({ resource: RESOURCE[type], id: record.subject_id, type: 'show' })}
            onClick={(event) => event.stopPropagation()}
          >
            {title}
          </Link>
        ) : (
          title
        )}
        {meta ? (
          <Typography variant="caption" color="text.secondary" noWrap component="div">
            {meta}
          </Typography>
        ) : null}
      </Box>
    </Box>
  )
}
