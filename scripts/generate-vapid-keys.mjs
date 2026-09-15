// One-time setup: prints a VAPID key pair and a random cron secret.
//
//   node scripts/generate-vapid-keys.mjs
//
// Public key  → VITE_VAPID_PUBLIC_KEY in .env  and  VAPID_PUBLIC_KEY Supabase secret
// Private key → VAPID_PRIVATE_KEY Supabase secret only (never in .env / the repo)
// Secret      → CRON_SECRET Supabase secret, push_cron_secret Vault secret,
//               PUSH_DISPATCH_SECRET in .env.local

const b64url = (bytes) => Buffer.from(bytes).toString('base64url')

const { publicKey, privateKey } = await crypto.subtle.generateKey(
  { name: 'ECDSA', namedCurve: 'P-256' },
  true,
  ['sign', 'verify']
)
const rawPublic = new Uint8Array(await crypto.subtle.exportKey('raw', publicKey))
const { d } = await crypto.subtle.exportKey('jwk', privateKey)
const secret = b64url(crypto.getRandomValues(new Uint8Array(32)))

console.log(`VAPID_PUBLIC_KEY=${b64url(rawPublic)}`)
console.log(`VAPID_PRIVATE_KEY=${d}`)
console.log(`CRON_SECRET=${secret}`)
