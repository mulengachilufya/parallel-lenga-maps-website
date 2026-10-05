'use client'

import { useState } from "react"
import Link from "next/link"
import SeatStepper from "@/components/SeatStepper"
import {
  BANK_FEES_NOTE, FREE_OFFERS, LICENCE_TERMS, PLANS, PLAN_CARD_UI, PLAN_ORDER, TEAM_MIN_SEATS, TEAM_TERMS, TEAM_TERM_ORDER,
  UPDATE_MONTHS, UPDATES_PRICE, planCtaHref, teamPrice, type FreeOffer,
} from "@/lib/pricing"

// Both plans send buyers to their planCtaHref (see pricing.ts): individual
// -> /dashboard/payment (self-serve bank transfer, fastest path), team ->
// /projects (quote-based, seats need negotiating). Each sits next to its
// free version (FREE_OFFERS): 3 chosen datasets, and for teams 2 seats.

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
  const [seats, setSeats] = useState(TEAM_MIN_SEATS)
  const cards = PLAN_ORDER.map((slug) => ({
    id: slug,
    plan: PLANS[slug],
    ui: PLAN_CARD_UI[slug],
  }))

  return (
    <>
      <style>{`
        .term-calc { margin-top: 14px; padding: 14px; border-radius: 14px; background: rgba(13,43,69,0.55); border: 1px solid rgba(245,184,0,0.25); }
        .term-calc-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; color: #fff; font-size: 15px; font-weight: 600; }
        .term-foot { margin: 10px 0 0; font-size: 12px; color: #9fb0c0; }
        .term-strip { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin-top: 12px; }
        .term-cell { display: flex; flex-direction: column; gap: 2px; padding: 12px 14px; border-radius: 12px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.12); }
        .term-label { font-size: 12px; color: #BFD7EA; display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; }
        .term-label em { font-style: normal; color: #F5B800; font-weight: 600; }
        .term-price { font-size: 22px; color: #fff; font-weight: 500; }
        .term-note { font-size: 12px; color: #F5B800; }
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
        .plan-groups { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; max-width: 1180px; margin: 0 auto; }
        .plan-group { border-radius: 20px; padding: 16px; }
        .plan-group-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; margin: 2px 4px 14px; }
        @media (max-width: 1020px) {
          .plan-groups { grid-template-columns: 1fr; max-width: 640px; }
        }
        @media (max-width: 700px) {
          .pricing-grid { grid-template-columns: 1fr !important; gap: 14px !important; }
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
            Start free with 3 datasets of your choice. Buy the whole catalogue once, or give your team a shared workspace. Nothing renews automatically.
          </p>
        </div>

        <div className="plan-groups">
        {cards.map(({ id, plan, ui }) => {
            const isTeam = id === 'team'
            return (
        <section key={id} className="plan-group" style={{
          background: isTeam ? 'rgba(245,184,0,0.06)' : 'rgba(83,74,183,0.10)',
          border: `1px solid ${isTeam ? 'rgba(245,184,0,0.35)' : 'rgba(175,169,236,0.35)'}`,
        }}>
          <div className="plan-group-head">
            <h2 style={{ fontSize: '20px', fontWeight: 700, margin: 0, color: isTeam ? '#F5B800' : '#C9C4F5' }}>
              {isTeam ? 'For teams' : 'For individuals'}
            </h2>
            <span style={{ fontSize: '12.5px', color: '#9fb0c0' }}>
              {isTeam ? 'Shared workspace, seats for your whole team' : 'One person, your own downloads'}
            </span>
          </div>
        <div className="pricing-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '14px' }}>
              <FreeCard offer={FREE_OFFERS[id]} />
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
                  <span className="price-num" style={{ fontSize: '30px', lineHeight: 1.05, color: ui.priceColor, fontWeight: 400 }}>{plan.priceLabel}</span>
                </div>
                <p className={isTeam ? undefined : 'plan-muted'} style={{ fontSize: '13px', margin: '0 0 1.25rem', lineHeight: 1.5, color: isTeam ? '#BFD7EA' : undefined }}>{ui.tagline}</p>
                <div style={{ height: '0.5px', background: ui.dividerColor, opacity: 0.2, margin: '0 0 1rem' }} />
                {isTeam ? (
                  <div style={{ fontSize: '17px', fontWeight: 700, marginBottom: '0.6rem', color: '#F5B800' }}>{ui.count}</div>
                ) : (
                  <div className="plan-muted" style={{ fontSize: '11px', fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '0.6rem' }}>
                    {ui.count}
                  </div>
                )}
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
        </div>
        {isTeam ? (
          <div className="term-calc">
            <div className="term-calc-head">
              <span>Team price for</span>
              <SeatStepper seats={seats} onChange={setSeats} dark />
            </div>
            <div className="term-strip">
              {TEAM_TERM_ORDER.map((t) => {
                const price = teamPrice(seats, t)
                const saved = teamPrice(seats, 'month') * TEAM_TERMS[t].months - price
                return (
                  <div key={t} className="term-cell">
                    <span className="term-label">{TEAM_TERMS[t].label}{TEAM_TERMS[t].saving && <em>{TEAM_TERMS[t].saving}</em>}</span>
                    <span className="term-price">${price.toLocaleString()}</span>
                    <span className="term-note">{saved > 0 ? `You save $${saved.toLocaleString()}` : `${TEAM_TERMS[t].per}`}</span>
                  </div>
                )
              })}
            </div>
            <p className="term-foot">{TEAM_MIN_SEATS} seats included. Each extra seat: +${TEAM_TERMS.month.extraSeat} a month, +${TEAM_TERMS.quarter.extraSeat} for 3 months, +${TEAM_TERMS.year.extraSeat} a year.</p>
          </div>
        ) : (
          <p className="group-note">
            After {UPDATE_MONTHS} months, add {UPDATE_MONTHS} more months of new datasets for ${UPDATES_PRICE}. What you have stays yours either way. {LICENCE_TERMS}
          </p>
        )}
        </section>
            )
          })}
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