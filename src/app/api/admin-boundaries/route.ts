import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
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
  const supabase = createServerSupabase()
  const { data: { session } } = await supabase.auth.getSession()

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

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

    if (adminLevel !== null) {
      query = query.eq('admin_level', parseInt(adminLevel))
    }

    // Order by country and admin level
    query = query.order('country', { ascending: true }).order('admin_level', {
      ascending: true,
    })

    const { data, error } = await query

    if (error) {
      console.error('Database error:', error)
      return NextResponse.json(
        { error: 'Failed to fetch admin boundaries' },
        { status: 500 }
      )
    }

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
