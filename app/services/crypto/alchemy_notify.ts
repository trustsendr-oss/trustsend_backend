import env from '#start/env'
import type { EvmNetwork } from '#services/crypto/crypto_networks'
import { webhookIdFor } from '#services/crypto/crypto_networks'
import { CryptoDepositsNotConfiguredException } from '#services/crypto/deposit_address_deriver'

export type AddressRegistrar = (
  network: EvmNetwork,
  webhookId: string,
  address: string
) => Promise<void>

/**
 * Adds a deposit address to the network's Alchemy address-activity webhook.
 *
 * Alchemy only reports transfers to addresses it was told about, so an address is handed to a
 * user only after this succeeds: an unwatched address would take the money on-chain and never
 * credit it. Adding an address that is already watched is a no-op on Alchemy's side.
 */
export class AlchemyNotify {
  /** Swappable in tests, where no Alchemy dashboard is reachable. */
  static registrar: AddressRegistrar = async (_network, webhookId, address) => {
    const token = env.get('ALCHEMY_AUTH_TOKEN')
    if (!token) {
      throw new CryptoDepositsNotConfiguredException('ALCHEMY_AUTH_TOKEN is not set')
    }

    const response = await fetch('https://dashboard.alchemy.com/api/update-webhook-addresses', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-Alchemy-Token': token },
      body: JSON.stringify({
        webhook_id: webhookId,
        addresses_to_add: [address],
        addresses_to_remove: [],
      }),
    })

    if (!response.ok) {
      throw new Error(
        `Alchemy rejected the address registration (HTTP ${response.status}): ${await response.text()}`
      )
    }
  }

  static async watch(network: EvmNetwork, address: string): Promise<void> {
    const webhookId = webhookIdFor(network)
    if (!webhookId) {
      throw new CryptoDepositsNotConfiguredException(
        `no Alchemy webhook for ${network} in ALCHEMY_WEBHOOK_IDS`
      )
    }
    await AlchemyNotify.registrar(network, webhookId, address)
  }
}
