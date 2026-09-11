import { lookup } from 'node:dns/promises'

/**
 * Blocks outbound requests to attacker-controlled destinations (webhook subscriptions, and any
 * future feature that fetches a user/business-supplied URL). Without this, anyone with an
 * account can register a webhook pointing at an internal service or a cloud metadata endpoint
 * (e.g. 169.254.169.254) and trigger it by making an ordinary transaction — the platform's own
 * network access becomes an SSRF proxy. See deliver_pending_webhooks.ts for the call site.
 *
 * Known limitation: this resolves DNS and checks the result at send time, then fetch() resolves
 * again to actually connect — a small window for DNS-rebinding (attacker's DNS returns a public
 * IP for our check, then swaps to a private one before the real connection). Closing that fully
 * requires pinning the checked IP for the actual TCP connect (a custom dispatcher/agent), which
 * is a larger change; this is a deliberate, documented gap, not an oversight.
 */
export class UnsafeWebhookUrlException extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UnsafeWebhookUrlException'
  }
}

// [network base, prefix length] — CIDR ranges a webhook must never be allowed to reach.
const BLOCKED_IPV4_RANGES: Array<[string, number]> = [
  ['0.0.0.0', 8], // "this" network
  ['10.0.0.0', 8], // RFC1918 private
  ['100.64.0.0', 10], // carrier-grade NAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local (includes 169.254.169.254 cloud metadata)
  ['172.16.0.0', 12], // RFC1918 private
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.0.2.0', 24], // TEST-NET-1
  ['192.168.0.0', 16], // RFC1918 private
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // TEST-NET-2
  ['203.0.113.0', 24], // TEST-NET-3
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved
  ['255.255.255.255', 32], // broadcast
]

function ipv4ToInt(ip: string): number {
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) {
    throw new Error(`Not a valid IPv4 address: ${ip}`)
  }
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0
}

function isBlockedIpv4(ip: string): boolean {
  const ipInt = ipv4ToInt(ip)
  return BLOCKED_IPV4_RANGES.some(([base, prefixLength]) => {
    const mask = prefixLength === 0 ? 0 : (~0 << (32 - prefixLength)) >>> 0
    return (ipInt & mask) === (ipv4ToInt(base) & mask)
  })
}

function isBlockedIpv6(ip: string): boolean {
  const normalized = ip.toLowerCase()

  // IPv4-mapped (::ffff:1.2.3.4) and NAT64 (64:ff9b::1.2.3.4) — unwrap and check the embedded
  // IPv4 address, since these let an IPv4 private address hide behind an IPv6 literal.
  const mapped = normalized.match(/^(?:::ffff:|64:ff9b::)(\d+\.\d+\.\d+\.\d+)$/)
  if (mapped) {
    return isBlockedIpv4(mapped[1])
  }

  if (normalized === '::' || normalized === '::1') return true // unspecified / loopback
  if (/^fe[89ab]/.test(normalized)) return true // fe80::/10 link-local
  if (/^f[cd]/.test(normalized)) return true // fc00::/7 unique local
  if (normalized.startsWith('ff')) return true // ff00::/8 multicast

  return false
}

/**
 * Resolves `hostname` and throws UnsafeWebhookUrlException if it (or any of its resolved
 * addresses) is a private/loopback/link-local/reserved address.
 */
async function assertPublicHostname(hostname: string): Promise<void> {
  let addresses: Array<{ address: string; family: number }>
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true })
  } catch {
    throw new UnsafeWebhookUrlException(`Could not resolve host: ${hostname}`)
  }

  if (addresses.length === 0) {
    throw new UnsafeWebhookUrlException(`Host did not resolve to any address: ${hostname}`)
  }

  for (const { address, family } of addresses) {
    const blocked = family === 4 ? isBlockedIpv4(address) : isBlockedIpv6(address)
    if (blocked) {
      throw new UnsafeWebhookUrlException(
        `Destination resolves to a non-public address (${address}) — blocked to prevent SSRF`
      )
    }
  }
}

/**
 * Validates a webhook (or any outbound-fetch) URL is safe to actually connect to: http(s) only,
 * and every address it resolves to is public/routable. Call this immediately before each send —
 * not only at subscription time — since DNS can change between when a URL was registered and
 * when a delivery actually fires.
 *
 * @throws UnsafeWebhookUrlException if the URL is malformed, non-http(s), or resolves to a
 *   blocked address.
 */
export async function assertSafeOutboundUrl(rawUrl: string): Promise<void> {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    throw new UnsafeWebhookUrlException(`Malformed URL: ${rawUrl}`)
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new UnsafeWebhookUrlException(`Unsupported URL scheme: ${url.protocol}`)
  }

  // WHATWG URL keeps the brackets on an IPv6 literal host (e.g. "[::1]") — dns.lookup() needs
  // the bare address.
  const hostname = url.hostname.replace(/^\[(.+)\]$/, '$1')
  await assertPublicHostname(hostname)
}
