'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { motion } from 'framer-motion'
import {
  ArrowRight, Download, Clock, ExternalLink, ChevronDown,
} from 'lucide-react'
import Footer from '@/components/Footer'
import { DATASETS, LIVE_DATASET_ROUTES, sortDatasetsByTier } from '@/lib/supabase'
import type { Dataset, DatasetSource } from '@/lib/supabase'

// Display order only — every dataset is included with any paid plan now.
const ORDERED_DATASETS = sortDatasetsByTier(DATASETS)

/**
 * Compact "show details" panel that replaces the old per-card tip box and
 * multi-row Data Sources panel. Default state is a single line; users who
 * want the back-story click to expand. Keeps the grid scannable — GIS pros
 * decide on technical badges, not paragraphs.
 */
const DATASET_TIPS: Record<number, string> = {
  1:  'Base maps, census planning, and jurisdiction analysis.',
  3:  'Filter by Strahler order. River and stream networks for drainage, flood and hydrological analysis.',
  4:  'Clipped to country boundaries from ESA WorldCover 2021 (10 m). 10 classes from tree cover to built-up.',
  5:  'Long-term drought severity. Negative = drought, positive = wet. Pairs with rainfall.',
  6:  'Cross-border aquifer extents for transboundary groundwater management, recharge studies and borehole planning.',
  8:  'Subnational counts at ADM1/ADM2 from each country\'s latest official census.',
  9:  'Accessibility analysis, logistics planning, infrastructure gap assessment.',
  10: 'Biodiversity conservation, flood modelling, environmental compliance.',
  11: 'Precision agriculture, land suitability, erosion risk. Multi-layer soil properties.',
  12: 'Conservation planning, wildlife corridor mapping, environmental compliance.',
  13: 'Filter by Strahler order. ≥4 = named, navigable rivers, with discharge and length attributes.',
  14: 'Level 6 drainage basins (2,000–10,000 km²) for catchment delineation, runoff and flood-risk modelling.',
  15: 'Annual rainfall totals for agricultural planning, water catchments, climate baselines.',
  16: 'Monthly mean temperature climatology for habitat modelling and crop suitability.',
  17: 'Natural lakes and major reservoirs from HydroLAKES — water-resource, fisheries and flood-extent analysis.',
}

