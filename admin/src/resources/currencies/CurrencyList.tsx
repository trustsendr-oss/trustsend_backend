import {
  List,
  Datagrid,
  TextField,
  NumberField,
  BooleanField,
  FunctionField,
  SearchInput,
  SelectInput,
} from 'react-admin'
import Box from '@mui/material/Box'
import { CurrencyLogo } from './CurrencyLogo'

const filters = [
  <SearchInput source="q" alwaysOn placeholder="Search code or name" />,
  <SelectInput
    source="is_active"
    label="Open for wallets"
    choices={[
      { id: true, name: 'Active' },
      { id: false, name: 'Inactive' },
    ]}
  />,
]

export function CurrencyList() {
  return (
    <List filters={filters} perPage={50} sort={{ field: 'sort_order', order: 'ASC' }}>
      <Datagrid rowClick="edit" bulkActionButtons={false}>
        <FunctionField
          label="Currency"
          sortBy="code"
          render={(record: { code: string; logo_url?: string }) => (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <CurrencyLogo src={record.logo_url} code={record.code} />
              <Box component="span" sx={{ fontWeight: 600 }}>
                {record.code}
              </Box>
            </Box>
          )}
        />
        <TextField source="name" />
        <TextField source="symbol" emptyText="—" />
        <NumberField source="decimals" />
        <TextField source="country_code" label="Country" emptyText="Shared" />
        <BooleanField source="is_active" label="Active" />
        <NumberField source="sort_order" label="Order" />
      </Datagrid>
    </List>
  )
}
