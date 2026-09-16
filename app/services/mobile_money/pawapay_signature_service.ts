import { createHash, createPublicKey, verify as cryptoVerify } from 'node:crypto'
import mobileMoneyConfig from '#config/mobile_money'

export class PawaPaySignatureException extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PawaPaySignatureException'
  }
}

interface VerifiableRequest {
  method: string
  /** host header value, e.g. "api.tumaplus.com" */
  authority: string
  /** path only, no query string, e.g. "/api/v1/webhooks/pawapay/deposits" */
  path: string
  headers: Record<string, string | undefined>
  /** exact raw bytes/string as received — must NOT be a re-serialization of parsed JSON */
  rawBody: string
}

interface CachedKey {
  keyId: string
  publicKeyPem: string
  fetchedAt: number
}

/**
 * Verifies PawaPay's callback signatures — HTTP Message Signatures (RFC 9421), algorithm
 * `ecdsa-p256-sha256`, per https://docs.pawapay.io/v2/docs/signatures. This is the ONLY thing
 * standing between "a real PawaPay callback" and "anyone on the internet POSTing a fake
 * COMPLETED status to credit a wallet for free" — treat every change here as security-critical.
 *
 * NOTE: the exact header names/parameter casing below are transcribed from PawaPay's docs
 * without a real captured callback to validate against byte-for-byte. Before relying on this
 * in production, log the raw Signature-Input/Signature/Content-Digest headers from the first
 * few sandbox callbacks and confirm parseSignatureInput()/buildSignatureBase() match exactly —
 * adjust the derived-component and header-name handling here if PawaPay's real payloads differ.
 */
export class PawaPaySignatureService {
  private static keyCache: Map<string, CachedKey> = new Map()
  private static readonly KEY_CACHE_TTL_MS = 60 * 60 * 1000 // 1h

  /**
   * @throws PawaPaySignatureException if the signature is missing, malformed, or invalid.
   * Never throws for "business" reasons — a caught exception here always means "reject".
   */
  static async verify(req: VerifiableRequest): Promise<void> {
    const signatureInputHeader = req.headers['signature-input']
    const signatureHeader = req.headers['signature']
    const contentDigestHeader = req.headers['content-digest']

    if (!signatureInputHeader || !signatureHeader) {
      throw new PawaPaySignatureException('Missing Signature/Signature-Input headers')
    }

    if (contentDigestHeader) {
      this.assertContentDigestMatches(req.rawBody, contentDigestHeader)
    }

    const { label, coveredComponents, params, signatureParamsLine } =
      this.parseSignatureInput(signatureInputHeader)

    const keyId = params.keyid
    if (!keyId) {
      throw new PawaPaySignatureException('Signature-Input missing keyid parameter')
    }

    const signatureBytes = this.parseSignatureHeader(signatureHeader, label)
    const signatureBase = this.buildSignatureBase(req, coveredComponents, signatureParamsLine)

    const publicKeyPem = await this.getPublicKey(keyId)

    const isValid = cryptoVerify(
      null,
      Buffer.from(signatureBase, 'utf8'),
      { key: createPublicKey(publicKeyPem), dsaEncoding: 'ieee-p1363' },
      signatureBytes
    )

    if (!isValid) {
      throw new PawaPaySignatureException('Signature verification failed')
    }
  }

  private static assertContentDigestMatches(rawBody: string, contentDigestHeader: string): void {
    const match = contentDigestHeader.match(/sha-256=:([^:]+):/)
    if (!match) {
      throw new PawaPaySignatureException('Unsupported Content-Digest format')
    }
    const expected = createHash('sha256').update(rawBody, 'utf8').digest('base64')
    if (match[1] !== expected) {
      throw new PawaPaySignatureException('Content-Digest does not match request body')
    }
  }

  /**
   * Parses a Signature-Input header value like:
   *   sig1=("@method" "@authority" "@path" "content-digest" "content-type" "signature-date");created=1700000000;keyid="abc";alg="ecdsa-p256-sha256"
   */
  private static parseSignatureInput(header: string): {
    label: string
    coveredComponents: string[]
    params: Record<string, string>
    signatureParamsLine: string
  } {
    const topLevel = header.match(/^([a-zA-Z0-9_-]+)=(\(.*\))(;.*)?$/)
    if (!topLevel) {
      throw new PawaPaySignatureException('Malformed Signature-Input header')
    }

    const [, label, componentList, paramsRaw = ''] = topLevel

    const coveredComponents = [...componentList.matchAll(/"([^"]+)"/g)].map((m) => m[1])

    const params: Record<string, string> = {}
    for (const paramMatch of paramsRaw.matchAll(/;([a-zA-Z0-9_-]+)=("([^"]*)"|[0-9]+)/g)) {
      const [, key, rawValue, quotedValue] = paramMatch
      params[key] = quotedValue !== undefined ? quotedValue : rawValue
    }

    return {
      label,
      coveredComponents,
      params,
      signatureParamsLine: `${componentList}${paramsRaw}`,
    }
  }

  /** Parses a Signature header value like: sig1=:base64signature: */
  private static parseSignatureHeader(header: string, expectedLabel: string): Buffer {
    const match = header.match(new RegExp(`${expectedLabel}=:([^:]+):`))
    if (!match) {
      throw new PawaPaySignatureException('Malformed Signature header')
    }
    return Buffer.from(match[1], 'base64')
  }

  private static buildSignatureBase(
    req: VerifiableRequest,
    coveredComponents: string[],
    signatureParamsLine: string
  ): string {
    const lines = coveredComponents.map((component) => {
      const value = this.resolveComponent(req, component)
      return `"${component}": ${value}`
    })
    lines.push(`"@signature-params": ${signatureParamsLine}`)
    return lines.join('\n')
  }

  private static resolveComponent(req: VerifiableRequest, component: string): string {
    switch (component) {
      case '@method':
        return req.method.toUpperCase()
      case '@authority':
        return req.authority
      case '@path':
        return req.path
      default: {
        const value = req.headers[component.toLowerCase()]
        if (value === undefined) {
          throw new PawaPaySignatureException(
            `Signed component "${component}" missing from request`
          )
        }
        return value.trim()
      }
    }
  }

  /**
   * Fetches (and caches) PawaPay's public key for the given keyId, from their Public Keys
   * endpoint. Re-fetches on a cache miss so key rotation doesn't require a deploy.
   */
  private static async getPublicKey(keyId: string): Promise<string> {
    const cached = this.keyCache.get(keyId)
    if (cached && Date.now() - cached.fetchedAt < this.KEY_CACHE_TTL_MS) {
      return cached.publicKeyPem
    }

    const response = await fetch(`${mobileMoneyConfig.pawapay.baseUrl}/v2/public-keys`, {
      signal: AbortSignal.timeout(mobileMoneyConfig.pawapay.requestTimeoutMs),
    })

    if (!response.ok) {
      throw new PawaPaySignatureException(
        `Failed to fetch PawaPay public keys (${response.status})`
      )
    }

    const body = (await response.json()) as Array<{ keyId: string; publicKey: string }>
    const found = body.find((k) => k.keyId === keyId)

    if (!found) {
      throw new PawaPaySignatureException(`Unknown PawaPay keyid: ${keyId}`)
    }

    this.keyCache.set(keyId, {
      keyId,
      publicKeyPem: found.publicKey,
      fetchedAt: Date.now(),
    })

    return found.publicKey
  }
}
