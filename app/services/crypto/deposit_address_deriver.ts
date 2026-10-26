import { HDNodeWallet } from 'ethers'
import env from '#start/env'

export class CryptoDepositsNotConfiguredException extends Error {
  constructor(reason: string) {
    super(`Crypto deposits are not configured: ${reason}`)
    this.name = 'CryptoDepositsNotConfiguredException'
  }
}

/**
 * Turns a derivation index into a real, spendable deposit address — without the server ever
 * holding a private key.
 *
 * `CRYPTO_DEPOSIT_XPUB` is the account-level extended public key of the treasury's HD wallet
 * (BIP-44 path m/44'/60'/0'). Address n is its external child 0/n, the same address any standard
 * wallet derives at m/44'/60'/0'/0/n from the mnemonic, which treasury keeps offline and uses to
 * sweep. The server can only watch these addresses; a breach of it cannot move the funds.
 *
 * The same address is valid on every EVM network, which is why one index serves an owner across
 * all of them: a deposit sent on the wrong chain still lands on a key treasury controls.
 */
export class DepositAddressDeriver {
  static deriveAddress(index: number): string {
    const xpub = env.get('CRYPTO_DEPOSIT_XPUB')
    if (!xpub) {
      throw new CryptoDepositsNotConfiguredException('CRYPTO_DEPOSIT_XPUB is not set')
    }
    if (!Number.isInteger(index) || index < 0 || index >= 2 ** 31) {
      throw new Error(`Invalid derivation index ${index}`)
    }

    const account = HDNodeWallet.fromExtendedKey(xpub)
    if (account instanceof HDNodeWallet) {
      // An xprv here would put spending keys on the API server: refuse rather than use it.
      throw new CryptoDepositsNotConfiguredException(
        'CRYPTO_DEPOSIT_XPUB must be an extended PUBLIC key (xpub…), never an xprv'
      )
    }
    return account.deriveChild(0).deriveChild(index).address.toLowerCase()
  }
}
