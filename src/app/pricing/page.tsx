'use client'

import Link from "next/link"

export default function PricingPage() {
  return (
    <div style={{ padding: '2.5rem 1rem 3rem', fontFamily: 'sans-serif' }}>
      <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
        <h1 style={{ fontSize: '36px', fontWeight: 400, margin: '0 0 0.5rem', lineHeight: 1.1 }}>
          Simple, honest pricing
        </h1>
        <p style={{ fontSize: '15px', color: '#6b7280', margin: 0 }}>
          All plans cover all 54 African countries. Billed monthly in USD.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '14px', maxWidth: '960px', margin: '0 auto' }}>

        <Link href="/signup" style={{ background: '#EAF3DE', border: '1px solid #97C459', borderRadius: '16px', padding: '1.5rem 1.25rem 1.75rem', textDecoration: 'none', display: 'flex', flexDirection: 'column', minHeight: '440px' }}>
          <div style={{ fontSize: '13px', fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#3B6D11', marginBottom: '0.5rem' }}>Starter</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '3px', marginBottom: '1.25rem' }}>
            <span style={{ fontSize: '48px', lineHeight: 1, color: '#27500A' }}>$5</span>
            <span style={{ fontSize: '13px', color: '#6b7280' }}>/month</span>
          </div>
          <p style={{ fontSize: '13px', color: '#6b7280', margin: '0 0 1.25rem', lineHeight: 1.5 }}>Core environmental layers to get you mapping.</p>
          <div style={{ height: '0.5px', background: '#3B6D11', opacity: 0.15, margin: '0 0 1rem' }} />
          <div style={{ fontSize: '11px', fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#6b7280', marginBottom: '0.6rem' }}>5 datasets</div>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, flex: 1 }}>
            {['Administrative Boundaries','Groundwater Aquifers','Drought Index (SPI-12)','Rainfall Data','Protected Areas & Wildlife'].map(d => (
              <li key={d} style={{ fontSize: '12.5px', padding: '3px 0', display: 'flex', alignItems: 'flex-start', gap: '7px', lineHeight: 1.4 }}>
                <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#3B6D11', flexShrink: 0, marginTop: '5px', display: 'inline-block' }} />{d}
              </li>
            ))}
          </ul>
          <div style={{ marginTop: 'auto', paddingTop: '1.25rem' }}>
            <div style={{ width: '100%', padding: '10px 0', borderRadius: '10px', fontSize: '13px', fontWeight: 500, background: '#639922', color: '#fff', textAlign: 'center' }}>Get started</div>
          </div>
        </Link>

        <Link href="/signup" style={{ background: '#E6F1FB', border: '1px solid #85B7EB', borderRadius: '16px', padding: '1.5rem 1.25rem 1.75rem', textDecoration: 'none', display: 'flex', flexDirection: 'column', minHeight: '440px' }}>
          <div style={{ fontSize: '13px', fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#185FA5', marginBottom: '0.5rem' }}>Pro</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '3px', marginBottom: '1.25rem' }}>
            <span style={{ fontSize: '48px', lineHeight: 1, color: '#0C447C' }}>$12</span>
            <span style={{ fontSize: '13px', color: '#6b7280' }}>/month</span>
          </div>
          <p style={{ fontSize: '13px', color: '#6b7280', margin: '0 0 1.25rem', lineHeight: 1.5 }}>Everything in Starter, plus hydrology and infrastructure.</p>
          <div style={{ height: '0.5px', background: '#185FA5', opacity: 0.15, margin: '0 0 1rem' }} />
          <div style={{ fontSize: '11px', fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#6b7280', marginBottom: '0.6rem' }}>9 datasets</div>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, flex: 1 }}>
            {['Everything in Starter','Watersheds & Catchments','Population & Settlements','River Networks','Roads & Infrastructure'].map(d => (
              <li key={d} style={{ fontSize: '12.5px', padding: '3px 0', display: 'flex', alignItems: 'flex-start', gap: '7px', lineHeight: 1.4 }}>
                <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#185FA5', flexShrink: 0, marginTop: '5px', display: 'inline-block' }} />{d}
              </li>
            ))}
          </ul>
          <div style={{ marginTop: 'auto', paddingTop: '1.25rem' }}>
            <div style={{ width: '100%', padding: '10px 0', borderRadius: '10px', fontSize: '13px', fontWeight: 500, background: '#185FA5', color: '#fff', textAlign: 'center' }}>Get started</div>
          </div>
        </Link>

        <Link href="/signup" style={{ background: '#EEEDFE', border: '1px solid #AFA9EC', borderRadius: '16px', padding: '1.5rem 1.25rem 1.75rem', textDecoration: 'none', display: 'flex', flexDirection: 'column', minHeight: '440px' }}>
          <div style={{ fontSize: '13px', fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#534AB7', marginBottom: '0.5rem' }}>Max</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '3px', marginBottom: '1.25rem' }}>
            <span style={{ fontSize: '48px', lineHeight: 1, color: '#3C3489' }}>$20</span>
            <span style={{ fontSize: '13px', color: '#6b7280' }}>/month</span>
          </div>
          <p style={{ fontSize: '13px', color: '#6b7280', margin: '0 0 1.25rem', lineHeight: 1.5 }}>The full platform — every layer we have.</p>
          <div style={{ height: '0.5px', background: '#534AB7', opacity: 0.15, margin: '0 0 1rem' }} />
          <div style={{ fontSize: '11px', fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#6b7280', marginBottom: '0.6rem' }}>15 datasets</div>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, flex: 1 }}>
            {['Everything in Pro','Temperature Data','HydroRIVERS','Land Use / Land Cover','Lakes','Soil Classification','Wetlands & Floodplains'].map(d => (
              <li key={d} style={{ fontSize: '12.5px', padding: '3px 0', display: 'flex', alignItems: 'flex-start', gap: '7px', lineHeight: 1.4 }}>
                <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#534AB7', flexShrink: 0, marginTop: '5px', display: 'inline-block' }} />{d}
              </li>
            ))}
          </ul>
          <div style={{ marginTop: 'auto', paddingTop: '1.25rem' }}>
            <div style={{ width: '100%', padding: '10px 0', borderRadius: '10px', fontSize: '13px', fontWeight: 500, background: '#534AB7', color: '#fff', textAlign: 'center' }}>Get started</div>
          </div>
        </Link>

        <Link href="/signup" style={{ background: '#FAEEDA', border: '1px solid #EF9F27', borderRadius: '16px', padding: '1.5rem 1.25rem 1.75rem', textDecoration: 'none', display: 'flex', flexDirection: 'column', minHeight: '440px' }}>
          <div style={{ fontSize: '13px', fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#854F0B', marginBottom: '0.5rem' }}>Enterprise</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '3px', marginBottom: '1.25rem' }}>
            <span style={{ fontSize: '48px', lineHeight: 1, color: '#633806' }}>$75</span>
            <span style={{ fontSize: '13px', color: '#6b7280' }}>/month</span>
          </div>
          <p style={{ fontSize: '13px', color: '#6b7280', margin: '0 0 1.25rem', lineHeight: 1.5 }}>Max, plus custom sub-country datasets and team access.</p>
          <div style={{ height: '0.5px', background: '#854F0B', opacity: 0.15, margin: '0 0 1rem' }} />
          <div style={{ fontSize: '11px', fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#6b7280', marginBottom: '0.6rem' }}>Everything in Max, plus</div>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, flex: 1 }}>
            {['3 team seats included','Custom sub-country datasets','Priority support','API access'].map(d => (
              <li key={d} style={{ fontSize: '12.5px', padding: '3px 0', display: 'flex', alignItems: 'flex-start', gap: '7px', lineHeight: 1.4 }}>
                <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#854F0B', flexShrink: 0, marginTop: '5px', display: 'inline-block' }} />{d}
              </li>
            ))}
          </ul>
          <div style={{ marginTop: 'auto', paddingTop: '1.25rem' }}>
            <div style={{ width: '100%', padding: '10px 0', borderRadius: '10px', fontSize: '13px', fontWeight: 500, background: '#854F0B', color: '#fff', textAlign: 'center' }}>Contact us</div>
          </div>
        </Link>

      </div>

      <div style={{ maxWidth: '960px', margin: '2rem auto 0', background: '#EEEDFE', border: '1px solid #AFA9EC', borderRadius: '14px', padding: '1.25rem 2rem', textAlign: 'center' }}>
        <p style={{ fontSize: '18px', fontWeight: 500, color: '#26215C', margin: '0 0 0.25rem' }}>Every new account gets a free 3-day trial</p>
        <p style={{ fontSize: '15px', color: '#534AB7', margin: 0 }}>Full Max access — no card required.</p>
      </div>

    </div>
  )
}