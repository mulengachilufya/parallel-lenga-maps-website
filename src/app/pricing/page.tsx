'use client'

import Link from "next/link"
import TeamQuoteBuilder from "@/components/TeamQuoteBuilder"
import {
  BANK_FEES_NOTE, FREE_OFFERS, LICENCE_TERMS, PASSES, PASS_ORDER, PLANS, PLAN_CARD_UI,
  planCtaHref, type FreeOffer,
} from "@/lib/pricing"

// Individuals: the free plan next to the Individual pass (1, 6 or 12 months).
// Every number comes from src/lib/pricing.ts. Teams have no public price:
// the free team sits next to the quote builder, which is where the price
// would have been.

function FreeCard({ offer }: { offer: FreeOffer }) {
  return (
    <Link href={offer.href} className="plan-card" style={{ background: '#ffffff', border: '1px solid #d9d6cc' }}>
      <div className="plan-text" style={{ fontSize: '13px', fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
        {offer.name}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '3px', marginBottom: '1.25rem' }}>
        <span className="price-num plan-text" style={{ fontSize: '34px', lineHeight: 1.05, fontWeight: 400 }}>{offer.priceLabel}</span>
      </div>
      <p className="plan-muted" style={{ fontSize: '13px', margin: '0 0 1.25rem', lineHeight: 1.5 }}>{offer.tagline}</p>
      <div style={{ height: '0.5px', background: '#1a1a1a', opacity: 0.15, margin: '0 0 1rem' }} />
      <div className="plan-muted" style={{ fontSize: '11px', fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '0.6rem' }}>
        {offer.count}
      </div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, flex: 1 }}>
        {offer.items.map(d => (
          <li key={d} className="plan-text" style={{ fontSize: '12.5px', padding: '3px 0', display: 'flex', alignItems: 'flex-start', gap: '7px', lineHeight: 1.4 }}>
            <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#1E5F8E', flexShrink: 0, marginTop: '5px', display: 'inline-block' }} />
            {d}
          </li>
        ))}
      </ul>
      <div style={{ marginTop: 'auto', paddingTop: '1.25rem' }}>
        <div style={{ width: '100%', padding: '10px 0', borderRadius: '10px', fontSize: '13px', fontWeight: 500, background: '#0D2B45', color: '#fff', textAlign: 'center' }}>
          {offer.cta}
        </div>
      </div>
    </Link>
  )
}

