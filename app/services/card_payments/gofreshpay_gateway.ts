import env from '#start/env'
import { GoFreshPaySignature } from '#services/card_payments/gofreshpay_signature'

/**
 * GoFreshPay (Moko Afrika) card acceptance, Microform flavour: the card fields are CyberSource
 * iframes on our own checkout page, and every server call below is HMAC-signed with a secret
 * that never leaves this process. Docs: https://docs.gofreshpay.com/card/microform and /card/3ds.
 *
 * Amounts cross this boundary in major units (`12.5` for 12,50 USD), which is what their API
 * takes; everything on our side stays in hundredths (see toMajor()).
 */

export class GoFreshPayRequestException extends Error {
  /**
   * `unknown` means the request may or may not have been acted on (network error, timeout, 5xx):
   * a charge in that state must be settled by asking for its status, never assumed failed.
   * `rejected` means GoFreshPay answered with a 4xx: nothing was done.
   */
  constructor(
    message: string,
    readonly outcome: 'unknown' | 'rejected',
    readonly httpStatus: number | null = null
  ) {
    super(message)
    this.name = 'GoFreshPayRequestException'
  }
}

export type BillTo = {
  firstName: string
  lastName: string
  email: string
  phoneNumber: string
  addressLine1: string
  addressCity: string
  addressPostalCode: string
  addressCountry: string
}

export type EnrollResult =
  | { status: 'AUTHENTICATED'; authenticationTransactionId: string }
  | {
      status: 'CHALLENGE_REQUIRED'
      authenticationTransactionId: string
      stepUpUrl: string
      accessToken: string
    }
  | { status: 'FAILED'; reasonCode: string | null; message: string | null }

export type CardDetails = {
  cardType: string | null
  cardLast4: string | null
  cardIssuer: string | null
  cardScheme: string | null
  cardBinCountry: string | null
}

export type ChargeResult = {
  /** Anything that is neither SUCCESS nor FAILED is treated as still undecided. */
  status: 'SUCCESS' | 'FAILED' | 'PENDING'
  gatewayTransactionId: string | null
  reasonCode: string | null
  message: string | null
}

export type PaymentStatusResult = CardDetails & {
  /** PENDING, SUCCESS, FAILED, CANCELLED, EXPIRED, REFUNDED, PARTIALLY_REFUNDED, VOIDED */
  status: string
  message: string | null
}

/** What CardDepositService needs from the gateway — faked in tests. */
export interface CardGateway {
  readonly name: string
  captureContext(params: {
    targetOrigin: string
    merchantReference: string
  }): Promise<{ jwt: string; transactionUuid: string; expiresInSeconds: number }>
  paSetup(params: {
    transientToken: string
    transactionUuid: string
  }): Promise<{ referenceId: string; accessToken: string; deviceDataCollectionUrl: string }>
  paEnroll(params: {
    transientToken: string
    transactionUuid: string
    referenceId: string
    amountMinor: bigint
    currencyCode: string
    billTo: BillTo
    returnUrl: string
  }): Promise<EnrollResult>
  charge(params: {
    transientToken: string
    transactionUuid: string
    authenticationTransactionId: string
    amountMinor: bigint
    currencyCode: string
    merchantReference: string
    billTo: BillTo
    callbackUrl: string
  }): Promise<ChargeResult>
  paymentStatus(transactionUuid: string): Promise<PaymentStatusResult>
}

const BASE_URLS = {
  sandbox: 'https://uc-test.card.gofreshpay.com',
  production: 'https://uc.card.gofreshpay.com',
} as const

const REQUEST_TIMEOUT_MS = 30_000

