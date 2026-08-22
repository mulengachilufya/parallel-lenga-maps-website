'use client'

import Link from "next/link"
import { useEffect, useState } from "react"
import { PLANS, PLAN_CARD_UI, PLAN_ORDER, planCtaHref } from "@/lib/pricing"

// Both plans send buyers to their planCtaHref (see pricing.ts): individual
// -> /dashboard/payment (self-serve bank transfer, fastest path), team ->
// /projects (quote-based, seats need negotiating).

export default function PricingPage() {
  const cards = PLAN_ORDER.map((slug) => ({
    id: slug,
    plan: PLANS[slug],
    ui: PLAN_CARD_UI[slug],
  }))

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
          .pricing-grid { grid-template-columns: 1fr !important; gap: 14px !important; }
          .plan-card { min-height: 380px !important; }
          .price-num { font-size: 36px !important; }
        }
      `}</style>

      <div style={{ padding: '2.5rem 1rem 3rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <h1 style={{ fontSize: '36px', fontWeight: 400, margin: '0 0 0.5rem', lineHeight: 1.1, color: '#1a1a1a' }}>
            Simple, honest pricing
          </h1>
          <p style={{ fontSize: '15px', color: '#555', margin: 0 }}>
            One-time payment. Every dataset, every one of 54 African countries, no expiry.
          </p>
        </div>

        <div className="pricing-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '14px', maxWidth: '640px', margin: '0 auto' }}>
          {cards.map(({ id, plan, ui }) => {
            const isTeam = id === 'team'
            return (
              <Link
                key={id}
                href={planCtaHref(id)}
                className="plan-card"
                style={{ background: ui.bg, border: `1px solid ${ui.border}` }}
              >
                <div className={isTeam ? undefined : 'plan-text'} style={{ fontSize: '13px', fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: ui.nameColor, marginBottom: '0.5rem' }}>
                  {plan.name}
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '3px', marginBottom: '1.25rem' }}>
                  <span className="price-num" style={{ fontSize: '40px', lineHeight: 1, color: ui.priceColor, fontWeight: 400 }}>{plan.priceLabel}</span>
                </div>
                <p className={isTeam ? undefined : 'plan-muted'} style={{ fontSize: '13px', margin: '0 0 1.25rem', lineHeight: 1.5, color: isTeam ? '#BFD7EA' : undefined }}>{ui.tagline}</p>
                <div style={{ height: '0.5px', background: ui.dividerColor, opacity: 0.2, margin: '0 0 1rem' }} />
                <div className={isTeam ? undefined : 'plan-muted'} style={{ fontSize: '11px', fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '0.6rem', color: isTeam ? '#BFD7EA' : undefined }}>
                  {ui.count}
                </div>
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, flex: 1 }}>
                  {ui.datasets.map(d => (
                    <li key={d} className={isTeam ? undefined : 'plan-text'} style={{ fontSize: '12.5px', padding: '3px 0', display: 'flex', alignItems: 'flex-start', gap: '7px', lineHeight: 1.4, color: isTeam ? '#E8F1F8' : undefined }}>
                      <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: ui.dotColor, flexShrink: 0, marginTop: '5px', display: 'inline-block' }} />
                      {d}
                    </li>
                  ))}
                </ul>
                <div style={{ marginTop: 'auto', paddingTop: '1.25rem' }}>
                  <div style={{ width: '100%', padding: '10px 0', borderRadius: '10px', fontSize: '13px', fontWeight: 500, background: ui.btnBg, color: isTeam ? '#1a1200' : '#fff', textAlign: 'center' }}>
                    {plan.ctaLabel}
                  </div>
                </div>
              </Link>
            )
          })}
        </div>

        <div style={{ maxWidth: '640px', margin: '2rem auto 0', textAlign: 'center' }}>
          <p style={{ fontSize: '13px', color: '#666', margin: 0 }}>
            Pay by bank transfer. We activate your account within 24 hours of payment.
          </p>
        </div>
      </div>
    </>
  )
}