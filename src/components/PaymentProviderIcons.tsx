'use client'

/**
 * Payment brand marks — authentic logos only.
 *
 * Visa & Mastercard come from `react-svg-credit-card-payment-icons` —
 *   a well-maintained package of vendor-accurate brand SVGs.
 * MTN & Airtel come from official Wikimedia Commons SVG files served from
 *   /public/payment-logos. Use of these brand marks here is purely as
 *   trust signals indicating which networks are accepted at checkout
 *   (standard nominative use for payment acceptance).
 */

import {
  VisaFlatRoundedIcon,
  MastercardFlatRoundedIcon,
} from 'react-svg-credit-card-payment-icons'

interface BrandProps {
  /** Width in pixels. The aspect ratio is preserved for every logo. */
  size?: number
  className?: string
}

// ── Card brands ────────────────────────────────────────────────────────────
// Use the flatRounded variant — proper brand colours, soft corners, the
// look every premium checkout uses (Stripe, Paddle, Apple Pay).

export function VisaBadge({ size = 56, className = '' }: BrandProps) {
  return <VisaFlatRoundedIcon width={size} className={className} />
}

export function MastercardBadge({ size = 56, className = '' }: BrandProps) {
  return <MastercardFlatRoundedIcon width={size} className={className} />
}

// ── Mobile money brands ────────────────────────────────────────────────────
// Wikimedia SVG files. We render them in a tinted brand-coloured tile so
// they have the same visual weight as the card icons (which already come
// with a rounded card-shaped chrome). Without the tile MTN's "MTN" wordmark
// floats unanchored on white.

export function MtnBadge({ size = 56, className = '' }: BrandProps) {
  const h = Math.round(size * 0.66) // ~card aspect
  return (
    <span
      aria-label="MTN Mobile Money"
      role="img"
      className={`inline-flex items-center justify-center rounded-md ${className}`}
      style={{
        width: size,
        height: h,
        background: '#FFCB05', // MTN brand yellow
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/payment-logos/mtn.svg"
        alt=""
        width={Math.round(size * 0.7)}
        height={Math.round(h * 0.7)}
        style={{ objectFit: 'contain', display: 'block' }}
      />
    </span>
  )
}

export function AirtelBadge({ size = 56, className = '' }: BrandProps) {
  const h = Math.round(size * 0.66)
  return (
    <span
      aria-label="Airtel Money"
      role="img"
      className={`inline-flex items-center justify-center rounded-md bg-white ${className}`}
      style={{
        width: size,
        height: h,
        border: '1px solid #E6EAF0',
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/payment-logos/airtel.svg"
        alt=""
        width={Math.round(size * 0.78)}
        height={Math.round(h * 0.78)}
        style={{ objectFit: 'contain', display: 'block' }}
      />
    </span>
  )
}

/** Compact horizontal strip — small "we accept these" trust signal. */
export function PaymentBadgeRow({ size = 40, className = '' }: BrandProps) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <VisaBadge size={size} />
      <MastercardBadge size={size} />
      <MtnBadge size={size} />
      <AirtelBadge size={size} />
    </div>
  )
}
