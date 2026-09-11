import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import Paper from '@mui/material/Paper'
import { Show, useRecordContext, TextField, DateField, Labeled } from 'react-admin'

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  return (
    <Box sx={{ flex: '1 1 300px', minWidth: 280 }}>
      <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>
        {label}
      </Typography>
      <Paper variant="outlined" sx={{ p: 1.5, bgcolor: 'action.hover', maxHeight: 400, overflow: 'auto' }}>
        <pre style={{ margin: 0, fontSize: 12, whiteSpace: 'pre-wrap' }}>
          {value ? JSON.stringify(value, null, 2) : '—'}
        </pre>
      </Paper>
    </Box>
  )
}

export function AuditLogShow() {
  return (
    <Show>
      <AuditLogShowContent />
    </Show>
  )
}

function AuditLogShowContent() {
  const record = useRecordContext()
  if (!record) return null
  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="h5" sx={{ fontWeight: 800, mb: 2 }}>
        {record.action}
      </Typography>
      <Card>
        <CardContent>
          <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 4, mb: 2 }}>
            <Labeled label="Actor">
              <Typography variant="body2">
                {record.actor_type} #{record.actor_id}
              </Typography>
            </Labeled>
            <Labeled label="Resource">
              <Typography variant="body2">
                {record.resource_type} #{record.resource_id}
              </Typography>
            </Labeled>
            <Labeled label="IP address">
              <TextField source="ip_address" emptyText="—" />
            </Labeled>
            <Labeled label="Device ID">
              <TextField source="device_id" emptyText="—" />
            </Labeled>
            <Labeled label="Correlation ID">
              <TextField source="correlation_id" />
            </Labeled>
            <Labeled label="When">
              <DateField source="created_at" showTime />
            </Labeled>
          </Stack>
          {record.user_agent && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
              {record.user_agent}
            </Typography>
          )}
          <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 2 }}>
            <JsonBlock label="Before" value={record.before} />
            <JsonBlock label="After" value={record.after} />
          </Stack>
        </CardContent>
      </Card>
    </Box>
  )
}
