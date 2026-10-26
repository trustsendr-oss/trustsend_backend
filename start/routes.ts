/*
|--------------------------------------------------------------------------
| Routes file
|--------------------------------------------------------------------------
|
| The routes file is used for defining the HTTP routes.
|
*/

import { middleware } from '#start/kernel'
import router from '@adonisjs/core/services/router'
import transmit from '@adonisjs/transmit/services/main'
import User from '#models/user'
import { controllers } from '#generated/controllers'
const P2pTransfersController = () => import('#controllers/transfers/p2p_transfers_controller')
const LikilibasController = () => import('#controllers/likiliba/likilibas_controller')
const AdminLikilibasController = () => import('#controllers/admin/likilibas_controller')
const CashInController = () => import('#controllers/transfers/cash_in_controller')
const CashOutController = () => import('#controllers/transfers/cash_out_controller')
const AgentsController = () => import('#controllers/agents_controller')
const AgentKycController = () => import('#controllers/agent_kyc_controller')
const AgentFloatController = () => import('#controllers/agent_float_controller')
const AgentWorkspaceController = () => import('#controllers/agent_workspace_controller')
const AgentApplicationsController = () => import('#controllers/agent_applications_controller')
const RemittancesController = () => import('#controllers/remittances_controller')
const AgentRemittancesController = () => import('#controllers/agent_remittances_controller')
const AdminRemittancesController = () => import('#controllers/admin/remittances_controller')
const AdminAgentApplicationsController = () =>
  import('#controllers/admin/agent_applications_controller')
const KycController = () => import('#controllers/kyc_controller')
const DisputesController = () => import('#controllers/disputes_controller')
const WebhooksController = () => import('#controllers/webhooks_controller')
const WalletsController = () => import('#controllers/wallets_controller')
const TransactionsController = () => import('#controllers/transactions_controller')
const DirectoryController = () => import('#controllers/directory_controller')
const MerchantPaymentsController = () =>
  import('#controllers/merchants/merchant_payments_controller')
const BusinessMerchantPaymentsController = () =>
  import('#controllers/business/merchant_payments_controller')
const PinController = () => import('#controllers/pin_controller')
const MobileMoneyDepositsController = () => import('#controllers/mobile_money/deposits_controller')
const MobileMoneyPayoutsController = () => import('#controllers/mobile_money/payouts_controller')
const MobileMoneyWebhooksController = () => import('#controllers/mobile_money/webhooks_controller')
const MobileMoneyToolkitController = () => import('#controllers/mobile_money/toolkit_controller')
const CardsController = () => import('#controllers/cards_controller')
const CardProductsController = () => import('#controllers/card_products_controller')
const CardWebhooksController = () => import('#controllers/cards/webhooks_controller')
const BusinessesController = () => import('#controllers/businesses_controller')
const BusinessLogoController = () => import('#controllers/business_logo_controller')
const UsersController = () => import('#controllers/users_controller')
const PlansController = () => import('#controllers/plans_controller')
const BusinessDepositsController = () => import('#controllers/business/deposits_controller')
const BusinessPayoutsController = () => import('#controllers/business/payouts_controller')
const BusinessWalletController = () => import('#controllers/business/wallet_controller')
const BusinessTransactionsController = () => import('#controllers/business/transactions_controller')
const BusinessWebhooksController = () => import('#controllers/business/webhooks_controller')
const CryptoDepositsController = () => import('#controllers/crypto/crypto_deposits_controller')
const CryptoPayoutsController = () => import('#controllers/crypto/crypto_payouts_controller')
const CryptoWebhooksController = () => import('#controllers/crypto/crypto_webhooks_controller')
const BusinessCryptoController = () => import('#controllers/business/crypto_controller')
const BusinessToolkitController = () => import('#controllers/business/toolkit_controller')
const BusinessPlanController = () => import('#controllers/business/plan_controller')
const BusinessCardsController = () => import('#controllers/business/cards_controller')
const BusinessSandboxController = () => import('#controllers/business/sandbox_controller')
const InternalAuthController = () => import('#controllers/internal_auth_controller')
const PushTokensController = () => import('#controllers/push_tokens_controller')
const DeviceSessionsController = () => import('#controllers/device_sessions_controller')
const InternalUsersController = () => import('#controllers/internal_users_controller')
const BusinessDashboardAuthController = () =>
  import('#controllers/business_dashboard/auth_controller')
const BusinessOverviewController = () =>
  import('#controllers/business_dashboard/overview_controller')
const BusinessDashboardApiKeysController = () =>
  import('#controllers/business_dashboard/api_keys_controller')
const BusinessDashboardProfileController = () =>
  import('#controllers/business_dashboard/profile_controller')
const BusinessPinController = () => import('#controllers/business_dashboard/pin_controller')
const BusinessKycController = () => import('#controllers/business_dashboard/kyc_controller')
const BusinessNotificationsController = () =>
  import('#controllers/business_dashboard/notifications_controller')
const NotificationsController = () => import('#controllers/notifications_controller')
const AssetsController = () => import('#controllers/assets_controller')
const CurrenciesController = () => import('#controllers/currencies_controller')
const ExchangeRatesController = () => import('#controllers/fx/exchange_rates_controller')
const SwapsController = () => import('#controllers/fx/swaps_controller')
const BusinessSwapsController = () => import('#controllers/business/swaps_controller')
const AdminTransactionsController = () => import('#controllers/admin/transactions_controller')
const AdminAuditLogsController = () => import('#controllers/admin/audit_logs_controller')
const AdminCardsController = () => import('#controllers/admin/cards_controller')
const AdminLedgerAccountsController = () => import('#controllers/admin/ledger_accounts_controller')
const AdminAccountingController = () => import('#controllers/admin/accounting_controller')
const AdminBusinessStaffController = () => import('#controllers/admin/business_staff_controller')
const AdminFinancialProductsController = () =>
  import('#controllers/admin/financial_products_controller')
const AdminLendingController = () => import('#controllers/admin/lending_controller')
const LendingProductsController = () => import('#controllers/lending/products_controller')
const LendingCatalogueController = () => import('#controllers/lending/catalogue_controller')
const SavingsAccountsController = () => import('#controllers/savings/accounts_controller')
const CounterSessionsController = () => import('#controllers/counter/sessions_controller')
const CounterCashController = () => import('#controllers/counter/cash_controller')
const CounterCustomersController = () => import('#controllers/counter/customers_controller')
const CounterSavingsController = () => import('#controllers/counter/savings_controller')
const CounterLoansController = () => import('#controllers/counter/loans_controller')
const CounterMeController = () => import('#controllers/counter/me_controller')
const CounterJournalController = () => import('#controllers/counter/journal_controller')
const BusinessDashboardOutletsController = () =>
  import('#controllers/business_dashboard/outlets_controller')
const BusinessDashboardStaffController = () =>
  import('#controllers/business_dashboard/staff_controller')
const BusinessDashboardActivityController = () =>
  import('#controllers/business_dashboard/activity_controller')
const BusinessDashboardPortfolioController = () =>
  import('#controllers/business_dashboard/portfolio_controller')
const BorrowerLoansController = () => import('#controllers/lending/borrower_loans_controller')
const CounterLoansCommitteeController = () =>
  import('#controllers/counter/loans_committee_controller')
const CounterGroupsController = () => import('#controllers/counter/groups_controller')
const CounterLoanOfficersController = () => import('#controllers/counter/loan_officers_controller')
const CounterLoansRestructureController = () =>
  import('#controllers/counter/loans_restructure_controller')
const CounterLoansDefaultController = () => import('#controllers/counter/loans_default_controller')
const CounterPenaltiesController = () => import('#controllers/counter/penalties_controller')
const CounterVaultController = () => import('#controllers/counter/vault_controller')
const BusinessDashboardImfController = () =>
  import('#controllers/business_dashboard/imf_controller')
const BusinessDashboardImfMigrationController = () =>
  import('#controllers/business_dashboard/imf_migration_controller')

router.get('/', () => {
  return { hello: 'world' }
})

router.get('/health', () => {
  return { status: 'ok' }
})

router.get('/assets/flags/usd.svg', [AssetsController, 'usdFlag'])
router.get('/assets/currencies/:file', [AssetsController, 'currencyLogo'])

