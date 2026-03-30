'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'

// Simplified but recognizable Africa SVG paths
const countries = [
  { id: 'morocco', name: 'Morocco', path: 'M 170 45 L 210 42 L 220 55 L 215 65 L 195 70 L 175 68 L 165 58 Z' },
  { id: 'algeria', name: 'Algeria', path: 'M 210 42 L 260 38 L 275 50 L 272 75 L 250 80 L 220 78 L 215 65 L 220 55 Z' },
  { id: 'libya', name: 'Libya', path: 'M 272 50 L 310 48 L 318 65 L 315 82 L 290 85 L 272 75 Z' },
  { id: 'egypt', name: 'Egypt', path: 'M 310 48 L 340 45 L 348 65 L 340 82 L 315 82 L 318 65 Z' },
  { id: 'mauritania', name: 'Mauritania', path: 'M 148 72 L 175 68 L 195 70 L 198 90 L 190 105 L 160 108 L 145 95 Z' },
  { id: 'mali', name: 'Mali', path: 'M 195 70 L 220 78 L 230 90 L 225 110 L 205 118 L 190 105 L 198 90 Z' },
  { id: 'niger', name: 'Niger', path: 'M 250 80 L 272 75 L 285 88 L 278 108 L 255 115 L 235 110 L 230 95 L 225 110 L 205 118 L 230 90 L 220 78 Z' },
  { id: 'chad', name: 'Chad', path: 'M 285 88 L 310 85 L 320 100 L 318 118 L 300 125 L 278 120 L 278 108 Z' },
  { id: 'sudan', name: 'Sudan', path: 'M 315 82 L 340 82 L 352 98 L 348 125 L 330 135 L 310 130 L 300 115 L 320 100 L 310 85 Z' },
  { id: 'ethiopia', name: 'Ethiopia', path: 'M 340 105 L 360 100 L 375 115 L 370 135 L 355 142 L 338 138 L 330 125 L 348 125 Z' },
  { id: 'somalia', name: 'Somalia', path: 'M 360 100 L 380 98 L 388 115 L 385 145 L 368 155 L 355 145 L 355 142 L 370 135 L 375 115 Z' },
  { id: 'senegal', name: 'Senegal', path: 'M 145 100 L 162 98 L 168 108 L 162 118 L 148 118 L 143 110 Z' },
  { id: 'nigeria', name: 'Nigeria', path: 'M 230 118 L 255 115 L 268 125 L 270 142 L 255 150 L 238 148 L 228 138 L 225 125 Z' },
  { id: 'cameroon', name: 'Cameroon', path: 'M 268 125 L 285 118 L 295 132 L 292 148 L 278 155 L 268 145 L 270 142 Z' },
  { id: 'congo', name: 'DR Congo', path: 'M 278 155 L 295 148 L 318 148 L 325 168 L 320 190 L 298 198 L 280 190 L 272 172 Z' },
  { id: 'angola', name: 'Angola', path: 'M 272 195 L 295 198 L 308 215 L 305 238 L 285 240 L 265 228 L 262 210 Z' },
  { id: 'zambia', name: 'Zambia', path: 'M 298 198 L 320 195 L 335 205 L 335 228 L 318 235 L 302 228 L 295 215 Z' },
  { id: 'tanzania', name: 'Tanzania', path: 'M 325 168 L 348 165 L 358 178 L 355 202 L 338 208 L 320 200 L 318 185 Z' },
  { id: 'kenya', name: 'Kenya', path: 'M 340 142 L 360 138 L 368 155 L 362 172 L 348 175 L 338 162 Z' },
  { id: 'mozambique', name: 'Mozambique', path: 'M 320 235 L 340 228 L 355 240 L 352 268 L 338 278 L 322 268 L 315 248 Z' },
  { id: 'zimbabwe', name: 'Zimbabwe', path: 'M 302 228 L 320 225 L 332 238 L 330 255 L 318 260 L 305 252 L 300 238 Z' },
  { id: 'south-africa', name: 'South Africa', path: 'M 275 258 L 305 252 L 322 268 L 325 288 L 308 302 L 288 305 L 270 295 L 262 278 Z' },
  { id: 'madagascar', name: 'Madagascar', path: 'M 370 195 L 382 190 L 390 208 L 388 235 L 378 242 L 370 228 Z' },
  { id: 'ethiopia-2', name: 'Eritrea', path: 'M 340 98 L 355 95 L 362 105 L 352 112 L 340 108 Z' },
  { id: 'south-sudan', name: 'South Sudan', path: 'M 310 130 L 330 135 L 338 148 L 330 162 L 315 165 L 302 155 L 298 142 Z' },
]

export default function AfricaMap() {
  const [hovered, setHovered] = useState<string | null>(null)

  return (
    <div className="relative w-full max-w-lg mx-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        whileInView={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6 }}
        viewport={{ once: true }}
      >
        <svg
          viewBox="140 35 260 280"
          className="w-full h-auto drop-shadow-xl"
          aria-label="Interactive map of Africa"
        >
          {/* Background glow */}
          <defs>
            <filter id="glow">
              <feGaussianBlur stdDeviation="3" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <radialGradient id="oceanGrad" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#0ea5e9" stopOpacity="0.1" />
              <stop offset="100%" stopColor="#0D2B45" stopOpacity="0.05" />
            </radialGradient>
          </defs>

          {/* Ocean */}
          <rect x="140" y="35" width="260" height="280" fill="url(#oceanGrad)" rx="8" />

          {/* Countries */}
          {countries.map((country) => (
            <motion.path
              key={country.id}
              d={country.path}
              fill={hovered === country.id ? '#1E5F8E' : '#3b82a0'}
              stroke={hovered === country.id ? '#F5B800' : '#1E5F8E'}
              strokeWidth={hovered === country.id ? 1.5 : 0.8}
              className="country-path cursor-pointer"
              onMouseEnter={() => setHovered(country.id)}
              onMouseLeave={() => setHovered(null)}
              animate={
                hovered === country.id
                  ? { scale: 1.02, filter: 'drop-shadow(0 0 8px rgba(245,184,0,0.6))' }
                  : { scale: 1, filter: 'none' }
              }
              transition={{ duration: 0.2 }}
            />
          ))}

          {/* Hover label */}
          {hovered && (() => {
            const country = countries.find(c => c.id === hovered)
            return country ? (
              <text
                x="270"
                y="50"
                textAnchor="middle"
                fill="#F5B800"
                fontSize="8"
                fontWeight="bold"
                fontFamily="Inter, sans-serif"
              >
                {country.name}
              </text>
            ) : null
          })()}
        </svg>
      </motion.div>

      {/* Tooltip */}
      {hovered && (
        <motion.div
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute top-4 left-1/2 -translate-x-1/2 bg-navy text-accent px-3 py-1.5 rounded-full text-sm font-semibold shadow-lg border border-accent/30"
        >
          {countries.find(c => c.id === hovered)?.name}
        </motion.div>
      )}
    </div>
  )
}
