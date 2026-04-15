import { NextRequest, NextResponse } from 'next/server'

/**
 * POST /api/contact
 * Forwards contact form submissions to lengamaps@gmail.com via Web3Forms.
 * Requires NEXT_PUBLIC_WEB3FORMS_KEY in env.
 * Get a free key at https://web3forms.com — just enter your email address.
 */
export async function POST(request: NextRequest) {
  try {
    const { name, email, subject, message } = await request.json()

    if (!name || !email || !message) {
      return NextResponse.json({ error: 'Name, email and message are required.' }, { status: 400 })
    }

    const accessKey = process.env.NEXT_PUBLIC_WEB3FORMS_KEY

    if (!accessKey) {
      console.warn('[Contact] NEXT_PUBLIC_WEB3FORMS_KEY not set — message not delivered.')
      console.log({ name, email, subject, message })
      return NextResponse.json({ ok: true })
    }

    const res = await fetch('https://api.web3forms.com/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        access_key: accessKey,
        name,
        email,
        subject: subject ? `[Lenga Maps] ${subject}` : `[Lenga Maps] New message from ${name}`,
        message,
        botcheck: '',
      }),
    })

    const data = await res.json()

    if (!data.success) {
      console.error('[Contact] Web3Forms error:', data)
      return NextResponse.json({ error: 'Failed to send message.' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[Contact] Error:', error)
    return NextResponse.json({ error: 'Server error.' }, { status: 500 })
  }
}
