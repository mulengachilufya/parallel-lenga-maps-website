'use client'

import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import Footer from '@/components/Footer'

const NAVY = '#0D2B45'
const GOLD = '#F5B800'

const DATASETS = [
  'Administrative Boundaries', 'River Networks', 'Land Use / Land Cover',
  'Drought Index (SPI 12)', 'Rainfall Data', 'Temperature Data',
  'Transboundary Aquifers', 'Population & Settlements', 'Roads & Infrastructure',
  'Wetlands & Floodplains', 'Soil Classification', 'Protected Areas & Wildlife',
  'HydroRIVERS (global river network)', 'Watersheds & Catchments', 'Lakes',
]

interface ServiceProps {
  number:   string
  label:    string
  heading:  string
  body:     string[]
  image:    string
  alt:      string
  align:    'left' | 'right'
  datasets?: string[]
}

function Service({ number, label, heading, body, image, alt, align, datasets }: ServiceProps) {
  const left = align === 'left'
  return (
    <section className="relative min-h-[92vh] flex items-center overflow-hidden">
      <Image src={image} alt={alt} fill priority={number === '01'} className="object-cover" />
      {/* Dimmed, no white anywhere. Gradient leans darker on the text side so
          copy stays readable without flattening the whole photo. */}
      <div
        className="absolute inset-0"
        style={{
          background: left
            ? 'linear-gradient(100deg, rgba(6,14,23,0.92) 0%, rgba(6,14,23,0.78) 32%, rgba(6,14,23,0.35) 60%, rgba(6,14,23,0.15) 100%)'
            : 'linear-gradient(260deg, rgba(6,14,23,0.92) 0%, rgba(6,14,23,0.78) 32%, rgba(6,14,23,0.35) 60%, rgba(6,14,23,0.15) 100%)',
        }}
      />
      <div className="relative z-10 w-full max-w-7xl mx-auto px-6 sm:px-10 lg:px-16 py-20">
        <div className={`max-w-xl ${left ? '' : 'ml-auto text-right'}`}>
          <span className="font-display text-[0.95rem] font-bold tracking-[0.14em] uppercase mb-5 block" style={{ color: GOLD }}>
            {number} · {label}
          </span>
          <h2 className="font-display font-bold text-white leading-[1.05] mb-6" style={{ fontSize: 'clamp(2.3rem,4.5vw,3.8rem)' }}>
            {heading}
          </h2>
          {body.map((p, i) => (
            <p key={i} className="text-white/85 leading-relaxed mb-4" style={{ fontSize: '17px' }}>
              {p}
            </p>
          ))}
          {datasets && (
            <p className={`mt-5 text-[14px] leading-loose text-white/70 ${left ? '' : 'text-right'}`}>
              {datasets.join('  ·  ')}
            </p>
          )}
        </div>
      </div>
    </section>
  )
}

