// src/lib/email.ts
//
// Transactional + lifecycle email for Lenga Maps. Every automated email in
// the app goes out through Resend (HTTP API). No SMTP, no fallback relays.
//
// Mail is split into CHANNELS, each with its own Resend API key and verified
// sender, so keys can be scoped and rotated independently in Resend:
//   account    welcome, trial-ended, trial-cap, nudge, team invites, quotes
//              -> RESEND_NEW_USER_API_KEY,  from support@lengamaps.com
//   newsletter the landing-page newsletter
//              -> RESEND_NEWSLETTER_API_KEY, from newsletter@lengamaps.com
//   payments   payment confirmation / receipt / failure
//              -> RESEND_PAYMENTS_API_KEY,  from support@lengamaps.com
//
// Inbound and replies to support@/newsletter@ are forwarded to Gmail (via
// ImprovMX), so reply-to can safely default to the channel's From address.
//
// Copy style: no em dashes anywhere in customer-facing text. They read as
// an AI giveaway. Use commas, periods, colons and semicolons instead.

import { PLANS, type TierSlug } from './pricing'
import { BANK_DETAILS } from './bank-details'

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.lengamaps.com').replace(/\/$/, '')
const LOGO_URL = `${APP_URL}/images/branding/logo.png`
// Channels map an email to a Resend API key + a verified sender address.
// Each channel's key is set in Vercel (and .env.local). An unset key causes
// the send to be skipped and logged, never thrown.
export type EmailChannel = 'account' | 'newsletter' | 'payments' | 'manual_payment'

function channelConfig(channel: EmailChannel): { key?: string; from: string } {
  switch (channel) {
    case 'newsletter':
      return {
        key:  process.env.RESEND_NEWSLETTER_API_KEY,
        from: process.env.RESEND_NEWSLETTER_FROM || 'Lenga Maps <newsletter@lengamaps.com>',
      }
    case 'payments':
      return {
        key:  process.env.RESEND_PAYMENTS_API_KEY,
        from: process.env.RESEND_PAYMENTS_FROM || 'Lenga Maps <support@lengamaps.com>',
      }
    case 'manual_payment':
      // Dedicated key + sender for the card/bank-transfer bank-details email,
      // kept separate from the other Resend channels.
      return {
        key:  process.env.RESEND_MANUAL_PAYMENTS_API_KEY,
        from: process.env.RESEND_MANUAL_PAYMENTS_FROM || 'Lenga Maps <mulenga@lengamaps.com>',
      }
    case 'account':
    default:
      return {
        key:  process.env.RESEND_NEW_USER_API_KEY,
        from: process.env.RESEND_NEW_USER_FROM || 'Lenga Maps <support@lengamaps.com>',
      }
  }
}

export interface EmailMessage {
  to:       string
  subject:  string
  html:     string
  text:     string
  replyTo?: string
}

/**
 * Send one transactional email through Resend on the given channel.
 *
 * Never throws; returns true iff Resend accepted the message. Email is
 * best-effort and must never break the request that triggered it. If the
 * channel's API key is unset, the send is skipped and logged.
 */
export async function sendEmail(
  msg: EmailMessage,
  channel: EmailChannel = 'account',
): Promise<boolean> {
  const { key, from } = channelConfig(channel)
  if (!key) {
    console.error(`[email] no Resend key for channel "${channel}", skipped send to`, msg.to)
    return false
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to:       [msg.to],
        subject:  msg.subject,
        html:     msg.html,
        text:     msg.text,
        reply_to: msg.replyTo || undefined,
      }),
    })
    if (!res.ok) {
      console.error('[email] resend error', { channel, status: res.status }, await res.text())
      return false
    }
    console.log('[email] sent', { channel, to: msg.to })
    return true
  } catch (err) {
    console.error('[email] resend exception', { channel }, err)
    return false
  }
}

// ── Branded HTML shell ──────────────────────────────────────────────────────

