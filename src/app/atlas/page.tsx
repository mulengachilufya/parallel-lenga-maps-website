'use client'

/**
 * /atlas — The Lenga Atlas
 *
 * A curated portfolio of cartography produced from Lenga Maps data. Each entry
 * is a side-by-side block: the rendered map on one side, a 3-sentence intro on
 * the other (what / where / why). Sides alternate so the page reads like a
 * spread, not a list.
 *
 * Click any map → fullscreen lightbox. Esc / click-outside / × to close.
 *
 * Source-of-truth notes:
 *  - PNGs in /public/atlas/*.png are rendered from the matching PDFs by
 *    scripts/render-atlas-pdfs.py at 180 dpi. Re-run the script to refresh.
 *  - Order of `MAPS` below is the order shown on the page. The first item is
 *    the "lead" map.
 *  - Captions are intentionally short (≤3 sentences) — what / where / why,
 *    no dataset name-drops.
 */

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Maximize2 } from 'lucide-react'
import Footer from '@/components/Footer'

type AtlasMap = {
  id: string
  title: string
  location: string
  image: string         // path under /public
  /** alt text — succinct, used by screen readers and image lazy-loading. */
  alt: string
  /** 3-sentence caption: what + where + why. */
  caption: string
}

const MAPS: AtlasMap[] = [
  {
    id: 'lusaka-watershed',
    title: 'Watershed Delineation & Drainage Analysis of Lusaka',
    location: 'Lusaka, Zambia',
    image: '/atlas/01-lusaka-watershed.png',
    alt: 'Watershed delineation of Lusaka City showing sub-basins, drainage networks, pour points and key constituencies.',
    caption:
      "Sub-catchment boundaries, drainage networks and pour points carved out of Lusaka's terrain, with the constituencies of Kabanana, Ibex Hill, Chilenje, Chalala and Lilayi pinned to the basin each one actually drains into. Every drop of rain falling on those neighbourhoods leaves the city through one of the green outlet points — get the watersheds wrong and the stormwater plan protects the wrong side of town. It is the foundation layer underneath every credible drainage, flood-risk and pollution-tracing study Lusaka can put together.",
  },
  {
    id: 'southern-africa-soil',
    title: 'Soil Map of Southern Africa',
    location: 'Southern Africa & Madagascar',
    image: '/atlas/02-southern-africa-soil.png',
    alt: 'Classified soil map of southern Africa and Madagascar showing more than twenty soil orders.',
    caption:
      'More than twenty distinct soil orders — Ferralsols, Vertisols, Arenosols, Acrisols, Solonchaks and the rest — drawn out across the southern half of the continent and Madagascar in a single legible chart. Soil is the silent variable behind nearly every land question: which crop grows, where groundwater recharges, which slope holds a foundation, which forest can be replanted. A regional palette like this lets agricultural planners, hydrologists and engineers compare countries without having to stitch national datasets together themselves.',
  },
  {
    id: 'mining-3d-profiling',
    title: 'Basic 3D Profiling of a Mining Exploration Site',
    location: 'Mining exploration site, Zambia',
    image: '/atlas/03-mining-3d-profiling.png',
    alt: 'Three 3D perspective renderings of the same exploration block: satellite drape, hillshade, and false-colour elevation.',
    caption:
      'The same exploration block rendered three ways — true-colour satellite drape, hillshaded surface and false-colour elevation — so the terrain can be read structurally instead of guessed at. Before a single rig moves, slope, drainage and ridge orientation decide road access, pad locations, runoff direction and where the ore body is most likely to surface. A 3D profile turns a flat polygon on a licence map into something a geologist, a civil engineer and a financier can argue about from the same picture.',
  },
  {
    id: 'zambia-dem',
    title: 'Digital Elevation Model of Zambia',
    location: 'Zambia',
    image: '/atlas/04-zambia-dem.png',
    alt: 'Digital elevation model of Zambia with wetlands and lakes overlaid.',
    caption:
      'A continuous elevation surface across all of Zambia — from the warm green of the Zambezi floodplains in the south to the deep ridges of the Muchinga Escarpment in the north-east — with wetlands and the country\'s major lakes called out in blue. Zambia is often described as a flat plateau, and at country scale that is almost true; but the variation that does exist is exactly what governs soil formation, ecological zonation and the direction water moves on the landscape. Every serious agricultural, hydrological or infrastructure plan in the country starts on a layer that looks like this.',
  },
  {
    id: 'african-carbon-credits',
    title: 'African Carbon Credits Produced, 2017–2023',
    location: 'All of Africa',
    image: '/atlas/05-african-carbon-credits.png',
    alt: 'Choropleth of total carbon credits produced by African country, 2017 to 2023, in megatons of CO2.',
    caption:
      'A continental view of who is actually generating carbon credits in Africa across the 2017–2023 window: the Democratic Republic of Congo and Kenya pull furthest ahead, followed by Zambia, Zimbabwe and South Africa, while most of the continent still measures in single megatons. Carbon credits are now one of Africa\'s fastest-growing climate-finance flows, and a single map immediately surfaces which countries have built project pipelines and which haven\'t. It is the kind of view investors, NGOs and climate-policy desks reach for first when sizing where the next decade of forestry and energy-transition money is going to land.',
  },
  {
    id: 'solwezi-boundary',
    title: 'Boundary Mapping for a Mining Exploration Area',
    location: 'Kalumbila / Solwezi, North-Western Province, Zambia',
    image: '/atlas/06-solwezi-boundary.png',
    alt: 'Survey boundary map of a 101-hectare mining exploration block near Solwezi, with labelled beacons and locator insets.',
    caption:
      'A formal survey of a 101-hectare exploration block sitting between Kalumbila and Solwezi, with every beacon labelled A through F, every leg ticked with its distance, and the anchor point captured in WGS84 / UTM Zone 35S. Mining licences in Zambia don\'t live as screenshot polygons — they live as legal documents with named beacons, bearings and a fixed coordinate, and the regulator wants exactly this format. The locator insets bolt the parcel to its district and to the country, so anyone can place it without ever opening a separate map.',
  },
  {
    id: 'zambia-solar-potential',
    title: 'Photovoltaic Power Potential of Zambia',
    location: 'Zambia',
    image: '/atlas/07-zambia-solar-potential.png',
    alt: 'Solar irradiance map of Zambia showing photovoltaic power potential by province, with national parks and main roads.',
    caption:
      'Long-term solar-irradiance potential across Zambia averaged over 1994–2017, with national parks and the main road network laid on top so each cell can be read against access and protection constraints. Western and Southern Provinces register some of the strongest solar numbers anywhere on the continent — comfortably above what most of Europe ever sees — while the wetter north sits a step below. For a country still building out its energy mix, a map like this is where utility-scale PV siting, mini-grid planning and rural-electrification economics all begin.',
  },
]

