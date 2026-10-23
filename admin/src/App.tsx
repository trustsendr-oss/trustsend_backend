import { Admin, CustomRoutes, Resource } from 'react-admin'
import { Route } from 'react-router-dom'
import { dataProvider } from './providers/dataProvider'
import { authProvider } from './providers/authProvider'
import { AppLayout } from './layout/AppLayout'
import { LoginPage } from './pages/LoginPage'
import { Dashboard } from './pages/Dashboard'
import { lightTheme, darkTheme } from './theme/theme'
import { resourceIcons } from './layout/AppMenu'
import { AgentList, AgentShow, AgentCreate, AgentEdit } from './resources/agents'
import { AgentApplicationList, AgentApplicationShow } from './resources/agentApplications'
import { RemittanceList, RemittanceShow } from './resources/remittances'
import { WatchlistList, WatchlistCreate } from './resources/watchlist/Watchlist'
import { BusinessList, BusinessShow, BusinessCreate } from './resources/businesses'
import {
  BusinessStaffList,
  BusinessStaffShow,
  BusinessStaffCreate,
  BusinessStaffEdit,
} from './resources/businessStaff'
import { FinancialProductList, FinancialProductShow } from './resources/financialProducts'
import { LoanList, LoanShow } from './resources/loans'
import { SavingsAccountList } from './resources/savingsAccounts'
import { UserList, UserShow } from './resources/users'
import {
  CardProductList,
  CardProductShow,
  CardProductCreate,
  CardProductEdit,
} from './resources/cardProducts'
import { PlanList, PlanShow, PlanCreate, PlanEdit } from './resources/plans'
import { CurrencyList, CurrencyEdit } from './resources/currencies'
import { ExchangeRateList, ExchangeRateEdit } from './resources/exchangeRates'
import { KycList, KycShow } from './resources/kyc'
import { DisputeList, DisputeShow } from './resources/disputes'
import {
  InternalUserList,
  InternalUserShow,
  InternalUserCreate,
} from './resources/internalUsers'
import { TransactionList, TransactionShow } from './resources/transactions'
import { AuditLogList, AuditLogShow } from './resources/auditLogs'
import { CardList, CardShow, CardCreate } from './resources/cards'
import { LedgerAccountList, LedgerAccountShow } from './resources/ledgerAccounts'
import { Accounting } from './pages/Accounting'
import { LikilibaList, LikilibaShow } from './resources/likilibas'

export default function App() {
  return (
    <Admin
      dataProvider={dataProvider}
      authProvider={authProvider}
      layout={AppLayout}
      loginPage={LoginPage}
      dashboard={Dashboard}
      theme={lightTheme}
      darkTheme={darkTheme}
      requireAuth
      disableTelemetry
    >
      <CustomRoutes>
        <Route path="/accounting" element={<Accounting />} />
      </CustomRoutes>
      <Resource
        name="agents"
        list={AgentList}
        show={AgentShow}
        create={AgentCreate}
        edit={AgentEdit}
        icon={resourceIcons.agents}
        recordRepresentation="full_name"
      />
      <Resource
        name="agent_applications"
        options={{ label: 'Agent applications' }}
        list={AgentApplicationList}
        show={AgentApplicationShow}
        icon={resourceIcons.agent_applications}
        recordRepresentation="business_name"
      />
      <Resource
        name="remittances"
        options={{ label: 'International transfers' }}
        list={RemittanceList}
        show={RemittanceShow}
        icon={resourceIcons.remittances}
        recordRepresentation="id"
      />
      <Resource
        name="watchlist"
        options={{ label: 'Watchlist' }}
        list={WatchlistList}
        create={WatchlistCreate}
        icon={resourceIcons.watchlist}
        recordRepresentation="full_name"
      />
      <Resource
        name="businesses"
        list={BusinessList}
        show={BusinessShow}
        create={BusinessCreate}
        icon={resourceIcons.businesses}
        recordRepresentation="name"
      />
      <Resource
        name="users"
        list={UserList}
        show={UserShow}
        icon={resourceIcons.users}
        recordRepresentation="full_name"
      />
      <Resource
        name="kyc"
        list={KycList}
        show={KycShow}
        icon={resourceIcons.kyc}
        options={{ label: 'KYC review' }}
      />
      <Resource
        name="disputes"
        list={DisputeList}
        show={DisputeShow}
        icon={resourceIcons.disputes}
      />
      <Resource
        name="audit_logs"
        list={AuditLogList}
        show={AuditLogShow}
        icon={resourceIcons.audit_logs}
        options={{ label: 'Audit logs' }}
      />
      <Resource
        name="transactions"
        list={TransactionList}
        show={TransactionShow}
        icon={resourceIcons.transactions}
      />
      <Resource
        name="business_staff"
        list={BusinessStaffList}
        show={BusinessStaffShow}
        create={BusinessStaffCreate}
        edit={BusinessStaffEdit}
        icon={resourceIcons.business_staff}
        options={{ label: 'Institution staff' }}
        recordRepresentation="user_name"
      />
      <Resource
        name="financial_products"
        list={FinancialProductList}
        show={FinancialProductShow}
        icon={resourceIcons.financial_products}
        options={{ label: 'Financial products' }}
        recordRepresentation="name"
      />
      <Resource
        name="loans"
        list={LoanList}
        show={LoanShow}
        icon={resourceIcons.loans}
        recordRepresentation="borrower_name"
      />
      <Resource
        name="likilibas"
        list={LikilibaList}
        show={LikilibaShow}
        icon={resourceIcons.likilibas}
        options={{ label: 'Likiliba groups' }}
        recordRepresentation="name"
      />
      <Resource
        name="savings_accounts"
        list={SavingsAccountList}
        icon={resourceIcons.savings_accounts}
        options={{ label: 'Savings accounts' }}
      />
      <Resource
        name="cards"
        list={CardList}
        show={CardShow}
        create={CardCreate}
        icon={resourceIcons.cards}
      />
      <Resource
        name="ledger_accounts"
        list={LedgerAccountList}
        show={LedgerAccountShow}
        icon={resourceIcons.ledger_accounts}
        options={{ label: 'Ledger accounts' }}
      />
      <Resource
        name="card_products"
        list={CardProductList}
        show={CardProductShow}
        create={CardProductCreate}
        edit={CardProductEdit}
        icon={resourceIcons.card_products}
        options={{ label: 'Card categories' }}
        recordRepresentation="name"
      />
      <Resource
        name="plans"
        list={PlanList}
        show={PlanShow}
        create={PlanCreate}
        edit={PlanEdit}
        icon={resourceIcons.plans}
        recordRepresentation="name"
      />
      <Resource
        name="currencies"
        list={CurrencyList}
        edit={CurrencyEdit}
        icon={resourceIcons.currencies}
        recordRepresentation="code"
      />
      <Resource
        name="exchange_rates"
        list={ExchangeRateList}
        edit={ExchangeRateEdit}
        icon={resourceIcons.exchange_rates}
        options={{ label: 'Exchange rates' }}
        recordRepresentation="currency_code"
      />
      <Resource
        name="internal_users"
        list={InternalUserList}
        show={InternalUserShow}
        create={InternalUserCreate}
        icon={resourceIcons.internal_users}
        options={{ label: 'Staff accounts' }}
        recordRepresentation="full_name"
      />
    </Admin>
  )
}