function shell(opts: {
  preheader:  string
  heading:    string
  bodyHtml:   string
  ctaLabel:   string
  ctaHref:    string
  cta2Label?: string
  cta2Href?:  string
  footnote?:  string
}): string {
  const { preheader, heading, bodyHtml, ctaLabel, ctaHref, cta2Label, cta2Href, footnote } = opts
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
            ${cta2Label && cta2Href ? `<tr><td style="height:12px;line-height:12px;font-size:12px;">&nbsp;</td></tr>
            <tr><td style="border-radius:10px;background:#0D2B45;">
              <a href="${cta2Href}" style="display:inline-block;padding:14px 30px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;">${cta2Label}</a>
            </td></tr>` : ''}
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
      Your account is live and your <strong>3-day free trial just started</strong>. For the
      next 72 hours you have full <strong>Max</strong> access to every dataset across all 54
      African countries, plus <strong>10 downloads</strong> to spend. No card required.
    </p>
    <p style="margin:0 0 10px;font-size:15px;line-height:1.7;color:#333;">
      The trial only pays off if you pull real data into your map, so do this today while the
      clock is running:
    </p>
    <ol style="margin:0 0 4px;padding-left:20px;font-size:15px;line-height:1.8;color:#333;">
      <li>Pick a country and a dataset: boundaries, rivers, rainfall, drought, soil, land cover and more.</li>
      <li>Download it, already harmonised to EPSG:4326 and ready for QGIS.</li>
      <li>Drop it straight into your project. That is one of your 10 downloads working for you.</li>
    </ol>`
  const text = `Hi ${name},

Your account is live and your 3-day free trial just started. For the next 72 hours you have full Max access to every dataset across all 54 African countries, plus 10 downloads to spend. No card required.

The trial only pays off if you pull real data into your map, so do this today while the clock is running:

1. Pick a country and a dataset: boundaries, rivers, rainfall, drought, soil, land cover and more.
2. Download it, already harmonised to EPSG:4326 and ready for QGIS.
3. Drop it straight into your project.

Start here: ${cta}

Three days goes fast, so dive in now. Need a hand getting started? Just reply to this email.

Thanks,
The Lenga Maps team`
  return {
    to,
    subject: `${name}, your 3 days of full Lenga Maps access just started`,
    html: shell({
      preheader: 'Full Max access + 10 downloads for 3 days. No card required.',
      heading:   `Your 3-day trial is live, ${name}.`,
      bodyHtml,
      ctaLabel:  'Download your first dataset',
      ctaHref:   cta,
      footnote:  'Three days goes fast, so dive in now. Stuck on where to start? Just reply to this email.',
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

export function trialCapEmail(to: string, fullName?: string | null): EmailMessage {
  const name = firstName(fullName)
  const cta  = `${APP_URL}/pricing`
  const bodyHtml = `
    <p style="margin:0 0 14px;font-size:15px;line-height:1.7;color:#333;">Hi ${name},</p>
    <p style="margin:0 0 14px;font-size:15px;line-height:1.7;color:#333;">
      You've now used all 10 downloads included in your free trial. Nice work,
      that's a real head start on your mapping.
    </p>
    <p style="margin:0 0 4px;font-size:15px;line-height:1.7;color:#333;">
      To keep downloading GIS data for all 54 African countries, pick a plan from
      just <strong>$5/month</strong>. Browsing stays free either way.
    </p>`
  const text = `Hi ${name},

You've now used all 10 downloads included in your free trial. Nice work, that's a real head start on your mapping.

To keep downloading GIS data for all 54 African countries, pick a plan from just $5/month. Browsing stays free either way.

See plans: ${cta}

Thanks,
The Lenga Maps team`
  return {
    to,
    subject: "You've used all 10 trial downloads",
    html: shell({
      preheader: 'Keep downloading GIS data for all 54 African countries from $5/mo.',
      heading:   "You've used your 10 free downloads",
      bodyHtml,
      ctaLabel:  'See plans from $5/mo',
      ctaHref:   cta,
      footnote:  'Your trial browsing stays open. A plan unlocks downloads again.',
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

// ── Newsletter ──────────────────────────────────────────────────────────────

/**
 * Add a subscriber to the Resend Audience that backs the weekly newsletter, so
 * each Monday issue can be written and sent from Resend > Broadcasts. Uses the
 * newsletter API key and RESEND_AUDIENCE_ID. Best-effort: never throws, and a
 * missing audience id just skips (logged), so it can't fail a sign-up.
 */
export async function addNewsletterContact(email: string): Promise<boolean> {
  const key        = process.env.RESEND_NEWSLETTER_API_KEY
  const audienceId = process.env.RESEND_AUDIENCE_ID
  if (!key || !audienceId) {
    console.error('[email] newsletter contact skipped: missing RESEND_NEWSLETTER_API_KEY or RESEND_AUDIENCE_ID')
    return false
  }
  try {
    const res = await fetch(`https://api.resend.com/audiences/${audienceId}/contacts`, {
      method:  'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email, unsubscribed: false }),
    })
    if (!res.ok) {
      console.error('[email] resend contact error', { status: res.status }, await res.text())
      return false
    }
    console.log('[email] newsletter contact added', { email })
    return true
  } catch (err) {
    console.error('[email] resend contact exception', err)
    return false
  }
}

