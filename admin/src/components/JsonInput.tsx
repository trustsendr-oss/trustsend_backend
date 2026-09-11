import { useState, useEffect } from 'react'
import TextField from '@mui/material/TextField'
import { useInput, useRecordContext, type InputProps } from 'react-admin'

/**
 * Renders a JSON object field (e.g. Plan.features, a free-form
 * `Record<string, true | { currencies?, countries? }>` map — see app/models/plan.ts) as an
 * editable textarea. Local text state is kept separate from the form value so the user can type
 * invalid-JSON-in-progress without the field fighting them; the form value only updates once the
 * text parses.
 */
export function JsonInput(props: InputProps & { rows?: number }) {
  const { field, fieldState } = useInput(props)
  const record = useRecordContext()
  const [text, setText] = useState(() => JSON.stringify(field.value ?? {}, null, 2))
  const [parseError, setParseError] = useState<string | null>(null)

  useEffect(() => {
    setText(JSON.stringify(field.value ?? {}, null, 2))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record?.id])

  const handleChange = (value: string) => {
    setText(value)
    try {
      const parsed = JSON.parse(value)
      setParseError(null)
      field.onChange(parsed)
    } catch {
      setParseError('Invalid JSON')
    }
  }

  return (
    <TextField
      label={props.label ?? props.source}
      value={text}
      onChange={(e) => handleChange(e.target.value)}
      onBlur={field.onBlur}
      multiline
      minRows={props.rows ?? 6}
      fullWidth
      error={!!parseError || !!fieldState.error}
      helperText={parseError || fieldState.error?.message || props.helperText}
      sx={{ fontFamily: 'monospace', '& textarea': { fontFamily: 'monospace', fontSize: 13 } }}
    />
  )
}
