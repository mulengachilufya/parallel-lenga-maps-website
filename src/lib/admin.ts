/**
 * Admin access control.
 *
 * ADMIN_EMAILS env var is a comma-separated list of emails that are allowed
 * to approve/reject manual payments and access /admin/*. Kept server-side
 * only — never expose via NEXT_PUBLIC_*.
 *
 * Example: ADMIN_EMAILS="lengamaps@gmail.com,cmulenga672@gmail.com"
 */
export function getAdminEmails(): string[] {
  const raw = process.env.ADMIN_EMAILS || ''
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false
  const admins = getAdminEmails()
  return admins.includes(email.toLowerCase())
}
