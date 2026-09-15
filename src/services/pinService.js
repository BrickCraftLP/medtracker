
export function generateSalt() {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
  return { bytes, hex }
}

// hash-wasm is only needed when a PIN is actually set or entered, so it is
// pulled in on demand instead of sitting in the initial bundle.
export async function hashPin(pin, saltBytes) {
  const { argon2id } = await import('hash-wasm')
  return argon2id({
    password: pin,
    salt: saltBytes,
    parallelism: 1,
    iterations: 3,
    memorySize: 8192,
    hashLength: 32,
    outputType: 'hex',
  })
}

export async function verifyPin(pin, hashHex, saltHex) {
  const saltBytes = new Uint8Array(saltHex.match(/.{2}/g).map(b => parseInt(b, 16)))
  const computed = await hashPin(pin, saltBytes)
  return computed === hashHex
}
