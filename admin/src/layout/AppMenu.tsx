import { Menu } from 'react-admin'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import DashboardIcon from '@mui/icons-material/SpaceDashboardOutlined'
import AgentsIcon from '@mui/icons-material/BadgeOutlined'
import BusinessesIcon from '@mui/icons-material/StorefrontOutlined'
import UsersIcon from '@mui/icons-material/GroupOutlined'
import PlansIcon from '@mui/icons-material/SellOutlined'
import KycIcon from '@mui/icons-material/VerifiedUserOutlined'
import DisputesIcon from '@mui/icons-material/GavelOutlined'
import StaffIcon from '@mui/icons-material/AdminPanelSettingsOutlined'
import TransactionsIcon from '@mui/icons-material/ReceiptLongOutlined'
import AuditLogsIcon from '@mui/icons-material/HistoryOutlined'
import CardsIcon from '@mui/icons-material/CreditCardOutlined'
import LedgerAccountsIcon from '@mui/icons-material/AccountBalanceOutlined'
import AccountingIcon from '@mui/icons-material/SummarizeOutlined'
import CurrenciesIcon from '@mui/icons-material/CurrencyExchangeOutlined'
import ExchangeRatesIcon from '@mui/icons-material/TrendingUpOutlined'

function SectionLabel({ children }: { children: string }) {
  return (
    <Box sx={{ px: 2, pt: 2, pb: 0.5 }}>
      <Typography variant="overline" color="text.disabled" sx={{ fontWeight: 700, letterSpacing: 1 }}>
        {children}
      </Typography>
    </Box>
  )
}

export function AppMenu() {
  return (
    <Menu sx={{ pt: 1 }}>
      <Menu.DashboardItem primaryText="Overview" leftIcon={<DashboardIcon />} />

      <SectionLabel>Network</SectionLabel>
      <Menu.ResourceItem name="agents" />
      <Menu.ResourceItem name="businesses" />
      <Menu.ResourceItem name="users" />

      <SectionLabel>Compliance</SectionLabel>
      <Menu.ResourceItem name="kyc" />
      <Menu.ResourceItem name="disputes" />
      <Menu.ResourceItem name="audit_logs" />

      <SectionLabel>Finance</SectionLabel>
      <Menu.ResourceItem name="transactions" />
      <Menu.ResourceItem name="cards" />
      <Menu.ResourceItem name="ledger_accounts" />
      <Menu.ResourceItem name="exchange_rates" />
      <Menu.Item to="/accounting" primaryText="Accounting" leftIcon={<AccountingIcon />} />

      <SectionLabel>Platform</SectionLabel>
      <Menu.ResourceItem name="card_products" />
      <Menu.ResourceItem name="plans" />
      <Menu.ResourceItem name="currencies" />
      <Menu.ResourceItem name="internal_users" />
    </Menu>
  )
}

export const resourceIcons = {
  agents: AgentsIcon,
  businesses: BusinessesIcon,
  users: UsersIcon,
  plans: PlansIcon,
  // Même icône que les cartes : ce catalogue décrit ce qu'une carte peut être.
  card_products: CardsIcon,
  kyc: KycIcon,
  disputes: DisputesIcon,
  internal_users: StaffIcon,
  transactions: TransactionsIcon,
  audit_logs: AuditLogsIcon,
  cards: CardsIcon,
  ledger_accounts: LedgerAccountsIcon,
  currencies: CurrenciesIcon,
  exchange_rates: ExchangeRatesIcon,
}
