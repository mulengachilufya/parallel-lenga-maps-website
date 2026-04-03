import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { getUploadUrl, buildFileKey } from '@/lib/r2'

export async function POST(request: NextRequest) {
  const supabase = createServerSupabase()
  const { data: { session } } = await supabase.auth.getSession()

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { filename, contentType, country, layerType } = body

  if (!filename || !contentType || !country || !layerType) {
    return NextResponse.json(
      { error: 'Missing required fields: filename, contentType, country, layerType' },
      { status: 400 }
    )
  }

  const key = buildFileKey(country, layerType, filename)
  const uploadUrl = await getUploadUrl(key, contentType)

  // Store file metadata in Supabase
  await supabase.from('files').insert({
    user_id: session.user.id,
    filename,
    r2_key: key,
    content_type: contentType,
    country,
    layer_type: layerType,
  })

  return NextResponse.json({ uploadUrl, key })
}
