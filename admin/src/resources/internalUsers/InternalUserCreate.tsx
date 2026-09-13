import { Create, SimpleForm, TextInput, required, minLength, maxLength, email } from 'react-admin'
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
          validate={[minLength(12), maxLength(128)]}
          helperText="Optional — at least 12 characters. Leave blank to generate one, shown once. On first sign-in the account must change it and enable two-factor authentication."
        />
      </SimpleForm>
    </Create>
  )
}
