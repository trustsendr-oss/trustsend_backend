import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { Show, useRecordContext, TextField, Labeled, TopToolbar, EditButton } from 'react-admin'
import ArchiveOutlinedIcon from '@mui/icons-material/ArchiveOutlined'
import HideImageOutlinedIcon from '@mui/icons-material/HideImageOutlined'
import { StatusChip } from '../../components/StatusChip'
import { MoneyField } from '../../components/MoneyField'
import { ConfirmActionButton } from '../../components/ActionButtons'
import { adminActions } from '../../providers/dataProvider'
import { API_URL } from '../../providers/httpClient'

function CardProductActions() {
  const record = useRecordContext()
  if (!record) return null
  return (
    <TopToolbar>
      <EditButton />
      {/* Proposé uniquement s'il y a un visuel à retirer : un bouton qui ne ferait rien
          apprend à se méfier de tous les autres. */}
      {record.image_url && (
        <ConfirmActionButton
          label="Remove image"
          icon={HideImageOutlinedIcon}
          confirmText={`Remove the artwork from "${record.name}"? The category stays on sale and cards already issued keep their terms — they simply fall back to the default card face.`}
          onConfirm={() => adminActions.cardProductClearImage(record.id)}
        />
      )}
      {record.status === 'active' && (
        <ConfirmActionButton
          label="Archive"
          icon={ArchiveOutlinedIcon}
          color="error"
          confirmText={`Archive "${record.name}"? Cards already sold under it keep their terms, but it can no longer be bought.`}
          onConfirm={() => adminActions.cardProductArchive(record.id)}
        />
      )}
    </TopToolbar>
  )
}

export function CardProductShow() {
  return (
    <Show actions={<CardProductActions />}>
      <CardProductShowContent />
    </Show>
  )
}

/** An unset limit reads "No limit" rather than "—": the distinction is the whole point. */
function Limit({ label, source }: { label: string; source: string }) {
  const record = useRecordContext()
  if (!record) return null

  return (
    <Labeled label={label}>
      {record[source] === null || record[source] === undefined ? (
        <Typography variant="body2" color="text.secondary">
          No limit
        </Typography>
      ) : (
        <MoneyField source={source} currencySource="currency_code" />
      )}
    </Labeled>
  )
}

function CardProductShowContent() {
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

      {/* Le visuel tel que le verra le porteur. `API_URL` est nécessaire : le serializer renvoie
          un chemin relatif à l'API, que le navigateur résoudrait sinon contre l'admin. */}
      {record.image_url && (
        <Card sx={{ mb: 2 }}>
          <CardContent>
            <Box
              component="img"
              src={`${API_URL.replace(/\/api\/v1$/, '')}${record.image_url}`}
              alt={`${record.name} card artwork`}
              sx={{ maxWidth: 320, width: '100%', borderRadius: 2, display: 'block' }}
            />
          </CardContent>
        </Card>
      )}

      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 4, mb: 2 }}>
            <Labeled label="Code">
              <TextField source="code" />
            </Labeled>
            <Labeled label="Issuance price">
              <MoneyField source="issuance_price" currencySource="currency_code" />
            </Labeled>
          </Stack>
          {record.description && (
            <Typography variant="body2" color="text.secondary">
              {record.description}
            </Typography>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 2 }}>
            Limits
          </Typography>
          <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 4 }}>
            <Limit label="Max balance" source="max_balance" />
            <Labeled label="Cards per holder">
              {record.max_active_cards === null ? (
                <Typography variant="body2" color="text.secondary">
                  Unlimited
                </Typography>
              ) : (
                <Typography variant="body2">{record.max_active_cards}</Typography>
              )}
            </Labeled>
            <Limit label="Per top-up" source="per_topup_limit" />
            <Limit label="Per 24 hours" source="daily_topup_limit" />
            <Limit label="Per 30 days" source="monthly_topup_limit" />
          </Stack>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
            Merchant spending is not capped here: the card issuer exposes no endpoint for it and
            purchases never reach our ledger, so any figure shown would be decorative.
          </Typography>
        </CardContent>
      </Card>
    </Box>
  )
}
