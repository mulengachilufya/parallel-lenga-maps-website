import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getDownloadUrl } from '@/lib/r2'

export interface AdminBoundary {
  id: number
  country: string
  country_code?: string
  admin_level: number
  r2_key: string
  file_size_mb: number
  geom_type: string
  source: string
  created_at: string
  download_url?: string
}

/**
 * GET /api/admin-boundaries
 * List admin boundaries with optional filtering
 * Query params:
 *   - country: filter by country name (case-insensitive substring match)
 *   - adminLevel: filter by admin level (0, 1, 2, 3)
 *   - includeUrl: include presigned download URL (true/false, default: true)
 */
export async function GET(request: NextRequest) {
  // Use service role key to bypass RLS — boundary data is public
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  try {
    const searchParams = request.nextUrl.searchParams
    const country = searchParams.get('country')
    const adminLevel = searchParams.get('adminLevel')
    const includeUrl = searchParams.get('includeUrl') !== 'false' // default true

    // Build query
    let query = supabase.from('admin_boundaries').select('*')

    // Apply filters
    if (country) {
      query = query.ilike('country', `%${country}%`)
    }

    if (adminLevel !== null && adminLevel !== '') {
      query = query.eq('admin_level', parseInt(adminLevel))
    }

    // Order by country and admin level
    query = query.order('country', { ascending: true }).order('admin_level', {
      ascending: true,
    })

    const { data, error, count: rowCount } = await query

    if (error) {
      console.error('Database error:', error)
      return NextResponse.json(
        { error: 'Failed to fetch admin boundaries', details: error.message },
        { status: 500 }
      )
    }

    console.log(`Admin boundaries query: ${data?.length ?? 0} rows returned`)

    // Add presigned download URLs if requested
    let boundaries: AdminBoundary[] = data || []

    if (includeUrl && boundaries.length > 0) {
      boundaries = await Promise.all(
        boundaries.map(async (boundary) => {
          try {
            const download_url = await getDownloadUrl(boundary.r2_key, 3600) // 1 hour expiry
            return {
              ...boundary,
              download_url,
            }
          } catch (error) {
            console.warn(`Failed to get URL for ${boundary.r2_key}:`, error)
            return boundary
          }
        })
      )
    }

    return NextResponse.json({
      count: boundaries.length,
      boundaries,
    })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
