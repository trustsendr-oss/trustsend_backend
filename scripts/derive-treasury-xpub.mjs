#!/usr/bin/env node
/**
 * Construit la xpub de trésorerie (CRYPTO_DEPOSIT_XPUB) à partir de la phrase secrète.
 *
 *   node scripts/derive-treasury-xpub.mjs
 *
 * À lancer sur une machine de confiance, idéalement hors ligne (Wi-Fi coupé).
 *
 * - Les 12 (ou 24) mots sont tapés sans s'afficher, et ne sont écrits nulle part :
 *   ni fichier, ni historique du terminal, ni réseau.
 * - Seule la xpub sort du script. Elle permet de RECEVOIR (dériver les adresses
 *   de dépôt), jamais de dépenser : c'est elle, et elle seule, que reçoit le serveur.
 * - Elle reste confidentielle malgré tout : elle révèle toutes les adresses de
 *   dépôt, donc tous les montants reçus.
 *
 * Chemin : m/44'/60'/0' (compte 0 d'Ethereum, BIP-44). Le serveur dérive
 * l'adresse de dépôt n au chemin m/44'/60'/0'/0/n, comme n'importe quel
 * portefeuille standard à partir de la même phrase — c'est ce qui permet à la
 * trésorerie de récupérer les fonds.
 */
import { createInterface } from 'node:readline'
import { HDNodeWallet, Mnemonic } from 'ethers'

const ACCOUNT_PATH = "m/44'/60'/0'"

/**
 * Une seule lecture de l'entrée pour toutes les questions : deux lectures
 * successives se disputeraient les lignes quand l'entrée vient d'un tube.
 * Au terminal, ce qui est tapé ne s'affiche pas.
 */
const input = process.stdin
const rl = createInterface({ input, output: process.stdout, terminal: input.isTTY })
let hiding = false
if (input.isTTY) {
  const write = rl._writeToOutput.bind(rl)
  rl._writeToOutput = (text) => {
    if (!hiding) write(text)
  }
}

// Les lignes sont mises en file : une ligne arrivée avant sa question n'est pas perdue.
const lines = rl[Symbol.asyncIterator]()

async function askHidden(question) {
  hiding = false
  process.stdout.write(question)
  hiding = true
  const { value } = await lines.next()
  hiding = false
  if (input.isTTY) process.stdout.write('\n')
  return value ?? ''
}

/** Espaces multiples, majuscules, retours à la ligne : on ne garde que les mots. */
function normalise(phrase) {
  return phrase.trim().toLowerCase().split(/\s+/).join(' ')
}

async function main() {
  console.log('Phrase secrète de la trésorerie → xpub pour CRYPTO_DEPOSIT_XPUB')
  console.log('Coupez le réseau si possible. Rien de ce que vous tapez ne sera affiché ni enregistré.\n')

  let phrase = normalise(await askHidden('Phrase secrète (12 ou 24 mots, séparés par des espaces) : '))
  const words = phrase.split(' ').filter(Boolean)
  if (![12, 15, 18, 21, 24].includes(words.length)) {
    console.error(`\n✖ ${words.length} mot(s) reçu(s) : une phrase en compte 12, 15, 18, 21 ou 24.`)
    process.exit(1)
  }
  if (!Mnemonic.isValidMnemonic(phrase)) {
    // Mot mal orthographié, mot hors de la liste BIP-39, ou mots dans le désordre
    // (le dernier mot porte une somme de contrôle).
    console.error('\n✖ Phrase invalide : un mot est mal écrit, hors de la liste BIP-39, ou les mots ne sont pas dans le bon ordre.')
    process.exit(1)
  }

  // Le « 25e mot » facultatif de certains portefeuilles (Ledger, Trezor…). Vide le plus souvent.
  const password = await askHidden('Phrase de passe BIP-39 facultative (Entrée si vous n’en avez pas) : ')

  const mnemonic = Mnemonic.fromPhrase(phrase, password)
  const account = HDNodeWallet.fromMnemonic(mnemonic, ACCOUNT_PATH)
  const xpub = account.neuter().extendedKey
  phrase = '' // ne garde pas la phrase plus longtemps que nécessaire
  rl.close()

  // Les mêmes adresses que dérivera le serveur, pour vérifier avant de déployer.
  const external = HDNodeWallet.fromExtendedKey(xpub).deriveChild(0)
  const addresses = [0, 1, 2].map((n) => external.deriveChild(n).address)

  console.log('\n────────────────────────────────────────────────────────────')
  console.log('CRYPTO_DEPOSIT_XPUB=' + xpub)
  console.log('────────────────────────────────────────────────────────────\n')
  console.log('Vérification — premières adresses de dépôt que le serveur attribuera :')
  addresses.forEach((address, n) => console.log(`  n°${n}  ${ACCOUNT_PATH}/0/${n}  ${address}`))
  console.log(`
Contrôle : dans un portefeuille importé avec la même phrase (MetaMask, Rabby, Ledger…),
le compte 1 doit afficher l'adresse n°0 ci-dessus. Sinon, ne déployez pas cette xpub.

⚠ Ces adresses seront données aux utilisateurs dans cet ordre : le n°0 au premier.
  N'utilisez donc pas le « compte 1 » de ce portefeuille comme adresse principale
  de la trésorerie ; prenez un autre compte (ex. m/44'/60'/1'/0/0) ou un autre portefeuille.`)
}

main().catch((error) => {
  console.error('✖', error.message)
  process.exit(1)
})
