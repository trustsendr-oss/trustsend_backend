import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import BlockOutlinedIcon from '@mui/icons-material/BlockOutlined'
import { useRecordContext } from 'react-admin'
import { KNOWN_FEATURE_KEYS, PLAN_FEATURES, asPlanFeatures, type FeatureRestriction } from './planFeatures'

/** Read-only summary of Plan.features for the show page: what is included, and where. */
export function PlanFeaturesField() {
  const record = useRecordContext()
  if (!record) return null
  const features = asPlanFeatures(record.features)
  const unknownKeys = Object.keys(features).filter((key) => !KNOWN_FEATURE_KEYS.has(key))

  return (
    <Stack spacing={1}>
      {PLAN_FEATURES.map((definition) => (
        <FeatureLine key={definition.key} label={definition.label} restriction={features[definition.key]} />
      ))}
      {unknownKeys.map((key) => (
        <FeatureLine key={key} label={key} restriction={features[key]} />
      ))}
    </Stack>
  )
}

function FeatureLine({ label, restriction }: { label: string; restriction: FeatureRestriction | undefined }) {
  const included = restriction !== undefined
  const scoped = restriction && restriction !== true ? restriction : undefined

  return (
    <Box sx={{ display: 'flex', gap: 1.25, alignItems: 'flex-start', opacity: included ? 1 : 0.55 }}>
      {included ? (
        <CheckCircleIcon fontSize="small" color="success" sx={{ mt: 0.25 }} />
      ) : (
        <BlockOutlinedIcon fontSize="small" color="disabled" sx={{ mt: 0.25 }} />
      )}
      <Box>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {label}
          {!included && (
            <Typography component="span" variant="body2" color="text.secondary">
              {' '}
              — not included
            </Typography>
          )}
        </Typography>
        {included && (
          <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.75, mt: 0.5, alignItems: 'center' }}>
            <Scope title="Currencies" values={scoped?.currencies} allLabel="All currencies" />
            <Scope title="Countries" values={scoped?.countries} allLabel="All countries" />
          </Stack>
        )}
      </Box>
    </Box>
  )
}

function Scope({ title, values, allLabel }: { title: string; values?: string[]; allLabel: string }) {
  if (values === undefined) {
    return <Chip size="small" variant="outlined" label={allLabel} />
  }
  return (
    <>
      <Typography variant="caption" color="text.secondary">
        {title}:
      </Typography>
      {values.length === 0 ? (
        <Chip size="small" color="warning" label="none (feature effectively disabled)" />
      ) : (
        values.map((value) => <Chip key={value} size="small" color="primary" label={value} />)
      )}
    </>
  )
}
