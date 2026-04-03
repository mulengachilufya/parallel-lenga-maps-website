import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { listFiles } from '@/lib/r2'

export async function GET(request: NextRequest) {
  const supabase = createServerSupabase()
  const { data: { session } } = await supabase.auth.getSession()

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const prefix = request.nextUrl.searchParams.get('prefix') ?? 'datasets/'
  const files = await listFiles(prefix)

  return NextResponse.json({ files })
}
