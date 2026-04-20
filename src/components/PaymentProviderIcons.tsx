// Brand-inspired badges for MTN Mobile Money and Airtel Money.
// Rendered as inline SVG so they scale cleanly and don't require image assets.
// They are distinctive mark-ups (colour + wordmark) rather than exact logos.

export function MtnBadge({ size = 40 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 80 80"
      role="img"
      aria-label="MTN Mobile Money"
    >
      <rect x="0" y="0" width="80" height="80" rx="14" fill="#FFCC00" />
      <text
        x="40"
        y="51"
        textAnchor="middle"
        fontFamily="Inter, Helvetica, Arial, sans-serif"
        fontWeight={900}
        fontSize={28}
        fill="#0B1530"
        letterSpacing={-1}
      >
        MTN
      </text>
    </svg>
  )
}

export function AirtelBadge({ size = 40 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 80 80"
      role="img"
      aria-label="Airtel Money"
    >
      <rect x="0" y="0" width="80" height="80" rx="14" fill="#E40000" />
      <text
        x="40"
        y="51"
        textAnchor="middle"
        fontFamily="Inter, Helvetica, Arial, sans-serif"
        fontWeight={800}
        fontSize={22}
        fill="#FFFFFF"
        letterSpacing={-0.5}
      >
        airtel
      </text>
    </svg>
  )
}
