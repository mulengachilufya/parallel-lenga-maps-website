// Polished, brand-inspired payment badges rendered as inline SVG so they
// scale cleanly and need no image assets. Each has a subtle gloss gradient
// for a "shiny" finish. These are distinctive marks (colour + wordmark /
// iconic shape) rather than pixel-exact trademarked logos.

interface BadgeProps {
  size?: number
  /** Rounded-square corner radius as a fraction of size. */
  radius?: number
}

/** Shared gloss overlay — a soft top-light sheen. */
function Gloss({ id }: { id: string }) {
  return (
    <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor="#ffffff" stopOpacity="0.35" />
      <stop offset="45%" stopColor="#ffffff" stopOpacity="0.05" />
      <stop offset="100%" stopColor="#000000" stopOpacity="0.08" />
    </linearGradient>
  )
}

export function MtnBadge({ size = 44 }: BadgeProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size}
      viewBox="0 0 80 80" role="img" aria-label="MTN Mobile Money">
      <defs><Gloss id="mtnGloss" /></defs>
      <rect x="0" y="0" width="80" height="80" rx="16" fill="#FFCB05" />
      {/* MTN's signature blue oval mark */}
      <ellipse cx="40" cy="40" rx="30" ry="20" fill="none" stroke="#00549F" strokeWidth="3.5" />
      <text x="40" y="47" textAnchor="middle"
        fontFamily="Inter, Helvetica, Arial, sans-serif" fontWeight={900}
        fontSize={22} fill="#00549F" letterSpacing={-1}>MTN</text>
      <rect x="0" y="0" width="80" height="80" rx="16" fill="url(#mtnGloss)" />
    </svg>
  )
}

export function AirtelBadge({ size = 44 }: BadgeProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size}
      viewBox="0 0 80 80" role="img" aria-label="Airtel Money">
      <defs>
        <Gloss id="airtelGloss" />
        <linearGradient id="airtelRed" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FF1A1A" />
          <stop offset="100%" stopColor="#C40000" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="80" height="80" rx="16" fill="url(#airtelRed)" />
      {/* Airtel's swoosh curl */}
      <path d="M22 52 A20 20 0 1 1 58 40 A12 12 0 1 0 40 51"
        fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" />
      <rect x="0" y="0" width="80" height="80" rx="16" fill="url(#airtelGloss)" />
    </svg>
  )
}

export function VisaBadge({ size = 44 }: BadgeProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size}
      viewBox="0 0 80 80" role="img" aria-label="Visa">
      <defs><Gloss id="visaGloss" /></defs>
      <rect x="0" y="0" width="80" height="80" rx="16" fill="#ffffff" stroke="#E6EAF0" strokeWidth="1.5" />
      <rect x="0" y="0" width="80" height="22" rx="16" fill="#1A1F71" />
      <rect x="0" y="58" width="80" height="22" rx="16" fill="#F7B600" />
      <rect x="0" y="14" width="80" height="52" fill="#ffffff" />
      <text x="40" y="50" textAnchor="middle"
        fontFamily="Georgia, 'Times New Roman', serif" fontStyle="italic"
        fontWeight={700} fontSize={26} fill="#1A1F71" letterSpacing={0.5}>VISA</text>
      <rect x="0" y="0" width="80" height="80" rx="16" fill="url(#visaGloss)" />
    </svg>
  )
}

export function MastercardBadge({ size = 44 }: BadgeProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size}
      viewBox="0 0 80 80" role="img" aria-label="Mastercard">
      <defs><Gloss id="mcGloss" /></defs>
      <rect x="0" y="0" width="80" height="80" rx="16" fill="#fff" stroke="#E6EAF0" strokeWidth="1.5" />
      {/* Iconic overlapping circles */}
      <circle cx="32" cy="40" r="18" fill="#EB001B" />
      <circle cx="48" cy="40" r="18" fill="#F79E1B" />
      <path d="M40 26 a18 18 0 0 1 0 28 a18 18 0 0 1 0 -28" fill="#FF5F00" />
      <rect x="0" y="0" width="80" height="80" rx="16" fill="url(#mcGloss)" />
    </svg>
  )
}

/** Horizontal row of all four provider badges. */
export function PaymentBadgeRow({ size = 36 }: BadgeProps) {
  return (
    <div className="flex items-center gap-2">
      <MtnBadge size={size} />
      <AirtelBadge size={size} />
      <VisaBadge size={size} />
      <MastercardBadge size={size} />
    </div>
  )
}
