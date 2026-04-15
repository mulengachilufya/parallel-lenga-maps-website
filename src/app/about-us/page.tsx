'use client'

import Image from 'next/image'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { ArrowRight, Globe, Target, Handshake, Database, Map } from 'lucide-react'
import Footer from '@/components/Footer'

const values = [
  {
    icon: <Globe size={24} />,
    title: 'Pan-African Scope',
    description: 'Every one of Africa\'s 54 countries, mapped and accessible from a single platform.',
  },
  {
    icon: <Database size={24} />,
    title: 'Data Integrity',
    description: 'Sourced from world-class institutions: USGS, ESA, FAO, GADM, WorldPop and more.',
  },
  {
    icon: <Users size={24} />,
    title: 'Built for Africa',
    description: 'Designed to serve African researchers, governments, NGOs, and enterprises.',
  },
  {
    icon: <Map size={24} />,
    title: 'Standards-Compliant',
    description: 'All datasets follow OGC standards - compatible with QGIS, ArcGIS, GRASS GIS and more.',
  },
]

const partners = [
  { name: 'USGS Earth Resources', category: 'Satellite Data' },
  { name: 'ESA Copernicus', category: 'Earth Observation' },
  { name: 'FAO GeoNetwork', category: 'Agricultural Data' },
  { name: 'GADM Database', category: 'Administrative Boundaries' },
  { name: 'HydroSHEDS', category: 'Hydrological Data' },
  { name: 'WorldPop', category: 'Population Data' },
]

export default function AboutPage() {
  return (
    <>
      {/* ── HERO ── */}
      <section className="relative pt-32 pb-20 overflow-hidden gradient-primary">
        <div className="absolute inset-0 opacity-10">
          <Image
            src="https://images.unsplash.com/photo-1535941339077-2dd1c7963098?w=1920&q=80"
            alt="African wetlands"
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
              About Lenga Maps
            </span>
            <h1 className="text-4xl lg:text-5xl font-black text-white mb-6">
              We&apos;re Building Africa&apos;s Largest{' '}
              <span className="text-accent">GIS Database</span>
            </h1>
            <p className="text-blue-200 text-xl leading-relaxed">
              Lenga Maps was founded with one mission: to make high-quality geospatial data accessible
              to every researcher, planner, and decision-maker working in Africa.
            </p>
          </motion.div>
        </div>
      </section>

      {/* ── VISION & MISSION ── */}
      <section className="py-20 lg:py-28 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
            >
              <div className="relative rounded-2xl overflow-hidden h-[400px]">
                <Image
                  src="/images/africa-topography.webp"
                  alt="Topographic map of Africa"
                  fill
                  className="object-cover"
                />
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="space-y-10"
            >
              {/* Vision */}
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-accent/15 flex items-center justify-center">
                    <Globe size={20} className="text-accent" />
                  </div>
                  <span className="text-sm font-semibold text-accent uppercase tracking-wider">Our Vision</span>
                </div>
                <h2 className="text-2xl font-black text-navy mb-3">Visualizing Science for Better Decisions</h2>
                <p className="text-gray-600 leading-relaxed text-lg">
                  To visualize scientific and geographical data that informs better decision-making
                  and advances human civilization.
                </p>
              </div>

              {/* Mission */}
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Target size={20} className="text-primary" />
                  </div>
                  <span className="text-sm font-semibold text-primary uppercase tracking-wider">Our Mission</span>
                </div>
                <h2 className="text-2xl font-black text-navy mb-3">Africa&apos;s Most Centralized GIS Database</h2>
                <p className="text-gray-600 leading-relaxed text-lg">
                  Building Africa&apos;s largest and most centralized Environmental GIS Database -
                  one that is accurate, accessible, affordable, and always current.
                </p>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── VALUES ── */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-14"
          >
            <h2 className="text-3xl font-black text-navy">What Sets Us Apart</h2>
            <p className="mt-4 text-gray-500 max-w-lg mx-auto">
              Our commitment to quality, accessibility, and African-first data curation.
            </p>
          </motion.div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {values.map((val, i) => (
              <motion.div
                key={val.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 hover:shadow-md hover:-translate-y-1 transition-all"
              >
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary mb-4">
                  {val.icon}
                </div>
                <h3 className="font-bold text-navy mb-2">{val.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{val.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── STORY ── */}
      <section className="py-20 lg:py-28 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <span className="inline-block bg-primary/10 text-primary text-sm font-semibold px-4 py-2 rounded-full mb-4">
              Our Story
            </span>
            <h2 className="text-3xl font-black text-navy">Born in Zambia, Built for Africa</h2>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="prose prose-lg max-w-none text-gray-600 leading-relaxed space-y-6"
          >
            <p>
              Lenga Maps was born out of frustration. As GIS professionals working across Southern Africa,
              we spent countless hours hunting for reliable spatial data - bouncing between government portals,
              obscure academic databases, and outdated shapefiles that didn&apos;t match the reality on the ground.
            </p>
            <p>
              We knew Africa&apos;s data existed. Satellites had been imaging the continent for decades.
              Research institutions had been collecting field data for generations. The problem wasn&apos;t
              the data - it was the fragmentation. It was scattered across a dozen different platforms,
              in incompatible formats, behind paywalls designed for Western budgets.
            </p>
            <p>
              So we built Lenga Maps: a single, curated, affordable platform where any researcher, planner,
              student or engineer in Africa can find what they need - and actually download it.
            </p>
            <p className="font-semibold text-navy text-xl">
              &ldquo;Unmasking Africa with Data and Intelligence.&rdquo;
            </p>
          </motion.div>
        </div>
      </section>

      {/* ── STRATEGIC PARTNERSHIPS ── */}
      <section className="py-20 gradient-primary">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-14"
          >
            <div className="flex items-center justify-center gap-3 mb-4">
              <Handshake size={24} className="text-accent" />
              <span className="text-accent text-sm font-semibold uppercase tracking-wider">Data Partnerships</span>
            </div>
            <h2 className="text-3xl font-black text-white">Trusted Data Sources</h2>
            <p className="mt-4 text-blue-200 max-w-lg mx-auto">
              Our data is sourced from globally recognized institutions and satellite programmes.
            </p>
          </motion.div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {partners.map((partner, i) => (
              <motion.div
                key={partner.name}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
                className="bg-white/10 backdrop-blur border border-white/20 rounded-2xl p-6 text-center hover:bg-white/20 transition-colors"
              >
                <div className="text-accent text-xs font-semibold uppercase tracking-wider mb-2">
                  {partner.category}
                </div>
                <div className="text-white font-bold">{partner.name}</div>
              </motion.div>
            ))}
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mt-12"
          >
            <Link
              href="/contact-us"
              className="inline-flex items-center gap-2 bg-accent text-navy font-bold px-8 py-4 rounded-xl hover:bg-yellow-400 transition-all"
            >
              Partner With Us
              <ArrowRight size={18} />
            </Link>
          </motion.div>
        </div>
      </section>

      <Footer />
    </>
  )
}
