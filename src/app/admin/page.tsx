// src/app/admin/page.tsx
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { canOpen, useAdminAccess } from '@/components/admin/AdminAccess'

export default function AdminPage() {
  const [loading, setLoading] = useState(true)
  const [signedIn, setSignedIn] = useState(true)
  const access = useAdminAccess()

  useEffect(() => {
    const check = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      // Middleware (src/middleware.ts) gates /admin: an actually-anonymous
      // user never reaches this code. A transient client-side null here is
      // a cookie race — render a sign-in prompt; do NOT redirect to /login
      // (that would race with the login page's auto-redirect-when-signed-in
      // and cause the /login ⇄ /admin loop, same shape as the dashboard
      // bug reported 2026-06-18).
      setSignedIn(Boolean(session))
      setLoading(false)
    }
    check()
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 size={32} className="animate-spin text-primary" />
      </div>
    )
  }

  if (!signedIn) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="text-center max-w-md">
          <h1 className="text-xl font-bold text-navy mb-3">Your session went stale.</h1>
          <p className="text-sm text-gray-500 mb-6">
            Sign in again to open the admin tools.
          </p>
          <Link href="/login?next=%2Fadmin" className="inline-block bg-navy text-white text-sm font-semibold px-5 py-2.5 rounded-lg">
            Sign in
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-12">
        <h1 className="text-2xl font-bold text-navy mb-2">Admin</h1>
        <p className="text-gray-500 text-sm mb-10">Lenga Maps internal tools.</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">

          {canOpen(access, '/admin/payments') && (<Link
            href="/admin/payments"
            className="group block bg-white border border-gray-100 rounded-2xl p-6 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-200"
          >
            <div className="w-11 h-11 rounded-xl bg-blue-50 flex items-center justify-center mb-4">
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#185FA5' }}>PAY</span>
            </div>
            <h2 className="text-base font-bold text-navy mb-1">Payments</h2>
            <p className="text-sm text-gray-500 leading-relaxed">
              Review manual payment screenshots, approve or reject, and activate user plans.
            </p>
          </Link>)}

          {canOpen(access, '/admin/users') && (<Link
            href="/admin/users"
            className="group block bg-white border border-gray-100 rounded-2xl p-6 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-200"
          >
            <div className="w-11 h-11 rounded-xl bg-green-50 flex items-center justify-center mb-4">
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#3B6D11' }}>USR</span>
            </div>
            <h2 className="text-base font-bold text-navy mb-1">Users</h2>
            <p className="text-sm text-gray-500 leading-relaxed">
              Browse all accounts, subscription statuses, plan tiers, and signup dates.
            </p>
          </Link>)}

{canOpen(access, '/admin/downloads') && (<Link
            href="/admin/downloads"
            className="group block bg-white border border-gray-100 rounded-2xl p-6 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-200"
          >
            <div className="w-11 h-11 rounded-xl bg-sky-50 flex items-center justify-center mb-4">
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#0C5D8C' }}>DL</span>
            </div>
            <h2 className="text-base font-bold text-navy mb-1">Downloads</h2>
            <p className="text-sm text-gray-500 leading-relaxed">
              How many files leave Lenga, which datasets and countries, who takes them, paying or free. CSV export.
            </p>
          </Link>)}

          {canOpen(access, '/admin/sales') && (<Link
            href="/admin/sales"
            className="group block bg-white border border-gray-100 rounded-2xl p-6 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-200"
          >
            <div className="w-11 h-11 rounded-xl bg-purple-50 flex items-center justify-center mb-4">
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#534AB7' }}>SAL</span>
            </div>
            <h2 className="text-base font-bold text-navy mb-1">Sales pipeline</h2>
            <p className="text-sm text-gray-500 leading-relaxed">
              Customers you are going after, by country: outreach by email and LinkedIn, next steps, free teams, and website quote requests.
            </p>
          </Link>)}

          {canOpen(access, '/admin/partners') && (<Link
            href="/admin/partners"
            className="group block bg-white border border-gray-100 rounded-2xl p-6 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-200"
          >
            <div className="w-11 h-11 rounded-xl bg-orange-50 flex items-center justify-center mb-4">
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#9A3412' }}>PAR</span>
            </div>
            <h2 className="text-base font-bold text-navy mb-1">Partnerships</h2>
            <p className="text-sm text-gray-500 leading-relaxed">
              Partners who get Lenga Maps used and paid for: marketplaces, built into their product, joint bids, project partners, resellers. Own drafts, LinkedIn and research.
            </p>
          </Link>)}

          {canOpen(access, '/admin/organizations') && (<Link
            href="/admin/organizations"
            className="group block bg-white border border-gray-100 rounded-2xl p-6 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-200"
          >
            <div className="w-11 h-11 rounded-xl bg-amber-50 flex items-center justify-center mb-4">
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#854F0B' }}>ORG</span>
            </div>
            <h2 className="text-base font-bold text-navy mb-1">Organizations</h2>
            <p className="text-sm text-gray-500 leading-relaxed">
              Provision team accounts, manage seats and status, see every member and the promo-email list.
            </p>
          </Link>)}

          {access.isOwner && (
            <Link
              href="/admin/team"
              className="group block bg-white border border-gray-100 rounded-2xl p-6 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-200"
            >
              <div className="w-11 h-11 rounded-xl bg-gray-100 flex items-center justify-center mb-4">
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#374151' }}>KEY</span>
              </div>
              <h2 className="text-base font-bold text-navy mb-1">Team access</h2>
              <p className="text-sm text-gray-500 leading-relaxed">
                Give staff access to parts of admin, change what they can open, or remove them.
              </p>
            </Link>
          )}

        </div>
        {access.loaded && !access.isAdmin && (
          <p className="mt-8 text-sm text-gray-500">This account has no admin access. Ask an owner to add you at Team access.</p>
        )}
      </div>
    </div>
  )
}