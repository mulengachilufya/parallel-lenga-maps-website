'use client'

/**
 * Home page: how the GIS workspace works, as a simple left-to-right flow
 * (top-to-bottom on phones) that anyone can follow. Four stations, each
 * with a small drawing of what you actually see, joined by arrows:
 *   Lenga's African GIS database → your own files (kept apart) → one shared
 *   map for the team → back out to your desktop GIS.
 * Then the desktop tools whose data works here (official logos from the
 * CC0 Simple Icons set in /public/images/tools; a name badge where no
 * official icon is available).
 */

import Link from 'next/link'
import { motion } from 'framer-motion'
import { ArrowRight, Database, FolderLock, Map as MapIcon, Download } from 'lucide-react'

const STEPS = [
  {
    icon: Database,
    title: 'Start with African GIS data',
    text: 'Our African GIS database covers all 54 African countries: environmental, climate, water, soils, mining and infrastructure layers, cleaned and ready in EPSG:4326.',
    art: 'library',
  },
  {
    icon: FolderLock,
    title: 'Bring your own files',
    text: 'Import shapefiles, GeoPackage, KML, GeoTIFF or a whole QGIS project. Your files stay in your team\'s private folder, marked as yours, and never mix with the Lenga database.',
    art: 'yours',
  },
  {
    icon: MapIcon,
    title: 'Map it together',
    text: 'Everyone on the team works on the same live GIS map in the browser: style layers, open attribute tables, pin comments to places, and see every change in the history.',
    art: 'map',
  },
  {
    icon: Download,
    title: 'Take it back to your desktop',
    text: 'Export the layers you need as shapefile, GeoJSON or GeoTIFF and carry on in QGIS, ArcGIS or Global Mapper. Your report maps start from clean data.',
    art: 'export',
  },
] as const

