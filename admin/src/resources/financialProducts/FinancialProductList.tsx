import {
  List,
  Datagrid,
  TextField,
  DateField,
  FunctionField,
  SearchInput,
  SelectInput,
  ReferenceField,
} from 'react-admin'
import { StatusField } from '../../components/StatusChip'

const filters = [
  <SearchInput key="q" source="q" alwaysOn placeholder="Search product or institution" />,
  <SelectInput
    key="status"
    source="status"
    choices={[
      { id: 'pending_review', name: 'Awaiting review' },
      { id: 'active', name: 'Published' },
      { id: 'draft', name: 'Draft' },
      { id: 'rejected', name: 'Rejected' },
      { id: 'archived', name: 'Archived' },
    ]}
  />,
  <SelectInput
    key="kind"
    source="kind"
    choices={[
      { id: 'savings', name: 'Savings' },
      { id: 'term_deposit', name: 'Term deposit' },
      { id: 'loan', name: 'Loan' },
    ]}
  />,
]

/**
 * A review queue before it is a catalogue: the API returns submissions awaiting a decision first,
 * oldest submission at the top, so the list opens on what somebody is waiting for.
 *
 * The rate is shown with its period and method together — 5% a month charged flat on the original
 * principal is a very different product from 5% a month on the balance outstanding, and showing
 * the number alone would invite approving one while reading the other.
 */
export function FinancialProductList() {
  return (
    <List filters={filters} sort={{ field: 'status', order: 'ASC' }}>
      <Datagrid rowClick="show" bulkActionButtons={false}>
        <TextField source="name" />
        <ReferenceField source="provider_id" reference="businesses" label="Institution" link="show">
          <TextField source="name" />
        </ReferenceField>
        <TextField source="kind" />
        <FunctionField
          label="Rate"
          render={(record: any) =>
            `${record.interest_rate_percent}% / ${record.interest_period}${
              record.interest_method ? ` (${record.interest_method})` : ''
            }`
          }
        />
        <TextField source="currency_code" label="Currency" />
        <StatusField source="status" />
        <DateField source="submitted_at" label="Submitted" showTime emptyText="—" />
      </Datagrid>
    </List>
  )
}
