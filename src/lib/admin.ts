/**
 * Admin access control.
 *
 * ADMIN_EMAILS env var is a comma-separated list of emails that are allowed
 * to approve/reject manual payments and access /admin/*. Kept server-side
 * only — never expose via NEXT_PUBLIC_*.
 *
 * Example: ADMIN_EMAILS="lengamaps@gmail.com,cmulenga672@gmail.com"
 */
/**
 * The owners. Always admins, whatever ADMIN_EMAILS says, so a mistyped or
 * deleted environment variable can never lock the founder out. Both
 * addresses also receive every alert and the daily health report.
 */
export const OWNER_EMAILS = ['cmulenga672@gmail.com', 'lengamaps@gmail.com'] as const

export function getAdminEmails(): string[] {
  const raw = process.env.ADMIN_EMAILS || ''
  const fromEnv = raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
  return [...new Set([...OWNER_EMAILS, ...fromEnv])]
}

export function isOwnerEmail(email: string | null | undefined): boolean {
  return !!email && (OWNER_EMAILS as readonly string[]).includes(email.toLowerCase())
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false
  const admins = getAdminEmails()
  return admins.includes(email.toLowerCase())
}
