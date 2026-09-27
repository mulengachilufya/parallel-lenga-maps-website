import { NextResponse } from 'next/server'
import { OPS_COOKIE } from '@/lib/ops/auth'

export async function POST() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(OPS_COOKIE, '', { path: '/', maxAge: 0 })
  return res
}
