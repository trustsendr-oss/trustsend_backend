import { Create, SimpleForm, TextInput, SelectInput, required, minLength, email } from 'react-admin'
import { useGeneratedSecretNotice } from '../../components/useGeneratedSecretNotice'

const kindChoices = [
  { id: 'merchant', name: 'Merchant' },
  { id: 'imf', name: 'Microfinance institution' },
  { id: 'bank', name: 'Bank' },
  { id: 'insurer', name: 'Insurer' },
]

export function BusinessCreate() {
  const notifySecret = useGeneratedSecretNotice()
  return (
    <Create redirect="show" mutationOptions={{ onSuccess: (data) => notifySecret(data) }}>
      <SimpleForm>
        <TextInput source="name" validate={[required(), minLength(2)]} />
        <SelectInput
          source="kind"
          choices={kindChoices}
          defaultValue="merchant"
          helperText="What the institution is. What it may sell is set by its plan."
        />
        <TextInput source="email" validate={[required(), email()]} />
        <TextInput source="phone" validate={required()} />
        <TextInput source="code" helperText="Optional — auto-generated if left blank" />
        <TextInput
          source="password"
          type="password"
          helperText="Optional — a password is generated and returned once if left blank"
        />
      </SimpleForm>
    </Create>
  )
}
