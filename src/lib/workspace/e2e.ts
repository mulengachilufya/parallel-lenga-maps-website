// src/lib/workspace/e2e.ts
//
// End-to-end encryption for teammate direct messages. Runs in the browser
// (and in Node for tests) on the Web Crypto API only; no dependencies.
//
//   Identity   each person has one ECDH P-256 key pair per "key version".
//              The public key is stored on the server in the clear. The
//              private key never leaves the browser unencrypted: it is
//              wrapped with AES-256-GCM under a key derived from the
//              person's messages passphrase (PBKDF2-SHA-256, 600k rounds),
//              and only that wrapped blob is stored, so it can follow them
//              to a new device. Lenga never sees the passphrase.
//   Messages   both people derive the same conversation key: ECDH between
//              one's private key and the other's public key, then HKDF
//              bound to both key ids. Each message is AES-256-GCM with a
//              fresh 96-bit IV. Either participant can read it; nobody
//              else, including the server, can.
//   Trust      a "security code" (SHA-256 over both public keys) lets two
//              people check, in person or on a call, that the server
//              didn't swap a key.
//
// Not provided: forward secrecy (a stolen private key plus passphrase reads
// past messages). That is the accepted trade-off for multi-device access
// without a phone-number identity.

export interface PublicKeyRecord { key_id: string; public_jwk: JsonWebKey }
export interface WrappedKey { key_id: string; public_jwk: JsonWebKey; wrapped_private: string; salt: string; iv: string; iterations: number }
export interface Sealed { ciphertext: string; iv: string }

const subtle = globalThis.crypto.subtle
const enc = new TextEncoder()
const dec = new TextDecoder()
export const PBKDF2_ITERATIONS = 600_000
const EC = { name: 'ECDH', namedCurve: 'P-256' } as const

export function b64(bytes: ArrayBuffer | Uint8Array): string {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let s = ''
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000))
  return btoa(s)
}
export function unb64(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s)
  const u = new Uint8Array(new ArrayBuffer(bin.length))
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i)
  return u
}
function random(n: number): Uint8Array<ArrayBuffer> {
  return globalThis.crypto.getRandomValues(new Uint8Array(new ArrayBuffer(n)))
}

async function passphraseKey(passphrase: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<CryptoKey> {
  const base = await subtle.importKey('raw', enc.encode(passphrase.normalize('NFKC')), 'PBKDF2', false, ['deriveKey'])
  return subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base,
    { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}

/** A brand-new identity, wrapped with the passphrase. key_id is chosen by the caller (a UUID). */
export async function createIdentity(keyId: string, passphrase: string): Promise<{ wrapped: WrappedKey; privateKey: CryptoKey }> {
  const pair = await subtle.generateKey(EC, true, ['deriveBits']) as CryptoKeyPair
  const wrapped = await wrapPrivateKey(keyId, pair, passphrase)
  const privateKey = await importPrivate(await subtle.exportKey('pkcs8', pair.privateKey))
  return { wrapped, privateKey }
}

async function wrapPrivateKey(keyId: string, pair: CryptoKeyPair, passphrase: string): Promise<WrappedKey> {
  const salt = random(16), iv = random(12)
  const kek = await passphraseKey(passphrase, salt, PBKDF2_ITERATIONS)
  const pkcs8 = await subtle.exportKey('pkcs8', pair.privateKey)
  const wrappedPrivate = await subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(`lenga-dm-key:${keyId}`) }, kek, pkcs8)
  const public_jwk = await subtle.exportKey('jwk', pair.publicKey)
  return {
    key_id: keyId, public_jwk: { kty: public_jwk.kty, crv: public_jwk.crv, x: public_jwk.x, y: public_jwk.y },
    wrapped_private: b64(wrappedPrivate), salt: b64(salt), iv: b64(iv), iterations: PBKDF2_ITERATIONS,
  }
}

/** Non-extractable once imported: script on the page can use it but not read it out. */
async function importPrivate(pkcs8: ArrayBuffer): Promise<CryptoKey> {
  return subtle.importKey('pkcs8', pkcs8, EC, false, ['deriveBits'])
}

