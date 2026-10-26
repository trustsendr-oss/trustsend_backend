/* eslint-disable prettier/prettier */
import type { routes } from './index.ts'

export interface ApiDefinition {
  assets: {
    usdFlag: typeof routes['assets.usd_flag']
    currencyLogo: typeof routes['assets.currency_logo']
  }
  auth: {
    newAccount: {
      requestOtp: typeof routes['auth.new_account.request_otp']
      store: typeof routes['auth.new_account.store']
    }
    accessTokens: {
      store: typeof routes['auth.access_tokens.store']
      refresh: typeof routes['auth.access_tokens.refresh']
    }
    deviceSessions: {
      pinLogin: typeof routes['auth.device_sessions.pin_login']
      revoke: typeof routes['auth.device_sessions.revoke']
    }
  }
  profile: {
    profile: {
      show: typeof routes['profile.profile.show']
      avatar: typeof routes['profile.profile.avatar']
      updateAvatar: typeof routes['profile.profile.update_avatar']
      destroyAvatar: typeof routes['profile.profile.destroy_avatar']
    }
    pushTokens: {
      store: typeof routes['profile.push_tokens.store']
      destroy: typeof routes['profile.push_tokens.destroy']
    }
    deviceSessions: {
      store: typeof routes['profile.device_sessions.store']
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
      nearbyAgents: typeof routes['directory.directory.nearby_agents']
      lookupMerchant: typeof routes['directory.directory.lookup_merchant']
    }
  }
  merchantPayments: {
    store: typeof routes['merchant_payments.store']
  }
  currencies: {
    index: typeof routes['currencies.index']
  }
  exchangeRates: {
    index: typeof routes['exchange_rates.index']
  }
  pricing: {
    index: typeof routes['pricing.index']
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
  likilibas: {
    likilibas: {
      index: typeof routes['likilibas.likilibas.index']
      store: typeof routes['likilibas.likilibas.store']
      invitations: typeof routes['likilibas.likilibas.invitations']
      acceptLink: typeof routes['likilibas.likilibas.accept_link']
      acceptInvitation: typeof routes['likilibas.likilibas.accept_invitation']
      declineInvitation: typeof routes['likilibas.likilibas.decline_invitation']
      admitInvitation: typeof routes['likilibas.likilibas.admit_invitation']
      rejectInvitation: typeof routes['likilibas.likilibas.reject_invitation']
      revokeInvitation: typeof routes['likilibas.likilibas.revoke_invitation']
      show: typeof routes['likilibas.likilibas.show']
      update: typeof routes['likilibas.likilibas.update']
      rules: typeof routes['likilibas.likilibas.rules']
      history: typeof routes['likilibas.likilibas.history']
      penalties: typeof routes['likilibas.likilibas.penalties']
      mine: typeof routes['likilibas.likilibas.mine']
      contributions: typeof routes['likilibas.likilibas.contributions']
      draw: typeof routes['likilibas.likilibas.draw']
      feed: typeof routes['likilibas.likilibas.feed']
      sendMessage: typeof routes['likilibas.likilibas.send_message']
      deleteMessage: typeof routes['likilibas.likilibas.delete_message']
      reportMessage: typeof routes['likilibas.likilibas.report_message']
      reactToMessage: typeof routes['likilibas.likilibas.react_to_message']
      markRead: typeof routes['likilibas.likilibas.mark_read']
      memberAvatar: typeof routes['likilibas.likilibas.member_avatar']
      updateProfile: typeof routes['likilibas.likilibas.update_profile']
      photo: typeof routes['likilibas.likilibas.photo']
      updatePhoto: typeof routes['likilibas.likilibas.update_photo']
      removePhoto: typeof routes['likilibas.likilibas.remove_photo']
      invite: typeof routes['likilibas.likilibas.invite']
      removeMember: typeof routes['likilibas.likilibas.remove_member']
      lock: typeof routes['likilibas.likilibas.lock']
      commit: typeof routes['likilibas.likilibas.commit']
      start: typeof routes['likilibas.likilibas.start']
      cancel: typeof routes['likilibas.likilibas.cancel']
      leave: typeof routes['likilibas.likilibas.leave']
      contribute: typeof routes['likilibas.likilibas.contribute']
      repay: typeof routes['likilibas.likilibas.repay']
      mandate: typeof routes['likilibas.likilibas.mandate']
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
        withdraw: typeof routes['agents.float.agent_float.withdraw']
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
  agentWorkspace: {
    agentWorkspace: {
      me: typeof routes['agent_workspace.agent_workspace.me']
      operations: typeof routes['agent_workspace.agent_workspace.operations']
      operation: typeof routes['agent_workspace.agent_workspace.operation']
      cashOut: typeof routes['agent_workspace.agent_workspace.cash_out']
      subAgents: typeof routes['agent_workspace.agent_workspace.sub_agents']
    }
  }
  agentApplications: {
    agentApplications: {
      mine: typeof routes['agent_applications.agent_applications.mine']
      eligibility: typeof routes['agent_applications.agent_applications.eligibility']
      store: typeof routes['agent_applications.agent_applications.store']
    }
  }
  remittances: {
    remittances: {
      corridor: typeof routes['remittances.remittances.corridor']
      quote: typeof routes['remittances.remittances.quote']
      index: typeof routes['remittances.remittances.index']
      store: typeof routes['remittances.remittances.store']
      show: typeof routes['remittances.remittances.show']
      cancel: typeof routes['remittances.remittances.cancel']
    }
  }
  agentRemittances: {
    agentRemittances: {
      lookup: typeof routes['agent_remittances.agent_remittances.lookup']
      pay: typeof routes['agent_remittances.agent_remittances.pay']
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
    alchemy: typeof routes['webhooks.alchemy']
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
  crypto: {
    cryptoDeposits: {
      options: typeof routes['crypto.crypto_deposits.options']
      address: typeof routes['crypto.crypto_deposits.address']
      index: typeof routes['crypto.crypto_deposits.index']
    }
    cryptoPayouts: {
      options: typeof routes['crypto.crypto_payouts.options']
      index: typeof routes['crypto.crypto_payouts.index']
      store: typeof routes['crypto.crypto_payouts.store']
      show: typeof routes['crypto.crypto_payouts.show']
    }
  }
  counter: {
    counterSessions: {
      index: typeof routes['counter.counter_sessions.index']
      current: typeof routes['counter.counter_sessions.current']
      store: typeof routes['counter.counter_sessions.store']
      close: typeof routes['counter.counter_sessions.close']
      reconcile: typeof routes['counter.counter_sessions.reconcile']
    }
    counterCash: {
      cashIn: typeof routes['counter.counter_cash.cash_in']
      confirmCashIn: typeof routes['counter.counter_cash.confirm_cash_in']
      rejectCashIn: typeof routes['counter.counter_cash.reject_cash_in']
      cashOut: typeof routes['counter.counter_cash.cash_out']
      confirmCashOut: typeof routes['counter.counter_cash.confirm_cash_out']
      cancelCashOut: typeof routes['counter.counter_cash.cancel_cash_out']
      pending: typeof routes['counter.counter_cash.pending']
    }
    counterJournal: {
      index: typeof routes['counter.counter_journal.index']
    }
    counterCustomers: {
      show: typeof routes['counter.counter_customers.show']
      store: typeof routes['counter.counter_customers.store']
    }
    counterSavings: {
      index: typeof routes['counter.counter_savings.index']
      store: typeof routes['counter.counter_savings.store']
      deposit: typeof routes['counter.counter_savings.deposit']
      withdraw: typeof routes['counter.counter_savings.withdraw']
    }
    counterLoans: {
      index: typeof routes['counter.counter_loans.index']
      show: typeof routes['counter.counter_loans.show']
      approve: typeof routes['counter.counter_loans.approve']
      reject: typeof routes['counter.counter_loans.reject']
      disburse: typeof routes['counter.counter_loans.disburse']
    }
    counterLoansCommittee: {
      submit: typeof routes['counter.counter_loans_committee.submit']
      committeeApprove: typeof routes['counter.counter_loans_committee.committee_approve']
      committeeReject: typeof routes['counter.counter_loans_committee.committee_reject']
    }
    counterLoanOfficers: {
      assignLoan: typeof routes['counter.counter_loan_officers.assign_loan']
      assignBorrower: typeof routes['counter.counter_loan_officers.assign_borrower']
      portfolio: typeof routes['counter.counter_loan_officers.portfolio']
    }
    counterGroups: {
      index: typeof routes['counter.counter_groups.index']
      store: typeof routes['counter.counter_groups.store']
      show: typeof routes['counter.counter_groups.show']
      summary: typeof routes['counter.counter_groups.summary']
      addMember: typeof routes['counter.counter_groups.add_member']
      removeMember: typeof routes['counter.counter_groups.remove_member']
    }
    counterLoansRestructure: {
      restructure: typeof routes['counter.counter_loans_restructure.restructure']
      history: typeof routes['counter.counter_loans_restructure.history']
    }
    counterLoansDefault: {
      markDefault: typeof routes['counter.counter_loans_default.mark_default']
      seizeCollateral: typeof routes['counter.counter_loans_default.seize_collateral']
    }
    counterPenalties: {
      run: typeof routes['counter.counter_penalties.run']
    }
    counterVault: {
      index: typeof routes['counter.counter_vault.index']
      replenish: typeof routes['counter.counter_vault.replenish']
      sweep: typeof routes['counter.counter_vault.sweep']
      transfers: typeof routes['counter.counter_vault.transfers']
      approve: typeof routes['counter.counter_vault.approve']
      reject: typeof routes['counter.counter_vault.reject']
    }
  }
  business: {
    staff: {
      me: typeof routes['business.staff.me']
    }
    lendingProducts: {
      index: typeof routes['business.lending_products.index']
      store: typeof routes['business.lending_products.store']
      show: typeof routes['business.lending_products.show']
      update: typeof routes['business.lending_products.update']
      submit: typeof routes['business.lending_products.submit']
      archive: typeof routes['business.lending_products.archive']
    }
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
    businessCrypto: {
      address: typeof routes['business.business_crypto.address']
      payout: typeof routes['business.business_crypto.payout']
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
    businessMerchantPayments: {
      index: typeof routes['business.business_merchant_payments.index']
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
        businessLogo: {
          dashboardUpload: typeof routes['business.dashboard.onboarding.business_logo.dashboard_upload']
          dashboardRemove: typeof routes['business.dashboard.onboarding.business_logo.dashboard_remove']
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
      businessCrypto: {
        address: typeof routes['business.dashboard.business_crypto.address']
        payout: typeof routes['business.dashboard.business_crypto.payout']
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
      businessMerchantPayments: {
        index: typeof routes['business.dashboard.business_merchant_payments.index']
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
      lendingProducts: {
        index: typeof routes['business.dashboard.lending_products.index']
        store: typeof routes['business.dashboard.lending_products.store']
        show: typeof routes['business.dashboard.lending_products.show']
        update: typeof routes['business.dashboard.lending_products.update']
        submit: typeof routes['business.dashboard.lending_products.submit']
        archive: typeof routes['business.dashboard.lending_products.archive']
      }
      businessDashboardOutlets: {
        index: typeof routes['business.dashboard.business_dashboard_outlets.index']
        store: typeof routes['business.dashboard.business_dashboard_outlets.store']
        show: typeof routes['business.dashboard.business_dashboard_outlets.show']
        update: typeof routes['business.dashboard.business_dashboard_outlets.update']
        suspend: typeof routes['business.dashboard.business_dashboard_outlets.suspend']
        reactivate: typeof routes['business.dashboard.business_dashboard_outlets.reactivate']
      }
      businessDashboardStaff: {
        index: typeof routes['business.dashboard.business_dashboard_staff.index']
        store: typeof routes['business.dashboard.business_dashboard_staff.store']
        update: typeof routes['business.dashboard.business_dashboard_staff.update']
      }
      businessDashboardActivity: {
        sessions: typeof routes['business.dashboard.business_dashboard_activity.sessions']
      }
      businessDashboardPortfolio: {
        loans: typeof routes['business.dashboard.business_dashboard_portfolio.loans']
        loan: typeof routes['business.dashboard.business_dashboard_portfolio.loan']
        savings: typeof routes['business.dashboard.business_dashboard_portfolio.savings']
        customers: typeof routes['business.dashboard.business_dashboard_portfolio.customers']
      }
      counterJournal: {
        index: typeof routes['business.dashboard.counter_journal.index']
      }
      businessDashboardImf: {
        regulatoryReport: typeof routes['business.dashboard.business_dashboard_imf.regulatory_report']
        provisioning: typeof routes['business.dashboard.business_dashboard_imf.provisioning']
        arrears: typeof routes['business.dashboard.business_dashboard_imf.arrears']
      }
      businessDashboardImfMigration: {
        validate: typeof routes['business.dashboard.business_dashboard_imf_migration.validate']
        commit: typeof routes['business.dashboard.business_dashboard_imf_migration.commit']
      }
    }
  }
  finance: {
    products: {
      index: typeof routes['finance.products.index']
      show: typeof routes['finance.products.show']
    }
    institutions: {
      index: typeof routes['finance.institutions.index']
      show: typeof routes['finance.institutions.show']
      logo: typeof routes['finance.institutions.logo']
    }
    savings: {
      savingsAccounts: {
        index: typeof routes['finance.savings.savings_accounts.index']
        store: typeof routes['finance.savings.savings_accounts.store']
        show: typeof routes['finance.savings.savings_accounts.show']
        deposit: typeof routes['finance.savings.savings_accounts.deposit']
        withdraw: typeof routes['finance.savings.savings_accounts.withdraw']
        close: typeof routes['finance.savings.savings_accounts.close']
      }
      borrowerLoans: {
        index: typeof routes['finance.savings.borrower_loans.index']
        store: typeof routes['finance.savings.borrower_loans.store']
        show: typeof routes['finance.savings.borrower_loans.show']
        repay: typeof routes['finance.savings.borrower_loans.repay']
      }
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
    businessLogo: {
      adminUpload: typeof routes['businesses.business_logo.admin_upload']
      adminRemove: typeof routes['businesses.business_logo.admin_remove']
    }
  }
  admin: {
    businessStaff: {
      adminBusinessStaff: {
        index: typeof routes['admin.business_staff.admin_business_staff.index']
        store: typeof routes['admin.business_staff.admin_business_staff.store']
        show: typeof routes['admin.business_staff.admin_business_staff.show']
        update: typeof routes['admin.business_staff.admin_business_staff.update']
      }
    }
    remittances: {
      adminRemittances: {
        index: typeof routes['admin.remittances.admin_remittances.index']
        show: typeof routes['admin.remittances.admin_remittances.show']
        release: typeof routes['admin.remittances.admin_remittances.release']
        reject: typeof routes['admin.remittances.admin_remittances.reject']
        watchlist: typeof routes['admin.remittances.admin_remittances.watchlist']
        addToWatchlist: typeof routes['admin.remittances.admin_remittances.add_to_watchlist']
        removeFromWatchlist: typeof routes['admin.remittances.admin_remittances.remove_from_watchlist']
      }
      adminCryptoPayouts: {
        treasury: typeof routes['admin.remittances.admin_crypto_payouts.treasury']
        index: typeof routes['admin.remittances.admin_crypto_payouts.index']
        show: typeof routes['admin.remittances.admin_crypto_payouts.show']
        sent: typeof routes['admin.remittances.admin_crypto_payouts.sent']
        reject: typeof routes['admin.remittances.admin_crypto_payouts.reject']
      }
    }
    agentApplications: {
      adminAgentApplications: {
        index: typeof routes['admin.agent_applications.admin_agent_applications.index']
        show: typeof routes['admin.agent_applications.admin_agent_applications.show']
        review: typeof routes['admin.agent_applications.admin_agent_applications.review']
        approve: typeof routes['admin.agent_applications.admin_agent_applications.approve']
        reject: typeof routes['admin.agent_applications.admin_agent_applications.reject']
      }
    }
    financialProducts: {
      adminFinancialProducts: {
        index: typeof routes['admin.financial_products.admin_financial_products.index']
        show: typeof routes['admin.financial_products.admin_financial_products.show']
        approve: typeof routes['admin.financial_products.admin_financial_products.approve']
        reject: typeof routes['admin.financial_products.admin_financial_products.reject']
        archive: typeof routes['admin.financial_products.admin_financial_products.archive']
      }
    }
    lending: {
      adminLending: {
        loans: typeof routes['admin.lending.admin_lending.loans']
        loan: typeof routes['admin.lending.admin_lending.loan']
        savings: typeof routes['admin.lending.admin_lending.savings']
        position: typeof routes['admin.lending.admin_lending.position']
      }
    }
    likilibas: {
      adminLikilibas: {
        index: typeof routes['admin.likilibas.admin_likilibas.index']
        waivePenalty: typeof routes['admin.likilibas.admin_likilibas.waive_penalty']
        hideMessage: typeof routes['admin.likilibas.admin_likilibas.hide_message']
        messages: typeof routes['admin.likilibas.admin_likilibas.messages']
        show: typeof routes['admin.likilibas.admin_likilibas.show']
        history: typeof routes['admin.likilibas.admin_likilibas.history']
        penalties: typeof routes['admin.likilibas.admin_likilibas.penalties']
        suspend: typeof routes['admin.likilibas.admin_likilibas.suspend']
        resume: typeof routes['admin.likilibas.admin_likilibas.resume']
      }
    }
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
  eventStream: typeof routes['event_stream']
  subscribe: typeof routes['subscribe']
  unsubscribe: typeof routes['unsubscribe']
}
