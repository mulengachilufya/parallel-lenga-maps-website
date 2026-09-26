'use client'

// Keeps an unlocked (non-extractable) private key in IndexedDB so the
// passphrase is typed once per device, not on every visit. "Lock this
// device" deletes it.

const DB = 'lenga-e2e', STORE = 'keys'

function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1)
    r.onupgradeneeded = () => r.result.createObjectStore(STORE)
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  })
}

export async function saveDeviceKey(userId: string, keyId: string, key: CryptoKey): Promise<void> {
  const d = await db()
  await new Promise<void>((res, rej) => {
    const tx = d.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put({ keyId, key }, userId)
    tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error)
  })
}

export async function loadDeviceKey(userId: string): Promise<{ keyId: string; key: CryptoKey } | null> {
  try {
    const d = await db()
    return await new Promise((res) => {
      const r = d.transaction(STORE).objectStore(STORE).get(userId)
      r.onsuccess = () => res((r.result as { keyId: string; key: CryptoKey } | undefined) ?? null)
      r.onerror = () => res(null)
    })
  } catch { return null }
}

export async function forgetDeviceKey(userId: string): Promise<void> {
  try {
    const d = await db()
    await new Promise<void>((res) => {
      const tx = d.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).delete(userId)
      tx.oncomplete = () => res(); tx.onerror = () => res()
    })
  } catch { /* nothing stored */ }
}