export default function PricingPage() {
  const pass = PLANS.individual
  const ui = PLAN_CARD_UI.individual

  return (
    <>
      <style>{`
        .term-foot { margin: 10px 0 0; font-size: 12px; color: #9fb0c0; }
        .term-strip { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin-top: 14px; }
        .term-cell { text-decoration: none; display: flex; flex-direction: column; gap: 2px; padding: 12px 14px; border-radius: 12px; background: rgba(255,255,255,0.05); border: 1px solid rgba(175,169,236,0.35); transition: border-color 0.15s ease, background 0.15s ease; }
        .term-cell:hover { border-color: #C9C4F5; background: rgba(255,255,255,0.09); }
        .term-label { font-size: 12px; color: #D9D5FA; }
        .term-price { font-size: 22px; color: #fff; font-weight: 500; }
        .term-note { font-size: 12px; color: #F5B800; min-height: 16px; }
        .group-note { margin: 14px 0 0; font-size: 12.5px; line-height: 1.55; color: #b8c2cc; }
        @media (max-width: 640px) { .term-strip { grid-template-columns: 1fr; } }
        .plan-card {
          text-decoration: none;
          display: flex;
          flex-direction: column;
          min-height: 400px;
          border-radius: 16px;
          padding: 1.5rem 1.25rem 1.75rem;
          transition: transform 0.18s ease, filter 0.18s ease, box-shadow 0.18s ease;
          cursor: pointer;
        }
        .plan-card:hover {
          transform: translateY(-6px) scale(1.01);
          filter: brightness(1.03);
          box-shadow: 0 12px 32px rgba(0,0,0,0.12);
        }
        .plan-card:active {
          transform: scale(0.97);
          filter: brightness(0.97);
        }
        .plan-text { color: #1a1a1a !important; }
        .plan-muted { color: #444 !important; }
        .plan-groups { display: grid; grid-template-columns: minmax(0, 1fr); gap: 20px; max-width: 1180px; margin: 0 auto; }
        .plan-group { border-radius: 20px; padding: 16px; }
        .plan-group-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; margin: 2px 4px 14px; flex-wrap: wrap; }
        .ind-grid  { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
        .team-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.9fr); gap: 14px; align-items: start; }
        @media (max-width: 900px) { .team-grid { grid-template-columns: 1fr; } }
        @media (max-width: 700px) {
          .ind-grid { grid-template-columns: 1fr !important; gap: 14px !important; }
          .plan-card { min-height: 380px !important; }
          .price-num { font-size: 36px !important; }
        }
      `}</style>

      <div style={{ padding: '6.5rem 1rem 3rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <h1 style={{ fontSize: '36px', fontWeight: 400, margin: '0 0 0.5rem', lineHeight: 1.1, color: '#ffffff' }}>
            Simple, honest pricing
          </h1>
          <p style={{ fontSize: '15px', color: '#b8c2cc', margin: 0 }}>
            Start free with 3 datasets of your choice. Get a pass for everything, or tell us what your team needs. Nothing renews automatically.
          </p>
        </div>

        <div className="plan-groups">

          {/* ── For individuals ───────────────────────────────────── */}
          <section className="plan-group" style={{ background: 'rgba(83,74,183,0.10)', border: '1px solid rgba(175,169,236,0.35)' }}>
            <div className="plan-group-head">
              <h2 style={{ fontSize: '20px', fontWeight: 700, margin: 0, color: '#C9C4F5' }}>For individuals</h2>
              <span style={{ fontSize: '12.5px', color: '#9fb0c0' }}>One person, your own downloads</span>
            </div>
            <div className="ind-grid">
              <FreeCard offer={FREE_OFFERS.individual} />
              <Link
                href={planCtaHref('individual')}
                className="plan-card"
                style={{ background: ui.bg, border: `1px solid ${ui.border}` }}
              >
                <div className="plan-text" style={{ fontSize: '13px', fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: ui.nameColor, marginBottom: '0.5rem' }}>
                  {pass.name} pass
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '3px', marginBottom: '1.25rem' }}>
                  <span className="price-num" style={{ fontSize: '30px', lineHeight: 1.05, color: ui.priceColor, fontWeight: 400 }}>{pass.priceLabel}</span>
                </div>
                <p className="plan-muted" style={{ fontSize: '13px', margin: '0 0 1.25rem', lineHeight: 1.5 }}>{ui.tagline}</p>
                <div style={{ height: '0.5px', background: ui.dividerColor, opacity: 0.2, margin: '0 0 1rem' }} />
                <div className="plan-muted" style={{ fontSize: '11px', fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '0.6rem' }}>
                  {ui.count}
                </div>
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, flex: 1 }}>
                  {ui.datasets.map(d => (
                    <li key={d} className="plan-text" style={{ fontSize: '12.5px', padding: '3px 0', display: 'flex', alignItems: 'flex-start', gap: '7px', lineHeight: 1.4 }}>
                      <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: ui.dotColor, flexShrink: 0, marginTop: '5px', display: 'inline-block' }} />
                      {d}
                    </li>
                  ))}
                </ul>
                <div style={{ marginTop: 'auto', paddingTop: '1.25rem' }}>
                  <div style={{ width: '100%', padding: '10px 0', borderRadius: '10px', fontSize: '13px', fontWeight: 500, background: ui.btnBg, color: '#fff', textAlign: 'center' }}>
                    {pass.ctaLabel}
                  </div>
                </div>
              </Link>
            </div>

            <div className="term-strip">
              {PASS_ORDER.map((id) => (
                <Link key={id} href={`/dashboard/payment?plan=individual&product=${id}`} className="term-cell">
                  <span className="term-label">{PASSES[id].label}</span>
                  <span className="term-price">${PASSES[id].price}</span>
                  <span className="term-note">{PASSES[id].note ?? 'Pay month to month'}</span>
                </Link>
              ))}
            </div>
            <p className="group-note">
              When a pass ends you drop back to the free plan: your 3 free datasets stay yours. {LICENCE_TERMS}
            </p>
          </section>

          {/* ── For teams: the quote builder sits where the price would be ── */}
          <section className="plan-group" style={{ background: 'rgba(245,184,0,0.06)', border: '1px solid rgba(245,184,0,0.35)' }}>
            <div className="plan-group-head">
              <h2 style={{ fontSize: '20px', fontWeight: 700, margin: 0, color: '#F5B800' }}>For teams</h2>
              <span style={{ fontSize: '12.5px', color: '#9fb0c0' }}>Shared workspace, seats for your whole team</span>
            </div>
            <div className="team-grid">
              <FreeCard offer={FREE_OFFERS.team} />
              <TeamQuoteBuilder tone="dark" />
            </div>
          </section>
        </div>

        <div style={{ maxWidth: '640px', margin: '2rem auto 0', textAlign: 'center' }}>
          <p style={{ fontSize: '13px', color: '#9fb0c0', margin: 0 }}>
            Pay by bank transfer. We activate your account within 24 hours of payment. {BANK_FEES_NOTE}
          </p>
          <p style={{ fontSize: '13px', color: '#9fb0c0', margin: '0.6rem 0 0' }}>
            Sector packs (carbon and MRV, mining and more) are quoted separately. <Link href="/contact-us" style={{ color: '#F5B800' }}>Ask us</Link>.
          </p>
        </div>
      </div>
    </>
  )
}
