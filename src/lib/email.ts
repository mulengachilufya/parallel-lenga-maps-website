// src/lib/email.ts
//
// Transactional email for Lenga Maps lifecycle messages (welcome,
// trial-ended, dormant nudge).
//
// Primary transport is Resend, called over its REST API with fetch, no
// SDK dependency, same pattern as our Lipila / Web3Forms calls. If
// RESEND_API_KEY is unset we fall back to the existing Web3Forms relay so
// nothing hard-fails before the Resend account/domain is live.
//
// Copy style: no em dashes anywhere in customer-facing text. They read as
// an AI giveaway. Use commas, periods, colons and semicolons instead.
//
// Env:
//   RESEND_API_KEY   Resend secret (re_...). When set, Resend is used.
//   RESEND_FROM      From header, e.g. 'Lenga Maps <noreply@lengamaps.com>'.
//                    Must be a domain verified in Resend.
//   NEXT_PUBLIC_WEB3FORMS_KEY[_ADMIN]  Fallback relay key.

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.lengamaps.com').replace(/\/$/, '')
const LOGO_URL = `${APP_URL}/images/branding/logo.png`
const DEFAULT_FROM = 'Lenga Maps <noreply@lengamaps.com>'

export interface EmailMessage {
  to:      string
  subject: string
  html:    string
  text:    string
}

// ── Transports ────────────────────────────────────────────────────────────

async function sendViaResend(msg: EmailMessage): Promise<boolean> {
  const key = process.env.RESEND_API_KEY
  if (!key) return false
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        from:    process.env.RESEND_FROM || DEFAULT_FROM,
        to:      [msg.to],
        subject: msg.subject,
        html:    msg.html,
        text:    msg.text,
      }),
    })
    if (!res.ok) {
      console.error('[email] resend error', res.status, await res.text())
      return false
    }
    return true
  } catch (err) {
    console.error('[email] resend exception', err)
    return false
  }
}

async function sendViaWeb3Forms(msg: EmailMessage): Promise<boolean> {
  const key = process.env.NEXT_PUBLIC_WEB3FORMS_KEY_ADMIN ?? process.env.NEXT_PUBLIC_WEB3FORMS_KEY
  if (!key) return false
  try {
    const res = await fetch('https://api.web3forms.com/submit', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        access_key: key,
        from_name:  'Lenga Maps',
        email:      msg.to,
        subject:    msg.subject,
        // Web3Forms is plain-text only, send the text variant.
        message:    msg.text,
      }),
    })
    if (!res.ok) {
      console.error('[email] web3forms error', res.status, await res.text())
      return false
    }
    return true
  } catch (err) {
    console.error('[email] web3forms exception', err)
    return false
  }
}

/**
 * Send one transactional email. Tries Resend, then Web3Forms. Never throws,
 * returns true iff a transport accepted the message. Email is best-effort;
 * a failure here must never break the request that triggered it.
 */
export async function sendEmail(msg: EmailMessage): Promise<boolean> {
  if (await sendViaResend(msg)) return true
  return sendViaWeb3Forms(msg)
}

// ── Branded HTML shell ──────────────────────────────────────────────────────

