/* eslint-disable prettier/prettier */
import type { routes } from './index.ts'

export interface ApiDefinition {
  assets: {
    usdFlag: typeof routes['assets.usd_flag']
    currencyLogo: typeof routes['assets.currency_logo']
  }
  auth: {
    newAccount: {
      store: typeof routes['auth.new_account.store']
    }
    accessTokens: {
      store: typeof routes['auth.access_tokens.store']
      refresh: typeof routes['auth.access_tokens.refresh']
    }
  }
  profile: {
    profile: {
      show: typeof routes['profile.profile.show']
    }
    accessTokens: {
      destroy: typeof routes['profile.access_tokens.destroy']
    }
    pin: {
      setPin: typeof routes['profile.pin.set_pin']
      changePin: typeof routes['profile.pin.change_pin']
    }
    pinReset: {
      pin: {
        requestReset: typeof routes['profile.pin_reset.pin.request_reset']
        confirmReset: typeof routes['profile.pin_reset.pin.confirm_reset']
      }
    }
  }
  notifications: {
    notifications: {
      index: typeof routes['notifications.notifications.index']
      markRead: typeof routes['notifications.notifications.mark_read']
      markAllRead: typeof routes['notifications.notifications.mark_all_read']
    }
  }
  directory: {
    directory: {
      lookupRecipient: typeof routes['directory.directory.lookup_recipient']
      lookupAgent: typeof routes['directory.directory.lookup_agent']
    }
  }
  currencies: {
    index: typeof routes['currencies.index']
  }
  exchangeRates: {
    index: typeof routes['exchange_rates.index']
  }
  swaps: {
    swaps: {
      quote: typeof routes['swaps.swaps.quote']
      store: typeof routes['swaps.swaps.store']
    }
  }
  wallets: {
    wallets: {
      index: typeof routes['wallets.wallets.index']
      store: typeof routes['wallets.wallets.store']
      show: typeof routes['wallets.wallets.show']
      transactions: typeof routes['wallets.wallets.transactions']
    }
  }
  transactions: {
    transactions: {
      show: typeof routes['transactions.transactions.show']
    }
  }
  transfers: {
    p2P: {
      p2PTransfers: {
        create: typeof routes['transfers.p2p.p_2_p_transfers.create']
        show: typeof routes['transfers.p2p.p_2_p_transfers.show']
        index: typeof routes['transfers.p2p.p_2_p_transfers.index']
      }
    }
  }
  cashIn: {
    cashIn: {
      store: typeof routes['cash_in.cash_in.store']
      confirm: typeof routes['cash_in.cash_in.confirm']
      reject: typeof routes['cash_in.cash_in.reject']
    }
  }
  cashOut: {
    cashOut: {
      store: typeof routes['cash_out.cash_out.store']
      confirm: typeof routes['cash_out.cash_out.confirm']
      pickup: typeof routes['cash_out.cash_out.pickup']
      cancel: typeof routes['cash_out.cash_out.cancel']
    }
  }
  cardProducts: {
    image: typeof routes['card_products.image']
    cardProducts: {
      index: typeof routes['card_products.card_products.index']
      store: typeof routes['card_products.card_products.store']
      show: typeof routes['card_products.card_products.show']
      update: typeof routes['card_products.card_products.update']
      archive: typeof routes['card_products.card_products.archive']
      destroyImage: typeof routes['card_products.card_products.destroy_image']
    }
  }
  cards: {
    cards: {
      index: typeof routes['cards.cards.index']
      store: typeof routes['cards.cards.store']
      show: typeof routes['cards.cards.show']
      topup: typeof routes['cards.cards.topup']
      withdraw: typeof routes['cards.cards.withdraw']
      freeze: typeof routes['cards.cards.freeze']
      unfreeze: typeof routes['cards.cards.unfreeze']
      terminate: typeof routes['cards.cards.terminate']
      transactions: typeof routes['cards.cards.transactions']
    }
    cardProducts: {
      catalogue: typeof routes['cards.card_products.catalogue']
    }
  }
  agents: {
    kyc: {
      agentKyc: {
        submit: typeof routes['agents.kyc.agent_kyc.submit']
        getStatus: typeof routes['agents.kyc.agent_kyc.get_status']
      }
    }
    float: {
      agentFloat: {
        transfer: typeof routes['agents.float.agent_float.transfer']
        convert: typeof routes['agents.float.agent_float.convert']
      }
    }
    agents: {
      index: typeof routes['agents.agents.index']
      store: typeof routes['agents.agents.store']
      show: typeof routes['agents.agents.show']
      update: typeof routes['agents.agents.update']
      approve: typeof routes['agents.agents.approve']
      activate: typeof routes['agents.agents.activate']
      suspend: typeof routes['agents.agents.suspend']
      deactivate: typeof routes['agents.agents.deactivate']
    }
  }
  kyc: {
    kyc: {
      submit: typeof routes['kyc.kyc.submit']
      getStatus: typeof routes['kyc.kyc.get_status']
      index: typeof routes['kyc.kyc.index']
      show: typeof routes['kyc.kyc.show']
      approve: typeof routes['kyc.kyc.approve']
      reject: typeof routes['kyc.kyc.reject']
      listDocuments: typeof routes['kyc.kyc.list_documents']
      getDocument: typeof routes['kyc.kyc.get_document']
    }
  }
  disputes: {
    disputes: {
      index: typeof routes['disputes.disputes.index']
      store: typeof routes['disputes.disputes.store']
      listAll: typeof routes['disputes.disputes.list_all']
      adminMessages: typeof routes['disputes.disputes.admin_messages']
      adminPostMessage: typeof routes['disputes.disputes.admin_post_message']
      adminShow: typeof routes['disputes.disputes.admin_show']
      show: typeof routes['disputes.disputes.show']
      messages: typeof routes['disputes.disputes.messages']
      postMessage: typeof routes['disputes.disputes.post_message']
      withdraw: typeof routes['disputes.disputes.withdraw']
      close: typeof routes['disputes.disputes.close']
    }
  }
  webhooks: {
    webhooks: {
      index: typeof routes['webhooks.webhooks.index']
      store: typeof routes['webhooks.webhooks.store']
      destroy: typeof routes['webhooks.webhooks.destroy']
      getDeliveries: typeof routes['webhooks.webhooks.get_deliveries']
    }
    pawapay: {
      mobileMoneyWebhooks: {
        handleDeposit: typeof routes['webhooks.pawapay.mobile_money_webhooks.handle_deposit']
        handlePayout: typeof routes['webhooks.pawapay.mobile_money_webhooks.handle_payout']
      }
    }
    payscribe: {
      cards: typeof routes['webhooks.payscribe.cards']
    }
  }
  mobileMoney: {
    mobileMoneyDeposits: {
      store: typeof routes['mobile_money.mobile_money_deposits.store']
      show: typeof routes['mobile_money.mobile_money_deposits.show']
      liveStatus: typeof routes['mobile_money.mobile_money_deposits.live_status']
    }
    mobileMoneyPayouts: {
      store: typeof routes['mobile_money.mobile_money_payouts.store']
      show: typeof routes['mobile_money.mobile_money_payouts.show']
      liveStatus: typeof routes['mobile_money.mobile_money_payouts.live_status']
    }
    mobileMoneyToolkit: {
      predictProvider: typeof routes['mobile_money.mobile_money_toolkit.predict_provider']
      listPaymentMethods: typeof routes['mobile_money.mobile_money_toolkit.list_payment_methods']
      listAllPaymentMethodsRaw: typeof routes['mobile_money.mobile_money_toolkit.list_all_payment_methods_raw']
    }
  }
  businesses: {
    businesses: {
      index: typeof routes['businesses.businesses.index']
      store: typeof routes['businesses.businesses.store']
      show: typeof routes['businesses.businesses.show']
      approve: typeof routes['businesses.businesses.approve']
      activate: typeof routes['businesses.businesses.activate']
      suspend: typeof routes['businesses.businesses.suspend']
      deactivate: typeof routes['businesses.businesses.deactivate']
      issueApiKey: typeof routes['businesses.businesses.issue_api_key']
      revokeApiKey: typeof routes['businesses.businesses.revoke_api_key']
      assignPlan: typeof routes['businesses.businesses.assign_plan']
    }
  }
  plans: {
    plans: {
      index: typeof routes['plans.plans.index']
      store: typeof routes['plans.plans.store']
      show: typeof routes['plans.plans.show']
      update: typeof routes['plans.plans.update']
      archive: typeof routes['plans.plans.archive']
    }
  }
  users: {
    users: {
      index: typeof routes['users.users.index']
      show: typeof routes['users.users.show']
      resetPin: typeof routes['users.users.reset_pin']
      freezeWallet: typeof routes['users.users.freeze_wallet']
      unfreezeWallet: typeof routes['users.users.unfreeze_wallet']
    }
  }
  internalUsers: {
    internalUsers: {
      index: typeof routes['internal_users.internal_users.index']
      store: typeof routes['internal_users.internal_users.store']
      show: typeof routes['internal_users.internal_users.show']
      activate: typeof routes['internal_users.internal_users.activate']
      suspend: typeof routes['internal_users.internal_users.suspend']
      deactivate: typeof routes['internal_users.internal_users.deactivate']
      resetPassword: typeof routes['internal_users.internal_users.reset_password']
      resetMfa: typeof routes['internal_users.internal_users.reset_mfa']
    }
  }
  admin: {
    adminTransactions: {
      index: typeof routes['admin.admin_transactions.index']
      show: typeof routes['admin.admin_transactions.show']
    }
    adminAuditLogs: {
      index: typeof routes['admin.admin_audit_logs.index']
      show: typeof routes['admin.admin_audit_logs.show']
    }
    adminCards: {
      index: typeof routes['admin.admin_cards.index']
      store: typeof routes['admin.admin_cards.store']
      show: typeof routes['admin.admin_cards.show']
      transactions: typeof routes['admin.admin_cards.transactions']
      topup: typeof routes['admin.admin_cards.topup']
      freeze: typeof routes['admin.admin_cards.freeze']
      unfreeze: typeof routes['admin.admin_cards.unfreeze']
      terminate: typeof routes['admin.admin_cards.terminate']
    }
    adminLedgerAccounts: {
      index: typeof routes['admin.admin_ledger_accounts.index']
      show: typeof routes['admin.admin_ledger_accounts.show']
    }
    currencies: {
      adminIndex: typeof routes['admin.currencies.admin_index']
      adminShow: typeof routes['admin.currencies.admin_show']
      adminUpdate: typeof routes['admin.currencies.admin_update']
    }
    exchangeRates: {
      adminIndex: typeof routes['admin.exchange_rates.admin_index']
      adminRefresh: typeof routes['admin.exchange_rates.admin_refresh']
      adminShow: typeof routes['admin.exchange_rates.admin_show']
      adminUpdate: typeof routes['admin.exchange_rates.admin_update']
    }
    adminAccounting: {
      balanceSheet: typeof routes['admin.admin_accounting.balance_sheet']
      revenue: typeof routes['admin.admin_accounting.revenue']
      reconcile: typeof routes['admin.admin_accounting.reconcile']
    }
  }
  business: {
    businessDeposits: {
      store: typeof routes['business.business_deposits.store']
      show: typeof routes['business.business_deposits.show']
      liveStatus: typeof routes['business.business_deposits.live_status']
    }
    businessPayouts: {
      store: typeof routes['business.business_payouts.store']
      show: typeof routes['business.business_payouts.show']
      liveStatus: typeof routes['business.business_payouts.live_status']
    }
    businessWallet: {
      store: typeof routes['business.business_wallet.store']
      index: typeof routes['business.business_wallet.index']
      show: typeof routes['business.business_wallet.show']
    }
    businessSwaps: {
      quote: typeof routes['business.business_swaps.quote']
      store: typeof routes['business.business_swaps.store']
    }
    businessTransactions: {
      index: typeof routes['business.business_transactions.index']
    }
    businessWebhooks: {
      index: typeof routes['business.business_webhooks.index']
      store: typeof routes['business.business_webhooks.store']
      destroy: typeof routes['business.business_webhooks.destroy']
      getDeliveries: typeof routes['business.business_webhooks.get_deliveries']
    }
    businessToolkit: {
      listPaymentMethods: typeof routes['business.business_toolkit.list_payment_methods']
      listAllPaymentMethodsRaw: typeof routes['business.business_toolkit.list_all_payment_methods_raw']
    }
    businessPlan: {
      index: typeof routes['business.business_plan.index']
      current: typeof routes['business.business_plan.current']
      subscribe: typeof routes['business.business_plan.subscribe']
    }
    businessSandbox: {
      fund: typeof routes['business.business_sandbox.fund']
    }
    businessCards: {
      index: typeof routes['business.business_cards.index']
      store: typeof routes['business.business_cards.store']
      show: typeof routes['business.business_cards.show']
      topup: typeof routes['business.business_cards.topup']
      withdraw: typeof routes['business.business_cards.withdraw']
      freeze: typeof routes['business.business_cards.freeze']
      unfreeze: typeof routes['business.business_cards.unfreeze']
      terminate: typeof routes['business.business_cards.terminate']
      transactions: typeof routes['business.business_cards.transactions']
    }
    auth: {
      businessDashboardAuth: {
        requestSignupOtp: typeof routes['business.auth.business_dashboard_auth.request_signup_otp']
        signup: typeof routes['business.auth.business_dashboard_auth.signup']
        login: typeof routes['business.auth.business_dashboard_auth.login']
        refresh: typeof routes['business.auth.business_dashboard_auth.refresh']
        logout: typeof routes['business.auth.business_dashboard_auth.logout']
        changePassword: typeof routes['business.auth.business_dashboard_auth.change_password']
      }
    }
    dashboard: {
      onboarding: {
        businessDashboardProfile: {
          show: typeof routes['business.dashboard.onboarding.business_dashboard_profile.show']
          update: typeof routes['business.dashboard.onboarding.business_dashboard_profile.update']
        }
        businessPin: {
          setPin: typeof routes['business.dashboard.onboarding.business_pin.set_pin']
          changePin: typeof routes['business.dashboard.onboarding.business_pin.change_pin']
        }
        businessKyc: {
          submit: typeof routes['business.dashboard.onboarding.business_kyc.submit']
          getStatus: typeof routes['business.dashboard.onboarding.business_kyc.get_status']
        }
        businessNotifications: {
          index: typeof routes['business.dashboard.onboarding.business_notifications.index']
          markRead: typeof routes['business.dashboard.onboarding.business_notifications.mark_read']
          markAllRead: typeof routes['business.dashboard.onboarding.business_notifications.mark_all_read']
        }
        businessPlan: {
          index: typeof routes['business.dashboard.onboarding.business_plan.index']
          current: typeof routes['business.dashboard.onboarding.business_plan.current']
          subscribe: typeof routes['business.dashboard.onboarding.business_plan.subscribe']
        }
      }
      pinReset: {
        businessPin: {
          requestReset: typeof routes['business.dashboard.pin_reset.business_pin.request_reset']
          confirmReset: typeof routes['business.dashboard.pin_reset.business_pin.confirm_reset']
        }
      }
      businessDeposits: {
        store: typeof routes['business.dashboard.business_deposits.store']
        show: typeof routes['business.dashboard.business_deposits.show']
        liveStatus: typeof routes['business.dashboard.business_deposits.live_status']
      }
      businessPayouts: {
        store: typeof routes['business.dashboard.business_payouts.store']
        show: typeof routes['business.dashboard.business_payouts.show']
        liveStatus: typeof routes['business.dashboard.business_payouts.live_status']
      }
      businessWallet: {
        store: typeof routes['business.dashboard.business_wallet.store']
        index: typeof routes['business.dashboard.business_wallet.index']
        show: typeof routes['business.dashboard.business_wallet.show']
      }
      businessSwaps: {
        quote: typeof routes['business.dashboard.business_swaps.quote']
        store: typeof routes['business.dashboard.business_swaps.store']
      }
      businessTransactions: {
        index: typeof routes['business.dashboard.business_transactions.index']
      }
      businessWebhooks: {
        index: typeof routes['business.dashboard.business_webhooks.index']
        store: typeof routes['business.dashboard.business_webhooks.store']
        destroy: typeof routes['business.dashboard.business_webhooks.destroy']
        getDeliveries: typeof routes['business.dashboard.business_webhooks.get_deliveries']
      }
      businessToolkit: {
        listPaymentMethods: typeof routes['business.dashboard.business_toolkit.list_payment_methods']
        listAllPaymentMethodsRaw: typeof routes['business.dashboard.business_toolkit.list_all_payment_methods_raw']
      }
      businessOverview: {
        show: typeof routes['business.dashboard.business_overview.show']
      }
      businessSandbox: {
        fund: typeof routes['business.dashboard.business_sandbox.fund']
      }
      businessDashboardApiKeys: {
        index: typeof routes['business.dashboard.business_dashboard_api_keys.index']
        store: typeof routes['business.dashboard.business_dashboard_api_keys.store']
        destroy: typeof routes['business.dashboard.business_dashboard_api_keys.destroy']
      }
      businessCards: {
        index: typeof routes['business.dashboard.business_cards.index']
        store: typeof routes['business.dashboard.business_cards.store']
        show: typeof routes['business.dashboard.business_cards.show']
        topup: typeof routes['business.dashboard.business_cards.topup']
        withdraw: typeof routes['business.dashboard.business_cards.withdraw']
        freeze: typeof routes['business.dashboard.business_cards.freeze']
        unfreeze: typeof routes['business.dashboard.business_cards.unfreeze']
        terminate: typeof routes['business.dashboard.business_cards.terminate']
        transactions: typeof routes['business.dashboard.business_cards.transactions']
      }
    }
  }
  internal: {
    auth: {
      internalAuth: {
        login: typeof routes['internal.auth.internal_auth.login']
        logout: typeof routes['internal.auth.internal_auth.logout']
        changePassword: typeof routes['internal.auth.internal_auth.change_password']
        verifyMfa: typeof routes['internal.auth.internal_auth.verify_mfa']
        setupMfa: typeof routes['internal.auth.internal_auth.setup_mfa']
        enableMfa: typeof routes['internal.auth.internal_auth.enable_mfa']
        me: typeof routes['internal.auth.internal_auth.me']
      }
    }
  }
}
