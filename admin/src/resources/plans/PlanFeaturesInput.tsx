import Alert from '@mui/material/Alert'
import Autocomplete from '@mui/material/Autocomplete'
import Box from '@mui/material/Box'
import Checkbox from '@mui/material/Checkbox'
import Chip from '@mui/material/Chip'
import FormControlLabel from '@mui/material/FormControlLabel'
import FormHelperText from '@mui/material/FormHelperText'
import Paper from '@mui/material/Paper'
import Radio from '@mui/material/Radio'
import RadioGroup from '@mui/material/RadioGroup'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useGetList, useInput } from 'react-admin'
import {
  KNOWN_FEATURE_KEYS,
  PLAN_FEATURES,
  asPlanFeatures,
  buildRestriction,
  validatePlanFeatures,
  type FeatureRestriction,
  type PlanFeatureDefinition,
  type PlanFeatures,
} from './planFeatures'

interface CurrencyOption {
  code: string
  name: string
  is_active: boolean
}

// Countries mobile money is sold in — offered as suggestions, any other ISO alpha-3 code can be typed.
const COUNTRY_SUGGESTIONS = ['BDI', 'BEN', 'CIV', 'CMR', 'COD', 'COG', 'GAB', 'GHA', 'KEN', 'MOZ', 'MWI', 'NGA', 'RWA', 'SEN', 'SLE', 'TZA', 'UGA', 'ZMB']

/**
 * Visual editor for Plan.features: one checkbox per feature, and for the features whose endpoints
 * carry a currency (see planFeatures.ts) a choice between every currency and a picked list.
 * Replaces the raw JSON textarea; keys this editor doesn't know are kept as-is, never dropped.
 */
export function PlanFeaturesInput() {
  const { field, fieldState } = useInput({ source: 'features', validate: validatePlanFeatures })
  const features = asPlanFeatures(field.value)
  const { data: currencies = [], isPending } = useGetList<CurrencyOption & { id: string }>('currencies', {
    pagination: { page: 1, perPage: 500 },
    sort: { field: 'code', order: 'ASC' },
  })

  const update = (key: string, restriction: FeatureRestriction | undefined) => {
    const next: PlanFeatures = { ...features }
    if (restriction === undefined) delete next[key]
    else next[key] = restriction
    field.onChange(next)
    field.onBlur()
  }

  const unknownKeys = Object.keys(features).filter((key) => !KNOWN_FEATURE_KEYS.has(key))

  return (
    <Box sx={{ width: '100%', maxWidth: 760 }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
        Features
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        Tick what this plan includes. Unticked features are refused to businesses on this plan.
      </Typography>

      <Stack spacing={1.25}>
        {PLAN_FEATURES.map((definition) => (
          <FeatureRow
            key={definition.key}
            definition={definition}
            value={features[definition.key]}
            onChange={(restriction) => update(definition.key, restriction)}
            currencies={currencies}
            currenciesLoading={isPending}
          />
        ))}
      </Stack>

      {unknownKeys.length > 0 && (
        <Alert severity="info" sx={{ mt: 2 }}>
          <Typography variant="body2" sx={{ mb: 1 }}>
            Other feature keys on this plan (not known to this editor, kept unchanged):
          </Typography>
          <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1 }}>
            {unknownKeys.map((key) => (
              <Chip key={key} label={key} size="small" onDelete={() => update(key, undefined)} />
            ))}
          </Stack>
        </Alert>
      )}

      {fieldState.error && (
        <FormHelperText error sx={{ mt: 1 }}>
          {fieldState.error.message}
        </FormHelperText>
      )}
    </Box>
  )
}