/** Unlock a stored identity. Throws 'wrong_passphrase' if the passphrase is wrong. */
export async function unlockIdentity(w: WrappedKey, passphrase: string): Promise<CryptoKey> {
  const kek = await passphraseKey(passphrase, unb64(w.salt), w.iterations)
  let pkcs8: ArrayBuffer
  try {
    pkcs8 = await subtle.decrypt({ name: 'AES-GCM', iv: unb64(w.iv), additionalData: enc.encode(`lenga-dm-key:${w.key_id}`) },
      kek, unb64(w.wrapped_private))
  } catch { throw new Error('wrong_passphrase') }
  return importPrivate(pkcs8)
}

/** Re-wrap the same private key under a new passphrase (needs the old one). */
export async function changePassphrase(w: WrappedKey, oldPass: string, newPass: string): Promise<WrappedKey> {
  const kek = await passphraseKey(oldPass, unb64(w.salt), w.iterations)
  let pkcs8: ArrayBuffer
  try {
    pkcs8 = await subtle.decrypt({ name: 'AES-GCM', iv: unb64(w.iv), additionalData: enc.encode(`lenga-dm-key:${w.key_id}`) },
      kek, unb64(w.wrapped_private))
  } catch { throw new Error('wrong_passphrase') }
  const privateKey = await subtle.importKey('pkcs8', pkcs8, EC, true, ['deriveBits'])
  const publicKey = await subtle.importKey('jwk', { ...w.public_jwk, ext: true }, EC, true, [])
  return wrapPrivateKey(w.key_id, { privateKey, publicKey }, newPass)
}

/** The conversation key for (my key, their key). Both sides get the same one. */
export async function conversationKey(myPrivate: CryptoKey, myKeyId: string, theirs: PublicKeyRecord): Promise<CryptoKey> {
  const theirPub = await subtle.importKey('jwk', theirs.public_jwk, EC, false, [])
  const shared = await subtle.deriveBits({ name: 'ECDH', public: theirPub }, myPrivate, 256)
  const hk = await subtle.importKey('raw', shared, 'HKDF', false, ['deriveKey'])
  const ids = [myKeyId, theirs.key_id].sort().join(':')
  return subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: enc.encode('lenga-dm-v1'), info: enc.encode(ids) },
    hk, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}

/** The message's own metadata is bound in, so a ciphertext can't be replayed into another conversation. */
function aad(senderKeyId: string, recipientKeyId: string) {
  return enc.encode(`lenga-dm-msg:${senderKeyId}>${recipientKeyId}`)
}

export async function seal(key: CryptoKey, text: string, senderKeyId: string, recipientKeyId: string): Promise<Sealed> {
  const iv = random(12)
  const ct = await subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad(senderKeyId, recipientKeyId) }, key, enc.encode(text))
  return { ciphertext: b64(ct), iv: b64(iv) }
}

export async function open(key: CryptoKey, s: Sealed, senderKeyId: string, recipientKeyId: string): Promise<string> {
  const pt = await subtle.decrypt({ name: 'AES-GCM', iv: unb64(s.iv), additionalData: aad(senderKeyId, recipientKeyId) },
    key, unb64(s.ciphertext))
  return dec.decode(pt)
}

/** 60-digit code, shown as 12 groups of 5, the same on both screens. */
export async function securityCode(a: PublicKeyRecord, b: PublicKeyRecord): Promise<string> {
  const parts = [a, b].map((k) => `${k.key_id}:${k.public_jwk.x}:${k.public_jwk.y}`).sort()
  const h = new Uint8Array(await subtle.digest('SHA-256', enc.encode(parts.join('|'))))
  const groups: string[] = []
  for (let i = 0; i < 12; i++) {
    const n = ((h[i * 2] << 16) | (h[i * 2 + 1] << 8) | h[(i * 2 + 24) % 32]) % 100000
    groups.push(String(n).padStart(5, '0'))
  }
  return groups.join(' ')
}
