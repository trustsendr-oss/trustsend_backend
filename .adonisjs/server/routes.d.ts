import '@adonisjs/core/types/http'

type ParamValue = string | number | bigint | boolean

export type ScannedRoutes = {
  ALL: {
    'assets.usd_flag': { paramsTuple?: []; params?: {} }
    'assets.currency_logo': { paramsTuple: [ParamValue]; params: {'file': ParamValue} }
    'auth.new_account.store': { paramsTuple?: []; params?: {} }
    'auth.access_tokens.store': { paramsTuple?: []; params?: {} }
    'auth.access_tokens.refresh': { paramsTuple?: []; params?: {} }
    'profile.profile.show': { paramsTuple?: []; params?: {} }
    'profile.access_tokens.destroy': { paramsTuple?: []; params?: {} }
    'profile.pin.set_pin': { paramsTuple?: []; params?: {} }
    'profile.pin.change_pin': { paramsTuple?: []; params?: {} }
    'profile.pin_reset.pin.request_reset': { paramsTuple?: []; params?: {} }
    'profile.pin_reset.pin.confirm_reset': { paramsTuple?: []; params?: {} }
    'notifications.notifications.index': { paramsTuple?: []; params?: {} }
    'notifications.notifications.mark_read': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'notifications.notifications.mark_all_read': { paramsTuple?: []; params?: {} }
    'directory.directory.lookup_recipient': { paramsTuple?: []; params?: {} }
    'directory.directory.lookup_agent': { paramsTuple?: []; params?: {} }
    'currencies.index': { paramsTuple?: []; params?: {} }
    'exchange_rates.index': { paramsTuple?: []; params?: {} }
    'swaps.swaps.quote': { paramsTuple?: []; params?: {} }
    'swaps.swaps.store': { paramsTuple?: []; params?: {} }
    'wallets.wallets.index': { paramsTuple?: []; params?: {} }
    'wallets.wallets.store': { paramsTuple?: []; params?: {} }
    'wallets.wallets.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'wallets.wallets.transactions': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'transactions.transactions.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'transfers.p2p.p_2_p_transfers.create': { paramsTuple?: []; params?: {} }
    'transfers.p2p.p_2_p_transfers.show': { paramsTuple: [ParamValue]; params: {'uuid': ParamValue} }
    'transfers.p2p.p_2_p_transfers.index': { paramsTuple?: []; params?: {} }
    'cash_in.cash_in.store': { paramsTuple?: []; params?: {} }
    'cash_in.cash_in.confirm': { paramsTuple: [ParamValue]; params: {'transaction_id': ParamValue} }
    'cash_in.cash_in.reject': { paramsTuple: [ParamValue]; params: {'transaction_id': ParamValue} }
    'cash_out.cash_out.store': { paramsTuple?: []; params?: {} }
    'cash_out.cash_out.confirm': { paramsTuple: [ParamValue]; params: {'transaction_id': ParamValue} }
    'cash_out.cash_out.pickup': { paramsTuple: [ParamValue]; params: {'transaction_id': ParamValue} }
    'cash_out.cash_out.cancel': { paramsTuple: [ParamValue]; params: {'transaction_id': ParamValue} }
    'card_products.image': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'cards.cards.index': { paramsTuple?: []; params?: {} }
    'cards.cards.store': { paramsTuple?: []; params?: {} }
    'cards.card_products.catalogue': { paramsTuple?: []; params?: {} }
    'cards.cards.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'cards.cards.topup': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'cards.cards.withdraw': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'cards.cards.freeze': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'cards.cards.unfreeze': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'cards.cards.terminate': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'cards.cards.transactions': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'agents.kyc.agent_kyc.submit': { paramsTuple?: []; params?: {} }
    'agents.kyc.agent_kyc.get_status': { paramsTuple?: []; params?: {} }
    'agents.float.agent_float.transfer': { paramsTuple?: []; params?: {} }
    'agents.float.agent_float.convert': { paramsTuple?: []; params?: {} }
    'agents.agents.index': { paramsTuple?: []; params?: {} }
    'agents.agents.store': { paramsTuple?: []; params?: {} }
    'agents.agents.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'agents.agents.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'agents.agents.approve': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'agents.agents.activate': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'agents.agents.suspend': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'agents.agents.deactivate': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'kyc.kyc.submit': { paramsTuple?: []; params?: {} }
    'kyc.kyc.get_status': { paramsTuple?: []; params?: {} }
    'kyc.kyc.index': { paramsTuple?: []; params?: {} }
    'kyc.kyc.show': { paramsTuple: [ParamValue]; params: {'kyc_id': ParamValue} }
    'kyc.kyc.approve': { paramsTuple: [ParamValue]; params: {'kyc_id': ParamValue} }
    'kyc.kyc.reject': { paramsTuple: [ParamValue]; params: {'kyc_id': ParamValue} }
    'kyc.kyc.list_documents': { paramsTuple: [ParamValue]; params: {'kyc_id': ParamValue} }
    'kyc.kyc.get_document': { paramsTuple: [ParamValue,ParamValue]; params: {'kyc_id': ParamValue,'document_id': ParamValue} }
    'disputes.disputes.index': { paramsTuple?: []; params?: {} }
    'disputes.disputes.store': { paramsTuple?: []; params?: {} }
    'disputes.disputes.list_all': { paramsTuple?: []; params?: {} }
    'disputes.disputes.admin_messages': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'disputes.disputes.admin_post_message': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'disputes.disputes.admin_show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'disputes.disputes.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'disputes.disputes.messages': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'disputes.disputes.post_message': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'disputes.disputes.withdraw': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'disputes.disputes.close': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'webhooks.webhooks.index': { paramsTuple?: []; params?: {} }
    'webhooks.webhooks.store': { paramsTuple?: []; params?: {} }
    'webhooks.webhooks.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'webhooks.webhooks.get_deliveries': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'mobile_money.mobile_money_deposits.store': { paramsTuple?: []; params?: {} }
    'mobile_money.mobile_money_deposits.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'mobile_money.mobile_money_deposits.live_status': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'mobile_money.mobile_money_payouts.store': { paramsTuple?: []; params?: {} }
    'mobile_money.mobile_money_payouts.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'mobile_money.mobile_money_payouts.live_status': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'mobile_money.mobile_money_toolkit.predict_provider': { paramsTuple?: []; params?: {} }
    'mobile_money.mobile_money_toolkit.list_payment_methods': { paramsTuple?: []; params?: {} }
    'mobile_money.mobile_money_toolkit.list_all_payment_methods_raw': { paramsTuple?: []; params?: {} }
    'webhooks.pawapay.mobile_money_webhooks.handle_deposit': { paramsTuple?: []; params?: {} }
    'webhooks.pawapay.mobile_money_webhooks.handle_payout': { paramsTuple?: []; params?: {} }
    'webhooks.payscribe.cards': { paramsTuple?: []; params?: {} }
    'businesses.businesses.index': { paramsTuple?: []; params?: {} }
    'businesses.businesses.store': { paramsTuple?: []; params?: {} }
    'businesses.businesses.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'businesses.businesses.approve': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'businesses.businesses.activate': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'businesses.businesses.suspend': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'businesses.businesses.deactivate': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'businesses.businesses.issue_api_key': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'businesses.businesses.revoke_api_key': { paramsTuple: [ParamValue,ParamValue]; params: {'id': ParamValue,'keyId': ParamValue} }
    'businesses.businesses.assign_plan': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'card_products.card_products.index': { paramsTuple?: []; params?: {} }
    'card_products.card_products.store': { paramsTuple?: []; params?: {} }
    'card_products.card_products.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'card_products.card_products.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'card_products.card_products.archive': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'card_products.card_products.destroy_image': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'plans.plans.index': { paramsTuple?: []; params?: {} }
    'plans.plans.store': { paramsTuple?: []; params?: {} }
    'plans.plans.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'plans.plans.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'plans.plans.archive': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'users.users.index': { paramsTuple?: []; params?: {} }
    'users.users.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'users.users.reset_pin': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'users.users.freeze_wallet': { paramsTuple: [ParamValue,ParamValue]; params: {'id': ParamValue,'walletId': ParamValue} }
    'users.users.unfreeze_wallet': { paramsTuple: [ParamValue,ParamValue]; params: {'id': ParamValue,'walletId': ParamValue} }
    'internal_users.internal_users.index': { paramsTuple?: []; params?: {} }
    'internal_users.internal_users.store': { paramsTuple?: []; params?: {} }
    'internal_users.internal_users.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'internal_users.internal_users.activate': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'internal_users.internal_users.suspend': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'internal_users.internal_users.deactivate': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'internal_users.internal_users.reset_password': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'internal_users.internal_users.reset_mfa': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.admin_transactions.index': { paramsTuple?: []; params?: {} }
    'admin.admin_transactions.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.admin_audit_logs.index': { paramsTuple?: []; params?: {} }
    'admin.admin_audit_logs.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.admin_cards.index': { paramsTuple?: []; params?: {} }
    'admin.admin_cards.store': { paramsTuple?: []; params?: {} }
    'admin.admin_cards.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.admin_cards.transactions': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.admin_cards.topup': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.admin_cards.freeze': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.admin_cards.unfreeze': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.admin_cards.terminate': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.admin_ledger_accounts.index': { paramsTuple?: []; params?: {} }
    'admin.admin_ledger_accounts.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.currencies.admin_index': { paramsTuple?: []; params?: {} }
    'admin.currencies.admin_show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.currencies.admin_update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.exchange_rates.admin_index': { paramsTuple?: []; params?: {} }
    'admin.exchange_rates.admin_refresh': { paramsTuple?: []; params?: {} }
    'admin.exchange_rates.admin_show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.exchange_rates.admin_update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.admin_accounting.balance_sheet': { paramsTuple?: []; params?: {} }
    'admin.admin_accounting.revenue': { paramsTuple?: []; params?: {} }
    'admin.admin_accounting.reconcile': { paramsTuple?: []; params?: {} }
    'business.business_deposits.store': { paramsTuple?: []; params?: {} }
    'business.business_deposits.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'business.business_deposits.live_status': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'business.business_payouts.store': { paramsTuple?: []; params?: {} }
    'business.business_payouts.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'business.business_payouts.live_status': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'business.business_wallet.store': { paramsTuple?: []; params?: {} }
    'business.business_wallet.index': { paramsTuple?: []; params?: {} }
    'business.business_wallet.show': { paramsTuple: [ParamValue]; params: {'currency': ParamValue} }
    'business.business_swaps.quote': { paramsTuple?: []; params?: {} }
    'business.business_swaps.store': { paramsTuple?: []; params?: {} }
    'business.business_transactions.index': { paramsTuple?: []; params?: {} }
    'business.business_webhooks.index': { paramsTuple?: []; params?: {} }
    'business.business_webhooks.store': { paramsTuple?: []; params?: {} }
    'business.business_webhooks.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'business.business_webhooks.get_deliveries': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'business.business_toolkit.list_payment_methods': { paramsTuple?: []; params?: {} }
    'business.business_toolkit.list_all_payment_methods_raw': { paramsTuple?: []; params?: {} }
    'business.business_plan.index': { paramsTuple?: []; params?: {} }
    'business.business_plan.current': { paramsTuple?: []; params?: {} }
    'business.business_plan.subscribe': { paramsTuple?: []; params?: {} }
    'business.business_cards.index': { paramsTuple?: []; params?: {} }
    'business.business_cards.store': { paramsTuple?: []; params?: {} }
    'business.business_cards.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'business.business_cards.topup': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'business.business_cards.withdraw': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'business.business_cards.freeze': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'business.business_cards.unfreeze': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'business.business_cards.terminate': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'business.business_cards.transactions': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'internal.auth.internal_auth.login': { paramsTuple?: []; params?: {} }
    'internal.auth.internal_auth.logout': { paramsTuple?: []; params?: {} }
    'internal.auth.internal_auth.change_password': { paramsTuple?: []; params?: {} }
    'internal.auth.internal_auth.verify_mfa': { paramsTuple?: []; params?: {} }
    'internal.auth.internal_auth.setup_mfa': { paramsTuple?: []; params?: {} }
    'internal.auth.internal_auth.enable_mfa': { paramsTuple?: []; params?: {} }
    'internal.auth.internal_auth.me': { paramsTuple?: []; params?: {} }
    'business.auth.business_dashboard_auth.request_signup_otp': { paramsTuple?: []; params?: {} }
    'business.auth.business_dashboard_auth.signup': { paramsTuple?: []; params?: {} }
    'business.auth.business_dashboard_auth.login': { paramsTuple?: []; params?: {} }
    'business.auth.business_dashboard_auth.refresh': { paramsTuple?: []; params?: {} }
    'business.auth.business_dashboard_auth.logout': { paramsTuple?: []; params?: {} }
    'business.auth.business_dashboard_auth.change_password': { paramsTuple?: []; params?: {} }
    'business.dashboard.onboarding.business_dashboard_profile.show': { paramsTuple?: []; params?: {} }
    'business.dashboard.onboarding.business_dashboard_profile.update': { paramsTuple?: []; params?: {} }
    'business.dashboard.onboarding.business_pin.set_pin': { paramsTuple?: []; params?: {} }
    'business.dashboard.onboarding.business_pin.change_pin': { paramsTuple?: []; params?: {} }
    'business.dashboard.onboarding.business_kyc.submit': { paramsTuple?: []; params?: {} }
    'business.dashboard.onboarding.business_kyc.get_status': { paramsTuple?: []; params?: {} }
    'business.dashboard.onboarding.business_notifications.index': { paramsTuple?: []; params?: {} }
    'business.dashboard.onboarding.business_notifications.mark_read': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'business.dashboard.onboarding.business_notifications.mark_all_read': { paramsTuple?: []; params?: {} }
    'business.dashboard.onboarding.business_plan.index': { paramsTuple?: []; params?: {} }
    'business.dashboard.onboarding.business_plan.current': { paramsTuple?: []; params?: {} }
    'business.dashboard.onboarding.business_plan.subscribe': { paramsTuple?: []; params?: {} }
    'business.dashboard.pin_reset.business_pin.request_reset': { paramsTuple?: []; params?: {} }
    'business.dashboard.pin_reset.business_pin.confirm_reset': { paramsTuple?: []; params?: {} }
    'business.dashboard.business_deposits.store': { paramsTuple?: []; params?: {} }
    'business.dashboard.business_deposits.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'business.dashboard.business_deposits.live_status': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'business.dashboard.business_payouts.store': { paramsTuple?: []; params?: {} }
    'business.dashboard.business_payouts.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'business.dashboard.business_payouts.live_status': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'business.dashboard.business_wallet.store': { paramsTuple?: []; params?: {} }
    'business.dashboard.business_wallet.index': { paramsTuple?: []; params?: {} }
    'business.dashboard.business_wallet.show': { paramsTuple: [ParamValue]; params: {'currency': ParamValue} }
    'business.dashboard.business_swaps.quote': { paramsTuple?: []; params?: {} }
    'business.dashboard.business_swaps.store': { paramsTuple?: []; params?: {} }
    'business.dashboard.business_transactions.index': { paramsTuple?: []; params?: {} }
    'business.dashboard.business_webhooks.index': { paramsTuple?: []; params?: {} }
    'business.dashboard.business_webhooks.store': { paramsTuple?: []; params?: {} }
    'business.dashboard.business_webhooks.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'business.dashboard.business_webhooks.get_deliveries': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'business.dashboard.business_toolkit.list_payment_methods': { paramsTuple?: []; params?: {} }
    'business.dashboard.business_toolkit.list_all_payment_methods_raw': { paramsTuple?: []; params?: {} }
    'business.dashboard.business_overview.show': { paramsTuple?: []; params?: {} }
    'business.dashboard.business_dashboard_api_keys.index': { paramsTuple?: []; params?: {} }
    'business.dashboard.business_dashboard_api_keys.store': { paramsTuple?: []; params?: {} }
    'business.dashboard.business_dashboard_api_keys.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'business.dashboard.business_cards.index': { paramsTuple?: []; params?: {} }
    'business.dashboard.business_cards.store': { paramsTuple?: []; params?: {} }
    'business.dashboard.business_cards.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'business.dashboard.business_cards.topup': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'business.dashboard.business_cards.withdraw': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'business.dashboard.business_cards.freeze': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'business.dashboard.business_cards.unfreeze': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'business.dashboard.business_cards.terminate': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'business.dashboard.business_cards.transactions': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
  }
  GET: {
    'assets.usd_flag': { paramsTuple?: []; params?: {} }
    'assets.currency_logo': { paramsTuple: [ParamValue]; params: {'file': ParamValue} }
    'profile.profile.show': { paramsTuple?: []; params?: {} }
    'notifications.notifications.index': { paramsTuple?: []; params?: {} }
    'directory.directory.lookup_recipient': { paramsTuple?: []; params?: {} }
    'directory.directory.lookup_agent': { paramsTuple?: []; params?: {} }
    'currencies.index': { paramsTuple?: []; params?: {} }
    'exchange_rates.index': { paramsTuple?: []; params?: {} }
    'wallets.wallets.index': { paramsTuple?: []; params?: {} }
    'wallets.wallets.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'wallets.wallets.transactions': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'transactions.transactions.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'transfers.p2p.p_2_p_transfers.show': { paramsTuple: [ParamValue]; params: {'uuid': ParamValue} }
    'transfers.p2p.p_2_p_transfers.index': { paramsTuple?: []; params?: {} }
    'card_products.image': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'cards.cards.index': { paramsTuple?: []; params?: {} }
    'cards.card_products.catalogue': { paramsTuple?: []; params?: {} }
    'cards.cards.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'cards.cards.transactions': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'agents.kyc.agent_kyc.get_status': { paramsTuple?: []; params?: {} }
    'agents.agents.index': { paramsTuple?: []; params?: {} }
    'agents.agents.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'kyc.kyc.get_status': { paramsTuple?: []; params?: {} }
    'kyc.kyc.index': { paramsTuple?: []; params?: {} }
    'kyc.kyc.show': { paramsTuple: [ParamValue]; params: {'kyc_id': ParamValue} }
    'kyc.kyc.list_documents': { paramsTuple: [ParamValue]; params: {'kyc_id': ParamValue} }
    'kyc.kyc.get_document': { paramsTuple: [ParamValue,ParamValue]; params: {'kyc_id': ParamValue,'document_id': ParamValue} }
    'disputes.disputes.index': { paramsTuple?: []; params?: {} }
    'disputes.disputes.list_all': { paramsTuple?: []; params?: {} }
    'disputes.disputes.admin_messages': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'disputes.disputes.admin_show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'disputes.disputes.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'disputes.disputes.messages': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'webhooks.webhooks.index': { paramsTuple?: []; params?: {} }
    'webhooks.webhooks.get_deliveries': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'mobile_money.mobile_money_deposits.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'mobile_money.mobile_money_deposits.live_status': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'mobile_money.mobile_money_payouts.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'mobile_money.mobile_money_payouts.live_status': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'mobile_money.mobile_money_toolkit.predict_provider': { paramsTuple?: []; params?: {} }
    'mobile_money.mobile_money_toolkit.list_payment_methods': { paramsTuple?: []; params?: {} }
    'mobile_money.mobile_money_toolkit.list_all_payment_methods_raw': { paramsTuple?: []; params?: {} }
    'businesses.businesses.index': { paramsTuple?: []; params?: {} }
    'businesses.businesses.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'card_products.card_products.index': { paramsTuple?: []; params?: {} }
    'card_products.card_products.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'plans.plans.index': { paramsTuple?: []; params?: {} }
    'plans.plans.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'users.users.index': { paramsTuple?: []; params?: {} }
    'users.users.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'internal_users.internal_users.index': { paramsTuple?: []; params?: {} }
    'internal_users.internal_users.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.admin_transactions.index': { paramsTuple?: []; params?: {} }
    'admin.admin_transactions.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.admin_audit_logs.index': { paramsTuple?: []; params?: {} }
    'admin.admin_audit_logs.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.admin_cards.index': { paramsTuple?: []; params?: {} }
    'admin.admin_cards.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.admin_cards.transactions': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.admin_ledger_accounts.index': { paramsTuple?: []; params?: {} }
    'admin.admin_ledger_accounts.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.currencies.admin_index': { paramsTuple?: []; params?: {} }
    'admin.currencies.admin_show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.exchange_rates.admin_index': { paramsTuple?: []; params?: {} }
    'admin.exchange_rates.admin_show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.admin_accounting.balance_sheet': { paramsTuple?: []; params?: {} }
    'admin.admin_accounting.revenue': { paramsTuple?: []; params?: {} }
    'business.business_deposits.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'business.business_deposits.live_status': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'business.business_payouts.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'business.business_payouts.live_status': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'business.business_wallet.index': { paramsTuple?: []; params?: {} }
    'business.business_wallet.show': { paramsTuple: [ParamValue]; params: {'currency': ParamValue} }
    'business.business_transactions.index': { paramsTuple?: []; params?: {} }
    'business.business_webhooks.index': { paramsTuple?: []; params?: {} }
    'business.business_webhooks.get_deliveries': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'business.business_toolkit.list_payment_methods': { paramsTuple?: []; params?: {} }
    'business.business_toolkit.list_all_payment_methods_raw': { paramsTuple?: []; params?: {} }
    'business.business_plan.index': { paramsTuple?: []; params?: {} }
    'business.business_plan.current': { paramsTuple?: []; params?: {} }
    'business.business_cards.index': { paramsTuple?: []; params?: {} }
    'business.business_cards.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'business.business_cards.transactions': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'internal.auth.internal_auth.me': { paramsTuple?: []; params?: {} }
    'business.dashboard.onboarding.business_dashboard_profile.show': { paramsTuple?: []; params?: {} }
    'business.dashboard.onboarding.business_kyc.get_status': { paramsTuple?: []; params?: {} }
    'business.dashboard.onboarding.business_notifications.index': { paramsTuple?: []; params?: {} }
    'business.dashboard.onboarding.business_plan.index': { paramsTuple?: []; params?: {} }
    'business.dashboard.onboarding.business_plan.current': { paramsTuple?: []; params?: {} }
    'business.dashboard.business_deposits.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'business.dashboard.business_deposits.live_status': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'business.dashboard.business_payouts.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'business.dashboard.business_payouts.live_status': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'business.dashboard.business_wallet.index': { paramsTuple?: []; params?: {} }
    'business.dashboard.business_wallet.show': { paramsTuple: [ParamValue]; params: {'currency': ParamValue} }
    'business.dashboard.business_transactions.index': { paramsTuple?: []; params?: {} }
    'business.dashboard.business_webhooks.index': { paramsTuple?: []; params?: {} }
    'business.dashboard.business_webhooks.get_deliveries': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'business.dashboard.business_toolkit.list_payment_methods': { paramsTuple?: []; params?: {} }
    'business.dashboard.business_toolkit.list_all_payment_methods_raw': { paramsTuple?: []; params?: {} }
    'business.dashboard.business_overview.show': { paramsTuple?: []; params?: {} }
    'business.dashboard.business_dashboard_api_keys.index': { paramsTuple?: []; params?: {} }
    'business.dashboard.business_cards.index': { paramsTuple?: []; params?: {} }
    'business.dashboard.business_cards.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'business.dashboard.business_cards.transactions': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
  }
  HEAD: {
    'assets.usd_flag': { paramsTuple?: []; params?: {} }
    'assets.currency_logo': { paramsTuple: [ParamValue]; params: {'file': ParamValue} }
    'profile.profile.show': { paramsTuple?: []; params?: {} }
    'notifications.notifications.index': { paramsTuple?: []; params?: {} }
    'directory.directory.lookup_recipient': { paramsTuple?: []; params?: {} }
    'directory.directory.lookup_agent': { paramsTuple?: []; params?: {} }
    'currencies.index': { paramsTuple?: []; params?: {} }
    'exchange_rates.index': { paramsTuple?: []; params?: {} }
    'wallets.wallets.index': { paramsTuple?: []; params?: {} }
    'wallets.wallets.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'wallets.wallets.transactions': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'transactions.transactions.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'transfers.p2p.p_2_p_transfers.show': { paramsTuple: [ParamValue]; params: {'uuid': ParamValue} }
    'transfers.p2p.p_2_p_transfers.index': { paramsTuple?: []; params?: {} }
    'card_products.image': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'cards.cards.index': { paramsTuple?: []; params?: {} }
    'cards.card_products.catalogue': { paramsTuple?: []; params?: {} }
    'cards.cards.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'cards.cards.transactions': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'agents.kyc.agent_kyc.get_status': { paramsTuple?: []; params?: {} }
    'agents.agents.index': { paramsTuple?: []; params?: {} }
    'agents.agents.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'kyc.kyc.get_status': { paramsTuple?: []; params?: {} }
    'kyc.kyc.index': { paramsTuple?: []; params?: {} }
    'kyc.kyc.show': { paramsTuple: [ParamValue]; params: {'kyc_id': ParamValue} }
    'kyc.kyc.list_documents': { paramsTuple: [ParamValue]; params: {'kyc_id': ParamValue} }
    'kyc.kyc.get_document': { paramsTuple: [ParamValue,ParamValue]; params: {'kyc_id': ParamValue,'document_id': ParamValue} }
    'disputes.disputes.index': { paramsTuple?: []; params?: {} }
    'disputes.disputes.list_all': { paramsTuple?: []; params?: {} }
    'disputes.disputes.admin_messages': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'disputes.disputes.admin_show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'disputes.disputes.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'disputes.disputes.messages': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'webhooks.webhooks.index': { paramsTuple?: []; params?: {} }
    'webhooks.webhooks.get_deliveries': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'mobile_money.mobile_money_deposits.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'mobile_money.mobile_money_deposits.live_status': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'mobile_money.mobile_money_payouts.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'mobile_money.mobile_money_payouts.live_status': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'mobile_money.mobile_money_toolkit.predict_provider': { paramsTuple?: []; params?: {} }
    'mobile_money.mobile_money_toolkit.list_payment_methods': { paramsTuple?: []; params?: {} }
    'mobile_money.mobile_money_toolkit.list_all_payment_methods_raw': { paramsTuple?: []; params?: {} }
    'businesses.businesses.index': { paramsTuple?: []; params?: {} }
    'businesses.businesses.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'card_products.card_products.index': { paramsTuple?: []; params?: {} }
    'card_products.card_products.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'plans.plans.index': { paramsTuple?: []; params?: {} }
    'plans.plans.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'users.users.index': { paramsTuple?: []; params?: {} }
    'users.users.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'internal_users.internal_users.index': { paramsTuple?: []; params?: {} }
    'internal_users.internal_users.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.admin_transactions.index': { paramsTuple?: []; params?: {} }
    'admin.admin_transactions.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.admin_audit_logs.index': { paramsTuple?: []; params?: {} }
    'admin.admin_audit_logs.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.admin_cards.index': { paramsTuple?: []; params?: {} }
    'admin.admin_cards.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.admin_cards.transactions': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.admin_ledger_accounts.index': { paramsTuple?: []; params?: {} }
    'admin.admin_ledger_accounts.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.currencies.admin_index': { paramsTuple?: []; params?: {} }
    'admin.currencies.admin_show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.exchange_rates.admin_index': { paramsTuple?: []; params?: {} }
    'admin.exchange_rates.admin_show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.admin_accounting.balance_sheet': { paramsTuple?: []; params?: {} }
    'admin.admin_accounting.revenue': { paramsTuple?: []; params?: {} }
    'business.business_deposits.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'business.business_deposits.live_status': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'business.business_payouts.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'business.business_payouts.live_status': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'business.business_wallet.index': { paramsTuple?: []; params?: {} }
    'business.business_wallet.show': { paramsTuple: [ParamValue]; params: {'currency': ParamValue} }
    'business.business_transactions.index': { paramsTuple?: []; params?: {} }
    'business.business_webhooks.index': { paramsTuple?: []; params?: {} }
    'business.business_webhooks.get_deliveries': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'business.business_toolkit.list_payment_methods': { paramsTuple?: []; params?: {} }
    'business.business_toolkit.list_all_payment_methods_raw': { paramsTuple?: []; params?: {} }
    'business.business_plan.index': { paramsTuple?: []; params?: {} }
    'business.business_plan.current': { paramsTuple?: []; params?: {} }
    'business.business_cards.index': { paramsTuple?: []; params?: {} }
    'business.business_cards.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'business.business_cards.transactions': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'internal.auth.internal_auth.me': { paramsTuple?: []; params?: {} }
    'business.dashboard.onboarding.business_dashboard_profile.show': { paramsTuple?: []; params?: {} }
    'business.dashboard.onboarding.business_kyc.get_status': { paramsTuple?: []; params?: {} }
    'business.dashboard.onboarding.business_notifications.index': { paramsTuple?: []; params?: {} }
    'business.dashboard.onboarding.business_plan.index': { paramsTuple?: []; params?: {} }
    'business.dashboard.onboarding.business_plan.current': { paramsTuple?: []; params?: {} }
    'business.dashboard.business_deposits.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'business.dashboard.business_deposits.live_status': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'business.dashboard.business_payouts.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'business.dashboard.business_payouts.live_status': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'business.dashboard.business_wallet.index': { paramsTuple?: []; params?: {} }
    'business.dashboard.business_wallet.show': { paramsTuple: [ParamValue]; params: {'currency': ParamValue} }
    'business.dashboard.business_transactions.index': { paramsTuple?: []; params?: {} }
    'business.dashboard.business_webhooks.index': { paramsTuple?: []; params?: {} }
    'business.dashboard.business_webhooks.get_deliveries': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'business.dashboard.business_toolkit.list_payment_methods': { paramsTuple?: []; params?: {} }
    'business.dashboard.business_toolkit.list_all_payment_methods_raw': { paramsTuple?: []; params?: {} }
    'business.dashboard.business_overview.show': { paramsTuple?: []; params?: {} }
    'business.dashboard.business_dashboard_api_keys.index': { paramsTuple?: []; params?: {} }
    'business.dashboard.business_cards.index': { paramsTuple?: []; params?: {} }
    'business.dashboard.business_cards.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'business.dashboard.business_cards.transactions': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
  }
  POST: {
    'auth.new_account.store': { paramsTuple?: []; params?: {} }
    'auth.access_tokens.store': { paramsTuple?: []; params?: {} }
    'auth.access_tokens.refresh': { paramsTuple?: []; params?: {} }
    'profile.access_tokens.destroy': { paramsTuple?: []; params?: {} }
    'profile.pin.set_pin': { paramsTuple?: []; params?: {} }
    'profile.pin.change_pin': { paramsTuple?: []; params?: {} }
    'profile.pin_reset.pin.request_reset': { paramsTuple?: []; params?: {} }
    'profile.pin_reset.pin.confirm_reset': { paramsTuple?: []; params?: {} }
    'notifications.notifications.mark_all_read': { paramsTuple?: []; params?: {} }
    'swaps.swaps.quote': { paramsTuple?: []; params?: {} }
    'swaps.swaps.store': { paramsTuple?: []; params?: {} }
    'wallets.wallets.store': { paramsTuple?: []; params?: {} }
    'transfers.p2p.p_2_p_transfers.create': { paramsTuple?: []; params?: {} }
    'cash_in.cash_in.store': { paramsTuple?: []; params?: {} }
    'cash_in.cash_in.confirm': { paramsTuple: [ParamValue]; params: {'transaction_id': ParamValue} }
    'cash_in.cash_in.reject': { paramsTuple: [ParamValue]; params: {'transaction_id': ParamValue} }
    'cash_out.cash_out.store': { paramsTuple?: []; params?: {} }
    'cash_out.cash_out.confirm': { paramsTuple: [ParamValue]; params: {'transaction_id': ParamValue} }
    'cash_out.cash_out.pickup': { paramsTuple: [ParamValue]; params: {'transaction_id': ParamValue} }
    'cash_out.cash_out.cancel': { paramsTuple: [ParamValue]; params: {'transaction_id': ParamValue} }
    'cards.cards.store': { paramsTuple?: []; params?: {} }
    'cards.cards.terminate': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'agents.kyc.agent_kyc.submit': { paramsTuple?: []; params?: {} }
    'agents.float.agent_float.transfer': { paramsTuple?: []; params?: {} }
    'agents.float.agent_float.convert': { paramsTuple?: []; params?: {} }
    'agents.agents.store': { paramsTuple?: []; params?: {} }
    'agents.agents.approve': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'agents.agents.activate': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'agents.agents.suspend': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'agents.agents.deactivate': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'kyc.kyc.submit': { paramsTuple?: []; params?: {} }
    'kyc.kyc.approve': { paramsTuple: [ParamValue]; params: {'kyc_id': ParamValue} }
    'kyc.kyc.reject': { paramsTuple: [ParamValue]; params: {'kyc_id': ParamValue} }
    'disputes.disputes.store': { paramsTuple?: []; params?: {} }
    'disputes.disputes.admin_post_message': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'disputes.disputes.post_message': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'disputes.disputes.withdraw': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'disputes.disputes.close': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'webhooks.webhooks.store': { paramsTuple?: []; params?: {} }
    'mobile_money.mobile_money_deposits.store': { paramsTuple?: []; params?: {} }
    'mobile_money.mobile_money_payouts.store': { paramsTuple?: []; params?: {} }
    'webhooks.pawapay.mobile_money_webhooks.handle_deposit': { paramsTuple?: []; params?: {} }
    'webhooks.pawapay.mobile_money_webhooks.handle_payout': { paramsTuple?: []; params?: {} }
    'webhooks.payscribe.cards': { paramsTuple?: []; params?: {} }
    'businesses.businesses.store': { paramsTuple?: []; params?: {} }
    'businesses.businesses.approve': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'businesses.businesses.activate': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'businesses.businesses.suspend': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'businesses.businesses.deactivate': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'businesses.businesses.issue_api_key': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'businesses.businesses.assign_plan': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'card_products.card_products.store': { paramsTuple?: []; params?: {} }
    'card_products.card_products.archive': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'plans.plans.store': { paramsTuple?: []; params?: {} }
    'plans.plans.archive': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'users.users.reset_pin': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'users.users.freeze_wallet': { paramsTuple: [ParamValue,ParamValue]; params: {'id': ParamValue,'walletId': ParamValue} }
    'users.users.unfreeze_wallet': { paramsTuple: [ParamValue,ParamValue]; params: {'id': ParamValue,'walletId': ParamValue} }
    'internal_users.internal_users.store': { paramsTuple?: []; params?: {} }
    'internal_users.internal_users.activate': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'internal_users.internal_users.suspend': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'internal_users.internal_users.deactivate': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'internal_users.internal_users.reset_password': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'internal_users.internal_users.reset_mfa': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.admin_cards.store': { paramsTuple?: []; params?: {} }
    'admin.admin_cards.topup': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.admin_cards.freeze': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.admin_cards.unfreeze': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.admin_cards.terminate': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.exchange_rates.admin_refresh': { paramsTuple?: []; params?: {} }
    'admin.admin_accounting.reconcile': { paramsTuple?: []; params?: {} }
    'business.business_deposits.store': { paramsTuple?: []; params?: {} }
    'business.business_payouts.store': { paramsTuple?: []; params?: {} }
    'business.business_wallet.store': { paramsTuple?: []; params?: {} }
    'business.business_swaps.quote': { paramsTuple?: []; params?: {} }
    'business.business_swaps.store': { paramsTuple?: []; params?: {} }
    'business.business_webhooks.store': { paramsTuple?: []; params?: {} }
    'business.business_plan.subscribe': { paramsTuple?: []; params?: {} }
    'business.business_cards.store': { paramsTuple?: []; params?: {} }
    'business.business_cards.terminate': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'internal.auth.internal_auth.login': { paramsTuple?: []; params?: {} }
    'internal.auth.internal_auth.logout': { paramsTuple?: []; params?: {} }
    'internal.auth.internal_auth.change_password': { paramsTuple?: []; params?: {} }
    'internal.auth.internal_auth.verify_mfa': { paramsTuple?: []; params?: {} }
    'internal.auth.internal_auth.setup_mfa': { paramsTuple?: []; params?: {} }
    'internal.auth.internal_auth.enable_mfa': { paramsTuple?: []; params?: {} }
    'business.auth.business_dashboard_auth.request_signup_otp': { paramsTuple?: []; params?: {} }
    'business.auth.business_dashboard_auth.signup': { paramsTuple?: []; params?: {} }
    'business.auth.business_dashboard_auth.login': { paramsTuple?: []; params?: {} }
    'business.auth.business_dashboard_auth.refresh': { paramsTuple?: []; params?: {} }
    'business.auth.business_dashboard_auth.logout': { paramsTuple?: []; params?: {} }
    'business.auth.business_dashboard_auth.change_password': { paramsTuple?: []; params?: {} }
    'business.dashboard.onboarding.business_pin.set_pin': { paramsTuple?: []; params?: {} }
    'business.dashboard.onboarding.business_pin.change_pin': { paramsTuple?: []; params?: {} }
    'business.dashboard.onboarding.business_kyc.submit': { paramsTuple?: []; params?: {} }
    'business.dashboard.onboarding.business_notifications.mark_all_read': { paramsTuple?: []; params?: {} }
    'business.dashboard.onboarding.business_plan.subscribe': { paramsTuple?: []; params?: {} }
    'business.dashboard.pin_reset.business_pin.request_reset': { paramsTuple?: []; params?: {} }
    'business.dashboard.pin_reset.business_pin.confirm_reset': { paramsTuple?: []; params?: {} }
    'business.dashboard.business_deposits.store': { paramsTuple?: []; params?: {} }
    'business.dashboard.business_payouts.store': { paramsTuple?: []; params?: {} }
    'business.dashboard.business_wallet.store': { paramsTuple?: []; params?: {} }
    'business.dashboard.business_swaps.quote': { paramsTuple?: []; params?: {} }
    'business.dashboard.business_swaps.store': { paramsTuple?: []; params?: {} }
    'business.dashboard.business_webhooks.store': { paramsTuple?: []; params?: {} }
    'business.dashboard.business_dashboard_api_keys.store': { paramsTuple?: []; params?: {} }
    'business.dashboard.business_cards.store': { paramsTuple?: []; params?: {} }
    'business.dashboard.business_cards.terminate': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
  }
  PATCH: {
    'notifications.notifications.mark_read': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'cards.cards.topup': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'cards.cards.withdraw': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'cards.cards.freeze': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'cards.cards.unfreeze': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'agents.agents.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'card_products.card_products.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'plans.plans.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.currencies.admin_update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.exchange_rates.admin_update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'business.business_cards.topup': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'business.business_cards.withdraw': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'business.business_cards.freeze': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'business.business_cards.unfreeze': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'business.dashboard.onboarding.business_dashboard_profile.update': { paramsTuple?: []; params?: {} }
    'business.dashboard.onboarding.business_notifications.mark_read': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'business.dashboard.business_cards.topup': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'business.dashboard.business_cards.withdraw': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'business.dashboard.business_cards.freeze': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'business.dashboard.business_cards.unfreeze': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
  }
  DELETE: {
    'webhooks.webhooks.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'businesses.businesses.revoke_api_key': { paramsTuple: [ParamValue,ParamValue]; params: {'id': ParamValue,'keyId': ParamValue} }
    'card_products.card_products.destroy_image': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'business.business_webhooks.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'business.dashboard.business_webhooks.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'business.dashboard.business_dashboard_api_keys.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
  }
}
declare module '@adonisjs/core/types/http' {
  export interface RoutesList extends ScannedRoutes {}
}