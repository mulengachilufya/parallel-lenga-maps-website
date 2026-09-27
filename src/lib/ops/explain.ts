// src/lib/ops/explain.ts
//
// Plain-language explanations for the problem log. Each known code says
// what happened, who is affected, and what to do, in words for a founder,
// not an engineer. Unknown codes fall back to a generic explanation.

export interface Explanation { title: string; impact: string; fix: string }

const KNOWN: Record<string, Explanation> = {
  'email:send_failed': {
    title: 'An email could not be sent',
    impact: 'A customer may not have received a welcome, payment or notification email.',
    fix: 'Open Ops → Fix → "Send a test email". If every channel fails, the Resend account or its API key has a problem: log in to resend.com and check the domain is still verified and the key is active. Then update the key in Vercel → Settings → Environment Variables.',
  },
  'email:no_key': {
    title: 'An email channel has no key configured',
    impact: 'Emails on that channel are silently skipped.',
    fix: 'In Vercel → Settings → Environment Variables, add the missing RESEND_… key named in the details, then redeploy (Vercel → Deployments → ⋯ → Redeploy).',
  },
  'server:unhandled': {
    title: 'A page or action crashed',
    impact: 'Whoever triggered it saw an error. The details name the page.',
    fix: 'If it happens once, ignore it. If the count keeps rising, note the page named in the details and roll back to the last working version: Vercel → Deployments → pick the previous deployment → ⋯ → Promote to Production.',
  },
  'browser:error': {
    title: 'Something broke in a visitor\'s browser',
    impact: 'Part of a page may not have worked for that visitor.',
    fix: 'Usually harmless (old browsers, extensions). Worth a look only if the same message repeats many times.',
  },
  'payments:bank_details_failed': {
    title: 'A customer asked for bank details but the email failed',
    impact: 'That customer does not know how to pay you.',
    fix: 'Find them in Ops → Fix → "Look up a customer" and email them the bank details yourself from mulenga@lengamaps.com.',
  },
  'payments:proof_failed': {
    title: 'A proof-of-payment upload failed',
    impact: 'A paying customer may think they have paid but you have no record.',
    fix: 'Check Admin → Payments. If nothing is there, contact the customer and ask them to resend the proof by email.',
  },
  'jobs:lifecycle_failed': {
    title: 'The daily email and access job failed',
    impact: 'Expiry reminders may not have gone out, and expired plans may not have been switched off.',
    fix: 'Press Ops → Fix → "Run the daily job now". If it fails again, the problem log will show why.',
  },
  'jobs:lifecycle_missed': {
    title: 'The daily job has not run for over a day',
    impact: 'Reminders and access expiry are paused.',
    fix: 'Press Ops → Fix → "Run the daily job now". Check Vercel → Settings → Cron Jobs is enabled.',
  },
  'jobs:sales-digest_failed': {
    title: 'The morning sales list did not go out',
    impact: 'Nothing is lost. You may not have had today\'s list of follow-ups, and won teams were not checked for Acquired.',
    fix: 'Open Admin → Sales pipeline → Today. That tab always shows the same list. If this repeats, the problem log shows why.',
  },
  'email:sales_send_failed': {
    title: 'An outreach email could not be sent',
    impact: 'One prospect did not get your email. The pipeline shows it was not sent.',
    fix: 'Check that RESEND_SALES_API_KEY (or RESEND_MANUAL_PAYMENTS_API_KEY) is set in Vercel. Meanwhile send it from Gmail and log it with "Log activity".',
  },
  'workspace:commit_failed': {
    title: 'A project change was saved but not recorded in its history',
    impact: 'The change is live but its history entry is missing. No data lost.',
    fix: 'Nothing to do unless it repeats. If it does, send the details to your developer.',
  },
  'security:emergency_login': {
    title: 'Someone used an emergency key to open the ops console',
    impact: 'Full admin access was granted by key rather than by email sign-in.',
    fix: 'If this was you, nothing to do. If not, change the key immediately: Vercel → Settings → Environment Variables → OPS_EMERGENCY_KEY_HASHES, then redeploy.',
  },
  'security:emergency_failed': {
    title: 'Wrong emergency keys were tried',
    impact: 'Someone may be guessing. After 5 tries in an hour they are locked out.',
    fix: 'If this was not you and it keeps happening, rotate the keys (see Ops → Help).',
  },
  'health:check_failed': {
    title: 'A health check failed',
    impact: 'Part of the platform may not be working. The details name which part.',
    fix: 'Open Ops → Health: each failed check says exactly what to do.',
  },
}

export function explain(area: string, code: string): Explanation {
  return KNOWN[`${area}:${code}`] ?? {
    title: code.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()),
    impact: `Something in "${area}" reported a problem.`,
    fix: 'If it repeats, open the details and send them to your developer. The message is safe to share (no passwords or keys are stored).',
  }
}

export const AREA_LABEL: Record<string, string> = {
  email: 'Email', server: 'Website', browser: 'Visitors\' browsers', payments: 'Payments', jobs: 'Scheduled jobs',
  workspace: 'Team workspace', security: 'Security', health: 'Health checks', auth: 'Sign-in', storage: 'File storage',
}
