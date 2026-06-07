'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import {
  Lock, Map, Waves, Trees, Flame, Droplets, Users, Route, CloudRain,
  Mountain, Sprout, Bird, Thermometer, Anchor,
  type LucideIcon,
} from 'lucide-react'

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
 * Considered lineart icons per dataset id — replaces the emoji on the
 * legacy card. Drawn from lucide-react so they all share a 1.5px stroke,
 * keep the same visual weight, and inherit the dataset's richer accent
 * colour. Subtle by design — no two-tone fills, no decorative flourishes.
 */
const DATASET_ICON: Record<number, LucideIcon> = {
  1:  Map,         // Administrative Boundaries
  3:  Waves,       // River Networks
  4:  Trees,       // Land Use / Land Cover
  5:  Flame,       // Drought Index (SPI-12)
  6:  Droplets,    // Groundwater Aquifers
  8:  Users,       // Population & Settlements
  9:  Route,       // Roads & Infrastructure
  10: CloudRain,   // Wetlands & Floodplains
  11: Sprout,      // Soil Classification
  12: Bird,        // Protected Areas & Wildlife
  13: Waves,       // HydroRIVERS
  14: Mountain,    // Watersheds & Catchments
  15: CloudRain,   // Rainfall
  16: Thermometer, // Temperature
  17: Anchor,      // Lakes
}

/**
 * Plan-tier badge text. Replaces the legacy "Basic & Pro" / "Pro Only"
 * binary which was hardcoded against an old slug ('basic') the new tier
 * model never returns — so every card on the live site read "Pro Only"
 * regardless of dataset.
 */
function tierBadgeText(tier: string): string {
  switch (tier) {
    case 'starter':    return 'Starter+'
    case 'pro':        return 'Pro+'
    case 'max':        return 'Max'
    case 'enterprise': return 'Enterprise'
    default:           return 'Starter+'
  }
}

function tierBadgeStyle(tier: string): string {
  switch (tier) {
    case 'starter':    return 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200/60'
    case 'pro':        return 'bg-amber-50 text-amber-900 ring-1 ring-amber-300/60'
    case 'max':        return 'bg-violet-50 text-violet-900 ring-1 ring-violet-300/60'
    case 'enterprise': return 'bg-rose-50 text-rose-900 ring-1 ring-rose-200/60'
    default:           return 'bg-gray-100 text-gray-700 ring-1 ring-gray-200'
  }
}

export default function DatasetCard({ dataset, index, href }: DatasetCardProps) {
  const Icon = DATASET_ICON[dataset.id] ?? Map
  const accent = dataset.color // richer per-dataset accent (set in DATASETS)

  const card = (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.05 }}
      viewport={{ once: true }}
      className={`flip-card h-64 ${href ? 'cursor-pointer' : ''}`}
    >
      <div className="flip-card-inner h-full rounded-2xl">
        {/* Front */}
        <div className="flip-card-front rounded-2xl bg-white border border-gray-100 shadow-md hover:shadow-lg p-6 flex flex-col justify-between">
          <div>
            {/* Icon tile — lineart Lucide, not emoji. Background uses a
                richer shade of the dataset accent. */}
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center mb-4"
              style={{
                background: `linear-gradient(135deg, ${accent}1a 0%, ${accent}33 100%)`,
                color: accent,
              }}
            >
              <Icon size={22} strokeWidth={1.6} />
            </div>
            <span
              className="text-xs font-semibold uppercase tracking-wider px-2 py-1 rounded-full"
              style={{ backgroundColor: `${accent}15`, color: accent }}
            >
              {dataset.category}
            </span>
            <h3 className="mt-3 font-bold text-navy text-lg leading-tight">{dataset.name}</h3>
            <p className="mt-2 text-gray-500 text-sm leading-relaxed line-clamp-2">{dataset.description}</p>
          </div>
          <div className="flex items-center justify-between mt-4">
            <span
              className={`text-xs font-semibold px-2 py-1 rounded-full ${tierBadgeStyle(dataset.tier)}`}
            >
              {tierBadgeText(dataset.tier)}
            </span>
            <span className="text-xs text-gray-400">Hover for details</span>
          </div>
        </div>

        {/* Back */}
        <div
          className="flip-card-back rounded-2xl p-6 flex flex-col justify-between text-white"
          style={{ background: `linear-gradient(135deg, ${accent} 0%, #0D2B45 100%)` }}
        >
          <div>
            <div className="flex items-center justify-between mb-4">
              <Icon size={22} strokeWidth={1.6} className="text-white/90" />
              {(dataset.tier === 'pro' || dataset.tier === 'max') && (
                <span className="flex items-center gap-1 text-xs bg-white/20 px-2 py-1 rounded-full">
                  <Lock size={10} /> {tierBadgeText(dataset.tier)}
                </span>
              )}
            </div>
            <h3 className="font-bold text-lg mb-4">{dataset.name}</h3>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-white/70">Source</span>
                <span className="font-medium text-right text-xs">{dataset.source}</span>
              </div>
              <div className="w-full h-px bg-white/20" />
              <div className="flex justify-between text-sm">
                <span className="text-white/70">Format</span>
                <span className="font-medium text-xs">{dataset.format}</span>
              </div>
              <div className="w-full h-px bg-white/20" />
              <div className="flex justify-between text-sm">
                <span className="text-white/70">Resolution</span>
                <span className="font-medium text-xs">{dataset.resolution}</span>
              </div>
            </div>
          </div>
          <div className="mt-4">
            <button className="w-full py-2 bg-accent text-navy font-semibold rounded-lg text-sm hover:bg-yellow-400 transition-colors">
              {href ? 'Browse Dataset' : 'View Dataset'}
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  )

  if (href) {
    return (
      <Link href={href} className="block focus:outline-none focus:ring-2 focus:ring-primary/40 rounded-2xl">
        {card}
      </Link>
    )
  }
  return card
}
