import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { finalizeLencoPayment } from '@/lib/lenco-finalize'
import { isLipilaReference, lipilaConfig, validLipilaCallback } from '@/lib/lipila'

const service = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function POST(req: NextRequest) {
  const config = lipilaConfig()
  if (!config) return new NextResponse(null, { status: 503 })

  const reference = req.nextUrl.searchParams.get('reference') ?? ''
  const token = req.nextUrl.searchParams.get('token') ?? ''
  if (!isLipilaReference(reference) || !validLipilaCallback(reference, token, config.apiKey)) {
    return new NextResponse(null, { status: 401 })
  }

  // The callback only triggers verification. Fulfillment uses Lipila's status API.
  const result = await finalizeLencoPayment(service, null, reference)
  return new NextResponse(null, { status: result.state === 'error' || result.state === 'pending' ? 503 : 204 })
}
