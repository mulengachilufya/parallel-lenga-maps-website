/**
 * Funnel analytics helper.
 *
 * Thin typed wrapper around @vercel/analytics' `track()`. Keeps event names
 * spelled correctly in one place so a typo in one component doesn't split a
 * funnel into two. If the tracker fails to load (ad-blocker, SSR, etc.) we
 * swallow the error — analytics is never load-bearing.
 *
 * Names follow `<surface>_<verb>` so the funnel reads top-to-bottom in a
 * dashboard: signup_started → trial_started → paywall_shown →
 * paywall_cta_clicked → payment_initiated → payment_succeeded →
 * dataset_downloaded.
 */
import { track as vercelTrack } from '@vercel/analytics'

export type FunnelEvent =
  | 'signup_started'
  | 'trial_started'
  | 'paywall_shown'
  | 'paywall_cta_clicked'
  | 'payment_initiated'
  | 'payment_succeeded'
  | 'dataset_downloaded'
  | 'continental_bundle_requested'
  | 'continental_bundle_gated'
  | 'continental_bundle_upgrade_clicked'

export function track(event: FunnelEvent, props?: Record<string, string | number | boolean | null>): void {
  try {
    // Vercel's track() is happy with undefined props; we strip nulls just
    // to keep the dashboard tidy.
    const clean = props
      ? Object.fromEntries(Object.entries(props).filter(([, v]) => v !== null && v !== undefined))
      : undefined
    vercelTrack(event, clean as Record<string, string | number | boolean> | undefined)
  } catch { /* analytics is best-effort */ }
}
