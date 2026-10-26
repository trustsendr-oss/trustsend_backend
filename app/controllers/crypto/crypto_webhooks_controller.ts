import type { HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'
import { AlchemySignatureService } from '#services/crypto/alchemy_signature_service'
import { CryptoDepositService } from '#services/crypto/crypto_deposit_service'
import { networkFromAlchemy } from '#services/crypto/crypto_networks'

/** `0x1a` or `26` → 26; anything unreadable → null. */
function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) ? parsed : null
}

function toBigInt(value: unknown): bigint | null {
  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'bigint')
    return null
  try {
    return BigInt(value)
  } catch {
    return null
  }
}

export default class CryptoWebhooksController {
  /**
   * POST /api/v1/webhooks/alchemy
   * Alchemy address-activity webhook.
   *
   * Records reported transfers as pending deposits and nothing more: the chain, not this
   * payload, decides whether money is credited (see CryptoDepositService.confirmPending). The
   * signature is still required, so nobody can fill the pending queue with invented transfers.
   */
  async alchemy({ request, response }: HttpContext) {
    const rawBody = request.raw() ?? ''
    if (!AlchemySignatureService.verify(rawBody, request.header('x-alchemy-signature'))) {
      logger.warn('Alchemy webhook signature verification failed')
      return response.unauthorized({ message: 'Invalid webhook signature' })
    }

    const payload = request.body()
    const network = networkFromAlchemy(payload?.event?.network)
    const activity = payload?.event?.activity
    if (!network || !Array.isArray(activity)) {
      // A testnet, a network we do not credit, or a webhook type we do not use.
      return response.ok({ status: 'ignored', recorded_count: 0 })
    }

    let recorded = 0
    for (const item of activity) {
      const log = item?.log ?? {}
      const report = {
        network,
        txHash: String(item?.hash ?? log.transactionHash ?? ''),
        logIndex: toNumber(log.logIndex ?? item?.logIndex),
        contractAddress: String(item?.rawContract?.address ?? log.address ?? ''),
        toAddress: String(item?.toAddress ?? item?.to ?? ''),
        fromAddress: item?.fromAddress ?? item?.from ?? null,
        rawAmount: toBigInt(item?.rawContract?.rawValue ?? log.data),
        blockNumber: toBigInt(item?.blockNum ?? log.blockNumber),
      }

      // Native-coin transfers carry no contract and no log index; malformed items are skipped.
      if (
        log.removed === true ||
        !report.txHash ||
        report.logIndex === null ||
        !report.contractAddress ||
        !report.toAddress ||
        !report.rawAmount ||
        report.rawAmount <= 0n
      ) {
        continue
      }

      try {
        const deposit = await CryptoDepositService.recordReported({
          ...report,
          logIndex: report.logIndex,
          rawAmount: report.rawAmount,
        })
        if (deposit) recorded++
      } catch (error) {
        // Answering 5xx makes Alchemy retry the whole event, which recordReported tolerates.
        logger.error({ err: error, txHash: report.txHash }, 'Alchemy deposit could not be recorded')
        return response.internalServerError({ message: 'Deposit could not be recorded' })
      }
    }

    return response.ok({ status: 'success', recorded_count: recorded })
  }
}
