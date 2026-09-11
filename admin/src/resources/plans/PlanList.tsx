import {
  List,
  Datagrid,
  TextField,
  SelectInput,
  SearchInput,
  TopToolbar,
  CreateButton,
} from 'react-admin'
import { MoneyField } from '../../components/MoneyField'
import { StatusField } from '../../components/StatusChip'

const filters = [
  <SearchInput source="q" alwaysOn placeholder="Search plans" />,
  <SelectInput
    source="status"
    choices={[
      { id: 'active', name: 'Active' },
      { id: 'archived', name: 'Archived' },
    ]}
  />,
]

function PlanListActions() {
  return (
    <TopToolbar>
      <CreateButton />
    </TopToolbar>
  )
}

export function PlanList() {
  return (
    <List filters={filters} actions={<PlanListActions />} perPage={25}>
      <Datagrid rowClick="show" bulkActionButtons={false}>
        <TextField source="code" />
        <TextField source="name" />
        <MoneyField source="price" />
        <MoneyField source="maintenance_price" currencySource="currency_code" />
        <StatusField source="status" />
      </Datagrid>
    </List>
  )
}