function FeatureRow({
  definition,
  value,
  onChange,
  currencies,
  currenciesLoading,
}: {
  definition: PlanFeatureDefinition
  value: FeatureRestriction | undefined
  onChange: (restriction: FeatureRestriction | undefined) => void
  currencies: CurrencyOption[]
  currenciesLoading: boolean
}) {
  const enabled = value !== undefined
  const restriction = value && value !== true ? value : undefined
  const selectedCurrencies = restriction?.currencies
  const selectedCountries = restriction?.countries
  // A restriction already stored on a feature that doesn't normally offer it stays visible and editable.
  const showCurrencies = definition.currencies || selectedCurrencies !== undefined
  const showCountries = definition.countries || selectedCountries !== undefined

  // Active currencies, plus any inactive one already picked so it doesn't vanish from the field.
  const currencyOptions = currencies.filter(
    (c) => c.is_active || selectedCurrencies?.includes(c.code)
  )
  const currencyLabel = (code: string) => {
    const currency = currencies.find((c) => c.code === code)
    return currency ? `${code} — ${currency.name}` : code
  }

  return (
    <Paper
      variant="outlined"
      sx={{ p: 1.5, borderColor: enabled ? 'primary.main' : 'divider', transition: 'border-color .15s' }}
    >
      <FormControlLabel
        sx={{ alignItems: 'flex-start', m: 0 }}
        control={
          <Checkbox
            checked={enabled}
            onChange={(e) => onChange(e.target.checked ? true : undefined)}
            sx={{ mt: -0.75, ml: -0.5 }}
          />
        }
        label={
          <Box>
            <Typography variant="body1" sx={{ fontWeight: 600 }}>
              {definition.label}{' '}
              <Typography component="span" variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                {definition.key}
              </Typography>
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {definition.description}
            </Typography>
          </Box>
        }
      />

      {enabled && (showCurrencies || showCountries || definition.note) && (
        <Box sx={{ pl: 4.5, pt: 1 }}>
          {showCurrencies && (
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                Currencies
              </Typography>
              <RadioGroup
                row
                value={selectedCurrencies === undefined ? 'all' : 'some'}
                onChange={(e) =>
                  onChange(buildRestriction(e.target.value === 'all' ? undefined : [], selectedCountries))
                }
              >
                <FormControlLabel value="all" control={<Radio size="small" />} label="All currencies" />
                <FormControlLabel value="some" control={<Radio size="small" />} label="Only these currencies" />
              </RadioGroup>
              {selectedCurrencies !== undefined && (
                <Autocomplete
                  multiple
                  size="small"
                  loading={currenciesLoading}
                  options={currencyOptions.map((c) => c.code)}
                  value={selectedCurrencies}
                  getOptionLabel={currencyLabel}
                  onChange={(_, codes) => onChange(buildRestriction(codes, selectedCountries))}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      placeholder={selectedCurrencies.length === 0 ? 'Pick one or more currencies' : undefined}
                      error={selectedCurrencies.length === 0}
                      helperText={selectedCurrencies.length === 0 ? 'Pick at least one currency' : undefined}
                    />
                  )}
                  sx={{ mb: 1 }}
                />
              )}
            </Box>
          )}

          {showCountries && (
            <Box sx={{ mt: showCurrencies ? 1 : 0 }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                Countries
              </Typography>
              <RadioGroup
                row
                value={selectedCountries === undefined ? 'all' : 'some'}
                onChange={(e) =>
                  onChange(buildRestriction(selectedCurrencies, e.target.value === 'all' ? undefined : []))
                }
              >
                <FormControlLabel value="all" control={<Radio size="small" />} label="All countries" />
                <FormControlLabel value="some" control={<Radio size="small" />} label="Only these countries" />
              </RadioGroup>
              {selectedCountries !== undefined && (
                <Autocomplete
                  multiple
                  freeSolo
                  size="small"
                  options={COUNTRY_SUGGESTIONS}
                  value={selectedCountries}
                  onChange={(_, codes) =>
                    onChange(
                      buildRestriction(
                        selectedCurrencies,
                        [...new Set(codes.map((c) => c.trim().toUpperCase()).filter((c) => /^[A-Z]{3}$/.test(c)))]
                      )
                    )
                  }
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      placeholder="ISO alpha-3, e.g. COD"
                      error={selectedCountries.length === 0}
                      helperText={
                        selectedCountries.length === 0
                          ? 'Pick at least one country'
                          : 'Only applies to requests that send a country_code'
                      }
                    />
                  )}
                />
              )}
            </Box>
          )}

          {definition.note && (
            <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 0.5 }}>
              {definition.note}
            </Typography>
          )}
        </Box>
      )}
    </Paper>
  )
}
