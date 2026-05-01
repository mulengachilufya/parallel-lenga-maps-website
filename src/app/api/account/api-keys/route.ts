/**
 * GET  /api/account/api-keys   — list the signed-in user's keys (no plaintext).
 * POST /api/account/api-keys   — generate a new key. Returns the plaintext ONCE.
 *
 * These are dashboard-facing, so they require a Supabase session (cookie),
 * NOT a bearer token. Bearer tokens are for the public /api/v1/* surface.
 *
 * Eligibility: only `account_type='business'` with `plan_status='active'`
 * (and unexpired) can mint keys. Anything else gets 403.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { createClient } from '@supabase/supabase-js'
import { generateApiKey } from '@/lib/api-keys'

export const dynamic = 'force-dynamic'

interface ApiKeyRow {
  id:                       string
  label:                    string
  key_last4:                string
  scopes:                   string[]
  last_used_at:             string | null
  requests_this_month:      number
  egress_bytes_this_month:  number
  created_at:               string
  revoked_at:               string | null
}

/** Profile gate: Business — On-site tier (account_type='business' AND
 *  plan IN ('pro','max')) + active + not-expired. The $75 Business tier
 *  (plan='basic') gets a separate api_tier_required error so the dashboard
 *  can show a useful upgrade message instead of a generic 403. */
async function requireBusinessUser(): Promise<{ userId: string } | NextResponse> {
  const supabase = createServerSupabase()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('account_type, plan, plan_status, plan_expires_at')
    .eq('id', session.user.id)
    .single()

  if (!profile || profile.account_type !== 'business') {
    return NextResponse.json(
      { error: 'business_only', message: 'API keys are available on the Business tier only.' },
      { status: 403 },
    )
  }
  if (profile.plan !== 'pro' && profile.plan !== 'max') {
    return NextResponse.json(
      {
        error:   'api_tier_required',
        message: 'API keys are available on the Business — On-site tier ($225/mo). Email lengamaps@gmail.com to upgrade.',
      },
      { status: 403 },
    )
  }
  if (profile.plan_status !== 'active') {
    return NextResponse.json(
      { error: 'plan_inactive', message: 'Activate your Business — On-site plan to mint API keys.' },
      { status: 403 },
    )
  }
  if (profile.plan_expires_at && new Date(profile.plan_expires_at).getTime() <= Date.now()) {
    return NextResponse.json(
      { error: 'plan_expired', message: 'Your Business — On-site plan has expired. Renew to mint API keys.' },
      { status: 403 },
    )
  }

  return { userId: session.user.id }
}

export async function GET() {
  const gate = await requireBusinessUser()
  if (gate instanceof NextResponse) return gate

  // We use the service role here (not the cookie client) because we want a
  // single source of truth for which fields are returned — RLS would let
  // the user see their own row, but we'd then have to maintain TWO views of
  // the table. Service role + explicit field whitelist is simpler.
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )

  const { data, error } = await supabase
    .from('api_keys')
    .select('id, label, key_last4, scopes, last_used_at, requests_this_month, egress_bytes_this_month, created_at, revoked_at')
    .eq('user_id', gate.userId)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: 'list_failed', message: error.message }, { status: 500 })
  }

  return NextResponse.json({ keys: (data ?? []) as ApiKeyRow[] })
}

export async function POST(req: NextRequest) {
  const gate = await requireBusinessUser()
  if (gate instanceof NextResponse) return gate

  let body: { label?: string } = {}
  try { body = await req.json() } catch { /* optional body */ }
  const label = (body.label ?? '').trim().slice(0, 100) || 'Untitled key'

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )

  // Cap keys per user to keep the dashboard sane and limit blast radius
  // if a single account is compromised.
  const { count } = await supabase
    .from('api_keys')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', gate.userId)
    .is('revoked_at', null)
  if ((count ?? 0) >= 10) {
    return NextResponse.json(
      { error: 'too_many_keys', message: 'You already have 10 active keys — revoke an old one first.' },
      { status: 400 },
    )
  }

  const generated = generateApiKey()

  const { data, error } = await supabase
    .from('api_keys')
    .insert({
      user_id:   gate.userId,
      key_hash:  generated.hash,
      key_last4: generated.last4,
      label,
      scopes:    ['datasets:read'],
    })
    .select('id, label, key_last4, scopes, created_at')
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'create_failed', message: error?.message ?? 'unknown' }, { status: 500 })
  }

  // Plaintext returned EXACTLY ONCE. Frontend tells the user this is their
  // only chance to copy it — we do not (and cannot) recover it later.
  return NextResponse.json({
    key: {
      id:         data.id,
      label:      data.label,
      key_last4:  data.key_last4,
      scopes:     data.scopes,
      created_at: data.created_at,
    },
    plaintext: generated.plaintext,
  })
}