/** Hundredths to the major-unit number GoFreshPay expects: 1050n → 10.5. */
export function toMajor(minor: bigint): number {
  return Number(minor) / 100
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function cardDetailsOf(data: Record<string, any>): CardDetails {
  return {
    cardType: str(data.card_type),
    cardLast4: str(data.card_last4)?.slice(-4) ?? null,
    cardIssuer: str(data.card_issuer),
    cardScheme: str(data.card_scheme),
    cardBinCountry: str(data.card_bin_country)?.slice(0, 2).toUpperCase() ?? null,
  }
}

function billToBody(billTo: BillTo) {
  return {
    first_name: billTo.firstName,
    last_name: billTo.lastName,
    email: billTo.email,
    phone_number: billTo.phoneNumber,
    address_line1: billTo.addressLine1,
    address_city: billTo.addressCity,
    address_state: '',
    address_postal_code: billTo.addressPostalCode,
    address_country: billTo.addressCountry,
  }
}

export class GoFreshPayGateway implements CardGateway {
  readonly name = 'gofreshpay'

  private get baseUrl(): string {
    return BASE_URLS[env.get('GOFRESHPAY_ENV') ?? 'sandbox']
  }

  private credentials(): { apiKey: string; apiSecret: string } {
    const apiKey = env.get('GOFRESHPAY_API_KEY')
    const apiSecret = env.get('GOFRESHPAY_API_SECRET')
    if (!apiKey || !apiSecret) {
      throw new GoFreshPayRequestException('GoFreshPay credentials are not configured', 'rejected')
    }
    return { apiKey, apiSecret }
  }

  /**
   * One signed POST. The signature covers the exact bytes sent, so the body is serialised once
   * and that same string is both signed and sent.
   */
  private async post<T>(path: string, payload: Record<string, unknown>): Promise<T> {
    const { apiKey, apiSecret } = this.credentials()
    const body = JSON.stringify(payload)
    const timestamp = GoFreshPaySignature.timestamp()

    let response: Response
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-API-Key': apiKey,
          'X-Timestamp': timestamp,
          'X-Signature': GoFreshPaySignature.signRequest(apiSecret, body, timestamp),
        },
        body,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
    } catch (error) {
      throw new GoFreshPayRequestException(
        `GoFreshPay ${path} failed: ${(error as Error).message}`,
        'unknown'
      )
    }

    const json = (await response.json().catch(() => null)) as any
    if (!response.ok) {
      const detail = json?.detail ?? json?.message ?? JSON.stringify(json)
      throw new GoFreshPayRequestException(
        `GoFreshPay ${path} returned ${response.status}: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`,
        response.status >= 500 ? 'unknown' : 'rejected',
        response.status
      )
    }
    return json as T
  }

  async captureContext(params: { targetOrigin: string; merchantReference: string }) {
    const json = await this.post<any>('/api/v1/microform/capture-context', {
      target_origin: params.targetOrigin,
      allowed_card_networks: ['VISA', 'MASTERCARD'],
      locale: 'fr-FR',
      merchant_reference: params.merchantReference,
    })
    const data = json?.data ?? json
    if (!str(data?.jwt) || !str(data?.transaction_uuid)) {
      throw new GoFreshPayRequestException(
        'GoFreshPay capture-context: unexpected response',
        'rejected'
      )
    }
    return {
      jwt: data.jwt as string,
      transactionUuid: data.transaction_uuid as string,
      expiresInSeconds: Number(data.expires_in) || 900,
    }
  }

  async paSetup(params: { transientToken: string; transactionUuid: string }) {
    const json = await this.post<any>('/api/v1/microform/pa-setup', {
      transient_token: params.transientToken,
      transaction_uuid: params.transactionUuid,
    })
    const data = json?.data ?? json
    if (
      !str(data?.reference_id) ||
      !str(data?.access_token) ||
      !str(data?.device_data_collection_url)
    ) {
      throw new GoFreshPayRequestException('GoFreshPay pa-setup: unexpected response', 'rejected')
    }
    return {
      referenceId: data.reference_id as string,
      accessToken: data.access_token as string,
      deviceDataCollectionUrl: data.device_data_collection_url as string,
    }
  }

  async paEnroll(params: Parameters<CardGateway['paEnroll']>[0]): Promise<EnrollResult> {
    // pa-enroll's bill_to has neither phone nor state (see /card/3ds); charge's has both.
    const {
      address_state: unusedState,
      phone_number: unusedPhone,
      ...billTo
    } = billToBody(params.billTo)
    void unusedState
    void unusedPhone
    const json = await this.post<any>('/api/v1/microform/pa-enroll', {
      transient_token: params.transientToken,
      transaction_uuid: params.transactionUuid,
      reference_id: params.referenceId,
      amount: toMajor(params.amountMinor),
      currency: params.currencyCode,
      bill_to: billTo,
      return_url: params.returnUrl,
    })
    const data = json?.data ?? json

    if (data?.status === 'AUTHENTICATED' && str(data.authentication_transaction_id)) {
      return {
        status: 'AUTHENTICATED',
        authenticationTransactionId: data.authentication_transaction_id,
      }
    }
    if (
      data?.status === 'CHALLENGE_REQUIRED' &&
      str(data.authentication_transaction_id) &&
      str(data.step_up_url) &&
      str(data.access_token)
    ) {
      return {
        status: 'CHALLENGE_REQUIRED',
        authenticationTransactionId: data.authentication_transaction_id,
        stepUpUrl: data.step_up_url,
        accessToken: data.access_token,
      }
    }
    return {
      status: 'FAILED',
      reasonCode: str(data?.reason_code),
      message: str(data?.message) ?? 'Authentication failed',
    }
  }

  async charge(params: Parameters<CardGateway['charge']>[0]): Promise<ChargeResult> {
    const json = await this.post<any>('/api/v1/microform/charge', {
      transient_token: params.transientToken,
      transaction_uuid: params.transactionUuid,
      amount: toMajor(params.amountMinor),
      currency: params.currencyCode,
      merchant_reference: params.merchantReference,
      bill_to: billToBody(params.billTo),
      callback_url: params.callbackUrl,
      authentication_transaction_id: params.authenticationTransactionId,
    })
    const data = json?.data ?? json
    const status = data?.status === 'SUCCESS' || data?.status === 'FAILED' ? data.status : 'PENDING'
    return {
      status,
      gatewayTransactionId: str(data?.transaction_id),
      reasonCode: str(data?.reason_code),
      message: str(data?.message),
    }
  }

  async paymentStatus(transactionUuid: string): Promise<PaymentStatusResult> {
    const json = await this.post<any>('/api/v1/payment/status', {
      transaction_uuid: transactionUuid,
    })
    const data = json?.data ?? json
    return {
      status: str(data?.transaction_status) ?? 'PENDING',
      message: str(data?.message),
      ...cardDetailsOf(data ?? {}),
    }
  }
}

export { cardDetailsOf }
