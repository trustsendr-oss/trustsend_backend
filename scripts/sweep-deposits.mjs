#!/usr/bin/env node
/**
 * Rapatrie les stablecoins reçus sur les adresses de dépôt vers la trésorerie.
 *
 *   node scripts/sweep-deposits.mjs             # réseaux principaux (production)
 *   node scripts/sweep-deposits.mjs --testnet   # réseaux de test (sandbox)
 *
 * Pourquoi un outil hors serveur : vider une adresse de dépôt demande sa clé privée, donc la
 * phrase secrète des dépôts. Le serveur n'a que la xpub (il reçoit, il ne dépense jamais) ; un
 * piratage du serveur ne peut donc pas toucher aux dépôts. Ce script, lui, tourne sur une
 * machine de confiance, avec la phrase tapée à la main, et n'écrit rien sur le disque.
 *
 * Déroulé :
 *  1. la phrase (masquée) → les adresses de dépôt n°0 à n°N-1, comme le serveur les dérive ;
 *  2. lecture des soldes sur chaque réseau → un plan : quoi rapatrier, combien de frais avancer ;
 *  3. rien ne part sans « OUI » tapé en toutes lettres ;
 *  4. pour chaque adresse : le payeur de frais lui avance juste de quoi payer un transfert (POL,
 *     BNB, ETH…), puis l'adresse envoie tous ses jetons à la trésorerie. Chaque étape attend sa
 *     confirmation avant la suivante, et chaque hash est affiché.
 *
 * Relancer le script est sans danger : une adresse déjà vidée n'a plus rien à rapatrier.
 * Les soldes clients ne bougent pas : ils ont été crédités au dépôt ; ceci déplace seulement
 * l'argent de la plateforme d'une de ses adresses à une autre.
 */
import { createInterface } from 'node:readline'
import { Contract, HDNodeWallet, JsonRpcProvider, Mnemonic, Wallet, formatUnits, getAddress } from 'ethers'

const ACCOUNT_PATH = "m/44'/60'/0'"

const MAINNETS = {
  ethereum: { chainId: 1, host: 'eth-mainnet.g.alchemy.com', gas: 'ETH', tokens: {
    USDT: ['0xdac17f958d2ee523a2206206994597c13d831ec7', 6], USDC: ['0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', 6] } },
  polygon: { chainId: 137, host: 'polygon-mainnet.g.alchemy.com', gas: 'POL', tokens: {
    USDT: ['0xc2132d05d31c914a87c6611c10748aeb04b58e8f', 6], USDC: ['0x3c499c542cef5e3811e1192ce70d8cc03d5c3359', 6] } },
  arbitrum: { chainId: 42161, host: 'arb-mainnet.g.alchemy.com', gas: 'ETH', tokens: {
    USDT: ['0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9', 6], USDC: ['0xaf88d065e77c8cc2239327c5edb3a432268e5831', 6] } },
  optimism: { chainId: 10, host: 'opt-mainnet.g.alchemy.com', gas: 'ETH', tokens: {
    USDT: ['0x94b008aa00579c1307b0ef2c499ad98a8ce58e58', 6], USDC: ['0x0b2c639c533813f4aa9d7837caf62653d097ff85', 6] } },
  base: { chainId: 8453, host: 'base-mainnet.g.alchemy.com', gas: 'ETH', tokens: {
    USDC: ['0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', 6] } },
  bsc: { chainId: 56, host: 'bnb-mainnet.g.alchemy.com', gas: 'BNB', tokens: {
    USDT: ['0x55d398326f99059ff775485246999027b3197955', 18], USDC: ['0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d', 18] } },
}
const TESTNETS = {
  bsc: { chainId: 97, host: 'bnb-testnet.g.alchemy.com', gas: 'tBNB', tokens: {
    USDT: ['0x337610d27c682e347c9cd60bd4b3b107c9d34ddd', 18] } },
  polygon: { chainId: 80002, host: 'polygon-amoy.g.alchemy.com', gas: 'POL', tokens: {
    USDC: ['0x41e94eb019c0762f9bfcf9fb1e58725bfb0e7582', 6] } },
}

const ERC20 = [
  'function balanceOf(address) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
]

