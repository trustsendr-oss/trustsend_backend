import {
  List,
  Datagrid,
  TextField,
  NumberField,
  SelectInput,
  SearchInput,
  TopToolbar,
  CreateButton,
} from 'react-admin'
import Box from '@mui/material/Box'
import { useRecordContext } from 'react-admin'
import { MoneyField } from '../../components/MoneyField'
import { API_URL } from '../../providers/httpClient'
import { StatusField } from '../../components/StatusChip'

const filters = [
  <SearchInput source="q" alwaysOn placeholder="Search categories" />,
  <SelectInput
    source="status"
    choices={[
      { id: 'active', name: 'Active' },
      { id: 'archived', name: 'Archived' },
    ]}
  />,
]

function CardProductListActions() {
  return (
    <TopToolbar>
      <CreateButton />
    </TopToolbar>
  )
}

/** Vignette du visuel, ou un tiret : une catégorie sans image doit se repérer d'un coup d'œil. */
function CardArtThumb() {
  const record = useRecordContext()
  if (!record?.image_url) return <span>—</span>
  return (
    <Box
      component="img"
      src={`${API_URL.replace(/\/api\/v1$/, '')}${record.image_url}`}
      alt=""
      sx={{ width: 56, height: 36, objectFit: 'cover', borderRadius: 1, display: 'block' }}
    />
  )
}

export function CardProductList() {
  return (
    <List filters={filters} actions={<CardProductListActions />} perPage={25}>
      <Datagrid rowClick="show" bulkActionButtons={false}>
        <CardArtThumb />
        <TextField source="code" />
        <TextField source="name" />
        <MoneyField source="issuance_price" currencySource="currency_code" label="Price" />
        <MoneyField source="max_balance" currencySource="currency_code" label="Max balance" />
        <NumberField source="max_active_cards" label="Cards / holder" />
        <StatusField source="status" />
      </Datagrid>
    </List>
  )
}
