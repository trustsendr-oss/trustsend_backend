import {
  Create,
  SimpleForm,
  ReferenceInput,
  SelectInput,
  AutocompleteInput,
  required,
} from 'react-admin'
import { useWatch } from 'react-hook-form'

const ROLES = [
  { id: 'teller', name: 'Teller' },
  { id: 'credit_officer', name: 'Credit officer' },
  { id: 'branch_manager', name: 'Branch manager' },
  { id: 'admin', name: 'Institution admin' },
]

/**
 * The counter list is filtered by the institution chosen above it, because a counter belongs to
 * exactly one institution — the API refuses a cross-institution posting, and offering one here
 * would only invite the error.
 */
function CounterInput() {
  const businessId = useWatch({ name: 'business_id' })
  return (
    <ReferenceInput
      source="agent_id"
      reference="agents"
      filter={businessId ? { business_id: businessId } : { business_id: -1 }}
    >
      <AutocompleteInput
        optionText="full_name"
        label="Counter"
        helperText={
          businessId
            ? 'Optional — leave blank for a role not tied to one counter.'
            : 'Choose an institution first.'
        }
      />
    </ReferenceInput>
  )
}

export function BusinessStaffCreate() {
  return (
    <Create redirect="show">
      <SimpleForm>
        <ReferenceInput source="business_id" reference="businesses">
          <AutocompleteInput optionText="name" label="Institution" validate={required()} />
        </ReferenceInput>
        <ReferenceInput source="user_id" reference="users">
          <AutocompleteInput
            optionText="full_name"
            label="Person"
            validate={required()}
            helperText="The account they will sign in with — an existing user."
          />
        </ReferenceInput>
        <SelectInput source="role" choices={ROLES} validate={required()} />
        <CounterInput />
      </SimpleForm>
    </Create>
  )
}
