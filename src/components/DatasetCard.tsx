'use client'

import Image from 'next/image'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { ArrowUpRight } from 'lucide-react'

interface Dataset {
  id: number
  name: string
  category: string
  description: string
  source: string
  format: string
  resolution: string
  icon: string
  tier: string
  color: string
}

interface DatasetCardProps {
  dataset: Dataset
  index: number
  /**
   * If provided, wraps the card in a <Link>. The DownloadGate still guards
   * the actual download button inside the destination page — the link just
   * lets anonymous users browse the dataset contents freely.
   */
  href?: string
}

/**
 * Maps every dataset id to a real image from the brand library. Avoids
 * emoji + tinted-rectangle "AI demo" look on the homepage. The mapping is
 * by id rather than by category so visually similar datasets (rivers vs
 * watersheds vs lakes) get different photography.
 */
const DATASET_IMAGE: Record<number, string> = {
  1:  '/images/africa-topography.webp',       // admin boundaries
  3:  '/images/branding/river-aerial.jpg',    // rivers
  4:  '/images/branding/forest.jpg',          // lulc
  5:  '/images/branding/deforestation.jpg',   // drought index
  6:  '/images/branding/flood.jpg',           // aquifer
  8:  '/images/branding/city-map.jpg',        // population
  9:  '/images/branding/satellite-orbit.jpg', // roads
  10: '/images/branding/flood.jpg',           // wetlands
  11: '/images/branding/soil.jpg',            // soil
  12: '/images/branding/hippos.jpg',          // protected areas
  13: '/images/branding/ocean.jpg',           // hydrorivers
  14: '/images/branding/river-aerial.jpg',    // watersheds
  15: '/images/branding/river-aerial.jpg',    // rainfall
  16: '/images/branding/satellite.jpg',       // temperature
  17: '/images/branding/ocean.jpg',           // lakes
}

const FALLBACK_IMAGE = '/images/branding/hero-landscape.jpg'

/**
 * Tier label shown on the card. Editorial-quiet: small all-caps text in a
 * muted tone, not a coloured pill. Tier model is the new one (starter / pro
 * / max / enterprise) — the previous card hardcoded 'basic' and labelled
 * every card "Pro Only" because nothing matched.
 */
function tierLabel(tier: string): string {
  switch (tier) {
    case 'starter':    return 'Starter and above'
    case 'pro':        return 'Pro and above'
    case 'max':        return 'Max'
    case 'enterprise': return 'Enterprise'
    default:           return ''
  }
}

export default function DatasetCard({ dataset, index, href }: DatasetCardProps) {
  const imageSrc = DATASET_IMAGE[dataset.id] ?? FALLBACK_IMAGE

  const card = (
    <motion.article
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: Math.min(index * 0.04, 0.3) }}
      viewport={{ once: true, margin: '-40px' }}
      className="group h-full flex flex-col bg-white/[0.02] border border-white/10 rounded-sm overflow-hidden transition-all duration-300 hover:bg-white/[0.04] hover:border-white/20"
    >
      {/* Image */}
      <div className="relative aspect-[5/3] overflow-hidden bg-[#0a121c]">
        <Image
          src={imageSrc}
          alt={dataset.name}
          fill
          sizes="(max-width: 768px) 100vw, (max-width: 1280px) 33vw, 25vw"
          className="object-cover transition-transform duration-700 group-hover:scale-[1.03]"
          unoptimized
        />
        {/* Gentle vignette so the image always reads against the surface
            colour, regardless of which photo lands here. */}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/40" />
      </div>

      {/* Body */}
      <div className="flex-1 flex flex-col p-6">
        <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-gold/80">
          {dataset.category}
        </p>

        <h3 className="mt-3 font-serif text-[1.35rem] leading-[1.15] text-white font-medium tracking-tight">
          {dataset.name}
        </h3>

        <p className="mt-3 text-[0.92rem] leading-relaxed text-white/60 line-clamp-2">
          {dataset.description}
        </p>

        <div className="mt-auto pt-6 flex items-end justify-between gap-3">
          <span className="text-[10px] uppercase tracking-[0.14em] text-white/35">
            {tierLabel(dataset.tier)}
          </span>
          {href && (
            <span className="inline-flex items-center gap-1 text-[0.82rem] text-white/80 group-hover:text-gold transition-colors">
              Browse
              <ArrowUpRight
                size={14}
                className="transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
              />
            </span>
          )}
        </div>
      </div>
    </motion.article>
  )

  if (href) {
    return (
      <Link
        href={href}
        className="block h-full focus:outline-none focus:ring-1 focus:ring-gold/40 rounded-sm"
      >
        {card}
      </Link>
    )
  }
  return card
}
