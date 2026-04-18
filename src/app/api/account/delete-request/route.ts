import { NextRequest, NextResponse } from 'next/server'

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
    const { reason, message, userName, userEmail, userId, plan, accountType, isPaid } = await request.json()

    if (!reason || !REASONS[reason]) {
      return NextResponse.json({ error: 'Please select a reason.' }, { status: 400 })
    }

    const accessKey = process.env.NEXT_PUBLIC_WEB3FORMS_KEY
    const reasonLabel = REASONS[reason]

    const emailBody = `
A user has requested account deletion.

── User Details ──────────────────────────
Name:         ${userName || 'Unknown'}
Email:        ${userEmail || 'Unknown'}
User ID:      ${userId || 'Unknown'}
Plan:         ${plan || 'unknown'}
Account Type: ${accountType || 'unknown'}
Is Paid:      ${isPaid ? 'Yes' : 'No'}

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