function CompactSources({
  sources, color,
}: { sources: DatasetSource[]; color: string }) {
  const [open, setOpen] = useState(false)
  const institutions = sources.map((s) => s.institution.split(' · ')[0]).join(', ')

  return (
    <div className="mt-3 border border-gray-100 rounded-lg overflow-hidden text-[11px]">
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((o) => !o) }}
        className="w-full flex items-center gap-2 px-3 py-2 bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <span className="font-semibold uppercase tracking-wider" style={{ color }}>
          Sources
        </span>
        <span className="text-gray-500 truncate flex-1 text-left">{institutions}</span>
        <ChevronDown
          size={12}
          className={`text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div className="divide-y divide-gray-50">
          {sources.map((src, idx) => (
            <div key={idx} className="px-3 py-2 bg-white">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-navy text-[11px] leading-tight">
                    {src.institution}
                  </p>
                  <p className="text-gray-500 text-[10.5px] mt-0.5 leading-snug">
                    {src.contribution}
                  </p>
                </div>
                <a
                  href={src.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 inline-flex items-center gap-1 text-[10px] text-gray-400 hover:text-primary transition-colors"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ExternalLink size={10} />
                  Source
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Badge({ label, color }: { label: string; color?: string }) {
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold"
      style={{
        background: color ? `${color}15` : '#f3f4f6',
        color: color ?? '#444',
      }}
    >
      {label}
    </span>
  )
}

function DatasetCard({ dataset, isLive }: { dataset: Dataset; isLive: boolean }) {
  const tip = DATASET_TIPS[dataset.id]
  return (
    <>
      <div className="h-1.5 w-full" style={{ backgroundColor: dataset.color }} />
      <div className="p-5">
        {/* Top row: icon + name + tier pill */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-start gap-3 min-w-0">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0"
              style={{ backgroundColor: `${dataset.color}15` }}
            >
              {dataset.icon}
            </div>
            <div className="min-w-0">
              <span
                className="text-[10px] font-semibold uppercase tracking-wider block"
                style={{ color: dataset.color }}
              >
                {dataset.category}
              </span>
              <h3 className={`text-base font-bold leading-tight mt-0.5 ${isLive ? 'text-navy group-hover:text-primary transition-colors' : 'text-navy'}`}>
                {dataset.name}
              </h3>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            {!isLive && (
              <span className="flex items-center gap-1 text-[10px] bg-gray-100 text-gray-500 font-semibold px-2 py-0.5 rounded-full">
                <Clock size={9} /> Soon
              </span>
            )}
          </div>
        </div>

        {/* Description — 2 lines max */}
        <p className="text-[12.5px] text-gray-600 leading-snug mb-3 line-clamp-2">
          {dataset.description}
        </p>

        {/* Metadata badges — one row, wraps */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          <Badge label={dataset.format} />
          <Badge label={dataset.resolution} />
          {dataset.epsg && <Badge label={dataset.epsg} color={dataset.color} />}
          {dataset.licence && <Badge label={dataset.licence} />}
          {dataset.last_update && <Badge label={dataset.last_update} />}
          {dataset.size_label && <Badge label={dataset.size_label} />}
        </div>

        {/* Tip — single line, expand link if truncated */}
        {tip && (
          <p className="text-[11.5px] text-gray-500 leading-snug border-l-2 pl-2 mb-2"
             style={{ borderColor: `${dataset.color}40` }}>
            <span className="font-semibold text-navy">Tip · </span>{tip}
          </p>
        )}

        {/* Compact sources panel — only for multi-source datasets */}
        {dataset.sources && dataset.sources.length > 0 && (
          <CompactSources sources={dataset.sources} color={dataset.color} />
        )}

        {/* CTA */}
        <div className="mt-4">
          {isLive ? (
            <div className="flex items-center gap-2 text-[13px] font-semibold text-primary group-hover:text-accent transition-colors">
              <Download size={13} />
              Browse & Download Files
              <ArrowRight size={13} className="group-hover:translate-x-1 transition-transform" />
            </div>
          ) : (
            <div className="flex items-center gap-2 text-[13px] font-medium text-gray-400">
              <Clock size={13} />
              Available soon
            </div>
          )}
        </div>
      </div>
    </>
  )
}

const LIVE_DATASETS = LIVE_DATASET_ROUTES

export default function DatasetsPage() {
  return (
    <>
      {/* Hero — same satellite/orbit visual as the landing page so the
          story is consistent end-to-end. Higher opacity (15%) than other
          surfaces so the imagery is felt without competing with the H1. */}
      <section className="relative pt-32 pb-16 overflow-hidden gradient-primary">
        <div className="absolute inset-0 opacity-[0.15]">
          <Image
            src="https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=2400&q=80"
            alt="Satellite view of Africa from orbit"
            fill
            className="object-cover"
            unoptimized
          />
        </div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="max-w-3xl"
          >
            <span className="inline-block bg-accent/20 text-accent text-sm font-semibold px-4 py-2 rounded-full mb-6">
              GIS Data Bank
            </span>
            <h1 className="text-4xl lg:text-5xl font-black text-white mb-6">
              {DATASETS.length} Professional <span className="text-accent">GIS Datasets</span> for Africa
            </h1>
            <p className="text-blue-200 text-lg leading-relaxed">
              Curated from world-class sources, harmonised to EPSG:4326, and packaged per country
              for the 54 nations.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="flex flex-wrap gap-8 mt-10"
          >
            {[
              { val: '54',                 label: 'Countries' },
              { val: `${DATASETS.length}`, label: 'Datasets' },
              { val: 'EPSG:4326',          label: 'Harmonised CRS' },
              { val: '5+',                 label: 'Formats' },
            ].map((s) => (
              <div key={s.label} className="text-center">
                <div className="text-2xl font-black text-accent">{s.val}</div>
                <div className="text-xs text-blue-200 uppercase tracking-wider mt-0.5">{s.label}</div>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Dataset Grid */}
      <section className="py-16 lg:py-24 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-14"
          >
            <h2 className="text-3xl font-black text-navy mb-3">Browse All Datasets</h2>
            <p className="text-gray-500 max-w-lg mx-auto">
              Click any dataset to explore and download country-level files.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {ORDERED_DATASETS.map((dataset, i) => {
              const isLive = dataset.id in LIVE_DATASETS

              return (
                <motion.div
                  key={dataset.id}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: Math.min(i * 0.04, 0.4) }}
                >
                  {isLive ? (
                    <Link
                      href={LIVE_DATASETS[dataset.id]}
                      replace
                      className="group block bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-200 overflow-hidden h-full"
                    >
                      <DatasetCard dataset={dataset} isLive={isLive} />
                    </Link>
                  ) : (
                    <div className="block bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden h-full">
                      <DatasetCard dataset={dataset} isLive={isLive} />
                    </div>
                  )}
                </motion.div>
              )
            })}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 gradient-primary">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="text-3xl font-black text-white mb-4">Ready to Download?</h2>
            <p className="text-blue-200 text-lg mb-8">
              Head to the download portal to browse files by country and admin level.
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 bg-accent text-navy font-bold px-8 py-4 rounded-xl hover:bg-yellow-400 transition-all"
              >
                <Download size={18} />
                Go to Downloads
              </Link>
              <Link
                href="/pricing"
                className="inline-flex items-center gap-2 bg-white/10 text-white font-semibold px-8 py-4 rounded-xl border border-white/20 hover:bg-white/20 transition-all"
              >
                View Pricing Plans
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      <Footer />
    </>
  )
}