function shell(opts: {
  preheader: string
  heading:   string
  bodyHtml:  string
  ctaLabel:  string
  ctaHref:   string
  footnote?: string
}): string {
  const { preheader, heading, bodyHtml, ctaLabel, ctaHref, footnote } = opts
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light only">
</head>
<body style="margin:0;padding:0;background:#0D2B45;font-family:Inter,Arial,Helvetica,sans-serif;">
  <span style="display:none!important;opacity:0;color:#0D2B45;height:0;width:0;overflow:hidden;">${preheader}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0D2B45;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;">
        <!-- Header -->
        <tr><td style="background:#0D2B45;padding:24px 32px;text-align:center;">
          <img src="${LOGO_URL}" alt="Lenga Maps" width="44" height="44" style="display:inline-block;vertical-align:middle;">
          <span style="display:inline-block;vertical-align:middle;margin-left:10px;color:#ffffff;font-size:18px;font-weight:800;letter-spacing:0.5px;">LENGA <span style="color:#F5B800;">MAPS</span></span>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:36px 32px 28px;">
          <h1 style="margin:0 0 18px;font-size:23px;line-height:1.25;color:#0D2B45;font-weight:800;">${heading}</h1>
          ${bodyHtml}
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0 6px;">
            <tr><td style="border-radius:10px;background:#C9A227;">
              <a href="${ctaHref}" style="display:inline-block;padding:14px 30px;font-size:15px;font-weight:700;color:#1a1200;text-decoration:none;border-radius:10px;">${ctaLabel}</a>
            </td></tr>
          </table>
          ${footnote ? `<p style="margin:18px 0 0;font-size:13px;line-height:1.6;color:#8a8a8a;">${footnote}</p>` : ''}
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:20px 32px 28px;border-top:1px solid #f0f0f0;">
          <p style="margin:0;font-size:12px;line-height:1.6;color:#9a9a9a;">
            Lenga Maps · Unmasking Africa with Data and Intelligence<br>
            Lusaka, Zambia · <a href="mailto:lengamaps@gmail.com" style="color:#1E5F8E;text-decoration:none;">lengamaps@gmail.com</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

function firstName(fullName?: string | null): string {
  return (fullName || '').trim().split(/\s+/)[0] || 'there'
}

// ── Templates ───────────────────────────────────────────────────────────────

export function welcomeEmail(to: string, fullName?: string | null): EmailMessage {
  const name = firstName(fullName)
  const cta  = `${APP_URL}/datasets`
  const bodyHtml = `
    <p style="margin:0 0 14px;font-size:15px;line-height:1.7;color:#333;">Hi ${name},</p>
    <p style="margin:0 0 14px;font-size:15px;line-height:1.7;color:#333;">
      Welcome to Lenga Maps. Your account is live and your <strong>3-day free trial</strong>
      is running. That's full Max access to every dataset, no card required.
    </p>
    <p style="margin:0 0 4px;font-size:15px;line-height:1.7;color:#333;">
      During the trial you can browse and download from all 15 datasets across the 54 African
      countries: boundaries, rivers, rainfall, drought, soil, land cover and more. Every layer
      is harmonised to EPSG:4326 and ready for QGIS.
    </p>`
  const text = `Hi ${name},

Welcome to Lenga Maps. Your account is live and your 3-day free trial is running. That's full Max access to every dataset, no card required.

Browse and download from all 15 datasets across 54 African countries, every layer harmonised to EPSG:4326 and ready for QGIS.

Browse datasets: ${cta}

Thanks,
The Lenga Maps team`
  return {
    to,
    subject: 'Welcome to Lenga Maps, your free trial is live',
    html: shell({
      preheader: 'Full Max access for 3 days, no card required.',
      heading:   `Welcome aboard, ${name}.`,
      bodyHtml,
      ctaLabel:  'Browse datasets',
      ctaHref:   cta,
      footnote:  'Your trial includes 10 downloads. Need help getting started? Just reply to this email.',
    }),
    text,
  }
}

export function trialEndedEmail(to: string, fullName?: string | null): EmailMessage {
  const name = firstName(fullName)
  const cta  = `${APP_URL}/pricing`
  const bodyHtml = `
    <p style="margin:0 0 14px;font-size:15px;line-height:1.7;color:#333;">Hi ${name},</p>
    <p style="margin:0 0 14px;font-size:15px;line-height:1.7;color:#333;">
      Your free trial has ended, but your work doesn't have to stop here.
    </p>
    <p style="margin:0 0 4px;font-size:15px;line-height:1.7;color:#333;">
      Keep full access to professional GIS data for all 54 African countries from just
      <strong>$5/month</strong>. Browsing stays free; a plan unlocks the downloads.
    </p>`
  const text = `Hi ${name},

Your free trial has ended, but your work doesn't have to stop here.

Keep full access to professional GIS data for all 54 African countries from just $5/month. Browsing stays free; a plan unlocks the downloads.

See plans: ${cta}

Thanks,
The Lenga Maps team`
  return {
    to,
    subject: 'Your free trial has ended, plans from $5/mo',
    html: shell({
      preheader: 'Keep downloading GIS data for all 54 African countries from $5/mo.',
      heading:   'Your free trial has ended',
      bodyHtml,
      ctaLabel:  'See plans from $5/mo',
      ctaHref:   cta,
      footnote:  'No commitment. Cancel anytime from your billing page.',
    }),
    text,
  }
}

export function nudgeEmail(to: string, fullName?: string | null): EmailMessage {
  const name = firstName(fullName)
  const cta  = `${APP_URL}/atlas`
  const bodyHtml = `
    <p style="margin:0 0 14px;font-size:15px;line-height:1.7;color:#333;">Hi ${name},</p>
    <p style="margin:0 0 14px;font-size:15px;line-height:1.7;color:#333;">
      We noticed you're subscribed but haven't downloaded any GIS datasets yet, and we'd
      hate for your plan to go unused.
    </p>
    <p style="margin:0 0 4px;font-size:15px;line-height:1.7;color:#333;">
      Want ideas on what to build? Our Atlas showcases real maps made from Lenga data, like
      watershed delineations, solar potential, carbon credits and mining boundaries, to spark
      what you could create next.
    </p>`
  const text = `Hi ${name},

We noticed you're subscribed but haven't downloaded any GIS datasets yet, and we'd hate for your plan to go unused.

Want ideas on what to build? Our Atlas showcases real maps made from Lenga data, like watershed delineations, solar potential, carbon credits and mining boundaries.

Explore the Atlas: ${cta}

Thanks,
The Lenga Maps team`
  return {
    to,
    subject: 'Some ideas for your Lenga Maps subscription',
    html: shell({
      preheader: 'Real maps built from Lenga data, to spark what you could create next.',
      heading:   `${name}, here's what you could build`,
      bodyHtml,
      ctaLabel:  'Explore the Atlas',
      ctaHref:   cta,
      footnote:  'Stuck on a specific use case? Reply to this email and we\'ll point you to the right datasets.',
    }),
    text,
  }
}
