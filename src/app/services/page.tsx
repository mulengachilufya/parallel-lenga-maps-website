'use client'

import Image from 'next/image'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { ArrowRight, Download, Map, Database, Layers, Droplets, Pickaxe, Globe, Users } from 'lucide-react'
import Footer from '@/components/Footer'

const services = [
  {
    icon: <Database size={28} />,
    title: 'GIS Data Downloads',
    description: 'Download ready-to-use geospatial datasets in standard formats compatible with QGIS, ArcGIS, and all major GIS platforms.',
    color: '#1E5F8E',
    features: ['Shapefile', 'GeoJSON', 'GeoTIFF', 'KML'],
  },
  {
    icon: <Map size={28} />,
    title: 'Administrative Boundaries',
    description: 'Country, province, and district boundaries for all 54 African nations - accurate, clean, and regularly updated.',
    color: '#0891b2',
    features: ['54 Countries', 'Provincial Level', 'District Level', 'Gazetted'],
  },
  {
    icon: <Droplets size={28} />,
    title: 'Hydrology & Water',
    description: 'River networks, watershed boundaries, lake extents, and seasonal flood mapping.',
    color: '#0ea5e9',
    features: ['River Networks', 'Watersheds', 'Wetlands', 'Flood Zones'],
  },
  {
    icon: <Layers size={28} />,
    title: 'Land Use / Land Cover',
    description: 'Multi-class land cover classification including forest, cropland, urban areas, and bare soil.',
    color: '#16a34a',
    features: ['10m Resolution', 'Annual Updates', 'ESA WorldCover', 'Multi-class'],
  },
  {
    icon: <Pickaxe size={28} />,
    title: 'Geology & Mining',
    description: 'Bedrock geology, lithology, fault lines, and mineral occurrence data for exploration professionals.',
    color: '#b45309',
    features: ['Lithology', 'Fault Lines', 'Mineral Zones', 'USGS Data'],
  },
]

export default function ServicesPage() {
  return (
    <>
      {/* ── HERO ── */}
      <section className="relative pt-32 pb-20 overflow-hidden gradient-primary">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <span className="inline-block bg-accent/20 text-accent text-sm font-semibold px-4 py-2 rounded-full mb-6">
                Our Services
              </span>
              <h1 className="text-4xl lg:text-5xl font-black text-white mb-6">
                Professional GIS Data,<br />
                <span className="text-accent">Delivered Instantly</span>
              </h1>
              <p className="text-blue-200 text-xl leading-relaxed mb-8">
                From satellite-derived land cover to hydrological networks - we curate, clean, and package
                Africa&apos;s most essential geospatial datasets.
              </p>
              <Link
                href="/pricing"
                className="inline-flex items-center gap-2 bg-accent text-navy font-bold px-8 py-4 rounded-xl hover:bg-yellow-400 transition-all"
              >
                <Download size={18} />
                Browse Datasets
              </Link>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.3 }}
              className="relative rounded-2xl overflow-hidden h-[350px]"
            >
              <Image
                src="/images/branding/satellite-orbit.jpg"
                alt="Satellite in orbit over Earth"
                fill
                className="object-cover"
              />
              <div className="absolute inset-0 bg-navy/30" />
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── SERVICES GRID ── */}
      <section className="py-20 lg:py-28 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-14"
          >
            <h2 className="text-3xl lg:text-4xl font-black text-navy">What We Offer</h2>
            <p className="mt-4 text-gray-500 max-w-xl mx-auto">
              6 core service areas, 15+ datasets, and growing. All available via our subscription plans.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {services.map((service, i) => (
              <motion.div
                key={service.title}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
                className="flip-card h-64"
              >
                <div className="flip-card-inner h-full rounded-2xl">
                  {/* Front */}
                  <div className="flip-card-front rounded-2xl bg-white border border-gray-100 shadow-md p-6 flex flex-col justify-between">
                    <div>
                      <div
                        className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4 text-white"
                        style={{ backgroundColor: service.color }}
                      >
                        {service.icon}
                      </div>
                      <h3 className="text-lg font-black text-navy mb-2">{service.title}</h3>
                      <p className="text-gray-500 text-sm leading-relaxed line-clamp-3">{service.description}</p>
                    </div>
                    <p className="text-xs text-gray-400 mt-3">Hover to see details →</p>
                  </div>
                  {/* Back */}
                  <div
                    className="flip-card-back rounded-2xl p-6 flex flex-col justify-between text-white"
                    style={{ background: `linear-gradient(135deg, ${service.color} 0%, #0D2B45 100%)` }}
                  >
                    <div>
                      <div
                        className="w-12 h-12 rounded-xl flex items-center justify-center mb-4 text-white"
                        style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}
                      >
                        {service.icon}
                      </div>
                      <h3 className="font-bold text-lg mb-4">{service.title}</h3>
                      <div className="flex flex-wrap gap-2">
                        {service.features.map((feature) => (
                          <span
                            key={feature}
                            className="text-xs px-2.5 py-1 rounded-full font-medium bg-white/20 text-white"
                          >
                            {feature}
                          </span>
                        ))}
                      </div>
                    </div>
                    <Link
                      href="/pricing"
                      className="mt-4 w-full py-2 bg-accent text-navy font-semibold rounded-lg text-sm hover:bg-yellow-400 transition-colors text-center block"
                    >
                      View Datasets
                    </Link>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-14"
          >
            <h2 className="text-3xl font-black text-navy">How It Works</h2>
            <p className="mt-3 text-gray-500">Get from signup to data download in under 3 minutes.</p>
          </motion.div>

          <div className="grid md:grid-cols-4 gap-6">
            {[
              { step: '01', title: 'Sign Up', desc: 'Create your account and choose Basic or Pro.', icon: <Users size={20} /> },
              { step: '02', title: 'Choose Your Data', desc: 'Browse our dataset library and select what you need.', icon: <Database size={20} /> },
              { step: '03', title: 'Pay Securely', desc: 'Pay via MTN MoMo, Airtel, or card via Flutterwave.', icon: <Globe size={20} /> },
              { step: '04', title: 'Download', desc: 'Instant access to your files in industry-standard formats.', icon: <Download size={20} /> },
            ].map((step, i) => (
              <motion.div
                key={step.step}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="text-center"
              >
                <div className="relative inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary text-white mb-4 mx-auto">
                  {step.icon}
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-accent text-navy text-xs font-black rounded-full flex items-center justify-center">
                    {i + 1}
                  </span>
                </div>
                <h3 className="font-black text-navy mb-2">{step.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{step.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-16 gradient-primary">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <h2 className="text-3xl font-black text-white mb-4">Ready to Start?</h2>
          <p className="text-blue-200 mb-8">Browse our full dataset catalogue and pick your plan.</p>
          <div className="flex flex-wrap gap-4 justify-center">
            <Link href="/pricing" className="inline-flex items-center gap-2 bg-accent text-navy font-bold px-8 py-4 rounded-xl hover:bg-yellow-400 transition-all">
              View Pricing <ArrowRight size={18} />
            </Link>
            <Link href="/contact-us" className="inline-flex items-center gap-2 bg-white/10 text-white font-semibold px-8 py-4 rounded-xl hover:bg-white/20 transition-all">
              Contact Us
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </>
  )
}
