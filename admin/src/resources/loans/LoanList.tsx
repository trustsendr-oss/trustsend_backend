import {
  List,
  Datagrid,
  TextField,
  DateField,
  FunctionField,
  SearchInput,
  SelectInput,
  ReferenceInput,
  ReferenceField,
} from 'react-admin'
import { StatusField } from '../../components/StatusChip'

const filters = [
  <SearchInput key="q" source="q" alwaysOn placeholder="Search borrower or institution" />,
  <ReferenceInput key="provider_id" source="provider_id" reference="businesses" label="Institution" />,
  <SelectInput
    key="status"
    source="status"
    choices={[
      { id: 'requested', name: 'Awaiting decision' },
      { id: 'approved', name: 'Approved, not paid out' },
      { id: 'disbursed', name: 'Disbursed' },
      { id: 'repaying', name: 'Repaying' },
      { id: 'repaid', name: 'Repaid' },
      { id: 'defaulted', name: 'Defaulted' },
      { id: 'rejected', name: 'Rejected' },
    ]}
  />,
]

/**
 * Every loan across every institution.
 *
 * The rate is shown with its period AND method, because 5% a month flat on the original principal
 * is a different product from 5% a month on the balance outstanding — around twice the cost at the
 * same quoted figure. Showing the number alone would let someone compare two books that are not
 * comparable.
 */
export function LoanList() {
  return (
    <List filters={filters} sort={{ field: 'requested_at', order: 'DESC' }}>
      <Datagrid rowClick="show" bulkActionButtons={false}>
        <TextField source="borrower_name" label="Borrower" />
        <ReferenceField source="provider_id" reference="businesses" label="Institution" link="show">
          <TextField source="name" />
        </ReferenceField>
        <FunctionField
          label="Principal"
          render={(r: any) => `${r.principal} ${r.currency_code}`}
        />
        <FunctionField
          label="Outstanding"
          render={(r: any) => (r.total_outstanding === '0' ? '—' : r.total_outstanding)}
        />
        <FunctionField
          label="Rate"
          render={(r: any) =>
            `${r.interest_rate_percent}% / ${r.interest_period} (${r.interest_method})`
          }
        />
        <StatusField source="status" />
        <DateField source="requested_at" label="Applied" />
      </Datagrid>
    </List>
  )
}