/**
 * Sent immediately when someone subscribes via the landing-page newsletter.
 * Goes out on the `newsletter` channel (newsletter@lengamaps.com). Best-effort:
 * a failed send must never fail the subscribe request.
 */
export function newsletterWelcomeEmail(to: string): EmailMessage {
  const cta = `${APP_URL}/atlas`
  const dl  = `${APP_URL}/datasets`
  const bodyHtml = `
    <p style="margin:0 0 14px;font-size:15px;line-height:1.7;color:#333;">Hi there,</p>
    <p style="margin:0 0 14px;font-size:15px;line-height:1.7;color:#333;">
      My name is Mulenga, founder of Lenga Maps, a tech startup building Africa's largest and
      most centralised GIS data platform for Climate, Water and Industrial Projects. We developed
      this newsletter to truly connect extensively with great people like yourself, and will be
      offering the following:
    </p>
    <ul style="margin:0 0 14px;padding-left:20px;font-size:15px;line-height:1.8;color:#333;">
      <li><strong>From the Build</strong>: an honest note on what I shipped at Lenga Maps that week.</li>
      <li><strong>The Feature</strong>: one GIS concept or African environmental issue, explored properly.</li>
      <li><strong>Dataset Spotlight</strong>: one of our datasets, one real use case, and the decision it informs.</li>
      <li><strong>GIS Trick of the Week</strong>: one practical QGIS, Python or GDAL tip you can use that day.</li>
      <li><strong>The Question</strong>: one honest question. Hit reply, I read every one.</li>
    </ul>
    <p style="margin:0 0 4px;font-size:15px;line-height:1.7;color:#333;">
      New issues land every Monday. Lenga Maps gives you professional GIS data across all
      <strong>54 African countries</strong>: 15 datasets, harmonised to EPSG:4326 and ready for
      QGIS. Browsing is free, a <strong>3-day trial</strong> unlocks full access with 10 downloads
      and no card, and plans start at <strong>$5/month</strong>.
    </p>`
  const text = `Hi there,

My name is Mulenga, founder of Lenga Maps, a tech startup building Africa's largest and most centralised GIS data platform for Climate, Water and Industrial Projects. We developed this newsletter to truly connect extensively with great people like yourself, and will be offering the following:

- From the Build: an honest note on what I shipped at Lenga Maps that week.
- The Feature: one GIS concept or African environmental issue, explored properly.
- Dataset Spotlight: one of our datasets, one real use case, and the decision it informs.
- GIS Trick of the Week: one practical QGIS, Python or GDAL tip you can use that day.
- The Question: one honest question. Hit reply, I read every one.

New issues land every Monday. Lenga Maps gives you professional GIS data across all 54 African countries: 15 datasets, harmonised to EPSG:4326 and ready for QGIS. Browsing is free, a 3-day trial unlocks full access with 10 downloads and no card, and plans start at $5/month.

Explore the Atlas: ${cta}
Download GIS data: ${dl}

See you Monday,
Mulenga

You're getting this because you subscribed at www.lengamaps.com. Not for you? Just reply with "unsubscribe" and we'll take you off the list.`
  return {
    to,
    subject: 'Welcome to Earth, Maps & Models by Lenga Maps',
    html: shell({
      preheader: 'Geospatial thinking from the African frontier, every Monday.',
      heading:   'Welcome to Earth, Maps & Models by Lenga Maps.',
      bodyHtml,
      ctaLabel:  'Explore the Atlas',
      ctaHref:   cta,
      cta2Label: 'Download GIS data',
      cta2Href:  dl,
      footnote:  'See you Monday, Mulenga.<br><br>You\'re getting this because you subscribed at www.lengamaps.com. Not for you? Just reply with "unsubscribe" and we\'ll take you off the list.',
    }),
    text,
  }
}

