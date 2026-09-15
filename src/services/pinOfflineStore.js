// IndexedDB store for PIN offline fallback.
// Only used when the user has no internet connection.
// Source of truth is always Supabase — IDB is a cache that mirrors it.

const DB_NAME = 'medtracker_pin'
const STORE   = 'pin_data'
const VERSION = 1

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION)
    req.onupgradeneeded = e => {
      const db = e.target.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'device_id' })
      }
    }
    req.onsuccess = e => resolve(e.target.result)
    req.onerror   = () => reject(req.error)
  })
}

// Returns the stored PIN record for this device, or null if none exists.
export async function idbGetPin(deviceId) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE).objectStore(STORE).get(deviceId)
    req.onsuccess = () => resolve(req.result ?? null)
    req.onerror   = () => reject(req.error)
  })
}

// Writes (upserts) a PIN record — called after every Supabase sync and after
// each offline attempt to keep counters current in IDB.
export async function idbSavePin(deviceId, data) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readwrite').objectStore(STORE).put({
      device_id:     deviceId,
      pin_hash:      data.pin_hash,
      pin_salt:      data.pin_salt,
      pin_length:    data.pin_length,
      pin_type:      data.pin_type,
      failed_consec: data.failed_consec ?? 0,
      failed_total:  data.failed_total  ?? 0,
      locked_until:  data.locked_until  ?? null,
      batch_count:   data.batch_count   ?? 0,
    })
    req.onsuccess = () => resolve()
    req.onerror   = () => reject(req.error)
  })
}

// Removes the PIN record — called when PIN is disabled or account deleted.
export async function idbDeletePin(deviceId) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readwrite').objectStore(STORE).delete(deviceId)
    req.onsuccess = () => resolve()
    req.onerror   = () => reject(req.error)
  })
}
