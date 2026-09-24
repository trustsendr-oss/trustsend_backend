import type { HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'
import { AlchemySignatureService } from '#services/crypto/alchemy_signature_service'
import { CryptoDepositService } from '#services/crypto/crypto_deposit_service'

export default class CryptoWebhooksController {
  /**
   * POST /api/v1/crypto/webhooks/alchemy
   * Alchemy Address Activity Webhook listener.
   */
  async alchemy({ request, response }: HttpContext) {
    const rawBody = request.raw() || JSON.stringify(request.body())
    const signature = request.header('x-alchemy-signature')

    const isValid = AlchemySignatureService.verify(rawBody, signature)
    if (!isValid) {
      logger.warn('Alchemy webhook signature verification failed')
      return response.unauthorized({ message: 'Invalid webhook signature' })
    }

    const payload = request.body()
    const event = payload?.event
    if (!event || !event.activity || !Array.isArray(event.activity)) {
      return response.ok({ message: 'Event ignored: no activity array' })
    }

    const network = (event.network || payload?.network || 'polygon').toLowerCase()
    const processed: string[] = []

    for (const activity of event.activity) {
      try {
        const toAddress = activity.to
        const fromAddress = activity.from
        const txHash = activity.hash
        const logIndex = activity.logIndex || 0
        const blockNum = activity.blockNum

        // Asset / Token symbol (USDC, USDT, etc.)
        let tokenSymbol = (activity.asset || 'USDC').toUpperCase()
        let rawAmount: string | bigint = '0'

        if (activity.rawContract?.rawValue) {
          rawAmount = activity.rawContract.rawValue
        } else if (activity.value !== null && activity.value !== undefined) {
          // If value is in whole units (e.g. 10.5 USDC), convert to 6 decimals raw
          const valNum = Number(activity.value)
          rawAmount = BigInt(Math.round(valNum * 1_000_000))
        }

        if (!toAddress || !txHash || rawAmount === '0' || rawAmount === 0n) {
          continue
        }

        const txn = await CryptoDepositService.processIncomingDeposit({
          network,
          tokenSymbol,
          toAddress,
          fromAddress,
          rawAmount,
          txHash,
          blockNumber: blockNum,
          logIndex,
        })

        processed.push(txn.id)
      } catch (err: any) {
        if (err.name === 'CryptoDepositAddressNotFoundException') {
          // Normal: an event for an untracked address or non-user address
          logger.info(`Ignored transfer: ${err.message}`)
        } else {
          logger.error({ err }, `Error processing Alchemy deposit: ${err.message}`)
        }
      }
    }

    return response.ok({
      status: 'success',
      processed_count: processed.length,
      processed_transactions: processed,
    })
  }
}