export default function AtlasPage() {
  // Lightbox: which map is currently open, or null if none.
  const [openId, setOpenId] = useState<string | null>(null)
  const openMap = openId ? MAPS.find((m) => m.id === openId) : null

  // Esc key + body-scroll lock while the lightbox is open.
  useEffect(() => {
    if (!openId) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenId(null)
    }
    window.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [openId])

  return (
    <>
      {/* ── HERO ─────────────────────────────────────────────────────── */}
      <section className="relative pt-32 pb-16 lg:pb-24 overflow-hidden bg-dark">
        <div className="absolute inset-0 opacity-25">
          <Image
            src="/atlas/02-southern-africa-soil.png"
            alt=""
            fill
            className="object-cover blur-2xl"
            priority
            unoptimized
          />
          <div className="absolute inset-0 bg-gradient-to-b from-dark/80 via-dark/85 to-dark" />
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="max-w-3xl"
          >
            <span className="inline-block bg-gold/15 text-gold text-sm font-semibold px-4 py-2 rounded-full mb-6">
              The Lenga Atlas
            </span>
            <h1 className="text-4xl lg:text-6xl font-black text-white mb-6 leading-[1.05]">
              Maps built from <span className="text-gold">our data</span>.
            </h1>
            <p className="text-blue-200 text-lg lg:text-xl leading-relaxed">
              A small selection of cartography produced in-house — soil, terrain,
              water, energy, land tenure and climate finance — to show what
              becomes possible once the underlying data is in your hands.
            </p>
          </motion.div>
        </div>
      </section>

      {/* ── MAP SPREAD ───────────────────────────────────────────────── */}
      <section className="bg-dark pb-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-24 lg:space-y-32">
          {MAPS.map((m, i) => {
            const imageOnRight = i % 2 === 1
            return (
              <motion.article
                key={m.id}
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-80px' }}
                transition={{ duration: 0.6 }}
                className="grid lg:grid-cols-12 gap-10 lg:gap-14 items-center"
              >
                {/* Map image — clickable to open lightbox. */}
                <button
                  type="button"
                  onClick={() => setOpenId(m.id)}
                  className={`relative group lg:col-span-7 block w-full text-left ${
                    imageOnRight ? 'lg:order-2' : ''
                  }`}
                  aria-label={`Open ${m.title} fullscreen`}
                >
                  <div className="relative w-full overflow-hidden rounded-2xl bg-white shadow-2xl shadow-black/50 ring-1 ring-white/10 transition-transform duration-300 group-hover:-translate-y-1">
                    <Image
                      src={m.image}
                      alt={m.alt}
                      width={2000}
                      height={1500}
                      sizes="(min-width: 1024px) 60vw, 100vw"
                      className="w-full h-auto"
                      // Lead map loads eagerly; the rest defer until scrolled in.
                      priority={i === 0}
                    />
                    {/* Hover hint — fade-in expand icon. */}
                    <div className="absolute top-4 right-4 bg-dark/70 backdrop-blur-sm rounded-full p-2.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Maximize2 size={18} className="text-white" />
                    </div>
                  </div>
                </button>

                {/* Caption side */}
                <div className={`lg:col-span-5 ${imageOnRight ? 'lg:order-1' : ''}`}>
                  <div className="text-xs font-semibold tracking-[0.18em] uppercase text-gold/90 mb-3">
                    {String(i + 1).padStart(2, '0')} · {m.location}
                  </div>
                  <h2 className="text-2xl lg:text-3xl font-black text-white leading-tight mb-5">
                    {m.title}
                  </h2>
                  <p className="text-blue-100/85 text-base lg:text-lg leading-relaxed">
                    {m.caption}
                  </p>
                </div>
              </motion.article>
            )
          })}
        </div>
      </section>

      {/* ── CLOSING NOTE ─────────────────────────────────────────────── */}
      <section className="bg-navy py-16 lg:py-20 border-t border-white/5">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h3 className="text-2xl lg:text-3xl font-black text-white mb-4">
            Want to make maps like these?
          </h3>
          <p className="text-blue-200 text-lg leading-relaxed mb-8">
            Every layer behind these visuals — terrain, soil, hydrology, land cover, climate, infrastructure — is downloadable from the Lenga Maps catalogue. Bring the data into QGIS, ArcGIS or your tool of choice and the next map is yours.
          </p>
          <a
            href="/datasets"
            className="inline-block bg-gold text-[#1a1200] font-bold px-8 py-4 hover:bg-gold-light transition-all hover:-translate-y-px"
          >
            Browse the dataset catalogue
          </a>
        </div>
      </section>

      <Footer />

      {/* ── LIGHTBOX ─────────────────────────────────────────────────── */}
      <AnimatePresence>
        {openMap && (
          <motion.div
            key="lightbox"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-sm flex flex-col items-center justify-center p-4 sm:p-8"
            onClick={() => setOpenId(null)}
          >
            <button
              type="button"
              onClick={() => setOpenId(null)}
              className="absolute top-5 right-5 w-11 h-11 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
              aria-label="Close"
            >
              <X size={22} />
            </button>
            <motion.div
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="relative max-w-[95vw] max-h-[85vh]"
              // Clicks inside the image shouldn't close the lightbox.
              onClick={(e) => e.stopPropagation()}
            >
              <Image
                src={openMap.image}
                alt={openMap.alt}
                width={2400}
                height={1800}
                sizes="95vw"
                className="max-h-[85vh] w-auto h-auto object-contain rounded-lg"
                priority
              />
            </motion.div>
            <p className="mt-5 text-white/85 text-sm sm:text-base text-center max-w-2xl">
              <span className="font-semibold">{openMap.title}</span>
              <span className="text-white/55"> · {openMap.location}</span>
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
