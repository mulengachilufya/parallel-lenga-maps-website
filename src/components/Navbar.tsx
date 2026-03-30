'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { Menu, X, Map } from 'lucide-react'

const navLinks = [
  { href: '/', label: 'Home' },
  { href: '/about-us', label: 'About Us' },
  { href: '/services', label: 'Services' },
  { href: '/pricing', label: 'Download GIS Data' },
  { href: '/contact-us', label: 'Contact Us' },
]

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const pathname = usePathname()

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const isHome = pathname === '/'

  return (
    <motion.nav
      initial={{ y: -80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5 }}
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled || !isHome
          ? 'bg-white/95 backdrop-blur-md shadow-lg border-b border-gray-100'
          : 'bg-transparent'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 lg:h-20">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 group">
            <div className="relative w-9 h-9">
              <svg viewBox="0 0 40 40" className="w-full h-full">
                <circle cx="20" cy="20" r="18" fill="#1E5F8E" />
                <ellipse cx="20" cy="20" rx="8" ry="18" fill="none" stroke="#F5B800" strokeWidth="1.5" />
                <line x1="2" y1="20" x2="38" y2="20" stroke="#F5B800" strokeWidth="1.5" />
                <line x1="5" y1="12" x2="35" y2="12" stroke="#F5B800" strokeWidth="1" opacity="0.7" />
                <line x1="5" y1="28" x2="35" y2="28" stroke="#F5B800" strokeWidth="1" opacity="0.7" />
                <circle cx="20" cy="20" r="18" fill="none" stroke="#F5B800" strokeWidth="1.5" />
              </svg>
            </div>
            <div>
              <span className={`font-bold text-lg tracking-wide transition-colors ${
                scrolled || !isHome ? 'text-navy' : 'text-white'
              }`}>
                LENGA <span className="text-accent">MAPS</span>
              </span>
            </div>
          </Link>

          {/* Desktop Links */}
          <div className="hidden lg:flex items-center gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                  pathname === link.href
                    ? 'bg-primary text-white'
                    : scrolled || !isHome
                    ? 'text-navy hover:text-primary hover:bg-primary/10'
                    : 'text-white/90 hover:text-white hover:bg-white/10'
                }`}
              >
                {link.label}
              </Link>
            ))}
          </div>

          {/* CTA */}
          <div className="hidden lg:flex items-center gap-3">
            <Link
              href="/login"
              className={`text-sm font-medium px-4 py-2 rounded-lg transition-all ${
                scrolled || !isHome
                  ? 'text-navy hover:text-primary'
                  : 'text-white hover:text-accent'
              }`}
            >
              Login
            </Link>
            <Link
              href="/signup"
              className="bg-accent text-navy text-sm font-semibold px-5 py-2.5 rounded-lg hover:bg-yellow-500 transition-all shadow-sm hover:shadow-md"
            >
              Get Started
            </Link>
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className={`lg:hidden p-2 rounded-lg transition-colors ${
              scrolled || !isHome ? 'text-navy' : 'text-white'
            }`}
          >
            {menuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="lg:hidden bg-white border-t border-gray-100 shadow-lg"
          >
            <div className="px-4 py-4 space-y-1">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMenuOpen(false)}
                  className={`block px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                    pathname === link.href
                      ? 'bg-primary text-white'
                      : 'text-navy hover:bg-primary/10 hover:text-primary'
                  }`}
                >
                  {link.label}
                </Link>
              ))}
              <div className="pt-2 flex gap-2">
                <Link href="/login" className="flex-1 text-center py-2.5 border border-primary text-primary rounded-lg text-sm font-medium" onClick={() => setMenuOpen(false)}>
                  Login
                </Link>
                <Link href="/signup" className="flex-1 text-center py-2.5 bg-accent text-navy rounded-lg text-sm font-semibold" onClick={() => setMenuOpen(false)}>
                  Get Started
                </Link>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.nav>
  )
}
