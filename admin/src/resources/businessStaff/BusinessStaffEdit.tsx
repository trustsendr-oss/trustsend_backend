import {
  Edit,
  SimpleForm,
  SelectInput,
  ReferenceInput,
  AutocompleteInput,
  useRecordContext,
} from 'react-admin'

const ROLES = [
  { id: 'teller', name: 'Teller' },
  { id: 'credit_officer', name: 'Credit officer' },
  { id: 'branch_manager', name: 'Branch manager' },
  { id: 'admin', name: 'Institution admin' },
]

/**
 * Institution and person are absent on purpose: a membership ties one person to one institution,
 * and changing either would silently turn this row into a different membership rather than an
 * edit of this one. Ending a posting is what `status` is for.
 */
function CounterInput() {
  const record = useRecordContext()
  return (
    <ReferenceInput
      source="agent_id"
      reference="agents"
      filter={{ business_id: record?.business_id ?? -1 }}
    >
      <AutocompleteInput
        optionText="full_name"
        label="Counter"
        helperText="Blank for a role not tied to one counter."
      />
    </ReferenceInput>
  )
}

export function BusinessStaffEdit() {
  return (
    <Edit redirect="show" mutationMode="pessimistic">
      <SimpleForm>
        <SelectInput source="role" choices={ROLES} />
        <CounterInput />
        <SelectInput
          source="status"
          choices={[
            { id: 'active', name: 'Active' },
            { id: 'suspended', name: 'Suspended' },
            { id: 'terminated', name: 'Terminated' },
          ]}
          helperText="Suspending revokes their access to the institution immediately."
        />
      </SimpleForm>
    </Edit>
  )
}
