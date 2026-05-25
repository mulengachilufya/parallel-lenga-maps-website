// src/app/admin/page.tsx
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'

export default function AdminPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const check = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.replace('/login?next=%2Fadmin')
        return
      }
      setLoading(false)
    }
    check()
  }, [router])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 size={32} className="animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="h-20" />
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-16">
        <h1 className="text-2xl font-bold text-navy mb-2">Admin</h1>
        <p className="text-gray-500 text-sm mb-10">Lenga Maps internal tools.</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">

          <Link
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
          </Link>

          <Link
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
          </Link>

        </div>
      </div>
    </div>
  )
}