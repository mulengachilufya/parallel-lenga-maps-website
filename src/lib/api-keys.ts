/**
 * API key generation, hashing, and validation.
 *
 * Format:
 *   lm_live_<32-base64url-chars>
 *
 *   `lm`     — Lenga Maps prefix (lets a leaked key be greppable on GitHub
 *              and keeps the format recognisable in support tickets)
 *   `live`   — environment marker (room to add `lm_test_…` later for sandboxes)
 *   32 chars of base64url ≈ 192 bits of entropy — way more than enough for
 *   a bearer token that expires only when the user revokes it.
 *
 * Storage:
 *   We hash the key with SHA-256 and store ONLY the hash. The raw key is
 *   shown to the user once at creation time. SHA-256 is fine here because
 *   the key already has 192 bits of entropy — no rainbow-table risk, and
 *   bcrypt would just slow down every API request for no security gain.
 */

import { randomBytes, createHash } from 'node:crypto'

const KEY_PREFIX  = 'lm_live_'
const RAW_BYTES   = 24                       // 24 bytes → 32 base64url chars

export interface GeneratedKey {
  /** Plaintext key — shown to user ONCE, never stored. */
  plaintext: string
  /** SHA-256 hash of plaintext, hex-encoded. Stored in the DB. */
  hash: string
  /** Last 4 chars of plaintext, for visual identification in the UI. */
  last4: string
}

/** Generate a fresh API key. Returns plaintext + storable hash. */
export function generateApiKey(): GeneratedKey {
  const random    = randomBytes(RAW_BYTES).toString('base64url')
  const plaintext = `${KEY_PREFIX}${random}`
  return {
    plaintext,
    hash:  hashKey(plaintext),
    last4: plaintext.slice(-4),
  }
}

/** SHA-256 hash of a key, hex-encoded. Use for both creation and lookup. */
export function hashKey(plaintext: string): string {
  return createHash('sha256').update(plaintext).digest('hex')
}

/**
 * Pull the raw key out of an Authorization header. Accepts both:
 *   `Authorization: Bearer lm_live_…`
 *   `Authorization: lm_live_…`
 * Returns null if the header is missing, malformed, or doesn't have our
 * prefix (cheap rejection before hitting the DB).
 */
export function extractKeyFromHeader(authHeader: string | null): string | null {
  if (!authHeader) return null
  const trimmed = authHeader.trim()
  const raw = trimmed.toLowerCase().startsWith('bearer ')
    ? trimmed.slice(7).trim()
    : trimmed
  if (!raw.startsWith(KEY_PREFIX)) return null
  return raw
}
