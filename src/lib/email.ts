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

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.lengamaps.com').replace(/\/$/, '')
const LOGO_URL = `${APP_URL}/images/branding/logo.png`
// Channels map an email to a Resend API key + a verified sender address.
// Each channel's key is set in Vercel (and .env.local). An unset key causes
// the send to be skipped and logged, never thrown.
export type EmailChannel = 'account' | 'newsletter' | 'payments'

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
