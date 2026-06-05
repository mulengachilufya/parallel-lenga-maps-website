'use client'

import Link from "next/link"
import { PLANS, PLAN_ORDER, PLAN_CARD_UI, type TierSlug } from "@/lib/pricing"

const CTA: Record<TierSlug, string> = {
  starter: 'Get started', pro: 'Get started', max: 'Get started', enterprise: 'Contact us',
}

const plans = PLAN_ORDER.map((slug) => ({
  id:    slug,
  name:  PLANS[slug].name,
  price: PLANS[slug].priceLabel,
  cta:   CTA[slug],
  ...PLAN_CARD_UI[slug],
}))

export default function PricingPage() {
  return (
    <>
      <style>{`
        .plan-card {
          text-decoration: none;
          display: flex;
          flex-direction: column;
          min-height: 440px;
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
        @media (max-width: 700px) {
          .pricing-grid { grid-template-columns: 1fr 1fr !important; gap: 10px !important; }
          .plan-card { min-height: 380px !important; }
          .price-num { font-size: 36px !important; }
        }
        @media (max-width: 420px) {
          .pricing-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>

      <div style={{ padding: '2.5rem 1rem 3rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <h1 style={{ fontSize: '36px', fontWeight: 400, margin: '0 0 0.5rem', lineHeight: 1.1, color: '#1a1a1a' }}>
            Simple, honest pricing
          </h1>
          <p style={{ fontSize: '15px', color: '#555', margin: 0 }}>
            All plans cover all 54 African countries. Billed monthly in USD.
          </p>
        </div>

        <div className="pricing-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '14px', maxWidth: '960px', margin: '0 auto' }}>
          {plans.map(p => (
            <Link
              key={p.id}
              href="/signup"
              className="plan-card"
              style={{ background: p.bg, border: `1px solid ${p.border}` }}
            >
              <div className="plan-text" style={{ fontSize: '13px', fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: p.nameColor, marginBottom: '0.5rem' }}>
                {p.name}
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '3px', marginBottom: '1.25rem' }}>
                <span className="price-num" style={{ fontSize: '48px', lineHeight: 1, color: p.priceColor, fontWeight: 400 }}>{p.price}</span>
                <span className="plan-muted" style={{ fontSize: '13px' }}>/month</span>
              </div>
              <p className="plan-muted" style={{ fontSize: '13px', margin: '0 0 1.25rem', lineHeight: 1.5 }}>{p.tagline}</p>
              <div style={{ height: '0.5px', background: p.dividerColor, opacity: 0.2, margin: '0 0 1rem' }} />
              <div className="plan-muted" style={{ fontSize: '11px', fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '0.6rem' }}>
                {p.count}
              </div>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, flex: 1 }}>
                {p.datasets.map(d => (
                  <li key={d} className="plan-text" style={{ fontSize: '12.5px', padding: '3px 0', display: 'flex', alignItems: 'flex-start', gap: '7px', lineHeight: 1.4 }}>
                    <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: p.dotColor, flexShrink: 0, marginTop: '5px', display: 'inline-block' }} />
                    {d}
                  </li>
                ))}
              </ul>
              <div style={{ marginTop: 'auto', paddingTop: '1.25rem' }}>
                <div style={{ width: '100%', padding: '10px 0', borderRadius: '10px', fontSize: '13px', fontWeight: 500, background: p.btnBg, color: '#fff', textAlign: 'center' }}>
                  {p.cta}
                </div>
              </div>
            </Link>
          ))}
        </div>

        <div style={{ maxWidth: '960px', margin: '2rem auto 0', background: '#EEEDFE', border: '1px solid #AFA9EC', borderRadius: '14px', padding: '1.25rem 2rem', textAlign: 'center' }}>
          <p style={{ fontSize: '18px', fontWeight: 500, color: '#26215C', margin: '0 0 0.25rem' }}>Every new account gets a free 3-day trial</p>
          <p style={{ fontSize: '15px', color: '#534AB7', margin: 0 }}>Full Max access — no card required.</p>
        </div>
      </div>
    </>
  )
}