// ── Teams tier ("For Project Teams and Businesses") ─────────────────────────

export const QUOTE_NOTIFY_EMAIL =
  process.env.QUOTE_NOTIFY_EMAIL || 'lengamaps@gmail.com'

export interface QuoteRequestFields {
  org_name:          string
  contact_name:      string | null
  email:             string
  sector:            string | null
  region:            string | null
  seats:             number | null
  datasets_interest: string | null
  notes:             string | null
}

/** Internal notification to the founder when a quote request lands. */
export function quoteRequestAdminEmail(q: QuoteRequestFields): EmailMessage {
  const cta  = `${APP_URL}/admin/quotes`
  const rows = [
    ['Organisation / project', q.org_name],
    ['Contact',                q.contact_name ?? ''],
    ['Email',                  q.email],
    ['Sector',                 q.sector ?? ''],
    ['Country / region',       q.region ?? ''],
    ['Seats requested',        q.seats != null ? String(q.seats) : ''],
    ['Datasets of interest',   q.datasets_interest ?? ''],
    ['Notes',                  q.notes ?? ''],
  ].filter(([, v]) => v)
  const bodyHtml = `
    <p style="margin:0 0 14px;font-size:15px;line-height:1.7;color:#333;">
      A team just asked for a quote on <strong>For Project Teams and Businesses</strong>.
    </p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;color:#333;">
      ${rows.map(([k, v]) => `<tr><td style="padding:6px 10px 6px 0;color:#888;white-space:nowrap;vertical-align:top;">${k}</td><td style="padding:6px 0;">${v}</td></tr>`).join('')}
    </table>`
  const text = `New team quote request\n\n${rows.map(([k, v]) => `${k}: ${v}`).join('\n')}\n\nManage: ${cta}`
  return {
    to: QUOTE_NOTIFY_EMAIL,
    subject: `Quote request: ${q.org_name} (${q.seats ?? '?'} seats)`,
    html: shell({
      preheader: `${q.org_name} requested a team quote.`,
      heading:   'New team quote request',
      bodyHtml,
      ctaLabel:  'Open quote pipeline',
      ctaHref:   cta,
      footnote:  'Reply to the requester within 1 business day, that is the promise on the form.',
    }),
    text,
  }
}

/** Confirmation to the person who submitted the quote form. */
export function quoteAckEmail(to: string, contactName: string | null, orgName: string): EmailMessage {
  const name = firstName(contactName)
  const cta  = `${APP_URL}/projects`
  const bodyHtml = `
    <p style="margin:0 0 14px;font-size:15px;line-height:1.7;color:#333;">Hi ${name},</p>
    <p style="margin:0 0 14px;font-size:15px;line-height:1.7;color:#333;">
      Thanks for your interest in <strong>For Project Teams and Businesses</strong> for
      ${orgName}. We received your request and will be in touch within 1 business day
      with a quote and the next steps.
    </p>
    <p style="margin:0 0 4px;font-size:15px;line-height:1.7;color:#333;">
      Your team plan covers all 15 datasets across all 54 African countries, a shared
      team workspace with download history, and API access.
    </p>`
  const text = `Hi ${name},

Thanks for your interest in For Project Teams and Businesses for ${orgName}. We received your request and will be in touch within 1 business day with a quote and the next steps.

Your team plan covers all 15 datasets across all 54 African countries, a shared team workspace with download history, and API access.

${cta}

Thanks,
The Lenga Maps team`
  return {
    to,
    subject: 'We received your team quote request',
    html: shell({
      preheader: 'We will be in touch within 1 business day.',
      heading:   'Request received',
      bodyHtml,
      ctaLabel:  'About team plans',
      ctaHref:   cta,
      footnote:  'Questions in the meantime? Just reply to this email.',
    }),
    text,
  }
}

