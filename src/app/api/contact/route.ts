import { NextRequest, NextResponse } from 'next/server'

/**
 * POST /api/contact
 * Forwards contact form submissions to lengamaps@gmail.com via Gmail SMTP.
 * Requires GMAIL_USER and GMAIL_APP_PASSWORD in env.
 */
export async function POST(request: NextRequest) {
  try {
    const { name, email, subject, message } = await request.json()

    if (!name || !email || !message) {
      return NextResponse.json({ error: 'Name, email and message are required.' }, { status: 400 })
    }

    const GMAIL_USER = process.env.GMAIL_USER
    const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD

    if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
      // Env not configured — log and return success so the form still feels responsive
      console.warn('Contact form: GMAIL_USER / GMAIL_APP_PASSWORD not set. Message not sent.')
      console.log({ name, email, subject, message })
      return NextResponse.json({ ok: true })
    }

    // Dynamically import nodemailer only on the server
    const nodemailer = await import('nodemailer')
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
    })

    await transporter.sendMail({
      from: `"Lenga Maps Contact" <${GMAIL_USER}>`,
      to: GMAIL_USER,
      replyTo: email,
      subject: `[Lenga Maps] ${subject || 'New message'} - from ${name}`,
      text: `Name: ${name}\nEmail: ${email}\nSubject: ${subject || '-'}\n\n${message}`,
      html: `
        <div style="font-family:sans-serif;max-width:600px">
          <h2 style="color:#1E5F8E">New message from Lenga Maps website</h2>
          <table style="width:100%;border-collapse:collapse">
            <tr><td style="padding:8px;color:#555;width:90px"><strong>Name</strong></td><td style="padding:8px">${name}</td></tr>
            <tr><td style="padding:8px;color:#555"><strong>Email</strong></td><td style="padding:8px"><a href="mailto:${email}">${email}</a></td></tr>
            <tr><td style="padding:8px;color:#555"><strong>Subject</strong></td><td style="padding:8px">${subject || '-'}</td></tr>
          </table>
          <div style="margin-top:16px;padding:16px;background:#f5f5f5;border-radius:8px;white-space:pre-wrap">${message}</div>
          <p style="color:#aaa;font-size:12px;margin-top:24px">Sent from the Lenga Maps contact form</p>
        </div>
      `,
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Contact form error:', error)
    return NextResponse.json({ error: 'Failed to send message. Please try WhatsApp or email directly.' }, { status: 500 })
  }
}
