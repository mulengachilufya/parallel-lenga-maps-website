'use client'

/**
 * What the signed-in person may open in /admin, from /api/admin/me. The
 * admin layout loads it once; pages read it to hide what they can't use
 * (the API checks again, this is only so nobody sees dead buttons).
 */
import { createContext, useContext, useEffect, useState } from 'react'

export interface AdminAccess {
  loaded: boolean
  isAdmin: boolean
  isOwner: boolean
  /** Owners and ADMIN_EMAILS: everything, including deleting. */
  full: boolean
  areas: string[]
}

const EMPTY: AdminAccess = { loaded: false, isAdmin: false, isOwner: false, full: false, areas: [] }
const Ctx = createContext<AdminAccess>(EMPTY)

export function AdminAccessProvider({ children }: { children: React.ReactNode }) {
  const [access, setAccess] = useState<AdminAccess>(EMPTY)
  useEffect(() => {
    fetch('/api/admin/me').then((r) => r.json())
      .then((j) => setAccess({ loaded: true, isAdmin: !!j.isAdmin, isOwner: !!j.isOwner, full: !!j.full, areas: j.areas ?? [] }))
      .catch(() => setAccess({ ...EMPTY, loaded: true }))
  }, [])
  return <Ctx.Provider value={access}>{children}</Ctx.Provider>
}

export const useAdminAccess = () => useContext(Ctx)

/** Which area each admin page belongs to. null = anyone with admin access. */
export const PAGE_AREA: Record<string, string | null> = {
  '/admin': null,
  '/admin/sales': 'sales',
  '/admin/partners': 'partners',
  '/admin/payments': 'payments',
  '/admin/users': 'users',
  '/admin/downloads': 'downloads',
  '/admin/organizations': 'orgs',
  '/admin/quotes': 'sales',
}

export function canOpen(a: AdminAccess, href: string): boolean {
  if (href === '/ops' || href === '/admin/team') return href === '/ops' ? a.full : a.isOwner
  const area = PAGE_AREA[href]
  return area === undefined ? a.full : area === null ? a.isAdmin : a.areas.includes(area)
}
