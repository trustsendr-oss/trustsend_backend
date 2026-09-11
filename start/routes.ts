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
import { controllers } from '#generated/controllers'
const P2pTransfersController = () => import('#controllers/transfers/p2p_transfers_controller')
const CashInController = () => import('#controllers/transfers/cash_in_controller')
const CashOutController = () => import('#controllers/transfers/cash_out_controller')
const AgentsController = () => import('#controllers/agents_controller')
const AgentKycController = () => import('#controllers/agent_kyc_controller')
const AgentFloatController = () => import('#controllers/agent_float_controller')
const KycController = () => import('#controllers/kyc_controller')
const DisputesController = () => import('#controllers/disputes_controller')
const WebhooksController = () => import('#controllers/webhooks_controller')
const WalletsController = () => import('#controllers/wallets_controller')
const TransactionsController = () => import('#controllers/transactions_controller')
const DirectoryController = () => import('#controllers/directory_controller')
const PinController = () => import('#controllers/pin_controller')
const MobileMoneyDepositsController = () => import('#controllers/mobile_money/deposits_controller')
const MobileMoneyPayoutsController = () => import('#controllers/mobile_money/payouts_controller')
const MobileMoneyWebhooksController = () => import('#controllers/mobile_money/webhooks_controller')
const MobileMoneyToolkitController = () => import('#controllers/mobile_money/toolkit_controller')
const CardsController = () => import('#controllers/cards_controller')
const CardProductsController = () => import('#controllers/card_products_controller')
const CardWebhooksController = () => import('#controllers/cards/webhooks_controller')
const BusinessesController = () => import('#controllers/businesses_controller')
const UsersController = () => import('#controllers/users_controller')
const PlansController = () => import('#controllers/plans_controller')
const BusinessDepositsController = () => import('#controllers/business/deposits_controller')
const BusinessPayoutsController = () => import('#controllers/business/payouts_controller')
const BusinessWalletController = () => import('#controllers/business/wallet_controller')
const BusinessTransactionsController = () => import('#controllers/business/transactions_controller')
const BusinessWebhooksController = () => import('#controllers/business/webhooks_controller')
const BusinessToolkitController = () => import('#controllers/business/toolkit_controller')
const BusinessPlanController = () => import('#controllers/business/plan_controller')
const BusinessCardsController = () => import('#controllers/business/cards_controller')
const InternalAuthController = () => import('#controllers/internal_auth_controller')
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
const AdminTransactionsController = () => import('#controllers/admin/transactions_controller')
const AdminAuditLogsController = () => import('#controllers/admin/audit_logs_controller')
const AdminCardsController = () => import('#controllers/admin/cards_controller')
const AdminLedgerAccountsController = () => import('#controllers/admin/ledger_accounts_controller')
const AdminAccountingController = () => import('#controllers/admin/accounting_controller')

router.get('/', () => {
  return { hello: 'world' }
})

router.get('/assets/flags/usd.svg', [AssetsController, 'usdFlag'])

router
  .group(() => {
    router
      .group(() => {
        router
          .post('signup', [controllers.NewAccount, 'store'])
          .use(middleware.throttle({ maxRequests: 10, windowMinutes: 15, name: 'user-signup' }))
        router
          .post('login', [controllers.AccessTokens, 'store'])
          .use(middleware.throttle({ maxRequests: 10, windowMinutes: 15, name: 'user-login' }))
        router.post('refresh', [controllers.AccessTokens, 'refresh']).use(middleware.auth())
      })
      .prefix('auth')
      .as('auth')

    router
      .group(() => {
        router.get('profile', [controllers.Profile, 'show'])
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
      })
      .prefix('directory')
      .as('directory')
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
    // float-convert moves the agent's own personal wallet money into their own float wallet. See
    // agent_float_controller.ts and float_transfer_service.ts.
    router
      .group(() => {
        router.post('float-transfer', [AgentFloatController, 'transfer'])
        router.post('float-convert', [AgentFloatController, 'convert'])
      })
      .prefix('agents')
      .as('agents.float')
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
        router.post(':id/plan', [BusinessesController, 'assignPlan'])
      })
      .prefix('businesses')
      .as('businesses')
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
        router
          .post('wallet', [BusinessWalletController, 'store'])
          .use(middleware.businessPlan('wallet.multi_currency'))
        router.get('wallet', [BusinessWalletController, 'index'])
        router.get('wallet/:currency', [BusinessWalletController, 'show'])
        router.get('transactions', [BusinessTransactionsController, 'index'])
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
        router
          .post('wallet', [BusinessWalletController, 'store'])
          .use(middleware.businessPlan('wallet.multi_currency'))
        router.get('wallet', [BusinessWalletController, 'index'])
        router.get('wallet/:currency', [BusinessWalletController, 'show'])
        router.get('transactions', [BusinessTransactionsController, 'index'])
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
      })
      .prefix('business/dashboard')
      .as('business.dashboard')
      .use(middleware.auth({ guards: ['businessDashboard'] }))
      .use(middleware.businessDashboard())
      .use(middleware.businessActive())
  })
  .prefix('/api/v1')
