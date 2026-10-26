import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import logger from '@adonisjs/core/services/logger'
import env from '#start/env'
import CryptoDepositAddress from '#models/crypto_deposit_address'
import { AlchemyProvider } from '#services/crypto/alchemy_provider'
import { CryptoDepositService } from '#services/crypto/crypto_deposit_service'
import { CryptoAlerts } from '#services/crypto/crypto_alerts'
import {
  availableDepositRails,
  networkSpec,
  usesTestnets,
  type EvmNetwork,
} from '#services/crypto/crypto_networks'

/** What the reconciliation needs from a node. AlchemyProvider is the real one. */
export interface TransferSource {
  getBlockNumber(network: string): Promise<number>
  getAssetTransfers(network: string, params: Record<string, unknown>): Promise<any>
}

export type ReconciliationResult = {
  networks: number
  addresses: number
  /** Transfers that no webhook had reported: each one is a missed notification. */
  missed: number
  failedNetworks: string[]
}

/** Addresses shown to their owner within this many days are re-scanned. */
const DEFAULT_ACTIVE_DAYS = 7

/** Cursor key: a database switched between sandbox and production never mixes block heights. */
function chainKey(network: EvmNetwork) {
  return `${network}:${usesTestnets() ? 'testnet' : 'mainnet'}`
}

/** `0xabc…:log:5` → 5. */
function logIndexOf(uniqueId: string | undefined): number | null {
  const match = /:log:(\d+)$/.exec(uniqueId ?? '')
  return match ? Number(match[1]) : null
}

/**
 * The safety net behind the Alchemy webhooks.
 *
 * A webhook is the fast path (seconds), but it can be missed: the API down longer than Alchemy
 * retries, an Alchemy outage, an address registered to the wrong webhook. Every tick, this asks
 * the chain itself which stablecoin transfers reached our recently shown deposit addresses since
 * the last scan, and records the ones no webhook reported — through the same recordReported()
 * the webhook uses. Crediting then follows the usual path (CryptoDepositService.confirmPending):
 * receipt, Transfer log and confirmations are re-checked on-chain, so nothing here credits by
 * itself.
 *
 * Every address is scanned on every served network, not only the one it was issued for: the same
 * key receives on all EVM chains, so a transfer sent on the "wrong" network is caught too.
 *
 * Idempotent and restartable: the unique (network, tx_hash, log_index) key absorbs re-scans, each
 * scan overlaps the previous one by the network's confirmation depth, and a network's cursor only
 * moves once all of its addresses were scanned.
 */
export class CryptoReconciliationService {
  static async reconcile(
    source: TransferSource = new AlchemyProvider()
  ): Promise<ReconciliationResult> {
    const result: ReconciliationResult = {
      networks: 0,
      addresses: 0,
      missed: 0,
      failedNetworks: [],
    }

    const activeDays =
      Number(env.get('CRYPTO_RECONCILE_ACTIVE_DAYS', String(DEFAULT_ACTIVE_DAYS))) ||
      DEFAULT_ACTIVE_DAYS
    const rows = await CryptoDepositAddress.query()
      .where('status', 'active')
      .whereNotNull('derivation_index')
      .where('last_requested_at', '>=', DateTime.now().minus({ days: activeDays }).toSQL()!)
      .select('address')
    const addresses = [...new Set(rows.map((row) => row.address.toLowerCase()))]
    result.addresses = addresses.length
    if (addresses.length === 0) return result

    const networks = [...new Set(availableDepositRails().map((rail) => rail.network))]
    for (const network of networks) {
      const spec = networkSpec(network)
      if (!spec) continue
      result.networks++

      try {
        const head = await source.getBlockNumber(network)
        const cursor = await db
          .from('crypto_reconciliation_cursors')
          .where('chain', chainKey(network))
          .first()
        // First run: scan each address's whole history (one call each, whatever the range). Then
        // overlap the previous scan by the confirmation depth, in case of a shallow reorg.
        const fromBlock = cursor ? Math.max(0, Number(cursor.last_block) - spec.confirmations) : 0
        const contracts = Object.values(spec.contracts).map((contract) => contract.address)

        for (const address of addresses) {
          result.missed += await CryptoReconciliationService.scanAddress(
            source,
            network,
            address,
            contracts,
            fromBlock,
            head
          )
        }

        await db
          .table('crypto_reconciliation_cursors')
          .insert({
            chain: chainKey(network),
            last_block: head,
            created_at: new Date(),
            updated_at: new Date(),
          })
          .onConflict('chain')
          .merge({ last_block: head, updated_at: new Date() })
      } catch (error) {
        // The cursor stays put: the next tick re-scans the same range.
        result.failedNetworks.push(network)
        logger.error({ err: error, network }, 'crypto reconciliation failed on this network')
      }
    }

    if (result.missed > 0) {
      CryptoAlerts.raise(
        'webhook_missed',
        'reconciliation',
        'Dépôts rattrapés par la réconciliation',
        `${result.missed} dépôt(s) n'avaient été signalés par aucun webhook. Vérifiez les webhooks Alchemy.`,
        { depots: result.missed }
      )
    }
    return result
  }

  /** Records the transfers to one address in [fromBlock, head]; returns how many were new. */
  private static async scanAddress(
    source: TransferSource,
    network: EvmNetwork,
    address: string,
    contracts: string[],
    fromBlock: number,
    head: number
  ): Promise<number> {
    let missed = 0
    let pageKey: string | undefined
    do {
      const page = await source.getAssetTransfers(network, {
        toAddress: address,
        contractAddresses: contracts,
        category: ['erc20'],
        fromBlock: `0x${fromBlock.toString(16)}`,
        toBlock: `0x${head.toString(16)}`,
        excludeZeroValue: true,
        maxCount: '0x3e8',
        ...(pageKey ? { pageKey } : {}),
      })

      for (const transfer of page?.transfers ?? []) {
        const logIndex = logIndexOf(transfer.uniqueId)
        const rawValue = transfer.rawContract?.value
        if (logIndex === null || !transfer.hash || !rawValue) continue

        const deposit = await CryptoDepositService.recordReported({
          network,
          txHash: String(transfer.hash),
          logIndex,
          contractAddress: String(transfer.rawContract.address ?? ''),
          toAddress: String(transfer.to ?? address),
          fromAddress: transfer.from ?? null,
          rawAmount: BigInt(rawValue),
          blockNumber: transfer.blockNum ? BigInt(transfer.blockNum) : null,
        })
        // A row created now is one the webhook never delivered.
        if (deposit?.$isLocal) {
          missed++
          logger.warn(
            { depositId: deposit.id, network, txHash: deposit.txHash },
            'crypto deposit recovered by reconciliation'
          )
        }
      }
      pageKey = page?.pageKey
    } while (pageKey)
    return missed
  }
}
