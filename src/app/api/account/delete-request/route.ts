import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

const REASONS: Record<string, string> = {
  too_expensive:    'Price is too expensive',
  not_using:        'Not using it enough',
  missing_features: 'Missing features I need',
  switching_tools:  'Switching to another tool',
  project_ended:    'My project has ended',
  other:            'Other',
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies })
    const { data: { session } } = await supabase.auth.getSession()

    if (!session) {
      return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })
    }

    const { reason, message } = await request.json()

    if (!reason || !REASONS[reason]) {
      return NextResponse.json({ error: 'Please select a reason.' }, { status: 400 })
    }

    const accessKey = process.env.NEXT_PUBLIC_WEB3FORMS_KEY
    const userEmail = session.user.email
    const userName  = session.user.user_metadata?.full_name || 'Unknown'
    const userId    = session.user.id

    // Fetch plan from profiles
    const { data: profile } = await supabase
      .from('profiles')
      .select('plan, account_type, is_paid')
      .eq('id', userId)
      .single()

    const reasonLabel = REASONS[reason]
    const emailBody = `
A user has requested account deletion.

── User Details ──────────────────────────
Name:         ${userName}
Email:        ${userEmail}
User ID:      ${userId}
Plan:         ${profile?.plan ?? 'unknown'}
Account Type: ${profile?.account_type ?? 'unknown'}
Is Paid:      ${profile?.is_paid ? 'Yes' : 'No'}

── Reason for Leaving ────────────────────
${reasonLabel}
${message ? `\nAdditional message:\n"${message}"` : ''}

── Action Required ───────────────────────
1. Reply to the user to confirm deletion timeline
2. Cancel any active payments if applicable
3. Delete user from Supabase: Authentication → Users → ${userEmail}
4. Delete their profile row: profiles WHERE id = '${userId}'
    `.trim()

    if (accessKey) {
      await fetch('https://api.web3forms.com/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          access_key: accessKey,
          name:       `${userName} (Account Deletion Request)`,
          email:      userEmail,
          subject:    `[Lenga Maps] Account Deletion Request — ${userEmail}`,
          message:    emailBody,
          botcheck:   '',
        }),
      })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[DeleteRequest] Error:', error)
    return NextResponse.json({ error: 'Server error.' }, { status: 500 })
  }
}