router
  .group(() => {
    router
      .group(() => {
        router.post('signup/request-otp', [controllers.NewAccount, 'requestOtp']).use(
          middleware.throttle({
            maxRequests: 5,
            windowMinutes: 15,
            name: 'user-signup-otp-request',
          })
        )
        router
          .post('signup', [controllers.NewAccount, 'store'])
          .use(middleware.throttle({ maxRequests: 10, windowMinutes: 15, name: 'user-signup' }))
        router
          .post('login', [controllers.AccessTokens, 'store'])
          .use(middleware.throttle({ maxRequests: 10, windowMinutes: 15, name: 'user-login' }))
        router.post('refresh', [controllers.AccessTokens, 'refresh']).use(middleware.auth())
        // PIN sign-in on an enrolled device — see device_sessions_controller.ts. Throttled like
        // login: PinService locks the PIN after 3 misses, this caps hammering across accounts.
        router
          .post('pin-login', [DeviceSessionsController, 'pinLogin'])
          .use(middleware.throttle({ maxRequests: 10, windowMinutes: 15, name: 'user-pin-login' }))
        router.post('device-sessions/revoke', [DeviceSessionsController, 'revoke'])
      })
      .prefix('auth')
      .as('auth')

    router
      .group(() => {
        router.get('profile', [controllers.Profile, 'show'])
        router.get('avatar', [controllers.Profile, 'avatar'])
        router.post('avatar', [controllers.Profile, 'updateAvatar'])
        router.delete('avatar', [controllers.Profile, 'destroyAvatar'])
        router.post('push-tokens', [PushTokensController, 'store'])
        router.post('device-sessions', [DeviceSessionsController, 'store'])
        router.delete('push-tokens', [PushTokensController, 'destroy'])
        router.post('logout', [controllers.AccessTokens, 'destroy'])
        router.post('pin', [PinController, 'setPin'])
        router.post('pin/change', [PinController, 'changePin'])
      })
      .prefix('account')
      .as('profile')
      .use(middleware.auth())

    // Self-service PIN reset — deliberately public (no middleware.auth()): identifying by email
    // is the whole point, same as a "forgot password" flow (see pin_controller.ts). Throttled
    // like signup/login since it's an unauthenticated, email-driven endpoint.
    router
      .group(() => {
        router.post('pin/reset', [PinController, 'requestReset']).use(
          middleware.throttle({
            maxRequests: 5,
            windowMinutes: 15,
            name: 'user-pin-reset-request',
          })
        )
        router.post('pin/reset/confirm', [PinController, 'confirmReset']).use(
          middleware.throttle({
            maxRequests: 10,
            windowMinutes: 15,
            name: 'user-pin-reset-confirm',
          })
        )
      })
      .prefix('account')
      .as('profile.pin_reset')

    // Notifications
    router
      .group(() => {
        router.get('', [NotificationsController, 'index'])
        router.patch(':id/read', [NotificationsController, 'markRead'])
        router.post('read-all', [NotificationsController, 'markAllRead'])
      })
      .prefix('notifications')
      .as('notifications')
      .use(middleware.auth())

    // Directory lookups — turn a code someone shared into a payee. Throttled: a 9-digit code
    // space is enumerable, and these are the only endpoints that confirm an account exists.
    router
      .group(() => {
        router
          .get('recipients', [DirectoryController, 'lookupRecipient'])
          .use(
            middleware.throttle({ maxRequests: 30, windowMinutes: 15, name: 'directory-recipient' })
          )
        router
          .get('agents', [DirectoryController, 'lookupAgent'])
          .use(middleware.throttle({ maxRequests: 30, windowMinutes: 15, name: 'directory-agent' }))
        router
          .get('agents/nearby', [DirectoryController, 'nearbyAgents'])
          .use(
            middleware.throttle({ maxRequests: 60, windowMinutes: 15, name: 'directory-nearby' })
          )
        router
          .get('merchants', [DirectoryController, 'lookupMerchant'])
          .use(
            middleware.throttle({ maxRequests: 30, windowMinutes: 15, name: 'directory-merchant' })
          )
      })
      .prefix('directory')
      .as('directory')
      .use(middleware.auth())

    // Merchant payments — a customer pays a business by its payment code or QR.
    router
      .post('merchant-payments', [MerchantPaymentsController, 'store'])
      .as('merchant_payments.store')
      .use(middleware.auth())

    // Currencies a wallet can be opened in — public reference data (no balances, no user data)
    router.get('currencies', [CurrenciesController, 'index']).as('currencies.index')
    // Public mid-market rates (no margin) — see exchange_rate_service.ts
    router.get('exchange-rates', [ExchangeRatesController, 'index']).as('exchange_rates.index')
    // Public plan catalogue for the marketing pricing page — the same active-plans list businesses
    // see once logged in, nothing account-specific. Not under `plans/`: that prefix is the admin API.
    router.get('pricing', [BusinessPlanController, 'index']).as('pricing.index')

    // Currency swaps between two of the user's own wallets — see swap_service.ts
    router
      .group(() => {
        router.post('quote', [SwapsController, 'quote'])
        router.post('', [SwapsController, 'store'])
      })
      .prefix('swaps')
      .as('swaps')
      .use(middleware.auth())

    // Wallets
    router
      .group(() => {
        router.get('', [WalletsController, 'index'])
        router.post('', [WalletsController, 'store'])
        router.get(':id', [WalletsController, 'show'])
        router.get(':id/transactions', [WalletsController, 'transactions'])
      })
      .prefix('wallets')
      .as('wallets')
      .use(middleware.auth())

    // Transactions — one movement, whichever wallet it touched. See transactions_controller.ts
    // for why this sits beside the per-wallet statement rather than inside it.
    router
      .group(() => {
        router.get(':id', [TransactionsController, 'show'])
      })
      .prefix('transactions')
      .as('transactions')
      .use(middleware.auth())

    // P2P Transfers
    router
      .group(() => {
        router.post('', [P2pTransfersController, 'create'])
        router.get(':uuid', [P2pTransfersController, 'show'])
        router.get('', [P2pTransfersController, 'index'])
      })
      .prefix('transfers/p2p')
      .as('transfers.p2p')
      .use(middleware.auth())

    // Likiliba — private rotating savings groups. See likiliba/likilibas_controller.ts. The
    // `invitations` routes are declared before `:id` so they are never read as a group id.
    router
      .group(() => {
        router.get('', [LikilibasController, 'index'])
        router.post('', [LikilibasController, 'store'])
        router.get('invitations', [LikilibasController, 'invitations'])
        router.post('invitations/accept-link', [LikilibasController, 'acceptLink'])
        router.post('invitations/:invitationId/accept', [LikilibasController, 'acceptInvitation'])
        router.post('invitations/:invitationId/decline', [LikilibasController, 'declineInvitation'])
        router.post('invitations/:invitationId/admit', [LikilibasController, 'admitInvitation'])
        router.post('invitations/:invitationId/reject', [LikilibasController, 'rejectInvitation'])
        router.delete('invitations/:invitationId', [LikilibasController, 'revokeInvitation'])
        router.get(':id', [LikilibasController, 'show'])
        router.patch(':id', [LikilibasController, 'update'])
        router.get(':id/rules', [LikilibasController, 'rules'])
        router.get(':id/history', [LikilibasController, 'history'])
        router.get(':id/penalties', [LikilibasController, 'penalties'])
        router.get(':id/me', [LikilibasController, 'mine'])
        router.get(':id/contributions', [LikilibasController, 'contributions'])
        router.get(':id/draw', [LikilibasController, 'draw'])
        router.get(':id/feed', [LikilibasController, 'feed'])
        router
          .post(':id/messages', [LikilibasController, 'sendMessage'])
          .use(middleware.throttle({ maxRequests: 30, windowMinutes: 1, name: 'likiliba-message' }))
        router.delete(':id/messages/:messageId', [LikilibasController, 'deleteMessage'])
        router.post(':id/messages/:messageId/report', [LikilibasController, 'reportMessage'])
        router.put(':id/messages/:messageId/reaction', [LikilibasController, 'reactToMessage'])
        router.post(':id/read', [LikilibasController, 'markRead'])
        router.get(':id/members/:memberId/avatar', [LikilibasController, 'memberAvatar'])
        router.patch(':id/profile', [LikilibasController, 'updateProfile'])
        router.get(':id/photo', [LikilibasController, 'photo'])
        router.post(':id/photo', [LikilibasController, 'updatePhoto'])
        router.delete(':id/photo', [LikilibasController, 'removePhoto'])
        router.post(':id/invitations', [LikilibasController, 'invite'])
        router.delete(':id/members/:memberId', [LikilibasController, 'removeMember'])
        router.post(':id/lock', [LikilibasController, 'lock'])
        router.post(':id/commit', [LikilibasController, 'commit'])
        router.post(':id/start', [LikilibasController, 'start'])
        router.post(':id/cancel', [LikilibasController, 'cancel'])
        router.post(':id/leave', [LikilibasController, 'leave'])
        router.post(':id/contributions', [LikilibasController, 'contribute'])
        router.post(':id/debts/repay', [LikilibasController, 'repay'])
        router.put(':id/mandate', [LikilibasController, 'mandate'])
      })
      .prefix('likilibas')
      .as('likilibas')
      .use(middleware.auth())

    // Cash In
    router
      .group(() => {
        router.post('', [CashInController, 'store'])
        router.post(':transaction_id/confirm', [CashInController, 'confirm'])
        router.post(':transaction_id/reject', [CashInController, 'reject'])
      })
      .prefix('cash-in')
      .as('cash_in')
      .use(middleware.auth())

    // Cash Out
    router
      .group(() => {
        router.post('', [CashOutController, 'store'])
        router.post(':transaction_id/confirm', [CashOutController, 'confirm'])
        router.post(':transaction_id/pickup', [CashOutController, 'pickup'])
        router.post(':transaction_id/cancel', [CashOutController, 'cancel'])
      })
      .prefix('cash-out')
      .as('cash_out')
      .use(middleware.auth())

    // Visuel d'une catégorie de carte — délibérément hors authentification : c'est une image de
    // catalogue, pas une donnée client, et le chargeur d'images de l'application doit pouvoir la
    // récupérer et la mettre en cache sans y joindre de jeton. Voir card_products_controller.ts.
    router.get('cards/products/:id/image', [CardProductsController, 'image'])

    // Virtual/physical cards (Payscribe) — see cards_controller.ts / card_service.ts.
    router
      .group(() => {
        router.get('', [CardsController, 'index'])
        router.post('', [CardsController, 'store'])
        // Avant ':id' : sans cela « products » serait lu comme un identifiant de carte et
        // ne trouverait jamais rien.
        router.get('products', [CardProductsController, 'catalogue'])
        router.get(':id', [CardsController, 'show'])
        router.patch(':id/topup', [CardsController, 'topup'])
        router.patch(':id/withdraw', [CardsController, 'withdraw'])
        router.patch(':id/freeze', [CardsController, 'freeze'])
        router.patch(':id/unfreeze', [CardsController, 'unfreeze'])
        router.post(':id/terminate', [CardsController, 'terminate'])
        router.get(':id/transactions', [CardsController, 'transactions'])
      })
      .prefix('cards')
      .as('cards')
      .use(middleware.auth())

    // Agent self-service KYC — the agent submits evidence for their OWN pending/active agent
    // record, so this uses the regular user guard (not the internal admin guard below), resolved
    // via AgentIdentityService.requireAgentForUser(). A pending_approval agent must be able to
    // reach this: agent_lifecycle_service.ts's approve() now requires an approved KYC to exist
    // first (see agent_kyc_controller.ts for why this route exists at all).
    router
      .group(() => {
        router.post('kyc/submit', [AgentKycController, 'submit'])
        router.get('kyc/status', [AgentKycController, 'getStatus'])
      })
      .prefix('agents')
      .as('agents.kyc')
      .use(middleware.auth())

    // Agent self-service float operations — same regular-user guard as agents.kyc above, agent
    // resolved via AgentIdentityService. float-transfer pushes float to a direct sub-agent;
    // float-convert moves the agent's own personal wallet money into their own float wallet, and
    // float-withdraw moves it back (also open to a suspended agent). See
    // agent_float_controller.ts and float_transfer_service.ts.
    router
      .group(() => {
        router.post('float-transfer', [AgentFloatController, 'transfer'])
        router.post('float-convert', [AgentFloatController, 'convert'])
        router.post('float-withdraw', [AgentFloatController, 'withdraw'])
      })
      .prefix('agents')
      .as('agents.float')
      .use(middleware.auth())

    // The signed-in agent's own workspace (same app as customers). Singular `agent/`, apart from
    // the admin `agents/` group below, so `agent/me` can never be read as `agents/:id`. Every
    // route resolves the agent from the user — see agent_workspace_controller.ts.
    router
      .group(() => {
        router.get('me', [AgentWorkspaceController, 'me'])
        router.get('operations', [AgentWorkspaceController, 'operations'])
        router.get('operations/:transaction_id', [AgentWorkspaceController, 'operation'])
        router.get('cash-outs/:transaction_id', [AgentWorkspaceController, 'cashOut'])
        router.get('sub-agents', [AgentWorkspaceController, 'subAgents'])
      })
      .prefix('agent')
      .as('agent_workspace')
      .use(middleware.auth())

    // "Become an agent" — the signed-in customer applies and follows their own application.
    // Not IP-throttled: carriers put many customers behind one address. The flood guard is the
    // one-open-application-per-user rule, enforced by a partial unique index.
    router
      .group(() => {
        router.get('mine', [AgentApplicationsController, 'mine'])
        router.get('eligibility', [AgentApplicationsController, 'eligibility'])
        router.post('', [AgentApplicationsController, 'store'])
      })
      .prefix('agent-applications')
      .as('agent_applications')
      .use(middleware.auth())

    // International transfers into the DRC — sender side. See remittances_controller.ts.
    router
      .group(() => {
        router.get('corridor', [RemittancesController, 'corridor'])
        router.post('quote', [RemittancesController, 'quote'])
        router.get('', [RemittancesController, 'index'])
        router.post('', [RemittancesController, 'store'])
        router.get(':id', [RemittancesController, 'show'])
        router.post(':id/cancel', [RemittancesController, 'cancel'])
      })
      .prefix('remittances')
      .as('remittances')
      .use(middleware.auth())

    // Paying out a transfer at the counter (active agents, resolved from the user).
    router
      .group(() => {
        router.post('lookup', [AgentRemittancesController, 'lookup'])
        router.post(':id/pay', [AgentRemittancesController, 'pay'])
      })
      .prefix('agent/remittances')
      .as('agent_remittances')
      .use(middleware.auth())

    // Agents (admin routes - protected)
    router
      .group(() => {
        router.get('', [AgentsController, 'index'])
        router.post('', [AgentsController, 'store'])
        router.get(':id', [AgentsController, 'show'])
        router.patch(':id', [AgentsController, 'update'])
        router.post(':id/approve', [AgentsController, 'approve'])
        router.post(':id/activate', [AgentsController, 'activate'])
        router.post(':id/suspend', [AgentsController, 'suspend'])
        router.post(':id/deactivate', [AgentsController, 'deactivate'])
      })
      .prefix('agents')
      .as('agents')
      .use(middleware.auth({ guards: ['internal'] }))
      .use(middleware.isInternalUser())

    // KYC Verification
    router
      .group(() => {
        router.post('submit', [KycController, 'submit']).use(middleware.auth())
        router.get('status', [KycController, 'getStatus']).use(middleware.auth())
        // Admin only endpoints
        router
          .get('', [KycController, 'index'])
          .use(middleware.auth({ guards: ['internal'] }))
          .use(middleware.isInternalUser())
        router
          .get(':kyc_id', [KycController, 'show'])
          .use(middleware.auth({ guards: ['internal'] }))
          .use(middleware.isInternalUser())
        router
          .post(':kyc_id/approve', [KycController, 'approve'])
          .use(middleware.auth({ guards: ['internal'] }))
          .use(middleware.isInternalUser())
        router
          .post(':kyc_id/reject', [KycController, 'reject'])
          .use(middleware.auth({ guards: ['internal'] }))
          .use(middleware.isInternalUser())
        router
          .get(':kyc_id/documents', [KycController, 'listDocuments'])
          .use(middleware.auth({ guards: ['internal'] }))
          .use(middleware.isInternalUser())
        router
          .get(':kyc_id/documents/:document_id', [KycController, 'getDocument'])
          .use(middleware.auth({ guards: ['internal'] }))
          .use(middleware.isInternalUser())
      })
      .prefix('kyc')
      .as('kyc')

    // Disputes
    router
      .group(() => {
        router.get('', [DisputesController, 'index']).use(middleware.auth())
        router.post('', [DisputesController, 'store']).use(middleware.auth())
        // Admin only — registered before ':id' so the literal 'all' segment isn't swallowed by it.
        router
          .get('all', [DisputesController, 'listAll'])
          .use(middleware.auth({ guards: ['internal'] }))
          .use(middleware.isInternalUser())
        router
          .get('all/:id/messages', [DisputesController, 'adminMessages'])
          .use(middleware.auth({ guards: ['internal'] }))
          .use(middleware.isInternalUser())
        router
          .post('all/:id/messages', [DisputesController, 'adminPostMessage'])
          .use(middleware.auth({ guards: ['internal'] }))
          .use(middleware.isInternalUser())
        router
          .get('all/:id', [DisputesController, 'adminShow'])
          .use(middleware.auth({ guards: ['internal'] }))
          .use(middleware.isInternalUser())
        router.get(':id', [DisputesController, 'show']).use(middleware.auth())
        // Fil de discussion et retrait : actions du réclamant sur son propre dossier.
        router.get(':id/messages', [DisputesController, 'messages']).use(middleware.auth())
        router.post(':id/messages', [DisputesController, 'postMessage']).use(middleware.auth())
        router.post(':id/withdraw', [DisputesController, 'withdraw']).use(middleware.auth())
        // Admin only: Close dispute
        router
          .post(':id/close', [DisputesController, 'close'])
          .use(middleware.auth({ guards: ['internal'] }))
          .use(middleware.isInternalUser())
      })
      .prefix('disputes')
      .as('disputes')

    // Webhooks
    router
      .group(() => {
        router.get('', [WebhooksController, 'index'])
        router.post('', [WebhooksController, 'store'])
        router.delete(':id', [WebhooksController, 'destroy'])
        router.get(':id/deliveries', [WebhooksController, 'getDeliveries'])
      })
      .prefix('webhooks')
      .as('webhooks')
      .use(middleware.auth())

    // Mobile Money — deposit into / payout from wallet via PawaPay, no agent involved
    router
      .group(() => {
        router.post('deposits', [MobileMoneyDepositsController, 'store'])
        router.get('deposits/:id', [MobileMoneyDepositsController, 'show'])
        router.get('deposits/:id/live-status', [MobileMoneyDepositsController, 'liveStatus'])
        router.post('payouts', [MobileMoneyPayoutsController, 'store'])
        router.get('payouts/:id', [MobileMoneyPayoutsController, 'show'])
        router.get('payouts/:id/live-status', [MobileMoneyPayoutsController, 'liveStatus'])
        router.get('predict-provider', [MobileMoneyToolkitController, 'predictProvider'])
        router.get('payment-methods', [MobileMoneyToolkitController, 'listPaymentMethods'])
        router.get('payment-methods/raw', [
          MobileMoneyToolkitController,
          'listAllPaymentMethodsRaw',
        ])
      })
      .prefix('mobile-money')
      .as('mobile_money')
      .use(middleware.auth())

    // Inbound PawaPay callbacks — NOT behind middleware.auth() (external caller); protected
    // instead by HTTP Message Signature verification inside the controller itself.
    router
      .group(() => {
        router.post('deposits', [MobileMoneyWebhooksController, 'handleDeposit'])
        router.post('payouts', [MobileMoneyWebhooksController, 'handlePayout'])
      })
      .prefix('webhooks/pawapay')
      .as('webhooks.pawapay')

    // Inbound Payscribe card webhooks — NOT behind middleware.auth() (external caller); protected
    // instead by HMAC signature verification inside the controller itself.
    router
      .post('webhooks/payscribe/cards', [CardWebhooksController, 'handle'])
      .as('webhooks.payscribe.cards')

    // Crypto & Stablecoins (Alchemy Web3)
    router
      .group(() => {
        router.get('deposits/options', [CryptoDepositsController, 'options'])
        router.post('deposits/address', [CryptoDepositsController, 'address'])
        router.get('deposits', [CryptoDepositsController, 'index'])
        router.post('payouts', [CryptoPayoutsController, 'store'])
        router.get('payouts/:id', [CryptoPayoutsController, 'show'])
      })
      .prefix('crypto')
      .as('crypto')
      .use(middleware.auth())

    // Inbound Alchemy Webhooks — external caller protected by HMAC signature verification
    router.post('webhooks/alchemy', [CryptoWebhooksController, 'alchemy']).as('webhooks.alchemy')

    // Counter operations, for the staff of a partner institution. Authenticated as an ordinary
    // user, then resolved to an institution through their posting — the third door onto
    // ctx.business, see business_staff_middleware.ts.
    router
      .group(() => {
        router.get('sessions', [CounterSessionsController, 'index'])
        router.get('sessions/current', [CounterSessionsController, 'current'])
        router.post('sessions', [CounterSessionsController, 'store'])
        router.post('sessions/:id/close', [CounterSessionsController, 'close'])
        router.post('sessions/:id/reconcile', [CounterSessionsController, 'reconcile'])
        // Cash over the window. The counter comes from the teller's posting, and the customer
        // from the 9-digit code they share — never from a wallet id the caller could guess.
        router.post('cash-in', [CounterCashController, 'cashIn'])
        router.post('cash-in/:transaction_id/confirm', [CounterCashController, 'confirmCashIn'])
        router.post('cash-in/:transaction_id/reject', [CounterCashController, 'rejectCashIn'])
        router.post('cash-out', [CounterCashController, 'cashOut'])
        router.post('cash-out/:transaction_id/confirm', [CounterCashController, 'confirmCashOut'])
        router.post('cash-out/:transaction_id/cancel', [CounterCashController, 'cancelCashOut'])
        // Operations of the open shift still awaiting their second act (confirm / reject / cancel).
        router.get('cash/pending', [CounterCashController, 'pending'])
        // The institution's journal: cash at its counters, savings and loan movements.
        router.get('transactions', [CounterJournalController, 'index'])
        // Enrolment. Throttled like the directory lookups it resembles: exact-match on a 9-digit
        // code is enumerable given enough requests, whoever is asking.
        router
          .get('customers', [CounterCustomersController, 'show'])
          .use(middleware.throttle({ maxRequests: 60, windowMinutes: 15, name: 'counter-lookup' }))
        router.post('customers', [CounterCustomersController, 'store'])
        // Savings across the window. No notes move, so nothing here books to a shift and no
        // open drawer is required — booking them would move a shift's expected cash while the
        // drawer stood still.
        router.get('savings', [CounterSavingsController, 'index'])
        router.post('savings', [CounterSavingsController, 'store'])
        router.post('savings/:id/deposit', [CounterSavingsController, 'deposit'])
        router.post('savings/:id/withdraw', [CounterSavingsController, 'withdraw'])
        // The institution's loan book. Approval, refusal and disbursement are separate acts:
        // saying yes and handing over the money are different decisions, often on different days.
        router.get('loans', [CounterLoansController, 'index'])
        router.get('loans/:id', [CounterLoansController, 'show'])
        router.post('loans/:id/approve', [CounterLoansController, 'approve'])
        router.post('loans/:id/reject', [CounterLoansController, 'reject'])
        router.post('loans/:id/disburse', [CounterLoansController, 'disburse'])
        // IMF committee circuit — multi-person credit approval (P1)
        router.post('loans/:id/submit', [CounterLoansCommitteeController, 'submit'])
        router.post('loans/:id/committee-approve', [
          CounterLoansCommitteeController,
          'committeeApprove',
        ])
        router.post('loans/:id/committee-reject', [
          CounterLoansCommitteeController,
          'committeeReject',
        ])
        // Loan officer portfolio assignment (P2)
        router.post('loans/:id/assign', [CounterLoanOfficersController, 'assignLoan'])
        router.post('borrowers/assign', [CounterLoanOfficersController, 'assignBorrower'])
        router.get('staff/:id/portfolio', [CounterLoanOfficersController, 'portfolio'])
        // Solidarity lending groups (P2)
        router.get('groups', [CounterGroupsController, 'index'])
        router.post('groups', [CounterGroupsController, 'store'])
        router.get('groups/:id', [CounterGroupsController, 'show'])
        router.get('groups/:id/summary', [CounterGroupsController, 'summary'])
        router.post('groups/:id/members', [CounterGroupsController, 'addMember'])
        router.delete('groups/:id/members/:userId', [CounterGroupsController, 'removeMember'])
        // IMF Debt Restructuring (P3)
        router.post('loans/:id/restructure', [CounterLoansRestructureController, 'restructure'])
        router.get('loans/:id/restructurings', [CounterLoansRestructureController, 'history'])
        // IMF Default & Collateral Seizure (P3)
        router.post('loans/:id/default', [CounterLoansDefaultController, 'markDefault'])
        router.post('loans/:id/seize-collateral', [
          CounterLoansDefaultController,
          'seizeCollateral',
        ])
        // IMF Penalty Execution (P3)
        router.post('penalties/run', [CounterPenaltiesController, 'run'])
        // IMF Vault & Cash Management (Étape A)
        router.get('vaults', [CounterVaultController, 'index'])
        router.post('vaults/replenish', [CounterVaultController, 'replenish'])
        router.post('vaults/sweep', [CounterVaultController, 'sweep'])
        router.get('vaults/transfers', [CounterVaultController, 'transfers'])
        router.post('vaults/transfers/:id/approve', [CounterVaultController, 'approve'])
        router.post('vaults/transfers/:id/reject', [CounterVaultController, 'reject'])
      })
      .prefix('counter')
      .as('counter')
      .use(middleware.auth())
      .use(middleware.businessStaff())

    // Who the signed-in person is at their institution: role, counter posting, institution. The
    // staff application cannot decide what to show without it — see counter/me_controller.ts.
    router
      .get('business/staff/me', [CounterMeController, 'show'])
      .as('business.staff.me')
      .use(middleware.auth())
      .use(middleware.businessStaff())

    // Published offers of partner institutions. Public like the plan catalogue: these are
    // advertised terms, nothing here is personalised and nothing commits anyone.
    router
      .get('finance/products', [LendingCatalogueController, 'index'])
      .as('finance.products.index')
    router
      .get('finance/products/:id', [LendingCatalogueController, 'showProduct'])
      .where('id', router.matchers.number())
      .as('finance.products.show')
    router
      .get('finance/institutions', [LendingCatalogueController, 'institutions'])
      .as('finance.institutions.index')
    router
      .get('finance/institutions/:id', [LendingCatalogueController, 'showInstitution'])
      .where('id', router.matchers.number())
      .as('finance.institutions.show')
    // Logos are public like the offers they sit next to — see business_logo_controller.ts.
    router
      .get('finance/institutions/:id/logo', [BusinessLogoController, 'show'])
      .where('id', router.matchers.number())
      .as('finance.institutions.logo')

    // Someone's own savings with a partner institution. Behind middleware.auth(): these move money
    // between two wallets the SAME person owns, so the account holder is the only caller there is.
    router
      .group(() => {
        router.get('savings', [SavingsAccountsController, 'index'])
        router.post('savings', [SavingsAccountsController, 'store'])
        router.get('savings/:id', [SavingsAccountsController, 'show'])
        router.post('savings/:id/deposit', [SavingsAccountsController, 'deposit'])
        router.post('savings/:id/withdraw', [SavingsAccountsController, 'withdraw'])
        router.post('savings/:id/close', [SavingsAccountsController, 'close'])
        router.get('loans', [BorrowerLoansController, 'index'])
        router.post('loans', [BorrowerLoansController, 'store'])
        router.get('loans/:id', [BorrowerLoansController, 'show'])
        router.post('loans/:id/repay', [BorrowerLoansController, 'repay'])
      })
      .prefix('finance')
      .as('finance.savings')
      .use(middleware.auth())

    // Businesses (admin routes — internal_user only, mirrors /agents)
    router
      .group(() => {
        router.get('', [BusinessesController, 'index'])
        router.post('', [BusinessesController, 'store'])
        router.get(':id', [BusinessesController, 'show'])
        router.post(':id/approve', [BusinessesController, 'approve'])
        router.post(':id/activate', [BusinessesController, 'activate'])
        router.post(':id/suspend', [BusinessesController, 'suspend'])
        router.post(':id/deactivate', [BusinessesController, 'deactivate'])
        router.post(':id/api-keys', [BusinessesController, 'issueApiKey'])
        router.delete(':id/api-keys/:keyId', [BusinessesController, 'revokeApiKey'])
        router.post(':id/logo', [BusinessLogoController, 'adminUpload'])
        router.delete(':id/logo', [BusinessLogoController, 'adminRemove'])
        router.post(':id/plan', [BusinessesController, 'assignPlan'])
      })
      .prefix('businesses')
      .as('businesses')
      .use(middleware.auth({ guards: ['internal'] }))
      .use(middleware.isInternalUser())

    // Institution staff (admin routes — internal_user only). Adding staff grants someone the
    // ability to act for an institution, so it stays with TumaPlus staff until an institution's
    // own admin role is enforced on routes — see admin/business_staff_controller.ts.
    router
      .group(() => {
        router.get('', [AdminBusinessStaffController, 'index'])
        router.post('', [AdminBusinessStaffController, 'store'])
        router.get(':id', [AdminBusinessStaffController, 'show'])
        router.patch(':id', [AdminBusinessStaffController, 'update'])
      })
      .prefix('admin/business-staff')
      .as('admin.business_staff')
      .use(middleware.auth({ guards: ['internal'] }))
      .use(middleware.isInternalUser())

    // Compliance oversight of international transfers and the screening watchlist.
    router
      .group(() => {
        router.get('remittances', [AdminRemittancesController, 'index'])
        router.get('remittances/:id', [AdminRemittancesController, 'show'])
        router.post('remittances/:id/release', [AdminRemittancesController, 'release'])
        router.post('remittances/:id/reject', [AdminRemittancesController, 'reject'])
        router.get('watchlist', [AdminRemittancesController, 'watchlist'])
        router.post('watchlist', [AdminRemittancesController, 'addToWatchlist'])
        router.delete('watchlist/:id', [AdminRemittancesController, 'removeFromWatchlist'])
      })
      .prefix('admin')
      .as('admin.remittances')
      .use(middleware.auth({ guards: ['internal'] }))
      .use(middleware.isInternalUser())

    // Review queue for "become an agent" applications (internal_user only). Approval creates the
    // agent in pending_approval — see admin/agent_applications_controller.ts.
    router
      .group(() => {
        router.get('', [AdminAgentApplicationsController, 'index'])
        router.get(':id', [AdminAgentApplicationsController, 'show'])
        router.post(':id/review', [AdminAgentApplicationsController, 'review'])
        router.post(':id/approve', [AdminAgentApplicationsController, 'approve'])
        router.post(':id/reject', [AdminAgentApplicationsController, 'reject'])
      })
      .prefix('admin/agent-applications')
      .as('admin.agent_applications')
      .use(middleware.auth({ guards: ['internal'] }))
      .use(middleware.isInternalUser())

    // Review of what partner institutions want to sell (admin routes — internal_user only).
    // An approval here puts a rate in front of borrowers inside our own app, under our name —
    // see admin/financial_products_controller.ts.
    router
      .group(() => {
        router.get('', [AdminFinancialProductsController, 'index'])
        router.get(':id', [AdminFinancialProductsController, 'show'])
        router.post(':id/approve', [AdminFinancialProductsController, 'approve'])
        router.post(':id/reject', [AdminFinancialProductsController, 'reject'])
        router.post(':id/archive', [AdminFinancialProductsController, 'archive'])
      })
      .prefix('admin/financial-products')
      .as('admin.financial_products')
      .use(middleware.auth({ guards: ['internal'] }))
      .use(middleware.isInternalUser())

    // TumaPlus oversight of what institutions lend and hold (admin routes — internal_user only).
    // Read-only by design: whether a borrower gets credit is the institution's decision, taken by
    // its own credit officer. See admin/lending_controller.ts.
    router
      .group(() => {
        router.get('loans', [AdminLendingController, 'loans'])
        router.get('loans/:id', [AdminLendingController, 'loan'])
        router.get('savings', [AdminLendingController, 'savings'])
        router.get('institutions/:id/position', [AdminLendingController, 'position'])
      })
      .prefix('admin')
      .as('admin.lending')
      .use(middleware.auth({ guards: ['internal'] }))
      .use(middleware.isInternalUser())

    // Likiliba oversight (admin routes — internal_user only). Support can suspend, resume and
    // waive a penalty still owed; it never moves a group's money. See admin/likilibas_controller.ts.
    router
      .group(() => {
        router.get('', [AdminLikilibasController, 'index'])
        router.post('penalties/:penaltyId/waive', [AdminLikilibasController, 'waivePenalty'])
        router.post('messages/:messageId/hide', [AdminLikilibasController, 'hideMessage'])
        router.get(':id/messages', [AdminLikilibasController, 'messages'])
        router.get(':id', [AdminLikilibasController, 'show'])
        router.get(':id/history', [AdminLikilibasController, 'history'])
        router.get(':id/penalties', [AdminLikilibasController, 'penalties'])
        router.post(':id/suspend', [AdminLikilibasController, 'suspend'])
        router.post(':id/resume', [AdminLikilibasController, 'resume'])
      })
      .prefix('admin/likilibas')
      .as('admin.likilibas')
      .use(middleware.auth({ guards: ['internal'] }))
      .use(middleware.isInternalUser())

    // Card products (admin routes — internal_user only) — the priced catalogue cards are sold
    // from, see card_product_service.ts. The customer-facing view is GET /cards/products.
    router
      .group(() => {
        router.get('', [CardProductsController, 'index'])
        router.post('', [CardProductsController, 'store'])
        router.get(':id', [CardProductsController, 'show'])
        router.patch(':id', [CardProductsController, 'update'])
        router.post(':id/archive', [CardProductsController, 'archive'])
        router.delete(':id/image', [CardProductsController, 'destroyImage'])
      })
      .prefix('card-products')
      .as('card_products')
      .use(middleware.auth({ guards: ['internal'] }))
      .use(middleware.isInternalUser())

    // Plans (admin routes — internal_user only) — pricing tiers that gate business API access,
    // see business_plan_middleware.ts.
    router
      .group(() => {
        router.get('', [PlansController, 'index'])
        router.post('', [PlansController, 'store'])
        router.get(':id', [PlansController, 'show'])
        router.patch(':id', [PlansController, 'update'])
        router.post(':id/archive', [PlansController, 'archive'])
      })
      .prefix('plans')
      .as('plans')
      .use(middleware.auth({ guards: ['internal'] }))
      .use(middleware.isInternalUser())

    // Users (admin visibility + wallet freeze controls — see user_admin_service.ts for why
    // this is scoped to wallets rather than an account-level status: User has none).
    router
      .group(() => {
        router.get('', [UsersController, 'index'])
        router.get(':id', [UsersController, 'show'])
        router.post(':id/pin/reset', [UsersController, 'resetPin'])
        router.post(':id/wallets/:walletId/freeze', [UsersController, 'freezeWallet'])
        router.post(':id/wallets/:walletId/unfreeze', [UsersController, 'unfreezeWallet'])
      })
      .prefix('users')
      .as('users')
      .use(middleware.auth({ guards: ['internal'] }))
      .use(middleware.isInternalUser())

    // Internal staff (admin) account management — see internal_user_service.ts for why this
    // exists: previously the only way to create/manage a staff account was direct DB access.
    router
      .group(() => {
        router.get('', [InternalUsersController, 'index'])
        router.post('', [InternalUsersController, 'store'])
        router.get(':id', [InternalUsersController, 'show'])
        router.post(':id/activate', [InternalUsersController, 'activate'])
        router.post(':id/suspend', [InternalUsersController, 'suspend'])
        router.post(':id/deactivate', [InternalUsersController, 'deactivate'])
        router.post(':id/reset-password', [InternalUsersController, 'resetPassword'])
        router.post(':id/reset-mfa', [InternalUsersController, 'resetMfa'])
      })
      .prefix('internal-users')
      .as('internal_users')
      .use(middleware.auth({ guards: ['internal'] }))
      .use(middleware.isInternalUser())

    // Admin — platform-wide visibility that no other admin endpoint provides: every
    // transaction (not just one business's), the audit trail, cards across all owners, and the
    // internal chart of accounts. Paginated (transactions, audit-logs) or not (cards, small
    // ledger-accounts list) per resource — see each controller's own doc comment for why.
    router
      .group(() => {
        router.get('transactions', [AdminTransactionsController, 'index'])
        router.get('transactions/:id', [AdminTransactionsController, 'show'])

        router.get('audit-logs', [AdminAuditLogsController, 'index'])
        router.get('audit-logs/:id', [AdminAuditLogsController, 'show'])

        router.get('cards', [AdminCardsController, 'index'])
        router.post('cards', [AdminCardsController, 'store'])
        router.get('cards/:id', [AdminCardsController, 'show'])
        router.get('cards/:id/transactions', [AdminCardsController, 'transactions'])
        router.post('cards/:id/topup', [AdminCardsController, 'topup'])
        router.post('cards/:id/freeze', [AdminCardsController, 'freeze'])
        router.post('cards/:id/unfreeze', [AdminCardsController, 'unfreeze'])
        router.post('cards/:id/terminate', [AdminCardsController, 'terminate'])

        router.get('ledger-accounts', [AdminLedgerAccountsController, 'index'])
        router.get('ledger-accounts/:id', [AdminLedgerAccountsController, 'show'])

        router.get('currencies', [CurrenciesController, 'adminIndex'])
        router.get('currencies/:id', [CurrenciesController, 'adminShow'])
        router.patch('currencies/:id', [CurrenciesController, 'adminUpdate'])

        router.get('exchange-rates', [ExchangeRatesController, 'adminIndex'])
        router.post('exchange-rates/refresh', [ExchangeRatesController, 'adminRefresh'])
        router.get('exchange-rates/:id', [ExchangeRatesController, 'adminShow'])
        router.patch('exchange-rates/:id', [ExchangeRatesController, 'adminUpdate'])

        router.get('accounting/balance-sheet', [AdminAccountingController, 'balanceSheet'])
        router.get('accounting/revenue', [AdminAccountingController, 'revenue'])
        router.post('accounting/reconcile', [AdminAccountingController, 'reconcile'])
      })
      .prefix('admin')
      .as('admin')
      .use(middleware.auth({ guards: ['internal'] }))
      .use(middleware.isInternalUser())

    // Business API — server-to-server, authenticated by API key (NOT middleware.auth()).
    // No PIN: the API key itself is the sole credential (see business_api_key_middleware.ts).
    router
      .group(() => {
        // An institution's own catalogue. Gated on the plan feature rather than on
        // businesses.kind: what an institution may sell is the plan's job, never the label —
        // see app/models/plan.ts and business_plan_middleware.ts.
        router
          .get('products', [LendingProductsController, 'index'])
          .use(middleware.businessPlan('lending.credit'))
        router
          .post('products', [LendingProductsController, 'store'])
          .use(middleware.businessPlan('lending.credit'))
        router
          .get('products/:id', [LendingProductsController, 'show'])
          .use(middleware.businessPlan('lending.credit'))
        router
          .patch('products/:id', [LendingProductsController, 'update'])
          .use(middleware.businessPlan('lending.credit'))
        router
          .post('products/:id/submit', [LendingProductsController, 'submit'])
          .use(middleware.businessPlan('lending.credit'))
        router
          .post('products/:id/archive', [LendingProductsController, 'archive'])
          .use(middleware.businessPlan('lending.credit'))
        router
          .post('mobile-money/deposits', [BusinessDepositsController, 'store'])
          .use(middleware.businessPlan('mobile_money.deposits'))
        router
          .get('mobile-money/deposits/:id', [BusinessDepositsController, 'show'])
          .use(middleware.businessPlan('mobile_money.deposits'))
        router
          .get('mobile-money/deposits/:id/live-status', [BusinessDepositsController, 'liveStatus'])
          .use(middleware.businessPlan('mobile_money.deposits'))
        router
          .post('mobile-money/payouts', [BusinessPayoutsController, 'store'])
          .use(middleware.businessPlan('mobile_money.payouts'))
        router
          .get('mobile-money/payouts/:id', [BusinessPayoutsController, 'show'])
          .use(middleware.businessPlan('mobile_money.payouts'))
        router
          .get('mobile-money/payouts/:id/live-status', [BusinessPayoutsController, 'liveStatus'])
          .use(middleware.businessPlan('mobile_money.payouts'))
        router.post('crypto/deposits/address', [BusinessCryptoController, 'address'])
        router.post('crypto/payouts', [BusinessCryptoController, 'payout'])
        router
          .post('wallet', [BusinessWalletController, 'store'])
          .use(middleware.businessPlan('wallet.multi_currency'))
        router.get('wallet', [BusinessWalletController, 'index'])
        router.get('wallet/:currency', [BusinessWalletController, 'show'])
        router
          .post('swaps/quote', [BusinessSwapsController, 'quote'])
          .use(middleware.businessPlan('wallet.multi_currency'))
        router
          .post('swaps', [BusinessSwapsController, 'store'])
          .use(middleware.businessPlan('wallet.multi_currency'))
        router.get('transactions', [BusinessTransactionsController, 'index'])
        router.get('merchant-payments', [BusinessMerchantPaymentsController, 'index'])
        router
          .get('webhooks', [BusinessWebhooksController, 'index'])
          .use(middleware.businessPlan('webhooks'))
        router
          .post('webhooks', [BusinessWebhooksController, 'store'])
          .use(middleware.businessPlan('webhooks'))
        router
          .delete('webhooks/:id', [BusinessWebhooksController, 'destroy'])
          .use(middleware.businessPlan('webhooks'))
        router
          .get('webhooks/:id/deliveries', [BusinessWebhooksController, 'getDeliveries'])
          .use(middleware.businessPlan('webhooks'))
        router
          .get('mobile-money/payment-methods', [BusinessToolkitController, 'listPaymentMethods'])
          .use(middleware.businessPlan('mobile_money.toolkit'))
        router
          .get('mobile-money/payment-methods/raw', [
            BusinessToolkitController,
            'listAllPaymentMethodsRaw',
          ])
          .use(middleware.businessPlan('mobile_money.toolkit'))
        router.get('plans', [BusinessPlanController, 'index'])
        router.get('plan', [BusinessPlanController, 'current'])
        router.post('plan/subscribe', [BusinessPlanController, 'subscribe'])
        router
          .post('sandbox/fund', [BusinessSandboxController, 'fund'])
          .use(middleware.sandboxOnly())
        router
          .get('cards', [BusinessCardsController, 'index'])
          .use(middleware.businessPlan('cards.issuing'))
        router
          .post('cards', [BusinessCardsController, 'store'])
          .use(middleware.businessPlan('cards.issuing'))
        router
          .get('cards/:id', [BusinessCardsController, 'show'])
          .use(middleware.businessPlan('cards.issuing'))
        router
          .patch('cards/:id/topup', [BusinessCardsController, 'topup'])
          .use(middleware.businessPlan('cards.issuing'))
        router
          .patch('cards/:id/withdraw', [BusinessCardsController, 'withdraw'])
          .use(middleware.businessPlan('cards.issuing'))
        router
          .patch('cards/:id/freeze', [BusinessCardsController, 'freeze'])
          .use(middleware.businessPlan('cards.issuing'))
        router
          .patch('cards/:id/unfreeze', [BusinessCardsController, 'unfreeze'])
          .use(middleware.businessPlan('cards.issuing'))
        router
          .post('cards/:id/terminate', [BusinessCardsController, 'terminate'])
          .use(middleware.businessPlan('cards.issuing'))
        router
          .get('cards/:id/transactions', [BusinessCardsController, 'transactions'])
          .use(middleware.businessPlan('cards.issuing'))
      })
      .prefix('business')
      .as('business')
      .use(middleware.businessApiKey())

    // Internal staff login — required to obtain any 'internal' guard token at all (previously
    // missing entirely; see is_internal_user.ts / routes above using guards: ['internal']).
    router
      .group(() => {
        router
          .post('login', [InternalAuthController, 'login'])
          .use(middleware.throttle({ maxRequests: 5, windowMinutes: 3, name: 'internal-login' }))
        router
          .post('logout', [InternalAuthController, 'logout'])
          .use(middleware.auth({ guards: ['internal'] }))
        router
          .post('change-password', [InternalAuthController, 'changePassword'])
          .use(middleware.auth({ guards: ['internal'] }))
        // TOTP two-factor authentication — verify completes a pending sign-in, setup/enable enrol
        // a new authenticator (see internal_auth_controller.ts).
        router
          .post('mfa/verify', [InternalAuthController, 'verifyMfa'])
          .use(
            middleware.throttle({ maxRequests: 10, windowMinutes: 15, name: 'internal-mfa-verify' })
          )
          .use(middleware.auth({ guards: ['internal'] }))
        router
          .post('mfa/setup', [InternalAuthController, 'setupMfa'])
          .use(middleware.auth({ guards: ['internal'] }))
        router
          .post('mfa/enable', [InternalAuthController, 'enableMfa'])
          .use(
            middleware.throttle({ maxRequests: 10, windowMinutes: 15, name: 'internal-mfa-enable' })
          )
          .use(middleware.auth({ guards: ['internal'] }))
        // Cheap session check for the admin panel's checkAuth() — the access token now lives in
        // an httpOnly cookie the frontend can't read (see auth_cookie_service.ts).
        router
          .get('me', [InternalAuthController, 'me'])
          .use(middleware.auth({ guards: ['internal'] }))
      })
      .prefix('internal/auth')
      .as('internal.auth')

    // Business dashboard — human login (email+password), distinct from the API key used for
    // server-to-server calls (businessApiKey group above).
    router
      .group(() => {
        router
          .post('signup/request-otp', [BusinessDashboardAuthController, 'requestSignupOtp'])
          .use(
            middleware.throttle({
              maxRequests: 5,
              windowMinutes: 15,
              name: 'business-signup-otp-request',
            })
          )
        router
          .post('signup', [BusinessDashboardAuthController, 'signup'])
          .use(middleware.throttle({ maxRequests: 10, windowMinutes: 15, name: 'business-signup' }))
        router
          .post('login', [BusinessDashboardAuthController, 'login'])
          .use(middleware.throttle({ maxRequests: 10, windowMinutes: 15, name: 'business-login' }))
        router
          .post('refresh', [BusinessDashboardAuthController, 'refresh'])
          .use(middleware.auth({ guards: ['businessDashboard'] }))
          .use(middleware.businessDashboard())
        router
          .post('logout', [BusinessDashboardAuthController, 'logout'])
          .use(middleware.auth({ guards: ['businessDashboard'] }))
          .use(middleware.businessDashboard())
        router
          .post('change-password', [BusinessDashboardAuthController, 'changePassword'])
          .use(middleware.auth({ guards: ['businessDashboard'] }))
          .use(middleware.businessDashboard())
      })
      .prefix('business/auth')
      .as('business.auth')

    // Business dashboard — everything below requires a dashboard session (not an API key).
    // deposits/payouts/wallet/transactions/webhooks reuse the EXACT SAME controllers as the
    // businessApiKey group above — business_dashboard_middleware.ts adapts ctx.business the
    // same way business_api_key_middleware.ts does, so no logic is duplicated.
    //
    // Split in two: onboarding actions (profile, PIN, KYC, notifications) work as soon as
    // there's a valid session, even while status is still pending_approval — a business needs
    // to be able to log in to submit its KYC in the first place (see auth_controller.ts).
    // Anything that moves money or issues credentials additionally requires businessActive().
    //
    // Plan/pricing routes are deliberately here too, NOT in the businessActive()-gated group
    // below — pricing/subscription is independent of KYC status by design: a pending_approval
    // business can browse plans, see its current one, and pay the one-time subscribe fee before
    // its KYC is ever reviewed. Only the actual money-moving features a plan gates (deposits,
    // payouts, webhooks, ...) stay behind businessActive().
    router
      .group(() => {
        router.get('profile', [BusinessDashboardProfileController, 'show'])
        router.patch('profile', [BusinessDashboardProfileController, 'update'])
        router.post('profile/logo', [BusinessLogoController, 'dashboardUpload'])
        router.delete('profile/logo', [BusinessLogoController, 'dashboardRemove'])
        router.post('pin', [BusinessPinController, 'setPin'])
        router.post('pin/change', [BusinessPinController, 'changePin'])
        router.post('kyc/submit', [BusinessKycController, 'submit'])
        router.get('kyc/status', [BusinessKycController, 'getStatus'])
        router.get('notifications', [BusinessNotificationsController, 'index'])
        router.patch('notifications/:id/read', [BusinessNotificationsController, 'markRead'])
        router.post('notifications/read-all', [BusinessNotificationsController, 'markAllRead'])
        router.get('plans', [BusinessPlanController, 'index'])
        router.get('plan', [BusinessPlanController, 'current'])
        router.post('plan/subscribe', [BusinessPlanController, 'subscribe'])
      })
      .prefix('business/dashboard')
      .as('business.dashboard.onboarding')
      .use(middleware.auth({ guards: ['businessDashboard'] }))
      .use(middleware.businessDashboard())

    // Self-service PIN reset — deliberately public (no session/API-key guard): identifying by
    // email is the whole point, same reasoning as the User equivalent above.
    router
      .group(() => {
        router.post('pin/reset', [BusinessPinController, 'requestReset']).use(
          middleware.throttle({
            maxRequests: 5,
            windowMinutes: 15,
            name: 'business-pin-reset-request',
          })
        )
        router.post('pin/reset/confirm', [BusinessPinController, 'confirmReset']).use(
          middleware.throttle({
            maxRequests: 10,
            windowMinutes: 15,
            name: 'business-pin-reset-confirm',
          })
        )
      })
      .prefix('business/dashboard')
      .as('business.dashboard.pin_reset')

    router
      .group(() => {
        router
          .post('mobile-money/deposits', [BusinessDepositsController, 'store'])
          .use(middleware.businessPlan('mobile_money.deposits'))
        router
          .get('mobile-money/deposits/:id', [BusinessDepositsController, 'show'])
          .use(middleware.businessPlan('mobile_money.deposits'))
        router
          .get('mobile-money/deposits/:id/live-status', [BusinessDepositsController, 'liveStatus'])
          .use(middleware.businessPlan('mobile_money.deposits'))
        router
          .post('mobile-money/payouts', [BusinessPayoutsController, 'store'])
          .use(middleware.businessPlan('mobile_money.payouts'))
        router
          .get('mobile-money/payouts/:id', [BusinessPayoutsController, 'show'])
          .use(middleware.businessPlan('mobile_money.payouts'))
        router
          .get('mobile-money/payouts/:id/live-status', [BusinessPayoutsController, 'liveStatus'])
          .use(middleware.businessPlan('mobile_money.payouts'))
        router.post('crypto/deposits/address', [BusinessCryptoController, 'address'])
        router.post('crypto/payouts', [BusinessCryptoController, 'payout'])
        router
          .post('wallet', [BusinessWalletController, 'store'])
          .use(middleware.businessPlan('wallet.multi_currency'))
        router.get('wallet', [BusinessWalletController, 'index'])
        router.get('wallet/:currency', [BusinessWalletController, 'show'])
        router
          .post('swaps/quote', [BusinessSwapsController, 'quote'])
          .use(middleware.businessPlan('wallet.multi_currency'))
        router
          .post('swaps', [BusinessSwapsController, 'store'])
          .use(middleware.businessPlan('wallet.multi_currency'))
        router.get('transactions', [BusinessTransactionsController, 'index'])
        router.get('merchant-payments', [BusinessMerchantPaymentsController, 'index'])
        router
          .get('webhooks', [BusinessWebhooksController, 'index'])
          .use(middleware.businessPlan('webhooks'))
        router
          .post('webhooks', [BusinessWebhooksController, 'store'])
          .use(middleware.businessPlan('webhooks'))
        router
          .delete('webhooks/:id', [BusinessWebhooksController, 'destroy'])
          .use(middleware.businessPlan('webhooks'))
        router
          .get('webhooks/:id/deliveries', [BusinessWebhooksController, 'getDeliveries'])
          .use(middleware.businessPlan('webhooks'))
        router
          .get('mobile-money/payment-methods', [BusinessToolkitController, 'listPaymentMethods'])
          .use(middleware.businessPlan('mobile_money.toolkit'))
        router
          .get('mobile-money/payment-methods/raw', [
            BusinessToolkitController,
            'listAllPaymentMethodsRaw',
          ])
          .use(middleware.businessPlan('mobile_money.toolkit'))
        router.get('overview', [BusinessOverviewController, 'show'])
        router
          .post('sandbox/fund', [BusinessSandboxController, 'fund'])
          .use(middleware.sandboxOnly())
        router.get('api-keys', [BusinessDashboardApiKeysController, 'index'])
        router.post('api-keys', [BusinessDashboardApiKeysController, 'store'])
        router.delete('api-keys/:id', [BusinessDashboardApiKeysController, 'destroy'])
        router
          .get('cards', [BusinessCardsController, 'index'])
          .use(middleware.businessPlan('cards.issuing'))
        router
          .post('cards', [BusinessCardsController, 'store'])
          .use(middleware.businessPlan('cards.issuing'))
        router
          .get('cards/:id', [BusinessCardsController, 'show'])
          .use(middleware.businessPlan('cards.issuing'))
        router
          .patch('cards/:id/topup', [BusinessCardsController, 'topup'])
          .use(middleware.businessPlan('cards.issuing'))
        router
          .patch('cards/:id/withdraw', [BusinessCardsController, 'withdraw'])
          .use(middleware.businessPlan('cards.issuing'))
        router
          .patch('cards/:id/freeze', [BusinessCardsController, 'freeze'])
          .use(middleware.businessPlan('cards.issuing'))
        router
          .patch('cards/:id/unfreeze', [BusinessCardsController, 'unfreeze'])
          .use(middleware.businessPlan('cards.issuing'))
        router
          .post('cards/:id/terminate', [BusinessCardsController, 'terminate'])
          .use(middleware.businessPlan('cards.issuing'))
        router
          .get('cards/:id/transactions', [BusinessCardsController, 'transactions'])
          .use(middleware.businessPlan('cards.issuing'))
        // Same controller as the API-key group above — most institutions have no system to call
        // an API with and will manage their catalogue from the dashboard, so both paths serve it.
        router
          .get('products', [LendingProductsController, 'index'])
          .use(middleware.businessPlan('lending.credit'))
        router
          .post('products', [LendingProductsController, 'store'])
          .use(middleware.businessPlan('lending.credit'))
        router
          .get('products/:id', [LendingProductsController, 'show'])
          .use(middleware.businessPlan('lending.credit'))
        router
          .patch('products/:id', [LendingProductsController, 'update'])
          .use(middleware.businessPlan('lending.credit'))
        router
          .post('products/:id/submit', [LendingProductsController, 'submit'])
          .use(middleware.businessPlan('lending.credit'))
        router
          .post('products/:id/archive', [LendingProductsController, 'archive'])
          .use(middleware.businessPlan('lending.credit'))

        // The institution running its own network: its counters (agents it owns — not TumaPlus
        // network agents), the people it posts to them, and what happens at its windows.
        router.get('outlets', [BusinessDashboardOutletsController, 'index'])
        router.post('outlets', [BusinessDashboardOutletsController, 'store'])
        router.get('outlets/:id', [BusinessDashboardOutletsController, 'show'])
        router.patch('outlets/:id', [BusinessDashboardOutletsController, 'update'])
        router.post('outlets/:id/suspend', [BusinessDashboardOutletsController, 'suspend'])
        router.post('outlets/:id/reactivate', [BusinessDashboardOutletsController, 'reactivate'])
        router.get('staff', [BusinessDashboardStaffController, 'index'])
        router.post('staff', [BusinessDashboardStaffController, 'store'])
        router.patch('staff/:id', [BusinessDashboardStaffController, 'update'])
        router.get('teller-sessions', [BusinessDashboardActivityController, 'sessions'])
        // Its book, read by management. Deciding stays with named staff on counter/loans.
        router.get('loans', [BusinessDashboardPortfolioController, 'loans'])
        router.get('loans/:id', [BusinessDashboardPortfolioController, 'loan'])
        router.get('savings', [BusinessDashboardPortfolioController, 'savings'])
        router.get('customers', [BusinessDashboardPortfolioController, 'customers'])
        // Same journal as counter/transactions, read by management. Not `transactions`: that path
        // is the mobile-money history shared with the API-key group.
        router.get('journal', [CounterJournalController, 'index'])
        // IMF Regulatory, Provisioning & Portfolio Quality Reporting (P4)
        router.get('imf/regulatory-report', [BusinessDashboardImfController, 'regulatoryReport'])
        router.get('imf/provisioning', [BusinessDashboardImfController, 'provisioning'])
        router.get('imf/arrears', [BusinessDashboardImfController, 'arrears'])
        // IMF Legacy / Paper / Excel Migration Tool (Étape B)
        router.post('imf/migration/validate', [BusinessDashboardImfMigrationController, 'validate'])
        router.post('imf/migration/commit', [BusinessDashboardImfMigrationController, 'commit'])
      })
      .prefix('business/dashboard')
      .as('business.dashboard')
      .use(middleware.auth({ guards: ['businessDashboard'] }))
      .use(middleware.businessDashboard())
      .use(middleware.businessActive())
  })
  .prefix('/api/v1')

/*
|--------------------------------------------------------------------------
| Realtime (Server-Sent Events) — see start/transmit.ts
|--------------------------------------------------------------------------
|
| GET /api/v1/__transmit/events?uid=… opens the stream; /subscribe and /unsubscribe manage extra
| channels. Signed-in users only. The client picks its connection id, so it is namespaced with the
| user's id before transmit sees it: guessing someone else's id then only reaches one's own
| namespace.
|
*/
transmit.registerRoutes((route) => {
  route
    .prefix('/api/v1')
    .use(middleware.auth())
    .use(async ({ auth, request, response }, next) => {
      const user = auth.user
      if (!(user instanceof User)) {
        return response.forbidden({ message: 'Realtime is only available to user accounts' })
      }
      const uid = String(request.input('uid') ?? '')
      if (!/^[\w-]{8,64}$/.test(uid)) {
        return response.badRequest({ message: 'Invalid connection id' })
      }
      const scoped = `u${user.id}:${uid}`
      request.updateQs({ ...request.qs(), uid: scoped })
      request.updateBody({ ...request.body(), uid: scoped })
      return next()
    })
})
