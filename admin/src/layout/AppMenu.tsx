import { Menu } from 'react-admin'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import DashboardIcon from '@mui/icons-material/SpaceDashboardOutlined'
import AgentsIcon from '@mui/icons-material/BadgeOutlined'
import AgentApplicationsIcon from '@mui/icons-material/HowToRegOutlined'
import RemittancesIcon from '@mui/icons-material/PublicOutlined'
import WatchlistIcon from '@mui/icons-material/PolicyOutlined'
import BusinessesIcon from '@mui/icons-material/StorefrontOutlined'
import BusinessStaffIcon from '@mui/icons-material/SupportAgentOutlined'
import FinancialProductsIcon from '@mui/icons-material/SavingsOutlined'
import LoansIcon from '@mui/icons-material/HandshakeOutlined'
import SavingsAccountsIcon from '@mui/icons-material/AccountBalanceWalletOutlined'
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
import LikilibaIcon from '@mui/icons-material/Diversity3Outlined'

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
      <Menu.ResourceItem name="agent_applications" />
      <Menu.ResourceItem name="businesses" />
      <Menu.ResourceItem name="business_staff" />
      <Menu.ResourceItem name="users" />

      <SectionLabel>Compliance</SectionLabel>
      <Menu.ResourceItem name="kyc" />
      <Menu.ResourceItem name="watchlist" />
      <Menu.ResourceItem name="disputes" />
      <Menu.ResourceItem name="audit_logs" />

      <SectionLabel>Finance</SectionLabel>
      <Menu.ResourceItem name="transactions" />
      <Menu.ResourceItem name="remittances" />
      <Menu.ResourceItem name="cards" />
      <Menu.ResourceItem name="loans" />
      <Menu.ResourceItem name="savings_accounts" />
      <Menu.ResourceItem name="likilibas" />
      <Menu.ResourceItem name="ledger_accounts" />
      <Menu.ResourceItem name="exchange_rates" />
      <Menu.Item to="/accounting" primaryText="Accounting" leftIcon={<AccountingIcon />} />

      <SectionLabel>Platform</SectionLabel>
      <Menu.ResourceItem name="card_products" />
      <Menu.ResourceItem name="financial_products" />
      <Menu.ResourceItem name="plans" />
      <Menu.ResourceItem name="currencies" />
      <Menu.ResourceItem name="internal_users" />
    </Menu>
  )
}

export const resourceIcons = {
  agents: AgentsIcon,
  agent_applications: AgentApplicationsIcon,
  remittances: RemittancesIcon,
  watchlist: WatchlistIcon,
  businesses: BusinessesIcon,
  business_staff: BusinessStaffIcon,
  financial_products: FinancialProductsIcon,
  loans: LoansIcon,
  savings_accounts: SavingsAccountsIcon,
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
  likilibas: LikilibaIcon,
}