/** Invitation to join an organization's team workspace. */
export function teamInviteEmail(
  to: string,
  orgName: string,
  inviterName: string | null,
  token: string,
): EmailMessage {
  const cta = `${APP_URL}/team/join?token=${token}`
  const inviter = inviterName ? `${inviterName} has` : 'Your team has'
  const bodyHtml = `
    <p style="margin:0 0 14px;font-size:15px;line-height:1.7;color:#333;">Hi,</p>
    <p style="margin:0 0 14px;font-size:15px;line-height:1.7;color:#333;">
      ${inviter} invited you to join <strong>${orgName}</strong> on Lenga Maps.
      As a team member you get every dataset across all 54 African countries, plus a
      shared workspace where your team sees what has already been downloaded, in which
      coordinate system and format, so nobody pulls the same layer twice.
    </p>
    <p style="margin:0 0 4px;font-size:15px;line-height:1.7;color:#333;">
      Accept with the button below. If you do not have a Lenga Maps account yet,
      create one with this email address first, then open the link again.
    </p>`
  const text = `Hi,

${inviter} invited you to join ${orgName} on Lenga Maps. As a team member you get every dataset across all 54 African countries, plus a shared team workspace.

Accept the invite: ${cta}

If you do not have a Lenga Maps account yet, create one with this email address first, then open the link again.

Thanks,
The Lenga Maps team`
  return {
    to,
    subject: `You're invited to ${orgName} on Lenga Maps`,
    html: shell({
      preheader: `Join ${orgName}'s team workspace on Lenga Maps.`,
      heading:   `Join ${orgName} on Lenga Maps`,
      bodyHtml,
      ctaLabel:  'Accept invitation',
      ctaHref:   cta,
      footnote:  'This invite is tied to this email address and one of your team\'s paid seats.',
    }),
    text,
  }
}

// ── Payments ────────────────────────────────────────────────────────────────

// Where manual-payment admin alerts go. Falls back to the quote notify
// address, then the founder inbox.
export const PAYMENT_NOTIFY_EMAIL =
  process.env.PAYMENT_NOTIFY_EMAIL || QUOTE_NOTIFY_EMAIL

export interface PaymentSubmittedFields {
  reference:     string
  region:        string
  method:        string
  plan:          string
  amountLabel:   string
  userEmail:     string
  userName:      string
  countryName:   string
  senderPhone:   string
  senderName:    string
  txnRef:        string
  screenshotUrl: string
  submittedAt:   string
}

/** Internal alert to the founder when a manual payment is submitted. */
export function paymentSubmittedAdminEmail(p: PaymentSubmittedFields): EmailMessage {
  const cta = `${APP_URL}/admin/payments`
  const rows = [
    ['Reference',    p.reference],
    ['Plan',         p.plan.toUpperCase()],
    ['Amount',       p.amountLabel],
    ['Method',       p.method.toUpperCase()],
    ['Region',       `${p.region}${p.countryName ? ` (${p.countryName})` : ''}`],
    ['User',         `${p.userName || '(no name)'} <${p.userEmail}>`],
    ['Sender name',  p.senderName || '(not provided)'],
    ['Sender phone', p.senderPhone || '(not provided)'],
    ['Txn ref',      p.txnRef || '(not provided)'],
    ['Submitted',    p.submittedAt],
  ].filter(([, v]) => v)
  const bodyHtml = `
    <p style="margin:0 0 14px;font-size:15px;line-height:1.7;color:#333;">
      A customer just submitted a manual payment for review.
    </p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;color:#333;">
      ${rows.map(([k, v]) => `<tr><td style="padding:6px 10px 6px 0;color:#888;white-space:nowrap;vertical-align:top;">${k}</td><td style="padding:6px 0;">${v}</td></tr>`).join('')}
    </table>
    ${p.screenshotUrl ? `<p style="margin:16px 0 0;font-size:14px;line-height:1.6;"><a href="${p.screenshotUrl}" style="color:#1E5F8E;">View payment screenshot</a> (link valid 7 days)</p>` : ''}`
  const text = [
    'New manual payment submitted',
    '',
    ...rows.map(([k, v]) => `${k}: ${v}`),
    '',
    p.screenshotUrl ? `Screenshot (valid 7 days): ${p.screenshotUrl}` : '',
    `Approve at: ${cta}`,
  ].filter(Boolean).join('\n')
  return {
    to:      PAYMENT_NOTIFY_EMAIL,
    replyTo: p.userEmail || undefined,
    subject: `New payment ${p.reference}: ${p.amountLabel} (${p.plan.toUpperCase()})`,
    html: shell({
      preheader: `${p.amountLabel} ${p.plan.toUpperCase()} from ${p.userName || p.userEmail}.`,
      heading:   'New payment to verify',
      bodyHtml,
      ctaLabel:  'Open payments queue',
      ctaHref:   cta,
      footnote:  'Verify or reject from the admin payments page.',
    }),
    text,
  }
}

