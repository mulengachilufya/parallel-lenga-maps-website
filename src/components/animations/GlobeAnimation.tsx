'use client'

import { motion } from 'framer-motion'

/**
 * 3D-styled Africa silhouette.
 *
 * The continent is drawn as a single SVG path tuned to the iconic
 * landmarks: north-coast bulge, Sinai/Red Sea step, Horn of Africa
 * pointing east, southern tip, and the broad West African shoulder.
 * Madagascar is a small separate shape east of the southern coast.
 *
 * Depth comes from layering inside one <g>:
 *   1. A radial gradient fill — bright gold top-left, deep bronze bottom
 *      right, so the continent reads as lit from upper-left.
 *   2. A SVG drop-shadow filter underneath for elevation off the ocean.
 *   3. A subtle white-to-transparent top highlight overlay catching the
 *      "light".
 *   4. A warm golden stroke for a clean raised edge.
 *
 * The whole SVG keeps the slow 30 s spin, so Africa rotates with the
 * grid lines beneath it.
 */
const AFRICA_PATH =
  'M 30 16 L 50 14 L 65 16 L 76 22 L 80 31 L 83 37 L 87 42 L 89 49 L 84 53 L 79 58 L 75 65 L 73 73 L 67 80 L 58 84 L 50 86 L 42 84 L 35 76 L 30 67 L 26 58 L 22 50 L 20 42 L 18 35 L 17 28 L 22 21 Z'

const MADAGASCAR_PATH =
  'M 87 62 L 90 60 L 91 68 L 89 75 L 86 72 Z'

const latLines  = [20, 35, 50, 65, 80]
const longLines = [20, 35, 50, 65, 80]

export default function GlobeAnimation() {
  return (
    <div className="relative w-full h-full flex items-center justify-center">
      {/* Soft outer glow behind the globe */}
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
          <defs>
            {/* 3D Africa fill — lit from upper-left */}
            <radialGradient id="africaFill" cx="0.38" cy="0.32" r="0.78">
              <stop offset="0%"   stopColor="#FFD66E" stopOpacity="1" />
              <stop offset="45%"  stopColor="#D9A937" stopOpacity="1" />
              <stop offset="85%"  stopColor="#8C6A1A" stopOpacity="1" />
              <stop offset="100%" stopColor="#5A4310" stopOpacity="1" />
            </radialGradient>

            {/* Specular highlight catching the upper edge */}
            <linearGradient id="africaTopLight" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"  stopColor="#FFFFFF" stopOpacity="0.35" />
              <stop offset="25%" stopColor="#FFFFFF" stopOpacity="0.05" />
              <stop offset="60%" stopColor="#FFFFFF" stopOpacity="0" />
            </linearGradient>

            {/* Bottom-edge shadow inside the continent, for thickness */}
            <linearGradient id="africaBottomShade" x1="0" y1="0" x2="0" y2="1">
              <stop offset="60%"  stopColor="#000000" stopOpacity="0" />
              <stop offset="100%" stopColor="#3C2A05" stopOpacity="0.5" />
            </linearGradient>

            {/* Elevation drop-shadow under the whole continent */}
            <filter id="africaElev" x="-30%" y="-30%" width="160%" height="160%">
              <feDropShadow
                dx="0"
                dy="1.4"
                stdDeviation="1.6"
                floodColor="#000000"
                floodOpacity="0.7"
              />
            </filter>

            {/* Soft golden glow on the silhouette edge */}
            <filter id="goldGlow" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="0.6" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Ocean base */}
          <circle cx="50" cy="50" r="48" fill="#0D2B45" />

          {/* Latitude grid */}
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

          {/* Equator highlight */}
          <ellipse
            cx="50"
            cy="50"
            rx="48"
            ry="6"
            fill="none"
            stroke="#1E5F8E"
            strokeWidth="0.5"
            opacity="0.8"
          />

          {/* 3D Africa — sits on the globe, lit from upper left */}
          <g filter="url(#africaElev)">
            {/* Continent body */}
            <path
              d={AFRICA_PATH}
              fill="url(#africaFill)"
              stroke="#FFE17A"
              strokeWidth="0.45"
              strokeLinejoin="round"
              filter="url(#goldGlow)"
            />
            {/* Specular top highlight */}
            <path d={AFRICA_PATH} fill="url(#africaTopLight)" />
            {/* Bottom interior shading for thickness */}
            <path d={AFRICA_PATH} fill="url(#africaBottomShade)" />

            {/* Madagascar */}
            <path
              d={MADAGASCAR_PATH}
              fill="url(#africaFill)"
              stroke="#FFE17A"
              strokeWidth="0.35"
              strokeLinejoin="round"
            />
            <path d={MADAGASCAR_PATH} fill="url(#africaTopLight)" />
          </g>

          {/* Globe edge */}
          <circle
            cx="50"
            cy="50"
            r="48"
            fill="none"
            stroke="#F5B800"
            strokeWidth="1"
            opacity="0.6"
          />

          {/* Prime meridian */}
          <ellipse
            cx="50"
            cy="50"
            rx="4"
            ry="48"
            fill="none"
            stroke="#F5B800"
            strokeWidth="0.5"
            opacity="0.6"
          />
        </svg>

        {/* Orbiting dot — satellite trace */}
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
