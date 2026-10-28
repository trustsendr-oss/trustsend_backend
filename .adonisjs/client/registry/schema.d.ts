/* eslint-disable prettier/prettier */
/// <reference path="../manifest.d.ts" />

import type { ExtractBody, ExtractErrorResponse, ExtractQuery, ExtractQueryForGet, ExtractResponse } from '@tuyau/core/types'
import type { InferInput, SimpleError } from '@vinejs/vine/types'

export type ParamValue = string | number | bigint | boolean

export interface Registry {
  'assets.usd_flag': {
    methods: ["GET","HEAD"]
    pattern: '/assets/flags/usd.svg'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/assets_controller').default['usdFlag']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/assets_controller').default['usdFlag']>>>
    }
  }
  'assets.currency_logo': {
    methods: ["GET","HEAD"]
    pattern: '/assets/currencies/:file'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { file: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/assets_controller').default['currencyLogo']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/assets_controller').default['currencyLogo']>>>
    }
  }
  'card_checkout.page': {
    methods: ["GET","HEAD"]
    pattern: '/card-checkout/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/card_payments/card_checkout_controller').default['page']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/card_payments/card_checkout_controller').default['page']>>>
    }
  }
  'card_checkout.three_ds_return.show': {
    methods: ["GET","HEAD"]
    pattern: '/card-checkout/:id/3ds-return'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/card_payments/card_checkout_controller').default['threeDsReturn']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/card_payments/card_checkout_controller').default['threeDsReturn']>>>
    }
  }
  'card_checkout.three_ds_return.store': {
    methods: ["POST"]
    pattern: '/card-checkout/:id/3ds-return'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/card_payments/card_checkout_controller').default['threeDsReturn']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/card_payments/card_checkout_controller').default['threeDsReturn']>>>
    }
  }
  'auth.new_account.request_otp': {
    methods: ["POST"]
    pattern: '/api/v1/auth/signup/request-otp'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/user').requestSignupOtpValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/user').requestSignupOtpValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/new_account_controller').default['requestOtp']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/new_account_controller').default['requestOtp']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'auth.new_account.store': {
    methods: ["POST"]
    pattern: '/api/v1/auth/signup'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/user').signupValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/user').signupValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/new_account_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/new_account_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'auth.access_tokens.store': {
    methods: ["POST"]
    pattern: '/api/v1/auth/login'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/user').loginValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/user').loginValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/access_tokens_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/access_tokens_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'auth.access_tokens.refresh': {
    methods: ["POST"]
    pattern: '/api/v1/auth/refresh'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/access_tokens_controller').default['refresh']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/access_tokens_controller').default['refresh']>>>
    }
  }
  'auth.device_sessions.pin_login': {
    methods: ["POST"]
    pattern: '/api/v1/auth/pin-login'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/device_sessions_controller').default['pinLogin']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/device_sessions_controller').default['pinLogin']>>>
    }
  }
  'auth.device_sessions.revoke': {
    methods: ["POST"]
    pattern: '/api/v1/auth/device-sessions/revoke'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/device_sessions_controller').default['revoke']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/device_sessions_controller').default['revoke']>>>
    }
  }
  'profile.profile.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/account/profile'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/profile_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/profile_controller').default['show']>>>
    }
  }
  'profile.profile.avatar': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/account/avatar'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/profile_controller').default['avatar']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/profile_controller').default['avatar']>>>
    }
  }
  'profile.profile.update_avatar': {
    methods: ["POST"]
    pattern: '/api/v1/account/avatar'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/profile_controller').default['updateAvatar']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/profile_controller').default['updateAvatar']>>>
    }
  }
  'profile.profile.destroy_avatar': {
    methods: ["DELETE"]
    pattern: '/api/v1/account/avatar'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/profile_controller').default['destroyAvatar']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/profile_controller').default['destroyAvatar']>>>
    }
  }
  'profile.push_tokens.store': {
    methods: ["POST"]
    pattern: '/api/v1/account/push-tokens'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/push_tokens_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/push_tokens_controller').default['store']>>>
    }
  }
  'profile.device_sessions.store': {
    methods: ["POST"]
    pattern: '/api/v1/account/device-sessions'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/device_sessions_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/device_sessions_controller').default['store']>>>
    }
  }
  'profile.push_tokens.destroy': {
    methods: ["DELETE"]
    pattern: '/api/v1/account/push-tokens'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/push_tokens_controller').default['destroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/push_tokens_controller').default['destroy']>>>
    }
  }
  'profile.access_tokens.destroy': {
    methods: ["POST"]
    pattern: '/api/v1/account/logout'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/access_tokens_controller').default['destroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/access_tokens_controller').default['destroy']>>>
    }
  }
  'profile.pin.set_pin': {
    methods: ["POST"]
    pattern: '/api/v1/account/pin'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/pin_controller').default['setPin']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/pin_controller').default['setPin']>>>
    }
  }
  'profile.pin.change_pin': {
    methods: ["POST"]
    pattern: '/api/v1/account/pin/change'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/pin_controller').default['changePin']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/pin_controller').default['changePin']>>>
    }
  }
  'profile.pin_reset.pin.request_reset': {
    methods: ["POST"]
    pattern: '/api/v1/account/pin/reset'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/pin_controller').default['requestReset']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/pin_controller').default['requestReset']>>>
    }
  }
  'profile.pin_reset.pin.confirm_reset': {
    methods: ["POST"]
    pattern: '/api/v1/account/pin/reset/confirm'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/pin_controller').default['confirmReset']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/pin_controller').default['confirmReset']>>>
    }
  }
  'notifications.notifications.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/notifications'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/notifications_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/notifications_controller').default['index']>>>
    }
  }
  'notifications.notifications.mark_read': {
    methods: ["PATCH"]
    pattern: '/api/v1/notifications/:id/read'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/notifications_controller').default['markRead']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/notifications_controller').default['markRead']>>>
    }
  }
  'notifications.notifications.mark_all_read': {
    methods: ["POST"]
    pattern: '/api/v1/notifications/read-all'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/notifications_controller').default['markAllRead']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/notifications_controller').default['markAllRead']>>>
    }
  }
  'directory.directory.lookup_recipient': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/directory/recipients'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/directory_controller').default['lookupRecipient']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/directory_controller').default['lookupRecipient']>>>
    }
  }
  'directory.directory.lookup_agent': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/directory/agents'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/directory_controller').default['lookupAgent']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/directory_controller').default['lookupAgent']>>>
    }
  }
  'directory.directory.nearby_agents': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/directory/agents/nearby'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/directory_controller').default['nearbyAgents']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/directory_controller').default['nearbyAgents']>>>
    }
  }
  'directory.directory.lookup_merchant': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/directory/merchants'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/directory_controller').default['lookupMerchant']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/directory_controller').default['lookupMerchant']>>>
    }
  }
  'merchant_payments.store': {
    methods: ["POST"]
    pattern: '/api/v1/merchant-payments'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/merchants/merchant_payments_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/merchants/merchant_payments_controller').default['store']>>>
    }
  }
  'currencies.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/currencies'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/currencies_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/currencies_controller').default['index']>>>
    }
  }
  'exchange_rates.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/exchange-rates'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/fx').listExchangeRatesValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/fx/exchange_rates_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/fx/exchange_rates_controller').default['index']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'pricing.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/pricing'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/business/plan_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/business/plan_controller').default['index']>>>
    }
  }
  'swaps.swaps.quote': {
    methods: ["POST"]
    pattern: '/api/v1/swaps/quote'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/fx').createSwapQuoteValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/fx').createSwapQuoteValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/fx/swaps_controller').default['quote']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/fx/swaps_controller').default['quote']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'swaps.swaps.store': {
    methods: ["POST"]
    pattern: '/api/v1/swaps'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/fx').executeSwapValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/fx').executeSwapValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/fx/swaps_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/fx/swaps_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'wallets.wallets.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/wallets'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/wallets_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/wallets_controller').default['index']>>>
    }
  }
  'wallets.wallets.store': {
    methods: ["POST"]
    pattern: '/api/v1/wallets'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/wallets_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/wallets_controller').default['store']>>>
    }
  }
  'wallets.wallets.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/wallets/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/wallets_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/wallets_controller').default['show']>>>
    }
  }
  'wallets.wallets.transactions': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/wallets/:id/transactions'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/wallets_controller').default['transactions']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/wallets_controller').default['transactions']>>>
    }
  }
  'transactions.transactions.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/transactions/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/transactions_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/transactions_controller').default['show']>>>
    }
  }
  'transfers.p2p.p_2_p_transfers.create': {
    methods: ["POST"]
    pattern: '/api/v1/transfers/p2p'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/transfers').createP2pTransferValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/transfers').createP2pTransferValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/transfers/p2p_transfers_controller').default['create']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/transfers/p2p_transfers_controller').default['create']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'transfers.p2p.p_2_p_transfers.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/transfers/p2p/:uuid'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { uuid: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/transfers/p2p_transfers_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/transfers/p2p_transfers_controller').default['show']>>>
    }
  }
  'transfers.p2p.p_2_p_transfers.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/transfers/p2p'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/transfers').listTransfersValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/transfers/p2p_transfers_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/transfers/p2p_transfers_controller').default['index']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'likilibas.likilibas.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/likilibas'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/likiliba/likilibas_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/likiliba/likilibas_controller').default['index']>>>
    }
  }
  'likilibas.likilibas.store': {
    methods: ["POST"]
    pattern: '/api/v1/likilibas'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/likiliba').createLikilibaValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/likiliba').createLikilibaValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/likiliba/likilibas_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/likiliba/likilibas_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'likilibas.likilibas.invitations': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/likilibas/invitations'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/likiliba/likilibas_controller').default['invitations']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/likiliba/likilibas_controller').default['invitations']>>>
    }
  }
  'likilibas.likilibas.accept_link': {
    methods: ["POST"]
    pattern: '/api/v1/likilibas/invitations/accept-link'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/likiliba').acceptLinkValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/likiliba').acceptLinkValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/likiliba/likilibas_controller').default['acceptLink']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/likiliba/likilibas_controller').default['acceptLink']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'likilibas.likilibas.accept_invitation': {
    methods: ["POST"]
    pattern: '/api/v1/likilibas/invitations/:invitationId/accept'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { invitationId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/likiliba/likilibas_controller').default['acceptInvitation']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/likiliba/likilibas_controller').default['acceptInvitation']>>>
    }
  }
  'likilibas.likilibas.decline_invitation': {
    methods: ["POST"]
    pattern: '/api/v1/likilibas/invitations/:invitationId/decline'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { invitationId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/likiliba/likilibas_controller').default['declineInvitation']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/likiliba/likilibas_controller').default['declineInvitation']>>>
    }
  }
  'likilibas.likilibas.admit_invitation': {
    methods: ["POST"]
    pattern: '/api/v1/likilibas/invitations/:invitationId/admit'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { invitationId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/likiliba/likilibas_controller').default['admitInvitation']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/likiliba/likilibas_controller').default['admitInvitation']>>>
    }
  }
  'likilibas.likilibas.reject_invitation': {
    methods: ["POST"]
    pattern: '/api/v1/likilibas/invitations/:invitationId/reject'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { invitationId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/likiliba/likilibas_controller').default['rejectInvitation']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/likiliba/likilibas_controller').default['rejectInvitation']>>>
    }
  }
  'likilibas.likilibas.revoke_invitation': {
    methods: ["DELETE"]
    pattern: '/api/v1/likilibas/invitations/:invitationId'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { invitationId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/likiliba/likilibas_controller').default['revokeInvitation']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/likiliba/likilibas_controller').default['revokeInvitation']>>>
    }
  }
  'likilibas.likilibas.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/likilibas/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/likiliba/likilibas_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/likiliba/likilibas_controller').default['show']>>>
    }
  }
  'likilibas.likilibas.update': {
    methods: ["PATCH"]
    pattern: '/api/v1/likilibas/:id'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/likiliba').updateLikilibaValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/likiliba').updateLikilibaValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/likiliba/likilibas_controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/likiliba/likilibas_controller').default['update']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'likilibas.likilibas.rules': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/likilibas/:id/rules'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/likiliba/likilibas_controller').default['rules']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/likiliba/likilibas_controller').default['rules']>>>
    }
  }
  'likilibas.likilibas.history': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/likilibas/:id/history'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/likiliba').listValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/likiliba/likilibas_controller').default['history']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/likiliba/likilibas_controller').default['history']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'likilibas.likilibas.penalties': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/likilibas/:id/penalties'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/likiliba').listValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/likiliba/likilibas_controller').default['penalties']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/likiliba/likilibas_controller').default['penalties']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'likilibas.likilibas.mine': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/likilibas/:id/me'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/likiliba/likilibas_controller').default['mine']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/likiliba/likilibas_controller').default['mine']>>>
    }
  }
  'likilibas.likilibas.contributions': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/likilibas/:id/contributions'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/likiliba/likilibas_controller').default['contributions']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/likiliba/likilibas_controller').default['contributions']>>>
    }
  }
  'likilibas.likilibas.draw': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/likilibas/:id/draw'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/likiliba/likilibas_controller').default['draw']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/likiliba/likilibas_controller').default['draw']>>>
    }
  }
  'likilibas.likilibas.feed': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/likilibas/:id/feed'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/likiliba').feedValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/likiliba/likilibas_controller').default['feed']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/likiliba/likilibas_controller').default['feed']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'likilibas.likilibas.send_message': {
    methods: ["POST"]
    pattern: '/api/v1/likilibas/:id/messages'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/likiliba').messageValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/likiliba').messageValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/likiliba/likilibas_controller').default['sendMessage']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/likiliba/likilibas_controller').default['sendMessage']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'likilibas.likilibas.create_poll': {
    methods: ["POST"]
    pattern: '/api/v1/likilibas/:id/polls'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/likiliba').pollValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/likiliba').pollValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/likiliba/likilibas_controller').default['createPoll']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/likiliba/likilibas_controller').default['createPoll']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'likilibas.likilibas.message_attachment': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/likilibas/:id/messages/:messageId/attachment'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue]
      params: { id: ParamValue; messageId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/likiliba/likilibas_controller').default['messageAttachment']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/likiliba/likilibas_controller').default['messageAttachment']>>>
    }
  }
  'likilibas.likilibas.vote': {
    methods: ["PUT"]
    pattern: '/api/v1/likilibas/:id/messages/:messageId/vote'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/likiliba').voteValidator)>>
      paramsTuple: [ParamValue, ParamValue]
      params: { id: ParamValue; messageId: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/likiliba').voteValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/likiliba/likilibas_controller').default['vote']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/likiliba/likilibas_controller').default['vote']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'likilibas.likilibas.close_poll': {
    methods: ["POST"]
    pattern: '/api/v1/likilibas/:id/messages/:messageId/close'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue]
      params: { id: ParamValue; messageId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/likiliba/likilibas_controller').default['closePoll']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/likiliba/likilibas_controller').default['closePoll']>>>
    }
  }
  'likilibas.likilibas.delete_message': {
    methods: ["DELETE"]
    pattern: '/api/v1/likilibas/:id/messages/:messageId'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue]
      params: { id: ParamValue; messageId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/likiliba/likilibas_controller').default['deleteMessage']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/likiliba/likilibas_controller').default['deleteMessage']>>>
    }
  }
  'likilibas.likilibas.report_message': {
    methods: ["POST"]
    pattern: '/api/v1/likilibas/:id/messages/:messageId/report'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/likiliba').reasonValidator)>>
      paramsTuple: [ParamValue, ParamValue]
      params: { id: ParamValue; messageId: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/likiliba').reasonValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/likiliba/likilibas_controller').default['reportMessage']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/likiliba/likilibas_controller').default['reportMessage']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'likilibas.likilibas.react_to_message': {
    methods: ["PUT"]
    pattern: '/api/v1/likilibas/:id/messages/:messageId/reaction'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/likiliba').reactionValidator)>>
      paramsTuple: [ParamValue, ParamValue]
      params: { id: ParamValue; messageId: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/likiliba').reactionValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/likiliba/likilibas_controller').default['reactToMessage']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/likiliba/likilibas_controller').default['reactToMessage']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'likilibas.likilibas.mark_read': {
    methods: ["POST"]
    pattern: '/api/v1/likilibas/:id/read'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/likiliba/likilibas_controller').default['markRead']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/likiliba/likilibas_controller').default['markRead']>>>
    }
  }
  'likilibas.likilibas.member_avatar': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/likilibas/:id/members/:memberId/avatar'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue]
      params: { id: ParamValue; memberId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/likiliba/likilibas_controller').default['memberAvatar']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/likiliba/likilibas_controller').default['memberAvatar']>>>
    }
  }
  'likilibas.likilibas.update_profile': {
    methods: ["PATCH"]
    pattern: '/api/v1/likilibas/:id/profile'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/likiliba').profileValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/likiliba').profileValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/likiliba/likilibas_controller').default['updateProfile']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/likiliba/likilibas_controller').default['updateProfile']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'likilibas.likilibas.photo': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/likilibas/:id/photo'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/likiliba/likilibas_controller').default['photo']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/likiliba/likilibas_controller').default['photo']>>>
    }
  }
  'likilibas.likilibas.update_photo': {
    methods: ["POST"]
    pattern: '/api/v1/likilibas/:id/photo'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/likiliba/likilibas_controller').default['updatePhoto']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/likiliba/likilibas_controller').default['updatePhoto']>>>
    }
  }
  'likilibas.likilibas.remove_photo': {
    methods: ["DELETE"]
    pattern: '/api/v1/likilibas/:id/photo'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/likiliba/likilibas_controller').default['removePhoto']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/likiliba/likilibas_controller').default['removePhoto']>>>
    }
  }
  'likilibas.likilibas.invite': {
    methods: ["POST"]
    pattern: '/api/v1/likilibas/:id/invitations'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/likiliba').inviteValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/likiliba').inviteValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/likiliba/likilibas_controller').default['invite']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/likiliba/likilibas_controller').default['invite']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'likilibas.likilibas.remove_member': {
    methods: ["DELETE"]
    pattern: '/api/v1/likilibas/:id/members/:memberId'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue]
      params: { id: ParamValue; memberId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/likiliba/likilibas_controller').default['removeMember']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/likiliba/likilibas_controller').default['removeMember']>>>
    }
  }
  'likilibas.likilibas.lock': {
    methods: ["POST"]
    pattern: '/api/v1/likilibas/:id/lock'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/likiliba').lockValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/likiliba').lockValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/likiliba/likilibas_controller').default['lock']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/likiliba/likilibas_controller').default['lock']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'likilibas.likilibas.commit': {
    methods: ["POST"]
    pattern: '/api/v1/likilibas/:id/commit'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/likiliba').commitValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/likiliba').commitValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/likiliba/likilibas_controller').default['commit']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/likiliba/likilibas_controller').default['commit']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'likilibas.likilibas.start': {
    methods: ["POST"]
    pattern: '/api/v1/likilibas/:id/start'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/likiliba').pinValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/likiliba').pinValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/likiliba/likilibas_controller').default['start']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/likiliba/likilibas_controller').default['start']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'likilibas.likilibas.cancel': {
    methods: ["POST"]
    pattern: '/api/v1/likilibas/:id/cancel'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/likiliba').cancelValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/likiliba').cancelValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/likiliba/likilibas_controller').default['cancel']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/likiliba/likilibas_controller').default['cancel']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'likilibas.likilibas.leave': {
    methods: ["POST"]
    pattern: '/api/v1/likilibas/:id/leave'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/likiliba').pinValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/likiliba').pinValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/likiliba/likilibas_controller').default['leave']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/likiliba/likilibas_controller').default['leave']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'likilibas.likilibas.contribute': {
    methods: ["POST"]
    pattern: '/api/v1/likilibas/:id/contributions'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/likiliba').moneyActionValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/likiliba').moneyActionValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/likiliba/likilibas_controller').default['contribute']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/likiliba/likilibas_controller').default['contribute']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'likilibas.likilibas.repay': {
    methods: ["POST"]
    pattern: '/api/v1/likilibas/:id/debts/repay'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/likiliba').moneyActionValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/likiliba').moneyActionValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/likiliba/likilibas_controller').default['repay']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/likiliba/likilibas_controller').default['repay']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'likilibas.likilibas.mandate': {
    methods: ["PUT"]
    pattern: '/api/v1/likilibas/:id/mandate'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/likiliba').mandateValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/likiliba').mandateValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/likiliba/likilibas_controller').default['mandate']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/likiliba/likilibas_controller').default['mandate']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'cash_in.cash_in.store': {
    methods: ["POST"]
    pattern: '/api/v1/cash-in'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/transfers/cash_in_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/transfers/cash_in_controller').default['store']>>>
    }
  }
  'cash_in.cash_in.confirm': {
    methods: ["POST"]
    pattern: '/api/v1/cash-in/:transaction_id/confirm'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { transaction_id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/transfers/cash_in_controller').default['confirm']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/transfers/cash_in_controller').default['confirm']>>>
    }
  }
  'cash_in.cash_in.reject': {
    methods: ["POST"]
    pattern: '/api/v1/cash-in/:transaction_id/reject'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { transaction_id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/transfers/cash_in_controller').default['reject']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/transfers/cash_in_controller').default['reject']>>>
    }
  }
  'cash_out.cash_out.store': {
    methods: ["POST"]
    pattern: '/api/v1/cash-out'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/transfers/cash_out_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/transfers/cash_out_controller').default['store']>>>
    }
  }
  'cash_out.cash_out.confirm': {
    methods: ["POST"]
    pattern: '/api/v1/cash-out/:transaction_id/confirm'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { transaction_id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/transfers/cash_out_controller').default['confirm']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/transfers/cash_out_controller').default['confirm']>>>
    }
  }
  'cash_out.cash_out.pickup': {
    methods: ["POST"]
    pattern: '/api/v1/cash-out/:transaction_id/pickup'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { transaction_id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/transfers/cash_out_controller').default['pickup']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/transfers/cash_out_controller').default['pickup']>>>
    }
  }
  'cash_out.cash_out.cancel': {
    methods: ["POST"]
    pattern: '/api/v1/cash-out/:transaction_id/cancel'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { transaction_id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/transfers/cash_out_controller').default['cancel']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/transfers/cash_out_controller').default['cancel']>>>
    }
  }
  'card_products.image': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/cards/products/:id/image'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/card_products_controller').default['image']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/card_products_controller').default['image']>>>
    }
  }
  'cards.cards.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/cards'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/cards_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/cards_controller').default['index']>>>
    }
  }
  'cards.cards.store': {
    methods: ["POST"]
    pattern: '/api/v1/cards'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/cards').createCardValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/cards').createCardValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/cards_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/cards_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'cards.card_products.catalogue': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/cards/products'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/card_products_controller').default['catalogue']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/card_products_controller').default['catalogue']>>>
    }
  }
  'cards.cards.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/cards/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/cards_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/cards_controller').default['show']>>>
    }
  }
  'cards.cards.topup': {
    methods: ["PATCH"]
    pattern: '/api/v1/cards/:id/topup'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/cards').cardAmountValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/cards').cardAmountValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/cards_controller').default['topup']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/cards_controller').default['topup']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'cards.cards.withdraw': {
    methods: ["PATCH"]
    pattern: '/api/v1/cards/:id/withdraw'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/cards').cardAmountValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/cards').cardAmountValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/cards_controller').default['withdraw']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/cards_controller').default['withdraw']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'cards.cards.freeze': {
    methods: ["PATCH"]
    pattern: '/api/v1/cards/:id/freeze'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/cards').cardActionValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/cards').cardActionValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/cards_controller').default['freeze']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/cards_controller').default['freeze']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'cards.cards.unfreeze': {
    methods: ["PATCH"]
    pattern: '/api/v1/cards/:id/unfreeze'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/cards').cardActionValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/cards').cardActionValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/cards_controller').default['unfreeze']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/cards_controller').default['unfreeze']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'cards.cards.terminate': {
    methods: ["POST"]
    pattern: '/api/v1/cards/:id/terminate'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/cards').cardActionValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/cards').cardActionValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/cards_controller').default['terminate']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/cards_controller').default['terminate']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'cards.cards.transactions': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/cards/:id/transactions'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/cards').listCardTransactionsValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/cards_controller').default['transactions']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/cards_controller').default['transactions']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'agents.kyc.agent_kyc.submit': {
    methods: ["POST"]
    pattern: '/api/v1/agents/kyc/submit'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/agent_kyc_controller').default['submit']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/agent_kyc_controller').default['submit']>>>
    }
  }
  'agents.kyc.agent_kyc.get_status': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/agents/kyc/status'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/agent_kyc_controller').default['getStatus']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/agent_kyc_controller').default['getStatus']>>>
    }
  }
  'agents.float.agent_float.transfer': {
    methods: ["POST"]
    pattern: '/api/v1/agents/float-transfer'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/agent_float_controller').default['transfer']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/agent_float_controller').default['transfer']>>>
    }
  }
  'agents.float.agent_float.convert': {
    methods: ["POST"]
    pattern: '/api/v1/agents/float-convert'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/agent_float_controller').default['convert']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/agent_float_controller').default['convert']>>>
    }
  }
  'agents.float.agent_float.withdraw': {
    methods: ["POST"]
    pattern: '/api/v1/agents/float-withdraw'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/agent_float_controller').default['withdraw']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/agent_float_controller').default['withdraw']>>>
    }
  }
  'agent_workspace.agent_workspace.me': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/agent/me'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/agent_workspace_controller').default['me']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/agent_workspace_controller').default['me']>>>
    }
  }
  'agent_workspace.agent_workspace.operations': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/agent/operations'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/agent_workspace_controller').default['operations']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/agent_workspace_controller').default['operations']>>>
    }
  }
  'agent_workspace.agent_workspace.operation': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/agent/operations/:transaction_id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { transaction_id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/agent_workspace_controller').default['operation']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/agent_workspace_controller').default['operation']>>>
    }
  }
  'agent_workspace.agent_workspace.cash_out': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/agent/cash-outs/:transaction_id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { transaction_id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/agent_workspace_controller').default['cashOut']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/agent_workspace_controller').default['cashOut']>>>
    }
  }
  'agent_workspace.agent_workspace.sub_agents': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/agent/sub-agents'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/agent_workspace_controller').default['subAgents']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/agent_workspace_controller').default['subAgents']>>>
    }
  }
  'agent_applications.agent_applications.mine': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/agent-applications/mine'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/agent_applications_controller').default['mine']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/agent_applications_controller').default['mine']>>>
    }
  }
  'agent_applications.agent_applications.eligibility': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/agent-applications/eligibility'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/agent_applications_controller').default['eligibility']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/agent_applications_controller').default['eligibility']>>>
    }
  }
  'agent_applications.agent_applications.store': {
    methods: ["POST"]
    pattern: '/api/v1/agent-applications'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/agent_applications_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/agent_applications_controller').default['store']>>>
    }
  }
  'remittances.remittances.corridor': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/remittances/corridor'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/remittances_controller').default['corridor']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/remittances_controller').default['corridor']>>>
    }
  }
  'remittances.remittances.quote': {
    methods: ["POST"]
    pattern: '/api/v1/remittances/quote'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/remittances_controller').default['quote']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/remittances_controller').default['quote']>>>
    }
  }
  'remittances.remittances.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/remittances'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/remittances_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/remittances_controller').default['index']>>>
    }
  }
  'remittances.remittances.store': {
    methods: ["POST"]
    pattern: '/api/v1/remittances'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/remittances_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/remittances_controller').default['store']>>>
    }
  }
  'remittances.remittances.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/remittances/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/remittances_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/remittances_controller').default['show']>>>
    }
  }
  'remittances.remittances.cancel': {
    methods: ["POST"]
    pattern: '/api/v1/remittances/:id/cancel'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/remittances_controller').default['cancel']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/remittances_controller').default['cancel']>>>
    }
  }
  'agent_remittances.agent_remittances.lookup': {
    methods: ["POST"]
    pattern: '/api/v1/agent/remittances/lookup'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/agent_remittances_controller').default['lookup']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/agent_remittances_controller').default['lookup']>>>
    }
  }
  'agent_remittances.agent_remittances.pay': {
    methods: ["POST"]
    pattern: '/api/v1/agent/remittances/:id/pay'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/agent_remittances_controller').default['pay']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/agent_remittances_controller').default['pay']>>>
    }
  }
  'agents.agents.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/agents'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/agents_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/agents_controller').default['index']>>>
    }
  }
  'agents.agents.store': {
    methods: ["POST"]
    pattern: '/api/v1/agents'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/agents_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/agents_controller').default['store']>>>
    }
  }
  'agents.agents.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/agents/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/agents_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/agents_controller').default['show']>>>
    }
  }
  'agents.agents.update': {
    methods: ["PATCH"]
    pattern: '/api/v1/agents/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/agents_controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/agents_controller').default['update']>>>
    }
  }
  'agents.agents.approve': {
    methods: ["POST"]
    pattern: '/api/v1/agents/:id/approve'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/agents_controller').default['approve']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/agents_controller').default['approve']>>>
    }
  }
  'agents.agents.activate': {
    methods: ["POST"]
    pattern: '/api/v1/agents/:id/activate'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/agents_controller').default['activate']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/agents_controller').default['activate']>>>
    }
  }
  'agents.agents.suspend': {
    methods: ["POST"]
    pattern: '/api/v1/agents/:id/suspend'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/agents_controller').default['suspend']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/agents_controller').default['suspend']>>>
    }
  }
  'agents.agents.deactivate': {
    methods: ["POST"]
    pattern: '/api/v1/agents/:id/deactivate'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/agents_controller').default['deactivate']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/agents_controller').default['deactivate']>>>
    }
  }
  'kyc.kyc.submit': {
    methods: ["POST"]
    pattern: '/api/v1/kyc/submit'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/kyc_controller').default['submit']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/kyc_controller').default['submit']>>>
    }
  }
  'kyc.kyc.get_status': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/kyc/status'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/kyc_controller').default['getStatus']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/kyc_controller').default['getStatus']>>>
    }
  }
  'kyc.kyc.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/kyc'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/kyc_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/kyc_controller').default['index']>>>
    }
  }
  'kyc.kyc.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/kyc/:kyc_id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { kyc_id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/kyc_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/kyc_controller').default['show']>>>
    }
  }
  'kyc.kyc.approve': {
    methods: ["POST"]
    pattern: '/api/v1/kyc/:kyc_id/approve'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { kyc_id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/kyc_controller').default['approve']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/kyc_controller').default['approve']>>>
    }
  }
  'kyc.kyc.reject': {
    methods: ["POST"]
    pattern: '/api/v1/kyc/:kyc_id/reject'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { kyc_id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/kyc_controller').default['reject']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/kyc_controller').default['reject']>>>
    }
  }
  'kyc.kyc.list_documents': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/kyc/:kyc_id/documents'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { kyc_id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/kyc_controller').default['listDocuments']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/kyc_controller').default['listDocuments']>>>
    }
  }
  'kyc.kyc.get_document': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/kyc/:kyc_id/documents/:document_id'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue]
      params: { kyc_id: ParamValue; document_id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/kyc_controller').default['getDocument']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/kyc_controller').default['getDocument']>>>
    }
  }
  'disputes.disputes.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/disputes'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/disputes_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/disputes_controller').default['index']>>>
    }
  }
  'disputes.disputes.store': {
    methods: ["POST"]
    pattern: '/api/v1/disputes'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/disputes_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/disputes_controller').default['store']>>>
    }
  }
  'disputes.disputes.list_all': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/disputes/all'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/disputes_controller').default['listAll']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/disputes_controller').default['listAll']>>>
    }
  }
  'disputes.disputes.admin_messages': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/disputes/all/:id/messages'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/disputes_controller').default['adminMessages']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/disputes_controller').default['adminMessages']>>>
    }
  }
  'disputes.disputes.admin_post_message': {
    methods: ["POST"]
    pattern: '/api/v1/disputes/all/:id/messages'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/disputes_controller').default['adminPostMessage']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/disputes_controller').default['adminPostMessage']>>>
    }
  }
  'disputes.disputes.admin_show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/disputes/all/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/disputes_controller').default['adminShow']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/disputes_controller').default['adminShow']>>>
    }
  }
  'disputes.disputes.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/disputes/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/disputes_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/disputes_controller').default['show']>>>
    }
  }
  'disputes.disputes.messages': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/disputes/:id/messages'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/disputes_controller').default['messages']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/disputes_controller').default['messages']>>>
    }
  }
  'disputes.disputes.post_message': {
    methods: ["POST"]
    pattern: '/api/v1/disputes/:id/messages'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/disputes_controller').default['postMessage']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/disputes_controller').default['postMessage']>>>
    }
  }
  'disputes.disputes.withdraw': {
    methods: ["POST"]
    pattern: '/api/v1/disputes/:id/withdraw'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/disputes_controller').default['withdraw']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/disputes_controller').default['withdraw']>>>
    }
  }
  'disputes.disputes.close': {
    methods: ["POST"]
    pattern: '/api/v1/disputes/:id/close'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/disputes_controller').default['close']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/disputes_controller').default['close']>>>
    }
  }
  'webhooks.webhooks.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/webhooks'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/webhooks_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/webhooks_controller').default['index']>>>
    }
  }
  'webhooks.webhooks.store': {
    methods: ["POST"]
    pattern: '/api/v1/webhooks'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/webhooks_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/webhooks_controller').default['store']>>>
    }
  }
  'webhooks.webhooks.destroy': {
    methods: ["DELETE"]
    pattern: '/api/v1/webhooks/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/webhooks_controller').default['destroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/webhooks_controller').default['destroy']>>>
    }
  }
  'webhooks.webhooks.get_deliveries': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/webhooks/:id/deliveries'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/webhooks_controller').default['getDeliveries']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/webhooks_controller').default['getDeliveries']>>>
    }
  }
  'mobile_money.mobile_money_deposits.store': {
    methods: ["POST"]
    pattern: '/api/v1/mobile-money/deposits'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/mobile_money').createMobileMoneyDepositValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/mobile_money').createMobileMoneyDepositValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/mobile_money/deposits_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/mobile_money/deposits_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'mobile_money.mobile_money_deposits.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/mobile-money/deposits/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/mobile_money/deposits_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/mobile_money/deposits_controller').default['show']>>>
    }
  }
  'mobile_money.mobile_money_deposits.live_status': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/mobile-money/deposits/:id/live-status'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/mobile_money/deposits_controller').default['liveStatus']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/mobile_money/deposits_controller').default['liveStatus']>>>
    }
  }
  'mobile_money.mobile_money_payouts.store': {
    methods: ["POST"]
    pattern: '/api/v1/mobile-money/payouts'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/mobile_money').createMobileMoneyPayoutValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/mobile_money').createMobileMoneyPayoutValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/mobile_money/payouts_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/mobile_money/payouts_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'mobile_money.mobile_money_payouts.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/mobile-money/payouts/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/mobile_money/payouts_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/mobile_money/payouts_controller').default['show']>>>
    }
  }
  'mobile_money.mobile_money_payouts.live_status': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/mobile-money/payouts/:id/live-status'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/mobile_money/payouts_controller').default['liveStatus']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/mobile_money/payouts_controller').default['liveStatus']>>>
    }
  }
  'mobile_money.mobile_money_toolkit.predict_provider': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/mobile-money/predict-provider'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/mobile_money').predictProviderValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/mobile_money/toolkit_controller').default['predictProvider']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/mobile_money/toolkit_controller').default['predictProvider']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'mobile_money.mobile_money_toolkit.list_payment_methods': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/mobile-money/payment-methods'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/mobile_money').listPaymentMethodsValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/mobile_money/toolkit_controller').default['listPaymentMethods']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/mobile_money/toolkit_controller').default['listPaymentMethods']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'mobile_money.mobile_money_toolkit.list_all_payment_methods_raw': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/mobile-money/payment-methods/raw'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/mobile_money/toolkit_controller').default['listAllPaymentMethodsRaw']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/mobile_money/toolkit_controller').default['listAllPaymentMethodsRaw']>>>
    }
  }
  'webhooks.pawapay.mobile_money_webhooks.handle_deposit': {
    methods: ["POST"]
    pattern: '/api/v1/webhooks/pawapay/deposits'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/mobile_money/webhooks_controller').default['handleDeposit']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/mobile_money/webhooks_controller').default['handleDeposit']>>>
    }
  }
  'webhooks.pawapay.mobile_money_webhooks.handle_payout': {
    methods: ["POST"]
    pattern: '/api/v1/webhooks/pawapay/payouts'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/mobile_money/webhooks_controller').default['handlePayout']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/mobile_money/webhooks_controller').default['handlePayout']>>>
    }
  }
  'webhooks.payscribe.cards': {
    methods: ["POST"]
    pattern: '/api/v1/webhooks/payscribe/cards'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/cards/webhooks_controller').default['handle']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/cards/webhooks_controller').default['handle']>>>
    }
  }
  'crypto.crypto_deposits.options': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/crypto/deposits/options'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/crypto/crypto_deposits_controller').default['options']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/crypto/crypto_deposits_controller').default['options']>>>
    }
  }
  'crypto.crypto_deposits.address': {
    methods: ["POST"]
    pattern: '/api/v1/crypto/deposits/address'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/crypto').createCryptoDepositAddressValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/crypto').createCryptoDepositAddressValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/crypto/crypto_deposits_controller').default['address']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/crypto/crypto_deposits_controller').default['address']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'crypto.crypto_deposits.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/crypto/deposits'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/crypto/crypto_deposits_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/crypto/crypto_deposits_controller').default['index']>>>
    }
  }
  'crypto.crypto_payouts.options': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/crypto/payouts/options'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/crypto/crypto_payouts_controller').default['options']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/crypto/crypto_payouts_controller').default['options']>>>
    }
  }
  'crypto.crypto_payouts.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/crypto/payouts'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/crypto/crypto_payouts_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/crypto/crypto_payouts_controller').default['index']>>>
    }
  }
  'crypto.crypto_payouts.store': {
    methods: ["POST"]
    pattern: '/api/v1/crypto/payouts'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/crypto').createCryptoPayoutValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/crypto').createCryptoPayoutValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/crypto/crypto_payouts_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/crypto/crypto_payouts_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'crypto.crypto_payouts.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/crypto/payouts/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/crypto/crypto_payouts_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/crypto/crypto_payouts_controller').default['show']>>>
    }
  }
  'webhooks.alchemy': {
    methods: ["POST"]
    pattern: '/api/v1/webhooks/alchemy'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/crypto/crypto_webhooks_controller').default['alchemy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/crypto/crypto_webhooks_controller').default['alchemy']>>>
    }
  }
  'card_deposits.card_deposits.store': {
    methods: ["POST"]
    pattern: '/api/v1/card-deposits'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/card_deposits').createCardDepositValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/card_deposits').createCardDepositValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/card_payments/card_deposits_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/card_payments/card_deposits_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'card_deposits.card_deposits.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/card-deposits/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/card_payments/card_deposits_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/card_payments/card_deposits_controller').default['show']>>>
    }
  }
  'card_checkout.card_checkout.context': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/card-checkout/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/card_payments/card_checkout_controller').default['context']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/card_payments/card_checkout_controller').default['context']>>>
    }
  }
  'card_checkout.card_checkout.setup': {
    methods: ["POST"]
    pattern: '/api/v1/card-checkout/:id/setup'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/card_deposits').cardCheckoutSetupValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/card_deposits').cardCheckoutSetupValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/card_payments/card_checkout_controller').default['setup']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/card_payments/card_checkout_controller').default['setup']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'card_checkout.card_checkout.enroll': {
    methods: ["POST"]
    pattern: '/api/v1/card-checkout/:id/enroll'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/card_deposits').cardCheckoutEnrollValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/card_deposits').cardCheckoutEnrollValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/card_payments/card_checkout_controller').default['enroll']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/card_payments/card_checkout_controller').default['enroll']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'card_checkout.card_checkout.charge': {
    methods: ["POST"]
    pattern: '/api/v1/card-checkout/:id/charge'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/card_deposits').cardCheckoutChargeValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/card_deposits').cardCheckoutChargeValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/card_payments/card_checkout_controller').default['charge']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/card_payments/card_checkout_controller').default['charge']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'webhooks.gofreshpay': {
    methods: ["POST"]
    pattern: '/api/v1/webhooks/gofreshpay'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/card_payments/gofreshpay_webhooks_controller').default['handle']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/card_payments/gofreshpay_webhooks_controller').default['handle']>>>
    }
  }
  'counter.counter_sessions.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/counter/sessions'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/counter/sessions_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/counter/sessions_controller').default['index']>>>
    }
  }
  'counter.counter_sessions.current': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/counter/sessions/current'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/counter/sessions_controller').default['current']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/counter/sessions_controller').default['current']>>>
    }
  }
  'counter.counter_sessions.store': {
    methods: ["POST"]
    pattern: '/api/v1/counter/sessions'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/teller_sessions').openTellerSessionValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/teller_sessions').openTellerSessionValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/counter/sessions_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/counter/sessions_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'counter.counter_sessions.close': {
    methods: ["POST"]
    pattern: '/api/v1/counter/sessions/:id/close'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/teller_sessions').closeTellerSessionValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/teller_sessions').closeTellerSessionValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/counter/sessions_controller').default['close']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/counter/sessions_controller').default['close']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'counter.counter_sessions.reconcile': {
    methods: ["POST"]
    pattern: '/api/v1/counter/sessions/:id/reconcile'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/teller_sessions').reconcileTellerSessionValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/teller_sessions').reconcileTellerSessionValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/counter/sessions_controller').default['reconcile']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/counter/sessions_controller').default['reconcile']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'counter.counter_cash.cash_in': {
    methods: ["POST"]
    pattern: '/api/v1/counter/cash-in'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/counter_cash').counterCashInValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/counter_cash').counterCashInValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/counter/cash_controller').default['cashIn']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/counter/cash_controller').default['cashIn']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'counter.counter_cash.confirm_cash_in': {
    methods: ["POST"]
    pattern: '/api/v1/counter/cash-in/:transaction_id/confirm'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/counter_cash').counterConfirmValidator)>>
      paramsTuple: [ParamValue]
      params: { transaction_id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/counter_cash').counterConfirmValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/counter/cash_controller').default['confirmCashIn']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/counter/cash_controller').default['confirmCashIn']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'counter.counter_cash.reject_cash_in': {
    methods: ["POST"]
    pattern: '/api/v1/counter/cash-in/:transaction_id/reject'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { transaction_id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/counter/cash_controller').default['rejectCashIn']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/counter/cash_controller').default['rejectCashIn']>>>
    }
  }
  'counter.counter_cash.cash_out': {
    methods: ["POST"]
    pattern: '/api/v1/counter/cash-out'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/counter_cash').counterCashOutValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/counter_cash').counterCashOutValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/counter/cash_controller').default['cashOut']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/counter/cash_controller').default['cashOut']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'counter.counter_cash.confirm_cash_out': {
    methods: ["POST"]
    pattern: '/api/v1/counter/cash-out/:transaction_id/confirm'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/counter_cash').counterConfirmValidator)>>
      paramsTuple: [ParamValue]
      params: { transaction_id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/counter_cash').counterConfirmValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/counter/cash_controller').default['confirmCashOut']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/counter/cash_controller').default['confirmCashOut']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'counter.counter_cash.cancel_cash_out': {
    methods: ["POST"]
    pattern: '/api/v1/counter/cash-out/:transaction_id/cancel'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/counter_cash').counterCancelValidator)>>
      paramsTuple: [ParamValue]
      params: { transaction_id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/counter_cash').counterCancelValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/counter/cash_controller').default['cancelCashOut']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/counter/cash_controller').default['cancelCashOut']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'counter.counter_cash.pending': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/counter/cash/pending'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/counter/cash_controller').default['pending']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/counter/cash_controller').default['pending']>>>
    }
  }
  'counter.counter_journal.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/counter/transactions'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/counter/journal_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/counter/journal_controller').default['index']>>>
    }
  }
  'counter.counter_customers.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/counter/customers'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/counter/customers_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/counter/customers_controller').default['show']>>>
    }
  }
  'counter.counter_customers.store': {
    methods: ["POST"]
    pattern: '/api/v1/counter/customers'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/counter/customers_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/counter/customers_controller').default['store']>>>
    }
  }
  'counter.counter_savings.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/counter/savings'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/counter_savings').counterSavingsLookupValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/counter/savings_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/counter/savings_controller').default['index']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'counter.counter_savings.store': {
    methods: ["POST"]
    pattern: '/api/v1/counter/savings'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/counter_savings').counterOpenSavingsValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/counter_savings').counterOpenSavingsValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/counter/savings_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/counter/savings_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'counter.counter_savings.deposit': {
    methods: ["POST"]
    pattern: '/api/v1/counter/savings/:id/deposit'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/counter/savings_controller').default['deposit']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/counter/savings_controller').default['deposit']>>>
    }
  }
  'counter.counter_savings.withdraw': {
    methods: ["POST"]
    pattern: '/api/v1/counter/savings/:id/withdraw'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/counter/savings_controller').default['withdraw']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/counter/savings_controller').default['withdraw']>>>
    }
  }
  'counter.counter_loans.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/counter/loans'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/counter/loans_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/counter/loans_controller').default['index']>>>
    }
  }
  'counter.counter_loans.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/counter/loans/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/counter/loans_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/counter/loans_controller').default['show']>>>
    }
  }
  'counter.counter_loans.approve': {
    methods: ["POST"]
    pattern: '/api/v1/counter/loans/:id/approve'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/counter/loans_controller').default['approve']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/counter/loans_controller').default['approve']>>>
    }
  }
  'counter.counter_loans.reject': {
    methods: ["POST"]
    pattern: '/api/v1/counter/loans/:id/reject'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/loans').rejectLoanValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/loans').rejectLoanValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/counter/loans_controller').default['reject']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/counter/loans_controller').default['reject']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'counter.counter_loans.disburse': {
    methods: ["POST"]
    pattern: '/api/v1/counter/loans/:id/disburse'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/counter/loans_controller').default['disburse']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/counter/loans_controller').default['disburse']>>>
    }
  }
  'counter.counter_loans_committee.submit': {
    methods: ["POST"]
    pattern: '/api/v1/counter/loans/:id/submit'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/counter/loans_committee_controller').default['submit']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/counter/loans_committee_controller').default['submit']>>>
    }
  }
  'counter.counter_loans_committee.committee_approve': {
    methods: ["POST"]
    pattern: '/api/v1/counter/loans/:id/committee-approve'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/counter/loans_committee_controller').default['committeeApprove']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/counter/loans_committee_controller').default['committeeApprove']>>>
    }
  }
  'counter.counter_loans_committee.committee_reject': {
    methods: ["POST"]
    pattern: '/api/v1/counter/loans/:id/committee-reject'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/counter/loans_committee_controller').default['committeeReject']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/counter/loans_committee_controller').default['committeeReject']>>>
    }
  }
  'counter.counter_loan_officers.assign_loan': {
    methods: ["POST"]
    pattern: '/api/v1/counter/loans/:id/assign'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/counter/loan_officers_controller').default['assignLoan']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/counter/loan_officers_controller').default['assignLoan']>>>
    }
  }
  'counter.counter_loan_officers.assign_borrower': {
    methods: ["POST"]
    pattern: '/api/v1/counter/borrowers/assign'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/counter/loan_officers_controller').default['assignBorrower']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/counter/loan_officers_controller').default['assignBorrower']>>>
    }
  }
  'counter.counter_loan_officers.portfolio': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/counter/staff/:id/portfolio'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/counter/loan_officers_controller').default['portfolio']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/counter/loan_officers_controller').default['portfolio']>>>
    }
  }
  'counter.counter_groups.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/counter/groups'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/counter/groups_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/counter/groups_controller').default['index']>>>
    }
  }
  'counter.counter_groups.store': {
    methods: ["POST"]
    pattern: '/api/v1/counter/groups'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/counter/groups_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/counter/groups_controller').default['store']>>>
    }
  }
  'counter.counter_groups.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/counter/groups/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/counter/groups_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/counter/groups_controller').default['show']>>>
    }
  }
  'counter.counter_groups.summary': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/counter/groups/:id/summary'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/counter/groups_controller').default['summary']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/counter/groups_controller').default['summary']>>>
    }
  }
  'counter.counter_groups.add_member': {
    methods: ["POST"]
    pattern: '/api/v1/counter/groups/:id/members'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/counter/groups_controller').default['addMember']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/counter/groups_controller').default['addMember']>>>
    }
  }
  'counter.counter_groups.remove_member': {
    methods: ["DELETE"]
    pattern: '/api/v1/counter/groups/:id/members/:userId'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue]
      params: { id: ParamValue; userId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/counter/groups_controller').default['removeMember']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/counter/groups_controller').default['removeMember']>>>
    }
  }
  'counter.counter_loans_restructure.restructure': {
    methods: ["POST"]
    pattern: '/api/v1/counter/loans/:id/restructure'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/counter/loans_restructure_controller').default['restructure']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/counter/loans_restructure_controller').default['restructure']>>>
    }
  }
  'counter.counter_loans_restructure.history': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/counter/loans/:id/restructurings'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/counter/loans_restructure_controller').default['history']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/counter/loans_restructure_controller').default['history']>>>
    }
  }
  'counter.counter_loans_default.mark_default': {
    methods: ["POST"]
    pattern: '/api/v1/counter/loans/:id/default'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/counter/loans_default_controller').default['markDefault']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/counter/loans_default_controller').default['markDefault']>>>
    }
  }
  'counter.counter_loans_default.seize_collateral': {
    methods: ["POST"]
    pattern: '/api/v1/counter/loans/:id/seize-collateral'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/counter/loans_default_controller').default['seizeCollateral']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/counter/loans_default_controller').default['seizeCollateral']>>>
    }
  }
  'counter.counter_penalties.run': {
    methods: ["POST"]
    pattern: '/api/v1/counter/penalties/run'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/counter/penalties_controller').default['run']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/counter/penalties_controller').default['run']>>>
    }
  }
  'counter.counter_vault.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/counter/vaults'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/counter/vault_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/counter/vault_controller').default['index']>>>
    }
  }
  'counter.counter_vault.replenish': {
    methods: ["POST"]
    pattern: '/api/v1/counter/vaults/replenish'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/counter/vault_controller').default['replenish']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/counter/vault_controller').default['replenish']>>>
    }
  }
  'counter.counter_vault.sweep': {
    methods: ["POST"]
    pattern: '/api/v1/counter/vaults/sweep'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/counter/vault_controller').default['sweep']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/counter/vault_controller').default['sweep']>>>
    }
  }
  'counter.counter_vault.transfers': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/counter/vaults/transfers'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/counter/vault_controller').default['transfers']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/counter/vault_controller').default['transfers']>>>
    }
  }
  'counter.counter_vault.approve': {
    methods: ["POST"]
    pattern: '/api/v1/counter/vaults/transfers/:id/approve'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/counter/vault_controller').default['approve']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/counter/vault_controller').default['approve']>>>
    }
  }
  'counter.counter_vault.reject': {
    methods: ["POST"]
    pattern: '/api/v1/counter/vaults/transfers/:id/reject'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/counter/vault_controller').default['reject']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/counter/vault_controller').default['reject']>>>
    }
  }
  'business.staff.me': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/business/staff/me'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/counter/me_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/counter/me_controller').default['show']>>>
    }
  }
  'finance.products.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/finance/products'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/financial_products').listPublishedProductsValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/lending/catalogue_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/lending/catalogue_controller').default['index']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'finance.products.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/finance/products/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/lending/catalogue_controller').default['showProduct']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/lending/catalogue_controller').default['showProduct']>>>
    }
  }
  'finance.institutions.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/finance/institutions'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/financial_products').listInstitutionsValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/lending/catalogue_controller').default['institutions']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/lending/catalogue_controller').default['institutions']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'finance.institutions.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/finance/institutions/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/lending/catalogue_controller').default['showInstitution']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/lending/catalogue_controller').default['showInstitution']>>>
    }
  }
  'finance.institutions.logo': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/finance/institutions/:id/logo'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/business_logo_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/business_logo_controller').default['show']>>>
    }
  }
  'finance.savings.savings_accounts.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/finance/savings'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/savings/accounts_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/savings/accounts_controller').default['index']>>>
    }
  }
  'finance.savings.savings_accounts.store': {
    methods: ["POST"]
    pattern: '/api/v1/finance/savings'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/savings').openSavingsValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/savings').openSavingsValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/savings/accounts_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/savings/accounts_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'finance.savings.savings_accounts.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/finance/savings/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/savings/accounts_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/savings/accounts_controller').default['show']>>>
    }
  }
  'finance.savings.savings_accounts.deposit': {
    methods: ["POST"]
    pattern: '/api/v1/finance/savings/:id/deposit'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/savings/accounts_controller').default['deposit']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/savings/accounts_controller').default['deposit']>>>
    }
  }
  'finance.savings.savings_accounts.withdraw': {
    methods: ["POST"]
    pattern: '/api/v1/finance/savings/:id/withdraw'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/savings/accounts_controller').default['withdraw']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/savings/accounts_controller').default['withdraw']>>>
    }
  }
  'finance.savings.savings_accounts.close': {
    methods: ["POST"]
    pattern: '/api/v1/finance/savings/:id/close'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/savings').closeSavingsValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/savings').closeSavingsValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/savings/accounts_controller').default['close']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/savings/accounts_controller').default['close']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'finance.savings.borrower_loans.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/finance/loans'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/lending/borrower_loans_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/lending/borrower_loans_controller').default['index']>>>
    }
  }
  'finance.savings.borrower_loans.store': {
    methods: ["POST"]
    pattern: '/api/v1/finance/loans'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/loans').requestLoanValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/loans').requestLoanValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/lending/borrower_loans_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/lending/borrower_loans_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'finance.savings.borrower_loans.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/finance/loans/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/lending/borrower_loans_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/lending/borrower_loans_controller').default['show']>>>
    }
  }
  'finance.savings.borrower_loans.repay': {
    methods: ["POST"]
    pattern: '/api/v1/finance/loans/:id/repay'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/loans').repayLoanValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/loans').repayLoanValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/lending/borrower_loans_controller').default['repay']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/lending/borrower_loans_controller').default['repay']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'businesses.businesses.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/businesses'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/businesses_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/businesses_controller').default['index']>>>
    }
  }
  'businesses.businesses.store': {
    methods: ["POST"]
    pattern: '/api/v1/businesses'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/businesses_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/businesses_controller').default['store']>>>
    }
  }
  'businesses.businesses.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/businesses/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/businesses_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/businesses_controller').default['show']>>>
    }
  }
  'businesses.businesses.approve': {
    methods: ["POST"]
    pattern: '/api/v1/businesses/:id/approve'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/businesses_controller').default['approve']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/businesses_controller').default['approve']>>>
    }
  }
  'businesses.businesses.activate': {
    methods: ["POST"]
    pattern: '/api/v1/businesses/:id/activate'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/businesses_controller').default['activate']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/businesses_controller').default['activate']>>>
    }
  }
  'businesses.businesses.suspend': {
    methods: ["POST"]
    pattern: '/api/v1/businesses/:id/suspend'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/businesses_controller').default['suspend']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/businesses_controller').default['suspend']>>>
    }
  }
  'businesses.businesses.deactivate': {
    methods: ["POST"]
    pattern: '/api/v1/businesses/:id/deactivate'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/businesses_controller').default['deactivate']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/businesses_controller').default['deactivate']>>>
    }
  }
  'businesses.businesses.issue_api_key': {
    methods: ["POST"]
    pattern: '/api/v1/businesses/:id/api-keys'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/businesses_controller').default['issueApiKey']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/businesses_controller').default['issueApiKey']>>>
    }
  }
  'businesses.businesses.revoke_api_key': {
    methods: ["DELETE"]
    pattern: '/api/v1/businesses/:id/api-keys/:keyId'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue]
      params: { id: ParamValue; keyId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/businesses_controller').default['revokeApiKey']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/businesses_controller').default['revokeApiKey']>>>
    }
  }
  'businesses.business_logo.admin_upload': {
    methods: ["POST"]
    pattern: '/api/v1/businesses/:id/logo'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/business_logo_controller').default['adminUpload']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/business_logo_controller').default['adminUpload']>>>
    }
  }
  'businesses.business_logo.admin_remove': {
    methods: ["DELETE"]
    pattern: '/api/v1/businesses/:id/logo'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/business_logo_controller').default['adminRemove']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/business_logo_controller').default['adminRemove']>>>
    }
  }
  'businesses.businesses.assign_plan': {
    methods: ["POST"]
    pattern: '/api/v1/businesses/:id/plan'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/businesses_controller').default['assignPlan']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/businesses_controller').default['assignPlan']>>>
    }
  }
  'admin.business_staff.admin_business_staff.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/admin/business-staff'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/business_staff_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/business_staff_controller').default['index']>>>
    }
  }
  'admin.business_staff.admin_business_staff.store': {
    methods: ["POST"]
    pattern: '/api/v1/admin/business-staff'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/business_staff_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/business_staff_controller').default['store']>>>
    }
  }
  'admin.business_staff.admin_business_staff.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/admin/business-staff/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/business_staff_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/business_staff_controller').default['show']>>>
    }
  }
  'admin.business_staff.admin_business_staff.update': {
    methods: ["PATCH"]
    pattern: '/api/v1/admin/business-staff/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/business_staff_controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/business_staff_controller').default['update']>>>
    }
  }
  'admin.remittances.admin_remittances.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/admin/remittances'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/remittances_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/remittances_controller').default['index']>>>
    }
  }
  'admin.remittances.admin_remittances.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/admin/remittances/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/remittances_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/remittances_controller').default['show']>>>
    }
  }
  'admin.remittances.admin_remittances.release': {
    methods: ["POST"]
    pattern: '/api/v1/admin/remittances/:id/release'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/remittances_controller').default['release']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/remittances_controller').default['release']>>>
    }
  }
  'admin.remittances.admin_remittances.reject': {
    methods: ["POST"]
    pattern: '/api/v1/admin/remittances/:id/reject'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/remittances_controller').default['reject']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/remittances_controller').default['reject']>>>
    }
  }
  'admin.remittances.admin_remittances.watchlist': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/admin/watchlist'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/remittances_controller').default['watchlist']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/remittances_controller').default['watchlist']>>>
    }
  }
  'admin.remittances.admin_remittances.add_to_watchlist': {
    methods: ["POST"]
    pattern: '/api/v1/admin/watchlist'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/remittances_controller').default['addToWatchlist']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/remittances_controller').default['addToWatchlist']>>>
    }
  }
  'admin.remittances.admin_remittances.remove_from_watchlist': {
    methods: ["DELETE"]
    pattern: '/api/v1/admin/watchlist/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/remittances_controller').default['removeFromWatchlist']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/remittances_controller').default['removeFromWatchlist']>>>
    }
  }
  'admin.remittances.admin_crypto_payouts.treasury': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/admin/crypto-treasury'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/crypto_payouts_controller').default['treasury']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/crypto_payouts_controller').default['treasury']>>>
    }
  }
  'admin.remittances.admin_crypto_payouts.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/admin/crypto-payouts'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/crypto_payouts_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/crypto_payouts_controller').default['index']>>>
    }
  }
  'admin.remittances.admin_crypto_payouts.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/admin/crypto-payouts/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/crypto_payouts_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/crypto_payouts_controller').default['show']>>>
    }
  }
  'admin.remittances.admin_crypto_payouts.sent': {
    methods: ["POST"]
    pattern: '/api/v1/admin/crypto-payouts/:id/sent'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/crypto_payouts_controller').default['sent']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/crypto_payouts_controller').default['sent']>>>
    }
  }
  'admin.remittances.admin_crypto_payouts.reject': {
    methods: ["POST"]
    pattern: '/api/v1/admin/crypto-payouts/:id/reject'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/crypto_payouts_controller').default['reject']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/crypto_payouts_controller').default['reject']>>>
    }
  }
  'admin.agent_applications.admin_agent_applications.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/admin/agent-applications'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/agent_applications_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/agent_applications_controller').default['index']>>>
    }
  }
  'admin.agent_applications.admin_agent_applications.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/admin/agent-applications/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/agent_applications_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/agent_applications_controller').default['show']>>>
    }
  }
  'admin.agent_applications.admin_agent_applications.review': {
    methods: ["POST"]
    pattern: '/api/v1/admin/agent-applications/:id/review'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/agent_applications_controller').default['review']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/agent_applications_controller').default['review']>>>
    }
  }
  'admin.agent_applications.admin_agent_applications.approve': {
    methods: ["POST"]
    pattern: '/api/v1/admin/agent-applications/:id/approve'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/agent_applications_controller').default['approve']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/agent_applications_controller').default['approve']>>>
    }
  }
  'admin.agent_applications.admin_agent_applications.reject': {
    methods: ["POST"]
    pattern: '/api/v1/admin/agent-applications/:id/reject'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/agent_applications_controller').default['reject']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/agent_applications_controller').default['reject']>>>
    }
  }
  'admin.financial_products.admin_financial_products.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/admin/financial-products'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/financial_products_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/financial_products_controller').default['index']>>>
    }
  }
  'admin.financial_products.admin_financial_products.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/admin/financial-products/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/financial_products_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/financial_products_controller').default['show']>>>
    }
  }
  'admin.financial_products.admin_financial_products.approve': {
    methods: ["POST"]
    pattern: '/api/v1/admin/financial-products/:id/approve'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/financial_products_controller').default['approve']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/financial_products_controller').default['approve']>>>
    }
  }
  'admin.financial_products.admin_financial_products.reject': {
    methods: ["POST"]
    pattern: '/api/v1/admin/financial-products/:id/reject'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/financial_products').rejectFinancialProductValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/financial_products').rejectFinancialProductValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/financial_products_controller').default['reject']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/financial_products_controller').default['reject']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'admin.financial_products.admin_financial_products.archive': {
    methods: ["POST"]
    pattern: '/api/v1/admin/financial-products/:id/archive'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/financial_products_controller').default['archive']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/financial_products_controller').default['archive']>>>
    }
  }
  'admin.lending.admin_lending.loans': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/admin/loans'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/lending_controller').default['loans']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/lending_controller').default['loans']>>>
    }
  }
  'admin.lending.admin_lending.loan': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/admin/loans/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/lending_controller').default['loan']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/lending_controller').default['loan']>>>
    }
  }
  'admin.lending.admin_lending.savings': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/admin/savings'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/lending_controller').default['savings']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/lending_controller').default['savings']>>>
    }
  }
  'admin.lending.admin_lending.position': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/admin/institutions/:id/position'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/lending_controller').default['position']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/lending_controller').default['position']>>>
    }
  }
  'admin.likilibas.admin_likilibas.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/admin/likilibas'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/likiliba').listValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/likilibas_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/likilibas_controller').default['index']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'admin.likilibas.admin_likilibas.waive_penalty': {
    methods: ["POST"]
    pattern: '/api/v1/admin/likilibas/penalties/:penaltyId/waive'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/likiliba').reasonValidator)>>
      paramsTuple: [ParamValue]
      params: { penaltyId: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/likiliba').reasonValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/likilibas_controller').default['waivePenalty']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/likilibas_controller').default['waivePenalty']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'admin.likilibas.admin_likilibas.hide_message': {
    methods: ["POST"]
    pattern: '/api/v1/admin/likilibas/messages/:messageId/hide'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/likiliba').reasonValidator)>>
      paramsTuple: [ParamValue]
      params: { messageId: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/likiliba').reasonValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/likilibas_controller').default['hideMessage']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/likilibas_controller').default['hideMessage']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'admin.likilibas.admin_likilibas.message_attachment': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/admin/likilibas/messages/:messageId/attachment'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { messageId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/likilibas_controller').default['messageAttachment']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/likilibas_controller').default['messageAttachment']>>>
    }
  }
  'admin.likilibas.admin_likilibas.messages': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/admin/likilibas/:id/messages'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/likilibas_controller').default['messages']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/likilibas_controller').default['messages']>>>
    }
  }
  'admin.likilibas.admin_likilibas.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/admin/likilibas/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/likilibas_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/likilibas_controller').default['show']>>>
    }
  }
  'admin.likilibas.admin_likilibas.history': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/admin/likilibas/:id/history'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/likiliba').listValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/likilibas_controller').default['history']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/likilibas_controller').default['history']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'admin.likilibas.admin_likilibas.penalties': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/admin/likilibas/:id/penalties'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/likilibas_controller').default['penalties']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/likilibas_controller').default['penalties']>>>
    }
  }
  'admin.likilibas.admin_likilibas.suspend': {
    methods: ["POST"]
    pattern: '/api/v1/admin/likilibas/:id/suspend'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/likiliba').reasonValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/likiliba').reasonValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/likilibas_controller').default['suspend']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/likilibas_controller').default['suspend']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'admin.likilibas.admin_likilibas.resume': {
    methods: ["POST"]
    pattern: '/api/v1/admin/likilibas/:id/resume'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/likiliba').noteValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/likiliba').noteValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/likilibas_controller').default['resume']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/likilibas_controller').default['resume']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'card_products.card_products.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/card-products'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/card_products_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/card_products_controller').default['index']>>>
    }
  }
  'card_products.card_products.store': {
    methods: ["POST"]
    pattern: '/api/v1/card-products'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/card_products_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/card_products_controller').default['store']>>>
    }
  }
  'card_products.card_products.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/card-products/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/card_products_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/card_products_controller').default['show']>>>
    }
  }
  'card_products.card_products.update': {
    methods: ["PATCH"]
    pattern: '/api/v1/card-products/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/card_products_controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/card_products_controller').default['update']>>>
    }
  }
  'card_products.card_products.archive': {
    methods: ["POST"]
    pattern: '/api/v1/card-products/:id/archive'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/card_products_controller').default['archive']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/card_products_controller').default['archive']>>>
    }
  }
  'card_products.card_products.destroy_image': {
    methods: ["DELETE"]
    pattern: '/api/v1/card-products/:id/image'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/card_products_controller').default['destroyImage']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/card_products_controller').default['destroyImage']>>>
    }
  }
  'plans.plans.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/plans'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/plans_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/plans_controller').default['index']>>>
    }
  }
  'plans.plans.store': {
    methods: ["POST"]
    pattern: '/api/v1/plans'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/plans_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/plans_controller').default['store']>>>
    }
  }
  'plans.plans.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/plans/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/plans_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/plans_controller').default['show']>>>
    }
  }
  'plans.plans.update': {
    methods: ["PATCH"]
    pattern: '/api/v1/plans/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/plans_controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/plans_controller').default['update']>>>
    }
  }
  'plans.plans.archive': {
    methods: ["POST"]
    pattern: '/api/v1/plans/:id/archive'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/plans_controller').default['archive']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/plans_controller').default['archive']>>>
    }
  }
  'users.users.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/users'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/users_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/users_controller').default['index']>>>
    }
  }
  'users.users.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/users/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/users_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/users_controller').default['show']>>>
    }
  }
  'users.users.reset_pin': {
    methods: ["POST"]
    pattern: '/api/v1/users/:id/pin/reset'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/users_controller').default['resetPin']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/users_controller').default['resetPin']>>>
    }
  }
  'users.users.freeze_wallet': {
    methods: ["POST"]
    pattern: '/api/v1/users/:id/wallets/:walletId/freeze'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue]
      params: { id: ParamValue; walletId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/users_controller').default['freezeWallet']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/users_controller').default['freezeWallet']>>>
    }
  }
  'users.users.unfreeze_wallet': {
    methods: ["POST"]
    pattern: '/api/v1/users/:id/wallets/:walletId/unfreeze'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue]
      params: { id: ParamValue; walletId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/users_controller').default['unfreezeWallet']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/users_controller').default['unfreezeWallet']>>>
    }
  }
  'internal_users.internal_users.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/internal-users'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/internal_users_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/internal_users_controller').default['index']>>>
    }
  }
  'internal_users.internal_users.store': {
    methods: ["POST"]
    pattern: '/api/v1/internal-users'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/internal_users_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/internal_users_controller').default['store']>>>
    }
  }
  'internal_users.internal_users.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/internal-users/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/internal_users_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/internal_users_controller').default['show']>>>
    }
  }
  'internal_users.internal_users.activate': {
    methods: ["POST"]
    pattern: '/api/v1/internal-users/:id/activate'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/internal_users_controller').default['activate']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/internal_users_controller').default['activate']>>>
    }
  }
  'internal_users.internal_users.suspend': {
    methods: ["POST"]
    pattern: '/api/v1/internal-users/:id/suspend'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/internal_users_controller').default['suspend']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/internal_users_controller').default['suspend']>>>
    }
  }
  'internal_users.internal_users.deactivate': {
    methods: ["POST"]
    pattern: '/api/v1/internal-users/:id/deactivate'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/internal_users_controller').default['deactivate']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/internal_users_controller').default['deactivate']>>>
    }
  }
  'internal_users.internal_users.reset_password': {
    methods: ["POST"]
    pattern: '/api/v1/internal-users/:id/reset-password'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/internal_users_controller').default['resetPassword']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/internal_users_controller').default['resetPassword']>>>
    }
  }
  'internal_users.internal_users.reset_mfa': {
    methods: ["POST"]
    pattern: '/api/v1/internal-users/:id/reset-mfa'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/internal_users_controller').default['resetMfa']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/internal_users_controller').default['resetMfa']>>>
    }
  }
  'admin.admin_transactions.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/admin/transactions'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/transactions_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/transactions_controller').default['index']>>>
    }
  }
  'admin.admin_transactions.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/admin/transactions/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/transactions_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/transactions_controller').default['show']>>>
    }
  }
  'admin.admin_audit_logs.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/admin/audit-logs'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/audit_logs_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/audit_logs_controller').default['index']>>>
    }
  }
  'admin.admin_audit_logs.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/admin/audit-logs/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/audit_logs_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/audit_logs_controller').default['show']>>>
    }
  }
  'admin.admin_cards.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/admin/cards'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/cards_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/cards_controller').default['index']>>>
    }
  }
  'admin.admin_cards.store': {
    methods: ["POST"]
    pattern: '/api/v1/admin/cards'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/cards_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/cards_controller').default['store']>>>
    }
  }
  'admin.admin_cards.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/admin/cards/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/cards_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/cards_controller').default['show']>>>
    }
  }
  'admin.admin_cards.transactions': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/admin/cards/:id/transactions'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/cards_controller').default['transactions']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/cards_controller').default['transactions']>>>
    }
  }
  'admin.admin_cards.topup': {
    methods: ["POST"]
    pattern: '/api/v1/admin/cards/:id/topup'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/cards_controller').default['topup']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/cards_controller').default['topup']>>>
    }
  }
  'admin.admin_cards.freeze': {
    methods: ["POST"]
    pattern: '/api/v1/admin/cards/:id/freeze'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/cards_controller').default['freeze']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/cards_controller').default['freeze']>>>
    }
  }
  'admin.admin_cards.unfreeze': {
    methods: ["POST"]
    pattern: '/api/v1/admin/cards/:id/unfreeze'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/cards_controller').default['unfreeze']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/cards_controller').default['unfreeze']>>>
    }
  }
  'admin.admin_cards.terminate': {
    methods: ["POST"]
    pattern: '/api/v1/admin/cards/:id/terminate'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/cards_controller').default['terminate']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/cards_controller').default['terminate']>>>
    }
  }
  'admin.admin_ledger_accounts.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/admin/ledger-accounts'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/ledger_accounts_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/ledger_accounts_controller').default['index']>>>
    }
  }
  'admin.admin_ledger_accounts.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/admin/ledger-accounts/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/ledger_accounts_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/ledger_accounts_controller').default['show']>>>
    }
  }
  'admin.currencies.admin_index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/admin/currencies'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/currencies_controller').default['adminIndex']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/currencies_controller').default['adminIndex']>>>
    }
  }
  'admin.currencies.admin_show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/admin/currencies/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/currencies_controller').default['adminShow']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/currencies_controller').default['adminShow']>>>
    }
  }
  'admin.currencies.admin_update': {
    methods: ["PATCH"]
    pattern: '/api/v1/admin/currencies/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/currencies_controller').default['adminUpdate']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/currencies_controller').default['adminUpdate']>>>
    }
  }
  'admin.exchange_rates.admin_index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/admin/exchange-rates'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/fx/exchange_rates_controller').default['adminIndex']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/fx/exchange_rates_controller').default['adminIndex']>>>
    }
  }
  'admin.exchange_rates.admin_refresh': {
    methods: ["POST"]
    pattern: '/api/v1/admin/exchange-rates/refresh'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/fx/exchange_rates_controller').default['adminRefresh']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/fx/exchange_rates_controller').default['adminRefresh']>>>
    }
  }
  'admin.exchange_rates.admin_show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/admin/exchange-rates/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/fx/exchange_rates_controller').default['adminShow']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/fx/exchange_rates_controller').default['adminShow']>>>
    }
  }
  'admin.exchange_rates.admin_update': {
    methods: ["PATCH"]
    pattern: '/api/v1/admin/exchange-rates/:id'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/fx').updateExchangeRateValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/fx').updateExchangeRateValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/fx/exchange_rates_controller').default['adminUpdate']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/fx/exchange_rates_controller').default['adminUpdate']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'admin.admin_accounting.balance_sheet': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/admin/accounting/balance-sheet'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/accounting_controller').default['balanceSheet']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/accounting_controller').default['balanceSheet']>>>
    }
  }
  'admin.admin_accounting.revenue': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/admin/accounting/revenue'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/accounting_controller').default['revenue']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/accounting_controller').default['revenue']>>>
    }
  }
  'admin.admin_accounting.reconcile': {
    methods: ["POST"]
    pattern: '/api/v1/admin/accounting/reconcile'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/accounting_controller').default['reconcile']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/accounting_controller').default['reconcile']>>>
    }
  }
  'business.lending_products.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/business/products'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/lending/products_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/lending/products_controller').default['index']>>>
    }
  }
  'business.lending_products.store': {
    methods: ["POST"]
    pattern: '/api/v1/business/products'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/financial_products').createFinancialProductValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/financial_products').createFinancialProductValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/lending/products_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/lending/products_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'business.lending_products.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/business/products/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/lending/products_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/lending/products_controller').default['show']>>>
    }
  }
  'business.lending_products.update': {
    methods: ["PATCH"]
    pattern: '/api/v1/business/products/:id'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/financial_products').updateFinancialProductValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/financial_products').updateFinancialProductValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/lending/products_controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/lending/products_controller').default['update']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'business.lending_products.submit': {
    methods: ["POST"]
    pattern: '/api/v1/business/products/:id/submit'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/lending/products_controller').default['submit']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/lending/products_controller').default['submit']>>>
    }
  }
  'business.lending_products.archive': {
    methods: ["POST"]
    pattern: '/api/v1/business/products/:id/archive'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/lending/products_controller').default['archive']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/lending/products_controller').default['archive']>>>
    }
  }
  'business.business_deposits.store': {
    methods: ["POST"]
    pattern: '/api/v1/business/mobile-money/deposits'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/mobile_money').createMobileMoneyDepositValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/mobile_money').createMobileMoneyDepositValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/business/deposits_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/business/deposits_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'business.business_deposits.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/business/mobile-money/deposits/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/business/deposits_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/business/deposits_controller').default['show']>>>
    }
  }
  'business.business_deposits.live_status': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/business/mobile-money/deposits/:id/live-status'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/business/deposits_controller').default['liveStatus']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/business/deposits_controller').default['liveStatus']>>>
    }
  }
  'business.business_payouts.store': {
    methods: ["POST"]
    pattern: '/api/v1/business/mobile-money/payouts'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/mobile_money').createMobileMoneyPayoutValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/mobile_money').createMobileMoneyPayoutValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/business/payouts_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/business/payouts_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'business.business_payouts.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/business/mobile-money/payouts/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/business/payouts_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/business/payouts_controller').default['show']>>>
    }
  }
  'business.business_payouts.live_status': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/business/mobile-money/payouts/:id/live-status'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/business/payouts_controller').default['liveStatus']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/business/payouts_controller').default['liveStatus']>>>
    }
  }
  'business.business_crypto.address': {
    methods: ["POST"]
    pattern: '/api/v1/business/crypto/deposits/address'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/crypto').createCryptoDepositAddressValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/crypto').createCryptoDepositAddressValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/business/crypto_controller').default['address']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/business/crypto_controller').default['address']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'business.business_crypto.payout': {
    methods: ["POST"]
    pattern: '/api/v1/business/crypto/payouts'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/crypto').createCryptoPayoutValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/crypto').createCryptoPayoutValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/business/crypto_controller').default['payout']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/business/crypto_controller').default['payout']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'business.business_wallet.store': {
    methods: ["POST"]
    pattern: '/api/v1/business/wallet'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/business_wallet').createBusinessWalletValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/business_wallet').createBusinessWalletValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/business/wallet_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/business/wallet_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'business.business_wallet.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/business/wallet'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/business/wallet_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/business/wallet_controller').default['index']>>>
    }
  }
  'business.business_wallet.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/business/wallet/:currency'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { currency: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/business/wallet_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/business/wallet_controller').default['show']>>>
    }
  }
  'business.business_swaps.quote': {
    methods: ["POST"]
    pattern: '/api/v1/business/swaps/quote'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/fx').createSwapQuoteValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/fx').createSwapQuoteValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/business/swaps_controller').default['quote']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/business/swaps_controller').default['quote']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'business.business_swaps.store': {
    methods: ["POST"]
    pattern: '/api/v1/business/swaps'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/fx').executeSwapValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/fx').executeSwapValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/business/swaps_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/business/swaps_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'business.business_transactions.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/business/transactions'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/business/transactions_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/business/transactions_controller').default['index']>>>
    }
  }
  'business.business_merchant_payments.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/business/merchant-payments'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/business/merchant_payments_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/business/merchant_payments_controller').default['index']>>>
    }
  }
  'business.business_webhooks.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/business/webhooks'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/business/webhooks_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/business/webhooks_controller').default['index']>>>
    }
  }
  'business.business_webhooks.store': {
    methods: ["POST"]
    pattern: '/api/v1/business/webhooks'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/business/webhooks_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/business/webhooks_controller').default['store']>>>
    }
  }
  'business.business_webhooks.destroy': {
    methods: ["DELETE"]
    pattern: '/api/v1/business/webhooks/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/business/webhooks_controller').default['destroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/business/webhooks_controller').default['destroy']>>>
    }
  }
  'business.business_webhooks.get_deliveries': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/business/webhooks/:id/deliveries'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/business/webhooks_controller').default['getDeliveries']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/business/webhooks_controller').default['getDeliveries']>>>
    }
  }
  'business.business_toolkit.list_payment_methods': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/business/mobile-money/payment-methods'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/mobile_money').listPaymentMethodsValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/business/toolkit_controller').default['listPaymentMethods']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/business/toolkit_controller').default['listPaymentMethods']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'business.business_toolkit.list_all_payment_methods_raw': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/business/mobile-money/payment-methods/raw'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/business/toolkit_controller').default['listAllPaymentMethodsRaw']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/business/toolkit_controller').default['listAllPaymentMethodsRaw']>>>
    }
  }
  'business.business_plan.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/business/plans'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/business/plan_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/business/plan_controller').default['index']>>>
    }
  }
  'business.business_plan.current': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/business/plan'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/business/plan_controller').default['current']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/business/plan_controller').default['current']>>>
    }
  }
  'business.business_plan.subscribe': {
    methods: ["POST"]
    pattern: '/api/v1/business/plan/subscribe'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/business_plan').subscribeToPlanValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/business_plan').subscribeToPlanValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/business/plan_controller').default['subscribe']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/business/plan_controller').default['subscribe']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'business.business_sandbox.fund': {
    methods: ["POST"]
    pattern: '/api/v1/business/sandbox/fund'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/sandbox').fundSandboxWalletValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/sandbox').fundSandboxWalletValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/business/sandbox_controller').default['fund']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/business/sandbox_controller').default['fund']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'business.business_cards.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/business/cards'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/business/cards_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/business/cards_controller').default['index']>>>
    }
  }
  'business.business_cards.store': {
    methods: ["POST"]
    pattern: '/api/v1/business/cards'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/business_cards').createBusinessCardValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/business_cards').createBusinessCardValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/business/cards_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/business/cards_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'business.business_cards.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/business/cards/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/business/cards_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/business/cards_controller').default['show']>>>
    }
  }
  'business.business_cards.topup': {
    methods: ["PATCH"]
    pattern: '/api/v1/business/cards/:id/topup'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/business_cards').businessCardAmountValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/business_cards').businessCardAmountValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/business/cards_controller').default['topup']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/business/cards_controller').default['topup']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'business.business_cards.withdraw': {
    methods: ["PATCH"]
    pattern: '/api/v1/business/cards/:id/withdraw'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/business_cards').businessCardAmountValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/business_cards').businessCardAmountValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/business/cards_controller').default['withdraw']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/business/cards_controller').default['withdraw']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'business.business_cards.freeze': {
    methods: ["PATCH"]
    pattern: '/api/v1/business/cards/:id/freeze'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/business_cards').businessCardActionValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/business_cards').businessCardActionValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/business/cards_controller').default['freeze']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/business/cards_controller').default['freeze']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'business.business_cards.unfreeze': {
    methods: ["PATCH"]
    pattern: '/api/v1/business/cards/:id/unfreeze'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/business_cards').businessCardActionValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/business_cards').businessCardActionValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/business/cards_controller').default['unfreeze']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/business/cards_controller').default['unfreeze']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'business.business_cards.terminate': {
    methods: ["POST"]
    pattern: '/api/v1/business/cards/:id/terminate'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/business_cards').businessCardActionValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/business_cards').businessCardActionValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/business/cards_controller').default['terminate']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/business/cards_controller').default['terminate']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'business.business_cards.transactions': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/business/cards/:id/transactions'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/business_cards').listBusinessCardTransactionsValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/business/cards_controller').default['transactions']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/business/cards_controller').default['transactions']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'internal.auth.internal_auth.login': {
    methods: ["POST"]
    pattern: '/api/v1/internal/auth/login'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/internal_auth_controller').default['login']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/internal_auth_controller').default['login']>>>
    }
  }
  'internal.auth.internal_auth.logout': {
    methods: ["POST"]
    pattern: '/api/v1/internal/auth/logout'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/internal_auth_controller').default['logout']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/internal_auth_controller').default['logout']>>>
    }
  }
  'internal.auth.internal_auth.change_password': {
    methods: ["POST"]
    pattern: '/api/v1/internal/auth/change-password'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/internal_auth_controller').default['changePassword']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/internal_auth_controller').default['changePassword']>>>
    }
  }
  'internal.auth.internal_auth.verify_mfa': {
    methods: ["POST"]
    pattern: '/api/v1/internal/auth/mfa/verify'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/internal_auth_controller').default['verifyMfa']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/internal_auth_controller').default['verifyMfa']>>>
    }
  }
  'internal.auth.internal_auth.setup_mfa': {
    methods: ["POST"]
    pattern: '/api/v1/internal/auth/mfa/setup'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/internal_auth_controller').default['setupMfa']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/internal_auth_controller').default['setupMfa']>>>
    }
  }
  'internal.auth.internal_auth.enable_mfa': {
    methods: ["POST"]
    pattern: '/api/v1/internal/auth/mfa/enable'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/internal_auth_controller').default['enableMfa']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/internal_auth_controller').default['enableMfa']>>>
    }
  }
  'internal.auth.internal_auth.me': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/internal/auth/me'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/internal_auth_controller').default['me']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/internal_auth_controller').default['me']>>>
    }
  }
  'business.auth.business_dashboard_auth.request_signup_otp': {
    methods: ["POST"]
    pattern: '/api/v1/business/auth/signup/request-otp'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/business_dashboard').requestBusinessSignupOtpValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/business_dashboard').requestBusinessSignupOtpValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/business_dashboard/auth_controller').default['requestSignupOtp']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/business_dashboard/auth_controller').default['requestSignupOtp']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'business.auth.business_dashboard_auth.signup': {
    methods: ["POST"]
    pattern: '/api/v1/business/auth/signup'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/business_dashboard').businessSignupValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/business_dashboard').businessSignupValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/business_dashboard/auth_controller').default['signup']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/business_dashboard/auth_controller').default['signup']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'business.auth.business_dashboard_auth.login': {
    methods: ["POST"]
    pattern: '/api/v1/business/auth/login'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/business_dashboard').businessLoginValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/business_dashboard').businessLoginValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/business_dashboard/auth_controller').default['login']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/business_dashboard/auth_controller').default['login']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'business.auth.business_dashboard_auth.refresh': {
    methods: ["POST"]
    pattern: '/api/v1/business/auth/refresh'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/business_dashboard/auth_controller').default['refresh']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/business_dashboard/auth_controller').default['refresh']>>>
    }
  }
  'business.auth.business_dashboard_auth.logout': {
    methods: ["POST"]
    pattern: '/api/v1/business/auth/logout'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/business_dashboard/auth_controller').default['logout']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/business_dashboard/auth_controller').default['logout']>>>
    }
  }
  'business.auth.business_dashboard_auth.change_password': {
    methods: ["POST"]
    pattern: '/api/v1/business/auth/change-password'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/business_dashboard').businessChangePasswordValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/business_dashboard').businessChangePasswordValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/business_dashboard/auth_controller').default['changePassword']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/business_dashboard/auth_controller').default['changePassword']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'business.dashboard.onboarding.business_dashboard_profile.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/business/dashboard/profile'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/business_dashboard/profile_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/business_dashboard/profile_controller').default['show']>>>
    }
  }
  'business.dashboard.onboarding.business_dashboard_profile.update': {
    methods: ["PATCH"]
    pattern: '/api/v1/business/dashboard/profile'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/business_dashboard').updateBusinessProfileValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/business_dashboard').updateBusinessProfileValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/business_dashboard/profile_controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/business_dashboard/profile_controller').default['update']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'business.dashboard.onboarding.business_logo.dashboard_upload': {
    methods: ["POST"]
    pattern: '/api/v1/business/dashboard/profile/logo'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/business_logo_controller').default['dashboardUpload']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/business_logo_controller').default['dashboardUpload']>>>
    }
  }
  'business.dashboard.onboarding.business_logo.dashboard_remove': {
    methods: ["DELETE"]
    pattern: '/api/v1/business/dashboard/profile/logo'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/business_logo_controller').default['dashboardRemove']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/business_logo_controller').default['dashboardRemove']>>>
    }
  }
  'business.dashboard.onboarding.business_pin.set_pin': {
    methods: ["POST"]
    pattern: '/api/v1/business/dashboard/pin'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/business_dashboard/pin_controller').default['setPin']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/business_dashboard/pin_controller').default['setPin']>>>
    }
  }
  'business.dashboard.onboarding.business_pin.change_pin': {
    methods: ["POST"]
    pattern: '/api/v1/business/dashboard/pin/change'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/business_dashboard/pin_controller').default['changePin']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/business_dashboard/pin_controller').default['changePin']>>>
    }
  }
  'business.dashboard.onboarding.business_kyc.submit': {
    methods: ["POST"]
    pattern: '/api/v1/business/dashboard/kyc/submit'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/business_dashboard/kyc_controller').default['submit']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/business_dashboard/kyc_controller').default['submit']>>>
    }
  }
  'business.dashboard.onboarding.business_kyc.get_status': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/business/dashboard/kyc/status'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/business_dashboard/kyc_controller').default['getStatus']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/business_dashboard/kyc_controller').default['getStatus']>>>
    }
  }
  'business.dashboard.onboarding.business_notifications.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/business/dashboard/notifications'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/business_dashboard/notifications_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/business_dashboard/notifications_controller').default['index']>>>
    }
  }
  'business.dashboard.onboarding.business_notifications.mark_read': {
    methods: ["PATCH"]
    pattern: '/api/v1/business/dashboard/notifications/:id/read'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/business_dashboard/notifications_controller').default['markRead']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/business_dashboard/notifications_controller').default['markRead']>>>
    }
  }
  'business.dashboard.onboarding.business_notifications.mark_all_read': {
    methods: ["POST"]
    pattern: '/api/v1/business/dashboard/notifications/read-all'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/business_dashboard/notifications_controller').default['markAllRead']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/business_dashboard/notifications_controller').default['markAllRead']>>>
    }
  }
  'business.dashboard.onboarding.business_plan.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/business/dashboard/plans'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/business/plan_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/business/plan_controller').default['index']>>>
    }
  }
  'business.dashboard.onboarding.business_plan.current': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/business/dashboard/plan'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/business/plan_controller').default['current']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/business/plan_controller').default['current']>>>
    }
  }
  'business.dashboard.onboarding.business_plan.subscribe': {
    methods: ["POST"]
    pattern: '/api/v1/business/dashboard/plan/subscribe'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/business_plan').subscribeToPlanValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/business_plan').subscribeToPlanValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/business/plan_controller').default['subscribe']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/business/plan_controller').default['subscribe']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'business.dashboard.pin_reset.business_pin.request_reset': {
    methods: ["POST"]
    pattern: '/api/v1/business/dashboard/pin/reset'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/business_dashboard/pin_controller').default['requestReset']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/business_dashboard/pin_controller').default['requestReset']>>>
    }
  }
  'business.dashboard.pin_reset.business_pin.confirm_reset': {
    methods: ["POST"]
    pattern: '/api/v1/business/dashboard/pin/reset/confirm'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/business_dashboard/pin_controller').default['confirmReset']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/business_dashboard/pin_controller').default['confirmReset']>>>
    }
  }
  'business.dashboard.business_deposits.store': {
    methods: ["POST"]
    pattern: '/api/v1/business/dashboard/mobile-money/deposits'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/mobile_money').createMobileMoneyDepositValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/mobile_money').createMobileMoneyDepositValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/business/deposits_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/business/deposits_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'business.dashboard.business_deposits.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/business/dashboard/mobile-money/deposits/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/business/deposits_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/business/deposits_controller').default['show']>>>
    }
  }
  'business.dashboard.business_deposits.live_status': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/business/dashboard/mobile-money/deposits/:id/live-status'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/business/deposits_controller').default['liveStatus']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/business/deposits_controller').default['liveStatus']>>>
    }
  }
  'business.dashboard.business_payouts.store': {
    methods: ["POST"]
    pattern: '/api/v1/business/dashboard/mobile-money/payouts'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/mobile_money').createMobileMoneyPayoutValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/mobile_money').createMobileMoneyPayoutValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/business/payouts_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/business/payouts_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'business.dashboard.business_payouts.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/business/dashboard/mobile-money/payouts/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/business/payouts_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/business/payouts_controller').default['show']>>>
    }
  }
  'business.dashboard.business_payouts.live_status': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/business/dashboard/mobile-money/payouts/:id/live-status'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/business/payouts_controller').default['liveStatus']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/business/payouts_controller').default['liveStatus']>>>
    }
  }
  'business.dashboard.business_crypto.address': {
    methods: ["POST"]
    pattern: '/api/v1/business/dashboard/crypto/deposits/address'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/crypto').createCryptoDepositAddressValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/crypto').createCryptoDepositAddressValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/business/crypto_controller').default['address']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/business/crypto_controller').default['address']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'business.dashboard.business_crypto.payout': {
    methods: ["POST"]
    pattern: '/api/v1/business/dashboard/crypto/payouts'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/crypto').createCryptoPayoutValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/crypto').createCryptoPayoutValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/business/crypto_controller').default['payout']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/business/crypto_controller').default['payout']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'business.dashboard.business_wallet.store': {
    methods: ["POST"]
    pattern: '/api/v1/business/dashboard/wallet'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/business_wallet').createBusinessWalletValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/business_wallet').createBusinessWalletValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/business/wallet_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/business/wallet_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'business.dashboard.business_wallet.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/business/dashboard/wallet'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/business/wallet_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/business/wallet_controller').default['index']>>>
    }
  }
  'business.dashboard.business_wallet.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/business/dashboard/wallet/:currency'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { currency: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/business/wallet_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/business/wallet_controller').default['show']>>>
    }
  }
  'business.dashboard.business_swaps.quote': {
    methods: ["POST"]
    pattern: '/api/v1/business/dashboard/swaps/quote'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/fx').createSwapQuoteValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/fx').createSwapQuoteValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/business/swaps_controller').default['quote']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/business/swaps_controller').default['quote']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'business.dashboard.business_swaps.store': {
    methods: ["POST"]
    pattern: '/api/v1/business/dashboard/swaps'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/fx').executeSwapValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/fx').executeSwapValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/business/swaps_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/business/swaps_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'business.dashboard.business_transactions.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/business/dashboard/transactions'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/business/transactions_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/business/transactions_controller').default['index']>>>
    }
  }
  'business.dashboard.business_merchant_payments.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/business/dashboard/merchant-payments'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/business/merchant_payments_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/business/merchant_payments_controller').default['index']>>>
    }
  }
  'business.dashboard.business_webhooks.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/business/dashboard/webhooks'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/business/webhooks_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/business/webhooks_controller').default['index']>>>
    }
  }
  'business.dashboard.business_webhooks.store': {
    methods: ["POST"]
    pattern: '/api/v1/business/dashboard/webhooks'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/business/webhooks_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/business/webhooks_controller').default['store']>>>
    }
  }
  'business.dashboard.business_webhooks.destroy': {
    methods: ["DELETE"]
    pattern: '/api/v1/business/dashboard/webhooks/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/business/webhooks_controller').default['destroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/business/webhooks_controller').default['destroy']>>>
    }
  }
  'business.dashboard.business_webhooks.get_deliveries': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/business/dashboard/webhooks/:id/deliveries'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/business/webhooks_controller').default['getDeliveries']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/business/webhooks_controller').default['getDeliveries']>>>
    }
  }
  'business.dashboard.business_toolkit.list_payment_methods': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/business/dashboard/mobile-money/payment-methods'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/mobile_money').listPaymentMethodsValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/business/toolkit_controller').default['listPaymentMethods']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/business/toolkit_controller').default['listPaymentMethods']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'business.dashboard.business_toolkit.list_all_payment_methods_raw': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/business/dashboard/mobile-money/payment-methods/raw'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/business/toolkit_controller').default['listAllPaymentMethodsRaw']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/business/toolkit_controller').default['listAllPaymentMethodsRaw']>>>
    }
  }
  'business.dashboard.business_overview.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/business/dashboard/overview'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/business_dashboard/overview_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/business_dashboard/overview_controller').default['show']>>>
    }
  }
  'business.dashboard.business_sandbox.fund': {
    methods: ["POST"]
    pattern: '/api/v1/business/dashboard/sandbox/fund'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/sandbox').fundSandboxWalletValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/sandbox').fundSandboxWalletValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/business/sandbox_controller').default['fund']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/business/sandbox_controller').default['fund']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'business.dashboard.business_dashboard_api_keys.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/business/dashboard/api-keys'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/business_dashboard/api_keys_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/business_dashboard/api_keys_controller').default['index']>>>
    }
  }
  'business.dashboard.business_dashboard_api_keys.store': {
    methods: ["POST"]
    pattern: '/api/v1/business/dashboard/api-keys'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/business_dashboard/api_keys_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/business_dashboard/api_keys_controller').default['store']>>>
    }
  }
  'business.dashboard.business_dashboard_api_keys.destroy': {
    methods: ["DELETE"]
    pattern: '/api/v1/business/dashboard/api-keys/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/business_dashboard/api_keys_controller').default['destroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/business_dashboard/api_keys_controller').default['destroy']>>>
    }
  }
  'business.dashboard.business_cards.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/business/dashboard/cards'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/business/cards_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/business/cards_controller').default['index']>>>
    }
  }
  'business.dashboard.business_cards.store': {
    methods: ["POST"]
    pattern: '/api/v1/business/dashboard/cards'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/business_cards').createBusinessCardValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/business_cards').createBusinessCardValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/business/cards_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/business/cards_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'business.dashboard.business_cards.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/business/dashboard/cards/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/business/cards_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/business/cards_controller').default['show']>>>
    }
  }
  'business.dashboard.business_cards.topup': {
    methods: ["PATCH"]
    pattern: '/api/v1/business/dashboard/cards/:id/topup'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/business_cards').businessCardAmountValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/business_cards').businessCardAmountValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/business/cards_controller').default['topup']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/business/cards_controller').default['topup']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'business.dashboard.business_cards.withdraw': {
    methods: ["PATCH"]
    pattern: '/api/v1/business/dashboard/cards/:id/withdraw'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/business_cards').businessCardAmountValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/business_cards').businessCardAmountValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/business/cards_controller').default['withdraw']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/business/cards_controller').default['withdraw']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'business.dashboard.business_cards.freeze': {
    methods: ["PATCH"]
    pattern: '/api/v1/business/dashboard/cards/:id/freeze'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/business_cards').businessCardActionValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/business_cards').businessCardActionValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/business/cards_controller').default['freeze']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/business/cards_controller').default['freeze']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'business.dashboard.business_cards.unfreeze': {
    methods: ["PATCH"]
    pattern: '/api/v1/business/dashboard/cards/:id/unfreeze'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/business_cards').businessCardActionValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/business_cards').businessCardActionValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/business/cards_controller').default['unfreeze']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/business/cards_controller').default['unfreeze']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'business.dashboard.business_cards.terminate': {
    methods: ["POST"]
    pattern: '/api/v1/business/dashboard/cards/:id/terminate'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/business_cards').businessCardActionValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/business_cards').businessCardActionValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/business/cards_controller').default['terminate']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/business/cards_controller').default['terminate']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'business.dashboard.business_cards.transactions': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/business/dashboard/cards/:id/transactions'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/business_cards').listBusinessCardTransactionsValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/business/cards_controller').default['transactions']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/business/cards_controller').default['transactions']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'business.dashboard.lending_products.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/business/dashboard/products'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/lending/products_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/lending/products_controller').default['index']>>>
    }
  }
  'business.dashboard.lending_products.store': {
    methods: ["POST"]
    pattern: '/api/v1/business/dashboard/products'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/financial_products').createFinancialProductValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/financial_products').createFinancialProductValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/lending/products_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/lending/products_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'business.dashboard.lending_products.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/business/dashboard/products/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/lending/products_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/lending/products_controller').default['show']>>>
    }
  }
  'business.dashboard.lending_products.update': {
    methods: ["PATCH"]
    pattern: '/api/v1/business/dashboard/products/:id'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/financial_products').updateFinancialProductValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/financial_products').updateFinancialProductValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/lending/products_controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/lending/products_controller').default['update']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'business.dashboard.lending_products.submit': {
    methods: ["POST"]
    pattern: '/api/v1/business/dashboard/products/:id/submit'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/lending/products_controller').default['submit']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/lending/products_controller').default['submit']>>>
    }
  }
  'business.dashboard.lending_products.archive': {
    methods: ["POST"]
    pattern: '/api/v1/business/dashboard/products/:id/archive'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/lending/products_controller').default['archive']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/lending/products_controller').default['archive']>>>
    }
  }
  'business.dashboard.business_dashboard_outlets.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/business/dashboard/outlets'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/business_dashboard/outlets_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/business_dashboard/outlets_controller').default['index']>>>
    }
  }
  'business.dashboard.business_dashboard_outlets.store': {
    methods: ["POST"]
    pattern: '/api/v1/business/dashboard/outlets'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/business_dashboard/outlets_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/business_dashboard/outlets_controller').default['store']>>>
    }
  }
  'business.dashboard.business_dashboard_outlets.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/business/dashboard/outlets/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/business_dashboard/outlets_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/business_dashboard/outlets_controller').default['show']>>>
    }
  }
  'business.dashboard.business_dashboard_outlets.update': {
    methods: ["PATCH"]
    pattern: '/api/v1/business/dashboard/outlets/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/business_dashboard/outlets_controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/business_dashboard/outlets_controller').default['update']>>>
    }
  }
  'business.dashboard.business_dashboard_outlets.suspend': {
    methods: ["POST"]
    pattern: '/api/v1/business/dashboard/outlets/:id/suspend'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/business_dashboard/outlets_controller').default['suspend']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/business_dashboard/outlets_controller').default['suspend']>>>
    }
  }
  'business.dashboard.business_dashboard_outlets.reactivate': {
    methods: ["POST"]
    pattern: '/api/v1/business/dashboard/outlets/:id/reactivate'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/business_dashboard/outlets_controller').default['reactivate']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/business_dashboard/outlets_controller').default['reactivate']>>>
    }
  }
  'business.dashboard.business_dashboard_staff.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/business/dashboard/staff'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/business_dashboard/staff_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/business_dashboard/staff_controller').default['index']>>>
    }
  }
  'business.dashboard.business_dashboard_staff.store': {
    methods: ["POST"]
    pattern: '/api/v1/business/dashboard/staff'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/business_dashboard/staff_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/business_dashboard/staff_controller').default['store']>>>
    }
  }
  'business.dashboard.business_dashboard_staff.update': {
    methods: ["PATCH"]
    pattern: '/api/v1/business/dashboard/staff/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/business_dashboard/staff_controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/business_dashboard/staff_controller').default['update']>>>
    }
  }
  'business.dashboard.business_dashboard_activity.sessions': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/business/dashboard/teller-sessions'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/business_dashboard/activity_controller').default['sessions']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/business_dashboard/activity_controller').default['sessions']>>>
    }
  }
  'business.dashboard.business_dashboard_portfolio.loans': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/business/dashboard/loans'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/business_dashboard/portfolio_controller').default['loans']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/business_dashboard/portfolio_controller').default['loans']>>>
    }
  }
  'business.dashboard.business_dashboard_portfolio.loan': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/business/dashboard/loans/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/business_dashboard/portfolio_controller').default['loan']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/business_dashboard/portfolio_controller').default['loan']>>>
    }
  }
  'business.dashboard.business_dashboard_portfolio.savings': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/business/dashboard/savings'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/business_dashboard/portfolio_controller').default['savings']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/business_dashboard/portfolio_controller').default['savings']>>>
    }
  }
  'business.dashboard.business_dashboard_portfolio.customers': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/business/dashboard/customers'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/business_dashboard/portfolio_controller').default['customers']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/business_dashboard/portfolio_controller').default['customers']>>>
    }
  }
  'business.dashboard.counter_journal.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/business/dashboard/journal'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/counter/journal_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/counter/journal_controller').default['index']>>>
    }
  }
  'business.dashboard.business_dashboard_imf.regulatory_report': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/business/dashboard/imf/regulatory-report'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/business_dashboard/imf_controller').default['regulatoryReport']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/business_dashboard/imf_controller').default['regulatoryReport']>>>
    }
  }
  'business.dashboard.business_dashboard_imf.provisioning': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/business/dashboard/imf/provisioning'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/business_dashboard/imf_controller').default['provisioning']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/business_dashboard/imf_controller').default['provisioning']>>>
    }
  }
  'business.dashboard.business_dashboard_imf.arrears': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/business/dashboard/imf/arrears'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/business_dashboard/imf_controller').default['arrears']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/business_dashboard/imf_controller').default['arrears']>>>
    }
  }
  'business.dashboard.business_dashboard_imf_migration.validate': {
    methods: ["POST"]
    pattern: '/api/v1/business/dashboard/imf/migration/validate'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/business_dashboard/imf_migration_controller').default['validate']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/business_dashboard/imf_migration_controller').default['validate']>>>
    }
  }
  'business.dashboard.business_dashboard_imf_migration.commit': {
    methods: ["POST"]
    pattern: '/api/v1/business/dashboard/imf/migration/commit'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/business_dashboard/imf_migration_controller').default['commit']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/business_dashboard/imf_migration_controller').default['commit']>>>
    }
  }
  'event_stream': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/__transmit/events'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'subscribe': {
    methods: ["POST"]
    pattern: '/api/v1/__transmit/subscribe'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'unsubscribe': {
    methods: ["POST"]
    pattern: '/api/v1/__transmit/unsubscribe'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
}
