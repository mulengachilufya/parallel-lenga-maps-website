import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { randomUUID } from 'crypto'
import { createServerSupabase } from '@/lib/supabase-server'
import { getDownloadUrl } from '@/lib/r2'
import { PLANS, type TierSlug } from '@/lib/pricing'

const service = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.CLOUDFLARE_R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId:     process.env.CLOUDFLARE_R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY!,
  },
})
const BUCKET = process.env.CLOUDFLARE_R2_BUCKET_NAME!

const MAX_SCREENSHOT_BYTES  = 5 * 1024 * 1024
const ALLOWED_MIME          = new Set(['image/jpeg','image/png','image/webp','image/heic','image/heif'])
const RATE_LIMIT_WINDOW_MIN = 60
const RATE_LIMIT_MAX_PENDING = 3

type Region = 'zambian' | 'international'
type Method = 'mtn' | 'airtel'

function extFromMime(mime: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg', 'image/png': 'png',
    'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif',
  }
  return map[mime] ?? 'bin'
}


async function notifyEmail(args: {
  reference:     string
  region:        Region
  method:        Method
  plan:          TierSlug
  amountLabel:   string
  userEmail:     string
  userName:      string
  countryName:   string
  senderPhone:   string
  senderName:    string
  txnRef:        string
  screenshotUrl: string
  submittedAt:   string
}): Promise<{ ok: boolean; error?: string; status?: number }> {
  const accessKey =
    process.env.NEXT_PUBLIC_WEB3FORMS_KEY_ADMIN ??
    process.env.NEXT_PUBLIC_WEB3FORMS_KEY
  if (!accessKey) {
    console.error('[ManualPayment] no Web3Forms key — email NOT sent.')
    return { ok: false, error: 'web3forms_key_missing' }
  }

  const lines = [
    `Reference: ${args.reference}`,
    `Region:    ${args.region}${args.countryName ? ` (${args.countryName})` : ''}`,
    `Method:    ${args.method.toUpperCase()}`,
    `Plan:      ${args.plan}`,
    `Amount:    ${args.amountLabel}`,
    '',
    `User:      ${args.userName || '(no name)'} <${args.userEmail}>`,
    `Sender:    ${args.senderName || '(not provided)'}`,
    `Phone:     ${args.senderPhone || '(not provided)'}`,
    `Txn ref:   ${args.txnRef || '(not provided)'}`,
    '',
    `Submitted: ${args.submittedAt}`,
    `Screenshot (valid 7 days): ${args.screenshotUrl}`,
    '',
    `Approve at: https://www.lengamaps.com/admin/payments`,
  ].join('\n')

  try {
    const res = await fetch('https://api.web3forms.com/submit', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        access_key: accessKey,
        from_name:  'Lenga Maps Payments',
        name:       args.userName || args.userEmail,
        email:      args.userEmail,
        subject:    `[Lenga Maps] New payment ${args.reference} — ${args.amountLabel} (${args.plan})`,
        message:    lines,
        botcheck:   '',
      }),
    })
    const body = await res.json().catch(() => ({} as { success?: boolean; message?: string }))
    if (!res.ok || !body.success) {
      console.error('[ManualPayment] web3forms rejected:', res.status, body)
      return { ok: false, status: res.status, error: body.message || `http_${res.status}` }
    }
    return { ok: true, status: res.status }
  } catch (err) {
    console.error('[ManualPayment] email notify network error:', err)
    return { ok: false, error: String(err) }
  }
}

