'use client'

import Link from 'next/link'
import { Mail, Phone, MapPin } from 'lucide-react'

const LinkedinIcon = () => (
  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
    <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/>
  </svg>
)
const FacebookIcon = () => (
  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
    <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>
  </svg>
)

export default function Footer() {
  return (
    <footer className="bg-navy text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10">
          {/* Brand */}
          <div className="lg:col-span-1">
            <div className="flex items-center gap-2 mb-4">
              <svg viewBox="0 0 40 40" className="w-9 h-9">
                <circle cx="20" cy="20" r="18" fill="#1E5F8E" />
                <ellipse cx="20" cy="20" rx="8" ry="18" fill="none" stroke="#F5B800" strokeWidth="1.5" />
                <line x1="2" y1="20" x2="38" y2="20" stroke="#F5B800" strokeWidth="1.5" />
                <line x1="5" y1="12" x2="35" y2="12" stroke="#F5B800" strokeWidth="1" opacity="0.7" />
                <line x1="5" y1="28" x2="35" y2="28" stroke="#F5B800" strokeWidth="1" opacity="0.7" />
                <circle cx="20" cy="20" r="18" fill="none" stroke="#F5B800" strokeWidth="1.5" />
              </svg>
              <span className="font-bold text-lg">LENGA <span className="text-accent">MAPS</span></span>
            </div>
            <p className="text-gray-400 text-sm leading-relaxed mb-4">
              Unmasking the Earth, one map at a time. Africa's most centralized environmental GIS data platform.
            </p>
            <div className="flex gap-3">
              <a
                href="https://linkedin.com"
                target="_blank"
                rel="noopener noreferrer"
                className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center hover:bg-primary transition-colors"
                aria-label="LinkedIn"
              >
                <LinkedinIcon />
              </a>
              <a
                href="https://facebook.com"
                target="_blank"
                rel="noopener noreferrer"
                className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center hover:bg-primary transition-colors"
                aria-label="Facebook"
              >
                <FacebookIcon />
              </a>
            </div>
          </div>

          {/* Navigation */}
          <div>
            <h3 className="font-semibold text-white mb-4">Platform</h3>
            <ul className="space-y-2">
              {[
                { href: '/', label: 'Home' },
                { href: '/about-us', label: 'About Us' },
                { href: '/services', label: 'Services' },
                { href: '/pricing', label: 'Download GIS Data' },
                { href: '/contact-us', label: 'Contact Us' },
              ].map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-gray-400 hover:text-accent text-sm transition-colors">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Datasets */}
          <div>
            <h3 className="font-semibold text-white mb-4">Data Categories</h3>
            <ul className="space-y-2 text-sm text-gray-400">
              <li className="hover:text-accent cursor-pointer transition-colors">Administrative Boundaries</li>
              <li className="hover:text-accent cursor-pointer transition-colors">Elevation & Terrain</li>
              <li className="hover:text-accent cursor-pointer transition-colors">Rivers & Hydrology</li>
              <li className="hover:text-accent cursor-pointer transition-colors">Land Use / Land Cover</li>
              <li className="hover:text-accent cursor-pointer transition-colors">Geology & Mining</li>
              <li className="hover:text-accent cursor-pointer transition-colors">Climate & Rainfall</li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h3 className="font-semibold text-white mb-4">Contact</h3>
            <ul className="space-y-3">
              <li>
                <a href="mailto:lengamaps@gmail.com" className="flex items-center gap-2 text-gray-400 hover:text-accent text-sm transition-colors">
                  <Mail size={14} />
                  lengamaps@gmail.com
                </a>
              </li>
              <li>
                <a href="tel:+260779187025" className="flex items-center gap-2 text-gray-400 hover:text-accent text-sm transition-colors">
                  <Phone size={14} />
                  +260 779 187 025
                </a>
              </li>
              <li>
                <span className="flex items-start gap-2 text-gray-400 text-sm">
                  <MapPin size={14} className="mt-0.5 shrink-0" />
                  Lusaka, Zambia
                </span>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-white/10 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-gray-500 text-sm">
            © {new Date().getFullYear()} Lenga Maps. All rights reserved.
          </p>
          <div className="flex gap-6 text-sm text-gray-500">
            <Link href="/privacy" className="hover:text-accent transition-colors">Privacy Policy</Link>
            <Link href="/terms" className="hover:text-accent transition-colors">Terms of Service</Link>
          </div>
        </div>
      </div>
    </footer>
  )
}
