import { BaseCommand, args } from '@adonisjs/core/ace'

/**
 * Recovers a stablecoin deposit whose webhook never arrived.
 *
 * Alchemy only reports transfers made after an address joined its webhook, and never replays the
 * past: a deposit sent while the address was not watched (webhook misconfigured, server down too
 * long for Alchemy's retries, address issued before a network was configured) is on-chain but
 * unknown here. This reads the transaction from the chain, records every Transfer of a known
 * stablecoin to one of our deposit addresses — exactly what the webhook would have recorded — and
 * makes sure the address is watched from now on. Crediting then goes through the usual checks:
 * receipt, log and confirmations.
 */
export default class ImportCryptoDeposit extends BaseCommand {
  static commandName = 'crypto:import-deposit'
  static description = 'Record and credit an on-chain stablecoin deposit that no webhook reported'

  static options = {
    startApp: true,
  }

  @args.string({ description: 'Network: ethereum, polygon, arbitrum, optimism, base or bsc' })
  declare network: string

  @args.string({ description: 'Transaction hash (0x…)' })
  declare txHash: string

  async run() {
    const { AlchemyProvider } = await import('#services/crypto/alchemy_provider')
    const { AlchemyNotify } = await import('#services/crypto/alchemy_notify')
    const { CryptoDepositService } = await import('#services/crypto/crypto_deposit_service')
    const { isEvmNetwork, networkSpec, usesTestnets } =
      await import('#services/crypto/crypto_networks')

    const network = this.network.toLowerCase()
    if (!isEvmNetwork(network) || !networkSpec(network)) {
      this.logger.error(`Unknown or unsupported network "${this.network}" on this deployment`)
      this.exitCode = 1
      return
    }
    this.logger.info(
      `${network} ${usesTestnets() ? '(testnet — sandbox)' : '(mainnet)'} · ${this.txHash}`
    )

    const receipt = await new AlchemyProvider().getTransactionReceipt(network, this.txHash)
    if (!receipt) {
      this.logger.error('Transaction not found on this network')
      this.exitCode = 1
      return
    }
    if (receipt.status !== '0x1') {
      this.logger.error('The transaction failed on-chain: nothing to credit')
      this.exitCode = 1
      return
    }

    const transferTopic = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
    const recorded = []
    for (const log of receipt.logs ?? []) {
      if (String(log.topics?.[0]).toLowerCase() !== transferTopic) continue
      const deposit = await CryptoDepositService.recordReported({
        network,
        txHash: this.txHash,
        logIndex: Number(log.logIndex),
        contractAddress: String(log.address),
        toAddress: `0x${String(log.topics[2]).slice(-40)}`,
        fromAddress: `0x${String(log.topics[1]).slice(-40)}`,
        rawAmount: BigInt(log.data),
        blockNumber: BigInt(receipt.blockNumber),
      })
      if (deposit) recorded.push(deposit)
    }

    if (recorded.length === 0) {
      this.logger.warning(
        'No transfer of a known stablecoin to one of our deposit addresses in this transaction'
      )
      return
    }

    for (const address of new Set(recorded.map((deposit) => deposit.toAddress))) {
      await AlchemyNotify.watch(network, address)
      this.logger.info(`Address ${address} is watched on ${network} from now on`)
    }

    // Same checks as the scheduled job; this only spares waiting for its next tick.
    await CryptoDepositService.confirmPending()
    for (const deposit of recorded) {
      await deposit.refresh()
      const detail = deposit.status === 'rejected' ? ` (${deposit.rejectReason})` : ''
      this.logger.info(
        `Deposit #${deposit.id}: ${deposit.tokenSymbol} ${deposit.rawAmount} base units → ${deposit.status}${detail}, ${deposit.confirmations} confirmations`
      )
    }
  }
}
