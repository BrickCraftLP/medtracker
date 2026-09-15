// Minimal Web Push sender on WebCrypto only — RFC 8030 (delivery),
// RFC 8291 (aes128gcm payload encryption) and RFC 8292 (VAPID).
// No Node polyfills, so it runs unchanged in Supabase Edge Functions (Deno)
// and works with Apple (web.push.apple.com), Google and Mozilla endpoints.

export interface PushTarget {
  endpoint: string
  p256dh: string 
  auth: string
}

export interface VapidKeys {
  publicKey: string  // base64url, uncompressed P-256 point (65 bytes)
  privateKey: string // base64url, P-256 private scalar (32 bytes)
  subject: string    // mailto: or https: — Apple rejects anything else
}

export interface PushOptions {
  ttl?: number
  urgency?: 'very-low' | 'low' | 'normal' | 'high'
}

const enc = new TextEncoder()

export function b64urlToBytes(s: string): Uint8Array {
  const pad = '='.repeat((4 - (s.length % 4)) % 4)
  const bin = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

export function bytesToB64url(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let offset = 0
  for (const p of parts) { out.set(p, offset); offset += p.length }
  return out
}

async function hmacSha256(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data))
}

// ── VAPID ──────────────────────────────────────────────────────────────────

let signingKey: Promise<CryptoKey> | null = null

function vapidSigningKey(keys: VapidKeys): Promise<CryptoKey> {
  if (!signingKey) {
    const pub = b64urlToBytes(keys.publicKey)
    signingKey = crypto.subtle.importKey(
      'jwk',
      { kty: 'EC', crv: 'P-256', x: bytesToB64url(pub.slice(1, 33)), y: bytesToB64url(pub.slice(33, 65)), d: keys.privateKey },
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['sign'],
    )
  }
  return signingKey
}

// JWTs are valid for 12h (Apple allows at most 24h); reuse one per push service.
const jwtCache = new Map<string, { jwt: string; exp: number }>()

export async function vapidJwt(audience: string, keys: VapidKeys): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const cached = jwtCache.get(audience)
  if (cached && cached.exp - now > 3600) return cached.jwt

  const exp = now + 12 * 3600
  const header = bytesToB64url(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const claims = bytesToB64url(enc.encode(JSON.stringify({ aud: audience, exp, sub: keys.subject })))
  const unsigned = `${header}.${claims}`
  // WebCrypto ECDSA already returns the raw r||s form that JWS ES256 expects.
  const signature = new Uint8Array(
    await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, await vapidSigningKey(keys), enc.encode(unsigned)),
  )
  const jwt = `${unsigned}.${bytesToB64url(signature)}`
  jwtCache.set(audience, { jwt, exp })
  return jwt
}

// ── Payload encryption (RFC 8291) ──────────────────────────────────────────

// `asKeyPair` and `salt` are only injected by tests (RFC 8291 Appendix A).
export async function encryptPayload(
  target: PushTarget,
  plaintext: Uint8Array,
  asKeyPair?: CryptoKeyPair,
  salt: Uint8Array = crypto.getRandomValues(new Uint8Array(16)),
): Promise<Uint8Array> {
  const uaPublic = b64urlToBytes(target.p256dh)
  const authSecret = b64urlToBytes(target.auth)

  const asKeys = asKeyPair ??
    (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']) as CryptoKeyPair)
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', asKeys.publicKey))
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, asKeys.privateKey, 256))

  // HKDF with single-block outputs, written out as HMACs.
  const prkKey = await hmacSha256(authSecret, ecdhSecret)
  const ikm = await hmacSha256(prkKey, concat(enc.encode('WebPush: info\x00'), uaPublic, asPublic, new Uint8Array([1])))
  const prk = await hmacSha256(salt, ikm)
  const cek = (await hmacSha256(prk, concat(enc.encode('Content-Encoding: aes128gcm\x00'), new Uint8Array([1])))).slice(0, 16)
  const nonce = (await hmacSha256(prk, concat(enc.encode('Content-Encoding: nonce\x00'), new Uint8Array([1])))).slice(0, 12)

  const aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt'])
  // Single record: plaintext followed by the 0x02 "last record" delimiter.
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, concat(plaintext, new Uint8Array([2]))),
  )

  // Header: salt(16) | record size(4, BE) | key id length(1) | key id (sender public key)
  const header = new Uint8Array(21 + asPublic.length)
  header.set(salt, 0)
  new DataView(header.buffer).setUint32(16, 4096)
  header[20] = asPublic.length
  header.set(asPublic, 21)
  return concat(header, ciphertext)
}

// ── Send ───────────────────────────────────────────────────────────────────

export async function sendPush(target: PushTarget, payload: string, keys: VapidKeys, opts: PushOptions = {}): Promise<Response> {
  const body = await encryptPayload(target, enc.encode(payload))
  const jwt = await vapidJwt(new URL(target.endpoint).origin, keys)
  return fetch(target.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Encoding': 'aes128gcm',
      TTL: String(opts.ttl ?? 3600),
      Urgency: opts.urgency ?? 'normal',
      Authorization: `vapid t=${jwt}, k=${keys.publicKey}`,
    },
    body,
  })
}