/** Une seule lecture de l'entrée pour toutes les questions ; au terminal, les secrets ne s'affichent pas. */
const input = process.stdin
const rl = createInterface({ input, output: process.stdout, terminal: input.isTTY })
let hiding = false
if (input.isTTY) {
  const write = rl._writeToOutput.bind(rl)
  rl._writeToOutput = (text) => {
    if (!hiding) write(text)
  }
}
const lines = rl[Symbol.asyncIterator]()

async function ask(question, { hidden = false } = {}) {
  hiding = false
  process.stdout.write(question)
  hiding = hidden
  const { value } = await lines.next()
  hiding = false
  if (hidden && input.isTTY) process.stdout.write('\n')
  return (value ?? '').trim()
}

function fail(message) {
  console.error(`\n✖ ${message}`)
  process.exit(1)
}

const money = (raw, decimals) => Number(formatUnits(raw, decimals)).toFixed(2)
const coin = (wei) => Number(formatUnits(wei, 18)).toFixed(6)

async function main() {
  const testnet = process.argv.includes('--testnet')
  const networks = testnet ? TESTNETS : MAINNETS
  console.log(`Rapatriement des dépôts → trésorerie (${testnet ? 'réseaux de TEST' : 'réseaux PRINCIPAUX, argent réel'})`)
  console.log('Rien de ce que vous tapez de secret ne sera affiché ni enregistré.\n')

  const phrase = (await ask('Phrase secrète des dépôts (12 ou 24 mots) : ', { hidden: true }))
    .toLowerCase()
    .split(/\s+/)
    .join(' ')
  if (!Mnemonic.isValidMnemonic(phrase)) fail('phrase invalide (mot mal écrit, ou mots dans le désordre).')
  const password = await ask('Phrase de passe BIP-39 facultative (Entrée si aucune) : ', { hidden: true })
  const external = HDNodeWallet.fromMnemonic(Mnemonic.fromPhrase(phrase, password), ACCOUNT_PATH).deriveChild(0)
  console.log(`\nAdresse de dépôt n°0 : ${external.deriveChild(0).address}`)
  console.log('  → elle doit être celle que le serveur a attribuée au premier client. Sinon, arrêtez (Ctrl+C).\n')

  const apiKey = process.env.ALCHEMY_API_KEY || (await ask('Clé API Alchemy : ', { hidden: true }))
  if (!apiKey) fail('clé Alchemy manquante.')

  let treasury
  try {
    treasury = getAddress(
      (await ask(`Adresse de la trésorerie${process.env.CRYPTO_TREASURY_ADDRESS ? ` [${process.env.CRYPTO_TREASURY_ADDRESS}]` : ''} : `)) ||
        process.env.CRYPTO_TREASURY_ADDRESS ||
        ''
    )
  } catch {
    fail('adresse de trésorerie invalide (vérifiez majuscules et minuscules, ou collez-la en minuscules).')
  }

  const count = Number((await ask('Nombre d’adresses de dépôt à examiner [500] : ')) || 500)
  if (!Number.isInteger(count) || count < 1 || count > 100000) fail('nombre invalide.')
  const minimum = Number((await ask('Ignorer les soldes inférieurs à (en dollars) [10] : ')) || 10)

  // ── 1. Lecture des soldes ────────────────────────────────────────────────────────────────
  console.log('\nLecture des soldes…')
  const providers = {}
  const plan = []
  for (const [name, net] of Object.entries(networks)) {
    const provider = new JsonRpcProvider(`https://${net.host}/v2/${apiKey}`, net.chainId, { staticNetwork: true })
    providers[name] = provider
    for (const [symbol, [address, decimals]] of Object.entries(net.tokens)) {
      const token = new Contract(address, ERC20, provider)
      for (let start = 0; start < count; start += 50) {
        const indexes = Array.from({ length: Math.min(50, count - start) }, (_, k) => start + k)
        const balances = await Promise.all(
          indexes.map((n) => token.balanceOf(external.deriveChild(n).address).catch(() => 0n))
        )
        balances.forEach((balance, k) => {
          if (balance > 0n && Number(formatUnits(balance, decimals)) >= minimum) {
            plan.push({ network: name, symbol, contract: address, decimals, index: indexes[k], balance })
          }
        })
      }
    }
    process.stdout.write(`  ${name} ✓\n`)
  }

  if (plan.length === 0) {
    console.log(`\nRien à rapatrier au-dessus de ${minimum} $. Fin.`)
    rl.close()
    return
  }

  // ── 2. Coût des frais par transfert, et le plan ──────────────────────────────────────────
  for (const item of plan) {
    const provider = providers[item.network]
    const from = external.deriveChild(item.index).address
    const token = new Contract(item.contract, ERC20, provider)
    const gasLimit = ((await token.transfer.estimateGas(treasury, item.balance, { from })) * 13n) / 10n
    const fees = await provider.getFeeData()
    const price = fees.maxFeePerGas ?? fees.gasPrice
    const held = await provider.getBalance(from)
    item.from = from
    item.gasLimit = gasLimit
    item.topUp = gasLimit * price > held ? gasLimit * price - held : 0n
  }

  console.log(`\nÀ rapatrier vers ${treasury} :\n`)
  const totals = {}
  for (const item of plan) {
    const net = networks[item.network]
    console.log(
      `  ${item.network.padEnd(9)} n°${String(item.index).padEnd(5)} ${item.from}  ${money(item.balance, item.decimals).padStart(12)} ${item.symbol}` +
        (item.topUp > 0n ? `   frais avancés : ${coin(item.topUp)} ${net.gas}` : '')
    )
    const key = `${item.symbol} sur ${item.network}`
    totals[key] = (totals[key] ?? 0) + Number(formatUnits(item.balance, item.decimals))
  }
  console.log('\nTotal :')
  for (const [key, total] of Object.entries(totals)) console.log(`  ${total.toFixed(2)} ${key}`)

  const needsGas = plan.some((item) => item.topUp > 0n)
  let payer = null
  if (needsGas) {
    const gasNeeded = {}
    for (const item of plan) gasNeeded[item.network] = (gasNeeded[item.network] ?? 0n) + item.topUp
    console.log('\nFrais à avancer, par réseau :')
    for (const [name, wei] of Object.entries(gasNeeded)) if (wei > 0n) console.log(`  ${coin(wei)} ${networks[name].gas} sur ${name}`)

    const key = await ask('\nClé privée du portefeuille qui avance les frais (trésorerie ou portefeuille chaud) : ', { hidden: true })
    try {
      payer = new Wallet(key.startsWith('0x') ? key : `0x${key}`)
    } catch {
      fail('clé privée invalide.')
    }
    console.log(`Payeur des frais : ${payer.address}`)
    for (const [name, wei] of Object.entries(gasNeeded)) {
      if (wei === 0n) continue
      const held = await providers[name].getBalance(payer.address)
      if (held < wei) fail(`le payeur n'a que ${coin(held)} ${networks[name].gas} sur ${name}, il en faut ${coin(wei)}.`)
    }
  }

  const answer = await ask('\nTapez OUI pour envoyer, autre chose pour annuler : ')
  if (answer !== 'OUI') {
    console.log('Annulé, rien n’a été envoyé.')
    rl.close()
    return
  }

  // ── 3. Envoi, une adresse à la fois ──────────────────────────────────────────────────────
  let done = 0
  for (const item of plan) {
    const provider = providers[item.network]
    const label = `${item.network} n°${item.index}`
    try {
      if (item.topUp > 0n) {
        const funding = await payer.connect(provider).sendTransaction({ to: item.from, value: item.topUp })
        console.log(`  ${label} · frais avancés  ${funding.hash}`)
        await funding.wait(1)
      }
      const signer = external.deriveChild(item.index).connect(provider)
      const token = new Contract(item.contract, ERC20, signer)
      // Relu juste avant l'envoi : le solde a pu bouger depuis le plan.
      const balance = await token.balanceOf(item.from)
      if (balance === 0n) {
        console.log(`  ${label} · déjà vide, rien à faire`)
        continue
      }
      const transfer = await token.transfer(treasury, balance, { gasLimit: item.gasLimit })
      console.log(`  ${label} · ${money(balance, item.decimals)} ${item.symbol} → trésorerie  ${transfer.hash}`)
      await transfer.wait(1)
      done++
    } catch (error) {
      // Une adresse en échec n'arrête pas les autres ; relancer le script la reprendra.
      console.log(`  ${label} · ✖ ${error.shortMessage ?? error.message}`)
    }
  }
  console.log(`\n${done}/${plan.length} adresse(s) rapatriée(s). Relancez le script pour reprendre celles en échec.`)
  rl.close()
}

main().catch((error) => {
  console.error('✖', error.shortMessage ?? error.message)
  process.exit(1)
})
