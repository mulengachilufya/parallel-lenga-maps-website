'use client'
// v2
import Link from 'next/link'
import Image from 'next/image'
import { motion } from 'framer-motion'
import { ArrowRight, Download, Lock, Clock } from 'lucide-react'
import Footer from '@/components/Footer'
import { DATASETS } from '@/lib/supabase'

const DATASET_TIPS: Record<number, string> = {
  1: 'Ideal for base maps, census planning, and jurisdiction analysis. Use in QGIS or ArcGIS for boundary overlays.',
  2: 'Essential for slope analysis, viewshed modelling, and 3D terrain visualization. Works with hillshade and contour tools.',
  3: 'Use for watershed delineation, flood risk mapping, and water resource management. Pairs well with DEM data.',
  4: 'Great for change detection, urban sprawl monitoring, and environmental impact assessments. Multi-temporal analysis ready.',
  5: 'Monitor long-term drought severity with SPI-12. Negative values indicate drought, positive values indicate wet periods. Essential for food security and water resource planning.',
  15: 'Annual rainfall totals for agricultural planning, water catchment analysis, and climate baseline studies. Drag into QGIS for instant visualization.',
  16: 'Monthly mean temperature climatology for habitat modelling, crop suitability, and climate change impact assessments.',
  6: 'Key for mineral exploration, infrastructure planning, and geological hazard mapping. Overlay with satellite imagery.',
  7: 'Monitor vegetation health, deforestation, and seasonal growth patterns. Time-series NDVI for trend analysis.',
  8: 'Essential for urban planning, service delivery optimization, and demographic studies. High-resolution gridded data.',
  9: 'Use for accessibility analysis, logistics planning, and infrastructure gap assessment across African nations.',
  10: 'Critical for biodiversity conservation, flood modelling, and environmental compliance studies.',
  11: 'Supports precision agriculture, land suitability analysis, and erosion risk mapping. Multi-layer soil properties.',
  12: 'Vital for conservation planning, wildlife corridor mapping, and environmental compliance reporting.',
  13: 'Filter by Strahler order to isolate major rivers. Strahler ≥ 4 gives named, navigable rivers. Pairs perfectly with HydroBASINS for full watershed analysis.',
  14: 'Level 6 basins average 2,000–10,000 km² — ideal for catchment-scale hydrology, transboundary water management, and flood modelling at the regional level.',
}

// Only datasets with actual download data on the dashboard
const LIVE_DATASETS: Record<number, string> = {
  1: '/dashboard?section=admin-boundaries',
  2: '/dashboard?section=dems',
  3: '/dashboard?section=hydrology',
  5: '/dashboard?section=drought-index',
  15: '/dashboard?section=rainfall',
  16: '/dashboard?section=temperature',
  13: '/dashboard?section=rivers',
  14: '/dashboard?section=watersheds',
}

export default function DatasetsPage() {
  return (
    <>
      {/* Hero */}
      <section className="relative pt-32 pb-16 overflow-hidden gradient-primary">
        <div className="absolute inset-0 opacity-10">
          <Image
            src="/images/branding/river-aerial.jpg"
            alt="GIS data overview"
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
              From administrative boundaries to soil classification — every dataset is curated from
              world-class sources, formatted for professional GIS workflows, and covering all 54 African nations.
            </p>
          </motion.div>

          {/* Quick stats */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="flex flex-wrap gap-8 mt-10"
          >
            {[
              { val: '54', label: 'Countries' },
              { val: `${DATASETS.length}`, label: 'Datasets' },
              { val: '5+', label: 'Formats' },
              { val: '6', label: 'Free Datasets' },
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

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {DATASETS.map((dataset, i) => {
              const isLive = dataset.id in LIVE_DATASETS

              const cardContent = (
                <>
                  {/* Color bar */}
                  <div
                    className="h-1.5 w-full"
                    style={{ backgroundColor: dataset.color }}
                  />

                  <div className="p-6">
                    {/* Header */}
                    <div className="flex items-start justify-between mb-4">
                      <div
                        className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl"
                        style={{ backgroundColor: `${dataset.color}15` }}
                      >
                        {dataset.icon}
                      </div>
                      <div className="flex items-center gap-2">
                        {!isLive && (
                          <span className="flex items-center gap-1 text-xs bg-gray-100 text-gray-500 font-semibold px-2 py-1 rounded-full">
                            <Clock size={10} /> Coming Soon
                          </span>
                        )}
                        {dataset.tier === 'pro' && (
                          <span className="flex items-center gap-1 text-xs bg-primary/10 text-primary font-semibold px-2 py-1 rounded-full">
                            <Lock size={10} /> Pro
                          </span>
                        )}
                        {dataset.tier === 'basic' && isLive && (
                          <span className="text-xs bg-green-50 text-green-700 font-semibold px-2 py-1 rounded-full">
                            Free
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Category */}
                    <span
                      className="text-xs font-semibold uppercase tracking-wider"
                      style={{ color: dataset.color }}
                    >
                      {dataset.category}
                    </span>

                    {/* Name */}
                    <h3 className={`text-lg font-bold mt-1 mb-2 ${isLive ? 'text-navy group-hover:text-primary transition-colors' : 'text-navy'}`}>
                      {dataset.name}
                    </h3>

                    {/* Description */}
                    <p className="text-gray-500 text-sm leading-relaxed mb-4">
                      {dataset.description}
                    </p>

                    {/* Tip */}
                    <div className="bg-gray-50 rounded-lg p-3 mb-4">
                      <p className="text-xs text-gray-600 leading-relaxed">
                        <span className="font-semibold text-navy">Tip: </span>
                        {DATASET_TIPS[dataset.id]}
                      </p>
                    </div>

                    {/* Meta info */}
                    <div className="grid grid-cols-3 gap-2 text-xs mb-4">
                      <div className="bg-gray-50 rounded-lg p-2 text-center">
                        <span className="block text-gray-400 mb-0.5">Source</span>
                        <span className="font-medium text-navy text-[10px]">{dataset.source}</span>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-2 text-center">
                        <span className="block text-gray-400 mb-0.5">Format</span>
                        <span className="font-medium text-navy text-[10px]">{dataset.format}</span>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-2 text-center">
                        <span className="block text-gray-400 mb-0.5">Resolution</span>
                        <span className="font-medium text-navy text-[10px]">{dataset.resolution}</span>
                      </div>
                    </div>

                    {/* CTA */}
                    {isLive ? (
                      <div className="flex items-center gap-2 text-sm font-semibold text-primary group-hover:text-accent transition-colors">
                        <Download size={14} />
                        Browse & Download Files
                        <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-sm font-medium text-gray-400">
                        <Clock size={14} />
                        Available soon
                      </div>
                    )}
                  </div>
                </>
              )

              return (
                <motion.div
                  key={dataset.id}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: Math.min(i * 0.06, 0.5) }}
                >
                  {isLive ? (
                    <Link
                      href={LIVE_DATASETS[dataset.id]}
                      className="group block bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 overflow-hidden h-full"
                    >
                      {cardContent}
                    </Link>
                  ) : (
                    <div className="block bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden h-full">
                      {cardContent}
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