/**
 * Bank-transfer details sent to the customer when they choose the card / bank
 * option. Goes out on the dedicated `manual_payment` channel. The bank details
 * live in src/lib/bank-details.ts.
 */
export function bankTransferDetailsEmail(opts: {
  to: string; firstName?: string | null; plan: TierSlug; appUrl?: string
}): EmailMessage {
  const fname = (opts.firstName || '').trim() || 'there'
  const plan  = PLANS[opts.plan]
  const b     = BANK_DETAILS
  const base  = (opts.appUrl || APP_URL).replace(/\/$/, '')
  const cta   = `${base}/dashboard/payment?plan=${opts.plan}`
  const rows: [string, string][] = [
    ['Amount',            `${plan.priceLabel} per month`],
    ['Account name',      b.accountName],
    ['Bank',              b.bankName],
    ['Account number',    b.accountNumber],
    ['Branch code',       b.branchCode],
    ['SWIFT / BIC',       b.swift],
    ['Bank address',      b.bankAddress],
    ['Payment reference', opts.to],
  ]
  const bodyHtml = `
    <p style="margin:0 0 14px;font-size:15px;line-height:1.7;color:#333;">Hi ${fname},</p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#333;">
      Thanks for choosing the <strong>${plan.name}</strong> plan. Here are the details to pay by
      bank transfer. Please use your email address as the payment reference so we can match your
      transfer to your account.
    </p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;color:#333;">
      ${rows.map(([k, v]) => `<tr><td style="padding:6px 10px 6px 0;color:#888;white-space:nowrap;vertical-align:top;">${k}</td><td style="padding:6px 0;font-weight:600;">${v}</td></tr>`).join('')}
    </table>
    <p style="margin:16px 0 0;font-size:14px;line-height:1.6;color:#555;">
      Once you have paid, upload your proof of payment and we will switch your plan on, usually
      within a few hours.
    </p>`
  const text = [
    `Hi ${fname},`,
    '',
    `Thanks for choosing the ${plan.name} plan. Pay by bank transfer using these details, and use your email address as the payment reference:`,
    '',
    ...rows.map(([k, v]) => `  ${k}: ${v}`),
    '',
    `Upload your proof of payment: ${cta}`,
    'We switch your plan on once we verify it, usually within a few hours.',
    '',
    'Not seeing our emails? Add mulenga@lengamaps.com to your contacts and check spam.',
    'Thanks, The Lenga Maps team',
  ].join('\n')
  return {
    to:      opts.to,
    subject: `Your Lenga Maps ${plan.name} plan: bank transfer details (${plan.priceLabel})`,
    html: shell({
      preheader: `Bank transfer details for your ${plan.name} plan.`,
      heading:   'Pay by bank transfer',
      bodyHtml,
      ctaLabel:  'Upload proof of payment',
      ctaHref:   cta,
      footnote:  'Not seeing our emails? Add mulenga@lengamaps.com to your contacts and check your spam folder.',
    }),
    text,
  }
}

/** Confirmation to the customer when their payment is verified. */
export function paymentVerifiedEmail(to: string, name: string | null, plan: string): EmailMessage {
  const fname = firstName(name)
  const cta   = `${APP_URL}/dashboard`
  const PLAN  = plan.toUpperCase()
  const bodyHtml = `
    <p style="margin:0 0 14px;font-size:15px;line-height:1.7;color:#333;">Hi ${fname},</p>
    <p style="margin:0 0 14px;font-size:15px;line-height:1.7;color:#333;">
      Great news, we have verified your payment. Your <strong>${PLAN}</strong> plan is now
      active, and you can download datasets right away.
    </p>`
  const text = `Hi ${fname},

Great news, we have verified your payment. Your ${PLAN} plan is now active, and you can download datasets right away at ${cta}.

If you need anything, just reply to this email.

Thanks,
The Lenga Maps team`
  return {
    to,
    subject: `Your Lenga Maps ${PLAN} plan is active`,
    html: shell({
      preheader: `Your ${PLAN} plan is active. Start downloading.`,
      heading:   `You're all set, ${fname}.`,
      bodyHtml,
      ctaLabel:  'Go to your dashboard',
      ctaHref:   cta,
      footnote:  'Need anything? Just reply to this email.',
    }),
    text,
  }
}

