import type Remittance from '#models/remittance'
import { RemittanceService } from '#services/remittances/remittance_service'

/** 243812345678 → "243 81• ••• •78": enough to confirm, not enough to skip asking. */
function maskPhone(phone: string): string {
  return `${phone.slice(0, 5)}• ••• •${phone.slice(-2)}`
}

const money = (r: Remittance) => ({
  source_currency: r.sourceCurrency,
  send_amount: r.sendAmount.toString(),
  fee: r.fee.toString(),
  total_debited: (r.sendAmount + r.fee).toString(),
  payout_currency: r.payoutCurrency,
  payout_amount: r.payoutAmount.toString(),
  rate: r.rate,
})

/**
 * What each party may see of a remittance. The pickup code only ever goes to the sender, and the
 * beneficiary's full phone number never reaches the agent (it is the second factor at payout).
 */
export const RemittancePresenter = {
  forSender(r: Remittance) {
    return {
      id: r.id,
      status: r.status,
      ...money(r),
      payout_method: r.payoutMethod,
      payout_provider_code: r.payoutProviderCode,
      beneficiary: { name: r.beneficiaryName, phone: r.beneficiaryPhone, city: r.beneficiaryCity },
      pickup_code: RemittanceService.revealCode(r),
      purpose: r.purpose,
      failure_reason: r.status === 'held' ? null : r.failureReason,
      paid_at: r.paidAt,
      expires_at: r.expiresAt,
      created_at: r.createdAt,
    }
  },

  forAgent(r: Remittance) {
    return {
      id: r.id,
      status: r.status,
      payout_currency: r.payoutCurrency,
      payout_amount: r.payoutAmount.toString(),
      beneficiary: {
        name: r.beneficiaryName,
        phone_hint: maskPhone(r.beneficiaryPhone),
        city: r.beneficiaryCity,
      },
      sender: { name: r.senderName, country: r.senderCountry },
      expires_at: r.expiresAt,
      created_at: r.createdAt,
    }
  },

  forAdmin(r: Remittance) {
    return {
      id: r.id,
      status: r.status,
      ...money(r),
      fx_margin: r.fxMargin.toString(),
      payout_method: r.payoutMethod,
      payout_provider_code: r.payoutProviderCode,
      payout_provider_reference: r.payoutProviderReference,
      payout_provider_transaction_id: r.payoutProviderTransactionId,
      dispatched_at: r.dispatchedAt,
      sender_user_id: r.senderUserId,
      sender_name: r.senderName,
      sender_country: r.senderCountry,
      beneficiary_name: r.beneficiaryName,
      beneficiary_phone: r.beneficiaryPhone,
      beneficiary_city: r.beneficiaryCity,
      beneficiary_user_id: r.beneficiaryUserId,
      purpose: r.purpose,
      hold_reason: r.holdReason,
      failure_reason: r.failureReason,
      verification_failures: r.verificationFailures,
      paid_by_agent_id: r.paidByAgentId,
      beneficiary_id_type: r.beneficiaryIdType,
      beneficiary_id_number: r.beneficiaryIdNumber,
      paid_at: r.paidAt,
      expires_at: r.expiresAt,
      send_transaction_id: r.sendTransactionId,
      payout_transaction_id: r.payoutTransactionId,
      refund_transaction_id: r.refundTransactionId,
      created_at: r.createdAt,
    }
  },
}
