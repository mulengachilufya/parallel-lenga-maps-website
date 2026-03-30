'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'

// Simplified African country/region paths for the globe
const africanRegions = [
  { id: 'north', d: 'M 50 15 L 70 18 L 78 28 L 72 35 L 55 38 L 40 35 L 28 28 L 32 18 Z', delay: 0 },
  { id: 'west', d: 'M 28 38 L 40 35 L 45 50 L 38 60 L 25 55 L 20 45 Z', delay: 0.3 },
  { id: 'east', d: 'M 60 38 L 72 35 L 78 50 L 72 65 L 62 68 L 55 60 L 58 48 Z', delay: 0.6 },
  { id: 'central', d: 'M 40 35 L 55 38 L 60 38 L 58 55 L 50 62 L 42 58 L 38 48 Z', delay: 0.9 },
  { id: 'south', d: 'M 38 60 L 50 62 L 58 65 L 60 75 L 50 85 L 42 80 L 35 70 Z', delay: 1.2 },
  { id: 'horn', d: 'M 72 45 L 82 42 L 85 55 L 75 58 L 68 52 Z', delay: 1.5 },
  { id: 'madagascar', d: 'M 82 60 L 86 58 L 88 68 L 84 74 L 80 70 L 80 63 Z', delay: 1.8 },
]

const latLines = [20, 35, 50, 65, 80]
const longLines = [20, 35, 50, 65, 80]

export default function GlobeAnimation() {
  const [litRegions, setLitRegions] = useState<string[]>([])

  useEffect(() => {
    africanRegions.forEach((region) => {
      setTimeout(() => {
        setLitRegions((prev) => [...prev, region.id])
      }, region.delay * 1000 + 500)
    })
  }, [])

  return (
    <div className="relative w-full h-full flex items-center justify-center">
      {/* Glow effect */}
      <div className="absolute inset-0 rounded-full bg-primary/20 blur-3xl" />

      <motion.div
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 1, type: 'spring', stiffness: 80 }}
        className="relative"
        style={{ width: '320px', height: '320px' }}
      >
        <svg
          viewBox="0 0 100 100"
          className="w-full h-full drop-shadow-2xl"
          style={{ animation: 'spin 30s linear infinite' }}
        >
          {/* Ocean base */}
          <circle cx="50" cy="50" r="48" fill="#0D2B45" />

          {/* Grid lines */}
          {latLines.map((y) => (
            <ellipse
              key={`lat-${y}`}
              cx="50"
              cy={y}
              rx={Math.sqrt(48 * 48 - (y - 50) * (y - 50))}
              ry="3"
              fill="none"
              stroke="#1E5F8E"
              strokeWidth="0.3"
              opacity="0.5"
            />
          ))}
          {longLines.map((x) => (
            <ellipse
              key={`lon-${x}`}
              cx={x}
              cy="50"
              rx="3"
              ry={Math.sqrt(48 * 48 - (x - 50) * (x - 50))}
              fill="none"
              stroke="#1E5F8E"
              strokeWidth="0.3"
              opacity="0.5"
            />
          ))}

          {/* Equator */}
          <ellipse cx="50" cy="50" rx="48" ry="6" fill="none" stroke="#1E5F8E" strokeWidth="0.5" opacity="0.8" />

          {/* African regions */}
          {africanRegions.map((region) => (
            <motion.path
              key={region.id}
              d={region.d}
              fill={litRegions.includes(region.id) ? '#1E5F8E' : '#1a4a6e'}
              stroke={litRegions.includes(region.id) ? '#F5B800' : '#2a6090'}
              strokeWidth="0.5"
              initial={{ opacity: 0.4 }}
              animate={
                litRegions.includes(region.id)
                  ? { opacity: 1, filter: 'drop-shadow(0 0 3px #F5B800)' }
                  : { opacity: 0.4 }
              }
              transition={{ duration: 0.5 }}
            />
          ))}

          {/* Globe border */}
          <circle cx="50" cy="50" r="48" fill="none" stroke="#F5B800" strokeWidth="1" opacity="0.6" />

          {/* Prime meridian */}
          <ellipse cx="50" cy="50" rx="4" ry="48" fill="none" stroke="#F5B800" strokeWidth="0.5" opacity="0.6" />
        </svg>

        {/* Orbiting dot */}
        <motion.div
          className="absolute w-2 h-2 bg-accent rounded-full shadow-lg"
          style={{ top: '50%', left: '50%' }}
          animate={{
            x: [0, 140, 0, -140, 0],
            y: [-140, 0, 140, 0, -140],
          }}
          transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
        />
      </motion.div>
    </div>
  )
}
