/**
 * GET/POST /api/sales/optout?t=<token> — the "rather not hear from me" link
 * in every outreach email. Public: the token is the only credential and
 * only ever stops emails.
 *
 * GET only shows a confirm button, because company mail scanners open
 * every link in an email and must not opt people out by accident. POST
 * does it: from that button, or the one-click List-Unsubscribe that mail
 * apps send.
 */
import { NextRequest, NextResponse } from 'next/server'
import { db, isUuid, logActivity } from '@/lib/sales/server'

export const dynamic = 'force-dynamic'

async function optOut(token: string | null): Promise<boolean> {
  if (!isUuid(token)) return false
  const { data: c } = await db.from('sales_contacts').select('id, account_id, name, opted_out_at').eq('optout_token', token).maybeSingle()
  if (!c) return false
  if (!c.opted_out_at) {
    const now = new Date().toISOString()
    await db.from('sales_contacts').update({ opted_out_at: now }).eq('id', c.id)
    await db.from('sales_tasks').update({ done_at: now, outcome: 'skipped' })
      .eq('account_id', c.account_id).eq('contact_id', c.id).eq('kind', 'email').is('done_at', null)
    await logActivity({ account_id: c.account_id, contact_id: c.id, kind: 'system', direction: 'in', created_by: 'prospect',
      subject: `${c.name} asked not to be emailed again. Emails to them are now blocked.` })
  }
  return true
}

function page(ok: boolean, confirmToken?: string) {
  const msg = confirmToken
    ? `<h1>Stop emails from Lenga Maps?</h1><p>Press the button and I will not email you again.</p>
<form method="post" action="/api/sales/optout?t=${confirmToken}" style="margin-top:18px"><button style="background:#0D2B45;color:#fff;border:0;border-radius:8px;padding:11px 18px;font-size:15px;cursor:pointer">Yes, stop the emails</button></form>`
    : ok
    ? '<h1>Done. You will not get any more emails from me.</h1><p>Sorry for the bother, and thank you for letting me know.</p>'
    : '<h1>That link did not work.</h1><p>Reply to the email with "no thanks" and I will take you off my list by hand.</p>'
  return new NextResponse(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Lenga Maps</title>
<style>body{font-family:Arial,Helvetica,sans-serif;background:#f5f3ee;color:#222;margin:0;padding:48px 16px}main{max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:28px}h1{font-size:20px;margin:0 0 10px}p{color:#555;line-height:1.6;margin:0}</style>
</head><body><main>${msg}<p style="margin-top:18px;font-size:13px;color:#999">Lenga Maps · lengamaps.com</p></main></body></html>`,
    { status: ok ? 200 : 404, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } })
}

export async function GET(req: NextRequest) {
  const t = req.nextUrl.searchParams.get('t')
  if (!isUuid(t)) return page(false)
  const { data } = await db.from('sales_contacts').select('opted_out_at').eq('optout_token', t).maybeSingle()
  if (!data) return page(false)
  return data.opted_out_at ? page(true) : page(true, t)
}

export async function POST(req: NextRequest) {
  return page(await optOut(req.nextUrl.searchParams.get('t')))
}
