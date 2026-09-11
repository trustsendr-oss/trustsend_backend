import { Create, SimpleForm, TextInput, required, minLength, email } from 'react-admin'
import { useGeneratedSecretNotice } from '../../components/useGeneratedSecretNotice'

export function BusinessCreate() {
  const notifySecret = useGeneratedSecretNotice()
  return (
    <Create redirect="show" mutationOptions={{ onSuccess: (data) => notifySecret(data) }}>
      <SimpleForm>
        <TextInput source="name" validate={[required(), minLength(2)]} />
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