export default function ServicesPage() {
  return (
    <>
      {/* Opening note. Short, no CTA button shouting at you yet. */}
      <section className="pt-40 pb-16 px-6" style={{ background: NAVY }}>
        <div className="max-w-3xl mx-auto text-center">
          <span className="font-display text-[0.95rem] font-bold tracking-[0.14em] uppercase mb-5 block" style={{ color: GOLD }}>
            What we do
          </span>
          <h1 className="font-display font-bold text-white leading-[1.08] mb-6" style={{ fontSize: 'clamp(2.5rem,5.5vw,4.2rem)' }}>
            Four things, done properly.
          </h1>
          <p className="text-white/70 text-lg leading-relaxed">
            Lenga Maps is not one product wearing four names. It is a data library, a project partner,
            a software builder, and an automation shop, run by the same people who understand the data
            underneath all four.
          </p>
        </div>
      </section>

      <Service
        number="01" label="Data platform" align="left"
        heading="First, the data."
        body={[
          "Environmental and geospatial data for African countries is scattered across UN portals, national agencies, and research archives, most of it hard to find and harder to trust. We built one library instead.",
          "Fifteen datasets, cleaned and standardized, covering all 54 African countries. Every file ships ready for QGIS, ArcGIS, or whatever your team already runs, in Shapefile, GeoJSON, or GeoTIFF.",
        ]}
        datasets={DATASETS}
        image="/images/services/data-platform.jpg"
        alt="Satellite imagery of a river system carved through desert terrain"
      />

      <Service
        number="02" label="Project partner" align="right"
        heading="Then, the harder problems."
        body={[
          "Some projects need more than a download. Drought risk studies, mining impact assessments, water infrastructure planning: these need someone who understands both the data and the ground it describes.",
          "We work directly with engineering firms, water utilities, and environmental consultancies, joining as the GIS partner on the project rather than a vendor at the end of it. Site analysis, custom mapping, technical reporting, scoped to what the project actually needs.",
        ]}
        image="/images/services/project-partner.jpg"
        alt="Two environmental field researchers reviewing data on a tablet in a forest"
      />

      <Service
        number="03" label="WebGIS development" align="left"
        heading="Or your own tool, built from scratch."
        body={[
          "A spreadsheet and a shared drive stops working the moment more than one person needs to see the same map. If your team needs a live tool your whole organization can use, we build it.",
          "Custom web mapping applications, internal dashboards, public data portals. Built on the same stack that runs Lenga Maps itself, shaped around what your organization actually tracks, not a generic template with your logo on it.",
        ]}
        image="/images/services/webgis-dev.jpg"
        alt="Aerial view of engineered water infrastructure and access roads"
      />

      <Service
        number="04" label="Geospatial automation" align="right"
        heading="And the parts nobody wants to do by hand."
        body={[
          "Digitizing boundaries. Classifying land cover. Comparing two satellite scenes to see what changed between them. This work used to take an analyst days.",
          "We build AI powered pipelines that do it in minutes: automated digitization, change detection, classification, batch processing across hundreds of files at once. If a GIS process can be written down as a repeatable set of steps, it can probably be automated.",
        ]}
        image="/images/services/automation.jpg"
        alt="Close aerial texture of cracked, drought affected earth"
      />

      {/* Why it matters. The human note before the CTA. */}
      <section className="relative min-h-[70vh] flex items-end overflow-hidden">
        <Image
          src="/images/services/impact.jpg"
          alt="A child drinking clean water from a hand pump"
          fill
          className="object-cover"
        />
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(0deg, rgba(6,14,23,0.94) 0%, rgba(6,14,23,0.55) 55%, rgba(6,14,23,0.15) 100%)' }}
        />
        <div className="relative z-10 w-full max-w-3xl mx-auto px-6 pb-20 text-center">
          <p className="font-display text-white font-bold leading-snug" style={{ fontSize: 'clamp(1.6rem,3vw,2.3rem)' }}>
            Behind every dataset is a decision someone has to make: where to dig a borehole,
            which route survives the rainy season, how far a drought has spread.
            Good data does not make that decision. It just means nobody is guessing.
          </p>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-6" style={{ background: NAVY }}>
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="font-display font-bold text-white mb-5" style={{ fontSize: 'clamp(1.9rem,3.5vw,2.6rem)' }}>
            Tell us which of the four you need.
          </h2>
          <p className="text-white/70 text-base mb-9 leading-relaxed">
            Browsing datasets, scoping a project, commissioning a tool, or automating a workflow all start
            the same way: a short conversation about what you are actually trying to do.
          </p>
          <div className="flex flex-wrap gap-4 justify-center">
            <Link
              href="/pricing"
              className="inline-flex items-center gap-2 font-bold px-8 py-4 rounded-xl transition-all hover:brightness-110"
              style={{ background: GOLD, color: NAVY }}
            >
              Browse Datasets <ArrowRight size={18} />
            </Link>
            <Link
              href="/contact-us"
              className="inline-flex items-center gap-2 text-white font-semibold px-8 py-4 rounded-xl bg-white/10 hover:bg-white/20 transition-all"
            >
              Talk to Us
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </>
  )
}