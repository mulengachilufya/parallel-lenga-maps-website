'use client'

/**
 * MobileMoneyManualPanel - pay by Airtel Money or MTN MoMo yourself, then
 * tell us. No integration: you send the money to our number from your own
 * phone, then upload a screenshot of the confirmation from inside your
 * account. A person checks it and switches your pass on (usually within a
 * few hours). Sits next to the bank transfer option (BankTransferPanel).
 *
 *   POST /api/payments/manual  (payment_method = 'airtel' | 'mtn')
 */
import { useState } from 'react'
import { Check, Loader2, AlertCircle, Upload, Smartphone } from 'lucide-react'
import { CopyRow } from '@/components/BankTransferPanel'
import { MOBILE_MONEY_NUMBERS } from '@/lib/mobile-money-numbers'
import { LICENCE_TERMS, type PassProduct } from '@/lib/pricing'

type Network = 'airtel' | 'mtn'
const NAME: Record<Network, string> = { airtel: 'Airtel Money', mtn: 'MTN MoMo' }

export default function MobileMoneyManualPanel({ network, product, priceUsd, userEmail }: {
  network: Network; product: PassProduct; priceUsd: number; userEmail: string
}) {
  const number = MOBILE_MONEY_NUMBERS[network]
  const rate = MOBILE_MONEY_NUMBERS.zmwPerUsd
  const [region, setRegion] = useState<'zambian' | 'international'>('zambian')
  const [country, setCountry] = useState('')
  const [phone, setPhone] = useState('')
  const [txn, setTxn] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [reference, setReference] = useState('')
  const [done, setDone] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!phone.trim()) { setError('Enter the phone number you paid from.'); return }
    setBusy(true)
    try {
      const fd = new FormData()
      fd.append('plan', 'individual')
      fd.append('product', product)
      fd.append('payment_method', network)
      fd.append('region', region)
      if (region === 'international') fd.append('country_name', country)
      fd.append('sender_phone', phone)
      fd.append('txn_reference', txn)
      if (file) fd.append('screenshot', file)
      const res = await fetch('/api/payments/manual', { method: 'POST', body: fd })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setError(j.error ?? 'Could not send. Please try again.'); return }
      setReference(j.reference ?? ''); setDone(true)
    } catch {
      setError('Network error. Please try again.')
    } finally { setBusy(false) }
  }

  if (done) {
    return (
      <div className="text-center py-4">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-5">
          <Check size={32} className="text-green-600" />
        </div>
        <h2 className="text-2xl font-black text-navy tracking-tight mb-2">Thanks, we&apos;re on it</h2>
        <p className="text-gray-500 mb-1">We&apos;ll check your {NAME[network]} payment and switch on your pass, usually within a few hours.</p>
        {reference && <p className="text-sm text-gray-400">Reference: <span className="font-mono font-bold text-gray-600">{reference}</span></p>}
        <p className="mt-4 text-xs text-gray-400">We&apos;ll email <span className="font-medium text-gray-600">{userEmail}</span> the moment it&apos;s active.</p>
      </div>
    )
  }

  const field = 'w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:border-primary'
  return (
    <form onSubmit={submit}>
      <div className="flex items-start gap-3 bg-gray-50 border border-gray-200 rounded-xl p-4 mb-4">
        <Smartphone size={20} className="text-primary mt-0.5 shrink-0" />
        <p className="text-sm text-gray-600 leading-relaxed">
          Send <strong>${priceUsd} USD</strong>{rate ? <> (about <strong>K{Math.ceil(priceUsd * rate).toLocaleString()}</strong>)</> : ' in kwacha at today\u2019s rate'} to the {NAME[network]} number below,
          then upload a screenshot of the confirmation. We check it and switch on your pass.
        </p>
      </div>

      <div className="space-y-2 mb-5">
        <CopyRow label={`${NAME[network]} number`} value={number} />
        {MOBILE_MONEY_NUMBERS.accountName && <CopyRow label="Account name" value={MOBILE_MONEY_NUMBERS.accountName} />}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-semibold text-gray-500">Where are you sending from?
          <select value={region} onChange={(e) => setRegion(e.target.value as 'zambian' | 'international')} className={`${field} mt-1`}>
            <option value="zambian">A Zambian number</option>
            <option value="international">Another country</option>
          </select>
        </label>
        {region === 'international' && (
          <label className="block text-xs font-semibold text-gray-500">Country
            <input value={country} onChange={(e) => setCountry(e.target.value)} maxLength={120} className={`${field} mt-1`} placeholder="e.g. Malawi" />
          </label>
        )}
        <label className="block text-xs font-semibold text-gray-500">Phone you paid from *
          <input required value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={40} inputMode="tel" className={`${field} mt-1`} placeholder="0977 ..." />
        </label>
        <label className="block text-xs font-semibold text-gray-500">Transaction ID (optional)
          <input value={txn} onChange={(e) => setTxn(e.target.value)} maxLength={120} className={`${field} mt-1`} placeholder="From the confirmation SMS" />
        </label>
      </div>

      <label className="mt-3 flex items-center gap-3 cursor-pointer rounded-xl border border-dashed border-gray-300 px-4 py-3 text-sm text-gray-600 hover:border-primary">
        <Upload size={16} className="text-primary shrink-0" />
        <span className="truncate">{file ? file.name : 'Upload a screenshot of the confirmation (JPG, PNG, WEBP, HEIC, up to 5 MB)'}</span>
        <input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </label>

      {error && (
        <div className="mt-4 flex items-start gap-2 text-sm bg-red-50 text-red-700 rounded-xl p-3">
          <AlertCircle size={16} className="mt-0.5 shrink-0" /><span>{error}</span>
        </div>
      )}

      <button type="submit" disabled={busy}
        className="mt-5 w-full inline-flex items-center justify-center gap-2 bg-[#0D2B45] text-white font-bold text-sm py-3.5 rounded-xl disabled:opacity-60">
        {busy && <Loader2 size={16} className="animate-spin" />}
        {busy ? 'Sending…' : "I've paid, send for checking"}
      </button>
      <p className="mt-3 text-[11px] text-gray-400 text-center leading-relaxed">{LICENCE_TERMS}</p>
    </form>
  )
}
