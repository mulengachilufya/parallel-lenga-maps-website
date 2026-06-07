'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { Lock } from 'lucide-react'

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

export default function DatasetCard({ dataset, index, href }: DatasetCardProps) {
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
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl mb-4"
              style={{ backgroundColor: `${dataset.color}15` }}
            >
              {dataset.icon}
            </div>
            <span
              className="text-xs font-semibold uppercase tracking-wider px-2 py-1 rounded-full"
              style={{ backgroundColor: `${dataset.color}15`, color: dataset.color }}
            >
              {dataset.category}
            </span>
            <h3 className="mt-3 font-bold text-navy text-lg leading-tight">{dataset.name}</h3>
            <p className="mt-2 text-gray-500 text-sm leading-relaxed line-clamp-2">{dataset.description}</p>
          </div>
          <div className="flex items-center justify-between mt-4">
            <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
              dataset.tier === 'basic'
                ? 'bg-green-50 text-green-700'
                : 'bg-primary/10 text-primary'
            }`}>
              {dataset.tier === 'basic' ? 'Basic & Pro' : 'Pro Only'}
            </span>
            <span className="text-xs text-gray-400">Hover to see details →</span>
          </div>
        </div>

        {/* Back */}
        <div
          className="flip-card-back rounded-2xl p-6 flex flex-col justify-between text-white"
          style={{ background: `linear-gradient(135deg, ${dataset.color} 0%, #0D2B45 100%)` }}
        >
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="text-2xl">{dataset.icon}</span>
              {dataset.tier === 'pro' && (
                <span className="flex items-center gap-1 text-xs bg-white/20 px-2 py-1 rounded-full">
                  <Lock size={10} /> Pro Only
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
