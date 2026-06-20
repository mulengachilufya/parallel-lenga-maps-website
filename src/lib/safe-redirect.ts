// src/lib/safe-redirect.ts
//
// Open-redirect guard for the `next` query param used by the auth flow
// (middleware sets ?next=<path>; /login and /auth/callback consume it).
//
// Only a SAME-ORIGIN absolute path is allowed. Anything that could escape to
// another origin falls back to a safe default. Blocked:
//   https://evil.com      absolute URL (no leading slash)
//   //evil.com            protocol-relative (browser fills in our scheme)
//   /\evil.com  /\/...     backslash - browsers normalise \ to / so /\ == //
//   embedded tab/newline   control chars some browsers strip before parsing
//
// Used by both the client (/login router.push) and the server
// (/auth/callback NextResponse.redirect) so the rule lives in one place.

// True if the string contains any C0 control char (0x00-0x1F) or DEL (0x7F).
// A tab/newline embedded in the value can be stripped by the browser before
// URL parsing, turning an otherwise-rejected string protocol-relative.
// (Implemented with char codes, not a regex, to keep the source ASCII-clean.)
function hasControlChars(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    if (c <= 0x1f || c === 0x7f) return true
  }
  return false
}

/**
 * Returns `raw` only if it is a safe same-origin path; otherwise `fallback`.
 * `fallback` itself must be a trusted literal (never user input).
 */
export function safeNextPath(
  raw: string | null | undefined,
  fallback = '/dashboard',
): string {
  if (!raw || typeof raw !== 'string') return fallback
  if (raw[0] !== '/')         return fallback   // absolute URL or scheme-relative
  if (raw[1] === '/')         return fallback   // //evil.com
  if (raw[1] === '\\')        return fallback   // /\evil.com  -> //evil.com
  if (raw.includes('\\'))     return fallback   // any other backslash trick
  if (hasControlChars(raw))   return fallback
  return raw
}