function Art({ kind }: { kind: typeof STEPS[number]['art'] }) {
  // Small, flat drawings in the brand colours. Decorative only.
  const common = 'w-full h-[92px] rounded-lg bg-[#0a121c] border border-white/10'
  if (kind === 'library') {
    return (
      <svg viewBox="0 0 200 92" className={common} aria-hidden="true">
        {['Boundaries', 'Rivers', 'Roads', 'Soils'].map((t, i) => (
          <g key={t} transform={`translate(${14 + (i % 2) * 90}, ${14 + Math.floor(i / 2) * 36})`}>
            <rect width="82" height="28" rx="5" fill="#123049" stroke="#F5B800" strokeOpacity={i === 1 ? 0.9 : 0.25} />
            <circle cx="12" cy="14" r="4" fill={['#C9A227', '#38BDF8', '#F97316', '#A16207'][i]} />
            <text x="22" y="18" fontSize="10" fill="#E8F1F8" fontFamily="Inter, sans-serif">{t}</text>
          </g>
        ))}
      </svg>
    )
  }
  if (kind === 'map') {
    return (
      <svg viewBox="0 0 200 92" className={common} aria-hidden="true">
        <path d="M18 70 C 50 40, 70 80, 100 50 S 150 20, 184 38" stroke="#38BDF8" strokeWidth="3" fill="none" />
        <path d="M30 20 L 80 30 L 120 18 L 176 72" stroke="#F97316" strokeWidth="2" fill="none" strokeDasharray="5 4" />
        <polygon points="120,56 150,48 162,70 132,78" fill="#22C55E" fillOpacity="0.35" stroke="#22C55E" />
        <rect x="8" y="8" width="54" height="36" rx="4" fill="#123049" stroke="#ffffff" strokeOpacity="0.15" />
        {[0, 1, 2].map((i) => <rect key={i} x="14" y={14 + i * 9} width={i === 1 ? 30 : 40} height="4" rx="2" fill="#E8F1F8" fillOpacity="0.6" />)}
      </svg>
    )
  }
  if (kind === 'yours') {
    return (
      <svg viewBox="0 0 200 92" className={common} aria-hidden="true">
        <g transform="translate(12,14)">
          <rect width="84" height="64" rx="6" fill="#123049" stroke="#F5B800" strokeOpacity="0.7" />
          <text x="7" y="18" fontSize="7.2" fontWeight="700" fill="#F5B800" fontFamily="Inter, sans-serif">LENGA DATABASE</text>
          {[0, 1, 2].map((i) => <rect key={i} x="10" y={27 + i * 11} width={i === 2 ? 40 : 62} height="6" rx="3" fill="#F5B800" fillOpacity="0.35" />)}
        </g>
        <g transform="translate(106,14)">
          <rect width="82" height="64" rx="6" fill="#16222e" stroke="#9fb0c0" strokeOpacity="0.6" strokeDasharray="4 3" />
          <text x="10" y="18" fontSize="9" fontWeight="700" fill="#9fb0c0" fontFamily="Inter, sans-serif">YOUR FILES</text>
          {['site.shp', 'survey.kml', 'model.qgz'].map((t, i) => (
            <text key={t} x="10" y={33 + i * 12} fontSize="9" fill="#E8F1F8" fontFamily="Inter, sans-serif">{t}</text>
          ))}
        </g>
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 200 92" className={common} aria-hidden="true">
      {['.shp', '.geojson', '.tif'].map((t, i) => (
        <g key={t} transform={`translate(${14 + i * 44}, 22)`}>
          <path d="M0 0 h26 l10 10 v38 h-36 z" fill="#123049" stroke="#E8F1F8" strokeOpacity="0.3" />
          <text x="18" y="32" fontSize="8.5" textAnchor="middle" fill="#E8F1F8" fontFamily="Inter, sans-serif">{t}</text>
        </g>
      ))}
      <path d="M150 46 h24 m-8 -8 l8 8 l-8 8" stroke="#F5B800" strokeWidth="2.5" fill="none" />
      <text x="162" y="80" fontSize="9" textAnchor="middle" fill="#F5B800" fontWeight="700" fontFamily="Inter, sans-serif">Desktop</text>
    </svg>
  )
}

const TOOLS: { name: string; icon?: string }[] = [
  { name: 'QGIS', icon: '/images/tools/qgis.svg' },
  { name: 'ArcGIS', icon: '/images/tools/arcgis.svg' },
  { name: 'Global Mapper' },
  { name: 'Google Earth', icon: '/images/tools/googleearth.svg' },
  { name: 'AutoCAD', icon: '/images/tools/autocad.svg' },
  { name: 'GDAL', icon: '/images/tools/gdal.svg' },
]

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="py-16 lg:py-24 bg-dark border-t border-white/[0.06] scroll-mt-20">
      <div className="max-w-7xl mx-auto px-5 sm:px-6 lg:px-12">
        <div className="max-w-2xl">
          <span className="font-display text-[0.78rem] font-bold tracking-[0.18em] text-gold uppercase">The GIS workspace</span>
          <h2 className="mt-3 font-display text-[clamp(1.9rem,3.6vw,2.7rem)] font-bold text-white leading-tight">
            African geospatial data and your team, on one GIS map.
          </h2>
          <p className="mt-4 text-white/65 leading-relaxed">
            Environmental, climate, water, mining and infrastructure data for all 54 African countries,
            in a workspace built for GIS teams. Share shapefiles, map together, and take clean data back
            to your desktop GIS.
          </p>
        </div>

        <div className="mt-10 flex flex-col lg:flex-row lg:items-stretch gap-3">
          {STEPS.map((s, i) => (
            <div key={s.title} className="contents">
              <motion.div
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.12 }}
                className="flex-1 water-card p-5"
              >
                <div className="flex items-center gap-3">
                  <span className="w-9 h-9 rounded-full bg-gold text-[#1a1200] font-bold flex items-center justify-center text-sm">{i + 1}</span>
                  <s.icon size={18} className="text-gold" />
                </div>
                <h3 className="mt-4 text-white font-bold text-lg">{s.title}</h3>
                <p className="mt-2 text-sm text-white/65 leading-relaxed min-h-[84px]">{s.text}</p>
                <div className="mt-4"><Art kind={s.art} /></div>
              </motion.div>
              {i < STEPS.length - 1 && (
                <div className="flex items-center justify-center text-gold/70 lg:px-0.5" aria-hidden="true">
                  <ArrowRight size={22} className="rotate-90 lg:rotate-0" />
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="mt-12 water-card p-5 sm:p-6">
          <p className="text-sm font-semibold text-white">Data from your desktop GIS works here</p>
          <p className="mt-1 text-xs text-white/55">Shapefile, GeoPackage, GeoJSON, KML/KMZ, GPX, GeoTIFF, and QGIS projects (.qgz / .qgs).</p>
          <ul className="mt-5 grid grid-cols-3 sm:grid-cols-6 gap-4">
            {TOOLS.map((t) => (
              <li key={t.name} className="flex flex-col items-center gap-2 text-center">
                <span className="w-12 h-12 rounded-xl bg-white/[0.06] border border-white/10 flex items-center justify-center">
                  {t.icon
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={t.icon} alt="" width={26} height={26} />
                    : <span className="text-[10px] font-bold leading-tight text-white/85 px-1">GLOBAL<br />MAPPER</span>}
                </span>
                <span className="text-xs text-white/70">{t.name}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-[11px] text-white/35">Product names and logos belong to their owners and are shown to indicate file compatibility only.</p>
        </div>

        <div className="mt-10 flex flex-wrap items-center gap-4">
          <Link href="/team?start=free" className="inline-flex items-center gap-2 bg-gold text-[#1a1200] text-[0.92rem] font-bold px-7 py-3.5 rounded-xl hover:bg-gold-light transition-all">
            Start a free team <ArrowRight size={16} />
          </Link>
          <span className="text-sm text-white/55">Free for 2 people with 3 datasets. Upgrade when your team grows.</span>
        </div>
      </div>
    </section>
  )
}
