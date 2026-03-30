'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, useInView } from 'framer-motion'

interface StatProps {
  value: number | string
  label: string
  suffix?: string
  prefix?: string
  isText?: boolean
}

function StatItem({ value, label, suffix = '', prefix = '', isText = false }: StatProps) {
  const [count, setCount] = useState(0)
  const ref = useRef(null)
  const inView = useInView(ref, { once: true })

  useEffect(() => {
    if (!inView || isText || typeof value !== 'number') return

    const duration = 1800
    const steps = 60
    const increment = value / steps
    let current = 0
    const timer = setInterval(() => {
      current += increment
      if (current >= value) {
        setCount(value)
        clearInterval(timer)
      } else {
        setCount(Math.floor(current))
      }
    }, duration / steps)

    return () => clearInterval(timer)
  }, [inView, value, isText])

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 30 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6 }}
      className="text-center"
    >
      <div className="text-4xl lg:text-5xl font-black text-white mb-2">
        {prefix}
        {isText ? (
          <motion.span
            initial={{ opacity: 0 }}
            animate={inView ? { opacity: 1 } : {}}
            transition={{ delay: 0.5 }}
          >
            {value}
          </motion.span>
        ) : (
          count
        )}
        {suffix && <span className="text-accent">{suffix}</span>}
      </div>
      <p className="text-blue-200 text-sm font-medium uppercase tracking-widest">{label}</p>
    </motion.div>
  )
}

export default function StatsCounter() {
  const stats = [
    { value: 54, label: 'Countries Covered', suffix: '', prefix: '' },
    { value: 12, label: 'GIS Datasets', suffix: '+', prefix: '' },
    { value: 'All of Africa', label: 'Geographic Scope', isText: true },
    { value: 100, label: 'Free to Download (Pro)', suffix: '%', prefix: '' },
  ]

  return (
    <section className="gradient-primary py-16 lg:py-24 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 opacity-10">
        <svg className="w-full h-full" viewBox="0 0 1440 200" preserveAspectRatio="xMidYMid slice">
          <path d="M0 100 Q360 0 720 100 Q1080 200 1440 100 L1440 200 L0 200 Z" fill="white" />
        </svg>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-12">
          {stats.map((stat, i) => (
            <StatItem key={i} {...stat} />
          ))}
        </div>
      </div>
    </section>
  )
}
