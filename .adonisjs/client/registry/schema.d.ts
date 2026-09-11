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
}
