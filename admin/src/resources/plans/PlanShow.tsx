import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { PlanFeaturesField } from './PlanFeaturesField'
import {
  Show,
  useRecordContext,
  TextField,
  Labeled,
  TopToolbar,
  EditButton,
} from 'react-admin'
import ArchiveOutlinedIcon from '@mui/icons-material/ArchiveOutlined'
import { StatusChip } from '../../components/StatusChip'
import { MoneyField } from '../../components/MoneyField'
import { ConfirmActionButton } from '../../components/ActionButtons'
import { adminActions } from '../../providers/dataProvider'

function PlanActions() {
  const record = useRecordContext()
  if (!record) return null
  return (
    <TopToolbar>
      <EditButton />
      {record.status === 'active' && (
        <ConfirmActionButton
          label="Archive"
          icon={ArchiveOutlinedIcon}
          color="error"
          confirmText={`Archive "${record.name}"? Businesses already on this plan keep it, but it can no longer be newly assigned.`}
          onConfirm={() => adminActions.planArchive(record.id)}
        />
      )}
    </TopToolbar>
  )
}

export function PlanShow() {
  return (
    <Show actions={<PlanActions />}>
      <PlanShowContent />
    </Show>
  )
}

function PlanShowContent() {
  const record = useRecordContext()
  if (!record) return null
  return (
    <Box sx={{ p: 2 }}>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center', mb: 2 }}>
        <Typography variant="h5" sx={{ fontWeight: 800 }}>
          {record.name}
        </Typography>
        <StatusChip status={record.status} />
      </Stack>
      <Card>
        <CardContent>
          <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 4, mb: 2 }}>
            <Labeled label="Code">
              <TextField source="code" />
            </Labeled>
            <Labeled label="Price">
              <MoneyField source="price" />
            </Labeled>
            <Labeled label="Maintenance price">
              <MoneyField source="maintenance_price" currencySource="currency_code" />
            </Labeled>
          </Stack>
          {record.description && (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {record.description}
            </Typography>
          )}
          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
            Features
          </Typography>
          <PlanFeaturesField />
        </CardContent>
      </Card>
    </Box>
  )
}