async function notifyWhatsApp(message: string) {
  const phone  = process.env.CALLMEBOT_WHATSAPP_PHONE
  const apiKey = process.env.CALLMEBOT_WHATSAPP_APIKEY
  if (!phone || !apiKey) return
  const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(phone)}&text=${encodeURIComponent(message)}&apikey=${encodeURIComponent(apiKey)}`
  try { await fetch(url) } catch (err) { console.error('[ManualPayment] whatsapp failed:', err) }
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabase()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 })
  }
  const userId    = session.user.id
  const userEmail = session.user.email || ''

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Expected multipart/form-data.' }, { status: 400 })
  }

  const plan        = String(form.get('plan') || '') as TierSlug
  const region      = String(form.get('region') || '') as Region
  const method      = String(form.get('payment_method') || '') as Method
  const countryName = String(form.get('country_name') || '').slice(0, 120)
  const senderPhone = String(form.get('sender_phone') || '').slice(0, 40)
  const senderNameRaw = String(form.get('sender_name') || '').slice(0, 255)
  const txnRef      = String(form.get('txn_reference') || '').slice(0, 120)
  const screenshot  = form.get('screenshot')

  if (!['starter','pro','max','enterprise'].includes(plan))
    return NextResponse.json({ error: 'Invalid plan.' }, { status: 400 })
  if (!['zambian','international'].includes(region))
    return NextResponse.json({ error: 'Invalid region.' }, { status: 400 })
  if (!['mtn','airtel'].includes(method))
    return NextResponse.json({ error: 'Invalid payment method.' }, { status: 400 })
  if (!(screenshot instanceof File))
    return NextResponse.json({ error: 'Screenshot is required.' }, { status: 400 })
  if (screenshot.size === 0)
    return NextResponse.json({ error: 'Screenshot is empty.' }, { status: 400 })
  if (screenshot.size > MAX_SCREENSHOT_BYTES)
    return NextResponse.json({ error: 'Screenshot must be ≤ 5 MB.' }, { status: 400 })
  if (!ALLOWED_MIME.has(screenshot.type))
    return NextResponse.json({ error: 'Screenshot must be JPG, PNG, WEBP, or HEIC.' }, { status: 400 })

  // Pricing from source of truth — ignore any client-sent amount
  const planData = PLANS[plan]
  if (!planData)
    return NextResponse.json({ error: `Unknown plan: ${plan}` }, { status: 400 })

  const amount_usd  = planData.price
  const amountLabel = `$${amount_usd} USD`

  // Rate limit
  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MIN * 60_000).toISOString()
  const { count: pendingCount } = await service
    .from('manual_payments')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'pending')
    .gte('submitted_at', windowStart)
  if ((pendingCount ?? 0) >= RATE_LIMIT_MAX_PENDING) {
    return NextResponse.json(
      { error: `You already have ${pendingCount} pending submissions. Please wait for verification.` },
      { status: 429 }
    )
  }

  // Profile name
  let profileName = senderNameRaw
  if (!profileName) {
    const { data: prof } = await service
      .from('profiles').select('full_name').eq('id', userId).single()
    profileName = prof?.full_name || session.user.user_metadata?.full_name || ''
  }

  // Upload screenshot to R2
  const reference    = `mp-${randomUUID().replace(/-/g,'').slice(0,16)}`
  const ext          = extFromMime(screenshot.type)
  const screenshotKey = `payment-screenshots/${userId}/${reference}.${ext}`

  try {
    const bytes = Buffer.from(await screenshot.arrayBuffer())
    await r2.send(new PutObjectCommand({
      Bucket:      BUCKET,
      Key:         screenshotKey,
      Body:        bytes,
      ContentType: screenshot.type,
    }))
  } catch (err) {
    console.error('[ManualPayment] R2 upload failed:', err)
    return NextResponse.json({ error: 'Could not store screenshot. Try again.' }, { status: 500 })
  }

  // Insert DB row
  const submittedAt = new Date().toISOString()
  const { error: dbErr } = await service.from('manual_payments').insert({
    user_id:        userId,
    user_email:     userEmail,
    user_name:      profileName || null,
    reference,
    region,
    country_name:   countryName || null,
    plan,
    amount_usd,
    currency:       'USD',
    payment_method: method,
    sender_phone:   senderPhone || null,
    sender_name:    profileName || null,
    txn_reference:  txnRef || null,
    screenshot_key: screenshotKey,
    status:         'pending',
    submitted_at:   submittedAt,
  })
  if (dbErr) {
    console.error('[ManualPayment] DB insert failed:', dbErr)
    return NextResponse.json({ error: 'Could not record submission.' }, { status: 500 })
  }

  // Record the requested plan as pending — do NOT overwrite the user's
  // current `plan` or `plan_status`. A Pro user submitting payment for Max
  // must keep Pro access until admin verifies. Admin verify route promotes
  // pending_plan → plan atomically.
  const { error: profileErr } = await service
    .from('profiles')
    .update({ pending_plan: plan })
    .eq('id', userId)
  if (profileErr) {
    console.error('[ManualPayment] profile update failed:', profileErr)
  }

  // Notifications
  let screenshotUrl = ''
  try { screenshotUrl = await getDownloadUrl(screenshotKey, 7 * 24 * 3600) } catch { /* non-fatal */ }

  const notifyArgs = {
    reference, region, method, plan, amountLabel,
    userEmail, userName: profileName,
    countryName, senderPhone, senderName: profileName, txnRef,
    screenshotUrl, submittedAt,
  }

  const results = await Promise.allSettled([
    notifyEmail(notifyArgs),
    notifyWhatsApp(
      `Lenga Maps payment ${reference}\n${amountLabel} via ${method.toUpperCase()} — ${plan}\n${profileName || userEmail}\n${screenshotUrl ? `Screenshot: ${screenshotUrl}` : ''}`
    ),
  ])
  console.log('[ManualPayment] notifications', { whatsapp: results[1].status })

  return NextResponse.json({ reference, submitted_at: submittedAt })
}