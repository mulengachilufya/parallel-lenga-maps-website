'use client'

/**
 * "Did you know?" A small card in the corner of the home page with one
 * short fact at a time, changing every 20 seconds. Can be closed (stays
 * closed for the visit). Sits above the bottom edge on phones.
 */

import { useEffect, useState } from 'react'
import { Lightbulb, X } from 'lucide-react'

const FACTS = [
  'Lenga Maps covers all 54 African countries, harmonised to EPSG:4326.',
  'You can pick 3 datasets for free and keep them for good.',
  'A free team gives you and a colleague one shared GIS map.',
  'You can pin a comment to the exact spot on the map you mean.',
  'You can record a voice note from the field, right on the map.',
  'Every change to a project map is saved, and any version can be restored.',
  'You can upload drone orthomosaics and satellite scenes next to our layers.',
  'Your own files stay private to your team and never mix with our database.',
  'Ready-made maps for mining, EIA, water and agriculture load in one click.',
  'Admin boundaries go down to province and district level for most countries.',
  'You can export a whole project back to QGIS or ArcGIS Pro.',
  'Can’t find a dataset? Ask us and we will source it for you.',
]

export default function DidYouKnow() {
  const [i, setI] = useState(0)
  const [show, setShow] = useState(false)
  const [closed, setClosed] = useState(false)

  useEffect(() => {
    try { if (sessionStorage.getItem('lm-dyk') === 'off') { setClosed(true); return } } catch { /* private mode */ }
    const first = setTimeout(() => setShow(true), 6000)
    const tick = setInterval(() => setI((n) => (n + 1) % FACTS.length), 20000)
    return () => { clearTimeout(first); clearInterval(tick) }
  }, [])

  if (closed || !show) return null
  return (
    <div role="status" aria-live="polite"
         className="fixed z-40 left-4 right-4 bottom-4 sm:left-auto sm:right-6 sm:bottom-6 sm:w-[340px] rounded-2xl border border-[#F5B800]/40 bg-[#0D2B45]/95 text-white shadow-2xl backdrop-blur p-4 pr-10">
      <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-[#F5B800]">
        <Lightbulb size={14} /> Did you know?
      </p>
      <p key={i} className="mt-1.5 text-[14px] leading-snug animate-[fadein_.5s_ease]">{FACTS[i]}</p>
      <button aria-label="Close" className="absolute right-3 top-3 text-white/60 hover:text-white"
              onClick={() => { setClosed(true); try { sessionStorage.setItem('lm-dyk', 'off') } catch { /* private mode */ } }}>
        <X size={16} />
      </button>
      <style>{'@keyframes fadein{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}'}</style>
    </div>
  )
}
