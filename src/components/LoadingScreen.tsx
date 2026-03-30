'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

export default function LoadingScreen() {
  const [visible, setVisible] = useState(true)
  const [phase, setPhase] = useState<'globe' | 'text' | 'done'>('globe')
  const letters = 'LENGA MAPS'.split('')

  useEffect(() => {
    // Check if already shown this session
    const shown = sessionStorage.getItem('lenga_loading_shown')
    if (shown) {
      setVisible(false)
      return
    }

    const t1 = setTimeout(() => setPhase('text'), 800)
    const t2 = setTimeout(() => setPhase('done'), 2800)
    const t3 = setTimeout(() => {
      setVisible(false)
      sessionStorage.setItem('lenga_loading_shown', 'true')
    }, 3200)

    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
      clearTimeout(t3)
    }
  }, [])

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.05 }}
          transition={{ duration: 0.4 }}
          className="fixed inset-0 z-[9999] bg-navy flex flex-col items-center justify-center"
        >
          {/* Globe */}
          <motion.div
            initial={{ scale: 0, rotate: -180, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 120, damping: 15, duration: 0.8 }}
            className="mb-8"
          >
            <svg viewBox="0 0 100 100" className="w-24 h-24 animate-spin-slow">
              <circle cx="50" cy="50" r="46" fill="#1E5F8E" />
              <ellipse cx="50" cy="50" rx="20" ry="46" fill="none" stroke="#F5B800" strokeWidth="2" />
              <line x1="4" y1="50" x2="96" y2="50" stroke="#F5B800" strokeWidth="2" />
              <line x1="10" y1="30" x2="90" y2="30" stroke="#F5B800" strokeWidth="1.2" opacity="0.7" />
              <line x1="10" y1="70" x2="90" y2="70" stroke="#F5B800" strokeWidth="1.2" opacity="0.7" />
              <circle cx="50" cy="50" r="46" fill="none" stroke="#F5B800" strokeWidth="2" />
              {/* Africa silhouette */}
              <path
                d="M 40 25 L 55 25 L 62 32 L 65 42 L 60 55 L 62 65 L 55 75 L 45 72 L 42 62 L 38 52 L 35 42 L 38 32 Z"
                fill="#F5B800"
                opacity="0.3"
              />
            </svg>
          </motion.div>

          {/* Letters */}
          <div className="flex items-center gap-0.5 h-10">
            {letters.map((letter, i) => (
              <motion.span
                key={i}
                initial={{ opacity: 0, y: 20 }}
                animate={phase !== 'globe' ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
                transition={{ delay: i * 0.07, duration: 0.3 }}
                className={`text-3xl font-bold tracking-widest ${
                  letter === ' ' ? 'w-4' : ''
                } ${i >= 6 ? 'text-accent' : 'text-white'}`}
              >
                {letter}
              </motion.span>
            ))}
          </div>

          <motion.p
            initial={{ opacity: 0 }}
            animate={phase === 'text' || phase === 'done' ? { opacity: 1 } : { opacity: 0 }}
            transition={{ delay: 1.2, duration: 0.5 }}
            className="mt-3 text-gray-400 text-sm tracking-widest uppercase"
          >
            Unmasking the Earth
          </motion.p>

          {/* Progress bar */}
          <motion.div
            className="absolute bottom-0 left-0 h-1 bg-accent"
            initial={{ width: '0%' }}
            animate={{ width: '100%' }}
            transition={{ duration: 3, ease: 'easeInOut' }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  )
}
