import {
  List,
  Datagrid,
  TextField,
  DateField,
  DeleteButton,
  Create,
  SimpleForm,
  TextInput,
  required,
  SearchInput,
} from 'react-admin'

/**
 * Names screened against every international transfer (sender and beneficiary). A match holds
 * the transfer for review in Remittances — it never refuses it outright, since names collide.
 */
export function WatchlistList() {
  return (
    <List filters={[<SearchInput key="q" source="q" alwaysOn />]} perPage={50}>
      <Datagrid bulkActionButtons={false}>
        <TextField source="full_name" />
        <TextField source="source" />
        <TextField source="reference" emptyText="—" />
        <DateField source="created_at" />
        <DeleteButton mutationMode="pessimistic" />
      </Datagrid>
    </List>
  )
}

export function WatchlistCreate() {
  return (
    <Create redirect="list">
      <SimpleForm>
        <TextInput source="full_name" validate={required()} helperText="Every word must appear in a party's name to match" />
        <TextInput source="source" validate={required()} helperText="UN, OFAC, EU, internal…" />
        <TextInput source="reference" helperText="Optional — list entry reference" />
      </SimpleForm>
    </Create>
  )
}
