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
  <SearchInput key="q" source="q" alwaysOn placeholder="Search saver or institution" />,
  <ReferenceInput key="provider_id" source="provider_id" reference="businesses" label="Institution" />,
  <SelectInput
    key="status"
    source="status"
    choices={[
      { id: 'active', name: 'Active' },
      { id: 'matured', name: 'Matured' },
      { id: 'closed', name: 'Closed' },
    ]}
  />,
]

/**
 * Savings held with partner institutions.
 *
 * The balance shown is what sits in the saver's own escrow wallet — the institution earns on it
 * and can see it, but never holds it, which is the whole reason these accounts are shaped the way
 * they are. `withdrawable` is false while a term deposit is still locked.
 */
export function SavingsAccountList() {
  return (
    <List filters={filters} sort={{ field: 'opened_at', order: 'DESC' }}>
      <Datagrid rowClick={false} bulkActionButtons={false}>
        <TextField source="saver_name" label="Saver" />
        <ReferenceField source="provider_id" reference="businesses" label="Institution" link="show">
          <TextField source="name" />
        </ReferenceField>
        <TextField source="product_name" label="Product" emptyText="—" />
        <FunctionField label="Balance" render={(r: any) => `${r.balance} ${r.currency_code}`} />
        <FunctionField
          label="Rate"
          render={(r: any) => `${r.interest_rate_percent}% / ${r.interest_period}`}
        />
        <FunctionField
          label="Withdrawable"
          render={(r: any) =>
            r.withdrawable ? 'Yes' : r.matures_at ? `Locked until ${new Date(r.matures_at).toLocaleDateString()}` : 'No'
          }
        />
        <StatusField source="status" />
        <DateField source="opened_at" label="Opened" />
      </Datagrid>
    </List>
  )
}