/** Notice to the customer when a payment cannot be verified. */
export function paymentRejectedEmail(to: string, name: string | null, note: string): EmailMessage {
  const fname  = firstName(name)
  const cta    = `${APP_URL}/dashboard/payment`
  const reason = note || 'No additional detail provided.'
  const bodyHtml = `
    <p style="margin:0 0 14px;font-size:15px;line-height:1.7;color:#333;">Hi ${fname},</p>
    <p style="margin:0 0 14px;font-size:15px;line-height:1.7;color:#333;">
      We reviewed your recent payment submission but could not verify it yet.
    </p>
    <p style="margin:0 0 4px;font-size:15px;line-height:1.7;color:#333;">
      Reason: ${reason}
    </p>`
  const text = `Hi ${fname},

We reviewed your recent payment submission but could not verify it yet.

Reason: ${reason}

You can resubmit from ${cta}, or reply to this email for help.

Thanks,
The Lenga Maps team`
  return {
    to,
    subject: 'Your Lenga Maps payment needs another look',
    html: shell({
      preheader: 'We could not verify your payment yet. Here is how to fix it.',
      heading:   'We need another look at your payment',
      bodyHtml,
      ctaLabel:  'Resubmit payment',
      ctaHref:   cta,
      footnote:  'Stuck? Reply to this email and we will help sort it out.',
    }),
    text,
  }
}

// ── Renewals ──────────────────────────────────────────────────────────────────

/**
 * Reminder that a plan renews soon. Renewal is manual (no silent auto-charge
 * on Zambian rails), so the CTA is a one-tap renew link.
 */
export function renewalReminderEmail(
  to: string,
  fullName: string | null,
  plan: string,
  daysLeft: number,
): EmailMessage {
  const name       = firstName(fullName)
  const PLAN       = plan.toUpperCase()
  const dayLabel   = `${daysLeft} day${daysLeft === 1 ? '' : 's'}`
  const renewLink  = `${APP_URL}/dashboard/payment?plan=${plan}&renew=1`
  const cancelLink = `${APP_URL}/dashboard/billing`
  const bodyHtml = `
    <p style="margin:0 0 14px;font-size:15px;line-height:1.7;color:#333;">Hi ${name},</p>
    <p style="margin:0 0 14px;font-size:15px;line-height:1.7;color:#333;">
      Heads up, your <strong>${PLAN}</strong> subscription renews in <strong>${dayLabel}</strong>.
    </p>
    <p style="margin:0 0 4px;font-size:15px;line-height:1.7;color:#333;">
      Card networks and mobile money in Zambia both require you to approve each
      renewal yourself, so a quick tap keeps your access going.
    </p>`
  const text = `Hi ${name},

Heads up, your Lenga Maps ${PLAN} subscription renews in ${dayLabel}.

Card networks and mobile money in Zambia both require you to approve each renewal yourself, so:

Tap here to renew now: ${renewLink}

Don't want to renew? Cancel anytime from your billing page: ${cancelLink}

Thanks for using Lenga Maps.
The Lenga Maps team`
  return {
    to,
    subject: `Your Lenga Maps ${PLAN} plan renews in ${dayLabel}`,
    html: shell({
      preheader: `Approve your ${PLAN} renewal to keep your access going.`,
      heading:   `Your ${PLAN} plan renews in ${dayLabel}`,
      bodyHtml,
      ctaLabel:  'Renew now',
      ctaHref:   renewLink,
      footnote:  `Don't want to renew? Cancel anytime from your <a href="${cancelLink}" style="color:#1E5F8E;">billing page</a>.`,
    }),
    text,
  }
}
