import { Create, SimpleForm, TextInput, required, minLength, email } from 'react-admin'
import { useGeneratedSecretNotice } from '../../components/useGeneratedSecretNotice'

export function InternalUserCreate() {
  const notifySecret = useGeneratedSecretNotice()
  return (
    <Create redirect="show" mutationOptions={{ onSuccess: (data) => notifySecret(data) }}>
      <SimpleForm>
        <TextInput source="full_name" validate={[required(), minLength(2)]} />
        <TextInput source="email" validate={[required(), email()]} />
        <TextInput
          source="password"
          type="password"
          helperText="Optional — a password is generated and shown once if left blank. The account must change it on first login."
        />
      </SimpleForm>
    </Create>
  )
}
